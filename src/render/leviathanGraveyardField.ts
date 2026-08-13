import * as THREE from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import type { TuningConfig } from "../core/config";
import type { RealmId } from "../realms/definition";
import type { DuskmawRunStatus } from "../sim/run";
import type { Gate } from "../sim/course";
import { gateWallSegmentsAt } from "../sim/gateGeometry";
import {
  DUSKMAW_AURALIS_CATCHUP_SEC,
  DUSKMAW_VAULT_HOLD_SEC,
  duskmawDodgeLateral,
} from "../realms/mechanics";
import {
  createLeviathanRigResources,
  disposeLeviathanRigResources,
  LeviathanRig,
  type LeviathanRigMaterials,
  type LeviathanRigResources,
} from "./leviathanRig";
import { ShadowBroodRig } from "./shadowBroodRig";

const MAX_CLIFF_SEGMENTS = 28;
const MAX_RIB_BUTTRESSES = 24;
const MAX_WALL_VERTEBRAE = 30;
const MAX_SANCTUM_FACADES = 10;
const MAX_FOSSIL_BEDS = 14;
const MAX_ROUTE_BUTTRESSES = 44;
const MAX_COLLAPSE_SLABS = 36;
const MAX_CURRENT_PORTALS = 8;
const MAX_MOON_SEALS = 4;
const MAX_WAKE_SPIRALS = 18;
const MAX_SAFE_ROUTE_ARROWS = 48;
const MAX_MOONBEAMS = 12;
const MAX_LANTERNFISH = 44;
const MAX_STRUCK_ARCHES = 8;
const MAX_MOUTH_CHARGES = 3;
const MAX_MOUTHFIRE_SEGMENTS = 24;
const MAX_IMPACT_BURSTS = 12;
const MAX_DANGER_VEILS = 8;
const MAX_COUNTER_BOLT_SEGMENTS = 18;
const MAX_COUNTER_MOTES = 18;
const MAX_COUNTER_IMPACT_RINGS = 8;
const MAX_ARMOUR_FRAGMENTS = 12;
const MAX_PRISON_BARS = 18;
const MAX_PRISON_RIBS = 8;
const MAX_PRISON_SHACKLES = 6;
const MAX_GUARDIAN_BEAM_SEGMENTS = 12;
const MAX_MOONLINK_BEAM_SEGMENTS = 10;
const MAX_RESTORATION_WAVES = 4;
const MAX_LUMEN_BLOOMS = 8;
const MAX_HEARTLIGHT_TRAIL_SEGMENTS = 9;
const MAX_PLAYER_HIT_FRAGMENTS = 10;
const MAX_DEFEAT_FRAGMENTS = 18;
const MAX_MOONCREST_WINGS = 2;
const MAX_REGENERATION_WISPS = 12;
const DUST_COUNT = 220;
const SCENERY_SPACING = 54;
export const DUSKMAW_FORWARD_YAW_RAD = Math.PI / 2;
export const DUSKMAW_CRUISE_TURN_LIMIT_DEG = 48;

export interface LeviathanGraveyardTextures {
  fossilBone: THREE.Texture;
  ruinStone: THREE.Texture;
  seabed: THREE.Texture;
}

function hash01(value: number, salt: number): number {
  let hash = Math.imul(value ^ salt, 0x27d4eb2d);
  hash ^= hash >>> 15;
  hash = Math.imul(hash, 0x85ebca6b);
  return ((hash ^ (hash >>> 13)) >>> 0) / 0x1_0000_0000;
}

function clamp01(value: number): number {
  return Math.max(0, Math.min(1, value));
}

function smootherStep(value: number): number {
  const t = clamp01(value);
  return t * t * t * (t * (t * 6 - 15) + 10);
}

export interface DuskmawPursuitPose {
  yawOffsetRad: number;
  lateral: number;
  bankRad: number;
  leadOffset: number;
  heightOffset: number;
}

export interface MoonlinkDuskmawPose {
  lateral: number;
  lead: number;
  height: number;
  yawOffsetRad: number;
  bankRad: number;
}

/**
 * Deterministic full-lane pursuit. Lateral position, heading, depth and bank
 * share the same low-frequency curves, so Duskmaw carves through the water
 * instead of snapping between disconnected poses or being trapped in a
 * small twenty-degree pendulum.
 */
export function duskmawPursuitMotion(
  elapsedSec: number,
  reducedMotion = false,
): DuskmawPursuitPose {
  if (reducedMotion) {
    return { yawOffsetRad: 0, lateral: 0, bankRad: 0, leadOffset: 0, heightOffset: 0 };
  }
  const ramp = smootherStep(elapsedSec / 5);
  const phase = elapsedSec * 0.255;
  const lateral = THREE.MathUtils.clamp(
    (3.55 * Math.sin(phase) + 1.05 * Math.sin(phase * 0.61 + 1.1)) * ramp,
    -4.65,
    4.65,
  );
  const lateralVelocity = (
    3.55 * 0.255 * Math.cos(phase) +
    1.05 * 0.255 * 0.61 * Math.cos(phase * 0.61 + 1.1)
  ) * ramp;
  const yawOffsetRad = THREE.MathUtils.clamp(
    Math.atan2(lateralVelocity, 1.35),
    -THREE.MathUtils.degToRad(DUSKMAW_CRUISE_TURN_LIMIT_DEG),
    THREE.MathUtils.degToRad(DUSKMAW_CRUISE_TURN_LIMIT_DEG),
  );
  return {
    yawOffsetRad,
    lateral,
    bankRad: -yawOffsetRad * 0.17,
    leadOffset: (2.8 * Math.sin(phase * 0.72 + 0.35) + 0.9 * Math.sin(phase * 1.31)) * ramp,
    heightOffset: (0.5 * Math.sin(phase * 0.88 - 0.4) + 0.18 * Math.sin(phase * 1.7)) * ramp,
  };
}

/**
 * The final arena uses one continuous attack orbit. Position and heading are
 * derived from the same curve, so Duskmaw cannot face Glowfin while sliding
 * backwards. Faster secondary motion is introduced after each joined strike
 * without creating snap turns or teleporting between lanes.
 */
export function moonlinkDuskmawMotion(
  phaseElapsedSec: number,
  _joinedStrikes: number,
  reducedMotion = false,
): MoonlinkDuskmawPose {
  if (reducedMotion) {
    return { lateral: 4.2, lead: 38, height: 4.35, yawOffsetRad: 0, bankRad: 0 };
  }
  const ramp = smootherStep(phaseElapsedSec / 2.8);
  // Strike count may change on any fixed step. It therefore cannot be used to
  // re-parameterise the curve without teleporting the creature. Combat
  // intensity comes from animation, light and Auralis's intercept instead.
  const rate = 0.42;
  const phase = phaseElapsedSec * rate;
  const curveLateral = (
    Math.sin(phase) * 4.15 +
    Math.sin(phase * 0.53 + 1.2) * 0.72
  );
  const curveLead = 35.5 + (
    Math.cos(phase * 0.78) * 6.4 +
    Math.sin(phase * 1.41 + 0.4) * 1.15
  );
  const curveHeight = 4.75 + Math.sin(phase * 0.72 - 0.6) * 0.68;
  const lateral = THREE.MathUtils.lerp(4.7, curveLateral, ramp);
  const lead = THREE.MathUtils.lerp(38, curveLead, ramp);
  const height = THREE.MathUtils.lerp(4.2, curveHeight, ramp);
  const lateralVelocity = (
    Math.cos(phase) * 4.15 * rate +
    Math.cos(phase * 0.53 + 1.2) * 0.72 * rate * 0.53
  ) * ramp;
  const leadVelocity = (
    -Math.sin(phase * 0.78) * 6.4 * rate * 0.78 +
    Math.cos(phase * 1.41 + 0.4) * 1.15 * rate * 1.41
  ) * ramp;
  const yawOffsetRad = THREE.MathUtils.clamp(
    Math.atan2(lateralVelocity, Math.max(2.6, 8.4 + leadVelocity)),
    -THREE.MathUtils.degToRad(54),
    THREE.MathUtils.degToRad(54),
  );
  return {
    lateral,
    lead,
    height,
    yawOffsetRad: yawOffsetRad * ramp,
    bankRad: -yawOffsetRad * 0.28 * ramp,
  };
}

export interface DuskmawMouthAttackPose {
  turn: number;
  charge: number;
  fire: number;
  impact: number;
}

export interface GlowfinCounterStrikePose {
  charge: number;
  fire: number;
  impact: number;
}

/** A passed Moon Charge gathers at Glowfin, fires forward, and visibly cracks
 * one third of Duskmaw's armour before the next combat round begins. */
export function glowfinCounterStrikePose(distanceAhead: number): GlowfinCounterStrikePose {
  const chargeIn = smootherStep((8 - distanceAhead) / 8);
  const chargeOut = smootherStep((distanceAhead + 30) / 12);
  const fireIn = smootherStep((2 - distanceAhead) / 7);
  const fireOut = smootherStep((distanceAhead + 20) / 9);
  const impactIn = smootherStep((-7 - distanceAhead) / 6);
  const impactOut = smootherStep((distanceAhead + 34) / 12);
  return {
    charge: Math.min(chargeIn, chargeOut),
    fire: Math.min(fireIn, fireOut),
    impact: Math.min(impactIn, impactOut),
  };
}

function lerpAngle(from: number, to: number, amount: number): number {
  const delta = Math.atan2(Math.sin(to - from), Math.cos(to - from));
  return from + delta * amount;
}

/** Route-distance choreography: eased turn, readable charge, mouthfire, ruin
 * impact, then an equally eased return to forward travel. */
export function duskmawMouthAttackPose(distanceAhead: number): DuskmawMouthAttackPose {
  const turnIn = smootherStep((86 - distanceAhead) / 46);
  const turnOut = smootherStep((distanceAhead + 72) / 66);
  const turn = Math.min(turnIn, turnOut);
  const chargeIn = smootherStep((60 - distanceAhead) / 20);
  const chargeOut = smootherStep((distanceAhead - 8) / 20);
  const fireIn = smootherStep((30 - distanceAhead) / 12);
  const fireOut = smootherStep((distanceAhead + 10) / 20);
  const impactIn = smootherStep((16 - distanceAhead) / 12);
  const impactOut = smootherStep((distanceAhead + 32) / 26);
  return {
    turn,
    charge: Math.min(chargeIn, chargeOut),
    fire: Math.min(fireIn, fireOut),
    impact: Math.min(impactIn, impactOut),
  };
}

function isDuskmawAttackGate(gate: Gate): boolean {
  const verb = gate.realmPlan?.verb;
  return verb === "shadow-sweep" || verb === "vacuum-wake" || verb === "ruins-collapse";
}

function attackSide(gate: Gate): -1 | 1 {
  const plan = gate.realmPlan;
  if (plan?.verb === "shadow-sweep") return plan.sweepSide;
  if (plan?.verb === "ruins-collapse") return plan.collapseSide;
  if (plan?.verb === "vacuum-wake") return plan.lateralDriftPerSec < 0 ? -1 : 1;
  return 1;
}

function triangleCount(geometry: THREE.BufferGeometry): number {
  return geometry.index
    ? geometry.index.count / 3
    : (geometry.getAttribute("position")?.count ?? 0) / 3;
}

function mergeOrThrow(geometries: THREE.BufferGeometry[]): THREE.BufferGeometry {
  const merged = mergeGeometries(geometries, false);
  if (!merged) throw new Error("Leviathan Graveyard geometry attributes did not merge.");
  for (const geometry of geometries) geometry.dispose();
  merged.computeVertexNormals();
  merged.computeBoundingSphere();
  return merged;
}

function markObject<T extends THREE.Object3D>(
  object: T,
  name: string,
  obstacle = false,
): T {
  object.name = name;
  object.userData["realm"] = "leviathan-graveyard";
  object.userData["isObstacle"] = obstacle;
  object.userData["nonCollidable"] = !obstacle;
  return object;
}

function prepareInstanced(
  geometry: THREE.BufferGeometry,
  material: THREE.Material,
  count: number,
  name: string,
  obstacle = false,
): THREE.InstancedMesh {
  const mesh = markObject(
    new THREE.InstancedMesh(geometry, material, count),
    name,
    obstacle,
  );
  mesh.count = 0;
  mesh.frustumCulled = false;
  mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  return mesh;
}

function createTaperedPathGeometry(
  points: readonly THREE.Vector3[],
  startRadius: number,
  endRadius: number,
  radialSegments = 9,
): THREE.BufferGeometry {
  const positions: number[] = [];
  const uvs: number[] = [];
  const indices: number[] = [];
  const tangent = new THREE.Vector3();
  const reference = new THREE.Vector3();
  const normalA = new THREE.Vector3();
  const normalB = new THREE.Vector3();
  const radial = new THREE.Vector3();

  for (let ring = 0; ring < points.length; ring += 1) {
    const previous = points[Math.max(0, ring - 1)] ?? points[ring]!;
    const next = points[Math.min(points.length - 1, ring + 1)] ?? points[ring]!;
    tangent.subVectors(next, previous).normalize();
    reference.set(0, Math.abs(tangent.y) < 0.9 ? 1 : 0, Math.abs(tangent.y) < 0.9 ? 0 : 1);
    normalA.crossVectors(tangent, reference).normalize();
    normalB.crossVectors(tangent, normalA).normalize();
    const fraction = ring / Math.max(1, points.length - 1);
    const radius = THREE.MathUtils.lerp(startRadius, endRadius, fraction);
    for (let side = 0; side < radialSegments; side += 1) {
      const angle = side / radialSegments * Math.PI * 2;
      radial.copy(normalA).multiplyScalar(Math.cos(angle) * radius)
        .addScaledVector(normalB, Math.sin(angle) * radius);
      const point = points[ring]!;
      positions.push(point.x + radial.x, point.y + radial.y, point.z + radial.z);
      uvs.push(fraction, side / radialSegments);
    }
  }
  for (let ring = 0; ring < points.length - 1; ring += 1) {
    for (let side = 0; side < radialSegments; side += 1) {
      const nextSide = (side + 1) % radialSegments;
      const a = ring * radialSegments + side;
      const b = ring * radialSegments + nextSide;
      const c = (ring + 1) * radialSegments + side;
      const d = (ring + 1) * radialSegments + nextSide;
      indices.push(a, c, b, b, c, d);
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute("uv", new THREE.Float32BufferAttribute(uvs, 2));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  geometry.computeBoundingSphere();
  return geometry;
}

function createCliffSegmentGeometry(): THREE.BufferGeometry {
  const geometry = new THREE.BoxGeometry(10, 11, SCENERY_SPACING + 5, 2, 4, 8);
  const position = geometry.getAttribute("position");
  const point = new THREE.Vector3();
  for (let index = 0; index < position.count; index += 1) {
    point.fromBufferAttribute(position, index);
    const noise = Math.sin(point.y * 1.71 + point.z * 0.23 + index * 0.91) * 0.34 +
      Math.sin(point.x * 0.73 - point.z * 0.11) * 0.18;
    point.x += Math.sign(point.x || 1) * noise;
    point.y += Math.sin(point.z * 0.17 + index) * 0.16;
    position.setXYZ(index, point.x, point.y, point.z);
  }
  position.needsUpdate = true;
  geometry.computeVertexNormals();
  return geometry;
}

function createRibButtressGeometry(): THREE.BufferGeometry {
  return createTaperedPathGeometry([
    new THREE.Vector3(0, 0, 0),
    new THREE.Vector3(0.08, 1.7, 0.02),
    new THREE.Vector3(0.42, 3.5, -0.08),
    new THREE.Vector3(1.15, 5.2, -0.2),
    new THREE.Vector3(2.45, 6.55, -0.38),
    new THREE.Vector3(4.05, 7.18, -0.56),
    new THREE.Vector3(5.32, 6.72, -0.7),
  ], 0.42, 0.08, 10);
}

function createWallVertebraGeometry(): THREE.BufferGeometry {
  const centrum = new THREE.SphereGeometry(1, 14, 9);
  centrum.scale(0.92, 0.68, 0.46);
  const neuralArch = new THREE.TorusGeometry(0.68, 0.15, 7, 20, Math.PI);
  neuralArch.translate(0, 0.42, 0);
  const leftProcess = createTaperedPathGeometry([
    new THREE.Vector3(-0.56, 0.08, 0),
    new THREE.Vector3(-1.15, 0.32, -0.02),
    new THREE.Vector3(-1.82, 0.5, -0.08),
  ], 0.17, 0.055, 7);
  const rightProcess = createTaperedPathGeometry([
    new THREE.Vector3(0.56, 0.08, 0),
    new THREE.Vector3(1.15, 0.32, -0.02),
    new THREE.Vector3(1.82, 0.5, -0.08),
  ], 0.17, 0.055, 7);
  const spine = createTaperedPathGeometry([
    new THREE.Vector3(0, 0.55, 0),
    new THREE.Vector3(0.04, 1.2, -0.03),
    new THREE.Vector3(0.08, 1.82, -0.12),
  ], 0.17, 0.045, 7);
  return mergeOrThrow([centrum, neuralArch, leftProcess, rightProcess, spine]);
}

function createSanctumFacadeGeometry(): THREE.BufferGeometry {
  const pieces: THREE.BufferGeometry[] = [];
  const rearWall = new THREE.BoxGeometry(6.6, 4.7, 0.62, 4, 3, 1);
  rearWall.translate(0, 2.5, 0.48);
  pieces.push(rearWall);
  for (const side of [-1, 1] as const) {
    const column = new THREE.CylinderGeometry(0.42, 0.56, 5.5, 10, 4);
    column.translate(side * 2.45, 2.72, 0);
    pieces.push(column);
    const capital = new THREE.CylinderGeometry(0.68, 0.46, 0.34, 10, 1);
    capital.translate(side * 2.45, 5.48, 0);
    pieces.push(capital);
  }
  const arch = new THREE.TorusGeometry(2.45, 0.36, 8, 30, Math.PI);
  arch.translate(0, 3.05, -0.02);
  pieces.push(arch);
  const brokenPediment = new THREE.BoxGeometry(5.9, 0.42, 0.86, 4, 1, 1);
  brokenPediment.rotateZ(-0.07);
  brokenPediment.translate(0.18, 5.62, 0.04);
  pieces.push(brokenPediment);
  return mergeOrThrow(pieces);
}

function createFossilBedGeometry(): THREE.BufferGeometry {
  const skull = new THREE.SphereGeometry(1, 14, 9);
  skull.scale(1.55, 0.48, 1.02);
  const jawLeft = createTaperedPathGeometry([
    new THREE.Vector3(-0.7, -0.25, 0.52),
    new THREE.Vector3(-1.65, -0.28, 0.65),
    new THREE.Vector3(-2.85, -0.12, 0.42),
    new THREE.Vector3(-3.65, 0.02, 0.2),
  ], 0.18, 0.06, 7);
  const jawRight = createTaperedPathGeometry([
    new THREE.Vector3(-0.7, -0.25, -0.52),
    new THREE.Vector3(-1.65, -0.28, -0.65),
    new THREE.Vector3(-2.85, -0.12, -0.42),
    new THREE.Vector3(-3.65, 0.02, -0.2),
  ], 0.18, 0.06, 7);
  return mergeOrThrow([skull, jawLeft, jawRight]);
}

function createRouteButtressGeometry(): THREE.BufferGeometry {
  const geometry = new THREE.BoxGeometry(1, 1, 1.7, 3, 2, 2);
  const position = geometry.getAttribute("position");
  const point = new THREE.Vector3();
  for (let index = 0; index < position.count; index += 1) {
    point.fromBufferAttribute(position, index);
    point.y += Math.sin(point.x * 5.7 + point.z * 3.2 + index) * 0.08;
    point.x += Math.sin(point.y * 4.1 + index * 0.7) * 0.045;
    position.setXYZ(index, point.x, point.y, point.z);
  }
  position.needsUpdate = true;
  geometry.computeVertexNormals();
  return geometry;
}

function createCurrentPortalGeometry(): THREE.BufferGeometry {
  const heart = new THREE.OctahedronGeometry(0.72, 1);
  heart.scale(0.82, 1.22, 0.58);
  const leftShard = new THREE.OctahedronGeometry(0.42, 0);
  leftShard.scale(0.56, 1.55, 0.48);
  leftShard.rotateZ(-0.34);
  leftShard.translate(-1.28, 0.05, 0);
  const rightShard = leftShard.clone();
  rightShard.rotateZ(0.68);
  rightShard.translate(2.56, 0, 0);
  const spine = new THREE.OctahedronGeometry(0.5, 0);
  spine.scale(0.16, 3.15, 0.18);
  return mergeOrThrow([heart, leftShard, rightShard, spine]);
}

function createMoonSealGeometry(): THREE.BufferGeometry {
  const leftPillar = new THREE.OctahedronGeometry(0.5, 1);
  leftPillar.scale(0.42, 5.1, 0.44);
  leftPillar.rotateZ(-0.2);
  leftPillar.translate(-2.18, 0, 0);
  const rightPillar = new THREE.OctahedronGeometry(0.5, 1);
  rightPillar.scale(0.42, 5.1, 0.44);
  rightPillar.rotateZ(0.2);
  rightPillar.translate(2.18, 0, 0);
  const crown = new THREE.OctahedronGeometry(0.5, 1);
  crown.scale(3.85, 0.32, 0.38);
  crown.translate(0, 2.18, 0);
  const heart = new THREE.OctahedronGeometry(0.68, 1);
  heart.scale(0.72, 1.12, 0.48);
  return mergeOrThrow([leftPillar, rightPillar, crown, heart]);
}

function createRouteArrowGeometry(): THREE.BufferGeometry {
  const shape = new THREE.Shape();
  shape.moveTo(-1.1, -0.22);
  shape.lineTo(0.2, -0.22);
  shape.lineTo(0.2, -0.62);
  shape.lineTo(1.18, 0);
  shape.lineTo(0.2, 0.62);
  shape.lineTo(0.2, 0.22);
  shape.lineTo(-1.1, 0.22);
  shape.closePath();
  const geometry = new THREE.ShapeGeometry(shape);
  // Author the arrow into the seabed plane with its point facing world -Z,
  // the same direction Glowfin travels. This prevents the old portrait view
  // from making every marker point back toward the player.
  geometry.rotateX(-Math.PI / 2);
  geometry.rotateY(Math.PI / 2);
  return geometry;
}

function createDangerVeilGeometry(): THREE.BufferGeometry {
  const shape = new THREE.Shape();
  shape.moveTo(-2.7, 0);
  shape.lineTo(2.7, 0);
  shape.lineTo(1.65, 5.8);
  shape.lineTo(-1.65, 5.8);
  shape.closePath();
  return new THREE.ShapeGeometry(shape);
}

function createLanternfishGeometry(): THREE.BufferGeometry {
  const body = new THREE.SphereGeometry(1, 10, 7);
  body.scale(0.42, 0.18, 0.66);
  const bodyNonIndexed = body.toNonIndexed();
  body.dispose();
  const tail = new THREE.TetrahedronGeometry(0.38, 0);
  tail.scale(0.58, 0.7, 0.52);
  tail.rotateY(Math.PI / 4);
  tail.translate(0, 0, -0.72);
  return mergeOrThrow([bodyNonIndexed, tail]);
}

function createLumenBloomGeometry(): THREE.BufferGeometry {
  const pieces: THREE.BufferGeometry[] = [];
  const core = new THREE.IcosahedronGeometry(0.46, 1);
  pieces.push(core);
  for (let petal = 0; petal < 6; petal += 1) {
    const angle = petal / 6 * Math.PI * 2;
    const shard = new THREE.OctahedronGeometry(0.34, 0);
    shard.scale(0.48, 1.28, 0.42);
    shard.rotateZ(-angle + Math.PI / 2);
    shard.translate(Math.cos(angle) * 0.78, Math.sin(angle) * 0.78, 0);
    pieces.push(shard);
  }
  return mergeOrThrow(pieces);
}

function createMooncrestCoreGeometry(): THREE.BufferGeometry {
  const pieces: THREE.BufferGeometry[] = [];
  const heart = new THREE.OctahedronGeometry(0.78, 2);
  heart.scale(0.82, 1.18, 0.48);
  pieces.push(heart);

  const lunarCrown = new THREE.TorusGeometry(1.05, 0.105, 8, 36, Math.PI * 1.5);
  lunarCrown.rotateZ(Math.PI * 0.75);
  lunarCrown.scale(1, 1.08, 0.78);
  pieces.push(lunarCrown);

  for (let prong = 0; prong < 5; prong += 1) {
    const shard = new THREE.OctahedronGeometry(0.24, 1);
    const offset = prong - 2;
    shard.scale(0.34, 0.9 + (2 - Math.abs(offset)) * 0.14, 0.3);
    shard.rotateZ(-offset * 0.13);
    shard.translate(offset * 0.34, 1.08 + (2 - Math.abs(offset)) * 0.12, 0);
    pieces.push(shard);
  }

  const lowerSigil = new THREE.OctahedronGeometry(0.34, 1);
  lowerSigil.scale(0.42, 0.9, 0.32);
  lowerSigil.translate(0, -1.05, 0);
  pieces.push(lowerSigil);
  return mergeOrThrow(pieces.map((piece) => {
    if (!piece.index) return piece;
    const nonIndexed = piece.toNonIndexed();
    piece.dispose();
    return nonIndexed;
  }));
}

function createMooncrestWingGeometry(): THREE.BufferGeometry {
  const shape = new THREE.Shape();
  shape.moveTo(0, 0.06);
  shape.bezierCurveTo(0.62, 0.52, 1.36, 0.66, 2.02, 0.34);
  shape.bezierCurveTo(1.56, 0.18, 1.18, -0.02, 0.86, -0.28);
  shape.bezierCurveTo(1.26, -0.24, 1.56, -0.34, 1.82, -0.56);
  shape.bezierCurveTo(1.16, -0.48, 0.54, -0.28, 0, -0.08);
  shape.closePath();
  const geometry = new THREE.ExtrudeGeometry(shape, {
    depth: 0.16,
    bevelEnabled: true,
    bevelSegments: 2,
    bevelSize: 0.045,
    bevelThickness: 0.045,
    curveSegments: 10,
  });
  geometry.translate(0, 0, -0.08);
  geometry.computeVertexNormals();
  return geometry;
}

export class LeviathanGraveyardField {
  readonly group = new THREE.Group();

  private readonly cliffGeometry = createCliffSegmentGeometry();
  private readonly ribGeometry = createRibButtressGeometry();
  private readonly vertebraGeometry = createWallVertebraGeometry();
  private readonly sanctumGeometry = createSanctumFacadeGeometry();
  private readonly fossilBedGeometry = createFossilBedGeometry();
  private readonly routeButtressGeometry = createRouteButtressGeometry();
  private readonly collapseSlabGeometry = createRouteButtressGeometry();
  private readonly currentPortalGeometry = createCurrentPortalGeometry();
  private readonly portalMembraneGeometry = new THREE.CircleGeometry(1, 32);
  private readonly moonSealGeometry = createMoonSealGeometry();
  private readonly sealMembraneGeometry = new THREE.CircleGeometry(1, 36);
  private readonly wakeSpiralGeometry = new THREE.TorusGeometry(1.3, 0.075, 7, 30, Math.PI * 1.62);
  private readonly safeRouteArrowGeometry = createRouteArrowGeometry();
  private readonly moonbeamGeometry = new THREE.CylinderGeometry(0.34, 1.42, 18, 8, 1, true);
  private readonly lanternfishGeometry = createLanternfishGeometry();
  private readonly mouthChargeGeometry = new THREE.IcosahedronGeometry(0.5, 1);
  private readonly mouthfireGeometry = new THREE.CylinderGeometry(0.1, 0.24, 1, 8, 1, true);
  private readonly impactBurstGeometry = new THREE.TorusGeometry(1, 0.08, 7, 26);
  private readonly mooncrestCoreGeometry = createMooncrestCoreGeometry();
  private readonly mooncrestWingGeometry = createMooncrestWingGeometry();
  private readonly dangerVeilGeometry = createDangerVeilGeometry();
  private readonly recoveryGeometry = new THREE.TorusGeometry(1, 0.075, 7, 28);
  private readonly prisonBarGeometry = new THREE.CylinderGeometry(0.16, 0.2, 1, 8);
  private readonly prisonShackleGeometry = new THREE.TorusGeometry(1, 0.13, 8, 24, Math.PI * 1.72);
  private readonly prisonAuraGeometry = new THREE.IcosahedronGeometry(1, 2);
  private readonly restorationWaveGeometry = new THREE.TorusGeometry(1, 0.1, 8, 36);
  private readonly moonlinkShieldGeometry = new THREE.SphereGeometry(
    1,
    16,
    10,
    0,
    Math.PI * 2,
    0,
    Math.PI * 0.64,
  );
  private readonly lumenBloomGeometry = createLumenBloomGeometry();
  private readonly finalBlastGeometry = new THREE.IcosahedronGeometry(1, 2);
  private readonly seabedGeometry = new THREE.PlaneGeometry(76, 8000, 12, 96);
  private readonly dustGeometry = new THREE.BufferGeometry();
  private readonly rigResources: LeviathanRigResources = createLeviathanRigResources();

  private readonly boneMaterial: THREE.MeshStandardMaterial;
  private readonly cliffMaterial: THREE.MeshStandardMaterial;
  private readonly seabedMaterial: THREE.MeshStandardMaterial;
  private readonly routeMaterial = new THREE.MeshBasicMaterial({
    color: 0xbffcff,
    transparent: true,
    opacity: 0.86,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    toneMapped: false,
    side: THREE.DoubleSide,
  });
  private readonly moonbeamMaterial = new THREE.MeshBasicMaterial({
    color: 0xbcefff,
    transparent: true,
    opacity: 0.14,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    toneMapped: false,
    side: THREE.DoubleSide,
  });
  private readonly dustMaterial = new THREE.PointsMaterial({
    color: 0xaeefff,
    size: 0.065,
    transparent: true,
    opacity: 0.46,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    sizeAttenuation: true,
  });
  private readonly duskMaterials: LeviathanRigMaterials;
  private readonly moonMaterials: LeviathanRigMaterials;

  private readonly seabed: THREE.Mesh;
  private readonly cliffs: THREE.InstancedMesh;
  private readonly ribs: THREE.InstancedMesh;
  private readonly vertebrae: THREE.InstancedMesh;
  private readonly sanctums: THREE.InstancedMesh;
  private readonly fossilBeds: THREE.InstancedMesh;
  private readonly routeButtresses: THREE.InstancedMesh;
  private readonly collapseSlabs: THREE.InstancedMesh;
  private readonly currentPortals: THREE.InstancedMesh;
  private readonly portalMembranes: THREE.InstancedMesh;
  private readonly moonSeals: THREE.InstancedMesh;
  private readonly sealMembranes: THREE.InstancedMesh;
  private readonly wakeSpirals: THREE.InstancedMesh;
  private readonly safeRouteArrows: THREE.InstancedMesh;
  private readonly moonbeams: THREE.InstancedMesh;
  private readonly lanternfish: THREE.InstancedMesh;
  private readonly struckArches: THREE.InstancedMesh;
  private readonly mouthCharges: THREE.InstancedMesh;
  private readonly mouthfire: THREE.InstancedMesh;
  private readonly impactBursts: THREE.InstancedMesh;
  private readonly dangerVeils: THREE.InstancedMesh;
  private readonly counterBolts: THREE.InstancedMesh;
  private readonly counterCharge: THREE.Mesh;
  private readonly counterMotes: THREE.InstancedMesh;
  private readonly counterImpactRings: THREE.InstancedMesh;
  private readonly armourFragments: THREE.InstancedMesh;
  private readonly regenerationWisps: THREE.InstancedMesh;
  private readonly prisonBars: THREE.InstancedMesh;
  private readonly prisonRibs: THREE.InstancedMesh;
  private readonly prisonShackles: THREE.InstancedMesh;
  private readonly prisonAura: THREE.Mesh;
  private readonly guardianBeam: THREE.InstancedMesh;
  private readonly moonlinkBeam: THREE.InstancedMesh;
  private readonly heartlightOrb: THREE.Mesh;
  private readonly heartlightCore: THREE.Mesh;
  private readonly heartlightTrail: THREE.InstancedMesh;
  private readonly heartlightLight: THREE.PointLight;
  private readonly moonlinkShield: THREE.Mesh;
  private readonly restorationWaves: THREE.InstancedMesh;
  private readonly recoveryPulse: THREE.Mesh;
  private readonly lumenBlooms: THREE.InstancedMesh;
  private readonly minionWeakPoint: THREE.Mesh;
  private readonly playerHitBurst: THREE.Mesh;
  private readonly playerHitFragments: THREE.InstancedMesh;
  private readonly finalBlast: THREE.Mesh;
  private readonly vaultBlast: THREE.Mesh;
  private readonly defeatFragments: THREE.InstancedMesh;
  private readonly mooncrestGem: THREE.Mesh;
  private readonly mooncrestWings: THREE.InstancedMesh;
  private readonly mooncrestHalo: THREE.Mesh;
  private readonly finaleLight: THREE.PointLight;
  private readonly dust: THREE.Points;
  private readonly dustPositions = new Float32Array(DUST_COUNT * 3);
  private readonly duskmaw: LeviathanRig;
  private readonly shadowBrood: ShadowBroodRig;
  private readonly moonLeviathan: LeviathanRig;

  private readonly dummy = new THREE.Object3D();
  private readonly colour = new THREE.Color();
  private readonly mouthWorld = new THREE.Vector3();
  private readonly attackTarget = new THREE.Vector3();
  private readonly playerOrigin = new THREE.Vector3();
  private readonly counterTarget = new THREE.Vector3();
  private readonly moonMouthWorld = new THREE.Vector3();
  private readonly duskHeadWorld = new THREE.Vector3();
  private readonly heartlightStart = new THREE.Vector3();
  private readonly heartlightTarget = new THREE.Vector3();
  private readonly fragmentOffset = new THREE.Vector3();
  private readonly minionTarget = new THREE.Vector3();
  private readonly segmentVector = new THREE.Vector3();
  private readonly segmentMidpoint = new THREE.Vector3();
  private readonly segmentEnd = new THREE.Vector3();
  private readonly upAxis = new THREE.Vector3(0, 1, 0);
  private lastElapsedSec = 0;
  private awakeningStartedSec = -1;
  private attackLockKey = "";
  private lockedAttackLateral = 0;
  private moonPartnerLateral = 0;
  private lastMoonFollowSec = 0;
  private activeMinionTier = 1;

  constructor(
    private readonly cfg: TuningConfig,
    textures: Readonly<LeviathanGraveyardTextures>,
  ) {
    this.seabedGeometry.rotateX(-Math.PI / 2);
    const seabedPositions = this.seabedGeometry.getAttribute("position");
    const seabedPoint = new THREE.Vector3();
    for (let index = 0; index < seabedPositions.count; index += 1) {
      seabedPoint.fromBufferAttribute(seabedPositions, index);
      const sideRise = THREE.MathUtils.clamp(
        (Math.abs(seabedPoint.x) - this.cfg.lane.halfWidth - 1.2) / 18,
        0,
        1,
      );
      const ripple = Math.sin(seabedPoint.z * 0.028 + seabedPoint.x * 0.13) * 0.09 +
        Math.sin(seabedPoint.z * 0.009 - seabedPoint.x * 0.21) * 0.055;
      seabedPositions.setY(index, ripple * (0.18 + sideRise * 0.82) + sideRise * 0.48);
    }
    seabedPositions.needsUpdate = true;
    this.seabedGeometry.computeVertexNormals();

    this.boneMaterial = new THREE.MeshStandardMaterial({
      color: 0xe0d0aa,
      map: textures.fossilBone,
      emissive: 0x234650,
      emissiveIntensity: 0.28,
      roughness: 0.86,
      metalness: 0,
      side: THREE.DoubleSide,
    });
    this.cliffMaterial = new THREE.MeshStandardMaterial({
      color: 0x54737a,
      map: textures.ruinStone,
      emissive: 0x102b33,
      emissiveIntensity: 0.24,
      roughness: 0.94,
      metalness: 0,
    });
    this.seabedMaterial = new THREE.MeshStandardMaterial({
      color: 0x41636b,
      map: textures.seabed,
      emissive: 0x102b33,
      emissiveIntensity: 0.22,
      roughness: 1,
      metalness: 0,
    });
    this.duskMaterials = {
      body: new THREE.MeshPhysicalMaterial({
        color: 0x254b63,
        emissive: 0x071b29,
        emissiveIntensity: 0.2,
        roughness: 0.5,
        metalness: 0.02,
        clearcoat: 0.28,
        clearcoatRoughness: 0.54,
        side: THREE.DoubleSide,
      }),
      accent: new THREE.MeshStandardMaterial({
        color: 0x7690a0,
        emissive: 0x183549,
        emissiveIntensity: 0.2,
        roughness: 0.66,
        metalness: 0.01,
        side: THREE.DoubleSide,
      }),
      luminous: new THREE.MeshStandardMaterial({
        color: 0x7ff4ff,
        emissive: 0x2ad9ed,
        emissiveIntensity: 1.7,
        roughness: 0.2,
        metalness: 0,
        toneMapped: false,
      }),
    };
    this.moonMaterials = {
      body: new THREE.MeshPhysicalMaterial({
        color: 0xc6d4cf,
        emissive: 0x31535a,
        emissiveIntensity: 0.14,
        roughness: 0.4,
        metalness: 0.02,
        clearcoat: 0.42,
        clearcoatRoughness: 0.36,
        transparent: true,
        side: THREE.DoubleSide,
      }),
      accent: new THREE.MeshStandardMaterial({
        color: 0xd9bd78,
        emissive: 0x493d1f,
        emissiveIntensity: 0.18,
        roughness: 0.5,
        metalness: 0.03,
        transparent: true,
        side: THREE.DoubleSide,
      }),
      luminous: new THREE.MeshStandardMaterial({
        color: 0xf3ffff,
        emissive: 0x86f5ff,
        emissiveIntensity: 1.4,
        roughness: 0.15,
        metalness: 0,
        toneMapped: false,
      }),
    };

    this.seabed = markObject(
      new THREE.Mesh(this.seabedGeometry, this.seabedMaterial),
      "leviathan-graveyard-continuous-textured-silt-canyon-floor",
    );
    this.seabed.position.set(0, -1.08, -3980);
    this.cliffs = prepareInstanced(
      this.cliffGeometry,
      this.cliffMaterial,
      MAX_CLIFF_SEGMENTS,
      "leviathan-graveyard-continuous-overlapping-canyon-wall-segments",
    );
    this.ribs = prepareInstanced(
      this.ribGeometry,
      this.boneMaterial,
      MAX_RIB_BUTTRESSES,
      "leviathan-graveyard-wall-anchored-colossal-rib-buttresses",
    );
    this.vertebrae = prepareInstanced(
      this.vertebraGeometry,
      this.boneMaterial,
      MAX_WALL_VERTEBRAE,
      "leviathan-graveyard-embedded-articulated-vertebral-spine-chains",
    );
    this.sanctums = prepareInstanced(
      this.sanctumGeometry,
      this.cliffMaterial,
      MAX_SANCTUM_FACADES,
      "leviathan-graveyard-coherent-eroded-sanctum-facades",
    );
    this.fossilBeds = prepareInstanced(
      this.fossilBedGeometry,
      this.boneMaterial,
      MAX_FOSSIL_BEDS,
      "leviathan-graveyard-partially-buried-skull-and-jaw-fossil-beds",
    );
    this.routeButtresses = prepareInstanced(
      this.routeButtressGeometry,
      this.cliffMaterial,
      MAX_ROUTE_BUTTRESSES,
      "leviathan-graveyard-low-continuous-route-buttresses-clear-centre",
      true,
    );
    this.collapseSlabs = prepareInstanced(
      this.collapseSlabGeometry,
      this.cliffMaterial,
      MAX_COLLAPSE_SLABS,
      "leviathan-graveyard-falling-arch-debris-crosses-danger-lane-and-leaves-cyan-opening",
      true,
    );
    this.currentPortals = prepareInstanced(
      this.currentPortalGeometry,
      this.routeMaterial,
      MAX_CURRENT_PORTALS,
      "leviathan-graveyard-cyan-current-break-vortices",
    );
    this.portalMembranes = prepareInstanced(
      this.portalMembraneGeometry,
      this.moonbeamMaterial,
      MAX_CURRENT_PORTALS,
      "leviathan-graveyard-current-break-water-membranes",
    );
    this.lumenBlooms = prepareInstanced(
      this.lumenBloomGeometry,
      this.moonMaterials.luminous,
      MAX_LUMEN_BLOOMS,
      "glowfin-only-lumen-bloom-health-recovery-pickups",
    );
    this.moonSeals = prepareInstanced(
      this.moonSealGeometry,
      this.routeMaterial,
      MAX_MOON_SEALS,
      "leviathan-graveyard-monumental-final-moon-seal",
    );
    this.sealMembranes = prepareInstanced(
      this.sealMembraneGeometry,
      this.moonbeamMaterial,
      MAX_MOON_SEALS,
      "leviathan-graveyard-final-moon-seal-water-membrane",
    );
    this.wakeSpirals = prepareInstanced(
      this.wakeSpiralGeometry,
      this.routeMaterial,
      MAX_WAKE_SPIRALS,
      "leviathan-graveyard-vacuum-wake-current-curls",
    );
    this.safeRouteArrows = prepareInstanced(
      this.safeRouteArrowGeometry,
      this.routeMaterial,
      MAX_SAFE_ROUTE_ARROWS,
      "leviathan-graveyard-shadow-sweep-cyan-safe-current",
    );
    this.moonbeams = prepareInstanced(
      this.moonbeamGeometry,
      this.moonbeamMaterial,
      MAX_MOONBEAMS,
      "leviathan-graveyard-broad-refracted-moonbeam-volumes",
    );
    this.lanternfish = prepareInstanced(
      this.lanternfishGeometry,
      this.routeMaterial,
      MAX_LANTERNFISH,
      "leviathan-graveyard-wall-hugging-lanternfish-schools",
    );
    this.struckArches = prepareInstanced(
      this.sanctumGeometry,
      this.cliffMaterial,
      MAX_STRUCK_ARCHES,
      "leviathan-graveyard-duskmaw-mouthfire-struck-ruin-arches",
      true,
    );
    this.mouthCharges = prepareInstanced(
      this.mouthChargeGeometry,
      this.routeMaterial,
      MAX_MOUTH_CHARGES,
      "duskmaw-visible-mouth-charge-before-every-attack",
    );
    this.mouthfire = prepareInstanced(
      this.mouthfireGeometry,
      this.routeMaterial,
      MAX_MOUTHFIRE_SEGMENTS,
      "duskmaw-mouth-origin-attack-travels-toward-locked-glowfin-or-marked-ruin",
    );
    this.impactBursts = prepareInstanced(
      this.impactBurstGeometry,
      this.routeMaterial,
      MAX_IMPACT_BURSTS,
      "duskmaw-mouthfire-impact-bursts-at-player-depth-or-ruin-impact",
    );
    this.dangerVeils = prepareInstanced(
      this.dangerVeilGeometry,
      this.moonbeamMaterial,
      MAX_DANGER_VEILS,
      "leviathan-graveyard-orange-player-target-lock-opposite-cyan-safe-route",
    );
    this.counterBolts = prepareInstanced(
      this.mouthfireGeometry,
      this.routeMaterial,
      MAX_COUNTER_BOLT_SEGMENTS,
      "glowfin-moonbolt-visibly-strikes-shadow-brood-and-duskmaw",
    );
    this.counterCharge = markObject(
      new THREE.Mesh(this.mouthChargeGeometry, this.routeMaterial),
      "glowfin-collected-moon-charge-gathers-before-counterattack",
    );
    this.counterCharge.visible = false;
    this.counterMotes = prepareInstanced(
      this.mouthChargeGeometry,
      this.moonMaterials.luminous,
      MAX_COUNTER_MOTES,
      "glowfin-heartlance-orbiting-charge-and-twin-helix-flight-motes",
    );
    this.counterImpactRings = prepareInstanced(
      this.impactBurstGeometry,
      this.routeMaterial,
      MAX_COUNTER_IMPACT_RINGS,
      "glowfin-heartlance-multi-stage-white-cyan-gold-impact-shockwaves",
    );
    this.armourFragments = prepareInstanced(
      this.rigResources.armourPlate,
      this.duskMaterials.accent,
      MAX_ARMOUR_FRAGMENTS,
      "duskmaw-multi-stage-armour-break-fragments",
    );
    this.regenerationWisps = prepareInstanced(
      this.rigResources.armourPlate,
      this.duskMaterials.luminous,
      MAX_REGENERATION_WISPS,
      "duskmaw-void-heart-regeneration-pulls-shattered-armour-back-inward",
    );
    this.prisonBars = prepareInstanced(
      this.prisonBarGeometry,
      this.boneMaterial,
      MAX_PRISON_BARS,
      "moonbone-vault-three-dimensional-bars-break-and-fall-outward",
    );
    this.prisonRibs = prepareInstanced(
      this.prisonBarGeometry,
      this.boneMaterial,
      MAX_PRISON_RIBS,
      "moonbone-vault-side-anchor-pillars-frame-cell-without-spider-silhouette",
    );
    this.prisonShackles = prepareInstanced(
      this.prisonShackleGeometry,
      this.routeMaterial,
      MAX_PRISON_SHACKLES,
      "moonbone-vault-three-shackles-crack-after-heartlight-return",
    );
    this.prisonAura = markObject(
      new THREE.Mesh(this.prisonAuraGeometry, this.moonbeamMaterial),
      "moonbone-vault-visible-cyan-energy-cell-around-imprisoned-guardian",
    );
    this.prisonAura.visible = false;
    this.guardianBeam = prepareInstanced(
      this.mouthfireGeometry,
      this.routeMaterial,
      MAX_GUARDIAN_BEAM_SEGMENTS,
      "auralis-amplifies-glowfin-heartlight-into-purposeful-sealing-beam",
    );
    this.moonlinkBeam = prepareInstanced(
      this.mouthfireGeometry,
      this.routeMaterial,
      MAX_MOONLINK_BEAM_SEGMENTS,
      "glowfin-to-auralis-steering-linked-heartlight-beam",
    );
    this.heartlightOrb = markObject(
      new THREE.Mesh(this.prisonAuraGeometry, this.moonMaterials.accent),
      "large-golden-heartlight-visibly-tethered-above-glowfin",
    );
    this.heartlightCore = markObject(
      new THREE.Mesh(this.mouthChargeGeometry, this.moonMaterials.luminous),
      "heartlight-white-cyan-core-visible-inside-golden-shell",
    );
    this.heartlightCore.scale.setScalar(0.62);
    this.heartlightOrb.add(this.heartlightCore);
    this.heartlightOrb.visible = false;
    this.heartlightTrail = prepareInstanced(
      this.mouthfireGeometry,
      this.moonMaterials.luminous,
      MAX_HEARTLIGHT_TRAIL_SEGMENTS,
      "heartlight-comet-tether-proves-glowfin-is-carrying-the-core",
    );
    this.heartlightLight = new THREE.PointLight(0xffefab, 0, 18, 2);
    this.heartlightLight.name = "heartlight-local-illumination";
    this.moonlinkShield = markObject(
      new THREE.Mesh(this.moonlinkShieldGeometry, this.moonbeamMaterial),
      "auralis-moonlink-shield-follows-and-protects-glowfin",
    );
    this.moonlinkShield.visible = false;
    this.restorationWaves = prepareInstanced(
      this.restorationWaveGeometry,
      this.routeMaterial,
      MAX_RESTORATION_WAVES,
      "auralis-restores-moon-current-and-opens-path-to-realm-three",
    );
    this.recoveryPulse = markObject(
      new THREE.Mesh(this.recoveryGeometry, this.routeMaterial),
      "glowfin-lumen-bloom-health-restoration-pulse",
    );
    this.recoveryPulse.visible = false;
    this.minionWeakPoint = markObject(
      new THREE.Mesh(this.mouthChargeGeometry, this.moonMaterials.luminous),
      "shadow-brood-cyan-weak-point-shows-where-glowfin-auto-fires",
    );
    this.minionWeakPoint.visible = false;
    this.playerHitBurst = markObject(
      new THREE.Mesh(this.finalBlastGeometry, this.duskMaterials.luminous),
      "direct-hit-on-glowfin-visible-impact-shell",
    );
    this.playerHitBurst.visible = false;
    this.playerHitFragments = prepareInstanced(
      this.rigResources.armourPlate,
      this.duskMaterials.luminous,
      MAX_PLAYER_HIT_FRAGMENTS,
      "direct-hit-on-glowfin-radial-impact-fragments",
    );
    this.finalBlast = markObject(
      new THREE.Mesh(this.finalBlastGeometry, this.moonMaterials.luminous),
      "grand-auralis-glowfin-duskmaw-destruction-blast",
    );
    this.finalBlast.visible = false;
    this.vaultBlast = markObject(
      new THREE.Mesh(this.finalBlastGeometry, this.moonMaterials.luminous),
      "moonbone-vault-heartlight-release-blast",
    );
    this.vaultBlast.visible = false;
    this.defeatFragments = prepareInstanced(
      this.rigResources.armourPlate,
      this.duskMaterials.accent,
      MAX_DEFEAT_FRAGMENTS,
      "duskmaw-final-armour-rupture-fragments-and-dissolution",
    );
    this.mooncrestGem = markObject(
      new THREE.Mesh(this.mooncrestCoreGeometry, this.moonMaterials.luminous),
      "auralis-mooncrest-premium-three-dimensional-lunar-crown-and-heartlight-core",
    );
    this.mooncrestGem.visible = false;
    this.mooncrestWings = prepareInstanced(
      this.mooncrestWingGeometry,
      this.moonMaterials.accent,
      MAX_MOONCREST_WINGS,
      "auralis-mooncrest-paired-sculpted-nacre-feather-wings-form-in-auralis-breath",
    );
    this.mooncrestWings.count = 0;
    this.mooncrestHalo = markObject(
      new THREE.Mesh(this.restorationWaveGeometry, this.routeMaterial),
      "auralis-mooncrest-ceremonial-halo-offered-by-auralis-and-bonds-to-glowfin",
    );
    this.mooncrestHalo.visible = false;
    this.finaleLight = new THREE.PointLight(0x9ffff5, 0, 30, 2);
    this.finaleLight.name = "grand-moonlink-finale-light";
    this.dustGeometry.setAttribute("position", new THREE.BufferAttribute(this.dustPositions, 3));
    this.dust = markObject(
      new THREE.Points(this.dustGeometry, this.dustMaterial),
      "leviathan-graveyard-suspended-silt-and-bubble-depth-field",
    );
    this.dust.frustumCulled = false;

    this.duskmaw = new LeviathanRig(this.rigResources, this.duskMaterials, {
      name: "duskmaw",
      bodyRadius: 1.28,
      bodyLength: 18.5,
      headScale: 1.32,
      waveAmplitude: 1.16,
      swimRate: 1.42,
      moonKind: false,
    });
    this.shadowBrood = new ShadowBroodRig({
      dart: {
        body: this.duskMaterials.accent,
        accent: this.duskMaterials.body,
        luminous: this.duskMaterials.luminous,
      },
      warden: {
        body: this.boneMaterial,
        accent: this.moonMaterials.accent,
        luminous: this.moonMaterials.luminous,
      },
      sentinel: this.duskMaterials,
    });
    this.moonLeviathan = new LeviathanRig(this.rigResources, this.moonMaterials, {
      name: "auralis-moon-leviathan",
      bodyRadius: 1.55,
      bodyLength: 20.5,
      headScale: 1.46,
      waveAmplitude: 0.92,
      swimRate: 0.82,
      moonKind: true,
    });

    this.group.name = "leviathan-graveyard-v44-r1-fossil-canyon-from-scratch";
    this.group.userData["realm"] = "leviathan-graveyard";
    this.group.userData["purpose"] =
      "duskmaw-stole-auralis-heartlight-glowfin-defeats-three-shadow-brood-tiers-recovers-with-lumen-blooms-wounds-duskmaw-through-two-regenerations-carries-the-visible-heartlight-stops-at-the-fixed-moonbone-vault-frees-auralis-and-wins-a-joined-moonlink-battle";
    this.group.userData["renderContract"] =
      "articulated-three-dimensional-creatures-follow-smooth-full-lane-curves-flank-turn-target-and-return-without-snap-frames";
    this.group.userData["compositionContract"] =
      "bright-readable-fossil-canyon-with-visible-moonbone-prison-direct-mouthfire-real-lane-crossing-debris-correct-forward-chevrons-and-no-camera-blocking-rocks";
    this.group.userData["attackContract"] =
      "flank-turn-lock-glowfin-charge-at-mouth-fire-toward-player-or-arch-drop-collidable-debris-dodge-counterbolt-armour-break-regenerate-auralis-catchup-four-stage-intercept-assault-grand-blast-return";
    this.group.userData["finaleContract"] =
      "duskmaw-follows-path-tangent-never-retreats-backwards-auralis-turns-intercepts-rams-and-fires-four-joined-strikes-before-restoring-the-canyon-and-offering-a-sculpted-mooncrest-to-glowfin";
    this.group.userData["collisionContract"] =
      "visible-locked-mouthfire-and-cyan-dodge-lane-share-one-authority-with-no-hidden-procedural-gate-hits";
    this.group.userData["minionContract"] =
      "l1-rift-dart-needlefish-l2-grave-warden-armoured-crustacean-l3-maw-sentinel-abyssal-ray";
    this.group.visible = false;
    this.group.add(
      this.seabed,
      this.cliffs,
      this.ribs,
      this.vertebrae,
      this.sanctums,
      this.fossilBeds,
      this.routeButtresses,
      this.collapseSlabs,
      this.currentPortals,
      this.portalMembranes,
      this.lumenBlooms,
      this.moonSeals,
      this.sealMembranes,
      this.wakeSpirals,
      this.safeRouteArrows,
      this.moonbeams,
      this.lanternfish,
      this.struckArches,
      this.mouthCharges,
      this.mouthfire,
      this.impactBursts,
      this.dangerVeils,
      this.counterBolts,
      this.counterCharge,
      this.counterMotes,
      this.counterImpactRings,
      this.armourFragments,
      this.regenerationWisps,
      this.prisonBars,
      this.prisonRibs,
      this.prisonShackles,
      this.prisonAura,
      this.guardianBeam,
      this.moonlinkBeam,
      this.heartlightOrb,
      this.heartlightTrail,
      this.heartlightLight,
      this.moonlinkShield,
      this.restorationWaves,
      this.moonLeviathan.group,
      this.shadowBrood.group,
      this.minionWeakPoint,
      this.duskmaw.group,
      this.recoveryPulse,
      this.playerHitBurst,
      this.playerHitFragments,
      this.finalBlast,
      this.vaultBlast,
      this.defeatFragments,
      this.mooncrestGem,
      this.mooncrestWings,
      this.mooncrestHalo,
      this.finaleLight,
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

  private finish(mesh: THREE.InstancedMesh, count: number): void {
    mesh.count = count;
    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
  }

  private nearestActiveAttack(
    forwardDistance: number,
    gates: readonly Gate[],
  ): Gate | null {
    let best: Gate | null = null;
    let bestScore = -Infinity;
    for (const gate of gates) {
      if (!isDuskmawAttackGate(gate)) continue;
      const distanceAhead = gate.distance - forwardDistance;
      if (distanceAhead > 132 || distanceAhead < -74) continue;
      const pose = duskmawMouthAttackPose(distanceAhead);
      const score = pose.turn * 1000 - Math.abs(distanceAhead - 18);
      if (score > bestScore) {
        best = gate;
        bestScore = score;
      }
    }
    return best;
  }

  private nearestActiveMinionGate(
    forwardDistance: number,
    gates: readonly Gate[],
    status: Readonly<DuskmawRunStatus> | null,
  ): Gate | null {
    const activeId = status?.activeMinionId;
    if (!activeId) return null;
    let best: Gate | null = null;
    let bestDistance = Infinity;
    for (const gate of gates) {
      const plan = gate.realmPlan;
      if (plan?.verb !== "minion-assault" || plan.minionId !== activeId) continue;
      const distanceAhead = gate.distance - forwardDistance;
      if (distanceAhead > 138 || distanceAhead < -52) continue;
      const score = Math.abs(distanceAhead - 20);
      if (score < bestDistance) {
        best = gate;
        bestDistance = score;
      }
    }
    return best;
  }

  private nearestSuccessfulCounterStrike(
    forwardDistance: number,
    gates: readonly Gate[],
    status: Readonly<DuskmawRunStatus> | null,
    elapsedSec: number,
  ): Gate | null {
    const landed = status?.currentBreaks ?? 0;
    let best: Gate | null = null;
    let bestDistance = Infinity;
    for (const gate of gates) {
      const plan = gate.realmPlan;
      const bossStrike = plan?.verb === "current-break" && plan.sequence <= landed;
      const minionStrike = plan?.verb === "minion-assault" &&
        elapsedSec - (status?.lastEnemyHitSec ?? Number.NEGATIVE_INFINITY) <= 2.4;
      if (!bossStrike && !minionStrike) continue;
      const distanceAhead = gate.distance - forwardDistance;
      if (distanceAhead > 10 || distanceAhead < -42) continue;
      const score = Math.abs(distanceAhead + 10);
      if (score < bestDistance) {
        best = gate;
        bestDistance = score;
      }
    }
    return best;
  }

  private lockAttackTarget(
    activeAttack: Gate | null,
    playerLateral: number,
    status: Readonly<DuskmawRunStatus> | null,
  ): void {
    if (!activeAttack) {
      this.attackLockKey = "";
      return;
    }
    const key = `${activeAttack.distance.toFixed(3)}:${activeAttack.realmPlan?.verb ?? "none"}`;
    const authoritativeTarget = status?.attackGateDistance !== null &&
      status?.attackGateDistance !== undefined &&
      status.attackTargetLateral !== null &&
      Math.abs(status.attackGateDistance - activeAttack.distance) < 1e-4
      ? status.attackTargetLateral
      : playerLateral;
    if (
      key === this.attackLockKey &&
      Math.abs(this.lockedAttackLateral - authoritativeTarget) < 1e-4
    ) return;
    this.attackLockKey = key;
    this.lockedAttackLateral = THREE.MathUtils.clamp(
      authoritativeTarget,
      -this.cfg.lane.halfWidth + 1.2,
      this.cfg.lane.halfWidth - 1.2,
    );
  }

  private positionAttackTarget(
    activeAttack: Gate,
    forwardDistance: number,
    target: THREE.Vector3,
  ): THREE.Vector3 {
    const plan = activeAttack.realmPlan;
    if (plan?.verb === "ruins-collapse") {
      return target.set(
        plan.collapseSide * Math.min(this.cfg.lane.halfWidth - 1.4, 4.6),
        4.25,
        -activeAttack.distance,
      );
    }
    return target.set(
      this.lockedAttackLateral,
      0.62,
      -forwardDistance + 0.6,
    );
  }

  update(
    realmId: RealmId,
    forwardDistance: number,
    playerLateral: number,
    elapsedSec: number,
    gates: readonly Gate[],
    status: Readonly<DuskmawRunStatus> | null,
    reducedMotion: boolean,
  ): void {
    const active = realmId === "leviathan-graveyard";
    this.group.visible = active;
    if (!active) return;
    if (elapsedSec < this.lastElapsedSec) {
      this.awakeningStartedSec = -1;
      this.moonPartnerLateral = 0;
      this.lastMoonFollowSec = elapsedSec;
    }
    const activeAttack = this.nearestActiveAttack(forwardDistance, gates);
    const activeMinionGate = this.nearestActiveMinionGate(forwardDistance, gates, status);
    const counterStrike = this.nearestSuccessfulCounterStrike(
      forwardDistance,
      gates,
      status,
      elapsedSec,
    );
    this.lockAttackTarget(activeAttack ?? activeMinionGate, playerLateral, status);
    this.updateScenery(forwardDistance, elapsedSec, reducedMotion);
    this.updateEncounterObjects(forwardDistance, elapsedSec, gates, status, reducedMotion);
    this.updatePrison(forwardDistance, elapsedSec, status, reducedMotion);
    this.updateMinion(forwardDistance, playerLateral, elapsedSec, activeMinionGate, status, reducedMotion);
    this.updateDuskmaw(forwardDistance, elapsedSec, status, reducedMotion, activeAttack, counterStrike);
    this.updateDuskmawRegeneration(elapsedSec, status, reducedMotion);
    const activeMinionDefeated = (status?.activeMinionRequiredHits ?? 0) > 0 &&
      (status?.activeMinionHits ?? 0) >= (status?.activeMinionRequiredHits ?? 0);
    if (activeMinionGate && !activeMinionDefeated) {
      this.updateMinionMouthAttack(forwardDistance, elapsedSec, activeMinionGate, reducedMotion);
    } else {
      this.updateMouthAttack(forwardDistance, elapsedSec, activeAttack, reducedMotion);
    }
    this.updateMoonLeviathan(forwardDistance, playerLateral, elapsedSec, status, reducedMotion);
    this.updateCounterStrike(forwardDistance, playerLateral, elapsedSec, counterStrike, status, reducedMotion);
    this.updateHeartlightBond(forwardDistance, playerLateral, elapsedSec, status, reducedMotion);
    this.updateGuardianFinale(forwardDistance, elapsedSec, status, reducedMotion);
    this.updateRecovery(forwardDistance, playerLateral, elapsedSec, status, reducedMotion);
    this.updatePlayerHit(forwardDistance, playerLateral, elapsedSec, status, reducedMotion);
    this.updateGrandDefeat(
      forwardDistance,
      playerLateral,
      elapsedSec,
      status,
      reducedMotion,
    );
    this.updateDust(forwardDistance, elapsedSec, status, reducedMotion);
  }

  private updateScenery(
    forwardDistance: number,
    elapsedSec: number,
    reducedMotion: boolean,
  ): void {
    let cliffCount = 0;
    let ribCount = 0;
    let vertebraCount = 0;
    let sanctumCount = 0;
    let fossilCount = 0;
    let beamCount = 0;
    let fishCount = 0;
    const firstBand = Math.floor((forwardDistance - 30) / SCENERY_SPACING);
    const motion = reducedMotion ? 0 : 1;

    for (let offset = 0; offset < MAX_CLIFF_SEGMENTS / 2; offset += 1) {
      const band = firstBand + offset;
      const z = -(band * SCENERY_SPACING);
      for (const side of [-1, 1] as const) {
        const wallX = side * (this.cfg.lane.halfWidth + 10.2);
        this.dummy.position.set(wallX, 3.8, z);
        this.dummy.rotation.set(
          (hash01(band, 3101 + side) - 0.5) * 0.025,
          side * (0.015 + hash01(band, 3119 + side) * 0.022),
          side * (hash01(band, 3137 + side) - 0.5) * 0.035,
        );
        this.dummy.scale.set(1, 0.92 + hash01(band, 3163 + side) * 0.16, 1.04);
        this.setInstance(this.cliffs, cliffCount, side > 0 ? 0x3b5660 : 0x304851);
        cliffCount += 1;

        if (ribCount < MAX_RIB_BUTTRESSES) {
          this.dummy.position.set(
            side * (this.cfg.lane.halfWidth + 5.35),
            -1.02,
            z - 5 - hash01(band, 3181 + side) * 9,
          );
          this.dummy.rotation.set(0, side > 0 ? Math.PI : 0, side * 0.025);
          const scale = 0.9 + hash01(band, 3203 + side) * 0.24;
          this.dummy.scale.setScalar(scale);
          this.setInstance(this.ribs, ribCount, band % 4 === 0 ? 0xd6c39c : 0xb8a985);
          ribCount += 1;
        }

        if (band % 4 === 0 && sanctumCount < MAX_SANCTUM_FACADES) {
          this.dummy.position.set(
            side * (this.cfg.lane.halfWidth + 5.25),
            -1.02,
            z - 28 - side * 2.5,
          );
          this.dummy.rotation.set(0, side * 0.22, side * 0.018);
          this.dummy.scale.setScalar(0.86 + hash01(band, 3221 + side) * 0.16);
          this.setInstance(this.sanctums, sanctumCount, side > 0 ? 0x49616a : 0x405962);
          sanctumCount += 1;
        }

        if (band % 2 === 0 && fossilCount < MAX_FOSSIL_BEDS) {
          this.dummy.position.set(
            side * (this.cfg.lane.halfWidth + 3.9),
            -0.68,
            z - 20 - side * 3,
          );
          this.dummy.rotation.set(-0.16, side > 0 ? -0.72 : 0.72, side * 0.08);
          this.dummy.scale.setScalar(0.78 + hash01(band, 3241 + side) * 0.22);
          this.setInstance(this.fossilBeds, fossilCount, 0xc2b18e);
          fossilCount += 1;
        }

        if (band % 2 === 0 && beamCount < MAX_MOONBEAMS) {
          this.dummy.position.set(side * (this.cfg.lane.halfWidth + 2.6), 6.7, z - 9);
          this.dummy.rotation.set(0, 0, side * (0.16 + Math.sin(elapsedSec * 0.14 + band) * 0.018 * motion));
          this.dummy.scale.set(1.1, 1.2, 1);
          this.setInstance(this.moonbeams, beamCount, side > 0 ? 0x8bd8e8 : 0xa7e8f4);
          beamCount += 1;
        }

        for (let fish = 0; fish < 2 && fishCount < MAX_LANTERNFISH; fish += 1) {
          const salt = band * 7 + fish + (side > 0 ? 101 : 0);
          this.dummy.position.set(
            side * (this.cfg.lane.halfWidth + 4.2 + hash01(salt, 3301) * 3.5),
            1.1 + hash01(salt, 3313) * 5.4 + Math.sin(elapsedSec * 0.38 + salt) * 0.12 * motion,
            z - 8 - fish * 8.5,
          );
          this.dummy.rotation.set(0, side > 0 ? -0.46 : 0.46, side * 0.035);
          this.dummy.scale.setScalar(0.4 + hash01(salt, 3331) * 0.22);
          this.setInstance(this.lanternfish, fishCount, fish % 2 === 0 ? 0x8deff2 : 0xb2fff2);
          fishCount += 1;
        }
      }

      if (band % 2 === 0) {
        const side = band % 2 === 0 ? -1 : 1;
        for (let bone = 0; bone < 3 && vertebraCount < MAX_WALL_VERTEBRAE; bone += 1) {
          this.dummy.position.set(
            side * (this.cfg.lane.halfWidth + 5.15),
            2.15 + bone * 0.18,
            z - 12 - bone * 4.2,
          );
          this.dummy.rotation.set(0.08 * bone, side * 0.18, side * (-0.08 + bone * 0.06));
          this.dummy.scale.setScalar(0.58 + bone * 0.05);
          this.setInstance(this.vertebrae, vertebraCount, bone === 1 ? 0xd4c29d : 0xb9aa89);
          vertebraCount += 1;
        }
      }
    }
    this.finish(this.cliffs, cliffCount);
    this.finish(this.ribs, ribCount);
    this.finish(this.vertebrae, vertebraCount);
    this.finish(this.sanctums, sanctumCount);
    this.finish(this.fossilBeds, fossilCount);
    this.finish(this.moonbeams, beamCount);
    this.finish(this.lanternfish, fishCount);
  }

  private updateEncounterObjects(
    forwardDistance: number,
    elapsedSec: number,
    gates: readonly Gate[],
    status: Readonly<DuskmawRunStatus> | null,
    reducedMotion: boolean,
  ): void {
    let buttressCount = 0;
    let collapseCount = 0;
    let portalCount = 0;
    let lumenCount = 0;
    let sealCount = 0;
    let wakeCount = 0;
    let arrowCount = 0;
    const near = forwardDistance + 0.75;
    const far = forwardDistance + this.cfg.readability.visibleAheadUnits * 1.62;

    for (const gate of gates) {
      if (gate.distance < near) continue;
      if (gate.distance > far) break;
      const plan = gate.realmPlan;
      const walls = gateWallSegmentsAt(gate, this.cfg.lane.halfWidth, elapsedSec);
      const directMouthfire = plan?.verb === "minion-assault" ||
        plan?.verb === "shadow-sweep" || plan?.verb === "vacuum-wake";
      if (!directMouthfire) {
        for (const wall of walls) {
          if (buttressCount >= MAX_ROUTE_BUTTRESSES) break;
          this.dummy.position.set(wall.centreX, -0.5, -gate.distance);
          this.dummy.rotation.set(0, wall.side === "left" ? 0.06 : -0.06, 0);
          this.dummy.scale.set(Math.max(0.1, wall.width * 0.5), 0.72, 1.12);
          const colour = plan?.verb === "current-break"
            ? 0x547f86
            : plan?.verb === "moon-seal"
              ? 0x728e8b
              : plan?.verb === "ruins-collapse"
                ? 0x675b53
                : 0x425d65;
          this.setInstance(this.routeButtresses, buttressCount, colour);
          buttressCount += 1;
        }
      }

      const lockMatchesGate = directMouthfire &&
        status?.attackGateDistance !== null &&
        status?.attackGateDistance !== undefined &&
        status.attackTargetLateral !== null &&
        Math.abs(status.attackGateDistance - gate.distance) < 1e-4;
      const centre = lockMatchesGate
        ? duskmawDodgeLateral(status?.attackTargetLateral ?? 0, this.cfg.lane.halfWidth)
        : (gate.gapLeft + gate.gapRight) * 0.5;
      const distanceAhead = gate.distance - forwardDistance;
      if (plan?.verb === "current-break" && portalCount < MAX_CURRENT_PORTALS) {
        const pulse = reducedMotion ? 1 : 1 + Math.sin(elapsedSec * 3.2 + plan.sequence) * 0.05;
        this.dummy.position.set(centre, 1.72, -gate.distance + 0.7);
        this.dummy.rotation.set(0, 0, reducedMotion ? 0 : elapsedSec * 0.2 + plan.sequence * 0.34);
        this.dummy.scale.setScalar(1.08 * pulse);
        this.setInstance(this.currentPortals, portalCount, 0xbdfcff);
        this.dummy.scale.setScalar(2.08 * pulse);
        this.setInstance(this.portalMembranes, portalCount, 0x60dce8);
        portalCount += 1;
      } else if (plan?.verb === "lumen-bloom" && lumenCount < MAX_LUMEN_BLOOMS) {
        const pulse = reducedMotion ? 1 : 0.92 + Math.sin(elapsedSec * 5.2 + plan.recoveryId) * 0.08;
        this.dummy.position.set(centre, 1.25, -gate.distance + 0.6);
        this.dummy.rotation.set(0, elapsedSec * (reducedMotion ? 0 : 0.45), elapsedSec * (reducedMotion ? 0 : 0.18));
        this.dummy.scale.setScalar((0.82 + plan.recoveryId * 0.025) * pulse);
        this.setInstance(this.lumenBlooms, lumenCount, 0xbfffd1);
        lumenCount += 1;
      } else if (plan?.verb === "moon-seal" && sealCount < MAX_MOON_SEALS) {
        const unlocked = (status?.currentBreaks ?? 0) >= (status?.currentBreakTarget ?? 3);
        this.dummy.position.set(centre, 1.92, -gate.distance + 0.84);
        this.dummy.rotation.set(0, 0, reducedMotion ? 0 : Math.sin(elapsedSec * 0.34) * 0.02);
        this.dummy.scale.setScalar(0.88);
        this.setInstance(this.moonSeals, sealCount, unlocked ? 0xf4ffe3 : 0x71678a);
        this.dummy.scale.setScalar(1.28);
        this.setInstance(this.sealMembranes, sealCount, unlocked ? 0x92f5f4 : 0x3d355d);
        sealCount += 1;
      } else if (plan?.verb === "vacuum-wake") {
        for (let spiral = 0; spiral < 3 && wakeCount < MAX_WAKE_SPIRALS; spiral += 1) {
          this.dummy.position.set(
            centre + plan.lateralDriftPerSec * (0.38 + spiral * 0.1),
            1.25 + spiral * 0.32,
            -gate.distance + 8 + spiral * 6.4,
          );
          this.dummy.rotation.set(0, 0, (reducedMotion ? 0 : -elapsedSec * 0.78) + spiral * 0.9);
          this.dummy.scale.setScalar(0.92 + spiral * 0.32);
          this.setInstance(this.wakeSpirals, wakeCount, spiral === 0 ? 0x9d83e9 : 0x6fdae4);
          wakeCount += 1;
        }
      } else if (plan?.verb === "ruins-collapse") {
        const fall = smootherStep((62 - distanceAhead) / 54);
        for (const wall of walls) {
          for (let slab = 0; slab < 6 && collapseCount < MAX_COLLAPSE_SLABS; slab += 1) {
            const salt = Math.round(gate.distance * 10) + collapseCount * 7 + slab;
            const acrossWall = (slab - 2.5) * Math.min(1.28, wall.width * 0.16);
            this.dummy.position.set(
              wall.centreX + acrossWall + (wall.side === "left" ? 1 : -1) * fall * 0.7,
              10.4 + slab * 0.38 - fall * (10.2 + slab * 0.32),
              -gate.distance + (slab - 2) * 1.28,
            );
            this.dummy.rotation.set(
              hash01(salt, 5221) * 0.42 + fall * 1.2,
              hash01(salt, 5239) * Math.PI + fall * 0.7,
              hash01(salt, 5257) * 0.5 + fall * 1.45 * (wall.side === "left" ? -1 : 1),
            );
            const scale = 0.58 + hash01(salt, 5277) * 0.34;
            this.dummy.scale.set(scale * 2.05, scale * 0.72, scale * 1.34);
            this.setInstance(
              this.collapseSlabs,
              collapseCount,
              fall < 0.2 ? 0xd3a66c : fall < 0.86 ? 0xb1784f : 0x53666b,
            );
            collapseCount += 1;
          }
        }
      }

      const routePlan = plan?.verb === "guided-rescue-current" ||
        plan?.verb === "minion-assault" || plan?.verb === "lumen-bloom" ||
        plan?.verb === "shadow-sweep" || plan?.verb === "vacuum-wake" ||
        plan?.verb === "ruins-collapse" || plan?.verb === "current-break" ||
        plan?.verb === "moonbone-vault" || plan?.verb === "moon-seal";
      if (routePlan) {
        for (let arrow = 0; arrow < 3 && arrowCount < MAX_SAFE_ROUTE_ARROWS; arrow += 1) {
          this.dummy.position.set(centre, -1.002, -gate.distance + 7 + arrow * 8.5);
          this.dummy.rotation.set(0, 0, 0);
          this.dummy.scale.set(0.76 + arrow * 0.06, 0.76 + arrow * 0.06, 0.76 + arrow * 0.06);
          this.setInstance(
            this.safeRouteArrows,
            arrowCount,
            plan?.verb === "moon-seal" ? 0xeaffc7 : 0x91ffff,
          );
          arrowCount += 1;
        }
      }
    }
    this.finish(this.routeButtresses, buttressCount);
    this.finish(this.collapseSlabs, collapseCount);
    this.finish(this.currentPortals, portalCount);
    this.finish(this.portalMembranes, portalCount);
    this.finish(this.lumenBlooms, lumenCount);
    this.finish(this.moonSeals, sealCount);
    this.finish(this.sealMembranes, sealCount);
    this.finish(this.wakeSpirals, wakeCount);
    this.finish(this.safeRouteArrows, arrowCount);
  }

  private updateMinion(
    forwardDistance: number,
    playerLateral: number,
    elapsedSec: number,
    activeGate: Gate | null,
    status: Readonly<DuskmawRunStatus> | null,
    reducedMotion: boolean,
  ): void {
    const tier = status?.activeMinionTier;
    const visible = tier !== null && tier !== undefined && status?.activeMinionId !== null;
    this.shadowBrood.group.visible = visible;
    this.minionWeakPoint.visible = visible;
    if (!visible || !tier) return;

    this.activeMinionTier = tier;
    const centre = activeGate
      ? (activeGate.gapLeft + activeGate.gapRight) * 0.5
      : Math.sin(elapsedSec * 0.48) * 2.2;
    const motion = reducedMotion ? 0 : 1;
    const weave = Math.sin(elapsedSec * (0.68 + tier * 0.08)) * (0.34 + tier * 0.12) * motion;
    const x = THREE.MathUtils.clamp(centre + weave, -4.6, 4.6);
    const y = 2.35 + tier * 0.62 + Math.sin(elapsedSec * 1.1) * 0.13 * motion;
    const ahead = 22 + tier * 2.8;
    const attackPose = activeGate
      ? duskmawMouthAttackPose(activeGate.distance - forwardDistance)
      : { turn: 0, charge: 0, fire: 0, impact: 0 };
    const required = Math.max(1, status?.activeMinionRequiredHits ?? tier);
    const hits = status?.activeMinionHits ?? 0;
    const defeated = hits >= required;
    const defeatAge = elapsedSec - (status?.lastMinionDefeatSec ?? Number.NEGATIVE_INFINITY);
    const defeat = defeated && defeatAge >= 0 ? smootherStep(defeatAge / 1.25) : 0;
    this.shadowBrood.group.position.set(
      x,
      y + defeat * (tier === 2 ? 0.7 : 1.55),
      -(forwardDistance + ahead) + defeat * (tier === 2 ? 0.9 : 2.1),
    );
    const attackTargetZ = -forwardDistance + 0.6;
    const attackYaw = Math.atan2(
      -(attackTargetZ - this.shadowBrood.group.position.z),
      this.lockedAttackLateral - x,
    );
    const cruiseYaw = DUSKMAW_FORWARD_YAW_RAD + Math.sin(elapsedSec * 0.34) * 0.08 * motion;
    const facingYaw = lerpAngle(cruiseYaw, attackYaw, attackPose.turn * 0.94);
    this.shadowBrood.group.rotation.set(
      0.01 + defeat * (tier === 2 ? 0.18 : 0.32),
      facingYaw + defeat * 0.24 * motion,
      THREE.MathUtils.clamp((playerLateral - x) * -0.025, -0.13, 0.13) +
        defeat * (tier === 2 ? 0.48 : 0.82) * motion,
    );
    const baseScale = tier === 1 ? 0.98 : tier === 2 ? 1.02 : 0.88;
    this.shadowBrood.group.scale.setScalar(baseScale * (1 - defeat * 0.68));
    const recentHit = elapsedSec - (status?.lastEnemyHitSec ?? Number.NEGATIVE_INFINITY);
    const flash = recentHit >= 0 && recentHit < 0.9
      ? 1 - smootherStep(recentHit / 0.9)
      : 0;
    this.shadowBrood.update({
      tier,
      elapsedSec,
      reducedMotion,
      damageFraction: Math.max(hits / required, flash * 0.18),
      attackCharge: defeated ? 0 : attackPose.charge,
      defeatProgress: defeat,
      hitFlash: flash,
    });
    this.shadowBrood.headWorldPosition(this.minionTarget);
    this.minionTarget.y += 0.25;
    this.minionWeakPoint.position.copy(this.minionTarget);
    const weakPulse = reducedMotion ? 1 : 0.88 + Math.sin(elapsedSec * 7.2) * 0.12;
    this.minionWeakPoint.scale.setScalar((0.32 + tier * 0.1) * weakPulse * (1 - defeat));
  }

  private updateMinionMouthAttack(
    forwardDistance: number,
    elapsedSec: number,
    activeGate: Gate,
    reducedMotion: boolean,
  ): void {
    const distanceAhead = activeGate.distance - forwardDistance;
    const pose = duskmawMouthAttackPose(distanceAhead);
    const plan = activeGate.realmPlan;
    const tier = plan?.verb === "minion-assault" ? plan.minionTier : this.activeMinionTier;
    const attackColour = tier === 1 ? 0xb877ff : tier === 2 ? 0xff8b62 : 0xff526f;
    this.finish(this.struckArches, 0);
    this.shadowBrood.mouthWorldPosition(this.mouthWorld);
    this.attackTarget.set(this.lockedAttackLateral, 0.62, -forwardDistance + 0.6);

    this.dummy.position.set(this.lockedAttackLateral, -0.92, -forwardDistance - 3.5);
    this.dummy.rotation.set(0, 0, 0);
    this.dummy.scale.set(0.62, 0.62, 0.62);
    this.setInstance(this.dangerVeils, 0, pose.turn > 0.24 ? attackColour : 0x6c7f84);
    this.finish(this.dangerVeils, pose.turn > 0.1 ? 1 : 0);

    this.dummy.position.copy(this.mouthWorld);
    this.dummy.rotation.set(0, 0, 0);
    const chargePulse = reducedMotion ? 1 : 0.9 + Math.sin(elapsedSec * 11) * 0.1;
    this.dummy.scale.setScalar((0.26 + pose.charge * (0.54 + tier * 0.08)) * chargePulse);
    this.setInstance(this.mouthCharges, 0, attackColour);
    this.finish(this.mouthCharges, pose.charge > 0.025 ? 1 : 0);

    let fireCount = 0;
    if (pose.fire > 0.025) {
      const segmentCount = 8;
      for (let segment = 0; segment < segmentCount; segment += 1) {
        const fromFraction = segment / segmentCount;
        const toFraction = (segment + 0.78) / segmentCount;
        const from = this.segmentMidpoint.copy(this.mouthWorld).lerp(this.attackTarget, fromFraction);
        const to = this.segmentEnd.copy(this.mouthWorld).lerp(this.attackTarget, toFraction);
        this.segmentVector.subVectors(to, from);
        const length = this.segmentVector.length();
        this.dummy.position.copy(from).addScaledVector(this.segmentVector, 0.5);
        this.dummy.quaternion.setFromUnitVectors(this.upAxis, this.segmentVector.normalize());
        const pulse = reducedMotion ? 1 : 0.9 + Math.sin(elapsedSec * 20 - segment) * 0.1;
        this.dummy.scale.set(pulse * (0.5 + tier * 0.1), length * pose.fire, pulse * (0.5 + tier * 0.1));
        this.setInstance(this.mouthfire, fireCount, attackColour);
        fireCount += 1;
      }
    }
    this.finish(this.mouthfire, fireCount);

    let burstCount = 0;
    if (pose.impact > 0.025) {
      for (let burst = 0; burst < 3; burst += 1) {
        this.dummy.position.copy(this.attackTarget);
        this.dummy.position.z += (burst - 1) * 0.3;
        this.dummy.rotation.set(0, 0, elapsedSec * 0.6 + burst * 0.9);
        this.dummy.scale.setScalar((0.58 + burst * 0.34) * (0.5 + pose.impact));
        this.setInstance(this.impactBursts, burstCount, burst === 0 ? 0xffffff : attackColour);
        burstCount += 1;
      }
    }
    this.finish(this.impactBursts, burstCount);
  }

  private updateDuskmaw(
    forwardDistance: number,
    elapsedSec: number,
    status: Readonly<DuskmawRunStatus> | null,
    reducedMotion: boolean,
    activeAttack: Gate | null,
    counterStrike: Gate | null,
  ): void {
    const phase = status?.phase ?? "approach";
    const combatPhase = phase === "duskmaw-assault" ||
      phase === "shadow-sweep" || phase === "vacuum-wake" || phase === "ruins-collapse";
    const woundedEscape = phase === "heartlight-run" || phase === "vault-rescue" ||
      phase === "auralis-catchup";
    const moonlinkBattle = phase === "moonlink-battle";
    const defeatElapsed = phase === "complete" ? status?.phaseElapsedSec ?? 0 : -1;
    const dying = defeatElapsed >= 0 && defeatElapsed < 5.4;
    this.duskmaw.group.visible = combatPhase || woundedEscape || moonlinkBattle || dying;
    if (!this.duskmaw.group.visible) return;

    const cruise = duskmawPursuitMotion(elapsedSec, reducedMotion);
    const distanceAhead = activeAttack ? activeAttack.distance - forwardDistance : Infinity;
    const attackPose = activeAttack
      ? duskmawMouthAttackPose(distanceAhead)
      : { turn: 0, charge: 0, fire: 0, impact: 0 };
    const side = activeAttack ? attackSide(activeAttack) : 1;
    const moonlinkPose = moonlinkDuskmawMotion(
      status?.phaseElapsedSec ?? 0,
      status?.joinedStrikes ?? 0,
      reducedMotion,
    );
    const normalYaw = DUSKMAW_FORWARD_YAW_RAD + cruise.yawOffsetRad;
    const reveal = phase === "duskmaw-assault"
      ? smootherStep((status?.phaseElapsedSec ?? 0) / 3.4)
      : 1;
    const normalAhead = THREE.MathUtils.lerp(72, 34 + cruise.leadOffset, reveal);
    const normalX = THREE.MathUtils.lerp(0, cruise.lateral, reveal);
    const normalY = THREE.MathUtils.lerp(8.8, 5.15 + cruise.heightOffset, reveal);
    const attackX = -side * Math.min(this.cfg.lane.halfWidth - 0.9, 4.85);
    const attackY = 4.3 + side * 0.12;
    const attackAhead = 21.5;
    const woundedX = 4.7 + Math.sin(elapsedSec * 0.32) * 0.48;
    const woundedY = 4.15 + Math.sin(elapsedSec * 0.62) * 0.18;
    const woundedAhead = phase === "vault-rescue" ? 52 : phase === "auralis-catchup" ? 38 : 44;
    const defeatRupture = dying ? smootherStep((defeatElapsed - 0.8) / 2.8) : 0;
    const baseX = moonlinkBattle
      ? moonlinkPose.lateral
      : woundedEscape
        ? woundedX
        : dying
          ? THREE.MathUtils.lerp(0.8, -0.6, defeatRupture)
          : normalX;
    const baseY = moonlinkBattle
      ? moonlinkPose.height
      : woundedEscape
        ? woundedY
        : dying
          ? 4.55 - defeatRupture * 0.72
          : normalY;
    const baseAhead = moonlinkBattle
      ? moonlinkPose.lead
      : woundedEscape
        ? woundedAhead
        : dying
          ? 29.5 + defeatRupture * 2.2
          : normalAhead;
    const canTurnToAttack = activeAttack && (combatPhase || moonlinkBattle);
    const attackBlend = canTurnToAttack ? attackPose.turn : 0;
    const x = THREE.MathUtils.lerp(baseX, attackX, attackBlend);
    const y = THREE.MathUtils.lerp(baseY, attackY, attackBlend);
    const ahead = THREE.MathUtils.lerp(baseAhead, attackAhead, attackBlend);
    this.duskmaw.group.position.set(x, y, -(forwardDistance + ahead));

    const pathYaw = moonlinkBattle
      ? DUSKMAW_FORWARD_YAW_RAD + moonlinkPose.yawOffsetRad
      : woundedEscape || dying
        ? DUSKMAW_FORWARD_YAW_RAD + Math.sin(elapsedSec * 0.28) * 0.08
        : normalYaw;
    let attackYaw = pathYaw;
    if (canTurnToAttack) {
      this.positionAttackTarget(activeAttack, forwardDistance, this.attackTarget);
      const dx = this.attackTarget.x - x;
      const dz = this.attackTarget.z - this.duskmaw.group.position.z;
      attackYaw = Math.atan2(-dz, dx);
    }
    const yaw = lerpAngle(pathYaw, attackYaw, attackBlend);
    const pathBank = moonlinkBattle
      ? moonlinkPose.bankRad
      : woundedEscape
        ? Math.sin(elapsedSec * 0.54) * 0.045
        : dying
          ? defeatRupture * 0.42
          : cruise.bankRad;
    this.duskmaw.group.rotation.set(
      0.015 + attackPose.turn * 0.035,
      yaw,
      THREE.MathUtils.lerp(pathBank, side * 0.14, attackBlend),
    );
    const scale = dying
      ? 0.78
      : moonlinkBattle
        ? 0.78
        : woundedEscape
          ? 0.72
          : THREE.MathUtils.lerp(0.16, 0.82, reveal);
    this.duskmaw.group.scale.setScalar(scale);

    const bossCounterStrike = counterStrike?.realmPlan?.verb === "current-break"
      ? counterStrike
      : null;
    const counterDistance = bossCounterStrike ? bossCounterStrike.distance - forwardDistance : Infinity;
    const counterPose = bossCounterStrike
      ? glowfinCounterStrikePose(counterDistance)
      : { charge: 0, fire: 0, impact: 0 };
    const armourDamage = 1 - (status?.bossHealth ?? 22) / Math.max(1, status?.bossMaxHealth ?? 22);
    const regenerationAge = elapsedSec - (status?.lastRegenerationSec ?? Number.NEGATIVE_INFINITY);
    const regenerationFlash = regenerationAge >= 0 && regenerationAge < 1.9
      ? 1 - smootherStep(regenerationAge / 1.9)
      : 0;
    const enemyHitAge = elapsedSec - (status?.lastEnemyHitSec ?? Number.NEGATIVE_INFINITY);
    const enemyHitFlash = enemyHitAge >= 0 && enemyHitAge < 0.9
      ? 1 - smootherStep(enemyHitAge / 0.9)
      : 0;
    this.duskmaw.update({
      elapsedSec,
      reducedMotion,
      intensity: 0.34 + (1 - reveal) * 0.46 + attackPose.charge * 0.5 + attackPose.fire * 0.35,
      jawOpen: dying
        ? Math.max(0, 0.28 - defeatRupture * 0.22)
        : 0.08 + attackPose.charge * 0.58 + attackPose.fire * 0.3,
      finStroke: Math.sin(elapsedSec * 1.22),
      awakening: 1,
      armourDamage,
      damageFlash: Math.max(
        counterPose.impact,
        enemyHitFlash,
        regenerationFlash * 0.48,
        dying ? 1 - defeatRupture * 0.74 : 0,
      ),
    });
  }

  private updateDuskmawRegeneration(
    elapsedSec: number,
    status: Readonly<DuskmawRunStatus> | null,
    reducedMotion: boolean,
  ): void {
    const age = elapsedSec - (status?.lastRegenerationSec ?? Number.NEGATIVE_INFINITY);
    if (age < 0 || age >= 2.15 || !this.duskmaw.group.visible) {
      this.finish(this.regenerationWisps, 0);
      return;
    }
    const pull = smootherStep(age / 1.9);
    const radius = THREE.MathUtils.lerp(6.4, 0.45, pull);
    const motion = reducedMotion ? 0 : 1;
    for (let fragment = 0; fragment < MAX_REGENERATION_WISPS; fragment += 1) {
      const angle = fragment / MAX_REGENERATION_WISPS * Math.PI * 2 + age * 2.2 * motion;
      const elevation = ((fragment % 4) - 1.5) * 0.72;
      this.dummy.position.set(
        this.duskmaw.group.position.x + Math.cos(angle) * radius,
        this.duskmaw.group.position.y + elevation * (1 - pull) + Math.sin(angle * 1.7) * 0.55,
        this.duskmaw.group.position.z + Math.sin(angle) * radius * 0.72,
      );
      this.dummy.rotation.set(
        age * (0.9 + fragment * 0.04) * motion,
        -angle,
        age * 1.35 * motion,
      );
      const pulse = reducedMotion ? 1 : 0.82 + Math.sin(elapsedSec * 11 + fragment) * 0.18;
      this.dummy.scale.setScalar((0.2 + (1 - pull) * 0.18) * pulse);
      this.setInstance(
        this.regenerationWisps,
        fragment,
        fragment % 3 === 0 ? 0xff5ad9 : 0x835cff,
      );
    }
    this.finish(this.regenerationWisps, MAX_REGENERATION_WISPS);
  }

  private updateMouthAttack(
    forwardDistance: number,
    elapsedSec: number,
    activeAttack: Gate | null,
    reducedMotion: boolean,
  ): void {
    if (!activeAttack || !this.duskmaw.group.visible) {
      this.finish(this.struckArches, 0);
      this.finish(this.mouthCharges, 0);
      this.finish(this.mouthfire, 0);
      this.finish(this.impactBursts, 0);
      this.finish(this.dangerVeils, 0);
      return;
    }
    const distanceAhead = activeAttack.distance - forwardDistance;
    const pose = duskmawMouthAttackPose(distanceAhead);
    const side = attackSide(activeAttack);
    const plan = activeAttack.realmPlan;
    const attackColour = plan?.verb === "vacuum-wake"
      ? 0xc59cff
      : plan?.verb === "ruins-collapse"
        ? 0xffbb68
        : 0xff8c58;

    this.duskmaw.mouthWorldPosition(this.mouthWorld);
    this.positionAttackTarget(activeAttack, forwardDistance, this.attackTarget);

    const strikesRuin = plan?.verb === "ruins-collapse";
    if (strikesRuin) {
      this.dummy.position.set(
        side * Math.min(this.cfg.lane.halfWidth - 1.1, 4.9),
        -1.03,
        -activeAttack.distance,
      );
      this.dummy.rotation.set(0, side * 0.2, side * 0.025);
      this.dummy.scale.setScalar(0.66 + pose.impact * 0.05);
      this.setInstance(this.struckArches, 0, pose.impact > 0.08 ? 0xd99b59 : 0x6e8583);
    }
    this.finish(this.struckArches, strikesRuin ? 1 : 0);

    this.dummy.position.set(
      strikesRuin ? this.attackTarget.x : this.lockedAttackLateral,
      -0.92,
      strikesRuin ? -activeAttack.distance + 4 : -forwardDistance - 3.5,
    );
    this.dummy.rotation.set(0, 0, 0);
    this.dummy.scale.set(0.55, 0.55, 0.55);
    this.setInstance(this.dangerVeils, 0, pose.turn > 0.28 ? attackColour : 0x6c7f84);
    this.finish(this.dangerVeils, pose.turn > 0.12 ? 1 : 0);

    const chargeScale = 0.35 + pose.charge * (reducedMotion ? 0.7 : 0.78 + Math.sin(elapsedSec * 9) * 0.08);
    this.dummy.position.copy(this.mouthWorld);
    this.dummy.rotation.set(0, 0, 0);
    this.dummy.scale.setScalar(chargeScale);
    this.setInstance(this.mouthCharges, 0, attackColour);
    this.finish(this.mouthCharges, pose.charge > 0.03 ? 1 : 0);

    let fireCount = 0;
    if (pose.fire > 0.025) {
      const segmentCount = 8;
      for (let segment = 0; segment < segmentCount; segment += 1) {
        const fromFraction = segment / segmentCount;
        const toFraction = (segment + 0.78) / segmentCount;
        const from = this.segmentMidpoint.copy(this.mouthWorld).lerp(this.attackTarget, fromFraction);
        const to = this.segmentEnd.copy(this.mouthWorld).lerp(this.attackTarget, toFraction);
        this.segmentVector.subVectors(to, from);
        const length = this.segmentVector.length();
        this.dummy.position.copy(from).addScaledVector(this.segmentVector, 0.5);
        this.dummy.quaternion.setFromUnitVectors(this.upAxis, this.segmentVector.normalize());
        const pulse = reducedMotion ? 1 : 0.92 + Math.sin(elapsedSec * 18 - segment) * 0.08;
        this.dummy.scale.set(pulse * (0.72 + fromFraction * 0.34), length * pose.fire, pulse * (0.72 + fromFraction * 0.34));
        this.setInstance(this.mouthfire, fireCount, attackColour);
        fireCount += 1;
      }
    }
    this.finish(this.mouthfire, fireCount);

    let burstCount = 0;
    if (pose.impact > 0.025) {
      for (let burst = 0; burst < 3; burst += 1) {
        this.dummy.position.copy(this.attackTarget);
        this.dummy.position.z += (burst - 1) * 0.34;
        this.dummy.rotation.set(0, 0, elapsedSec * (reducedMotion ? 0 : 0.7) + burst * 0.8);
        this.dummy.scale.setScalar((0.7 + burst * 0.42) * (0.45 + pose.impact));
        this.setInstance(this.impactBursts, burstCount, burst === 0 ? 0xfff3b0 : attackColour);
        burstCount += 1;
      }
    }
    this.finish(this.impactBursts, burstCount);
  }

  private updateCounterStrike(
    forwardDistance: number,
    playerLateral: number,
    elapsedSec: number,
    counterStrike: Gate | null,
    status: Readonly<DuskmawRunStatus> | null,
    reducedMotion: boolean,
  ): void {
    const plan = counterStrike?.realmPlan;
    const minionStrike = plan?.verb === "minion-assault";
    const bossStrike = plan?.verb === "current-break";
    const targetVisible = minionStrike
      ? this.shadowBrood.group.visible
      : this.duskmaw.group.visible;
    if (!counterStrike || (!minionStrike && !bossStrike) || !targetVisible) {
      this.counterCharge.visible = false;
      this.finish(this.counterBolts, 0);
      this.finish(this.counterMotes, 0);
      this.finish(this.counterImpactRings, 0);
      this.finish(this.armourFragments, 0);
      return;
    }
    const distanceAhead = counterStrike.distance - forwardDistance;
    const pose = glowfinCounterStrikePose(distanceAhead);
    this.playerOrigin.set(playerLateral, 1.02, -forwardDistance + 0.15);
    if (minionStrike) {
      this.shadowBrood.headWorldPosition(this.counterTarget);
      this.counterTarget.lerp(this.shadowBrood.group.position, 0.24);
    } else {
      this.duskmaw.headWorldPosition(this.counterTarget);
      this.counterTarget.lerp(this.duskmaw.group.position, 0.42);
    }

    this.counterCharge.visible = pose.charge > 0.025;
    if (this.counterCharge.visible) {
      const pulse = reducedMotion ? 1 : 0.9 + Math.sin(elapsedSec * 11) * 0.1;
      this.counterCharge.position.copy(this.playerOrigin);
      this.counterCharge.position.y += 0.35;
      this.counterCharge.rotation.set(elapsedSec * 0.6, elapsedSec * 0.8, elapsedSec * 0.45);
      this.counterCharge.scale.set(
        (0.34 + pose.charge * 0.76) * pulse,
        (0.34 + pose.charge * 0.76) * pulse,
        (0.58 + pose.charge * 1.08) * pulse,
      );
    }

    let moteCount = 0;
    if (pose.charge > 0.025) {
      for (let mote = 0; mote < 6; mote += 1) {
        const angle = elapsedSec * (reducedMotion ? 0 : 4.8) + mote / 6 * Math.PI * 2;
        const radius = 0.5 + pose.charge * 0.44;
        this.dummy.position.set(
          this.playerOrigin.x + Math.cos(angle) * radius,
          this.playerOrigin.y + 0.35 + Math.sin(angle * 2) * 0.22,
          this.playerOrigin.z + Math.sin(angle) * radius,
        );
        this.dummy.rotation.set(angle, -angle * 0.5, angle * 0.7);
        const size = 0.11 + pose.charge * 0.09;
        this.dummy.scale.setScalar(size);
        this.setInstance(this.counterMotes, moteCount, mote % 2 === 0 ? 0xffffff : 0xffe49a);
        moteCount += 1;
      }
    }

    let boltCount = 0;
    if (pose.fire > 0.025) {
      const segmentCount = 12;
      const headProgress = smootherStep((3 - distanceAhead) / 19);
      const tailProgress = Math.max(0, headProgress - 0.48);
      for (let segment = 0; segment < segmentCount; segment += 1) {
        const fromFraction = THREE.MathUtils.lerp(tailProgress, headProgress, segment / segmentCount);
        const toFraction = THREE.MathUtils.lerp(tailProgress, headProgress, (segment + 0.82) / segmentCount);
        const from = this.segmentMidpoint.copy(this.playerOrigin).lerp(this.counterTarget, fromFraction);
        const to = this.segmentEnd.copy(this.playerOrigin).lerp(this.counterTarget, toFraction);
        this.segmentVector.subVectors(to, from);
        const length = this.segmentVector.length();
        this.dummy.position.copy(from).addScaledVector(this.segmentVector, 0.5);
        this.dummy.quaternion.setFromUnitVectors(this.upAxis, this.segmentVector.normalize());
        const pulse = reducedMotion ? 1 : 0.9 + Math.sin(elapsedSec * 24 + segment) * 0.1;
        const taper = 0.48 + (segment / segmentCount) * 0.72;
        this.dummy.scale.set(pulse * taper, length * pose.fire, pulse * taper);
        this.setInstance(
          this.counterBolts,
          boltCount,
          segment % 4 === 0 ? 0xffefad : segment % 2 === 0 ? 0xffffff : 0x62efff,
        );
        boltCount += 1;
      }
      for (let mote = 0; mote < 12 && moteCount < MAX_COUNTER_MOTES; mote += 1) {
        const fraction = THREE.MathUtils.lerp(tailProgress, headProgress, mote / 11);
        this.dummy.position.copy(this.playerOrigin).lerp(this.counterTarget, fraction);
        const angle = mote * 1.65 + elapsedSec * (reducedMotion ? 0 : 11);
        const radius = 0.16 + fraction * 0.2;
        this.dummy.position.x += Math.cos(angle) * radius;
        this.dummy.position.y += Math.sin(angle) * radius;
        this.dummy.rotation.set(angle, angle * 0.4, -angle * 0.3);
        this.dummy.scale.setScalar(0.09 + fraction * 0.07);
        this.setInstance(this.counterMotes, moteCount, mote % 3 === 0 ? 0xffdf82 : 0xc8ffff);
        moteCount += 1;
      }
    }
    this.finish(this.counterBolts, boltCount);
    this.finish(this.counterMotes, moteCount);

    let fragmentCount = 0;
    let impactRingCount = 0;
    if (pose.impact > 0.02) {
      const strikeNumber = plan?.verb === "current-break"
        ? plan.sequence
        : plan?.verb === "minion-assault"
          ? plan.hitIndex
          : 1;
      const tier = minionStrike && plan?.verb === "minion-assault"
        ? plan.minionTier
        : 4;
      for (let ring = 0; ring < 6; ring += 1) {
        const stagger = smootherStep((pose.impact * 1.4) - ring * 0.08);
        if (stagger <= 0) continue;
        this.dummy.position.copy(this.counterTarget);
        this.dummy.position.z += (ring - 2.5) * 0.12;
        this.dummy.rotation.set(
          Math.PI / 2 + (ring % 2) * 0.34,
          ring * 0.42,
          elapsedSec * (reducedMotion ? 0 : 1.4) + ring * 0.58,
        );
        this.dummy.scale.setScalar((0.58 + ring * 0.34 + tier * 0.08) * stagger);
        this.setInstance(
          this.counterImpactRings,
          impactRingCount,
          ring === 0 ? 0xffffff : ring % 2 === 0 ? 0xffdf8a : 0x59efff,
        );
        impactRingCount += 1;
      }
      const requestedFragments = minionStrike
        ? Math.min(MAX_ARMOUR_FRAGMENTS, 5 + (status?.activeMinionTier ?? 1) * 2)
        : MAX_ARMOUR_FRAGMENTS;
      for (let fragment = 0; fragment < requestedFragments; fragment += 1) {
        const angle = fragment / requestedFragments * Math.PI * 2 + strikeNumber * 0.7;
        const travel = pose.impact * (1.15 + (fragment % 5) * 0.3);
        this.fragmentOffset.set(
          Math.cos(angle) * travel,
          0.25 + Math.sin(angle) * travel * 0.64,
          ((fragment % 4) - 1.5) * 0.28 * travel,
        );
        this.dummy.position.copy(this.counterTarget).add(this.fragmentOffset);
        this.dummy.rotation.set(
          elapsedSec * (0.8 + fragment * 0.12),
          angle,
          elapsedSec * (0.55 + fragment * 0.08),
        );
        this.dummy.scale.setScalar(0.16 + (fragment % 4) * 0.035);
        this.setInstance(
          this.armourFragments,
          fragmentCount,
          fragment % 3 === 0 ? 0xffe3a0 : fragment % 2 === 0 ? 0xb7ffff : 0x4c7c91,
        );
        fragmentCount += 1;
      }
    }
    this.finish(this.counterImpactRings, impactRingCount);
    this.finish(this.armourFragments, fragmentCount);
  }

  private updatePrison(
    _forwardDistance: number,
    elapsedSec: number,
    status: Readonly<DuskmawRunStatus> | null,
    reducedMotion: boolean,
  ): void {
    const phase = status?.phase ?? "approach";
    const visible = phase === "heartlight-run" || phase === "vault-rescue" ||
      phase === "auralis-catchup" || phase === "moonlink-battle" || phase === "complete";
    if (!visible) {
      this.finish(this.prisonBars, 0);
      this.finish(this.prisonRibs, 0);
      this.finish(this.prisonShackles, 0);
      this.prisonAura.visible = false;
      this.vaultBlast.visible = false;
      return;
    }
    const open = phase === "vault-rescue"
      ? smootherStep(((status?.phaseElapsedSec ?? 0) - DUSKMAW_VAULT_HOLD_SEC * 0.25) /
          (DUSKMAW_VAULT_HOLD_SEC * 0.66))
      : phase === "auralis-catchup" || phase === "moonlink-battle" || phase === "complete"
        ? 1
        : 0;
    const cageDistance = status?.vaultWorldDistance;
    if (cageDistance === null || cageDistance === undefined) {
      this.finish(this.prisonBars, 0);
      this.finish(this.prisonRibs, 0);
      this.finish(this.prisonShackles, 0);
      this.prisonAura.visible = false;
      this.vaultBlast.visible = false;
      return;
    }
    const cageZ = -cageDistance;
    const motion = reducedMotion ? 0 : 1;

    let barCount = 0;
    for (let bar = 0; bar < 9 && barCount < MAX_PRISON_BARS; bar += 1) {
      const fraction = bar / 8;
      const baseX = THREE.MathUtils.lerp(-4.7, 4.7, fraction);
      const side = baseX === 0 ? (bar % 2 === 0 ? -1 : 1) : Math.sign(baseX);
      this.dummy.position.set(
        baseX + side * open * (1.5 + Math.abs(baseX) * 0.18),
        3.15 - open * (1.2 + (bar % 3) * 0.35),
        cageZ + 1.35 + open * (bar % 2 === 0 ? 0.8 : -0.5),
      );
      this.dummy.rotation.set(open * 0.18, 0, side * open * (0.42 + (bar % 3) * 0.08));
      this.dummy.scale.set(1, 7.5 * (1 - open * 0.42), 1);
      this.setInstance(this.prisonBars, barCount, open > 0.72 ? 0x7a8f8d : 0xd7c79f);
      barCount += 1;
    }
    for (const [index, y] of [0.05, 6.35].entries()) {
      this.dummy.position.set(
        (index === 0 ? -1 : 1) * open * 2.1,
        y - open * 0.9,
        cageZ + 1.35,
      );
      this.dummy.rotation.set(0, 0, Math.PI / 2 + (index === 0 ? -1 : 1) * open * 0.34);
      this.dummy.scale.set(1, 5.5 * (1 - open * 0.36), 1);
      this.setInstance(this.prisonBars, barCount, 0xcab98f);
      barCount += 1;
    }
    this.finish(this.prisonBars, barCount);

    let anchorCount = 0;
    for (let depth = 0; depth < 2; depth += 1) {
      for (const side of [-1, 1] as const) {
        this.dummy.position.set(
          side * (5.15 + open * 1.15),
          2.65 - open * 0.72,
          cageZ - 1.2 + depth * 3.0,
        );
        this.dummy.rotation.set(0, 0, side * (0.13 + open * 0.3));
        this.dummy.scale.set(1, 6.9 * (1 - open * 0.35), 1);
        this.setInstance(this.prisonRibs, anchorCount, 0xd5c49b);
        anchorCount += 1;
      }
      this.dummy.position.set(
        (depth === 0 ? -1 : 1) * open * 1.5,
        6.1 - open * 1.15,
        cageZ - 1.2 + depth * 3.0,
      );
      this.dummy.rotation.set(0, 0, Math.PI / 2 + (depth === 0 ? -1 : 1) * open * 0.22);
      this.dummy.scale.set(1, 5.3 * (1 - open * 0.3), 1);
      this.setInstance(this.prisonRibs, anchorCount, 0xcab98f);
      anchorCount += 1;
    }
    this.finish(this.prisonRibs, anchorCount);

    let shackleCount = 0;
    for (let shackle = 0; shackle < 3; shackle += 1) {
      const crack = smootherStep(open * 3 - shackle);
      this.dummy.position.set(
        (shackle - 1) * 2.65 + (shackle - 1) * crack * 1.4,
        2.7 + Math.sin(elapsedSec * 1.7 + shackle) * 0.08 * motion - crack * 1.1,
        cageZ + 0.85 + crack * (shackle % 2 === 0 ? 0.7 : -0.5),
      );
      this.dummy.rotation.set(0, 0, shackle * 0.36 + crack * (shackle - 1) * 0.8);
      this.dummy.scale.setScalar(1.0 - crack * 0.48);
      this.setInstance(this.prisonShackles, shackleCount, crack > 0.15 ? 0xffffff : 0x76d7e2);
      shackleCount += 1;
    }
    this.finish(this.prisonShackles, shackleCount);

    this.prisonAura.visible = open < 0.9;
    if (this.prisonAura.visible) {
      this.prisonAura.position.set(0, 3.05, cageZ);
      this.prisonAura.rotation.set(
        elapsedSec * 0.04 * motion,
        elapsedSec * 0.05 * motion,
        elapsedSec * 0.03 * motion,
      );
      this.prisonAura.scale.set(5.2 * (1 - open * 0.36), 3.8 * (1 - open * 0.22), 3.0);
    }
    const phaseElapsed = status?.phaseElapsedSec ?? 0;
    const blastIn = phase === "vault-rescue"
      ? smootherStep((phaseElapsed - DUSKMAW_VAULT_HOLD_SEC * 0.6) /
          (DUSKMAW_VAULT_HOLD_SEC * 0.2))
      : 0;
    const blastOut = phase === "vault-rescue"
      ? smootherStep((DUSKMAW_VAULT_HOLD_SEC - phaseElapsed) /
          (DUSKMAW_VAULT_HOLD_SEC * 0.16))
      : 0;
    const blast = Math.min(blastIn, blastOut);
    this.vaultBlast.visible = blast > 0.02;
    if (this.vaultBlast.visible) {
      this.vaultBlast.position.set(0, 3.1, cageZ);
      this.vaultBlast.rotation.set(elapsedSec * 0.32, elapsedSec * 0.46, elapsedSec * 0.27);
      this.vaultBlast.scale.setScalar(0.7 + blast * 5.8);
    }
  }

  private updateGuardianFinale(
    forwardDistance: number,
    elapsedSec: number,
    status: Readonly<DuskmawRunStatus> | null,
    reducedMotion: boolean,
  ): void {
    const phase = status?.phase ?? "approach";
    let beamCount = 0;
    const strikeAge = elapsedSec - (status?.lastEnemyHitSec ?? Number.NEGATIVE_INFINITY);
    const joinedStrike = phase === "moonlink-battle" && strikeAge >= 0 && strikeAge < 1.65;
    const victoryStrike = phase === "complete" && (status?.phaseElapsedSec ?? 0) < 3.45;
    const joinedAttack = joinedStrike || victoryStrike;
    if (joinedAttack && this.moonLeviathan.group.visible && this.duskmaw.group.visible) {
      this.moonLeviathan.mouthWorldPosition(this.moonMouthWorld);
      this.duskmaw.headWorldPosition(this.duskHeadWorld);
      const segmentCount = 10;
      for (let segment = 0; segment < segmentCount; segment += 1) {
        const fromFraction = segment / segmentCount;
        const toFraction = (segment + 0.82) / segmentCount;
        const from = this.segmentMidpoint.copy(this.moonMouthWorld).lerp(this.duskHeadWorld, fromFraction);
        const to = this.segmentEnd.copy(this.moonMouthWorld).lerp(this.duskHeadWorld, toFraction);
        this.segmentVector.subVectors(to, from);
        const length = this.segmentVector.length();
        this.dummy.position.copy(from).addScaledVector(this.segmentVector, 0.5);
        this.dummy.quaternion.setFromUnitVectors(this.upAxis, this.segmentVector.normalize());
        const strikeEnvelope = victoryStrike
          ? 0.9 + smootherStep((status?.phaseElapsedSec ?? 0) / 0.55) * 0.34
          : 0.62 + (1 - smootherStep(strikeAge / 1.65)) * 0.74;
        const pulse = reducedMotion ? 1 : 0.86 + Math.sin(elapsedSec * 18 + segment) * 0.14;
        this.dummy.scale.set(0.82 * pulse * strikeEnvelope, length, 0.82 * pulse * strikeEnvelope);
        this.setInstance(this.guardianBeam, beamCount, segment % 2 === 0 ? 0xffffff : 0x98fff0);
        beamCount += 1;
      }
    }
    this.finish(this.guardianBeam, beamCount);

    let waveCount = 0;
    if (phase === "complete") {
      const phaseElapsed = status?.phaseElapsedSec ?? 0;
      for (let wave = 0; wave < MAX_RESTORATION_WAVES; wave += 1) {
        const local = Math.max(0, phaseElapsed - wave * 0.7);
        if (local <= 0) continue;
        this.dummy.position.set(0, -0.92 + wave * 0.025, -(forwardDistance + 18 + wave * 5));
        this.dummy.rotation.set(Math.PI / 2, 0, 0);
        this.dummy.scale.setScalar(1.35 + Math.min(local, 2.2) * (1.0 + wave * 0.12));
        this.setInstance(this.restorationWaves, waveCount, wave % 2 === 0 ? 0xb8fff1 : 0x7de9ff);
        waveCount += 1;
      }
    }
    this.finish(this.restorationWaves, waveCount);
  }

  private updateHeartlightBond(
    forwardDistance: number,
    playerLateral: number,
    elapsedSec: number,
    status: Readonly<DuskmawRunStatus> | null,
    reducedMotion: boolean,
  ): void {
    const phase = status?.phase ?? "approach";
    const hasHeartlight = status?.heartlightRecovered === true;
    const earlyComplete = phase === "complete" && (status?.phaseElapsedSec ?? 0) < 5.35;
    const visible = hasHeartlight && (
      phase === "heartlight-run" || phase === "vault-rescue" ||
      phase === "auralis-catchup" || phase === "moonlink-battle" || earlyComplete
    );
    this.heartlightOrb.visible = visible;
    this.playerOrigin.set(playerLateral, 1.26, -forwardDistance + 0.1);

    if (visible) {
      this.heartlightStart.copy(this.playerOrigin);
      this.heartlightTarget.copy(this.moonLeviathan.group.position);
      this.heartlightTarget.y += 0.2;
      this.heartlightTarget.z += 0.6;
      if (phase === "heartlight-run") {
        this.heartlightOrb.position.copy(this.playerOrigin);
        this.heartlightOrb.position.y += 1.05;
        this.heartlightOrb.position.z += 0.25;
      } else if (phase === "vault-rescue") {
        const transfer = smootherStep(((status?.phaseElapsedSec ?? 0) - 0.8) / 5.4);
        this.heartlightOrb.position.copy(this.heartlightStart).lerp(this.heartlightTarget, transfer);
        this.heartlightOrb.position.y += Math.sin(transfer * Math.PI) * 2.8;
      } else {
        this.heartlightOrb.position.copy(this.heartlightTarget);
      }
      const pulse = reducedMotion ? 1 : 0.9 + Math.sin(elapsedSec * 6.4) * 0.1;
      this.heartlightOrb.scale.setScalar((phase === "vault-rescue" ? 1.05 : 0.82) * pulse);
      this.heartlightOrb.rotation.set(elapsedSec * 0.18, elapsedSec * 0.24, 0);
    }

    let trailCount = 0;
    if (visible && phase === "heartlight-run") {
      for (let segment = 0; segment < MAX_HEARTLIGHT_TRAIL_SEGMENTS; segment += 1) {
        const fraction = segment / MAX_HEARTLIGHT_TRAIL_SEGMENTS;
        this.dummy.position.copy(this.heartlightOrb.position);
        this.dummy.position.y -= 0.5 + fraction * 0.45;
        this.dummy.position.z += 0.48 + fraction * 0.72;
        this.dummy.rotation.set(0, 0, 0);
        const pulse = reducedMotion ? 1 : 0.88 + Math.sin(elapsedSec * 10 - segment * 0.6) * 0.12;
        this.dummy.scale.set(0.17 * pulse * (1 - fraction * 0.55), 0.4, 0.17 * pulse * (1 - fraction * 0.55));
        this.setInstance(this.heartlightTrail, trailCount, segment % 2 === 0 ? 0xfff0a8 : 0xa8ffff);
        trailCount += 1;
      }
    }
    this.finish(this.heartlightTrail, trailCount);
    this.heartlightLight.intensity = visible ? (phase === "vault-rescue" ? 3.2 : 2.2) : 0;
    if (visible) this.heartlightLight.position.copy(this.heartlightOrb.position);

    const moonlinkActive = phase === "moonlink-battle" ||
      (phase === "complete" && (status?.phaseElapsedSec ?? 0) < 3.65);
    let linkCount = 0;
    if (moonlinkActive && this.moonLeviathan.group.visible) {
      this.heartlightTarget.copy(this.moonLeviathan.group.position);
      this.heartlightTarget.y -= 0.1;
      this.heartlightTarget.z += 1.1;
      for (let segment = 0; segment < MAX_MOONLINK_BEAM_SEGMENTS; segment += 1) {
        const fromFraction = segment / MAX_MOONLINK_BEAM_SEGMENTS;
        const toFraction = (segment + 0.76) / MAX_MOONLINK_BEAM_SEGMENTS;
        const from = this.segmentMidpoint.copy(this.playerOrigin).lerp(this.heartlightTarget, fromFraction);
        const to = this.segmentEnd.copy(this.playerOrigin).lerp(this.heartlightTarget, toFraction);
        this.segmentVector.subVectors(to, from);
        const length = this.segmentVector.length();
        this.dummy.position.copy(from).addScaledVector(this.segmentVector, 0.5);
        this.dummy.quaternion.setFromUnitVectors(this.upAxis, this.segmentVector.normalize());
        const pulse = reducedMotion ? 1 : 0.82 + Math.sin(elapsedSec * 12 - segment * 0.7) * 0.18;
        this.dummy.scale.set(0.28 * pulse, length, 0.28 * pulse);
        this.setInstance(this.moonlinkBeam, linkCount, segment % 2 === 0 ? 0xefffff : 0x6efaff);
        linkCount += 1;
      }
    }
    this.finish(this.moonlinkBeam, linkCount);

    this.moonlinkShield.visible = moonlinkActive;
    if (this.moonlinkShield.visible) {
      const pulse = reducedMotion ? 1 : 0.96 + Math.sin(elapsedSec * 3.2) * 0.04;
      this.moonlinkShield.position.set(playerLateral, 0.7, -forwardDistance + 0.12);
      this.moonlinkShield.rotation.set(0, 0, -Math.PI * 0.25);
      this.moonlinkShield.scale.setScalar(1.48 * pulse);
    }
  }

  private updateMoonLeviathan(
    forwardDistance: number,
    playerLateral: number,
    elapsedSec: number,
    status: Readonly<DuskmawRunStatus> | null,
    reducedMotion: boolean,
  ): void {
    const phase = status?.phase ?? "approach";
    const visible = phase === "vault-rescue" || phase === "auralis-catchup" ||
      phase === "moonlink-battle" || phase === "complete";
    this.moonLeviathan.group.visible = visible;
    if (!visible) {
      this.awakeningStartedSec = -1;
      this.lastMoonFollowSec = elapsedSec;
      return;
    }
    if (phase === "vault-rescue" && this.awakeningStartedSec < 0) {
      this.awakeningStartedSec = elapsedSec;
    }
    const progress = phase === "vault-rescue"
      ? smootherStep(((status?.phaseElapsedSec ?? 0) - DUSKMAW_VAULT_HOLD_SEC * 0.24) /
          (DUSKMAW_VAULT_HOLD_SEC * 0.66))
      : 1;
    const motion = reducedMotion ? 0 : 1;
    const phaseElapsed = status?.phaseElapsedSec ?? 0;
    const completeProgress = phase === "complete" ? smootherStep(phaseElapsed / 5.2) : 0;
    const catchup = phase === "auralis-catchup"
      ? smootherStep(phaseElapsed / DUSKMAW_AURALIS_CATCHUP_SEC)
      : 0;
    const moonSealArrival = phase === "moonlink-battle" ? smootherStep(phaseElapsed / 3.5) : 0;
    const followGoal = phase === "moonlink-battle" || phase === "complete" || phase === "auralis-catchup"
      ? THREE.MathUtils.clamp(playerLateral * 0.68, -3.8, 3.8)
      : 0;
    const followDelta = followGoal - this.moonPartnerLateral;
    const dt = THREE.MathUtils.clamp(elapsedSec - this.lastMoonFollowSec, 0, 0.1);
    const followAlpha = reducedMotion ? 1 : 1 - Math.exp(-dt * 0.88);
    this.moonPartnerLateral += followDelta * followAlpha;
    this.lastMoonFollowSec = elapsedSec;
    let centreX = phase === "vault-rescue"
      ? THREE.MathUtils.lerp(-0.5, 0, progress)
      : phase === "auralis-catchup"
        ? THREE.MathUtils.lerp(-1.4, this.moonPartnerLateral, catchup)
      : phase === "complete"
        ? THREE.MathUtils.lerp(this.moonPartnerLateral, -3.15, completeProgress) +
          Math.sin(elapsedSec * 0.24) * 0.18 * motion
        : this.moonPartnerLateral;
    let y = phase === "vault-rescue"
      ? THREE.MathUtils.lerp(1.75, 5.15, progress)
      : phase === "auralis-catchup"
        ? THREE.MathUtils.lerp(4.6, 4.75, catchup)
      : phase === "complete"
        ? 4.45 + completeProgress * 0.85
        : THREE.MathUtils.lerp(5.15, 4.55, moonSealArrival);
    const cageZ = -(status?.vaultWorldDistance ?? (forwardDistance + 34));
    const targetZ = -(forwardDistance + 21.5);
    let z = phase === "vault-rescue"
      ? cageZ + THREE.MathUtils.lerp(0.4, -5.8, progress)
      : phase === "auralis-catchup"
        ? THREE.MathUtils.lerp(cageZ - 5.8, targetZ, catchup)
        : phase === "complete"
          ? -(forwardDistance + THREE.MathUtils.lerp(22.5, 16.5, completeProgress))
          : -(forwardDistance + THREE.MathUtils.lerp(29.5, 22.5, moonSealArrival));
    const scale = phase === "vault-rescue" ? 0.5 + progress * 0.3 : 0.8;

    const strikeAge = elapsedSec - (status?.lastEnemyHitSec ?? Number.NEGATIVE_INFINITY);
    const dashIn = phase === "moonlink-battle" ? smootherStep(strikeAge / 0.46) : 0;
    const dashOut = phase === "moonlink-battle" ? smootherStep((strikeAge - 0.92) / 0.78) : 1;
    const dash = strikeAge >= 0 && strikeAge < 1.72 ? dashIn * (1 - dashOut) : 0;
    if (dash > 0.001 && this.duskmaw.group.visible) {
      const side = (status?.joinedStrikes ?? 0) % 2 === 0 ? -1 : 1;
      centreX = THREE.MathUtils.lerp(centreX, this.duskmaw.group.position.x + side * 2.35, dash);
      y = THREE.MathUtils.lerp(y, this.duskmaw.group.position.y + 1.25, dash);
      z = THREE.MathUtils.lerp(z, this.duskmaw.group.position.z + 3.2, dash);
    }

    this.moonLeviathan.group.position.set(
      centreX,
      y + Math.sin(elapsedSec * 0.38) * 0.09 * motion,
      z,
    );
    const partnerTurn = phase === "moonlink-battle" || phase === "complete" || phase === "auralis-catchup"
      ? THREE.MathUtils.clamp(followDelta * 0.055, -THREE.MathUtils.degToRad(13), THREE.MathUtils.degToRad(13))
      : 0;
    const moonWeave = reducedMotion ? 0 : Math.sin(elapsedSec * 0.24) * THREE.MathUtils.degToRad(2.5);
    const auralisBaseYaw = DUSKMAW_FORWARD_YAW_RAD;
    const emergenceTurn = phase === "vault-rescue"
      ? (1 - progress) * THREE.MathUtils.degToRad(18)
      : 0;
    const attackYaw = dash > 0.001
      ? Math.atan2(
        -(this.duskmaw.group.position.z - this.moonLeviathan.group.position.z),
        this.duskmaw.group.position.x - this.moonLeviathan.group.position.x,
      )
      : auralisBaseYaw + moonWeave + emergenceTurn + partnerTurn;
    const offeringTurn = phase === "complete"
      ? smootherStep((phaseElapsed - 4.1) / 2.4)
      : 0;
    const ceremonyYaw = lerpAngle(attackYaw, -Math.PI / 2, offeringTurn);
    this.moonLeviathan.group.rotation.set(
      phase === "complete" ? -offeringTurn * 0.08 : 0.015,
      ceremonyYaw,
      reducedMotion ? 0 : -partnerTurn * 0.34 - dash * 0.24 -
        Math.sin(elapsedSec * 0.24) * THREE.MathUtils.degToRad(1.2),
    );
    this.moonLeviathan.group.scale.setScalar(scale);
    this.moonLeviathan.update({
      elapsedSec,
      reducedMotion,
      intensity: phase === "moonlink-battle" ? 1 + dash * 0.28 : progress,
      jawOpen: phase === "moonlink-battle" ? 0.16 + dash * 0.38 : phase === "complete" ? 0.08 : 0.03,
      finStroke: Math.sin(elapsedSec * 0.74) + dash * 0.45,
      awakening: progress,
      armourDamage: 0,
      damageFlash: phase === "complete" ? Math.max(0, 1 - (status?.phaseElapsedSec ?? 0) / 2.5) : 0,
    });
  }

  private updateRecovery(
    forwardDistance: number,
    playerLateral: number,
    elapsedSec: number,
    status: Readonly<DuskmawRunStatus> | null,
    reducedMotion: boolean,
  ): void {
    this.lastElapsedSec = elapsedSec;
    const age = elapsedSec - (status?.lastRecoverySec ?? Number.NEGATIVE_INFINITY);
    const visible = age >= 0 && age < 1.8;
    this.recoveryPulse.visible = visible;
    if (!visible) return;
    const pulse = reducedMotion ? 2.2 : 1.1 + age * 2.3;
    this.recoveryPulse.position.set(playerLateral, 0.72, -forwardDistance - 0.4);
    this.recoveryPulse.rotation.set(0, 0, 0);
    this.recoveryPulse.scale.setScalar(pulse);
  }

  private updatePlayerHit(
    forwardDistance: number,
    playerLateral: number,
    elapsedSec: number,
    status: Readonly<DuskmawRunStatus> | null,
    reducedMotion: boolean,
  ): void {
    const age = elapsedSec - (status?.lastPlayerHitSec ?? Number.NEGATIVE_INFINITY);
    const visible = age >= 0 && age < 1.35;
    this.playerHitBurst.visible = visible;
    if (!visible) {
      this.finish(this.playerHitFragments, 0);
      return;
    }
    const expansion = smootherStep(age / 1.35);
    const recoil = 1 - expansion;
    this.playerHitBurst.position.set(
      playerLateral,
      0.62 + Math.sin(age * 22) * 0.08 * (reducedMotion ? 0 : 1),
      -forwardDistance + 0.1,
    );
    this.playerHitBurst.rotation.set(age * 1.4, age * 1.8, age * 1.1);
    this.playerHitBurst.scale.setScalar(0.42 + expansion * 1.65);
    let fragmentCount = 0;
    for (let fragment = 0; fragment < MAX_PLAYER_HIT_FRAGMENTS; fragment += 1) {
      const angle = fragment / MAX_PLAYER_HIT_FRAGMENTS * Math.PI * 2;
      const radius = expansion * (1.0 + (fragment % 3) * 0.34);
      this.dummy.position.set(
        playerLateral + Math.cos(angle) * radius,
        0.64 + Math.sin(angle) * radius * 0.7,
        -forwardDistance + 0.12 + (fragment - MAX_PLAYER_HIT_FRAGMENTS / 2) * 0.045 * expansion,
      );
      this.dummy.rotation.set(age * (1.2 + fragment * 0.06), angle, age * 1.7);
      this.dummy.scale.setScalar((0.16 + recoil * 0.08) * (1 - expansion * 0.35));
      this.setInstance(this.playerHitFragments, fragmentCount, fragment % 2 === 0 ? 0xff724f : 0xffe7b5);
      fragmentCount += 1;
    }
    this.finish(this.playerHitFragments, fragmentCount);
  }

  private updateGrandDefeat(
    forwardDistance: number,
    playerLateral: number,
    _elapsedSec: number,
    status: Readonly<DuskmawRunStatus> | null,
    reducedMotion: boolean,
  ): void {
    const phaseElapsed = status?.phase === "complete" ? status.phaseElapsedSec : -1;
    const finaleVisible = phaseElapsed >= 0 && phaseElapsed < 11.8;
    const blastVisible = phaseElapsed >= 0.25 && phaseElapsed < 6.35;
    this.finalBlast.visible = blastVisible;
    this.mooncrestGem.visible = finaleVisible && phaseElapsed >= 5.15;
    this.mooncrestHalo.visible = this.mooncrestGem.visible;
    if (!finaleVisible) {
      this.finaleLight.intensity = 0;
      this.finish(this.defeatFragments, 0);
      this.finish(this.mooncrestWings, 0);
      this.seabedMaterial.emissiveIntensity = 0.22;
      this.cliffMaterial.emissiveIntensity = 0.24;
      this.moonbeamMaterial.opacity = 0.14;
      return;
    }
    const rupture = smootherStep((phaseElapsed - 0.55) / 1.65);
    const blast = smootherStep((phaseElapsed - 1.15) / 1.15);
    const fade = smootherStep((phaseElapsed - 3.65) / 2.55);
    const restoration = smootherStep((phaseElapsed - 2.2) / 4.2);
    this.finalBlast.position.copy(this.duskmaw.group.position);
    this.finalBlast.position.y += 0.3;
    this.finalBlast.rotation.set(
      phaseElapsed * (reducedMotion ? 0 : 0.42),
      phaseElapsed * (reducedMotion ? 0 : 0.58),
      phaseElapsed * (reducedMotion ? 0 : 0.31),
    );
    const blastPulse = reducedMotion ? 1 : 0.92 + Math.sin(phaseElapsed * 8.2) * 0.08;
    this.finalBlast.scale.setScalar((0.34 + blast * 7.4) * (1 - fade * 0.72) * blastPulse);
    this.finaleLight.position.copy(this.finalBlast.position);
    this.finaleLight.intensity = 1.8 + blast * 7.8 * (1 - fade * 0.72);
    this.seabedMaterial.emissiveIntensity = 0.22 + restoration * 0.42;
    this.cliffMaterial.emissiveIntensity = 0.24 + restoration * 0.34;
    this.moonbeamMaterial.opacity = 0.14 + restoration * 0.16;

    let fragmentCount = 0;
    const fragmentVisible = phaseElapsed < 5.8;
    for (let fragment = 0; fragment < MAX_DEFEAT_FRAGMENTS && fragmentVisible; fragment += 1) {
      const angle = fragment / MAX_DEFEAT_FRAGMENTS * Math.PI * 2 + fragment * 0.21;
      const elevation = ((fragment % 5) - 2) * 0.42;
      const travel = rupture * (2.8 + (fragment % 5) * 0.92);
      this.dummy.position.set(
        this.finalBlast.position.x + Math.cos(angle) * travel,
        this.finalBlast.position.y + elevation + Math.sin(angle * 1.7) * travel * 0.36,
        this.finalBlast.position.z + Math.sin(angle) * travel,
      );
      this.dummy.rotation.set(
        phaseElapsed * (0.8 + fragment * 0.04),
        angle,
        phaseElapsed * (1.1 + (fragment % 3) * 0.18),
      );
      this.dummy.scale.setScalar((0.22 + (fragment % 3) * 0.07) * (1 - fade * 0.82));
      this.setInstance(
        this.defeatFragments,
        fragmentCount,
        fragment % 4 === 0 ? 0xffe5a0 : fragment % 3 === 0 ? 0xbafff6 : 0x314e62,
      );
      fragmentCount += 1;
    }
    this.finish(this.defeatFragments, fragmentCount);

    const crestBirth = smootherStep((phaseElapsed - 5.15) / 1.05);
    const crestFlight = smootherStep((phaseElapsed - 6.35) / 3.1);
    const crestArrival = smootherStep((phaseElapsed - 9.35) / 1.15);
    if (crestBirth > 0) {
      this.moonLeviathan.mouthWorldPosition(this.moonMouthWorld);
      this.segmentMidpoint.copy(this.moonMouthWorld);
      this.segmentMidpoint.y += 0.35;
      this.playerOrigin.set(playerLateral, 1.45, -forwardDistance + 0.2);
      this.segmentEnd.copy(this.segmentMidpoint).lerp(this.playerOrigin, 0.5);
      this.segmentEnd.y += 4.2;
      this.counterTarget.copy(this.segmentMidpoint).lerp(this.segmentEnd, crestFlight);
      this.attackTarget.copy(this.segmentEnd).lerp(this.playerOrigin, crestFlight);
      this.counterTarget.lerp(this.attackTarget, crestFlight);
      const crestScale = crestBirth * (1 - crestArrival * 0.18);
      this.mooncrestGem.position.copy(this.counterTarget);
      this.mooncrestGem.rotation.set(
        phaseElapsed * (reducedMotion ? 0 : 0.18),
        phaseElapsed * (reducedMotion ? 0 : 0.42),
        Math.sin(phaseElapsed * 0.8) * (reducedMotion ? 0 : 0.12),
      );
      this.mooncrestGem.scale.setScalar(0.68 * crestScale);
      this.mooncrestHalo.position.copy(this.counterTarget);
      this.mooncrestHalo.rotation.set(0, 0, phaseElapsed * (reducedMotion ? 0 : 0.5));
      this.mooncrestHalo.scale.setScalar((1.18 + crestBirth * 0.72) * crestScale);

      let wingCount = 0;
      for (const side of [-1, 1] as const) {
        this.dummy.position.copy(this.counterTarget);
        this.dummy.position.x += side * 0.62 * crestScale;
        this.dummy.rotation.set(0, side < 0 ? Math.PI : 0, side * 0.22);
        this.dummy.scale.set(0.55 * crestScale, 0.55 * crestScale, 0.55 * crestScale);
        this.setInstance(this.mooncrestWings, wingCount, side < 0 ? 0xffe6a7 : 0xf8fff1);
        wingCount += 1;
      }
      this.finish(this.mooncrestWings, wingCount);
    } else {
      this.finish(this.mooncrestWings, 0);
    }
  }

  private updateDust(
    forwardDistance: number,
    elapsedSec: number,
    status: Readonly<DuskmawRunStatus> | null,
    reducedMotion: boolean,
  ): void {
    const wake = status?.phase === "vacuum-wake";
    const motion = reducedMotion ? 0 : 1;
    for (let index = 0; index < DUST_COUNT; index += 1) {
      const phase = hash01(index, 6301) * Math.PI * 2;
      const radius = 4.1 + hash01(index, 6311) * 15.5;
      const wakeCurl = wake ? Math.sin(elapsedSec * 1.8 + index * 0.38) * 1.1 * motion : 0;
      this.dustPositions[index * 3] = Math.cos(phase) * radius + wakeCurl;
      this.dustPositions[index * 3 + 1] = -0.15 + hash01(index, 6323) * 9;
      this.dustPositions[index * 3 + 2] = -(
        forwardDistance - 12 + hash01(index, 6341) * this.cfg.readability.visibleAheadUnits * 2
      );
    }
    this.dustGeometry.getAttribute("position").needsUpdate = true;
  }

  additionalDrawCalls(): number {
    return 50 + this.duskmaw.drawCalls() + this.shadowBrood.drawCalls() +
      this.moonLeviathan.drawCalls();
  }

  additionalMaterials(): number {
    return 12;
  }

  triangleBudget(): number {
    return Math.ceil(
      triangleCount(this.cliffGeometry) * MAX_CLIFF_SEGMENTS +
      triangleCount(this.ribGeometry) * MAX_RIB_BUTTRESSES +
      triangleCount(this.vertebraGeometry) * MAX_WALL_VERTEBRAE +
      triangleCount(this.sanctumGeometry) * MAX_SANCTUM_FACADES +
      triangleCount(this.fossilBedGeometry) * MAX_FOSSIL_BEDS +
      triangleCount(this.routeButtressGeometry) * MAX_ROUTE_BUTTRESSES +
      triangleCount(this.collapseSlabGeometry) * MAX_COLLAPSE_SLABS +
      triangleCount(this.currentPortalGeometry) * MAX_CURRENT_PORTALS +
      triangleCount(this.portalMembraneGeometry) * MAX_CURRENT_PORTALS +
      triangleCount(this.lumenBloomGeometry) * MAX_LUMEN_BLOOMS +
      triangleCount(this.moonSealGeometry) * MAX_MOON_SEALS +
      triangleCount(this.sealMembraneGeometry) * MAX_MOON_SEALS +
      triangleCount(this.wakeSpiralGeometry) * MAX_WAKE_SPIRALS +
      triangleCount(this.safeRouteArrowGeometry) * MAX_SAFE_ROUTE_ARROWS +
      triangleCount(this.moonbeamGeometry) * MAX_MOONBEAMS +
      triangleCount(this.lanternfishGeometry) * MAX_LANTERNFISH +
      triangleCount(this.sanctumGeometry) * MAX_STRUCK_ARCHES +
      triangleCount(this.mouthChargeGeometry) * MAX_MOUTH_CHARGES +
      triangleCount(this.mouthfireGeometry) * MAX_MOUTHFIRE_SEGMENTS +
      triangleCount(this.impactBurstGeometry) * MAX_IMPACT_BURSTS +
      triangleCount(this.dangerVeilGeometry) * MAX_DANGER_VEILS +
      triangleCount(this.mouthfireGeometry) * MAX_COUNTER_BOLT_SEGMENTS +
      triangleCount(this.mouthChargeGeometry) +
      triangleCount(this.mouthChargeGeometry) * MAX_COUNTER_MOTES +
      triangleCount(this.impactBurstGeometry) * MAX_COUNTER_IMPACT_RINGS +
      triangleCount(this.rigResources.armourPlate) * MAX_ARMOUR_FRAGMENTS +
      triangleCount(this.rigResources.armourPlate) * MAX_REGENERATION_WISPS +
      triangleCount(this.prisonBarGeometry) * MAX_PRISON_BARS +
      triangleCount(this.prisonBarGeometry) * MAX_PRISON_RIBS +
      triangleCount(this.prisonShackleGeometry) * MAX_PRISON_SHACKLES +
      triangleCount(this.prisonAuraGeometry) +
      triangleCount(this.mouthfireGeometry) * MAX_GUARDIAN_BEAM_SEGMENTS +
      triangleCount(this.mouthfireGeometry) * MAX_MOONLINK_BEAM_SEGMENTS +
      triangleCount(this.prisonAuraGeometry) +
      triangleCount(this.mouthChargeGeometry) +
      triangleCount(this.mouthfireGeometry) * MAX_HEARTLIGHT_TRAIL_SEGMENTS +
      triangleCount(this.moonlinkShieldGeometry) +
      triangleCount(this.restorationWaveGeometry) * MAX_RESTORATION_WAVES +
      triangleCount(this.recoveryGeometry) +
      triangleCount(this.mouthChargeGeometry) +
      triangleCount(this.finalBlastGeometry) * 3 +
      triangleCount(this.mooncrestCoreGeometry) +
      triangleCount(this.mooncrestWingGeometry) * MAX_MOONCREST_WINGS +
      triangleCount(this.restorationWaveGeometry) +
      triangleCount(this.rigResources.armourPlate) * MAX_PLAYER_HIT_FRAGMENTS +
      triangleCount(this.rigResources.armourPlate) * MAX_DEFEAT_FRAGMENTS +
      this.duskmaw.triangleBudget(this.rigResources) +
      this.shadowBrood.triangleBudget() +
      this.moonLeviathan.triangleBudget(this.rigResources)
    );
  }

  dispose(): void {
    this.cliffGeometry.dispose();
    this.ribGeometry.dispose();
    this.vertebraGeometry.dispose();
    this.sanctumGeometry.dispose();
    this.fossilBedGeometry.dispose();
    this.routeButtressGeometry.dispose();
    this.collapseSlabGeometry.dispose();
    this.currentPortalGeometry.dispose();
    this.portalMembraneGeometry.dispose();
    this.moonSealGeometry.dispose();
    this.sealMembraneGeometry.dispose();
    this.wakeSpiralGeometry.dispose();
    this.safeRouteArrowGeometry.dispose();
    this.moonbeamGeometry.dispose();
    this.lanternfishGeometry.dispose();
    this.mouthChargeGeometry.dispose();
    this.mouthfireGeometry.dispose();
    this.impactBurstGeometry.dispose();
    this.mooncrestCoreGeometry.dispose();
    this.mooncrestWingGeometry.dispose();
    this.dangerVeilGeometry.dispose();
    this.recoveryGeometry.dispose();
    this.prisonBarGeometry.dispose();
    this.prisonShackleGeometry.dispose();
    this.prisonAuraGeometry.dispose();
    this.restorationWaveGeometry.dispose();
    this.moonlinkShieldGeometry.dispose();
    this.lumenBloomGeometry.dispose();
    this.finalBlastGeometry.dispose();
    this.seabedGeometry.dispose();
    this.dustGeometry.dispose();
    this.duskmaw.dispose();
    this.shadowBrood.dispose();
    this.moonLeviathan.dispose();
    disposeLeviathanRigResources(this.rigResources);
    this.boneMaterial.dispose();
    this.cliffMaterial.dispose();
    this.seabedMaterial.dispose();
    this.routeMaterial.dispose();
    this.moonbeamMaterial.dispose();
    this.dustMaterial.dispose();
    for (const material of [
      this.duskMaterials.body,
      this.duskMaterials.accent,
      this.duskMaterials.luminous,
      this.moonMaterials.body,
      this.moonMaterials.accent,
      this.moonMaterials.luminous,
    ]) material.dispose();
  }
}
