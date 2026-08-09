import * as THREE from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";

import type { TideSprintCharacterId } from "./crew";

export const TIDE_SPRINT_FORWARD_AXIS = [0, 0, -1] as const;

export const TIDE_SPRINT_CHARACTER_ANATOMY: Readonly<Record<
  TideSprintCharacterId,
  { faceZ: number; tailZ: number; silhouette: string }
>> = Object.freeze({
  glowfin: { faceZ: -1.06, tailZ: 1.74, silhouette: "axolotl-lightbearer" },
  neri: { faceZ: -1.56, tailZ: 1.72, silhouette: "moon-dolphin" },
  coralyn: { faceZ: -1.18, tailZ: 1.54, silhouette: "reef-guardian-fish" },
  miri: { faceZ: -1.12, tailZ: 2.28, silhouette: "baby-manta" },
});

export interface TideSprintCharacterMaterials {
  surface: THREE.MeshStandardMaterial;
  face: THREE.MeshBasicMaterial;
}

export interface TideSprintCharacterRig {
  readonly character: TideSprintCharacterId;
  readonly group: THREE.Group;
  animate(elapsedSec: number, speed01: number, bank: number): void;
  dispose(): void;
}

type LoftRing = readonly [z: number, halfWidth: number, halfHeight: number, lift?: number];

interface PartTransform {
  position?: THREE.Vector3;
  rotation?: THREE.Euler;
  scale?: THREE.Vector3;
}

interface RigMotion {
  leftFin?: THREE.Group;
  rightFin?: THREE.Group;
  tail?: THREE.Group;
  body?: THREE.Mesh;
}

function createLoftGeometry(
  rings: readonly LoftRing[],
  radialSegments = 18,
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
  const first = rings[0]!;
  const last = rings[rings.length - 1]!;
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
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  return geometry;
}

function transformedColourGeometry(
  source: THREE.BufferGeometry,
  colour: THREE.ColorRepresentation,
  transform: PartTransform = {},
): THREE.BufferGeometry {
  const geometry = source.index ? source.toNonIndexed() : source.clone();
  source.dispose();
  geometry.applyMatrix4(new THREE.Matrix4().compose(
    transform.position ?? new THREE.Vector3(),
    new THREE.Quaternion().setFromEuler(transform.rotation ?? new THREE.Euler()),
    transform.scale ?? new THREE.Vector3(1, 1, 1),
  ));
  for (const attribute of Object.keys(geometry.attributes)) {
    if (attribute !== "position" && attribute !== "normal") {
      geometry.deleteAttribute(attribute);
    }
  }
  geometry.computeVertexNormals();
  const count = geometry.getAttribute("position").count;
  const tint = new THREE.Color(colour);
  const colours = new Float32Array(count * 3);
  for (let index = 0; index < count; index += 1) {
    colours[index * 3] = tint.r;
    colours[index * 3 + 1] = tint.g;
    colours[index * 3 + 2] = tint.b;
  }
  geometry.setAttribute("color", new THREE.Float32BufferAttribute(colours, 3));
  return geometry;
}

function mergeParts(parts: THREE.BufferGeometry[]): THREE.BufferGeometry {
  const geometry = mergeGeometries(parts, false);
  for (const part of parts) part.dispose();
  if (!geometry) throw new Error("Tide Sprint character geometry could not be merged.");
  geometry.computeBoundingBox();
  geometry.computeBoundingSphere();
  return geometry;
}

function createMesh(
  geometry: THREE.BufferGeometry,
  material: THREE.Material,
  geometries: THREE.BufferGeometry[],
): THREE.Mesh {
  geometries.push(geometry);
  const mesh = new THREE.Mesh(geometry, material);
  mesh.frustumCulled = false;
  return mesh;
}

function createEyeGeometry(
  positions: readonly [number, number, number][],
  radius: number,
  depth: number,
  colour: THREE.ColorRepresentation,
): THREE.BufferGeometry {
  return mergeParts(positions.map(([x, y, z]) => transformedColourGeometry(
    new THREE.SphereGeometry(1, 10, 7),
    colour,
    {
      position: new THREE.Vector3(x, y, z),
      scale: new THREE.Vector3(radius, radius * 0.94, depth),
    },
  )));
}

function addFace(
  group: THREE.Group,
  geometries: THREE.BufferGeometry[],
  faceMaterial: THREE.MeshBasicMaterial,
  eyes: readonly [number, number, number][],
  radius: number,
): void {
  const whites = createMesh(
    createEyeGeometry(eyes, radius, radius * 0.54, 0xeaffff),
    faceMaterial,
    geometries,
  );
  const pupils = createMesh(
    createEyeGeometry(
      eyes.map(([x, y, z]) => [x, y - radius * 0.02, z - radius * 0.47]),
      radius * 0.48,
      radius * 0.25,
      0x071124,
    ),
    faceMaterial,
    geometries,
  );
  const catchlights = createMesh(
    createEyeGeometry(
      eyes.map(([x, y, z]) => [
        x - Math.sign(x) * radius * 0.14,
        y + radius * 0.2,
        z - radius * 0.66,
      ]),
      radius * 0.14,
      radius * 0.09,
      0xffffff,
    ),
    faceMaterial,
    geometries,
  );
  group.add(whites, pupils, catchlights);
}

function createFinPivot(
  geometry: THREE.BufferGeometry,
  material: THREE.Material,
  geometries: THREE.BufferGeometry[],
  position: THREE.Vector3,
): THREE.Group {
  const pivot = new THREE.Group();
  pivot.position.copy(position);
  pivot.add(createMesh(geometry, material, geometries));
  return pivot;
}

class ProceduralRaceRig implements TideSprintCharacterRig {
  readonly group = new THREE.Group();

  constructor(
    readonly character: TideSprintCharacterId,
    private readonly geometries: THREE.BufferGeometry[],
    private readonly motion: RigMotion,
  ) {
    this.group.userData["character"] = character;
    this.group.userData["forwardAxis"] = "-z";
    this.group.userData["faceZ"] = TIDE_SPRINT_CHARACTER_ANATOMY[character].faceZ;
    this.group.userData["tailZ"] = TIDE_SPRINT_CHARACTER_ANATOMY[character].tailZ;
  }

  animate(elapsedSec: number, speed01: number, bank: number): void {
    const swim = elapsedSec * (2.4 + speed01 * 1.7);
    if (this.character === "glowfin") {
      if (this.motion.leftFin) this.motion.leftFin.rotation.z = 0.14 + Math.sin(swim) * 0.22;
      if (this.motion.rightFin) this.motion.rightFin.rotation.z = -0.14 - Math.sin(swim) * 0.22;
      if (this.motion.tail) this.motion.tail.rotation.y = Math.sin(swim * 1.16) * 0.2;
      if (this.motion.body) this.motion.body.scale.y = 1 + Math.sin(swim * 0.55) * 0.018;
    } else if (this.character === "neri") {
      if (this.motion.leftFin) this.motion.leftFin.rotation.z = 0.12 + Math.sin(swim + 0.8) * 0.09;
      if (this.motion.rightFin) this.motion.rightFin.rotation.z = -0.12 - Math.sin(swim + 0.8) * 0.09;
      if (this.motion.tail) this.motion.tail.rotation.y = Math.sin(swim * 1.35) * 0.28;
    } else if (this.character === "coralyn") {
      if (this.motion.leftFin) this.motion.leftFin.rotation.z = 0.24 + Math.sin(swim * 1.2) * 0.3;
      if (this.motion.rightFin) this.motion.rightFin.rotation.z = -0.24 - Math.sin(swim * 1.2) * 0.3;
      if (this.motion.tail) this.motion.tail.rotation.y = Math.sin(swim) * 0.24;
    } else {
      if (this.motion.tail) this.motion.tail.rotation.y = Math.sin(swim * 0.82) * 0.24;
      if (this.motion.body) {
        this.motion.body.scale.y = 1 + Math.sin(swim * 0.72) * 0.13;
        this.motion.body.scale.x = 1 - Math.sin(swim * 0.72) * 0.025;
      }
    }
    this.group.rotation.y = bank * 0.035;
  }

  dispose(): void {
    for (const geometry of this.geometries) geometry.dispose();
    this.group.removeFromParent();
  }
}

function createGlowfinRig(materials: TideSprintCharacterMaterials): TideSprintCharacterRig {
  const geometries: THREE.BufferGeometry[] = [];
  const group = new THREE.Group();
  const body = createMesh(transformedColourGeometry(createLoftGeometry([
    [-1.08, 0.38, 0.32, 0.05],
    [-0.84, 0.68, 0.57, 0.04],
    [-0.38, 0.78, 0.65, 0.01],
    [0.18, 0.75, 0.62],
    [0.7, 0.55, 0.45, -0.02],
    [1.03, 0.27, 0.22],
  ], 20), 0x11b7d4), materials.surface, geometries);
  group.add(body);

  const belly = createMesh(transformedColourGeometry(
    new THREE.SphereGeometry(1, 16, 10),
    0x9cf8ec,
    {
      position: new THREE.Vector3(0, -0.46, -0.1),
      scale: new THREE.Vector3(0.53, 0.1, 0.7),
    },
  ), materials.surface, geometries);
  group.add(belly);

  const leftFin = createFinPivot(transformedColourGeometry(
    new THREE.SphereGeometry(1, 13, 8),
    0x6cf4ee,
    {
      position: new THREE.Vector3(-0.4, 0, 0.05),
      rotation: new THREE.Euler(0.1, -0.22, -0.08),
      scale: new THREE.Vector3(0.7, 0.065, 0.43),
    },
  ), materials.surface, geometries, new THREE.Vector3(-0.5, -0.08, 0.04));
  const rightFin = createFinPivot(transformedColourGeometry(
    new THREE.SphereGeometry(1, 13, 8),
    0x6cf4ee,
    {
      position: new THREE.Vector3(0.4, 0, 0.05),
      rotation: new THREE.Euler(0.1, 0.22, 0.08),
      scale: new THREE.Vector3(0.7, 0.065, 0.43),
    },
  ), materials.surface, geometries, new THREE.Vector3(0.5, -0.08, 0.04));
  group.add(leftFin, rightFin);

  const tail = createFinPivot(transformedColourGeometry(
    new THREE.SphereGeometry(1, 14, 9),
    0x73e9e8,
    {
      position: new THREE.Vector3(0, -0.08, 0.5),
      scale: new THREE.Vector3(0.3, 0.58, 0.13),
    },
  ), materials.surface, geometries, new THREE.Vector3(0, -0.02, 1.0));
  group.add(tail);

  const gills: THREE.BufferGeometry[] = [];
  for (const side of [-1, 1]) {
    for (let index = 0; index < 3; index += 1) {
      gills.push(transformedColourGeometry(
        new THREE.SphereGeometry(1, 9, 6),
        index === 1 ? 0xc493ff : 0xff8bd0,
        {
          position: new THREE.Vector3(
            side * (0.7 + index * 0.045),
            0.36 - index * 0.27,
            -0.44 + index * 0.035,
          ),
          rotation: new THREE.Euler(0, side * 0.16, -side * (0.42 + index * 0.35)),
          scale: new THREE.Vector3(0.12, 0.34 - index * 0.025, 0.09),
        },
      ));
    }
  }
  group.add(createMesh(mergeParts(gills), materials.surface, geometries));
  addFace(group, geometries, materials.face, [
    [-0.35, 0.39, -0.86],
    [0.35, 0.39, -0.86],
  ], 0.19);

  const rig = new ProceduralRaceRig("glowfin", geometries, {
    leftFin,
    rightFin,
    tail,
    body,
  });
  rig.group.add(group);
  return rig;
}

function createNeriRig(materials: TideSprintCharacterMaterials): TideSprintCharacterRig {
  const geometries: THREE.BufferGeometry[] = [];
  const group = new THREE.Group();
  const body = createMesh(transformedColourGeometry(createLoftGeometry([
    [-1.58, 0.16, 0.12, -0.04],
    [-1.35, 0.38, 0.25, -0.01],
    [-1.04, 0.62, 0.48, 0.06],
    [-0.58, 0.7, 0.56, 0.05],
    [-0.04, 0.62, 0.5, 0.02],
    [0.55, 0.43, 0.34],
    [1.08, 0.23, 0.18],
    [1.42, 0.09, 0.075],
  ], 20), 0x435bd4), materials.surface, geometries);
  group.add(body);

  const belly = createMesh(transformedColourGeometry(
    new THREE.SphereGeometry(1, 16, 10),
    0xb9c9ff,
    {
      position: new THREE.Vector3(0, -0.42, -0.42),
      rotation: new THREE.Euler(-0.08, 0, 0),
      scale: new THREE.Vector3(0.46, 0.075, 0.78),
    },
  ), materials.surface, geometries);
  group.add(belly);

  const dorsal = createMesh(transformedColourGeometry(
    new THREE.ConeGeometry(1, 1, 7),
    0x7286f2,
    {
      position: new THREE.Vector3(0, 0.72, 0.05),
      rotation: new THREE.Euler(-0.25, 0, 0),
      scale: new THREE.Vector3(0.18, 0.55, 0.28),
    },
  ), materials.surface, geometries);
  group.add(dorsal);

  const leftFin = createFinPivot(transformedColourGeometry(
    new THREE.SphereGeometry(1, 12, 7),
    0x7d79e8,
    {
      position: new THREE.Vector3(-0.38, 0, 0),
      rotation: new THREE.Euler(0.08, -0.35, -0.12),
      scale: new THREE.Vector3(0.55, 0.055, 0.25),
    },
  ), materials.surface, geometries, new THREE.Vector3(-0.45, -0.1, -0.12));
  const rightFin = createFinPivot(transformedColourGeometry(
    new THREE.SphereGeometry(1, 12, 7),
    0x7d79e8,
    {
      position: new THREE.Vector3(0.38, 0, 0),
      rotation: new THREE.Euler(0.08, 0.35, 0.12),
      scale: new THREE.Vector3(0.55, 0.055, 0.25),
    },
  ), materials.surface, geometries, new THREE.Vector3(0.45, -0.1, -0.12));
  group.add(leftFin, rightFin);

  const flukes = mergeParts([-1, 1].map((side) => transformedColourGeometry(
    new THREE.SphereGeometry(1, 12, 7),
    0x8b78ef,
    {
      position: new THREE.Vector3(side * 0.3, 0, 0.34),
      rotation: new THREE.Euler(0.05, side * 0.25, side * 0.07),
      scale: new THREE.Vector3(0.42, 0.06, 0.3),
    },
  )));
  const tail = createFinPivot(flukes, materials.surface, geometries, new THREE.Vector3(0, 0, 1.36));
  group.add(tail);
  addFace(group, geometries, materials.face, [
    [-0.4, 0.28, -1.03],
    [0.4, 0.28, -1.03],
  ], 0.16);

  const rig = new ProceduralRaceRig("neri", geometries, { leftFin, rightFin, tail, body });
  rig.group.add(group);
  return rig;
}

function createCoralynRig(materials: TideSprintCharacterMaterials): TideSprintCharacterRig {
  const geometries: THREE.BufferGeometry[] = [];
  const group = new THREE.Group();
  const body = createMesh(transformedColourGeometry(createLoftGeometry([
    [-1.2, 0.3, 0.25, 0.03],
    [-0.92, 0.56, 0.5, 0.06],
    [-0.45, 0.68, 0.65, 0.03],
    [0.08, 0.64, 0.58],
    [0.54, 0.46, 0.42],
    [0.92, 0.18, 0.16],
  ], 18), 0xf15f8c), materials.surface, geometries);
  group.add(body);

  const belly = createMesh(transformedColourGeometry(
    new THREE.SphereGeometry(1, 14, 9),
    0xffc7c8,
    {
      position: new THREE.Vector3(0, -0.45, -0.25),
      scale: new THREE.Vector3(0.46, 0.09, 0.6),
    },
  ), materials.surface, geometries);
  group.add(belly);

  const leftFin = createFinPivot(transformedColourGeometry(
    new THREE.SphereGeometry(1, 12, 7),
    0xff9aab,
    {
      position: new THREE.Vector3(-0.42, 0, 0),
      rotation: new THREE.Euler(0.08, -0.28, -0.08),
      scale: new THREE.Vector3(0.62, 0.06, 0.31),
    },
  ), materials.surface, geometries, new THREE.Vector3(-0.5, -0.04, -0.05));
  const rightFin = createFinPivot(transformedColourGeometry(
    new THREE.SphereGeometry(1, 12, 7),
    0xff9aab,
    {
      position: new THREE.Vector3(0.42, 0, 0),
      rotation: new THREE.Euler(0.08, 0.28, 0.08),
      scale: new THREE.Vector3(0.62, 0.06, 0.31),
    },
  ), materials.surface, geometries, new THREE.Vector3(0.5, -0.04, -0.05));
  group.add(leftFin, rightFin);

  const tailFan = mergeParts([-1, 0, 1].map((slot) => transformedColourGeometry(
    new THREE.SphereGeometry(1, 11, 7),
    slot === 0 ? 0xffd476 : 0xff8c96,
    {
      position: new THREE.Vector3(slot * 0.24, slot === 0 ? 0.03 : -0.02, 0.38),
      rotation: new THREE.Euler(0, slot * 0.24, slot * 0.2),
      scale: new THREE.Vector3(0.29, slot === 0 ? 0.46 : 0.34, 0.08),
    },
  )));
  const tail = createFinPivot(tailFan, materials.surface, geometries, new THREE.Vector3(0, 0, 0.88));
  group.add(tail);

  const crest = mergeParts([-0.24, 0, 0.24].map((x) => transformedColourGeometry(
    new THREE.ConeGeometry(1, 1, 6),
    0xffd878,
    {
      position: new THREE.Vector3(x, 0.7 - Math.abs(x) * 0.35, -0.4),
      rotation: new THREE.Euler(0, 0, -x * 0.7),
      scale: new THREE.Vector3(0.09, 0.26 - Math.abs(x) * 0.18, 0.11),
    },
  )));
  group.add(createMesh(crest, materials.surface, geometries));
  addFace(group, geometries, materials.face, [
    [-0.34, 0.31, -0.82],
    [0.34, 0.31, -0.82],
  ], 0.17);

  const rig = new ProceduralRaceRig("coralyn", geometries, {
    leftFin,
    rightFin,
    tail,
    body,
  });
  rig.group.add(group);
  return rig;
}

function createMantaDiscGeometry(): THREE.BufferGeometry {
  const shape = new THREE.Shape();
  shape.moveTo(0, 1.3);
  shape.bezierCurveTo(-0.45, 1.2, -1.28, 0.72, -1.62, 0.1);
  shape.bezierCurveTo(-1.45, -0.28, -0.75, -0.68, 0, -0.78);
  shape.bezierCurveTo(0.75, -0.68, 1.45, -0.28, 1.62, 0.1);
  shape.bezierCurveTo(1.28, 0.72, 0.45, 1.2, 0, 1.3);
  shape.closePath();
  const geometry = new THREE.ExtrudeGeometry(shape, {
    depth: 0.16,
    steps: 1,
    curveSegments: 7,
    bevelEnabled: true,
    bevelSegments: 2,
    bevelSize: 0.055,
    bevelThickness: 0.045,
  });
  geometry.rotateX(-Math.PI / 2);
  geometry.translate(0, -0.08, 0);
  return geometry;
}

function createMiriRig(materials: TideSprintCharacterMaterials): TideSprintCharacterRig {
  const geometries: THREE.BufferGeometry[] = [];
  const group = new THREE.Group();
  const body = createMesh(transformedColourGeometry(
    createMantaDiscGeometry(),
    0x3ad2d1,
  ), materials.surface, geometries);
  group.add(body);

  const lobes = mergeParts([-1, 1].map((side) => transformedColourGeometry(
    new THREE.SphereGeometry(1, 10, 6),
    0x82f2e6,
    {
      position: new THREE.Vector3(side * 0.25, 0.02, -1.05),
      rotation: new THREE.Euler(0, side * 0.16, 0),
      scale: new THREE.Vector3(0.13, 0.08, 0.34),
    },
  )));
  group.add(createMesh(lobes, materials.surface, geometries));

  const tailCurve = new THREE.CatmullRomCurve3([
    new THREE.Vector3(0, 0, 0),
    new THREE.Vector3(0.04, 0.02, 0.48),
    new THREE.Vector3(-0.05, 0, 0.98),
    new THREE.Vector3(0.06, -0.02, 1.5),
  ]);
  const tail = createFinPivot(transformedColourGeometry(
    new THREE.TubeGeometry(tailCurve, 12, 0.028, 5, false),
    0x65e8dd,
  ), materials.surface, geometries, new THREE.Vector3(0, 0, 0.76));
  group.add(tail);
  addFace(group, geometries, materials.face, [
    [-0.31, 0.13, -0.72],
    [0.31, 0.13, -0.72],
  ], 0.15);

  const rig = new ProceduralRaceRig("miri", geometries, { tail, body });
  rig.group.add(group);
  return rig;
}

export function createTideSprintCharacterRig(
  character: TideSprintCharacterId,
  materials: TideSprintCharacterMaterials,
): TideSprintCharacterRig {
  if (character === "neri") return createNeriRig(materials);
  if (character === "coralyn") return createCoralynRig(materials);
  if (character === "miri") return createMiriRig(materials);
  return createGlowfinRig(materials);
}
