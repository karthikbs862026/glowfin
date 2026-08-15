import * as THREE from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";

import type {
  R3ActorPresentation,
  R3EncounterPresentation,
} from "../expedition/r3Encounters";

const TINY_SCALE = 0.0001;
const CORAL_MATERIAL_ROLE = 5;

type Paint = (
  position: THREE.Vector3,
  normal: THREE.Vector3,
) => THREE.ColorRepresentation;

interface LivingStyle {
  paint: Paint;
  glow: number | ((position: THREE.Vector3) => number);
  sway: number | ((position: THREE.Vector3) => number);
  role?: number | ((position: THREE.Vector3, normal: THREE.Vector3) => number);
}

interface PartTransform {
  position?: THREE.Vector3;
  rotation?: THREE.Euler;
  scale?: THREE.Vector3;
}

type LoftRing = readonly [
  z: number,
  halfWidth: number,
  halfHeight: number,
  lift?: number,
];

function clamp01(value: number): number {
  return Math.max(0, Math.min(1, value));
}

function transformedLivingPart(
  source: THREE.BufferGeometry,
  transform: PartTransform,
  style: LivingStyle,
): THREE.BufferGeometry {
  const geometry = source.index ? source.toNonIndexed() : source.clone();
  source.dispose();
  geometry.applyMatrix4(new THREE.Matrix4().compose(
    transform.position ?? new THREE.Vector3(),
    new THREE.Quaternion().setFromEuler(
      transform.rotation ?? new THREE.Euler(),
    ),
    transform.scale ?? new THREE.Vector3(1, 1, 1),
  ));
  for (const attribute of Object.keys(geometry.attributes)) {
    if (attribute !== "position" && attribute !== "normal") {
      geometry.deleteAttribute(attribute);
    }
  }
  geometry.computeVertexNormals();
  const positions = geometry.getAttribute("position");
  const normals = geometry.getAttribute("normal");
  const colours = new Float32Array(positions.count * 3);
  const glow = new Uint8Array(positions.count);
  const sway = new Uint8Array(positions.count);
  const roles = new Uint8Array(positions.count);
  const vertex = new THREE.Vector3();
  const normal = new THREE.Vector3();
  const colour = new THREE.Color();
  for (let index = 0; index < positions.count; index += 1) {
    vertex.fromBufferAttribute(positions, index);
    normal.fromBufferAttribute(normals, index);
    colour.set(style.paint(vertex, normal));
    colours[index * 3] = colour.r;
    colours[index * 3 + 1] = colour.g;
    colours[index * 3 + 2] = colour.b;
    const glowWeight = typeof style.glow === "function"
      ? style.glow(vertex)
      : style.glow;
    const swayWeight = typeof style.sway === "function"
      ? style.sway(vertex)
      : style.sway;
    glow[index] = Math.round(clamp01(glowWeight) * 255);
    sway[index] = Math.round(clamp01(swayWeight) * 255);
    roles[index] = Math.round(typeof style.role === "function"
      ? style.role(vertex, normal)
      : style.role ?? CORAL_MATERIAL_ROLE);
  }
  geometry.setAttribute("color", new THREE.Float32BufferAttribute(colours, 3));
  geometry.setAttribute(
    "glowWeight",
    new THREE.Uint8BufferAttribute(glow, 1, true),
  );
  geometry.setAttribute(
    "swayWeight",
    new THREE.Uint8BufferAttribute(sway, 1, true),
  );
  geometry.setAttribute(
    "materialRole",
    new THREE.Uint8BufferAttribute(roles, 1, false),
  );
  return geometry;
}

function solidStyle(
  colour: THREE.ColorRepresentation,
  glow = 0.32,
  sway = 0,
  role = CORAL_MATERIAL_ROLE,
): LivingStyle {
  return { paint: () => colour, glow, sway, role };
}

function merged(parts: THREE.BufferGeometry[]): THREE.BufferGeometry {
  const geometry = mergeGeometries(parts, false);
  for (const part of parts) part.dispose();
  if (!geometry) throw new Error("R3 character geometry could not be merged.");
  geometry.computeVertexNormals();
  geometry.computeBoundingBox();
  geometry.computeBoundingSphere();
  return geometry;
}

/**
 * BufferGeometryUtils requires every source to use the same indexing mode and
 * the same vertex-attribute set. The Moonseed intentionally combines
 * polyhedra (non-indexed in Three r165) with torus arcs (indexed), so prepare
 * one position/normal-only representation before merging. This is a CPU-side
 * construction step and does not allocate another WebGL resource.
 */
function moonseedMergePart(source: THREE.BufferGeometry): THREE.BufferGeometry {
  const geometry = source.index ? source.toNonIndexed() : source;
  if (geometry !== source) source.dispose();
  for (const attribute of Object.keys(geometry.attributes)) {
    if (attribute !== "position" && attribute !== "normal") {
      geometry.deleteAttribute(attribute);
    }
  }
  if (!geometry.getAttribute("normal")) geometry.computeVertexNormals();
  return geometry;
}

function createMoonseedGeometry(): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = [];
  const core = new THREE.IcosahedronGeometry(0.62, 1);
  core.scale(0.76, 1.42, 0.76);
  parts.push(core);
  for (let index = 0; index < 3; index += 1) {
    const arc = new THREE.TorusGeometry(0.9, 0.065, 5, 24, Math.PI * 1.62);
    arc.rotateZ(index * Math.PI * 2 / 3 + 0.22);
    arc.rotateX(index === 1 ? 0.72 : index === 2 ? -0.72 : 0.16);
    parts.push(arc);
  }
  const crown = new THREE.OctahedronGeometry(0.2, 0);
  crown.scale(0.72, 1.28, 0.72);
  crown.translate(0, 1.02, 0);
  parts.push(crown);
  const compatibleParts = parts.map(moonseedMergePart);
  const geometry = mergeGeometries(compatibleParts, false);
  for (const part of compatibleParts) part.dispose();
  if (!geometry) throw new Error("Moonseed geometry could not be merged.");
  geometry.computeVertexNormals();
  geometry.computeBoundingBox();
  geometry.computeBoundingSphere();
  return geometry;
}

/**
 * One closed, continuous skin through authored cross-sections. Both R3 friends
 * use this instead of overlapping torso/head primitives, so their silhouettes
 * cannot read as separate creatures pushed together.
 */
function createLoftGeometry(
  rings: readonly LoftRing[],
  radialSegments = 16,
): THREE.BufferGeometry {
  const positions: number[] = [];
  const indices: number[] = [];
  for (const ring of rings) {
    for (let segment = 0; segment < radialSegments; segment += 1) {
      const angle = segment / radialSegments * Math.PI * 2;
      positions.push(
        Math.cos(angle) * ring[1],
        (ring[3] ?? 0) + Math.sin(angle) * ring[2],
        ring[0],
      );
    }
  }
  for (let ring = 0; ring < rings.length - 1; ring += 1) {
    for (let segment = 0; segment < radialSegments; segment += 1) {
      const next = (segment + 1) % radialSegments;
      const a = ring * radialSegments + segment;
      const b = ring * radialSegments + next;
      const c = (ring + 1) * radialSegments + next;
      const d = (ring + 1) * radialSegments + segment;
      indices.push(a, b, c, a, c, d);
    }
  }
  const first = rings[0] as LoftRing;
  const last = rings[rings.length - 1] as LoftRing;
  const frontCentre = positions.length / 3;
  positions.push(0, first[3] ?? 0, first[0]);
  const rearCentre = positions.length / 3;
  positions.push(0, last[3] ?? 0, last[0]);
  const rearStart = (rings.length - 1) * radialSegments;
  for (let segment = 0; segment < radialSegments; segment += 1) {
    const next = (segment + 1) % radialSegments;
    indices.push(frontCentre, next, segment);
    indices.push(rearCentre, rearStart + segment, rearStart + next);
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute(
    "position",
    new THREE.Float32BufferAttribute(positions, 3),
  );
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  return geometry;
}

function createMiriGeometry(): THREE.BufferGeometry {
  const lagoon = new THREE.Color(0x0b7999);
  const babyCyan = new THREE.Color(0x37cfd1);
  const wingGlow = new THREE.Color(0x9cfff0);
  const pearlBelly = new THREE.Color(0xc1fff1);
  const blush = 0xff9fcb;
  const body = transformedLivingPart(createLoftGeometry([
    [-1.14, 0.18, 0.1, 0.03],
    [-0.94, 0.55, 0.16, 0.04],
    [-0.62, 1.25, 0.13, 0.02],
    [-0.14, 1.56, 0.095],
    [0.28, 1.16, 0.08, -0.01],
    [0.64, 0.58, 0.07],
    [0.84, 0.14, 0.055],
  ], 18), {}, {
    paint: (position, normal) => {
      if (normal.y < -0.2) return pearlBelly;
      const edge = Math.pow(clamp01(Math.abs(position.x) / 1.56), 1.35);
      const crown = clamp01(normal.y * 0.7 + 0.35);
      return lagoon.clone()
        .lerp(babyCyan, 0.42 + crown * 0.3)
        .lerp(wingGlow, edge * 0.72);
    },
    glow: (position) => 0.38 + clamp01(Math.abs(position.x) / 1.56) * 0.34,
    sway: (position) => Math.pow(clamp01(Math.abs(position.x) / 1.56), 1.5) * 0.96,
    role: 5,
  });
  const parts = [body];
  for (const side of [-1, 1]) {
    parts.push(
      transformedLivingPart(
        new THREE.TubeGeometry(
          new THREE.CatmullRomCurve3([
            new THREE.Vector3(side * 0.18, 0.025, -0.86),
            new THREE.Vector3(side * 0.25, 0.04, -1.08),
            new THREE.Vector3(side * 0.2, 0.015, -1.28),
          ]),
          6,
          0.052,
          5,
          false,
        ),
        {},
        solidStyle(0x67e8dd, 0.48, 0.4, 5),
      ),
      transformedLivingPart(
        new THREE.SphereGeometry(1, 10, 7),
        {
          position: new THREE.Vector3(side * 0.31, 0.185, -0.72),
          rotation: new THREE.Euler(0, side * 0.08, 0),
          scale: new THREE.Vector3(0.105, 0.088, 0.095),
        },
        solidStyle(0x041829, 0.08, 0, 5),
      ),
      transformedLivingPart(
        new THREE.SphereGeometry(1, 7, 5),
        {
          position: new THREE.Vector3(side * 0.285, 0.222, -0.775),
          scale: new THREE.Vector3(0.035, 0.03, 0.02),
        },
        solidStyle(0xe9fffb, 0.68, 0, 4),
      ),
      transformedLivingPart(
        new THREE.SphereGeometry(1, 8, 5),
        {
          position: new THREE.Vector3(side * 0.49, 0.12, -0.75),
          scale: new THREE.Vector3(0.09, 0.018, 0.068),
        },
        solidStyle(blush, 0.46, 0.04, 4),
      ),
    );
  }
  parts.push(
    transformedLivingPart(
      new THREE.TubeGeometry(
        new THREE.CatmullRomCurve3([
          new THREE.Vector3(0, 0.01, 0.72),
          new THREE.Vector3(0.025, 0.025, 1.12),
          new THREE.Vector3(-0.04, 0.01, 1.6),
          new THREE.Vector3(0.035, -0.005, 2.18),
        ]),
        12,
        0.03,
        5,
        false,
      ),
      {},
      solidStyle(0x1a9da8, 0.38, 0.98, 5),
    ),
  );
  return merged(parts);
}

/**
 * Neri is a baby indigo moon-dolphin: long-bodied, fluked and beaked. No part
 * of Glowfin's round axolotl rig, side gills or centred kelp tail is reused.
 */
export function createNeriGeometry(): THREE.BufferGeometry {
  const midnight = new THREE.Color(0x0a124d);
  const indigo = new THREE.Color(0x3449bd);
  const violet = new THREE.Color(0x7969dc);
  const belly = new THREE.Color(0xc7c4ff);
  const parts = [
    transformedLivingPart(
      createLoftGeometry([
        [-1.3, 0.09, 0.065, -0.01],
        [-1.12, 0.22, 0.13],
        [-0.91, 0.43, 0.34, 0.035],
        [-0.58, 0.5, 0.42, 0.025],
        [-0.2, 0.46, 0.36],
        [0.25, 0.37, 0.3, -0.01],
        [0.72, 0.25, 0.21],
        [1.14, 0.12, 0.105],
        [1.34, 0.075, 0.065],
      ], 18),
      {},
      {
        paint: (position, normal) => {
          const crown = clamp01(normal.y * 0.62 + 0.42);
          const underside = clamp01(-normal.y * 1.25);
          return midnight.clone()
            .lerp(indigo, 0.38 + crown * 0.46)
            .lerp(belly, underside * 0.82)
            .lerp(violet, clamp01((position.z - 0.32) / 0.95) * 0.26);
        },
        glow: (position) => 0.28 + clamp01((position.y + 0.22) / 0.64) * 0.22,
        sway: (position) => clamp01((position.z - 0.32) / 0.95) * 0.72,
        role: 5,
      },
    ),
    transformedLivingPart(
      new THREE.ConeGeometry(1, 1, 7),
      {
        position: new THREE.Vector3(0, 0.39, 0.12),
        rotation: new THREE.Euler(-0.18, 0, 0),
        scale: new THREE.Vector3(0.15, 0.4, 0.23),
      },
      solidStyle(0x3449bd, 0.3, 0.46, 5),
    ),
  ];
  for (const side of [-1, 1]) {
    parts.push(
      transformedLivingPart(
        new THREE.SphereGeometry(1, 10, 6),
        {
          position: new THREE.Vector3(side * 0.4, -0.11, -0.08),
          rotation: new THREE.Euler(0, side * 0.3, side * 0.16),
          scale: new THREE.Vector3(0.36, 0.05, 0.22),
        },
        solidStyle(0x4052bd, 0.36, 0.58, 5),
      ),
      transformedLivingPart(
        new THREE.SphereGeometry(1, 10, 6),
        {
          position: new THREE.Vector3(side * 0.39, 0.17, -0.73),
          rotation: new THREE.Euler(0, side * 0.12, 0),
          scale: new THREE.Vector3(0.12, 0.125, 0.09),
        },
        solidStyle(0xe7faff, 0.58, 0, 4),
      ),
      transformedLivingPart(
        new THREE.SphereGeometry(1, 7, 5),
        {
          position: new THREE.Vector3(side * 0.405, 0.18, -0.795),
          scale: new THREE.Vector3(0.058, 0.063, 0.028),
        },
        solidStyle(0x020721, 0.08, 0, 5),
      ),
      transformedLivingPart(
        new THREE.SphereGeometry(1, 10, 6),
        {
          position: new THREE.Vector3(side * 0.23, 0.005, 1.39),
          rotation: new THREE.Euler(0, side * 0.22, side * 0.1),
          scale: new THREE.Vector3(0.34, 0.052, 0.22),
        },
        solidStyle(0x5361c9, 0.4, 0.92, 5),
      ),
    );
    for (const z of [-0.5, -0.3]) {
      parts.push(transformedLivingPart(
        new THREE.SphereGeometry(1, 6, 4),
        {
          position: new THREE.Vector3(side * 0.43, 0.29, z),
          scale: new THREE.Vector3(0.042, 0.022, 0.05),
        },
        solidStyle(0x9cf6f0, 0.62, 0, 4),
      ));
    }
  }
  return merged(parts);
}

/**
 * Coralyn is a compact reef-guardian fish with a single continuous body plan.
 * The geometry is created only by the isolated Tide Sprint entry point; the
 * phone-certified V41 hub never imports or allocates it.
 */
export function createCoralynGeometry(): THREE.BufferGeometry {
  const coral = new THREE.Color(0xe64f7f);
  const rose = new THREE.Color(0xff8ca9);
  const gold = new THREE.Color(0xffd17d);
  const belly = new THREE.Color(0xffd9cf);
  const parts = [
    transformedLivingPart(createLoftGeometry([
      [-1.05, 0.16, 0.12, 0.02],
      [-0.78, 0.46, 0.36, 0.04],
      [-0.34, 0.58, 0.48, 0.02],
      [0.18, 0.5, 0.4],
      [0.66, 0.3, 0.24],
      [1.02, 0.12, 0.1],
    ], 16), {}, {
      paint: (_position, normal) => coral.clone()
        .lerp(rose, clamp01(normal.y * 0.55 + 0.45))
        .lerp(belly, clamp01(-normal.y) * 0.72),
      glow: (position) => 0.32 + clamp01((position.y + 0.25) / 0.8) * 0.22,
      sway: (position) => clamp01((position.z - 0.25) / 0.8) * 0.72,
      role: 5,
    }),
  ];
  for (const side of [-1, 1]) {
    parts.push(
      transformedLivingPart(new THREE.SphereGeometry(1, 10, 6), {
        position: new THREE.Vector3(side * 0.48, -0.05, -0.05),
        rotation: new THREE.Euler(0, side * 0.3, side * 0.28),
        scale: new THREE.Vector3(0.48, 0.055, 0.3),
      }, solidStyle(side < 0 ? 0xff6f9b : 0xff8b90, 0.42, 0.75, 5)),
      transformedLivingPart(new THREE.SphereGeometry(1, 8, 5), {
        position: new THREE.Vector3(side * 0.31, 0.19, -0.71),
        scale: new THREE.Vector3(0.12, 0.13, 0.09),
      }, solidStyle(0xf5ffff, 0.5, 0, 4)),
      transformedLivingPart(new THREE.SphereGeometry(1, 6, 4), {
        position: new THREE.Vector3(side * 0.32, 0.2, -0.79),
        scale: new THREE.Vector3(0.055, 0.06, 0.025),
      }, solidStyle(0x24102d, 0.08, 0, 5)),
      transformedLivingPart(new THREE.SphereGeometry(1, 9, 5), {
        position: new THREE.Vector3(side * 0.27, 0.02, 1.05),
        rotation: new THREE.Euler(0, side * 0.34, side * 0.18),
        scale: new THREE.Vector3(0.38, 0.055, 0.28),
      }, solidStyle(0xffb05d, 0.48, 0.92, 4)),
    );
  }
  for (const x of [-0.22, 0, 0.22]) {
    parts.push(transformedLivingPart(new THREE.ConeGeometry(1, 1, 6), {
      position: new THREE.Vector3(x, 0.48 - Math.abs(x) * 0.35, -0.16),
      rotation: new THREE.Euler(0, 0, -x * 0.9),
      scale: new THREE.Vector3(0.1, 0.28 - Math.abs(x) * 0.2, 0.12),
    }, solidStyle(gold, 0.5, 0.35, 4)));
  }
  return merged(parts);
}

function triangleCount(geometry: THREE.BufferGeometry): number {
  const count = geometry.getIndex()?.count ??
    geometry.getAttribute("position").count;
  return Math.ceil(count / 3);
}

export class R3EncounterField {
  readonly group = new THREE.Group();
  readonly rings: THREE.InstancedMesh;
  readonly relic: THREE.InstancedMesh;
  readonly miri: THREE.InstancedMesh;
  readonly neri: THREE.InstancedMesh;
  private readonly ringGeometry = new THREE.TorusGeometry(1, 0.12, 6, 24);
  private readonly relicGeometry = createMoonseedGeometry();
  private readonly miriGeometry = createMiriGeometry();
  private readonly neriGeometry: THREE.BufferGeometry;
  private readonly matrix = new THREE.Matrix4();
  private readonly position = new THREE.Vector3();
  private readonly scale = new THREE.Vector3();
  private readonly quaternion = new THREE.Quaternion();
  private readonly rotation = new THREE.Euler();
  private readonly colour = new THREE.Color();

  constructor(
    routeMaterial: THREE.MeshBasicMaterial,
    characterMaterial: THREE.Material,
  ) {
    this.neriGeometry = createNeriGeometry();
    this.rings = new THREE.InstancedMesh(this.ringGeometry, routeMaterial, 2);
    this.relic = new THREE.InstancedMesh(this.relicGeometry, routeMaterial, 1);
    this.miri = new THREE.InstancedMesh(this.miriGeometry, characterMaterial, 1);
    this.neri = new THREE.InstancedMesh(this.neriGeometry, characterMaterial, 1);
    this.group.add(this.rings, this.relic, this.miri, this.neri);
    this.miri.userData["characterSpecies"] = "cyan-baby-manta";
    this.neri.userData["characterSpecies"] = "indigo-moon-dolphin";
    this.neri.userData["sharesGlowfinRig"] = false;
    this.group.visible = false;
    for (const [role, mesh] of [
      ["rings", this.rings],
      ["relic", this.relic],
      ["miri", this.miri],
      ["neri", this.neri],
    ] as const) {
      mesh.frustumCulled = false;
      mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      mesh.userData["hideInArtMask"] = true;
      mesh.userData["nonCollidable"] = true;
      mesh.userData["r3EncounterRole"] = role;
    }
  }

  update(
    presentation: Readonly<R3EncounterPresentation> | null,
    elapsedSec: number,
    reducedMotion: boolean,
  ): void {
    this.group.visible = Boolean(presentation?.active);
    if (!presentation?.active) {
      this.rings.count = 0;
      this.relic.visible = false;
      this.miri.visible = false;
      this.neri.visible = false;
      return;
    }

    let ringSlot = 0;
    for (const item of presentation.rings) {
      if (!item.visible || ringSlot >= 2) continue;
      const pulse = reducedMotion
        ? 1
        : 1 + Math.sin(elapsedSec * 3.2 + ringSlot * 1.7) * 0.055;
      this.position.set(item.lateral, 0.38, -item.distance);
      this.rotation.set(0, 0, reducedMotion ? 0 : elapsedSec * 0.22);
      this.quaternion.setFromEuler(this.rotation);
      this.scale.setScalar(item.radius * pulse);
      this.matrix.compose(this.position, this.quaternion, this.scale);
      this.rings.setMatrixAt(ringSlot, this.matrix);
      this.rings.setColorAt(ringSlot, this.colour.set(item.colour));
      ringSlot += 1;
    }
    this.rings.count = ringSlot;
    this.rings.visible = ringSlot > 0;
    if (ringSlot > 0) {
      this.rings.instanceMatrix.needsUpdate = true;
      if (this.rings.instanceColor) this.rings.instanceColor.needsUpdate = true;
    }

    this.updateActor(this.relic, presentation.relic, elapsedSec, reducedMotion, "relic");
    this.updateActor(this.miri, presentation.miri, elapsedSec, reducedMotion, "miri");
    this.updateActor(this.neri, presentation.neri, elapsedSec, reducedMotion, "neri");
  }

  triangleBudget(): number {
    return triangleCount(this.ringGeometry) * 2 +
      triangleCount(this.relicGeometry) +
      triangleCount(this.miriGeometry) +
      triangleCount(this.neriGeometry);
  }

  additionalDrawCalls(): number {
    return 4;
  }

  dispose(): void {
    this.ringGeometry.dispose();
    this.relicGeometry.dispose();
    this.miriGeometry.dispose();
    this.neriGeometry.dispose();
  }

  private updateActor(
    mesh: THREE.InstancedMesh,
    actor: R3ActorPresentation,
    elapsedSec: number,
    reducedMotion: boolean,
    role: "relic" | "miri" | "neri",
  ): void {
    mesh.visible = actor.visible;
    mesh.count = actor.visible ? 1 : 0;
    if (!actor.visible) return;
    const motion = reducedMotion ? 0 : 1;
    const frequency = role === "miri" ? 1.65 : role === "neri" ? 2.75 : 3.8;
    const bob = Math.sin(elapsedSec * frequency) *
      (role === "relic" ? 0.09 : role === "miri" ? 0.1 : 0.13) * motion;
    this.position.set(actor.lateral, actor.height + bob, -actor.distance);
    if (role === "relic") {
      this.rotation.set(elapsedSec * 0.55 * motion, elapsedSec * 1.25 * motion, 0);
    } else {
      const lookTowardGlowfin = Math.sign(actor.lateral) *
        (role === "miri" ? 0.2 : 0.38);
      const yaw = lookTowardGlowfin +
        Math.sin(elapsedSec * (role === "miri" ? 0.8 : 1.8)) *
        (role === "miri" ? 0.035 : 0.075) * motion;
      const pitch = (role === "miri" ? 0.18 : -0.04) +
        Math.sin(elapsedSec * 1.25) * 0.025 * motion;
      const roll = Math.sin(elapsedSec * (role === "miri" ? 1.35 : 2.25) +
        (role === "miri" ? 0 : 1.2)) *
        (role === "miri" ? 0.075 : 0.11) * motion;
      this.rotation.set(pitch, yaw, roll);
    }
    this.quaternion.setFromEuler(this.rotation);
    const pulse = role === "relic" && !reducedMotion
      ? 1 + Math.sin(elapsedSec * 4) * 0.08
      : 1;
    this.scale.setScalar(Math.max(TINY_SCALE, actor.scale * pulse));
    if (!reducedMotion && role === "miri") {
      this.scale.x *= 1 + Math.sin(elapsedSec * 1.65) * 0.025;
      this.scale.y *= 1 + Math.sin(elapsedSec * 1.65 + 0.7) * 0.045;
    } else if (!reducedMotion && role === "neri") {
      this.scale.z *= 1 + Math.sin(elapsedSec * 2.8) * 0.018;
    }
    this.matrix.compose(this.position, this.quaternion, this.scale);
    mesh.setMatrixAt(0, this.matrix);
    mesh.setColorAt(0, this.colour.set(actor.colour));
    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
  }
}
