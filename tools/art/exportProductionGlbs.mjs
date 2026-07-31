import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import * as THREE from "three";
import { GLTFExporter } from "three/examples/jsm/exporters/GLTFExporter.js";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { createGlowfinRigGeometry } from "../../src/render/glowfinGeometry.ts";
import {
  createProductionAnemone,
  createProductionBranchCoral,
  createProductionCollapsedArch,
  createProductionFanCoral,
  createProductionGateCanopyGeometry,
  createProductionJelly,
  createProductionKelp,
  createProductionMinnow,
  createProductionRay,
  createProductionSkyline,
  createProductionSpire,
  createProductionSpirit,
  createProductionTower,
  createProductionWallGeometry
} from "../../src/render/productionGeometry.ts";

/**
 * Three's GLTFExporter uses the browser FileReader API internally. Node has a
 * standards-compatible Blob but no FileReader, so this small adapter keeps the
 * exporter deterministic in CI without adding another asset dependency.
 */
class NodeFileReader {
  result = null;
  onloadend = null;
  onerror = null;

  readAsArrayBuffer(blob) {
    blob.arrayBuffer().then(
      (value) => {
        this.result = value;
        this.onloadend?.({ target: this });
      },
      (error) => this.onerror?.(error)
    );
  }

  readAsDataURL(blob) {
    blob.arrayBuffer().then(
      (value) => {
        this.result =
          `data:${blob.type};base64,${Buffer.from(value).toString("base64")}`;
        this.onloadend?.({ target: this });
      },
      (error) => this.onerror?.(error)
    );
  }
}

globalThis.FileReader = NodeFileReader;
globalThis.ProgressEvent ??= class ProgressEvent {
  constructor(type, initial = {}) {
    this.type = type;
    Object.assign(this, initial);
  }
};

const outputDirectory = resolve(
  process.argv[2] ?? "build/production-glbs"
);
const tuning = JSON.parse(await readFile(
  resolve("config/tuning.json"),
  "utf8"
));
const exporter = new GLTFExporter();
const manifest = [];

const stoneMaterial = new THREE.MeshStandardMaterial({
  name: "Moonstone_PBR",
  color: 0xffffff,
  vertexColors: true,
  roughness: 0.78,
  metalness: 0.02
});
const livingMaterial = new THREE.MeshStandardMaterial({
  name: "LivingReef_PBR",
  color: 0xffffff,
  vertexColors: true,
  roughness: 0.62,
  metalness: 0
});
const glowfinMaterial = new THREE.MeshStandardMaterial({
  name: "GlowfinSeaGlass_PBR",
  color: 0x1598c3,
  vertexColors: true,
  roughness: 0.38,
  metalness: 0,
  emissive: 0x062b42,
  emissiveIntensity: 0.34
});
const eyeMaterial = new THREE.MeshStandardMaterial({
  name: "GlowfinEyes_PBR",
  color: 0x09203e,
  roughness: 0.22,
  metalness: 0,
  emissive: 0x388bc4,
  emissiveIntensity: 0.7
});

function productionMesh(geometry, name, material, metadata = {}) {
  const mesh = new THREE.Mesh(geometry, material);
  mesh.name = name;
  mesh.userData = metadata;
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  return mesh;
}

async function writeGlb(fileName, root, animations = []) {
  const scene = new THREE.Scene();
  scene.name = `${root.name}_Scene`;
  scene.add(root);
  const result = await exporter.parseAsync(scene, {
    animations,
    binary: true,
    onlyVisible: true,
    trs: true,
    maxTextureSize: 512
  });
  if (!(result instanceof ArrayBuffer)) {
    throw new Error(`${fileName} did not export as a binary glTF.`);
  }
  const bytes = Buffer.from(result);
  const path = resolve(outputDirectory, fileName);
  await writeFile(path, bytes);
  const validation = await new GLTFLoader().parseAsync(result.slice(0), "");
  const exportedAnimations = validation.animations.map((animation) => animation.name);
  const expectedAnimations = animations.map((animation) => animation.name);
  if (exportedAnimations.join("\n") !== expectedAnimations.join("\n")) {
    throw new Error(
      `${fileName} animation mismatch: ` +
      `${exportedAnimations.join(", ")} != ${expectedAnimations.join(", ")}`
    );
  }
  let meshes = 0;
  let bones = 0;
  validation.scene.traverse((node) => {
    if (node.isMesh) meshes += 1;
    if (node.isBone) bones += 1;
  });
  manifest.push({
    file: fileName,
    bytes: bytes.byteLength,
    sha256: createHash("sha256").update(bytes).digest("hex"),
    root: root.name,
    meshes,
    bones,
    animations: exportedAnimations
  });
}

function glowfinClips() {
  const quaternionValues = (axis, angles) => angles.flatMap((angle) => {
    const quaternion = new THREE.Quaternion().setFromAxisAngle(axis, angle);
    return [quaternion.x, quaternion.y, quaternion.z, quaternion.w];
  });
  const zAxis = new THREE.Vector3(0, 0, 1);
  const yAxis = new THREE.Vector3(0, 1, 0);
  const propulsionTimes = [0, 0.2, 0.4, 0.6, 0.8];
  return [
    new THREE.AnimationClip("breathe", 2, [
      new THREE.VectorKeyframeTrack(
        "GlowfinRoot.scale",
        [0, 1, 2],
        [1, 1, 1, 0.96, 1.05, 1, 1, 1, 1]
      )
    ]),
    new THREE.AnimationClip("propulsion", 0.8, [
      new THREE.QuaternionKeyframeTrack(
        "FinLeft.quaternion",
        propulsionTimes,
        quaternionValues(zAxis, [0, 0.34, 0, -0.34, 0])
      ),
      new THREE.QuaternionKeyframeTrack(
        "FinRight.quaternion",
        propulsionTimes,
        quaternionValues(zAxis, [0, -0.34, 0, 0.34, 0])
      ),
      new THREE.QuaternionKeyframeTrack(
        "Tail.quaternion",
        propulsionTimes,
        quaternionValues(yAxis, [0, 0.3, 0, -0.3, 0])
      )
    ]),
    new THREE.AnimationClip("bank", 0.8, [
      new THREE.QuaternionKeyframeTrack(
        "Glowfin.quaternion",
        [0, 0.4, 0.8],
        quaternionValues(zAxis, [-0.35, 0.35, -0.35])
      )
    ]),
    new THREE.AnimationClip("collisionSquash", 0.34, [
      new THREE.VectorKeyframeTrack(
        "GlowfinRoot.scale",
        [0, 0.12, 0.34],
        [1, 1, 1, 1.14, 0.72, 0.82, 1, 1, 1]
      )
    ]),
    new THREE.AnimationClip("recovery", 0.72, [
      new THREE.VectorKeyframeTrack(
        "GlowfinRoot.scale",
        [0, 0.22, 0.72],
        [1, 1, 1, 1.08, 1.08, 1.04, 1, 1, 1]
      )
    ])
  ];
}

function createGlowfinAsset() {
  const rig = createGlowfinRigGeometry(tuning, 0);
  const group = new THREE.Group();
  group.name = "Glowfin";

  const root = new THREE.Bone();
  root.name = "GlowfinRoot";
  const finLeft = new THREE.Bone();
  finLeft.name = "FinLeft";
  finLeft.position.copy(rig.pivots.finLeft);
  const finRight = new THREE.Bone();
  finRight.name = "FinRight";
  finRight.position.copy(rig.pivots.finRight);
  const tail = new THREE.Bone();
  tail.name = "Tail";
  tail.position.copy(rig.pivots.tail);
  root.add(finLeft, finRight, tail);

  const gills = rig.pivots.gills.map((pivot, index) => {
    const bone = new THREE.Bone();
    bone.name = `Gill${index + 1}`;
    bone.position.copy(pivot);
    root.add(bone);
    return bone;
  });

  const body = new THREE.SkinnedMesh(rig.body, glowfinMaterial);
  body.name = "GlowfinBody_LOD0";
  body.add(root);
  body.bind(new THREE.Skeleton([
    root,
    finLeft,
    finRight,
    tail,
    ...gills
  ]));
  body.userData = {
    lod: 0,
    collidable: false,
    animationDriver: "simulation"
  };
  const eyes = productionMesh(
    rig.eyes,
    "GlowfinEyes_LOD0",
    eyeMaterial,
    { lod: 0, diegeticMomentumIndicator: true }
  );
  group.add(body, eyes);
  return group;
}

function createGateAsset() {
  const root = new THREE.Group();
  root.name = "MoonGate";
  for (const lod of [0, 1, 2]) {
    for (const variant of [0, 1, 2]) {
      root.add(productionMesh(
        createProductionGateCanopyGeometry(lod),
        `MoonGate_Canopy_Variant${variant}_LOD${lod}`,
        stoneMaterial,
        {
          lod,
          variant,
          collidable: false,
          role: "overhead-broken-masonry"
        }
      ));
      for (const gapDirection of [1, -1]) {
        const side = gapDirection === 1 ? "Left" : "Right";
        root.add(productionMesh(
          createProductionWallGeometry(lod, gapDirection, variant),
          `MoonGate_${side}_Variant${variant}_LOD${lod}`,
          stoneMaterial,
          {
            lod,
            variant,
            gapDirection,
            colliderPlaneLocal: gapDirection * 0.5,
            playableEdgeMustRemainStraight: true
          }
        ));
      }
    }
  }
  return root;
}

function createKit(name, families, material) {
  const root = new THREE.Group();
  root.name = name;
  for (const family of families) {
    for (const lod of family.lods) {
      root.add(productionMesh(
        family.create(lod),
        `${family.name}_LOD${lod}`,
        material,
        { lod, collidable: false, family: family.name }
      ));
    }
  }
  return root;
}

await mkdir(outputDirectory, { recursive: true });
await writeGlb("glowfin-v1.glb", createGlowfinAsset(), glowfinClips());
await writeGlb("moon-gate-v1.glb", createGateAsset());
await writeGlb("ruin-kit-v1.glb", createKit("RuinKit", [
  { name: "BrokenTower", create: createProductionTower, lods: [0, 1, 2] },
  { name: "CollapsedArch", create: createProductionCollapsedArch, lods: [0, 1, 2] },
  { name: "ForkedSpire", create: createProductionSpire, lods: [0, 1, 2] }
], stoneMaterial));
await writeGlb("reef-kit-v1.glb", createKit("ReefKit", [
  { name: "Staghorn", create: createProductionBranchCoral, lods: [0, 1, 2] },
  { name: "SeaFan", create: createProductionFanCoral, lods: [0, 1, 2] },
  { name: "Anemone", create: createProductionAnemone, lods: [0, 1, 2] },
  { name: "Kelp", create: createProductionKelp, lods: [0, 1] }
], livingMaterial));
await writeGlb("moon-life-v1.glb", createKit("MoonLife", [
  { name: "MoonMinnow", create: createProductionMinnow, lods: [0] },
  { name: "LanternJelly", create: createProductionJelly, lods: [0] },
  { name: "RibbonRay", create: createProductionRay, lods: [0] },
  { name: "GardenSpirit", create: createProductionSpirit, lods: [0] }
], livingMaterial));
await writeGlb("drowned-skyline-v1.glb", createKit("DrownedSkyline", [
  { name: "SkylineCluster", create: createProductionSkyline, lods: [0] }
], stoneMaterial));

await writeFile(
  resolve(outputDirectory, "manifest.json"),
  `${JSON.stringify({
    version: 1,
    source: "validated Phase 3B runtime production-transition meshes",
    status: "handoff baseline; requires sculpt/material authoring before runtime sign-off",
    assets: manifest
  }, null, 2)}\n`,
  "utf8"
);

console.log(`Wrote ${manifest.length} GLBs to ${outputDirectory}`);
