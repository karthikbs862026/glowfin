import * as THREE from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";

const BODY_RINGS = 34;
const BODY_RADIAL_SEGMENTS = 14;
const BELLY_RADIAL_SEGMENTS = 7;
const FEATURE_SEGMENTS = 17;
const ARMOUR_SEGMENTS = 12;
const DORSAL_SEGMENTS = 10;
const LUMINOUS_MARKS = 8;
const GILL_SLOTS = 6;
const BROW_CRESTS = 4;
const TEETH = 12;

export interface LeviathanRigMaterials {
  body: THREE.MeshPhysicalMaterial;
  accent: THREE.MeshStandardMaterial;
  luminous: THREE.MeshStandardMaterial;
}

export interface LeviathanRigResources {
  sphere: THREE.SphereGeometry;
  duskHead: THREE.BufferGeometry;
  moonHead: THREE.BufferGeometry;
  jaw: THREE.BufferGeometry;
  armourPlate: THREE.BufferGeometry;
  dorsalFin: THREE.BufferGeometry;
  pectoralFin: THREE.BufferGeometry;
  verticalTail: THREE.BufferGeometry;
  moonMark: THREE.BufferGeometry;
  tooth: THREE.ConeGeometry;
  gillSlot: THREE.BoxGeometry;
}

export interface LeviathanRigStyle {
  name: string;
  bodyRadius: number;
  bodyLength: number;
  headScale: number;
  waveAmplitude: number;
  swimRate: number;
  moonKind: boolean;
}

export interface LeviathanRigPose {
  elapsedSec: number;
  reducedMotion: boolean;
  intensity: number;
  jawOpen: number;
  finStroke: number;
  awakening: number;
  armourDamage?: number;
  damageFlash?: number;
}

function mergeOrThrow(geometries: THREE.BufferGeometry[]): THREE.BufferGeometry {
  const merged = mergeGeometries(geometries, false);
  if (!merged) throw new Error("Leviathan profile geometry did not merge.");
  for (const geometry of geometries) geometry.dispose();
  merged.computeVertexNormals();
  merged.computeBoundingSphere();
  return merged;
}

function transformedSphere(
  scale: readonly [number, number, number],
  position: readonly [number, number, number],
): THREE.BufferGeometry {
  const geometry = new THREE.SphereGeometry(1, 22, 14);
  geometry.scale(...scale);
  geometry.translate(...position);
  return geometry;
}

function createHeadGeometry(moonKind: boolean): THREE.BufferGeometry {
  if (moonKind) {
    return mergeOrThrow([
      transformedSphere([1.38, 0.7, 0.76], [0.2, 0.08, 0]),
      transformedSphere([1.1, 0.4, 0.54], [1.42, -0.05, 0]),
      transformedSphere([0.94, 0.64, 0.68], [-0.92, 0.02, 0]),
    ]);
  }
  return mergeOrThrow([
    transformedSphere([1.3, 0.66, 0.72], [0.1, 0.1, 0]),
    transformedSphere([1.22, 0.38, 0.48], [1.45, -0.12, 0]),
    transformedSphere([0.9, 0.58, 0.62], [-0.94, 0.02, 0]),
  ]);
}

function createJawGeometry(): THREE.BufferGeometry {
  return mergeOrThrow([
    transformedSphere([1.1, 0.19, 0.46], [0.82, 0, 0]),
    transformedSphere([0.54, 0.17, 0.4], [1.7, 0.02, 0]),
  ]);
}

function createPectoralFinGeometry(): THREE.BufferGeometry {
  const shape = new THREE.Shape();
  shape.moveTo(0.2, 0.14);
  shape.bezierCurveTo(-0.62, -0.04, -1.6, -0.5, -3.15, -1.72);
  shape.bezierCurveTo(-2.22, -1.74, -0.9, -1.1, -0.1, -0.3);
  shape.closePath();
  const geometry = new THREE.ExtrudeGeometry(shape, {
    depth: 0.16,
    bevelEnabled: true,
    bevelSegments: 1,
    bevelSize: 0.045,
    bevelThickness: 0.04,
    curveSegments: 8,
  });
  geometry.translate(0, 0, -0.08);
  geometry.computeVertexNormals();
  return geometry;
}

function createDorsalFinGeometry(): THREE.BufferGeometry {
  const shape = new THREE.Shape();
  shape.moveTo(0.5, 0);
  shape.bezierCurveTo(0.18, 0.45, -0.18, 1.3, -0.95, 1.95);
  shape.bezierCurveTo(-0.72, 0.8, -0.45, 0.16, -0.65, 0);
  shape.closePath();
  const geometry = new THREE.ExtrudeGeometry(shape, {
    depth: 0.12,
    bevelEnabled: true,
    bevelSegments: 1,
    bevelSize: 0.035,
    bevelThickness: 0.035,
    curveSegments: 7,
  });
  geometry.translate(0, 0, -0.06);
  geometry.computeVertexNormals();
  return geometry;
}

function createVerticalTailGeometry(): THREE.BufferGeometry {
  const shape = new THREE.Shape();
  shape.moveTo(0.18, 0.08);
  shape.bezierCurveTo(-0.5, 0.38, -1.15, 1.65, -2.72, 2.18);
  shape.bezierCurveTo(-2.38, 0.84, -1.18, 0.18, -0.16, 0);
  shape.bezierCurveTo(-1.18, -0.18, -2.38, -0.84, -2.72, -2.18);
  shape.bezierCurveTo(-1.15, -1.65, -0.5, -0.38, 0.18, -0.08);
  shape.closePath();
  const geometry = new THREE.ExtrudeGeometry(shape, {
    depth: 0.2,
    bevelEnabled: true,
    bevelSegments: 1,
    bevelSize: 0.055,
    bevelThickness: 0.05,
    curveSegments: 10,
  });
  geometry.translate(0, 0, -0.1);
  geometry.computeVertexNormals();
  return geometry;
}

function createDynamicBodyGeometry(underbelly: boolean): THREE.BufferGeometry {
  const radialSegments = underbelly ? BELLY_RADIAL_SEGMENTS : BODY_RADIAL_SEGMENTS;
  const positions = new Float32Array(BODY_RINGS * radialSegments * 3);
  const normals = new Float32Array(positions.length);
  const uvs = new Float32Array(BODY_RINGS * radialSegments * 2);
  const indices: number[] = [];
  for (let ring = 0; ring < BODY_RINGS; ring += 1) {
    for (let side = 0; side < radialSegments; side += 1) {
      const uv = (ring * radialSegments + side) * 2;
      uvs[uv] = ring / Math.max(1, BODY_RINGS - 1);
      uvs[uv + 1] = side / Math.max(1, radialSegments - (underbelly ? 1 : 0));
    }
  }
  for (let ring = 0; ring < BODY_RINGS - 1; ring += 1) {
    const sideLimit = underbelly ? radialSegments - 1 : radialSegments;
    for (let side = 0; side < sideLimit; side += 1) {
      const nextSide = underbelly ? side + 1 : (side + 1) % radialSegments;
      const a = ring * radialSegments + side;
      const b = ring * radialSegments + nextSide;
      const c = (ring + 1) * radialSegments + side;
      const d = (ring + 1) * radialSegments + nextSide;
      indices.push(a, c, b, b, c, d);
    }
  }
  const geometry = new THREE.BufferGeometry();
  const positionAttribute = new THREE.BufferAttribute(positions, 3);
  const normalAttribute = new THREE.BufferAttribute(normals, 3);
  positionAttribute.setUsage(THREE.DynamicDrawUsage);
  normalAttribute.setUsage(THREE.DynamicDrawUsage);
  geometry.setAttribute("position", positionAttribute);
  geometry.setAttribute("normal", normalAttribute);
  geometry.setAttribute("uv", new THREE.BufferAttribute(uvs, 2));
  geometry.setIndex(indices);
  geometry.boundingSphere = new THREE.Sphere(new THREE.Vector3(-9, 0, 0), 24);
  return geometry;
}

export function createLeviathanRigResources(): LeviathanRigResources {
  const armourPlate = new THREE.IcosahedronGeometry(1, 0);
  armourPlate.scale(0.92, 0.28, 0.68);
  // Sparse, scale-like dorsal marks replace the old torus bands. They sit on
  // the creature's back and never wrap around the body like artificial rings.
  const moonMark = new THREE.CapsuleGeometry(0.08, 0.58, 3, 7);
  moonMark.rotateZ(Math.PI / 2);
  return {
    sphere: new THREE.SphereGeometry(1, 18, 12),
    duskHead: createHeadGeometry(false),
    moonHead: createHeadGeometry(true),
    jaw: createJawGeometry(),
    armourPlate,
    dorsalFin: createDorsalFinGeometry(),
    pectoralFin: createPectoralFinGeometry(),
    verticalTail: createVerticalTailGeometry(),
    moonMark,
    tooth: new THREE.ConeGeometry(0.08, 0.32, 6),
    gillSlot: new THREE.BoxGeometry(0.08, 0.46, 0.07),
  };
}

export function disposeLeviathanRigResources(resources: LeviathanRigResources): void {
  resources.sphere.dispose();
  resources.duskHead.dispose();
  resources.moonHead.dispose();
  resources.jaw.dispose();
  resources.armourPlate.dispose();
  resources.dorsalFin.dispose();
  resources.pectoralFin.dispose();
  resources.verticalTail.dispose();
  resources.moonMark.dispose();
  resources.tooth.dispose();
  resources.gillSlot.dispose();
}

function mark<T extends THREE.Object3D>(object: T, name: string): T {
  object.name = name;
  object.userData["realm"] = "leviathan-graveyard";
  object.userData["nonCollidable"] = true;
  object.userData["actualThreeDimensionalGeometry"] = true;
  return object;
}

function prepareInstanced(
  geometry: THREE.BufferGeometry,
  material: THREE.Material,
  count: number,
  name: string,
): THREE.InstancedMesh {
  const mesh = mark(new THREE.InstancedMesh(geometry, material, count), name);
  mesh.count = count;
  mesh.frustumCulled = false;
  mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  return mesh;
}

/**
 * A phone-readable leviathan authored head-first on local +X. The encounter
 * rotates +X onto world -Z for a forward chase, then eases the whole animal
 * through small banks and deliberate attack turns. The articulated body still
 * supplies a continuous head-to-tail wave instead of disconnected poses.
 */
export class LeviathanRig {
  readonly group: THREE.Group;

  private readonly bodyGeometry = createDynamicBodyGeometry(false);
  private readonly bellyGeometry = createDynamicBodyGeometry(true);
  private readonly body: THREE.Mesh;
  private readonly belly: THREE.Mesh;
  private readonly armour: THREE.InstancedMesh;
  private readonly dorsal: THREE.InstancedMesh;
  private readonly moonMarks: THREE.InstancedMesh;
  private readonly head: THREE.Mesh;
  private readonly jawPivot = new THREE.Group();
  private readonly jaw: THREE.Mesh;
  private readonly eyes: THREE.InstancedMesh;
  private readonly gills: THREE.InstancedMesh;
  private readonly browCrests: THREE.InstancedMesh;
  private readonly teeth: THREE.InstancedMesh;
  private readonly nearPectoral: THREE.Mesh;
  private readonly farPectoral: THREE.Mesh;
  private readonly tail: THREE.Mesh;

  private readonly dummy = new THREE.Object3D();
  private readonly baseAxis = new THREE.Vector3(-1, 0, 0);
  private readonly previous = new THREE.Vector3();
  private readonly next = new THREE.Vector3();
  private readonly tangent = new THREE.Vector3();
  private readonly centre = new THREE.Vector3();
  private readonly nodePositions: THREE.Vector3[] = [];
  private readonly nodeQuaternions: THREE.Quaternion[] = [];

  constructor(
    resources: LeviathanRigResources,
    private readonly materials: LeviathanRigMaterials,
    private readonly style: LeviathanRigStyle,
  ) {
    this.group = mark(new THREE.Group(), `${style.name}-forward-chase-articulated-3d-rig`);
    this.group.userData["orientationContract"] =
      "head-leads-negative-world-z-tail-trails-toward-camera-through-smooth-full-lane-curves";
    this.group.userData["silhouette"] =
      "long-serpentine-body-elongated-skull-visible-eye-gills-pectoral-fins-dorsal-crest-vertical-tail";
    this.group.userData["animation"] =
      "continuous-head-to-tail-travelling-wave-jaw-fin-bank-flank-turn-charge-fire-counter-hit-and-return";

    this.body = mark(
      new THREE.Mesh(this.bodyGeometry, materials.body),
      `${style.name}-continuous-forward-serpentine-body`,
    );
    this.body.frustumCulled = false;
    this.belly = mark(
      new THREE.Mesh(this.bellyGeometry, materials.accent),
      `${style.name}-continuous-longitudinal-underbelly`,
    );
    this.belly.frustumCulled = false;
    this.armour = prepareInstanced(
      resources.armourPlate,
      materials.body,
      ARMOUR_SEGMENTS,
      `${style.name}-overlapping-dorsolateral-armour-scales`,
    );
    this.dorsal = prepareInstanced(
      resources.dorsalFin,
      materials.accent,
      DORSAL_SEGMENTS,
      `${style.name}-continuous-read-dorsal-fin-crest`,
    );
    this.moonMarks = prepareInstanced(
      resources.moonMark,
      materials.luminous,
      LUMINOUS_MARKS,
      `${style.name}-sparse-dorsal-moon-marks-never-body-rings`,
    );

    this.head = mark(
      new THREE.Mesh(style.moonKind ? resources.moonHead : resources.duskHead, materials.body),
      `${style.name}-elongated-three-dimensional-skull-and-forward-snout`,
    );
    this.head.scale.setScalar(style.headScale);
    this.jaw = mark(
      new THREE.Mesh(resources.jaw, materials.accent),
      `${style.name}-hinged-lower-jaw-visible-during-mouth-attacks`,
    );
    this.jaw.scale.setScalar(style.headScale);
    this.jawPivot.position.set(0.3 * style.headScale, -0.34 * style.headScale, 0);
    this.jaw.position.set(-0.3 * style.headScale, 0, 0);
    mark(this.jawPivot, `${style.name}-visible-anatomical-jaw-hinge`);
    this.jawPivot.add(this.jaw);

    this.eyes = prepareInstanced(
      resources.sphere,
      materials.luminous,
      2,
      `${style.name}-paired-eyes-ahead-of-gills`,
    );
    this.gills = prepareInstanced(
      resources.gillSlot,
      materials.luminous,
      GILL_SLOTS,
      `${style.name}-three-gill-slots-on-each-side`,
    );
    this.browCrests = prepareInstanced(
      resources.dorsalFin,
      materials.accent,
      BROW_CRESTS,
      `${style.name}-crowned-brow-crests-behind-eyes`,
    );
    this.teeth = prepareInstanced(
      resources.tooth,
      materials.accent,
      TEETH,
      `${style.name}-restrained-mouth-teeth`,
    );
    this.teeth.count = style.moonKind ? 0 : TEETH;

    this.nearPectoral = mark(
      new THREE.Mesh(resources.pectoralFin, materials.accent),
      `${style.name}-near-side-swept-pectoral-fin`,
    );
    this.farPectoral = mark(
      new THREE.Mesh(resources.pectoralFin, materials.body),
      `${style.name}-far-side-swept-pectoral-fin`,
    );
    this.nearPectoral.position.set(-0.65 * style.headScale, -0.12, 0.72 * style.headScale);
    this.farPectoral.position.set(-0.72 * style.headScale, -0.02, -0.68 * style.headScale);
    this.nearPectoral.scale.setScalar(style.moonKind ? 1.34 : 1.12);
    this.farPectoral.scale.setScalar(style.moonKind ? 1.08 : 0.9);
    this.tail = mark(
      new THREE.Mesh(resources.verticalTail, materials.accent),
      `${style.name}-large-vertical-caudal-tail-clearly-trailing-head`,
    );

    this.group.add(
      this.body,
      this.belly,
      this.armour,
      this.dorsal,
      this.moonMarks,
      this.head,
      this.jawPivot,
      this.eyes,
      this.gills,
      this.browCrests,
      this.teeth,
      this.farPectoral,
      this.nearPectoral,
      this.tail,
    );

    for (let index = 0; index < FEATURE_SEGMENTS; index += 1) {
      this.nodePositions.push(new THREE.Vector3());
      this.nodeQuaternions.push(new THREE.Quaternion());
    }
    this.installHeadDetails();
    this.update({
      elapsedSec: 0,
      reducedMotion: true,
      intensity: 0,
      jawOpen: 0,
      finStroke: 0,
      awakening: style.moonKind ? 0 : 1,
    });
  }

  private setInstance(
    mesh: THREE.InstancedMesh,
    index: number,
    position: readonly [number, number, number],
    rotation: readonly [number, number, number],
    scale: readonly [number, number, number],
  ): void {
    this.dummy.position.set(...position);
    this.dummy.rotation.set(...rotation);
    this.dummy.scale.set(...scale);
    this.dummy.updateMatrix();
    mesh.setMatrixAt(index, this.dummy.matrix);
  }

  private installHeadDetails(): void {
    const h = this.style.headScale;
    for (const [index, side] of [-1, 1].entries()) {
      this.setInstance(
        this.eyes,
        index,
        [h * 0.92, h * 0.35, side * h * 0.58],
        [0, 0, 0],
        [h * 0.18, h * 0.14, h * 0.11],
      );
    }
    this.eyes.instanceMatrix.needsUpdate = true;

    for (let index = 0; index < GILL_SLOTS; index += 1) {
      const side = index < GILL_SLOTS / 2 ? -1 : 1;
      const row = index % (GILL_SLOTS / 2);
      this.setInstance(
        this.gills,
        index,
        [h * (-0.18 - row * 0.22), h * (0.04 - row * 0.08), side * h * 0.69],
        [0, 0, -0.18],
        [h * 0.74, h * (0.84 - row * 0.08), h * 0.72],
      );
    }
    this.gills.instanceMatrix.needsUpdate = true;

    for (let index = 0; index < BROW_CRESTS; index += 1) {
      const fraction = index / Math.max(1, BROW_CRESTS - 1);
      this.setInstance(
        this.browCrests,
        index,
        [h * (0.46 - fraction * 0.62), h * (0.58 + fraction * 0.05), h * (index % 2 === 0 ? 0.18 : -0.18)],
        [0, 0, -0.18 + fraction * 0.12],
        [h * 0.28, h * (0.34 + fraction * 0.12), h * 0.42],
      );
    }
    this.browCrests.instanceMatrix.needsUpdate = true;

    for (let index = 0; index < TEETH; index += 1) {
      const upper = index < TEETH / 2;
      const row = index % (TEETH / 2);
      this.setInstance(
        this.teeth,
        index,
        [h * (0.62 + row * 0.2), h * (upper ? -0.31 : -0.46), h * (row % 2 === 0 ? 0.17 : -0.17)],
        [0, 0, upper ? Math.PI : 0],
        [h * 0.72, h * 0.72, h * 0.72],
      );
    }
    this.teeth.instanceMatrix.needsUpdate = true;
  }

  private bodyPoint(
    fraction: number,
    elapsedSec: number,
    motion: number,
    target: THREE.Vector3,
  ): THREE.Vector3 {
    const phase = elapsedSec * this.style.swimRate - fraction * Math.PI * 4.8;
    const amplitude = this.style.waveAmplitude * (0.08 + fraction * fraction * 0.92);
    return target.set(
      -1.02 * this.style.headScale - fraction * this.style.bodyLength,
      Math.sin(phase) * amplitude * motion,
      Math.cos(phase * 0.86 + 0.4) * amplitude * 0.11 * motion,
    );
  }

  private updateBodySurface(
    geometry: THREE.BufferGeometry,
    underbelly: boolean,
    elapsedSec: number,
    motion: number,
  ): void {
    const radialSegments = underbelly ? BELLY_RADIAL_SEGMENTS : BODY_RADIAL_SEGMENTS;
    const positions = geometry.getAttribute("position");
    const normals = geometry.getAttribute("normal");
    for (let ring = 0; ring < BODY_RINGS; ring += 1) {
      const fraction = ring / Math.max(1, BODY_RINGS - 1);
      this.bodyPoint(fraction, elapsedSec, motion, this.centre);
      const taper = Math.pow(1 - fraction, 0.72);
      const radius = this.style.bodyRadius * (0.2 + taper * 0.8) *
        (1 + Math.sin(fraction * Math.PI) * 0.12);
      for (let side = 0; side < radialSegments; side += 1) {
        const angle = underbelly
          ? Math.PI * 0.62 + side / Math.max(1, radialSegments - 1) * Math.PI * 0.76
          : side / radialSegments * Math.PI * 2;
        const outward = underbelly ? 1.025 : 1;
        const cos = Math.cos(angle);
        const sin = Math.sin(angle);
        const vertex = ring * radialSegments + side;
        positions.setXYZ(
          vertex,
          this.centre.x,
          this.centre.y + cos * radius * outward,
          this.centre.z + sin * radius * 0.72 * outward,
        );
        normals.setXYZ(vertex, 0, cos, sin);
      }
    }
    positions.needsUpdate = true;
    normals.needsUpdate = true;
  }

  update(pose: LeviathanRigPose): void {
    const motion = pose.reducedMotion ? 0 : 1;
    this.updateBodySurface(this.bodyGeometry, false, pose.elapsedSec, motion);
    this.updateBodySurface(this.bellyGeometry, true, pose.elapsedSec, motion);

    for (let index = 0; index < FEATURE_SEGMENTS; index += 1) {
      const fraction = index / Math.max(1, FEATURE_SEGMENTS - 1);
      const position = this.nodePositions[index]!;
      this.bodyPoint(fraction, pose.elapsedSec, motion, position);
      this.bodyPoint(Math.max(0, fraction - 0.018), pose.elapsedSec, motion, this.previous);
      this.bodyPoint(Math.min(1, fraction + 0.018), pose.elapsedSec, motion, this.next);
      this.tangent.subVectors(this.next, this.previous).normalize();
      const quaternion = this.nodeQuaternions[index]!;
      quaternion.setFromUnitVectors(this.baseAxis, this.tangent);
      const radius = this.style.bodyRadius * (0.2 + Math.pow(1 - fraction, 0.72) * 0.8);

      if (index < ARMOUR_SEGMENTS) {
        this.dummy.position.copy(position);
        this.dummy.position.y += radius * 0.7;
        this.dummy.quaternion.copy(quaternion);
        this.dummy.scale.set(radius * 0.72, radius * 0.34, radius * 0.62);
        this.dummy.updateMatrix();
        this.armour.setMatrixAt(index, this.dummy.matrix);
      }
      if (index < DORSAL_SEGMENTS) {
        this.dummy.position.copy(position);
        this.dummy.position.y += radius * 0.64;
        this.dummy.quaternion.copy(quaternion);
        this.dummy.scale.set(radius * 0.7, radius * (0.58 + fraction * 0.4), radius * 0.66);
        this.dummy.updateMatrix();
        this.dorsal.setMatrixAt(index, this.dummy.matrix);
      }
      if (index < LUMINOUS_MARKS) {
        this.dummy.position.copy(position);
        this.dummy.position.y += radius * 0.94;
        this.dummy.quaternion.copy(quaternion);
        this.dummy.scale.set(
          radius * (0.76 + pose.intensity * 0.04),
          radius * 0.72,
          radius * 0.78,
        );
        this.dummy.updateMatrix();
        this.moonMarks.setMatrixAt(index, this.dummy.matrix);
      }
    }
    const armourDamage = THREE.MathUtils.clamp(pose.armourDamage ?? 0, 0, 1);
    this.armour.count = this.style.moonKind
      ? 5
      : Math.max(0, ARMOUR_SEGMENTS - Math.round(armourDamage * ARMOUR_SEGMENTS));
    this.moonMarks.count = LUMINOUS_MARKS;
    for (const mesh of [this.armour, this.dorsal, this.moonMarks]) {
      mesh.instanceMatrix.needsUpdate = true;
    }

    const tailPosition = this.nodePositions[FEATURE_SEGMENTS - 1]!;
    const tailQuaternion = this.nodeQuaternions[FEATURE_SEGMENTS - 1]!;
    this.tail.position.copy(tailPosition);
    this.tail.quaternion.copy(tailQuaternion);
    this.tail.rotateX(Math.sin(pose.elapsedSec * this.style.swimRate - 4.8 * Math.PI) * 0.1 * motion);
    this.tail.scale.setScalar(this.style.bodyRadius * 0.72);

    this.jawPivot.rotation.z = -THREE.MathUtils.clamp(pose.jawOpen, 0, 1) * 0.34;
    const finStroke = THREE.MathUtils.clamp(pose.finStroke, -1, 1) * motion;
    this.nearPectoral.rotation.z = -0.12 + finStroke * 0.16;
    this.farPectoral.rotation.z = 0.08 - finStroke * 0.1;
    this.nearPectoral.rotation.x = -0.1 + finStroke * 0.08;
    this.farPectoral.rotation.x = 0.12 - finStroke * 0.05;

    const awakening = THREE.MathUtils.clamp(pose.awakening, 0, 1);
    if (this.style.moonKind) {
      this.materials.body.emissiveIntensity = 0.08 + awakening * 0.42;
      this.materials.accent.emissiveIntensity = 0.12 + awakening * 0.58;
      this.materials.luminous.emissiveIntensity = 1.2 + awakening * 1.9;
      this.materials.body.opacity = 0.72 + awakening * 0.28;
      this.materials.accent.opacity = 0.68 + awakening * 0.32;
    } else {
      const flash = THREE.MathUtils.clamp(pose.damageFlash ?? 0, 0, 1);
      this.materials.body.emissiveIntensity = 0.1 + pose.intensity * 0.2 + flash * 0.9;
      this.materials.accent.emissiveIntensity = 0.08 + pose.intensity * 0.2 + flash * 0.65;
      this.materials.luminous.emissiveIntensity = 1.5 + pose.intensity * 1.35 + flash * 1.4;
    }
  }

  /** World-space origin used by every authored mouth attack. */
  mouthWorldPosition(target = new THREE.Vector3()): THREE.Vector3 {
    this.group.updateWorldMatrix(true, false);
    return target
      .set(this.style.headScale * 2.05, -this.style.headScale * 0.24, 0)
      .applyMatrix4(this.group.matrixWorld);
  }

  /** World-space head/tail anchors used by deterministic orientation tests. */
  headWorldPosition(target = new THREE.Vector3()): THREE.Vector3 {
    this.group.updateWorldMatrix(true, false);
    return target.set(this.style.headScale * 1.9, 0, 0).applyMatrix4(this.group.matrixWorld);
  }

  tailWorldPosition(target = new THREE.Vector3()): THREE.Vector3 {
    this.group.updateWorldMatrix(true, false);
    return target
      .set(-this.style.headScale - this.style.bodyLength, 0, 0)
      .applyMatrix4(this.group.matrixWorld);
  }

  drawCalls(): number {
    return 14;
  }

  triangleBudget(resources: LeviathanRigResources): number {
    const triangles = (geometry: THREE.BufferGeometry): number => geometry.index
      ? geometry.index.count / 3
      : (geometry.getAttribute("position")?.count ?? 0) / 3;
    return Math.ceil(
      triangles(this.bodyGeometry) +
      triangles(this.bellyGeometry) +
      triangles(resources.sphere) * 2 +
      triangles(this.style.moonKind ? resources.moonHead : resources.duskHead) +
      triangles(resources.jaw) +
      triangles(resources.armourPlate) * ARMOUR_SEGMENTS +
      triangles(resources.dorsalFin) * (DORSAL_SEGMENTS + BROW_CRESTS) +
      triangles(resources.moonMark) * LUMINOUS_MARKS +
      triangles(resources.pectoralFin) * 2 +
      triangles(resources.tooth) * (this.style.moonKind ? 0 : TEETH) +
      triangles(resources.gillSlot) * GILL_SLOTS +
      triangles(resources.verticalTail)
    );
  }

  dispose(): void {
    this.bodyGeometry.dispose();
    this.bellyGeometry.dispose();
  }
}
