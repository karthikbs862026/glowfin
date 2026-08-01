import * as THREE from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import {
  MERFOLK_CHARACTER_CONTRACT,
  MERFOLK_ANIMATION
} from "../art/merfolkCharacter.ts";
import { MATERIAL_ROLE } from "./productionGeometry.ts";

const SKIN = new THREE.Color(0xb9a7c7);
const SKIN_LIGHT = new THREE.Color(0xe2d4dc);
const HAIR = new THREE.Color(0x241d62);
const HAIR_TIP = new THREE.Color(0x7a3d92);
const TAIL = new THREE.Color(0x195d83);
const TAIL_LIGHT = new THREE.Color(0x2f9cad);
const CORAL = new THREE.Color(0xb24779);
const BRONZE = new THREE.Color(0x9a6a32);
const LAPIS = new THREE.Color(0x203c83);
const CRYSTAL = new THREE.Color(0x65d6df);
const EYE_DARK = new THREE.Color(0x101b43);
const EYE_WHITE = new THREE.Color(0xfff6e8);

interface PartStyle {
  colour: THREE.Color;
  position?: THREE.Vector3;
  rotation?: THREE.Euler;
  scale?: THREE.Vector3;
  glow?: number;
  sway?: number | ((position: THREE.Vector3) => number);
  materialRole?: number;
}

function styled(
  source: THREE.BufferGeometry,
  {
    colour,
    position = new THREE.Vector3(),
    rotation = new THREE.Euler(),
    scale = new THREE.Vector3(1, 1, 1),
    glow = 0,
    sway = 0,
    materialRole = MATERIAL_ROLE.nacre
  }: PartStyle
): THREE.BufferGeometry {
  let geometry = source;
  if (geometry.index) {
    const indexed = geometry;
    geometry = geometry.toNonIndexed();
    indexed.dispose();
  }
  geometry.applyMatrix4(new THREE.Matrix4().compose(
    position,
    new THREE.Quaternion().setFromEuler(rotation),
    scale
  ));
  if (!geometry.hasAttribute("normal")) geometry.computeVertexNormals();

  const positions = geometry.getAttribute("position");
  const colours = new Float32Array(positions.count * 3);
  const glowWeights = new Float32Array(positions.count);
  const swayWeights = new Float32Array(positions.count);
  const materialRoles = new Float32Array(positions.count);
  const vertex = new THREE.Vector3();
  for (let index = 0; index < positions.count; index++) {
    colours[index * 3] = colour.r;
    colours[index * 3 + 1] = colour.g;
    colours[index * 3 + 2] = colour.b;
    glowWeights[index] = glow;
    vertex.fromBufferAttribute(positions, index);
    swayWeights[index] = typeof sway === "function" ? sway(vertex) : sway;
    materialRoles[index] = materialRole;
  }
  geometry.setAttribute("color", new THREE.BufferAttribute(colours, 3));
  geometry.setAttribute(
    "glowWeight",
    new THREE.BufferAttribute(glowWeights, 1)
  );
  geometry.setAttribute(
    "swayWeight",
    new THREE.BufferAttribute(swayWeights, 1)
  );
  geometry.setAttribute(
    "materialRole",
    new THREE.BufferAttribute(materialRoles, 1)
  );
  return geometry;
}

function merged(parts: THREE.BufferGeometry[]): THREE.BufferGeometry {
  const geometry = mergeGeometries(parts, false);
  for (const part of parts) part.dispose();
  if (!geometry) throw new Error("Merfolk geometry attributes did not match.");
  geometry.computeBoundingBox();
  geometry.computeBoundingSphere();
  return geometry;
}

function mesh(
  name: string,
  parts: THREE.BufferGeometry[],
  material: THREE.Material
): THREE.Mesh {
  const object = new THREE.Mesh(merged(parts), material);
  object.name = name;
  object.frustumCulled = false;
  object.userData["artSignature"] = MERFOLK_CHARACTER_CONTRACT.key;
  object.userData["nonCollidable"] = true;
  return object;
}

function tube(
  points: THREE.Vector3[],
  tubularSegments: number,
  radius: number,
  radialSegments: number
): THREE.TubeGeometry {
  return new THREE.TubeGeometry(
    new THREE.CatmullRomCurve3(points, false, "centripetal"),
    tubularSegments,
    radius,
    radialSegments,
    false
  );
}

function extrudedShape(
  points: THREE.Vector2[],
  depth: number,
  bevel = 0.012
): THREE.ExtrudeGeometry {
  const shape = new THREE.Shape(points);
  const geometry = new THREE.ExtrudeGeometry(shape, {
    depth,
    steps: 1,
    curveSegments: 3,
    bevelEnabled: true,
    bevelSegments: 1,
    bevelSize: bevel,
    bevelThickness: bevel
  });
  geometry.translate(0, 0, -depth * 0.5);
  return geometry;
}

function limb(
  radius: number,
  length: number,
  colour: THREE.Color,
  glow = 0.09
): THREE.BufferGeometry {
  return styled(new THREE.CapsuleGeometry(radius, length, 4, 9), {
    position: new THREE.Vector3(0, -(length * 0.5 + radius), 0),
    scale: new THREE.Vector3(0.92, 1, 0.82),
    colour,
    glow,
    materialRole: MATERIAL_ROLE.nacre
  });
}

function headGeometry(): THREE.BufferGeometry[] {
  const parts: THREE.BufferGeometry[] = [
    styled(new THREE.SphereGeometry(0.255, 18, 12), {
      position: new THREE.Vector3(0, 0.24, 0),
      scale: new THREE.Vector3(0.94, 1.06, 0.9),
      colour: SKIN_LIGHT,
      glow: 0.16,
      materialRole: MATERIAL_ROLE.nacre
    }),
    // The cap sits above the brow instead of swallowing the forehead. The
    // previous low hairline, crown and eye outlines collapsed into one dark
    // patch at phone scale.
    styled(new THREE.SphereGeometry(
      0.258,
      16,
      9,
      0,
      Math.PI * 2,
      0,
      Math.PI * 0.49
    ), {
      position: new THREE.Vector3(0, 0.335, -0.05),
      scale: new THREE.Vector3(1, 0.9, 1.02),
      colour: HAIR,
      glow: 0.12,
      materialRole: MATERIAL_ROLE.lapis
    }),
    styled(new THREE.ConeGeometry(0.03, 0.068, 7), {
      position: new THREE.Vector3(0, 0.23, 0.242),
      rotation: new THREE.Euler(Math.PI / 2, 0, 0),
      colour: SKIN,
      glow: 0.12,
      materialRole: MATERIAL_ROLE.nacre
    }),
    styled(new THREE.TorusGeometry(0.052, 0.01, 5, 14, Math.PI), {
      position: new THREE.Vector3(0, 0.142, 0.238),
      rotation: new THREE.Euler(0, 0, Math.PI),
      scale: new THREE.Vector3(1, 0.55, 1),
      colour: CORAL,
      glow: 0.22,
      materialRole: MATERIAL_ROLE.livingCoral
    }),
    // Shell tiara and central moon crystal.
    styled(new THREE.TorusGeometry(0.185, 0.018, 5, 18, Math.PI * 0.88), {
      position: new THREE.Vector3(0, 0.445, 0.09),
      rotation: new THREE.Euler(0, 0, 0.19),
      colour: BRONZE,
      glow: 0.06,
      materialRole: MATERIAL_ROLE.bronze
    }),
    styled(new THREE.OctahedronGeometry(0.045, 0), {
      position: new THREE.Vector3(0, 0.505, 0.115),
      scale: new THREE.Vector3(0.75, 1.45, 0.7),
      colour: CRYSTAL,
      glow: 0.28,
      materialRole: MATERIAL_ROLE.crystal
    })
  ];

  const cheekFin = [
    new THREE.Vector2(0, 0),
    new THREE.Vector2(0.105, 0.075),
    new THREE.Vector2(0.155, 0.015),
    new THREE.Vector2(0.1, -0.07),
    new THREE.Vector2(0, -0.035)
  ];
  for (const side of [-1, 1]) {
    parts.push(styled(extrudedShape(cheekFin, 0.025, 0.006), {
      position: new THREE.Vector3(side * 0.19, 0.225, 0.02),
      rotation: new THREE.Euler(0.08, side * -0.35, side * 0.18),
      scale: new THREE.Vector3(side, 1, 1),
      colour: CORAL,
      glow: 0.22,
      materialRole: MATERIAL_ROLE.livingCoral,
      sway: 0.2
    }));
    parts.push(styled(tube([
      new THREE.Vector3(side * 0.17, 0.34, -0.1),
      new THREE.Vector3(side * 0.25, 0.17, -0.12),
      new THREE.Vector3(side * 0.22, -0.02, -0.09)
    ], 8, 0.024, 6), {
      colour: HAIR_TIP,
      glow: 0.2,
      materialRole: MATERIAL_ROLE.livingCoral,
      sway: 0.3
    }));
  }
  return parts;
}

function eyeGeometry(): THREE.BufferGeometry[] {
  const parts: THREE.BufferGeometry[] = [];
  for (const side of [-1, 1]) {
    parts.push(
      styled(new THREE.SphereGeometry(0.073, 12, 8), {
        position: new THREE.Vector3(side * 0.095, 0.298, 0.218),
        scale: new THREE.Vector3(1.02, 0.92, 0.42),
        colour: EYE_WHITE,
        glow: 0.24,
        materialRole: MATERIAL_ROLE.nacre
      }),
      styled(new THREE.SphereGeometry(0.045, 10, 7), {
        position: new THREE.Vector3(side * 0.095, 0.297, 0.253),
        scale: new THREE.Vector3(1, 0.96, 0.38),
        colour: EYE_DARK,
        glow: 0.08,
        materialRole: MATERIAL_ROLE.lapis
      }),
      styled(new THREE.SphereGeometry(0.022, 9, 6), {
        position: new THREE.Vector3(side * 0.092, 0.298, 0.274),
        scale: new THREE.Vector3(1, 1, 0.34),
        colour: CRYSTAL,
        glow: 0.48,
        materialRole: MATERIAL_ROLE.crystal
      }),
      styled(new THREE.SphereGeometry(0.009, 7, 5), {
        position: new THREE.Vector3(side * 0.086, 0.315, 0.284),
        colour: EYE_WHITE,
        glow: 0.58,
        materialRole: MATERIAL_ROLE.crystal
      }),
      // A broad indigo eyebrow survives downsampling and separates the eyes
      // from the raised hairline. It also gives the neutral pose expression.
      styled(tube([
        new THREE.Vector3(side * 0.155, 0.375, 0.235),
        new THREE.Vector3(side * 0.105, 0.39, 0.245),
        new THREE.Vector3(side * 0.04, 0.374, 0.238)
      ], 6, 0.009, 5), {
        colour: EYE_DARK,
        glow: 0.09,
        materialRole: MATERIAL_ROLE.lapis
      })
    );
  }
  return parts;
}

function torsoGeometry(): THREE.BufferGeometry[] {
  const parts: THREE.BufferGeometry[] = [
    styled(new THREE.CapsuleGeometry(0.205, 0.36, 5, 12), {
      position: new THREE.Vector3(0, 0.34, 0),
      scale: new THREE.Vector3(0.88, 1, 0.74),
      colour: SKIN,
      glow: 0.1,
      materialRole: MATERIAL_ROLE.nacre
    }),
    styled(new THREE.TorusGeometry(0.205, 0.03, 6, 18), {
      position: new THREE.Vector3(0, 0.08, 0),
      rotation: new THREE.Euler(Math.PI / 2, 0, 0),
      scale: new THREE.Vector3(1, 0.78, 1),
      colour: BRONZE,
      glow: 0.06,
      materialRole: MATERIAL_ROLE.bronze
    })
  ];

  for (const side of [-1, 1]) {
    parts.push(
      styled(new THREE.SphereGeometry(
        0.13,
        11,
        7,
        0,
        Math.PI * 2,
        0,
        Math.PI * 0.6
      ), {
        position: new THREE.Vector3(side * 0.1, 0.42, 0.125),
        rotation: new THREE.Euler(Math.PI * 0.42, 0, side * 0.08),
        scale: new THREE.Vector3(1.06, 0.78, 0.45),
        colour: side < 0 ? CORAL : BRONZE,
        glow: side < 0 ? 0.19 : 0.08,
        materialRole: side < 0
          ? MATERIAL_ROLE.livingCoral
          : MATERIAL_ROLE.bronze
      }),
      styled(new THREE.ConeGeometry(0.09, 0.2, 7), {
        position: new THREE.Vector3(side * 0.225, 0.57, -0.01),
        rotation: new THREE.Euler(0, 0, side * -Math.PI * 0.48),
        scale: new THREE.Vector3(0.42, 1, 0.78),
        colour: LAPIS,
        glow: 0.14,
        materialRole: MATERIAL_ROLE.lapis
      })
    );
  }
  return parts;
}

function pendantGeometry(): THREE.BufferGeometry[] {
  return [
    styled(new THREE.TorusGeometry(0.105, 0.011, 5, 15, Math.PI * 1.18), {
      position: new THREE.Vector3(0, 0.49, 0.16),
      rotation: new THREE.Euler(0, 0, -0.29),
      colour: BRONZE,
      glow: 0.05,
      materialRole: MATERIAL_ROLE.bronze
    }),
    styled(new THREE.OctahedronGeometry(0.055, 0), {
      position: new THREE.Vector3(0, 0.365, 0.175),
      scale: new THREE.Vector3(0.72, 1.38, 0.62),
      colour: CRYSTAL,
      glow: 0.31,
      materialRole: MATERIAL_ROLE.crystal
    })
  ];
}

function upperArmGeometry(side: -1 | 1): THREE.BufferGeometry[] {
  return [
    limb(0.07, 0.31, SKIN),
    styled(new THREE.TorusGeometry(0.075, 0.018, 5, 12), {
      position: new THREE.Vector3(0, -0.075, 0),
      rotation: new THREE.Euler(Math.PI / 2, 0, 0),
      colour: side < 0 ? CORAL : BRONZE,
      glow: side < 0 ? 0.18 : 0.06,
      materialRole: side < 0
        ? MATERIAL_ROLE.livingCoral
        : MATERIAL_ROLE.bronze
    })
  ];
}

function forearmGeometry(side: -1 | 1): THREE.BufferGeometry[] {
  return [
    limb(0.06, 0.26, SKIN_LIGHT),
    styled(new THREE.TorusGeometry(0.065, 0.014, 5, 12), {
      position: new THREE.Vector3(0, -0.31, 0),
      rotation: new THREE.Euler(Math.PI / 2, 0, 0),
      colour: BRONZE,
      glow: 0.06,
      materialRole: MATERIAL_ROLE.bronze
    }),
    styled(new THREE.SphereGeometry(0.07, 9, 6), {
      position: new THREE.Vector3(0, -0.385, 0),
      scale: new THREE.Vector3(0.72, 1.08, 0.62),
      colour: side < 0 ? SKIN_LIGHT : SKIN,
      glow: 0.1,
      materialRole: MATERIAL_ROLE.nacre
    })
  ];
}

function tailSegmentGeometry(
  topRadius: number,
  bottomRadius: number,
  length: number,
  ringCount: number,
  colour: THREE.Color
): THREE.BufferGeometry[] {
  const parts: THREE.BufferGeometry[] = [
    styled(new THREE.CylinderGeometry(
      topRadius,
      bottomRadius,
      length,
      14,
      3,
      false
    ), {
      position: new THREE.Vector3(0, -length * 0.5, 0),
      scale: new THREE.Vector3(1, 1, 0.78),
      colour,
      glow: 0.23,
      materialRole: MATERIAL_ROLE.livingCoral
    })
  ];
  for (let index = 1; index <= ringCount; index++) {
    const t = index / (ringCount + 1);
    const radius = THREE.MathUtils.lerp(topRadius, bottomRadius, t);
    parts.push(styled(new THREE.TorusGeometry(radius * 0.82, 0.013, 5, 14), {
      position: new THREE.Vector3(0, -length * t, 0.01),
      rotation: new THREE.Euler(Math.PI / 2, 0, 0),
      scale: new THREE.Vector3(1, 0.78, 1),
      colour: index % 2 === 0 ? CORAL : TAIL_LIGHT,
      glow: 0.25,
      materialRole: MATERIAL_ROLE.livingCoral
    }));
  }
  return parts;
}

function sideFinGeometry(): THREE.BufferGeometry[] {
  const fin = [
    new THREE.Vector2(0, 0),
    new THREE.Vector2(0.26, -0.08),
    new THREE.Vector2(0.38, -0.3),
    new THREE.Vector2(0.18, -0.24),
    new THREE.Vector2(0.08, -0.42),
    new THREE.Vector2(0, -0.22)
  ];
  const parts: THREE.BufferGeometry[] = [];
  for (const side of [-1, 1]) {
    parts.push(styled(extrudedShape(fin, 0.035, 0.007), {
      position: new THREE.Vector3(side * 0.12, -0.1, 0.015),
      rotation: new THREE.Euler(0.08, side * -0.18, side * -0.14),
      scale: new THREE.Vector3(side, 1, 1),
      colour: side < 0 ? CORAL : CRYSTAL,
      glow: 0.28,
      materialRole: side < 0
        ? MATERIAL_ROLE.livingCoral
        : MATERIAL_ROLE.crystal,
      sway: 0.32
    }));
  }
  return parts;
}

function caudalFinGeometry(): THREE.BufferGeometry[] {
  const fin = [
    new THREE.Vector2(0, 0),
    new THREE.Vector2(0.12, -0.04),
    new THREE.Vector2(0.44, 0.03),
    new THREE.Vector2(0.32, -0.22),
    new THREE.Vector2(0.1, -0.36),
    new THREE.Vector2(0, -0.22),
    new THREE.Vector2(-0.1, -0.36),
    new THREE.Vector2(-0.32, -0.22),
    new THREE.Vector2(-0.44, 0.03),
    new THREE.Vector2(-0.12, -0.04)
  ];
  return [
    styled(extrudedShape(fin, 0.045, 0.009), {
      colour: CRYSTAL,
      glow: 0.31,
      materialRole: MATERIAL_ROLE.crystal,
      sway: (position) => THREE.MathUtils.clamp(-position.y * 1.4, 0, 0.7)
    }),
    styled(new THREE.TorusGeometry(0.17, 0.016, 5, 14, Math.PI), {
      position: new THREE.Vector3(0, -0.08, 0.03),
      scale: new THREE.Vector3(1.7, 0.58, 1),
      colour: CORAL,
      glow: 0.28,
      materialRole: MATERIAL_ROLE.livingCoral
    })
  ];
}

function hairRibbonGeometry(side: -1 | 1): THREE.BufferGeometry[] {
  return [
    styled(tube([
      new THREE.Vector3(0, 0, 0),
      new THREE.Vector3(side * 0.09, -0.18, -0.08),
      new THREE.Vector3(side * -0.02, -0.42, -0.13),
      new THREE.Vector3(side * 0.12, -0.7, -0.03)
    ], 18, 0.045, 7), {
      colour: side < 0 ? HAIR_TIP : HAIR,
      glow: 0.2,
      materialRole: side < 0
        ? MATERIAL_ROLE.livingCoral
        : MATERIAL_ROLE.lapis,
      sway: (position) => THREE.MathUtils.clamp(-position.y, 0.08, 0.72)
    }),
    styled(new THREE.SphereGeometry(0.065, 8, 5), {
      position: new THREE.Vector3(side * 0.12, -0.72, -0.025),
      scale: new THREE.Vector3(0.55, 1.25, 0.5),
      colour: CRYSTAL,
      glow: 0.28,
      materialRole: MATERIAL_ROLE.crystal,
      sway: 0.6
    })
  ];
}

function spearGeometry(): THREE.BufferGeometry[] {
  const blade = [
    new THREE.Vector2(0, 0.34),
    new THREE.Vector2(0.1, 0.12),
    new THREE.Vector2(0.055, 0.16),
    new THREE.Vector2(0, 0.04),
    new THREE.Vector2(-0.055, 0.16),
    new THREE.Vector2(-0.1, 0.12)
  ];
  return [
    styled(new THREE.CylinderGeometry(0.018, 0.026, 1.85, 8), {
      position: new THREE.Vector3(0, -0.18, 0),
      colour: BRONZE,
      glow: 0.06,
      materialRole: MATERIAL_ROLE.bronze
    }),
    styled(extrudedShape(blade, 0.055, 0.008), {
      position: new THREE.Vector3(0, 0.75, 0),
      colour: CRYSTAL,
      glow: 0.34,
      materialRole: MATERIAL_ROLE.crystal
    }),
    styled(new THREE.TorusGeometry(0.045, 0.012, 5, 10), {
      position: new THREE.Vector3(0, 0.78, 0),
      rotation: new THREE.Euler(Math.PI / 2, 0, 0),
      colour: CORAL,
      glow: 0.2,
      materialRole: MATERIAL_ROLE.livingCoral
    })
  ];
}

function smoothstep(edge0: number, edge1: number, value: number): number {
  const t = THREE.MathUtils.clamp((value - edge0) / (edge1 - edge0), 0, 1);
  return t * t * (3 - 2 * t);
}

/**
 * One prominent, articulated guardian. Background citizens remain instanced;
 * this character intentionally spends a small draw-call budget on expression
 * and joint motion because it is staged at phone-readable scale.
 */
export class HeroMerfolkGuardian {
  readonly object = new THREE.Group();
  readonly triangleCount: number;
  readonly drawCount: number;
  readonly animationDriver = MERFOLK_ANIMATION.driver;
  readonly animationClips = MERFOLK_ANIMATION.clips;

  private readonly torso = new THREE.Group();
  private readonly head = new THREE.Group();
  private readonly arms = new THREE.Group();
  private readonly hands = new THREE.Group();
  private readonly leftUpper = new THREE.Group();
  private readonly leftForearm = new THREE.Group();
  private readonly rightUpper = new THREE.Group();
  private readonly rightForearm = new THREE.Group();
  private readonly tailRoot = new THREE.Group();
  private readonly tailMid = new THREE.Group();
  private readonly tailTip = new THREE.Group();
  private readonly caudalFin = new THREE.Group();
  private readonly sideFins = new THREE.Group();
  private readonly hairLeft = new THREE.Group();
  private readonly hairRight = new THREE.Group();
  private readonly spear = new THREE.Group();
  private readonly geometries: THREE.BufferGeometry[] = [];
  private readonly laneHalfWidth: number;
  private detailFraction = 1;

  constructor(
    material: THREE.Material,
    laneHalfWidth: number
  ) {
    this.laneHalfWidth = laneHalfWidth;
    this.object.name = MERFOLK_CHARACTER_CONTRACT.key;
    this.object.userData["artSignature"] = MERFOLK_CHARACTER_CONTRACT.key;
    this.object.userData["recognitionLabel"] =
      MERFOLK_CHARACTER_CONTRACT.recognitionLabel;
    this.object.userData["nonCollidable"] = true;
    this.object.userData["animationDriver"] = MERFOLK_ANIMATION.driver;
    this.object.userData["animationClips"] = [...MERFOLK_ANIMATION.clips];
    this.object.userData["characterParts"] = [
      ...MERFOLK_CHARACTER_CONTRACT.requiredParts
    ];

    this.head.name = "MerfolkHead";
    this.torso.name = "MerfolkTorso";
    this.leftUpper.name = "MerfolkLeftUpperArm";
    this.leftForearm.name = "MerfolkLeftForearm";
    this.rightUpper.name = "MerfolkRightUpperArm";
    this.rightForearm.name = "MerfolkRightForearm";
    this.tailMid.name = "MerfolkTailMid";
    this.tailTip.name = "MerfolkTailTip";
    this.hairLeft.name = "MerfolkHairLeft";
    this.hairRight.name = "MerfolkHairRight";

    const headMesh = mesh("readable-face", headGeometry(), material);
    const eyesMesh = mesh("expressive-eyes", eyeGeometry(), material);
    this.head.position.set(0, 0.78, 0);
    // Deliberately hero-proportioned for a phone: the head is larger than an
    // anatomical sculpt so the face still clears its 22 px floor at max FOV.
    this.head.scale.setScalar(1.8);
    this.head.add(headMesh, eyesMesh);
    this.object.add(this.head);

    const torsoMesh = mesh("shell-cuirass", torsoGeometry(), material);
    const pendantMesh = mesh("lapis-pendant", pendantGeometry(), material);
    this.torso.add(torsoMesh, pendantMesh);
    this.object.add(this.torso);

    this.arms.name = "articulated-arms";
    this.hands.name = "readable-hands";
    this.leftUpper.position.set(-0.225, 0.59, 0);
    this.leftUpper.add(mesh("left-upper-arm", upperArmGeometry(-1), material));
    this.leftForearm.position.set(0, -0.45, 0);
    this.leftForearm.add(mesh("left-hand", forearmGeometry(-1), material));
    this.leftUpper.add(this.leftForearm);
    this.rightUpper.position.set(0.225, 0.59, 0);
    this.rightUpper.add(mesh("right-upper-arm", upperArmGeometry(1), material));
    this.rightForearm.position.set(0, -0.45, 0);
    this.rightForearm.add(mesh("right-hand", forearmGeometry(1), material));
    this.rightUpper.add(this.rightForearm);
    this.hands.add(this.leftUpper, this.rightUpper);
    this.arms.add(this.hands);
    this.object.add(this.arms);

    this.tailRoot.name = "scaled-tail";
    this.tailRoot.position.set(0, 0.08, 0);
    this.tailRoot.add(mesh(
      "tail-segment-root",
      tailSegmentGeometry(0.2, 0.145, 0.55, 3, TAIL),
      material
    ));
    this.tailMid.position.set(0, -0.52, 0);
    this.tailMid.add(mesh(
      "tail-segment-mid",
      tailSegmentGeometry(0.145, 0.095, 0.48, 2, TAIL_LIGHT),
      material
    ));
    this.tailTip.position.set(0, -0.45, 0);
    this.tailTip.add(mesh(
      "tail-segment-tip",
      tailSegmentGeometry(0.095, 0.052, 0.4, 1, TAIL),
      material
    ));
    this.caudalFin.name = "broad-caudal-fin";
    this.caudalFin.position.set(0, -0.38, 0);
    this.caudalFin.add(mesh(
      "caudal-fin-mesh",
      caudalFinGeometry(),
      material
    ));
    this.tailTip.add(this.caudalFin);
    this.tailMid.add(this.tailTip);
    this.tailRoot.add(this.tailMid);
    this.sideFins.name = "translucent-side-fins";
    this.sideFins.add(mesh("side-fin-mesh", sideFinGeometry(), material));
    this.tailRoot.add(this.sideFins);
    this.object.add(this.tailRoot);

    const hair = new THREE.Group();
    hair.name = "flowing-hair";
    this.hairLeft.position.set(-0.11, 1.05, -0.12);
    this.hairLeft.add(mesh(
      "hair-ribbon-left",
      hairRibbonGeometry(-1),
      material
    ));
    this.hairRight.position.set(0.11, 1.05, -0.12);
    this.hairRight.add(mesh(
      "hair-ribbon-right",
      hairRibbonGeometry(1),
      material
    ));
    hair.add(this.hairLeft, this.hairRight);
    this.object.add(hair);

    this.spear.name = "tide-spear";
    this.spear.position.set(0.42, 0.34, 0.035);
    this.spear.rotation.z = -0.08;
    this.spear.add(mesh("tide-spear-mesh", spearGeometry(), material));
    this.object.add(this.spear);

    this.object.traverse((child) => {
      if (!(child instanceof THREE.Mesh)) return;
      this.geometries.push(child.geometry);
    });
    this.triangleCount = this.geometries.reduce((total, geometry) => {
      const position = geometry.getAttribute("position");
      return total + Math.floor(position.count / 3);
    }, 0);
    this.drawCount = this.geometries.length;
  }

  setDetail(fraction: number): void {
    this.detailFraction = THREE.MathUtils.clamp(fraction, 0.25, 1);
    // Keep a readable hair silhouette on every tier, but trim one secondary
    // ribbon at the lowest density rather than shrinking the hero.
    this.hairRight.visible = this.detailFraction >= 0.34;
  }

  update(
    forwardDistance: number,
    timeSec: number,
    momentumFraction: number,
    stage?: { anchor: number; side: -1 | 1 }
  ): void {
    const spacing = 64;
    const band = Math.floor((forwardDistance + 30) / spacing);
    const anchor = stage?.anchor ?? band * spacing + 27;
    const ahead = anchor - forwardDistance;
    const side: -1 | 1 = stage?.side ?? (band % 2 === 0 ? 1 : -1);
    const phase = timeSec * (1.28 + momentumFraction * 0.22) + band * 1.71;
    const hover = Math.sin(phase * 1.18);
    const patrol = Math.sin(phase * 0.42);
    const greeting = smoothstep(44, 31, ahead) * smoothstep(12, 21, ahead);
    const turnAway = 1 - smoothstep(-4, 12, ahead);
    // The camera widens and pulls back with momentum. A small speed-linked
    // scale compensation keeps facial features stable without moving the
    // guardian into the lane. Horizontal scale stays slimmer so the complete
    // silhouette remains inside the portrait frame near the gate.
    const scale = 1.82 + momentumFraction * 0.3;

    this.object.visible = ahead > -9 && ahead < 58;
    this.object.position.set(
      side * (this.laneHalfWidth + 2.58) + patrol * 0.18,
      2.82 + hover * 0.11,
      -anchor - 14 + Math.cos(phase * 0.38) * 0.34
    );
    this.object.scale.set(scale * 0.88, scale, scale);
    this.object.rotation.set(
      0.025 * hover,
      side * -0.07 + side * turnAway * 0.92,
      side * (0.035 + hover * 0.025)
    );

    // Hover and patrol keep the body breathing even when the player is far.
    this.torso.rotation.set(
      hover * 0.022,
      patrol * 0.025,
      -side * hover * 0.018
    );
    this.head.rotation.set(
      -0.035 + hover * 0.025,
      side * (0.08 + greeting * 0.12),
      -side * greeting * 0.035
    );

    // The lane-side hand greets the player; the far hand remains attached to
    // the spear. Both elbows articulate independently rather than bobbing as
    // one merged silhouette.
    this.leftUpper.rotation.set(
      0.08,
      -0.12,
      THREE.MathUtils.lerp(-0.32, -1.27, greeting)
    );
    this.leftForearm.rotation.set(
      0.05,
      0,
      THREE.MathUtils.lerp(-0.18, -0.74 + Math.sin(phase * 4.2) * 0.28, greeting)
    );
    this.rightUpper.rotation.set(0.03, 0.08, 0.19 + hover * 0.025);
    this.rightForearm.rotation.set(0.02, 0, 0.1 - hover * 0.02);
    this.spear.rotation.z = -0.08 + hover * 0.018;

    // Three nested tail joints create a travelling wave. Fins and hair lag the
    // body, supplying the soft underwater secondary motion the old whole-body
    // bob could not provide.
    const tailWave = Math.sin(phase * 1.72);
    this.tailRoot.rotation.set(0.05, 0, tailWave * 0.12);
    this.tailMid.rotation.set(0, 0, -tailWave * 0.24);
    this.tailTip.rotation.set(0, 0, tailWave * 0.36);
    this.caudalFin.rotation.set(0, tailWave * 0.08, -tailWave * 0.16);
    const finPulse = 1 + Math.sin(phase * 2.1) * 0.055;
    this.sideFins.scale.set(finPulse, 1, 1);
    this.hairLeft.rotation.set(
      Math.sin(phase * 0.73) * 0.05,
      0,
      Math.sin(phase * 0.91) * 0.1
    );
    this.hairRight.rotation.set(
      Math.cos(phase * 0.68) * 0.045,
      0,
      -Math.sin(phase * 0.86) * 0.09
    );
  }

  screenHeightPixels(
    camera: THREE.Camera,
    viewportHeightPixels: number
  ): number {
    if (!this.object.visible || viewportHeightPixels <= 0) return 0;
    this.object.updateWorldMatrix(true, true);
    const bounds = new THREE.Box3().setFromObject(this.object);
    if (bounds.isEmpty()) return 0;
    const projected = new THREE.Vector3();
    let minimumY = Number.POSITIVE_INFINITY;
    let maximumY = Number.NEGATIVE_INFINITY;
    for (const x of [bounds.min.x, bounds.max.x]) {
      for (const y of [bounds.min.y, bounds.max.y]) {
        for (const z of [bounds.min.z, bounds.max.z]) {
          projected.set(x, y, z).project(camera);
          minimumY = Math.min(minimumY, projected.y);
          maximumY = Math.max(maximumY, projected.y);
        }
      }
    }
    if (!Number.isFinite(minimumY) || !Number.isFinite(maximumY)) return 0;
    return Math.max(0, (maximumY - minimumY) * 0.5 * viewportHeightPixels);
  }

  faceHeightPixels(
    camera: THREE.Camera,
    viewportHeightPixels: number
  ): number {
    return this.projectedFeatureHeightPixels(
      camera,
      viewportHeightPixels,
      new THREE.Vector3(0, 0.51, 0.245),
      new THREE.Vector3(0, -0.035, 0.245)
    );
  }

  eyeDiameterPixels(
    camera: THREE.Camera,
    viewportHeightPixels: number
  ): number {
    return this.projectedFeatureHeightPixels(
      camera,
      viewportHeightPixels,
      new THREE.Vector3(0.095, 0.371, 0.274),
      new THREE.Vector3(0.095, 0.225, 0.274)
    );
  }

  private projectedFeatureHeightPixels(
    camera: THREE.Camera,
    viewportHeightPixels: number,
    topLocal: THREE.Vector3,
    bottomLocal: THREE.Vector3
  ): number {
    if (!this.object.visible || viewportHeightPixels <= 0) return 0;
    this.object.updateWorldMatrix(true, true);
    const top = topLocal.applyMatrix4(this.head.matrixWorld).project(camera);
    const bottom = bottomLocal.applyMatrix4(this.head.matrixWorld).project(camera);
    if (!Number.isFinite(top.y) || !Number.isFinite(bottom.y)) return 0;
    return Math.abs(top.y - bottom.y) * 0.5 * viewportHeightPixels;
  }

  dispose(): void {
    for (const geometry of this.geometries) geometry.dispose();
  }
}
