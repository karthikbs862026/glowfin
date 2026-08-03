import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdir, readFile, rm, stat, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { promisify } from "node:util";
import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { MeshoptDecoder } from "three/examples/jsm/libs/meshopt_decoder.module.js";
import {
  expectedRuntimeGateNodes,
  expectedRuntimeGlowfinNodes,
  expectedRuntimeReefNodes,
  RUNTIME_PRODUCTION_ASSETS,
  RUNTIME_SHADER_ATTRIBUTE_ALIASES
} from "../../src/art/runtimeAssetContract.ts";

const run = promisify(execFile);
const inputDirectory = resolve(process.argv[2] ?? "build/production-glbs");
const outputDirectory = resolve(process.argv[3] ?? "build/runtime-glbs");
const cli = resolve("node_modules/.bin/gltf-transform");

const assets = [
  {
    file: "glowfin-v2.glb",
    expected: expectedRuntimeGlowfinNodes(),
    kind: "glowfin"
  },
  {
    file: "moon-gate-v1.glb",
    expected: expectedRuntimeGateNodes(),
    kind: "gate"
  },
  {
    file: "reef-kit-v1.glb",
    expected: expectedRuntimeReefNodes(),
    kind: "reef"
  }
];

function arrayBuffer(bytes) {
  return bytes.buffer.slice(
    bytes.byteOffset,
    bytes.byteOffset + bytes.byteLength
  );
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

async function validatePackedAsset(path, descriptor) {
  const bytes = await readFile(path);
  const loader = new GLTFLoader();
  loader.setMeshoptDecoder(MeshoptDecoder);
  const gltf = await loader.parseAsync(arrayBuffer(bytes), "");
  const meshes = new Map();
  gltf.scene.traverse((node) => {
    if (node instanceof THREE.Mesh) meshes.set(node.name, node);
  });

  const expected = new Set(descriptor.expected);
  assert(
    meshes.size === expected.size,
    `${descriptor.file} contains ${meshes.size} meshes; expected ${expected.size}.`
  );
  for (const name of expected) {
    const mesh = meshes.get(name);
    assert(mesh, `${descriptor.file} is missing required node ${name}.`);
    const geometry = mesh.geometry;
    const requiredAttributes = descriptor.kind === "glowfin"
      ? name === "GlowfinBody_LOD0"
        ? ["position", "normal", "uv", "color", "skinIndex", "skinWeight"]
        : ["position", "normal", "uv"]
      : [
          "position",
          "normal",
          "color",
          ...Object.keys(RUNTIME_SHADER_ATTRIBUTE_ALIASES)
        ];
    for (const attribute of requiredAttributes) {
      assert(
        geometry.hasAttribute(attribute),
        `${descriptor.file}:${name} is missing ${attribute}.`
      );
    }
    geometry.computeBoundingBox();
    assert(geometry.boundingBox, `${descriptor.file}:${name} has no bounds.`);
    mesh.updateWorldMatrix(true, false);
    const runtimeBounds = geometry.boundingBox.clone().applyMatrix4(
      mesh.matrixWorld
    );
    if (descriptor.kind === "gate" && name.includes("_Left_")) {
      assert(
        Math.abs(runtimeBounds.max.x - 0.5) <= 0.05,
        `${name} moved its left playable plane outside the 0.05 tolerance.`
      );
    }
    if (descriptor.kind === "gate" && name.includes("_Right_")) {
      assert(
        Math.abs(runtimeBounds.min.x + 0.5) <= 0.05,
        `${name} moved its right playable plane outside the 0.05 tolerance.`
      );
    }
  }

  if (descriptor.kind === "glowfin") {
    const glowfinBody = meshes.get("GlowfinBody_LOD0");
    assert(
      glowfinBody?.isSkinnedMesh === true,
      "GlowfinBody_LOD0 must remain skinned after compression."
    );
    const appendages = glowfinBody?.userData?.appendageComponents;
    assert(
      appendages?.finLeft === 1 &&
        appendages?.finRight === 1 &&
        appendages?.tail === 1,
      "GlowfinBody_LOD0 must contain exactly one visible fin per side and one tail."
    );
    const clips = gltf.animations.map((clip) => clip.name);
    for (const required of RUNTIME_PRODUCTION_ASSETS.glowfinClips) {
      assert(clips.includes(required), `glowfin-v2.glb is missing clip ${required}.`);
    }
    let bones = 0;
    gltf.scene.traverse((node) => {
      if (node.isBone) bones += 1;
    });
    assert(bones === 10, `glowfin-v2.glb contains ${bones} bones; expected 10.`);
  }

  return {
    file: descriptor.file,
    bytes: bytes.byteLength,
    sha256: createHash("sha256").update(bytes).digest("hex"),
    meshes: meshes.size,
    compression: "EXT_meshopt_compression"
  };
}

await mkdir(outputDirectory, { recursive: true });
const manifest = [];
for (const descriptor of assets) {
  const input = resolve(inputDirectory, descriptor.file);
  const welded = resolve(outputDirectory, `.${descriptor.file}.weld.glb`);
  const pruned = resolve(outputDirectory, `.${descriptor.file}.pruned.glb`);
  const output = resolve(outputDirectory, descriptor.file);
  await run(cli, ["weld", input, welded], { maxBuffer: 16 * 1024 * 1024 });
  await run(cli, [
    "prune",
    welded,
    pruned,
    "--keep-attributes",
    descriptor.kind === "glowfin" ? "true" : "false"
  ], { maxBuffer: 16 * 1024 * 1024 });
  await run(cli, ["meshopt", pruned, output, "--level", "high"], {
    maxBuffer: 16 * 1024 * 1024
  });
  await rm(welded, { force: true });
  await rm(pruned, { force: true });
  manifest.push(await validatePackedAsset(output, descriptor));
}

const totalBytes = manifest.reduce((sum, asset) => sum + asset.bytes, 0);
assert(
  totalBytes <= RUNTIME_PRODUCTION_ASSETS.maxPackedBytes,
  `Packed runtime GLBs use ${totalBytes} bytes; ` +
    `budget is ${RUNTIME_PRODUCTION_ASSETS.maxPackedBytes}.`
);
await writeFile(
  resolve(outputDirectory, "manifest.json"),
  `${JSON.stringify({
    version: 2,
    build: RUNTIME_PRODUCTION_ASSETS.build,
    generatedFrom: "build/production-glbs",
    totalBytes,
    assets: manifest
  }, null, 2)}\n`,
  "utf8"
);

const outputStats = await Promise.all(
  assets.map(({ file }) => stat(resolve(outputDirectory, file)))
);
console.log(
  `Packed ${assets.length} runtime GLBs (${outputStats.reduce(
    (sum, item) => sum + item.size,
    0
  )} bytes) to ${outputDirectory}`
);
