import * as THREE from "three";
import { GLTFLoader, type GLTF } from "three/examples/jsm/loaders/GLTFLoader.js";
import { MeshoptDecoder } from "three/examples/jsm/libs/meshopt_decoder.module.js";
import {
  expectedRuntimeGateNodes,
  expectedRuntimeGlowfinNodes,
  expectedRuntimeReefNodes,
  RUNTIME_PRODUCTION_ASSETS,
  RUNTIME_SHADER_ATTRIBUTE_ALIASES,
  runtimeGateCanopyName,
  runtimeGateWallName,
  runtimeReefName,
  type RuntimeArtLod,
  type RuntimeGateVariant,
  type RuntimeReefFamily
} from "../art/runtimeAssetContract";

export interface RuntimeGateGeometrySet {
  walls: Record<
    RuntimeArtLod,
    Record<RuntimeGateVariant, {
      left: THREE.BufferGeometry;
      right: THREE.BufferGeometry;
    }>
  >;
  canopies: Record<
    RuntimeArtLod,
    Record<RuntimeGateVariant, THREE.BufferGeometry>
  >;
}

export type RuntimeReefGeometrySet = Record<
  RuntimeReefFamily,
  THREE.BufferGeometry
>;

export interface RuntimeGlowfinGeometrySet {
  body: THREE.BufferGeometry;
  eyes: THREE.BufferGeometry;
  clips: string[];
  bones: number;
}

export interface RuntimeProductionGeometrySet {
  build: string;
  glowfin: RuntimeGlowfinGeometrySet;
  gates: RuntimeGateGeometrySet;
  reef: RuntimeReefGeometrySet;
}

function meshMap(gltf: GLTF, expectedNames: readonly string[]): Map<string, THREE.Mesh> {
  const meshes = new Map<string, THREE.Mesh>();
  gltf.scene.traverse((node) => {
    if (node instanceof THREE.Mesh) meshes.set(node.name, node);
  });
  const expected = new Set(expectedNames);
  if (meshes.size !== expected.size) {
    throw new Error(
      `Production GLB contains ${meshes.size} meshes; expected ${expected.size}.`
    );
  }
  for (const name of expected) {
    if (!meshes.has(name)) throw new Error(`Production GLB is missing ${name}.`);
  }
  return meshes;
}

function runtimeGeometry(
  meshes: Map<string, THREE.Mesh>,
  name: string
): THREE.BufferGeometry {
  const mesh = meshes.get(name);
  if (!mesh) throw new Error(`Production GLB is missing ${name}.`);
  // The packer intentionally deduplicates identical accessors. GLTFLoader may
  // therefore share one BufferGeometry across differently transformed nodes;
  // clone before baking transforms or renaming shader attributes.
  const geometry = mesh.geometry.clone();
  // Meshopt quantization may store a decode scale/offset on the glTF node.
  // InstancedMesh consumes geometry directly, so bake that node transform back
  // into the authored local coordinates before discarding the import scene.
  mesh.updateWorldMatrix(true, false);
  geometry.applyMatrix4(mesh.matrixWorld);
  for (const [source, target] of Object.entries(
    RUNTIME_SHADER_ATTRIBUTE_ALIASES
  )) {
    const attribute = geometry.getAttribute(source);
    if (!attribute) throw new Error(`${name} is missing shader attribute ${source}.`);
    geometry.setAttribute(target, attribute);
    geometry.deleteAttribute(source);
  }
  for (const attribute of [
    "position",
    "normal",
    "color",
    "glowWeight",
    "swayWeight",
    "materialRole"
  ]) {
    if (!geometry.hasAttribute(attribute)) {
      throw new Error(`${name} is missing runtime attribute ${attribute}.`);
    }
  }
  geometry.computeBoundingBox();
  geometry.computeBoundingSphere();
  geometry.userData = {
    ...geometry.userData,
    runtimeProductionAsset: RUNTIME_PRODUCTION_ASSETS.build,
    runtimeSourceNode: name
  };
  return geometry;
}

function validatePlayablePlane(
  geometry: THREE.BufferGeometry,
  side: "left" | "right",
  name: string
): void {
  const bounds = geometry.boundingBox;
  if (!bounds) throw new Error(`${name} has no bounding box.`);
  const plane = side === "left" ? bounds.max.x : bounds.min.x;
  const expected = side === "left" ? 0.5 : -0.5;
  if (Math.abs(plane - expected) > 0.05) {
    throw new Error(
      `${name} moved its playable plane to ${plane.toFixed(4)}; ` +
      `expected ${expected.toFixed(1)} ± 0.05.`
    );
  }
}

function extractGlowfinGeometry(gltf: GLTF): RuntimeGlowfinGeometrySet {
  const meshes = meshMap(gltf, expectedRuntimeGlowfinNodes());
  const bodyMesh = meshes.get("GlowfinBody_LOD0");
  const eyeMesh = meshes.get("GlowfinEyes_LOD0");
  if (!(bodyMesh instanceof THREE.SkinnedMesh)) {
    throw new Error("GlowfinBody_LOD0 must remain a skinned mesh.");
  }
  if (!eyeMesh) throw new Error("GlowfinEyes_LOD0 is missing.");

  bodyMesh.updateWorldMatrix(true, false);
  eyeMesh.updateWorldMatrix(true, false);
  if (!bodyMesh.matrixWorld.equals(new THREE.Matrix4())) {
    throw new Error(
      "GlowfinBody_LOD0 has a baked node transform that would invalidate skinning."
    );
  }
  const body = bodyMesh.geometry.clone();
  const eyes = eyeMesh.geometry.clone();
  // Meshopt quantization normalizes the unskinned eye accessor and stores its
  // decode scale/offset on the node. Bake that transform before discarding the
  // imported scene; otherwise the eyes expand to unit spheres at the origin.
  eyes.applyMatrix4(eyeMesh.matrixWorld);
  for (const attribute of [
    "position",
    "normal",
    "uv",
    "color",
    "skinIndex",
    "skinWeight"
  ]) {
    if (!body.hasAttribute(attribute)) {
      throw new Error(`GlowfinBody_LOD0 is missing ${attribute}.`);
    }
  }
  for (const attribute of ["position", "normal", "uv"]) {
    if (!eyes.hasAttribute(attribute)) {
      throw new Error(`GlowfinEyes_LOD0 is missing ${attribute}.`);
    }
  }

  const clips = gltf.animations.map((clip) => clip.name);
  for (const required of RUNTIME_PRODUCTION_ASSETS.glowfinClips) {
    if (!clips.includes(required)) {
      throw new Error(`Glowfin runtime GLB is missing clip ${required}.`);
    }
  }
  let bones = 0;
  gltf.scene.traverse((node) => {
    if (node instanceof THREE.Bone) bones += 1;
  });
  if (bones !== 10) {
    throw new Error(`Glowfin runtime GLB contains ${bones} bones; expected 10.`);
  }

  for (const [geometry, node] of [
    [body, "GlowfinBody_LOD0"],
    [eyes, "GlowfinEyes_LOD0"]
  ] as const) {
    geometry.computeBoundingBox();
    geometry.computeBoundingSphere();
    geometry.userData = {
      ...geometry.userData,
      runtimeProductionAsset: RUNTIME_PRODUCTION_ASSETS.build,
      runtimeSourceNode: node
    };
  }
  releaseImportedResources(gltf);
  return { body, eyes, clips, bones };
}

function releaseImportedResources(gltf: GLTF): void {
  const materials = new Set<THREE.Material>();
  const geometries = new Set<THREE.BufferGeometry>();
  gltf.scene.traverse((node) => {
    if (!(node instanceof THREE.Mesh)) return;
    geometries.add(node.geometry);
    const nodeMaterials = Array.isArray(node.material)
      ? node.material
      : [node.material];
    for (const material of nodeMaterials) materials.add(material);
  });
  for (const material of materials) material.dispose();
  for (const geometry of geometries) geometry.dispose();
}

function extractGateGeometry(gltf: GLTF): RuntimeGateGeometrySet {
  const meshes = meshMap(gltf, expectedRuntimeGateNodes());
  const walls = {} as RuntimeGateGeometrySet["walls"];
  const canopies = {} as RuntimeGateGeometrySet["canopies"];
  for (const lod of RUNTIME_PRODUCTION_ASSETS.lods) {
    const lodWalls = {} as RuntimeGateGeometrySet["walls"][RuntimeArtLod];
    const lodCanopies = {} as RuntimeGateGeometrySet["canopies"][RuntimeArtLod];
    for (const variant of RUNTIME_PRODUCTION_ASSETS.gateVariants) {
      const leftName = runtimeGateWallName("Left", variant, lod);
      const rightName = runtimeGateWallName("Right", variant, lod);
      const left = runtimeGeometry(meshes, leftName);
      const right = runtimeGeometry(meshes, rightName);
      validatePlayablePlane(left, "left", leftName);
      validatePlayablePlane(right, "right", rightName);
      lodWalls[variant] = { left, right };
      lodCanopies[variant] = runtimeGeometry(
        meshes,
        runtimeGateCanopyName(variant, lod)
      );
    }
    walls[lod] = lodWalls;
    canopies[lod] = lodCanopies;
  }
  releaseImportedResources(gltf);
  return { walls, canopies };
}

function extractReefGeometry(gltf: GLTF): RuntimeReefGeometrySet {
  const meshes = meshMap(gltf, expectedRuntimeReefNodes());
  const reef = {} as RuntimeReefGeometrySet;
  for (const family of RUNTIME_PRODUCTION_ASSETS.reefFamilies) {
    const name = runtimeReefName(family, 1);
    reef[family] = runtimeGeometry(meshes, name);
  }
  releaseImportedResources(gltf);
  return reef;
}

export async function loadRuntimeProductionGeometry(): Promise<
  RuntimeProductionGeometrySet
> {
  const loader = new GLTFLoader();
  loader.setMeshoptDecoder(MeshoptDecoder);
  const [glowfinGltf, gateGltf, reefGltf] = await Promise.all([
    loader.loadAsync(RUNTIME_PRODUCTION_ASSETS.glowfinUrl),
    loader.loadAsync(RUNTIME_PRODUCTION_ASSETS.gateUrl),
    loader.loadAsync(RUNTIME_PRODUCTION_ASSETS.reefUrl)
  ]);
  return {
    build: RUNTIME_PRODUCTION_ASSETS.build,
    glowfin: extractGlowfinGeometry(glowfinGltf),
    gates: extractGateGeometry(gateGltf),
    reef: extractReefGeometry(reefGltf)
  };
}
