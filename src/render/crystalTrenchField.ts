import * as THREE from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import type { TuningConfig } from "../core/config";
import type { RealmId } from "../realms/definition";
import {
  prismPulseState,
  slidingCrystalPlateOpeningAt,
} from "../realms/mechanics";
import type { Gate } from "../sim/course";
import { gateWallSegmentsAt } from "../sim/gateGeometry";
import type { CrystalTrenchRunStatus } from "../sim/run";

const MAX_CLIFFS = 44;
const MAX_CRYSTAL_CLUSTERS = 104;
const MAX_RUIN_FRAGMENTS = 28;
const MAX_GATE_SEGMENTS = 120;
const MAX_PLATE_SEGMENTS = 88;
const MAX_THRESHOLD_ARCHES = 4;
const MAX_TRUE_ROUTES = 28;
const MAX_TRUE_APERTURES = 28;
const MAX_FALSE_ROUTES = 56;
const MAX_MOONBEAMS = 18;
const MAX_FISSURE_POOLS = 48;
const MAX_RUBBLE = 104;
const MAX_MIRROR_CURRENT_ARCS = 48;
const PRISM_DUST_COUNT = 360;
const BAND_SPACING = 18;

export interface CrystalTrenchTextures {
  crystal: THREE.Texture;
  ruinStone: THREE.Texture;
  seabed: THREE.Texture;
}

function hash01(value: number, salt: number): number {
  let hash = Math.imul(value ^ salt, 0x27d4eb2d);
  hash ^= hash >>> 15;
  hash = Math.imul(hash, 0x85ebca6b);
  return ((hash ^ (hash >>> 13)) >>> 0) / 0x1_0000_0000;
}

function triangleCount(geometry: THREE.BufferGeometry): number {
  return geometry.index
    ? geometry.index.count / 3
    : (geometry.getAttribute("position")?.count ?? 0) / 3;
}

function tintGeometry(
  geometry: THREE.BufferGeometry,
  colour: THREE.ColorRepresentation,
): THREE.BufferGeometry {
  const value = new THREE.Color(colour);
  const count = geometry.getAttribute("position").count;
  const colours = new Float32Array(count * 3);
  for (let index = 0; index < count; index += 1) {
    colours[index * 3] = value.r;
    colours[index * 3 + 1] = value.g;
    colours[index * 3 + 2] = value.b;
  }
  geometry.setAttribute("color", new THREE.BufferAttribute(colours, 3));
  return geometry;
}

function roughenGeometry(
  geometry: THREE.BufferGeometry,
  strength: number,
  salt: number,
): THREE.BufferGeometry {
  const positions = geometry.getAttribute("position") as THREE.BufferAttribute;
  for (let index = 0; index < positions.count; index += 1) {
    const x = positions.getX(index);
    const y = positions.getY(index);
    const z = positions.getZ(index);
    const wave = Math.sin(
      x * (4.1 + salt * 0.013) +
      y * (6.7 + salt * 0.009) +
      z * (5.3 + salt * 0.011),
    );
    positions.setXYZ(
      index,
      x + wave * strength * 0.58,
      y + Math.sin(wave * 3.2 + x * 2.7) * strength * 0.34,
      z + Math.cos(wave * 2.6 + y * 2.1) * strength * 0.46,
    );
  }
  positions.needsUpdate = true;
  geometry.computeVertexNormals();
  geometry.computeBoundingBox();
  geometry.computeBoundingSphere();
  return geometry;
}

function mergeOrThrow(geometries: THREE.BufferGeometry[]): THREE.BufferGeometry {
  const normalised = geometries.map((geometry) => (
    geometry.index ? geometry.toNonIndexed() : geometry
  ));
  const merged = mergeGeometries(normalised, false);
  if (!merged) throw new Error("Crystal Trench geometry attributes did not merge.");
  for (const geometry of normalised) geometry.dispose();
  for (const geometry of geometries) {
    if (!normalised.includes(geometry)) geometry.dispose();
  }
  return merged;
}

function prepareInstanced(
  geometry: THREE.BufferGeometry,
  material: THREE.Material,
  count: number,
  name: string,
  obstacle = false,
): THREE.InstancedMesh {
  const mesh = new THREE.InstancedMesh(geometry, material, count);
  mesh.name = name;
  mesh.count = 0;
  mesh.frustumCulled = false;
  mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  mesh.userData["realm"] = "crystal-trench";
  mesh.userData["isObstacle"] = obstacle;
  mesh.userData["nonCollidable"] = !obstacle;
  return mesh;
}

function chippedBlock(
  width: number,
  height: number,
  depth: number,
  colour: THREE.ColorRepresentation,
  salt: number,
): THREE.BufferGeometry {
  const block = new THREE.BoxGeometry(width, height, depth, 2, 2, 1);
  roughenGeometry(block, Math.min(width, height, depth) * 0.07, salt);
  tintGeometry(block, colour);
  return block;
}

function facetedShard(
  radius: number,
  height: number,
  colour: THREE.ColorRepresentation,
  sides = 6,
): THREE.BufferGeometry {
  const shaftHeight = height * 0.73;
  const shaft = new THREE.CylinderGeometry(
    radius * 0.72,
    radius,
    shaftHeight,
    sides,
    1,
    false,
  );
  shaft.translate(0, shaftHeight * 0.5, 0);
  tintGeometry(shaft, colour);
  const point = new THREE.CylinderGeometry(
    radius * 0.035,
    radius * 0.72,
    height - shaftHeight,
    sides,
    1,
    false,
  );
  point.translate(0, shaftHeight + (height - shaftHeight) * 0.5, 0);
  tintGeometry(point, colour);
  return mergeOrThrow([shaft, point]);
}

function createCliffGeometry(): THREE.BufferGeometry {
  const pieces: THREE.BufferGeometry[] = [];
  const placements = [
    { x: -0.28, y: 0.8, z: 0.08, sx: 1.1, sy: 1.5, sz: 0.9, c: 0x9aa8bd },
    { x: 0.36, y: 2.0, z: -0.1, sx: 0.9, sy: 1.7, sz: 0.76, c: 0x8193ad },
    { x: 0.02, y: 3.35, z: 0.18, sx: 0.72, sy: 1.2, sz: 0.66, c: 0xa5b1c2 },
    { x: -0.82, y: 1.9, z: 0.2, sx: 0.78, sy: 0.72, sz: 1.08, c: 0x73859f },
    { x: 0.72, y: 3.0, z: -0.22, sx: 0.68, sy: 0.58, sz: 0.96, c: 0x8999b1 },
  ];
  for (let index = 0; index < placements.length; index += 1) {
    const placement = placements[index]!;
    const rock = new THREE.DodecahedronGeometry(1, 0);
    roughenGeometry(rock, 0.1, 191 + index * 17);
    rock.scale(placement.sx, placement.sy, placement.sz);
    rock.rotateY((index - 2) * 0.31);
    rock.translate(placement.x, placement.y, placement.z);
    tintGeometry(rock, placement.c);
    pieces.push(rock);
  }
  return mergeOrThrow(pieces);
}

function createCrystalForestGeometry(): THREE.BufferGeometry {
  const pieces: THREE.BufferGeometry[] = [];
  const placements = [
    { x: -0.78, y: 0, z: 0.04, r: 0.34, h: 2.8, rx: 0.02, rz: -0.2, c: 0x8ccfff },
    { x: -0.24, y: 0, z: -0.14, r: 0.49, h: 4.85, rx: -0.03, rz: -0.07, c: 0x79efff },
    { x: 0.34, y: 0, z: -0.05, r: 0.54, h: 5.65, rx: 0.02, rz: 0.08, c: 0xa7b8ff },
    { x: 0.92, y: 0, z: 0.16, r: 0.38, h: 3.25, rx: -0.05, rz: 0.22, c: 0xa18cff },
    { x: 0.06, y: 0, z: 0.46, r: 0.3, h: 2.15, rx: 0.12, rz: -0.12, c: 0x6eeaff },
    { x: -0.98, y: 0, z: 0.42, r: 0.25, h: 1.72, rx: -0.12, rz: -0.3, c: 0x889dff },
  ];
  for (const placement of placements) {
    const shard = facetedShard(placement.r, placement.h, placement.c);
    shard.rotateX(placement.rx);
    shard.rotateZ(placement.rz);
    shard.translate(placement.x, placement.y, placement.z);
    pieces.push(shard);
  }
  for (let index = 0; index < 3; index += 1) {
    const base = new THREE.DodecahedronGeometry(0.54 - index * 0.08, 0);
    base.scale(1.35, 0.48, 1.05);
    base.rotateY(index * 1.17);
    base.translate(-0.52 + index * 0.54, 0.18, 0.12 - index * 0.14);
    tintGeometry(base, index === 1 ? 0x6278a8 : 0x526b92);
    pieces.push(base);
  }
  return mergeOrThrow(pieces);
}

function createRuinFragmentGeometry(): THREE.BufferGeometry {
  const pieces: THREE.BufferGeometry[] = [];
  const base = chippedBlock(3.1, 0.5, 1.55, 0x7488a3, 233);
  base.translate(0, 0.25, 0);
  pieces.push(base);
  const column = new THREE.CylinderGeometry(0.42, 0.55, 3.45, 9, 1, false);
  roughenGeometry(column, 0.045, 251);
  column.rotateZ(-0.07);
  column.translate(-0.82, 2.02, 0);
  tintGeometry(column, 0x9aabc0);
  pieces.push(column);
  const capital = chippedBlock(1.2, 0.34, 1.1, 0xa7b5c5, 271);
  capital.rotateZ(-0.12);
  capital.translate(-0.98, 3.64, 0);
  pieces.push(capital);
  const fallen = chippedBlock(2.55, 0.58, 0.82, 0x8193aa, 293);
  fallen.rotateZ(0.38);
  fallen.rotateY(-0.15);
  fallen.translate(0.58, 0.92, 0.12);
  pieces.push(fallen);
  const tablet = chippedBlock(0.9, 1.64, 0.5, 0x6d829f, 311);
  tablet.rotateZ(0.18);
  tablet.translate(1.08, 1.05, -0.22);
  pieces.push(tablet);
  return mergeOrThrow(pieces);
}

function createRuinGateGeometry(): THREE.BufferGeometry {
  const pieces: THREE.BufferGeometry[] = [];
  const stoneColours = [0x8194ad, 0x9aaabf, 0x72869f, 0xa6b4c5];
  for (const side of [-1, 1]) {
    const foot = chippedBlock(1.9, 0.68, 2.25, 0x667c99, 337 + side);
    foot.translate(side * 3.5, 0.34, 0);
    pieces.push(foot);
    for (let tier = 0; tier < 4; tier += 1) {
      const block = chippedBlock(
        1.14 - tier * 0.045,
        1.18,
        1.55 - tier * 0.06,
        stoneColours[tier] ?? 0x8497ae,
        359 + tier * 19 + side,
      );
      block.rotateZ(side * (tier % 2 === 0 ? -0.025 : 0.038));
      block.rotateY(side * (tier - 1.5) * 0.035);
      block.translate(side * (3.28 + (tier % 2) * 0.06), 1.02 + tier * 1.12, 0);
      pieces.push(block);
    }
    const buttress = chippedBlock(1.2, 2.35, 2.05, 0x70839d, 449 + side);
    buttress.rotateZ(side * 0.1);
    buttress.translate(side * 4.23, 1.2, 0.14);
    pieces.push(buttress);
  }
  const radius = 3.35;
  for (let index = 0; index < 15; index += 1) {
    if (index === 2 || index === 12) continue;
    const fraction = index / 14;
    const angle = Math.PI - fraction * Math.PI;
    const voussoir = chippedBlock(
      index === 7 ? 0.9 : 0.76,
      index === 7 ? 1.12 : 0.92,
      1.5,
      index === 7 ? 0xb6c7d7 : stoneColours[index % stoneColours.length]!,
      487 + index * 23,
    );
    voussoir.rotateZ(angle - Math.PI / 2 + (index % 2 === 0 ? -0.025 : 0.018));
    voussoir.translate(
      Math.cos(angle) * radius,
      4.57 + Math.sin(angle) * radius,
      0,
    );
    pieces.push(voussoir);
  }
  const crest = chippedBlock(2.25, 0.5, 1.38, 0x6d82a0, 857);
  crest.rotateZ(-0.08);
  crest.translate(0.82, 8.08, 0.04);
  pieces.push(crest);
  return mergeOrThrow(pieces);
}

function createGateStoneGeometry(): THREE.BufferGeometry {
  const pieces: THREE.BufferGeometry[] = [];
  const base = chippedBlock(1, 0.68, 1.55, 0x6e829e, 881);
  base.translate(0, 0.34, 0);
  pieces.push(base);
  const placements = [
    { x: -0.34, y: 1.12, w: 0.38, h: 1.55, r: -0.04, c: 0x8c9fb4 },
    { x: 0.02, y: 1.22, w: 0.38, h: 1.82, r: 0.025, c: 0x7389a5 },
    { x: 0.36, y: 1.02, w: 0.36, h: 1.38, r: 0.055, c: 0x9aabba },
  ];
  for (let index = 0; index < placements.length; index += 1) {
    const placement = placements[index]!;
    const block = chippedBlock(
      placement.w,
      placement.h,
      1.2 - index * 0.08,
      placement.c,
      907 + index * 29,
    );
    block.rotateZ(placement.r);
    block.translate(placement.x, placement.y, 0);
    pieces.push(block);
  }
  return mergeOrThrow(pieces);
}

function createGateCrystalGeometry(): THREE.BufferGeometry {
  const pieces: THREE.BufferGeometry[] = [];
  const placements = [
    { x: -0.44, z: 0.06, r: 0.17, h: 4.1, rz: -0.08, c: 0x79b9ff },
    { x: -0.21, z: -0.08, r: 0.15, h: 5.3, rz: 0.035, c: 0x6beeff },
    { x: 0.02, z: 0.08, r: 0.18, h: 4.65, rz: -0.025, c: 0x9c8dff },
    { x: 0.25, z: -0.05, r: 0.16, h: 5.65, rz: 0.055, c: 0x7fdcff },
    { x: 0.46, z: 0.12, r: 0.14, h: 3.75, rz: 0.1, c: 0xab9aff },
  ];
  for (const placement of placements) {
    const shard = facetedShard(placement.r, placement.h, placement.c, 6);
    shard.rotateZ(placement.rz);
    shard.translate(placement.x, 0, placement.z);
    pieces.push(shard);
  }
  return mergeOrThrow(pieces);
}

function createSlidingPlateGeometry(): THREE.BufferGeometry {
  const pieces: THREE.BufferGeometry[] = [];
  const slab = chippedBlock(1, 6.7, 0.72, 0x8bc8ec, 1129);
  slab.translate(0, 2.35, 0);
  pieces.push(slab);
  for (const placement of [
    { x: -0.34, y: 0.12, r: 0.16, h: 2.2, c: 0x68e9ff },
    { x: 0.04, y: 0.18, r: 0.2, h: 3.0, c: 0x9e92ff },
    { x: 0.36, y: 0.1, r: 0.15, h: 2.45, c: 0x71cfff },
  ]) {
    const crystal = facetedShard(placement.r, placement.h, placement.c, 6);
    crystal.translate(placement.x, placement.y, 0.32);
    pieces.push(crystal);
  }
  return mergeOrThrow(pieces);
}

interface NeriGeometry {
  group: THREE.Group;
  geometries: THREE.BufferGeometry[];
}

function createNeri(
  bodyMaterial: THREE.Material,
  finMaterial: THREE.Material,
  eyeMaterial: THREE.Material,
): NeriGeometry {
  const group = new THREE.Group();
  group.name = "crystal-trench-neri-mirror-current-racer";
  group.userData["realm"] = "crystal-trench";
  group.userData["nonCollidable"] = true;
  const geometries: THREE.BufferGeometry[] = [];

  const bodyGeometry = new THREE.SphereGeometry(0.66, 20, 12);
  bodyGeometry.scale(0.92, 0.5, 1.62);
  geometries.push(bodyGeometry);
  const body = new THREE.Mesh(bodyGeometry, bodyMaterial);
  body.name = "neri-opalescent-body";
  group.add(body);

  const finGeometry = new THREE.BufferGeometry();
  finGeometry.setAttribute("position", new THREE.Float32BufferAttribute([
    0, 0.08, 0.42,
    2.05, -0.04, 0.12,
    1.32, 0.14, -0.82,
    0, 0.02, -0.56,
  ], 3));
  finGeometry.setIndex([0, 1, 2, 0, 2, 3]);
  finGeometry.computeVertexNormals();
  geometries.push(finGeometry);
  const leftFin = new THREE.Mesh(finGeometry, finMaterial);
  leftFin.name = "neri-left-mirror-fin";
  group.add(leftFin);
  const rightFin = new THREE.Mesh(finGeometry, finMaterial);
  rightFin.name = "neri-right-mirror-fin";
  rightFin.scale.x = -1;
  group.add(rightFin);

  const tailCurve = new THREE.CatmullRomCurve3([
    new THREE.Vector3(0, 0, 0.78),
    new THREE.Vector3(0.08, -0.02, 1.35),
    new THREE.Vector3(-0.08, 0.02, 1.92),
    new THREE.Vector3(0, 0, 2.52),
  ]);
  const tailGeometry = new THREE.TubeGeometry(tailCurve, 18, 0.085, 6, false);
  geometries.push(tailGeometry);
  const tail = new THREE.Mesh(tailGeometry, finMaterial);
  tail.name = "neri-ribbon-tail";
  group.add(tail);

  const eyeGeometry = new THREE.SphereGeometry(0.095, 10, 6);
  geometries.push(eyeGeometry);
  for (const side of [-1, 1]) {
    const eye = new THREE.Mesh(eyeGeometry, eyeMaterial);
    eye.position.set(side * 0.28, 0.12, -0.5);
    eye.name = side < 0 ? "neri-left-eye" : "neri-right-eye";
    group.add(eye);
  }
  return { group, geometries };
}

function createRouteRibbonGeometry(fractured: boolean): THREE.BufferGeometry {
  const pieces: THREE.BufferGeometry[] = [];
  if (!fractured) {
    for (const x of [-0.46, 0.46]) {
      const rail = new THREE.PlaneGeometry(0.035, 1);
      rail.translate(x, 0, 0);
      tintGeometry(rail, 0xffffff);
      pieces.push(rail);
    }
  }
  const markerCount = fractured ? 5 : 7;
  for (let index = 0; index < markerCount; index += 1) {
    const marker = new THREE.PlaneGeometry(fractured ? 0.18 : 0.28, 0.032);
    marker.rotateZ((index % 2 === 0 ? 1 : -1) * (fractured ? 0.42 : 0.3));
    marker.translate(
      fractured ? (index % 2 === 0 ? -0.23 : 0.25) : 0,
      -0.42 + index * (0.84 / Math.max(1, markerCount - 1)),
      0,
    );
    tintGeometry(marker, 0xffffff);
    pieces.push(marker);
  }
  const merged = mergeOrThrow(pieces);
  merged.rotateX(-Math.PI / 2);
  return merged;
}

function createApertureGeometry(): THREE.BufferGeometry {
  const pieces: THREE.BufferGeometry[] = [];
  for (const x of [-0.49, 0.49]) {
    const upright = new THREE.PlaneGeometry(0.035, 1);
    upright.translate(x, 0, 0);
    tintGeometry(upright, 0xffffff);
    pieces.push(upright);
  }
  for (let index = 0; index < 5; index += 1) {
    const lintel = new THREE.PlaneGeometry(0.17, 0.035);
    lintel.rotateZ(index % 2 === 0 ? 0.08 : -0.06);
    lintel.translate(-0.38 + index * 0.19, 0.48, 0);
    tintGeometry(lintel, 0xffffff);
    pieces.push(lintel);
  }
  return mergeOrThrow(pieces);
}

function createMoonbeamGeometry(): THREE.BufferGeometry {
  const beam = new THREE.CylinderGeometry(0.22, 0.74, 1, 10, 1, true);
  beam.translate(0, 0.5, 0);
  tintGeometry(beam, 0xffffff);
  return beam;
}

function createFissureGeometry(): THREE.BufferGeometry {
  const pieces: THREE.BufferGeometry[] = [];
  const placements = [
    { x: -0.28, y: -0.18, w: 0.46, h: 0.035, r: 0.18 },
    { x: 0.04, y: 0.02, w: 0.65, h: 0.028, r: -0.24 },
    { x: 0.33, y: 0.2, w: 0.38, h: 0.032, r: 0.31 },
  ];
  for (const placement of placements) {
    const shard = new THREE.PlaneGeometry(placement.w, placement.h);
    shard.rotateZ(placement.r);
    shard.translate(placement.x, placement.y, 0);
    tintGeometry(shard, 0xffffff);
    pieces.push(shard);
  }
  const merged = mergeOrThrow(pieces);
  merged.rotateX(-Math.PI / 2);
  return merged;
}

const DUST_VERTEX = /* glsl */ `
  attribute float aPhase;
  varying float vPulse;
  uniform float uTime;
  void main() {
    vec3 drifted = position;
    drifted.x += sin(uTime * 0.34 + aPhase * 6.28318) * 0.2;
    drifted.y += sin(uTime * 0.27 + aPhase * 9.42477) * 0.14;
    vec4 mvPosition = modelViewMatrix * vec4(drifted, 1.0);
    vPulse = 0.52 + sin(uTime * 1.35 + aPhase * 12.0) * 0.22;
    gl_PointSize = clamp((20.0 / max(1.0, -mvPosition.z)), 1.4, 4.4);
    gl_Position = projectionMatrix * mvPosition;
  }
`;

const DUST_FRAGMENT = /* glsl */ `
  precision mediump float;
  varying float vPulse;
  void main() {
    vec2 centred = gl_PointCoord - vec2(0.5);
    float distanceToCentre = length(centred);
    float alpha = smoothstep(0.5, 0.08, distanceToCentre) * vPulse;
    vec3 colour = mix(vec3(0.34, 0.54, 0.92), vec3(0.66, 0.96, 1.0), vPulse);
    gl_FragColor = vec4(colour, alpha);
  }
`;

/** Fixed-capacity, mobile-safe Crystal Trench R2 realism rebuild. */
export class CrystalTrenchField {
  readonly group = new THREE.Group();

  private readonly seabedGeometry = new THREE.PlaneGeometry(72, 4000);
  private readonly cliffGeometry = createCliffGeometry();
  private readonly crystalGeometry = createCrystalForestGeometry();
  private readonly ruinFragmentGeometry = createRuinFragmentGeometry();
  private readonly thresholdGeometry = createRuinGateGeometry();
  private readonly gateStoneGeometry = createGateStoneGeometry();
  private readonly gateCrystalGeometry = createGateCrystalGeometry();
  private readonly plateGeometry = createSlidingPlateGeometry();
  private readonly trueRouteGeometry = createRouteRibbonGeometry(false);
  private readonly falseRouteGeometry = createRouteRibbonGeometry(true);
  private readonly apertureGeometry = createApertureGeometry();
  private readonly beamGeometry = createMoonbeamGeometry();
  private readonly fissureGeometry = createFissureGeometry();
  private readonly rubbleGeometry = new THREE.DodecahedronGeometry(0.36, 0);
  private readonly mirrorCurrentGeometry = new THREE.TorusGeometry(
    3.9,
    0.055,
    6,
    28,
    Math.PI * 1.55,
  );
  private readonly dustGeometry = new THREE.BufferGeometry();

  private readonly seabedMaterial: THREE.MeshStandardMaterial;
  private readonly ruinMaterial: THREE.MeshStandardMaterial;
  private readonly crystalMaterial: THREE.MeshPhysicalMaterial;
  private readonly routeMaterial: THREE.MeshBasicMaterial;
  private readonly beamMaterial: THREE.MeshBasicMaterial;
  private readonly plateMaterial: THREE.MeshPhysicalMaterial;
  private readonly neriBodyMaterial: THREE.MeshPhysicalMaterial;
  private readonly neriFinMaterial: THREE.MeshPhysicalMaterial;
  private readonly neriEyeMaterial: THREE.MeshBasicMaterial;
  private readonly dustMaterial: THREE.ShaderMaterial;

  private readonly seabed: THREE.Mesh;
  private readonly cliffs: THREE.InstancedMesh;
  private readonly crystalClusters: THREE.InstancedMesh;
  private readonly ruinFragments: THREE.InstancedMesh;
  private readonly gateStoneWalls: THREE.InstancedMesh;
  private readonly gateCrystalSpines: THREE.InstancedMesh;
  private readonly slidingPlates: THREE.InstancedMesh;
  private readonly thresholdArches: THREE.InstancedMesh;
  private readonly trueRoutes: THREE.InstancedMesh;
  private readonly trueApertures: THREE.InstancedMesh;
  private readonly falseRoutes: THREE.InstancedMesh;
  private readonly moonbeams: THREE.InstancedMesh;
  private readonly fissurePools: THREE.InstancedMesh;
  private readonly rubble: THREE.InstancedMesh;
  private readonly mirrorCurrentArcs: THREE.InstancedMesh;
  private readonly neri: NeriGeometry;
  private readonly dust: THREE.Points;

  private readonly dummy = new THREE.Object3D();
  private readonly colour = new THREE.Color();
  private readonly brightCyan = new THREE.Color(0xd9fdff);
  private readonly darkCyan = new THREE.Color(0x1a5c83);
  private readonly brightViolet = new THREE.Color(0x8f7ad8);
  private readonly darkViolet = new THREE.Color(0x181d4b);
  private readonly dustPositions = new Float32Array(PRISM_DUST_COUNT * 3);

  constructor(
    private readonly cfg: TuningConfig,
    textures: Readonly<CrystalTrenchTextures>,
  ) {
    this.group.name = "crystal-trench-r3-realistic-mirror-current";
    this.group.visible = false;

    this.seabedGeometry.rotateX(-Math.PI / 2);
    tintGeometry(this.rubbleGeometry, 0x9aabc0);

    this.seabedMaterial = new THREE.MeshStandardMaterial({
      color: 0x9ca9be,
      map: textures.seabed,
      roughness: 0.98,
      metalness: 0.01,
    });
    this.ruinMaterial = new THREE.MeshStandardMaterial({
      color: 0xd2d9e1,
      map: textures.ruinStone,
      emissive: 0x09152b,
      emissiveIntensity: 0.18,
      roughness: 0.86,
      metalness: 0.03,
      vertexColors: true,
    });
    this.crystalMaterial = new THREE.MeshPhysicalMaterial({
      color: 0xc7e1ff,
      map: textures.crystal,
      emissive: 0x163d7d,
      emissiveMap: textures.crystal,
      emissiveIntensity: 0.62,
      roughness: 0.2,
      metalness: 0.08,
      clearcoat: 0.72,
      clearcoatRoughness: 0.16,
      reflectivity: 0.82,
      vertexColors: true,
    });
    this.plateMaterial = new THREE.MeshPhysicalMaterial({
      color: 0xc5efff,
      map: textures.crystal,
      emissive: 0x194b8d,
      emissiveMap: textures.crystal,
      emissiveIntensity: 0.78,
      roughness: 0.16,
      metalness: 0.08,
      clearcoat: 0.86,
      clearcoatRoughness: 0.1,
      reflectivity: 0.9,
      transparent: true,
      opacity: 0.94,
      vertexColors: true,
    });
    this.neriBodyMaterial = new THREE.MeshPhysicalMaterial({
      color: 0xc8f7ff,
      emissive: 0x1f6f91,
      emissiveIntensity: 0.82,
      roughness: 0.24,
      metalness: 0.05,
      clearcoat: 0.9,
      clearcoatRoughness: 0.12,
      iridescence: 0.72,
      iridescenceIOR: 1.24,
      transparent: true,
      opacity: 0.96,
    });
    this.neriFinMaterial = new THREE.MeshPhysicalMaterial({
      color: 0x9b9cff,
      emissive: 0x452c9d,
      emissiveIntensity: 0.9,
      roughness: 0.18,
      clearcoat: 0.76,
      transparent: true,
      opacity: 0.82,
      side: THREE.DoubleSide,
    });
    this.neriEyeMaterial = new THREE.MeshBasicMaterial({
      color: 0xf1ffff,
      toneMapped: false,
    });
    this.routeMaterial = new THREE.MeshBasicMaterial({
      color: 0xffffff,
      transparent: true,
      opacity: 0.72,
      side: THREE.DoubleSide,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      toneMapped: false,
      vertexColors: true,
    });
    this.beamMaterial = new THREE.MeshBasicMaterial({
      color: 0xd9faff,
      transparent: true,
      opacity: 0.115,
      side: THREE.DoubleSide,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      toneMapped: false,
      vertexColors: true,
    });
    this.dustMaterial = new THREE.ShaderMaterial({
      uniforms: { uTime: { value: 0 } },
      vertexShader: DUST_VERTEX,
      fragmentShader: DUST_FRAGMENT,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      toneMapped: false,
    });

    this.seabed = new THREE.Mesh(this.seabedGeometry, this.seabedMaterial);
    this.seabed.name = "crystal-trench-volcanic-silt-and-basalt-seabed";
    this.seabed.position.set(0, -1.07, -1980);
    this.seabed.userData["realm"] = "crystal-trench";
    this.seabed.userData["nonCollidable"] = true;

    this.cliffs = prepareInstanced(
      this.cliffGeometry,
      this.ruinMaterial,
      MAX_CLIFFS,
      "crystal-trench-fractured-cavern-buttresses",
    );
    this.crystalClusters = prepareInstanced(
      this.crystalGeometry,
      this.crystalMaterial,
      MAX_CRYSTAL_CLUSTERS,
      "crystal-trench-faceted-reflective-crystal-forest",
    );
    this.ruinFragments = prepareInstanced(
      this.ruinFragmentGeometry,
      this.ruinMaterial,
      MAX_RUIN_FRAGMENTS,
      "crystal-trench-eroded-submerged-ruin-colonnade",
    );
    this.gateStoneWalls = prepareInstanced(
      this.gateStoneGeometry,
      this.ruinMaterial,
      MAX_GATE_SEGMENTS,
      "crystal-trench-collision-true-broken-stone-barricades",
      true,
    );
    this.gateCrystalSpines = prepareInstanced(
      this.gateCrystalGeometry,
      this.crystalMaterial,
      MAX_GATE_SEGMENTS,
      "crystal-trench-collision-true-crystal-spines",
      true,
    );
    this.slidingPlates = prepareInstanced(
      this.plateGeometry,
      this.plateMaterial,
      MAX_PLATE_SEGMENTS,
      "crystal-trench-collision-true-sliding-crystal-plates",
      true,
    );
    this.thresholdArches = prepareInstanced(
      this.thresholdGeometry,
      this.ruinMaterial,
      MAX_THRESHOLD_ARCHES,
      "crystal-trench-monumental-eroded-voussoir-trench-gate",
    );
    this.trueRoutes = prepareInstanced(
      this.trueRouteGeometry,
      this.routeMaterial,
      MAX_TRUE_ROUTES,
      "crystal-trench-prism-pulse-cyan-seabed-route",
    );
    this.trueRoutes.userData["hideInArtMask"] = true;
    this.trueApertures = prepareInstanced(
      this.apertureGeometry,
      this.routeMaterial,
      MAX_TRUE_APERTURES,
      "crystal-trench-prism-pulse-collision-true-aperture",
    );
    this.trueApertures.userData["hideInArtMask"] = true;
    this.falseRoutes = prepareInstanced(
      this.falseRouteGeometry,
      this.routeMaterial,
      MAX_FALSE_ROUTES,
      "crystal-trench-prism-pulse-fractured-violet-reflections",
    );
    this.falseRoutes.userData["hideInArtMask"] = true;
    this.moonbeams = prepareInstanced(
      this.beamGeometry,
      this.beamMaterial,
      MAX_MOONBEAMS,
      "crystal-trench-tapered-volumetric-refracted-moonbeams",
    );
    this.moonbeams.userData["hideInArtMask"] = true;
    this.fissurePools = prepareInstanced(
      this.fissureGeometry,
      this.routeMaterial,
      MAX_FISSURE_POOLS,
      "crystal-trench-irregular-cyan-mineral-fissures",
    );
    this.fissurePools.userData["hideInArtMask"] = true;
    this.rubble = prepareInstanced(
      this.rubbleGeometry,
      this.ruinMaterial,
      MAX_RUBBLE,
      "crystal-trench-scattered-basalt-and-ruin-rubble",
    );
    this.mirrorCurrentArcs = prepareInstanced(
      this.mirrorCurrentGeometry,
      this.routeMaterial,
      MAX_MIRROR_CURRENT_ARCS,
      "crystal-trench-neri-mirror-current-race-tunnel",
    );
    this.mirrorCurrentArcs.userData["hideInArtMask"] = true;
    this.neri = createNeri(
      this.neriBodyMaterial,
      this.neriFinMaterial,
      this.neriEyeMaterial,
    );
    this.neri.group.visible = false;

    const phases = new Float32Array(PRISM_DUST_COUNT);
    for (let index = 0; index < PRISM_DUST_COUNT; index += 1) {
      phases[index] = hash01(index, 1409);
    }
    this.dustGeometry.setAttribute(
      "position",
      new THREE.BufferAttribute(this.dustPositions, 3),
    );
    this.dustGeometry.setAttribute("aPhase", new THREE.BufferAttribute(phases, 1));
    this.dust = new THREE.Points(this.dustGeometry, this.dustMaterial);
    this.dust.name = "crystal-trench-suspended-prismatic-mineral-dust";
    this.dust.frustumCulled = false;
    this.dust.userData["realm"] = "crystal-trench";
    this.dust.userData["nonCollidable"] = true;

    this.group.add(
      this.seabed,
      this.cliffs,
      this.crystalClusters,
      this.ruinFragments,
      this.gateStoneWalls,
      this.gateCrystalSpines,
      this.slidingPlates,
      this.thresholdArches,
      this.trueRoutes,
      this.trueApertures,
      this.falseRoutes,
      this.moonbeams,
      this.fissurePools,
      this.rubble,
      this.mirrorCurrentArcs,
      this.neri.group,
      this.dust,
    );
  }

  private setInstance(
    mesh: THREE.InstancedMesh,
    index: number,
    colour: THREE.ColorRepresentation,
  ): void {
    this.dummy.updateMatrix();
    mesh.setMatrixAt(index, this.dummy.matrix);
    mesh.setColorAt(index, this.colour.set(colour));
  }

  private finishInstances(mesh: THREE.InstancedMesh, count: number): void {
    mesh.count = count;
    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
  }

  update(
    realmId: RealmId,
    forwardDistance: number,
    elapsedSec: number,
    gates: readonly Gate[],
    status: Readonly<CrystalTrenchRunStatus> | null,
  ): void {
    const active = realmId === "crystal-trench";
    this.group.visible = active;
    if (!active) return;

    let cliffCount = 0;
    let crystalCount = 0;
    let ruinCount = 0;
    let beamCount = 0;
    let fissureCount = 0;
    let rubbleCount = 0;
    const firstBand = Math.floor((forwardDistance - 18) / BAND_SPACING);
    const bandCount = Math.ceil(
      this.cfg.readability.visibleAheadUnits * 2.35 / BAND_SPACING,
    );
    for (let offset = 0; offset < bandCount; offset += 1) {
      const band = firstBand + offset;
      const z = -(band * BAND_SPACING);
      for (const side of [-1, 1]) {
        if (cliffCount < MAX_CLIFFS) {
          this.dummy.position.set(
            side * (
              this.cfg.lane.halfWidth + 5.8 + hash01(band, 1417 + side) * 4.2
            ),
            -1.06,
            z + (hash01(band, 1433 + side) - 0.5) * 4,
          );
          this.dummy.rotation.set(
            (hash01(band, 1447 + side) - 0.5) * 0.08,
            hash01(band, 1451 + side) * Math.PI,
            side * (hash01(band, 1459 + side) - 0.5) * 0.12,
          );
          const cliffScale = 1.2 + hash01(band, 1471 + side) * 0.92;
          this.dummy.scale.set(
            cliffScale * (1.1 + hash01(band, 1481 + side) * 0.42),
            cliffScale * (1.32 + hash01(band, 1487 + side) * 0.72),
            cliffScale,
          );
          this.setInstance(
            this.cliffs,
            cliffCount,
            band % 3 === 0 ? 0x9aa8bd : 0x8190a8,
          );
          cliffCount += 1;
        }

        for (
          let cluster = 0;
          cluster < 2 && crystalCount < MAX_CRYSTAL_CLUSTERS;
          cluster += 1
        ) {
          const salt = 1501 + cluster * 37 + side;
          this.dummy.position.set(
            side * (
              this.cfg.lane.halfWidth + 1.7 + hash01(band, salt) * 4.8
            ),
            -1.04,
            z - 2.5 - cluster * 5 + (hash01(band, salt + 11) - 0.5) * 2.4,
          );
          this.dummy.rotation.set(
            0,
            hash01(band, salt + 17) * Math.PI,
            side * (hash01(band, salt + 23) - 0.5) * 0.1,
          );
          const scale = 0.62 + hash01(band, salt + 29) * 0.72;
          this.dummy.scale.set(
            scale,
            scale * (1.06 + hash01(band, salt + 31) * 0.42),
            scale,
          );
          this.setInstance(
            this.crystalClusters,
            crystalCount,
            cluster === 0 ? 0xbcecff : 0xc1b5ff,
          );
          crystalCount += 1;
        }

        for (let rock = 0; rock < 2 && rubbleCount < MAX_RUBBLE; rock += 1) {
          const salt = 1549 + rock * 31 + side;
          this.dummy.position.set(
            side * (
              this.cfg.lane.halfWidth + 0.9 + hash01(band, salt) * 5.8
            ),
            -0.82 + hash01(band, salt + 7) * 0.16,
            z - rock * 6 + (hash01(band, salt + 13) - 0.5) * 3.2,
          );
          this.dummy.rotation.set(
            hash01(band, salt + 17) * Math.PI,
            hash01(band, salt + 19) * Math.PI,
            hash01(band, salt + 23) * Math.PI,
          );
          const scale = 0.45 + hash01(band, salt + 29) * 1.05;
          this.dummy.scale.set(scale * 1.4, scale * 0.72, scale);
          this.setInstance(this.rubble, rubbleCount, rock === 0 ? 0x9aa9ba : 0x71849c);
          rubbleCount += 1;
        }
      }

      if (band % 3 === 0 && ruinCount < MAX_RUIN_FRAGMENTS) {
        const side = hash01(band, 1571) < 0.5 ? -1 : 1;
        this.dummy.position.set(
          side * (this.cfg.lane.halfWidth + 5.8 + hash01(band, 1579) * 2.3),
          -1.05,
          z - 5,
        );
        this.dummy.rotation.set(0.03, side * (0.2 + hash01(band, 1583) * 0.32), side * 0.08);
        const scale = 0.78 + hash01(band, 1597) * 0.3;
        this.dummy.scale.set(scale, scale, scale * 1.06);
        this.setInstance(this.ruinFragments, ruinCount, 0xb0bccb);
        ruinCount += 1;
      }

      if (band % 4 === 0 && beamCount < MAX_MOONBEAMS) {
        this.dummy.position.set(
          (hash01(band, 1601) - 0.5) * this.cfg.lane.halfWidth * 2.7,
          -1.02,
          z - 8,
        );
        this.dummy.rotation.set(
          (hash01(band, 1613) - 0.5) * 0.12,
          hash01(band, 1619) * Math.PI,
          (hash01(band, 1627) - 0.5) * 0.2,
        );
        this.dummy.scale.set(
          0.72 + hash01(band, 1637) * 0.92,
          15 + hash01(band, 1643) * 7,
          0.58 + hash01(band, 1657) * 0.7,
        );
        this.setInstance(
          this.moonbeams,
          beamCount,
          band % 8 === 0 ? 0xe1ffff : 0x9bb8ff,
        );
        beamCount += 1;
      }

      for (
        let fissure = 0;
        fissure < 2 && fissureCount < MAX_FISSURE_POOLS;
        fissure += 1
      ) {
        const salt = 1663 + fissure * 43;
        const outerBias = hash01(band, salt + 3) < 0.68;
        const side = hash01(band, salt + 5) < 0.5 ? -1 : 1;
        this.dummy.position.set(
          outerBias
            ? side * (this.cfg.lane.halfWidth + 0.6 + hash01(band, salt) * 3.2)
            : (hash01(band, salt) - 0.5) * this.cfg.lane.halfWidth * 1.7,
          -1.045,
          z - fissure * 7 - hash01(band, salt + 7) * 4,
        );
        this.dummy.rotation.set(0, hash01(band, salt + 13) * Math.PI, 0);
        this.dummy.scale.set(
          1.1 + hash01(band, salt + 19) * 2.2,
          1,
          0.7 + hash01(band, salt + 23) * 1.6,
        );
        this.setInstance(
          this.fissurePools,
          fissureCount,
          fissure === 0 ? 0x4bdff7 : 0x766dca,
        );
        fissureCount += 1;
      }
    }

    let gateSegmentCount = 0;
    let plateSegmentCount = 0;
    let thresholdCount = 0;
    let trueRouteCount = 0;
    let trueApertureCount = 0;
    let falseRouteCount = 0;
    const near = forwardDistance + 0.75;
    const far = forwardDistance + this.cfg.readability.visibleAheadUnits * 1.55;
    for (const gate of gates) {
      if (gate.distance < near) continue;
      if (gate.distance > far) break;
      const plan = gate.realmPlan;
      if (!plan || (
        plan.verb !== "prism-pulse" &&
        plan.verb !== "trench-threshold" &&
        plan.verb !== "sliding-crystal-plates"
      )) {
        continue;
      }
      const walls = gateWallSegmentsAt(gate, this.cfg.lane.halfWidth, elapsedSec);
      for (const wall of walls) {
        if (
          plan.verb === "sliding-crystal-plates"
            ? plateSegmentCount >= MAX_PLATE_SEGMENTS
            : gateSegmentCount >= MAX_GATE_SEGMENTS
        ) break;
        this.dummy.position.set(wall.centreX, -1.03, -gate.distance);
        this.dummy.rotation.set(
          0,
          (hash01(Math.round(gate.distance), gateSegmentCount + 1709) - 0.5) * 0.08,
          0,
        );
        this.dummy.scale.set(Math.max(0.04, wall.width), 1, 1);
        if (plan.verb === "sliding-crystal-plates") {
          this.setInstance(
            this.slidingPlates,
            plateSegmentCount,
            plateSegmentCount % 2 === 0 ? 0xbff8ff : 0xb9adff,
          );
          plateSegmentCount += 1;
        } else {
          this.setInstance(
            this.gateStoneWalls,
            gateSegmentCount,
            plan.verb === "trench-threshold" ? 0xb6c4d2 : 0x8799ad,
          );
          this.setInstance(
            this.gateCrystalSpines,
            gateSegmentCount,
            plan.verb === "trench-threshold" ? 0xc4ecff : 0xb1c7ff,
          );
          gateSegmentCount += 1;
        }
      }

      if (plan.verb === "prism-pulse" && trueRouteCount < MAX_TRUE_ROUTES) {
        const pulse = prismPulseState(plan, elapsedSec);
        const trueCenter = (plan.trueRoute.left + plan.trueRoute.right) * 0.5;
        const trueWidth = plan.trueRoute.right - plan.trueRoute.left;
        const routeLength = 18 + pulse.revealStrength * 3;
        this.dummy.position.set(trueCenter, -1.035, -gate.distance + routeLength * 0.5);
        this.dummy.rotation.set(0, 0, 0);
        this.dummy.scale.set(trueWidth, 1, routeLength);
        this.colour.copy(this.darkCyan).lerp(this.brightCyan, pulse.trueRouteBrightness);
        this.setInstance(this.trueRoutes, trueRouteCount, this.colour);
        trueRouteCount += 1;

        if (trueApertureCount < MAX_TRUE_APERTURES) {
          this.dummy.position.set(trueCenter, 1.68, -gate.distance + 0.74);
          this.dummy.rotation.set(0, 0, 0);
          this.dummy.scale.set(trueWidth, 5.35, 1);
          this.colour.copy(this.darkCyan).lerp(this.brightCyan, pulse.trueRouteBrightness);
          this.setInstance(this.trueApertures, trueApertureCount, this.colour);
          trueApertureCount += 1;
        }

        for (const falseCenter of plan.falseRouteCenters) {
          if (falseRouteCount >= MAX_FALSE_ROUTES) break;
          const falseScale = 0.68 + pulse.falseRouteBrightness * 0.32;
          const falseLength = 12.5 * falseScale;
          this.dummy.position.set(
            falseCenter,
            -1.032,
            -gate.distance + falseLength * 0.5 + 1.2,
          );
          this.dummy.rotation.set(0, 0, 0);
          this.dummy.scale.set(plan.falseRouteWidth, 1, falseLength);
          this.colour.copy(this.darkViolet).lerp(
            this.brightViolet,
            pulse.falseRouteBrightness,
          );
          this.setInstance(this.falseRoutes, falseRouteCount, this.colour);
          falseRouteCount += 1;
        }
      } else if (plan.verb === "sliding-crystal-plates") {
        const opening = slidingCrystalPlateOpeningAt(plan, elapsedSec);
        const routeLength = 22;
        const sequencePulse = 0.76 + opening.sequenceStep * 0.08;
        if (trueRouteCount < MAX_TRUE_ROUTES) {
          this.dummy.position.set(
            opening.center,
            -1.035,
            -gate.distance + routeLength * 0.5,
          );
          this.dummy.rotation.set(0, 0, 0);
          this.dummy.scale.set(plan.openingWidth, 1, routeLength);
          this.setInstance(
            this.trueRoutes,
            trueRouteCount,
            this.colour.copy(this.darkCyan).lerp(this.brightCyan, sequencePulse),
          );
          trueRouteCount += 1;
        }
        if (trueApertureCount < MAX_TRUE_APERTURES) {
          this.dummy.position.set(opening.center, 1.72, -gate.distance + 0.74);
          this.dummy.rotation.set(0, 0, 0);
          this.dummy.scale.set(plan.openingWidth, 5.55, 1);
          this.setInstance(
            this.trueApertures,
            trueApertureCount,
            opening.sequenceStep === 1 ? 0xe9ffff : 0xaad7ff,
          );
          trueApertureCount += 1;
        }
      } else if (
        plan.verb === "trench-threshold" &&
        thresholdCount < MAX_THRESHOLD_ARCHES
      ) {
        this.dummy.position.set(plan.center, -1.02, -gate.distance + 0.3);
        this.dummy.rotation.set(0, 0, 0);
        this.dummy.scale.set(
          Math.max(0.72, plan.openingWidth / 5.8),
          1.02,
          1.24,
        );
        this.setInstance(this.thresholdArches, thresholdCount, 0xc2ccd6);
        thresholdCount += 1;

        const routeLength = 24;
        if (trueRouteCount < MAX_TRUE_ROUTES) {
          const thresholdPulse = 0.84 + Math.sin(elapsedSec * 1.8) * 0.08;
          this.dummy.position.set(
            plan.center,
            -1.035,
            -gate.distance + routeLength * 0.5,
          );
          this.dummy.rotation.set(0, 0, 0);
          this.dummy.scale.set(plan.openingWidth, 1, routeLength);
          this.setInstance(
            this.trueRoutes,
            trueRouteCount,
            this.colour.copy(this.darkCyan).lerp(this.brightCyan, thresholdPulse),
          );
          trueRouteCount += 1;
        }
        if (trueApertureCount < MAX_TRUE_APERTURES) {
          this.dummy.position.set(plan.center, 1.72, -gate.distance + 0.76);
          this.dummy.rotation.set(0, 0, 0);
          this.dummy.scale.set(plan.openingWidth, 5.45, 1);
          this.setInstance(this.trueApertures, trueApertureCount, 0xe7ffff);
          trueApertureCount += 1;
        }
      }
    }

    let mirrorArcCount = 0;
    if (status?.raceActive) {
      const firstArc = Math.floor((forwardDistance - 8) / 9);
      for (
        let index = 0;
        index < MAX_MIRROR_CURRENT_ARCS;
        index += 1
      ) {
        const arcDistance = (firstArc + index) * 9;
        if (arcDistance > forwardDistance + this.cfg.readability.visibleAheadUnits * 1.65) {
          break;
        }
        const wave = Math.sin(arcDistance * 0.028 + elapsedSec * 1.12);
        this.dummy.position.set(wave * 1.35, 1.9, -arcDistance);
        this.dummy.rotation.set(0, 0, index % 2 === 0 ? 0.14 : -0.14);
        const pulse = 0.9 + Math.sin(elapsedSec * 2.4 + index * 0.72) * 0.08;
        this.dummy.scale.set(pulse, pulse * 0.82, 1);
        this.setInstance(
          this.mirrorCurrentArcs,
          mirrorArcCount,
          index % 2 === 0 ? 0x76f5ff : 0xa58cff,
        );
        mirrorArcCount += 1;
      }
    }
    this.finishInstances(this.mirrorCurrentArcs, mirrorArcCount);

    const neriDistance = status?.neriDistance ?? null;
    this.neri.group.visible = Boolean(
      neriDistance !== null && (status?.raceActive || status?.raceWon),
    );
    if (this.neri.group.visible && neriDistance !== null) {
      const swim = Math.sin(elapsedSec * 5.2);
      this.neri.group.position.set(
        Math.sin(neriDistance * 0.022 + elapsedSec * 0.74) * 2.15,
        0.34 + swim * 0.08,
        -neriDistance,
      );
      this.neri.group.rotation.set(
        swim * 0.025,
        0,
        Math.sin(elapsedSec * 2.1) * 0.08,
      );
      this.neri.group.scale.setScalar(status?.raceWon ? 1.08 : 1);
    }

    this.finishInstances(this.cliffs, cliffCount);
    this.finishInstances(this.crystalClusters, crystalCount);
    this.finishInstances(this.ruinFragments, ruinCount);
    this.finishInstances(this.gateStoneWalls, gateSegmentCount);
    this.finishInstances(this.gateCrystalSpines, gateSegmentCount);
    this.finishInstances(this.slidingPlates, plateSegmentCount);
    this.finishInstances(this.thresholdArches, thresholdCount);
    this.finishInstances(this.trueRoutes, trueRouteCount);
    this.finishInstances(this.trueApertures, trueApertureCount);
    this.finishInstances(this.falseRoutes, falseRouteCount);
    this.finishInstances(this.moonbeams, beamCount);
    this.finishInstances(this.fissurePools, fissureCount);
    this.finishInstances(this.rubble, rubbleCount);

    this.dustMaterial.uniforms["uTime"]!.value = elapsedSec;
    const firstDustBand = Math.floor((forwardDistance - 12) / 5.8);
    for (let index = 0; index < PRISM_DUST_COUNT; index += 1) {
      const band = firstDustBand + (index % 40);
      const offset = index * 3;
      this.dustPositions[offset] =
        (hash01(index, 1753) - 0.5) * this.cfg.lane.halfWidth * 3.1;
      this.dustPositions[offset + 1] =
        -0.1 + hash01(index, 1777) * 11.5;
      this.dustPositions[offset + 2] =
        -(band * 5.8 + hash01(index, 1789) * 5.6);
    }
    this.dustGeometry.getAttribute("position").needsUpdate = true;
  }

  additionalDrawCalls(): number {
    return 22;
  }

  additionalMaterials(): number {
    return 10;
  }

  triangleBudget(): number {
    return Math.ceil(
      triangleCount(this.seabedGeometry) +
      triangleCount(this.cliffGeometry) * MAX_CLIFFS +
      triangleCount(this.crystalGeometry) * MAX_CRYSTAL_CLUSTERS +
      triangleCount(this.ruinFragmentGeometry) * MAX_RUIN_FRAGMENTS +
      triangleCount(this.thresholdGeometry) * MAX_THRESHOLD_ARCHES +
      triangleCount(this.gateStoneGeometry) * MAX_GATE_SEGMENTS +
      triangleCount(this.gateCrystalGeometry) * MAX_GATE_SEGMENTS +
      triangleCount(this.plateGeometry) * MAX_PLATE_SEGMENTS +
      triangleCount(this.trueRouteGeometry) * MAX_TRUE_ROUTES +
      triangleCount(this.apertureGeometry) * MAX_TRUE_APERTURES +
      triangleCount(this.falseRouteGeometry) * MAX_FALSE_ROUTES +
      triangleCount(this.beamGeometry) * MAX_MOONBEAMS +
      triangleCount(this.fissureGeometry) * MAX_FISSURE_POOLS +
      triangleCount(this.rubbleGeometry) * MAX_RUBBLE +
      triangleCount(this.mirrorCurrentGeometry) * MAX_MIRROR_CURRENT_ARCS +
      triangleCount(this.neri.geometries[0]!) +
      triangleCount(this.neri.geometries[1]!) * 2 +
      triangleCount(this.neri.geometries[2]!) +
      triangleCount(this.neri.geometries[3]!) * 2,
    );
  }

  dispose(): void {
    for (const geometry of [
      this.seabedGeometry,
      this.cliffGeometry,
      this.crystalGeometry,
      this.ruinFragmentGeometry,
      this.thresholdGeometry,
      this.gateStoneGeometry,
      this.gateCrystalGeometry,
      this.plateGeometry,
      this.trueRouteGeometry,
      this.apertureGeometry,
      this.falseRouteGeometry,
      this.beamGeometry,
      this.fissureGeometry,
      this.rubbleGeometry,
      this.mirrorCurrentGeometry,
      this.dustGeometry,
      ...this.neri.geometries,
    ]) geometry.dispose();
    for (const material of [
      this.seabedMaterial,
      this.ruinMaterial,
      this.crystalMaterial,
      this.plateMaterial,
      this.routeMaterial,
      this.beamMaterial,
      this.neriBodyMaterial,
      this.neriFinMaterial,
      this.neriEyeMaterial,
      this.dustMaterial,
    ]) material.dispose();
  }
}
