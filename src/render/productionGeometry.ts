import * as THREE from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import type { GateFacadeVariant } from "../art/premiumWorld";
import type { ArtLod } from "./moonGardenGeometry";

const STONE = new THREE.Color(0x123d5d);
const STONE_LIGHT = new THREE.Color(0x397a8b);
const STONE_DARK = new THREE.Color(0x021322);
const JOINT = new THREE.Color(0x04111d);
const LIMESTONE = new THREE.Color(0x779598);
const NACRE = new THREE.Color(0x8a91aa);
const BRONZE = new THREE.Color(0x8a6031);
const LAPIS = new THREE.Color(0x183f7b);
const CRYSTAL = new THREE.Color(0x4aa8b8);
const SHELL = BRONZE;
const CYAN = new THREE.Color(0x075c70);
const CYAN_LIGHT = new THREE.Color(0x20a7b5);
const VIOLET = new THREE.Color(0x56357b);
const ROSE = new THREE.Color(0x873c70);
const FACE_WHITE = new THREE.Color(0xfff4df);
const EYE_DARK = new THREE.Color(0x11173d);
const EYE_IRIS = new THREE.Color(0x2bbccc);
const MERFOLK_SKIN = new THREE.Color(0xd6bdc9);
const MERFOLK_SKIN_LIGHT = new THREE.Color(0xf1dfe1);
const MERFOLK_HAIR = new THREE.Color(0x25205d);
const MERFOLK_HAIR_TIP = new THREE.Color(0x75448f);
const MERFOLK_TAIL = new THREE.Color(0x247f91);
const MERFOLK_TAIL_LIGHT = new THREE.Color(0x3eb8bd);

export const MATERIAL_ROLE = {
  limestone: 0,
  nacre: 1,
  bronze: 2,
  lapis: 3,
  crystal: 4,
  livingCoral: 5
} as const;

type MaterialRole = typeof MATERIAL_ROLE[keyof typeof MATERIAL_ROLE];

interface GateSurfaceFamily {
  primary: THREE.Color;
  secondary: THREE.Color;
  shadow: THREE.Color;
  primaryRole: MaterialRole;
  accentRole: MaterialRole;
}

/**
 * Stable, silhouette-scale material families for the five opening districts.
 * These colours are intentionally separated before the shared shader adds its
 * role-specific response; otherwise every gate collapses back into the same
 * blue moonstone slab at phone distance.
 */
const GATE_SURFACES: readonly GateSurfaceFamily[] = [
  {
    primary: new THREE.Color(0x78958f),
    secondary: new THREE.Color(0xa99067),
    shadow: new THREE.Color(0x1c3538),
    primaryRole: MATERIAL_ROLE.limestone,
    accentRole: MATERIAL_ROLE.bronze
  },
  {
    primary: new THREE.Color(0x1b3d82),
    secondary: new THREE.Color(0x9a6b32),
    shadow: new THREE.Color(0x07152f),
    primaryRole: MATERIAL_ROLE.lapis,
    accentRole: MATERIAL_ROLE.bronze
  },
  {
    primary: new THREE.Color(0x8d3f71),
    secondary: new THREE.Color(0x315f75),
    shadow: new THREE.Color(0x25152f),
    primaryRole: MATERIAL_ROLE.livingCoral,
    accentRole: MATERIAL_ROLE.nacre
  },
  {
    primary: new THREE.Color(0xaaa4ba),
    secondary: new THREE.Color(0x7f9690),
    shadow: new THREE.Color(0x273047),
    primaryRole: MATERIAL_ROLE.nacre,
    accentRole: MATERIAL_ROLE.bronze
  },
  {
    primary: new THREE.Color(0x16356e),
    secondary: new THREE.Color(0x53aeb8),
    shadow: new THREE.Color(0x06152e),
    primaryRole: MATERIAL_ROLE.lapis,
    accentRole: MATERIAL_ROLE.crystal
  }
] as const;

function gateSurface(variant: GateFacadeVariant): GateSurfaceFamily {
  return GATE_SURFACES[variant] ?? GATE_SURFACES[0]!;
}

interface PartStyle {
  colour: THREE.Color;
  position?: THREE.Vector3;
  rotation?: THREE.Euler;
  scale?: THREE.Vector3;
  glow?: number;
  sway?: number | ((position: THREE.Vector3) => number);
  materialRole?: MaterialRole;
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
    materialRole = MATERIAL_ROLE.limestone
  }: PartStyle
): THREE.BufferGeometry {
  let geometry = source;
  if (geometry.index) {
    const indexed = geometry;
    geometry = geometry.toNonIndexed();
    indexed.dispose();
  }
  geometry.applyMatrix4(
    new THREE.Matrix4().compose(
      position,
      new THREE.Quaternion().setFromEuler(rotation),
      scale
    )
  );
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
  if (!geometry) throw new Error("Production geometry attributes did not match.");
  geometry.computeBoundingBox();
  geometry.computeBoundingSphere();
  return geometry;
}

function stoneBlock(
  width: number,
  height: number,
  depth: number,
  irregularity = 0.04
): THREE.ExtrudeGeometry {
  const x = width * 0.5;
  const y = height * 0.5;
  const shape = new THREE.Shape([
    new THREE.Vector2(-x + irregularity * 0.4, -y),
    new THREE.Vector2(x, -y + irregularity * 0.25),
    new THREE.Vector2(x - irregularity * 0.15, y),
    new THREE.Vector2(-x, y - irregularity)
  ]);
  const bevel = Math.min(width, height, depth) * 0.11;
  const geometry = new THREE.ExtrudeGeometry(shape, {
    depth,
    steps: 1,
    curveSegments: 1,
    bevelEnabled: true,
    bevelSegments: 1,
    bevelSize: bevel,
    bevelThickness: bevel
  });
  geometry.translate(0, 0, -depth * 0.5);
  return geometry;
}

function archRibbonSegment(
  startAngle: number,
  endAngle: number,
  samples: number,
  outerRadius: number,
  innerRadius: number,
  centreY: number,
  depth: number
): THREE.BufferGeometry {
  const outer: THREE.Vector2[] = [];
  const inner: THREE.Vector2[] = [];
  for (let index = 0; index <= samples; index++) {
    const t = index / samples;
    const angle = THREE.MathUtils.lerp(startAngle, endAngle, t);
    outer.push(new THREE.Vector2(
      Math.cos(angle) * outerRadius,
      centreY + Math.sin(angle) * outerRadius
    ));
    inner.push(new THREE.Vector2(
      Math.cos(angle) * innerRadius,
      centreY + Math.sin(angle) * innerRadius
    ));
  }
  const shape = new THREE.Shape();
  const first = outer[0];
  if (!first) throw new Error("Masonry arch segment requires samples.");
  shape.moveTo(first.x, first.y);
  for (const point of outer.slice(1)) shape.lineTo(point.x, point.y);
  for (const point of inner.reverse()) shape.lineTo(point.x, point.y);
  shape.closePath();
  const geometry = new THREE.ExtrudeGeometry(shape, {
    depth,
    steps: 1,
    bevelEnabled: false
  });
  geometry.translate(0, 0, -depth * 0.5);
  return geometry;
}

function branchBetween(
  start: THREE.Vector3,
  end: THREE.Vector3,
  baseRadius: number,
  tipRadius: number,
  radialSegments: number
): THREE.BufferGeometry {
  const direction = end.clone().sub(start);
  const length = direction.length();
  const geometry = new THREE.CylinderGeometry(
    tipRadius,
    baseRadius,
    length,
    radialSegments,
    2,
    false
  );
  geometry.applyQuaternion(
    new THREE.Quaternion().setFromUnitVectors(
      new THREE.Vector3(0, 1, 0),
      direction.normalize()
    )
  );
  geometry.translate(
    (start.x + end.x) * 0.5,
    (start.y + end.y) * 0.5,
    (start.z + end.z) * 0.5
  );
  return geometry;
}

function rubble(
  count: number,
  spreadX: number,
  spreadZ: number,
  radius: number,
  primary: THREE.Color = STONE_DARK,
  secondary: THREE.Color = STONE,
  materialRole: MaterialRole = MATERIAL_ROLE.limestone
): THREE.BufferGeometry[] {
  const parts: THREE.BufferGeometry[] = [];
  for (let index = 0; index < count; index++) {
    const size = radius * (0.72 + (index % 3) * 0.17);
    parts.push(styled(
      new THREE.DodecahedronGeometry(size, 0),
      {
        position: new THREE.Vector3(
          THREE.MathUtils.lerp(
            -spreadX,
            spreadX,
            count <= 1 ? 0.5 : index / (count - 1)
          ),
          size * 0.48,
          Math.sin(index * 1.91) * spreadZ
        ),
        rotation: new THREE.Euler(
          index * 0.41,
          index * 0.79,
          -index * 0.23
        ),
        scale: new THREE.Vector3(1.25, 0.68, 0.92),
        colour: index % 2 === 0 ? primary : secondary,
        glow: 0.01,
        materialRole
      }
    ));
  }
  return parts;
}

/**
 * A readable gate half, authored as masonry rather than one decorated slab.
 * The exact x=+/-0.5 inner plane is preserved for collider truth.
 */
export function createProductionWallGeometry(
  lod: ArtLod,
  gapDirection: 1 | -1,
  variant: GateFacadeVariant
): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = [];
  const surface = gateSurface(variant);
  const innerX = gapDirection * 0.5;
  const outerX = -gapDirection * 0.5;
  const crownHeights = [0.48, 0.5, 0.46, 0.52, 0.58] as const;
  const crownHeight = crownHeights[variant];

  // Dark backing closes every collidable opening while real stone courses
  // create the visible silhouette and readable joints in front of it.
  const backing = new THREE.Shape();
  backing.moveTo(innerX, -0.5);
  backing.lineTo(innerX, crownHeight);
  if (variant === 3) {
    // The Nacre Palace is a shell court, not a crenellated block tower. A
    // descending compound curve carries the inner pier into a low outer
    // terrace while preserving the exact collider-facing plane at innerX.
    backing.bezierCurveTo(
      innerX - gapDirection * 0.045,
      crownHeight + 0.055,
      gapDirection * 0.34,
      0.49,
      gapDirection * 0.29,
      0.35
    );
    backing.bezierCurveTo(
      gapDirection * 0.23,
      0.19,
      gapDirection * 0.08,
      0.02,
      gapDirection * 0.015,
      -0.08
    );
    backing.lineTo(outerX, -0.17);
  } else {
    // The load-bearing mass falls away in chipped, family-specific steps.
    // Keeping the high section close to the playable pier removes the broad
    // flat triangle that dominated earlier portrait captures.
    const shoulderHeight = [0.31, 0.36, 0.3, 0.34, 0.39][variant] ?? 0.32;
    const terraceHeight = [0.04, 0.11, 0.08, 0.05, 0.14][variant] ?? 0.06;
    backing.lineTo(
      innerX - gapDirection * (variant === 4 ? 0.1 : 0.075),
      crownHeight - 0.035
    );
    backing.lineTo(gapDirection * 0.34, shoulderHeight);
    backing.lineTo(gapDirection * 0.27, shoulderHeight - 0.035);
    backing.lineTo(gapDirection * 0.19, terraceHeight);
    backing.lineTo(gapDirection * 0.08, terraceHeight - 0.045);
    backing.lineTo(outerX, -0.18 - variant * 0.006);
  }
  backing.lineTo(outerX, -0.5);
  backing.closePath();
  const backingGeometry = new THREE.ExtrudeGeometry(backing, {
    depth: 0.82,
    steps: 1,
    bevelEnabled: true,
    bevelSegments: 1,
    bevelSize: 0.018,
    bevelThickness: 0.028
  });
  backingGeometry.translate(0, 0, -0.41);
  parts.push(styled(backingGeometry, {
    position: new THREE.Vector3(0, 0, -0.07),
    colour: surface.shadow,
    glow: 0.012,
    materialRole: surface.primaryRole
  }));

  // A deep, curved inner buttress carries the arch load into the foundation.
  // The outer wall stays a low collapsed bank instead of becoming the broad
  // triangular slab seen in the rejected portrait.
  if (lod < 2) {
    const buttressStart = gapDirection * 0.015;
    const buttress = new THREE.Shape();
    buttress.moveTo(buttressStart, -0.45);
    buttress.lineTo(innerX - gapDirection * 0.105, -0.45);
    buttress.lineTo(innerX - gapDirection * 0.105, 0.43);
    buttress.bezierCurveTo(
      gapDirection * 0.34,
      0.41,
      gapDirection * 0.28,
      0.17,
      gapDirection * 0.16,
      -0.01
    );
    buttress.bezierCurveTo(
      gapDirection * 0.09,
      -0.18,
      buttressStart + gapDirection * 0.035,
      -0.25,
      buttressStart,
      -0.45
    );
    buttress.closePath();
    parts.push(styled(new THREE.ExtrudeGeometry(buttress, {
      depth: 0.14,
      steps: 1,
      curveSegments: lod === 0 ? 8 : 5,
      bevelEnabled: true,
      bevelSegments: 1,
      bevelSize: 0.012,
      bevelThickness: 0.012
    }), {
      position: new THREE.Vector3(0, 0, 0.45),
      colour: surface.primary,
      glow: 0.014,
      materialRole: surface.primaryRole
    }));

    // A recessed shell-shaped niche is cut into the load-bearing face. It is
    // deliberately broad and embedded, replacing the thin torus ornament that
    // read as a gold wire pasted onto the wall.
    const niche = new THREE.Shape();
    niche.moveTo(-0.1, -0.16);
    niche.bezierCurveTo(-0.19, -0.02, -0.17, 0.2, 0, 0.28);
    niche.bezierCurveTo(0.17, 0.2, 0.19, -0.02, 0.1, -0.16);
    niche.bezierCurveTo(0.04, -0.08, -0.04, -0.08, -0.1, -0.16);
    niche.closePath();
    parts.push(styled(new THREE.ExtrudeGeometry(niche, {
      depth: 0.035,
      steps: 1,
      curveSegments: lod === 0 ? 6 : 4,
      bevelEnabled: lod === 0,
      bevelSegments: 1,
      bevelSize: 0.009,
      bevelThickness: 0.008
    }), {
      position: new THREE.Vector3(
        gapDirection * (0.2 + variant * 0.008),
        -0.08 + variant * 0.012,
        0.595
      ),
      scale: new THREE.Vector3(1.04, 0.95, 1),
      colour: JOINT,
      glow: 0.006,
      materialRole: MATERIAL_ROLE.lapis
    }));
    if (lod === 0) {
      parts.push(styled(new THREE.SphereGeometry(0.055, 10, 6), {
        position: new THREE.Vector3(
          gapDirection * (0.2 + variant * 0.008),
          -0.01 + variant * 0.012,
          0.63
        ),
        scale: new THREE.Vector3(0.84, 1.12, 0.28),
        colour: SHELL,
        glow: 0.045,
        materialRole: MATERIAL_ROLE.bronze
      }));
    }
  }

  const columns = lod === 0 ? 3 : lod === 1 ? 3 : 2;
  const rows = lod === 0 ? 3 : lod === 1 ? 3 : 1;
  const courseWidth = 0.84 / columns;
  const courseHeight = 0.88 / rows;
  for (let row = 0; row < rows; row++) {
    for (let column = 0; column < columns; column++) {
      // The outer wall is a low collapsed bank; courses accumulate only as
      // they approach the inner pier. This makes the pair read as a broken
      // arch instead of two rectangular panels.
      const allowedRows = 1 + Math.floor(
        column / Math.max(1, columns - 1) * (rows - 1)
      );
      if (row >= allowedRows) continue;
      if (
        (row === rows - 1 && column === 0) ||
        (variant === 1 && row === rows - 1 && column === columns - 1)
      ) {
        continue;
      }
      const t = (column + 0.5) / columns;
      const x = THREE.MathUtils.lerp(
        outerX + gapDirection * 0.08,
        innerX - gapDirection * 0.18,
        t
      );
      const y = -0.36 + row * courseHeight +
        ((row + column + variant) % 2) * 0.012;
      parts.push(styled(
        stoneBlock(
          courseWidth * (0.88 + ((row + column) % 2) * 0.08),
          courseHeight * 0.82,
          0.18,
          0.018 + (column % 2) * 0.008
        ),
        {
          position: new THREE.Vector3(x, y, 0.47 + (column % 2) * 0.025),
          rotation: new THREE.Euler(
            Math.sin(column * 1.7) * 0.018,
            gapDirection * Math.sin(row + column) * 0.035,
            gapDirection * Math.sin(row * 2.2 + column) * 0.025
          ),
          colour: (row + column + variant) % 3 === 0
            ? surface.secondary
            : surface.primary,
          glow: surface.primaryRole === MATERIAL_ROLE.livingCoral
            ? 0.08
            : surface.accentRole === MATERIAL_ROLE.crystal && column === 0
              ? 0.045
              : 0.018,
          materialRole: (row + column + variant) % 4 === 0
            ? surface.accentRole
            : surface.primaryRole
        }
      ));
    }
  }

  // A stacked gap-facing pier is the primary readable gate silhouette.
  const pierBlocks = lod === 0 ? 5 : lod === 1 ? 4 : 1;
  if (variant === 3 && lod < 2) {
    const drums = lod === 0 ? 4 : 3;
    for (let index = 0; index < drums; index++) {
      const height = 0.205;
      parts.push(styled(new THREE.CylinderGeometry(
        0.082,
        0.092,
        height,
        lod === 0 ? 10 : 7,
        1
      ), {
        position: new THREE.Vector3(
          innerX - gapDirection * 0.085,
          -0.4 + index * 0.2,
          0.52
        ),
        scale: new THREE.Vector3(1, 1, 0.82),
        colour: index % 2 === 0 ? NACRE : LIMESTONE,
        glow: 0.035,
        materialRole: index % 2 === 0
          ? MATERIAL_ROLE.nacre
          : MATERIAL_ROLE.limestone
      }));
    }
    parts.push(styled(new THREE.SphereGeometry(
      0.12,
      lod === 0 ? 12 : 8,
      lod === 0 ? 6 : 4,
      0,
      Math.PI * 2,
      0,
      Math.PI * 0.52
    ), {
      position: new THREE.Vector3(
        innerX - gapDirection * 0.085,
        0.39,
        0.52
      ),
      scale: new THREE.Vector3(1.2, 0.68, 0.78),
      colour: NACRE,
      glow: 0.045,
      materialRole: MATERIAL_ROLE.nacre
    }));
  } else {
    for (let index = 0; index < pierBlocks; index++) {
      const height = 0.17 + (index % 2) * 0.012;
      parts.push(styled(
        stoneBlock(0.16, height, 0.28, 0.015),
        {
          position: new THREE.Vector3(
            innerX - gapDirection * 0.082,
            -0.4 + index * 0.175,
            0.51 + (index % 2) * 0.015
          ),
          rotation: new THREE.Euler(
            0,
            gapDirection * (index % 2) * 0.025,
            gapDirection * Math.sin(index * 1.3) * 0.018
          ),
          colour: index % 2 === 0 ? surface.secondary : surface.primary,
          glow: 0.025,
          materialRole: index % 3 === 2
            ? surface.accentRole
            : surface.primaryRole
        }
      ));
    }
  }

  // Each district has one large, decipherable facade motif. These broad forms
  // survive portrait distance and replace the former scatter of interchangeable
  // rods, rings and decals.
  if (lod < 2) {
    const faceX = gapDirection * 0.235;
    if (variant === 0) {
      parts.push(styled(new THREE.TorusGeometry(
        0.13,
        0.025,
        lod === 0 ? 7 : 5,
        lod === 0 ? 18 : 12,
        Math.PI * 1.72
      ), {
        position: new THREE.Vector3(faceX, 0.14, 0.635),
        rotation: new THREE.Euler(0, 0, -Math.PI * 0.36),
        scale: new THREE.Vector3(0.82, 1, 0.4),
        colour: BRONZE,
        glow: 0.055,
        materialRole: MATERIAL_ROLE.bronze
      }));
    } else if (variant === 1) {
      const archive = new THREE.Shape([
        new THREE.Vector2(-0.105, -0.16),
        new THREE.Vector2(0.105, -0.16),
        new THREE.Vector2(0.105, 0.055),
        new THREE.Vector2(0, 0.18),
        new THREE.Vector2(-0.105, 0.055)
      ]);
      parts.push(styled(new THREE.ExtrudeGeometry(archive, {
        depth: 0.045,
        steps: 1,
        bevelEnabled: true,
        bevelSegments: 1,
        bevelSize: 0.012,
        bevelThickness: 0.008
      }), {
        position: new THREE.Vector3(faceX, 0.13, 0.61),
        colour: LAPIS,
        glow: 0.025,
        materialRole: MATERIAL_ROLE.lapis
      }));
      for (const offset of [-0.07, 0, 0.07]) {
        parts.push(styled(stoneBlock(0.125, 0.018, 0.025, 0.003), {
          position: new THREE.Vector3(faceX, 0.09 + offset, 0.676),
          colour: BRONZE,
          glow: 0.045,
          materialRole: MATERIAL_ROLE.bronze
        }));
      }
    } else if (variant === 2) {
      const root = new THREE.Vector3(faceX, -0.04, 0.64);
      const branchCount = lod === 0 ? 5 : 3;
      for (let index = 0; index < branchCount; index++) {
        const spread = (index / Math.max(1, branchCount - 1) - 0.5) * 0.28;
        parts.push(styled(branchBetween(
          root,
          new THREE.Vector3(
            faceX + gapDirection * spread * 0.28,
            0.19 + Math.abs(spread) * 0.34,
            0.655 + Math.cos(index) * 0.012
          ),
          0.021,
          0.01,
          lod === 0 ? 6 : 4
        ), {
          colour: index % 2 === 0 ? ROSE : VIOLET,
          glow: 0.28,
          materialRole: MATERIAL_ROLE.livingCoral
        }));
      }
    } else if (variant === 3) {
      parts.push(styled(new THREE.SphereGeometry(
        0.155,
        lod === 0 ? 14 : 9,
        lod === 0 ? 7 : 5,
        0,
        Math.PI * 2,
        0,
        Math.PI * 0.56
      ), {
        position: new THREE.Vector3(faceX, 0.2, 0.63),
        rotation: new THREE.Euler(0, 0, Math.PI),
        scale: new THREE.Vector3(0.86, 1, 0.34),
        colour: NACRE,
        glow: 0.05,
        materialRole: MATERIAL_ROLE.nacre
      }));
      parts.push(styled(stoneBlock(0.23, 0.052, 0.06, 0.008), {
        position: new THREE.Vector3(faceX, 0.045, 0.645),
        colour: BRONZE,
        glow: 0.04,
        materialRole: MATERIAL_ROLE.bronze
      }));
    } else {
      const crystal = new THREE.OctahedronGeometry(0.11, 0);
      parts.push(styled(crystal, {
        position: new THREE.Vector3(faceX, 0.22, 0.65),
        scale: new THREE.Vector3(0.64, 1.3, 0.42),
        colour: CRYSTAL,
        glow: 0.17,
        materialRole: MATERIAL_ROLE.crystal
      }));
      parts.push(styled(stoneBlock(0.045, 0.38, 0.055, 0.006), {
        position: new THREE.Vector3(faceX, -0.015, 0.64),
        colour: BRONZE,
        glow: 0.035,
        materialRole: MATERIAL_ROLE.bronze
      }));
    }
  }

  if (lod < 2) {
    const buttressX = outerX + gapDirection * 0.12;
    parts.push(styled(
      stoneBlock(0.19, 0.54, 0.34, 0.02),
      {
        position: new THREE.Vector3(buttressX, -0.22, 0.28),
        rotation: new THREE.Euler(0, gapDirection * 0.08, gapDirection * 0.05),
        colour: surface.shadow,
        glow: 0.01,
        materialRole: surface.primaryRole
      }
    ));
  }

  // Living growth originates inside the collidable stone mass and bends away
  // from the opening. It joins the gate to the reef without suggesting false
  // playable clearance.
  const growthCount = lod === 0 ? 3 : lod === 1 ? 1 : 0;
  for (let index = 0; index < growthCount; index++) {
    const start = new THREE.Vector3(
      outerX + gapDirection * (0.13 + index * 0.08),
      -0.45,
      0.55 + index * 0.018
    );
    const end = new THREE.Vector3(
      start.x + gapDirection * (0.06 + index * 0.035),
      -0.22 + index * 0.11,
      0.57 + Math.sin(index * 1.8) * 0.035
    );
    parts.push(styled(branchBetween(
      start,
      end,
      0.026,
      0.013,
      lod === 0 ? 5 : 3
    ), {
      colour: index % 2 === 0 ? CYAN_LIGHT : ROSE,
      glow: 0.38,
      materialRole: MATERIAL_ROLE.livingCoral
    }));
  }

  parts.push(...rubble(
    lod === 0 ? 7 : lod === 1 ? 5 : 1,
    0.43,
    0.38,
    lod === 2 ? 0.07 : 0.055,
    surface.shadow,
    surface.primary,
    surface.primaryRole
  ));
  const geometry = merged(parts);
  // Floating point bevel expansion is forced back onto the authoritative
  // visual plane. Only vertices on the playable side are clamped.
  const positions = geometry.getAttribute("position");
  for (let index = 0; index < positions.count; index++) {
    const x = positions.getX(index);
    if (
      (gapDirection === 1 && x > 0.5) ||
      (gapDirection === -1 && x < -0.5)
    ) {
      positions.setX(index, 0.5 * gapDirection);
    }
  }
  positions.needsUpdate = true;
  geometry.computeBoundingBox();
  return geometry;
}

/**
 * A non-colliding overhead ruin that visually joins the two authoritative wall
 * halves into one broken moon gate. The opening remains clear at Glowfin's
 * flight height; the canopy sits behind the collider-aligned seams and carries
 * only the upper architectural silhouette.
 */
export function createProductionGateCanopyGeometry(
  lod: ArtLod,
  variant: GateFacadeVariant = 0
): THREE.BufferGeometry {
  // Observatory gates deliberately have no overhead arch. A zero-count
  // instanced placeholder keeps the renderer's fixed pool topology stable.
  if (variant === 4) {
    return merged([styled(new THREE.BoxGeometry(0.01, 0.01, 0.01), {
      colour: LAPIS,
      materialRole: MATERIAL_ROLE.lapis
    })]);
  }

  const parts: THREE.BufferGeometry[] = [];
  const samples = lod === 0 ? 18 : lod === 1 ? 12 : 7;
  const start = 0.08 * Math.PI;
  const end = 0.92 * Math.PI;
  const outerRadius = variant === 3 ? 0.525 : variant === 2 ? 0.56 : 0.54;
  const innerRadius = variant === 3 ? 0.355 : variant === 2 ? 0.31 : 0.32;

  // The Archive uses a high pointed vault; the other districts use genuinely
  // different round, scalloped or domed load paths rather than recoloured
  // copies of one ring.
  if (variant === 1) {
    const pointed = new THREE.Shape([
      new THREE.Vector2(-0.62, -0.16),
      new THREE.Vector2(0, 0.58),
      new THREE.Vector2(0.62, -0.16),
      new THREE.Vector2(0.36, -0.16),
      new THREE.Vector2(0, 0.31),
      new THREE.Vector2(-0.36, -0.16)
    ]);
    const core = new THREE.ExtrudeGeometry(pointed, {
      depth: 0.34,
      steps: 1,
      bevelEnabled: true,
      bevelSegments: 1,
      bevelSize: 0.016,
      bevelThickness: 0.014
    });
    core.translate(0, 0, -0.17);
    parts.push(styled(core, {
      colour: LAPIS,
      glow: 0.012,
      materialRole: MATERIAL_ROLE.lapis
    }));
  } else {
    parts.push(styled(archRibbonSegment(
      start,
      end,
      samples,
      outerRadius,
      innerRadius,
      -0.1,
      0.34
    ), {
      position: new THREE.Vector3(0, 0, 0.02),
      colour: variant === 3 ? NACRE : STONE_DARK,
      glow: variant === 3 ? 0.026 : 0.008,
      materialRole: variant === 3 ? MATERIAL_ROLE.nacre : MATERIAL_ROLE.limestone
    }));
  }

  if (variant !== 1) {
    const voussoirCount = lod === 0 ? 11 : lod === 1 ? 8 : 5;
    for (let index = 0; index < voussoirCount; index++) {
      const t = (index + 0.5) / voussoirCount;
      const angle = THREE.MathUtils.lerp(start, end, t);
      const radius = (outerRadius + innerRadius) * 0.5;
      parts.push(styled(stoneBlock(
        lod === 2 ? 0.16 : 0.145,
        lod === 2 ? 0.13 : 0.115,
        0.4,
        0.012 + (index % 3) * 0.004
      ), {
        position: new THREE.Vector3(
          Math.cos(angle) * radius,
          -0.1 + Math.sin(angle) * radius,
          0.11 + (index % 2) * 0.012
        ),
        rotation: new THREE.Euler(
          0,
          (index % 2 === 0 ? -1 : 1) * 0.012,
          angle - Math.PI * 0.5
        ),
        colour: variant === 2
          ? (index % 2 === 0 ? ROSE : VIOLET)
          : variant === 3
            ? (index % 3 === 0 ? NACRE : LIMESTONE)
            : (index % 3 === 0 ? STONE_LIGHT : STONE),
        glow: variant === 2 ? 0.16 : 0.014 + (index % 3 === 0 ? 0.006 : 0),
        materialRole: variant === 2
          ? MATERIAL_ROLE.livingCoral
          : variant === 3 && index % 3 === 0
            ? MATERIAL_ROLE.nacre
            : MATERIAL_ROLE.limestone
      }));
    }
  }

  // Wide springers and overlapping capitals sit outside the authoritative
  // x=+/-0.5 opening. They make the arch visibly load-bearing while leaving
  // collider truth and the playable silhouette untouched.
  for (const side of [-1, 1]) {
    parts.push(styled(stoneBlock(
      lod === 2 ? 0.18 : 0.22,
      lod === 2 ? 0.28 : 0.34,
      0.38,
      0.018
    ), {
      position: new THREE.Vector3(side * 0.62, -0.08, 0.01),
      rotation: new THREE.Euler(0, side * 0.025, -side * 0.018),
      colour: variant === 1 ? LAPIS : variant === 3 ? LIMESTONE : STONE,
      glow: 0.014,
      materialRole: variant === 1
        ? MATERIAL_ROLE.lapis
        : MATERIAL_ROLE.limestone
    }));
    if (lod < 2) {
      parts.push(styled(stoneBlock(0.28, 0.12, 0.42, 0.016), {
        position: new THREE.Vector3(side * 0.64, 0.1, 0.015),
        rotation: new THREE.Euler(0, -side * 0.018, side * 0.012),
        colour: variant === 3 ? NACRE : STONE_LIGHT,
        glow: 0.018,
        materialRole: variant === 3 ? MATERIAL_ROLE.nacre : MATERIAL_ROLE.limestone
      }));
    }
  }

  if (lod < 2 && variant !== 1) {
    parts.push(styled(archRibbonSegment(
      start + 0.015,
      end - 0.015,
      lod === 0 ? 16 : 10,
      innerRadius + 0.015,
      innerRadius - 0.013,
      -0.1,
      0.37
    ), {
      position: new THREE.Vector3(0, 0, 0.13),
      colour: variant === 2 ? NACRE : BRONZE,
      glow: variant === 2 ? 0.09 : 0.04,
      materialRole: variant === 2 ? MATERIAL_ROLE.nacre : MATERIAL_ROLE.bronze
    }));
  }

  if (lod < 2 && variant === 1) {
    for (const side of [-1, 1]) {
      parts.push(styled(stoneBlock(0.035, 0.66, 0.38, 0.006), {
        position: new THREE.Vector3(side * 0.19, 0.1, 0.16),
        rotation: new THREE.Euler(0, 0, -side * 0.69),
        colour: BRONZE,
        glow: 0.045,
        materialRole: MATERIAL_ROLE.bronze
      }));
    }
  } else if (lod < 2 && variant === 2) {
    const scallops = lod === 0 ? 7 : 5;
    for (let index = 0; index < scallops; index++) {
      const angle = THREE.MathUtils.lerp(0.18 * Math.PI, 0.82 * Math.PI,
        index / Math.max(1, scallops - 1));
      parts.push(styled(new THREE.SphereGeometry(0.052, 7, 5), {
        position: new THREE.Vector3(
          Math.cos(angle) * 0.575,
          -0.1 + Math.sin(angle) * 0.575,
          0.19
        ),
        scale: new THREE.Vector3(1.25, 0.78, 0.6),
        colour: index % 2 === 0 ? ROSE : VIOLET,
        glow: 0.2,
        materialRole: MATERIAL_ROLE.livingCoral
      }));
    }
  } else if (lod < 2 && variant === 3) {
    // Three small palace lantern-domes create a layered royal skyline. The old
    // single oversized hemisphere and diamond read as an unrelated concrete
    // building pasted above the gate, especially when it filled a phone frame.
    const lanterns = lod === 0 ? [-0.29, 0, 0.29] : [-0.24, 0.24];
    parts.push(styled(stoneBlock(0.82, 0.07, 0.28, 0.012), {
      position: new THREE.Vector3(0, 0.4, 0.1),
      colour: LIMESTONE,
      glow: 0.02,
      materialRole: MATERIAL_ROLE.limestone
    }));
    for (const [index, x] of lanterns.entries()) {
      parts.push(styled(new THREE.SphereGeometry(
        index === Math.floor(lanterns.length / 2) ? 0.12 : 0.1,
        lod === 0 ? 12 : 8,
        lod === 0 ? 6 : 4,
        0,
        Math.PI * 2,
        0,
        Math.PI * 0.52
      ), {
        position: new THREE.Vector3(x, 0.475, 0.12),
        scale: new THREE.Vector3(1.08, 0.7, 0.76),
        colour: index % 2 === 0 ? NACRE : LIMESTONE,
        glow: 0.038,
        materialRole: index % 2 === 0
          ? MATERIAL_ROLE.nacre
          : MATERIAL_ROLE.limestone
      }));
    }
    parts.push(styled(new THREE.OctahedronGeometry(0.048, 0), {
      position: new THREE.Vector3(0, 0.62, 0.15),
      scale: new THREE.Vector3(0.58, 1.12, 0.58),
      colour: CRYSTAL,
      glow: 0.13,
      materialRole: MATERIAL_ROLE.crystal
    }));
  }

  return merged(parts);
}

export function createProductionCollapsedArch(lod: ArtLod): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = [];
  for (const side of [-1, 1]) {
    const courses = lod === 0 ? 3 : lod === 1 ? 2 : 1;
    for (let course = 0; course < courses; course++) {
      parts.push(styled(stoneBlock(0.34, 0.21, 0.46, 0.025), {
        position: new THREE.Vector3(
          side * (0.58 + (course % 2) * 0.025),
          0.105 + course * 0.205,
          Math.sin(course * 1.7 + side) * 0.035
        ),
        rotation: new THREE.Euler(
          0,
          side * (0.035 + course * 0.009),
          -side * course * 0.012
        ),
        colour: course % 2 === 0 ? STONE : STONE_DARK,
        glow: 0.012
      }));
    }
  }
  const samples = lod === 0 ? 7 : lod === 1 ? 5 : 3;
  parts.push(styled(archRibbonSegment(
    0.1 * Math.PI,
    0.46 * Math.PI,
    samples,
    0.7,
    0.47,
    0.48,
    0.44
  ), {
    rotation: new THREE.Euler(0.012, -0.035, -0.018),
    colour: STONE,
    glow: 0.014
  }));
  parts.push(styled(archRibbonSegment(
    0.55 * Math.PI,
    0.9 * Math.PI,
    samples,
    0.7,
    0.47,
    0.48,
    0.44
  ), {
    rotation: new THREE.Euler(-0.016, 0.028, 0.014),
    colour: STONE_LIGHT,
    glow: 0.018
  }));
  parts.push(...rubble(lod === 0 ? 2 : lod === 1 ? 2 : 2, 0.9, 0.28, 0.11));
  return merged(parts);
}

export function createProductionTower(lod: ArtLod): THREE.BufferGeometry {
  const radial = lod === 0 ? 14 : lod === 1 ? 10 : 7;
  const heightSegments = lod === 0 ? 24 : lod === 1 ? 12 : 3;
  const parts: THREE.BufferGeometry[] = [
    styled(new THREE.CylinderGeometry(
      0.44,
      0.51,
      1.42,
      radial,
      heightSegments,
      false
    ), {
      position: new THREE.Vector3(0, 0.71, 0),
      scale: new THREE.Vector3(1, 1, 0.82),
      colour: STONE_DARK,
      glow: 0.012
    })
  ];
  const rings = lod === 2 ? 1 : 3;
  for (let index = 0; index < rings; index++) {
    parts.push(styled(new THREE.TorusGeometry(
      0.43 - index * 0.025,
      0.045,
      lod === 0 ? 6 : 4,
      radial
    ), {
      position: new THREE.Vector3(0, 0.34 + index * 0.43, 0),
      rotation: new THREE.Euler(Math.PI / 2, 0, 0),
      scale: new THREE.Vector3(1, 0.82, 1),
      colour: index === 1 ? SHELL : STONE,
      glow: index === 1 ? 0.08 : 0.015
    }));
  }
  const crown = lod === 0 ? 7 : lod === 1 ? 5 : 3;
  for (let index = 0; index < crown; index++) {
    if (index === 2 || (lod === 0 && index === 5)) continue;
    const angle = index / crown * Math.PI * 2;
    parts.push(styled(stoneBlock(0.2, 0.22, 0.21, 0.02), {
      position: new THREE.Vector3(
        Math.cos(angle) * 0.34,
        1.44 + Math.sin(index * 1.6) * 0.055,
        Math.sin(angle) * 0.28
      ),
      rotation: new THREE.Euler(0, -angle, Math.sin(index) * 0.08),
      colour: index % 2 === 0 ? STONE_LIGHT : STONE,
      glow: 0.018
    }));
  }
  const masonryCount = lod === 0 ? 55 : lod === 1 ? 23 : 0;
  for (let index = 0; index < masonryCount; index++) {
    const columnCount = lod === 0 ? 10 : 7;
    const row = Math.floor(index / columnCount);
    const angle = (index % columnCount) / columnCount * Math.PI * 2 +
      (row % 2) * 0.16;
    const radius = 0.405 + row * 0.012;
    parts.push(styled(stoneBlock(0.18, 0.13, 0.1, 0.012), {
      position: new THREE.Vector3(
        Math.cos(angle) * radius,
        0.2 + row * 0.27,
        Math.sin(angle) * radius * 0.82
      ),
      rotation: new THREE.Euler(0, -angle + Math.PI / 2, 0),
      colour: index % 3 === 0 ? STONE_LIGHT : STONE,
      glow: 0.012
    }));
  }
  // Deep arched window recess makes the form read as architecture, not rock.
  parts.push(styled(new THREE.CapsuleGeometry(
    0.11,
    0.24,
    lod === 0 ? 5 : 3,
    lod === 0 ? 10 : 6
  ), {
    position: new THREE.Vector3(0, 0.89, 0.37),
    scale: new THREE.Vector3(0.78, 1, 0.16),
    colour: JOINT,
    glow: 0
  }));
  parts.push(...rubble(lod === 0 ? 6 : 3, 0.5, 0.32, 0.1));
  return merged(parts);
}

export function createProductionSpire(lod: ArtLod): THREE.BufferGeometry {
  const radial = lod === 0 ? 12 : lod === 1 ? 8 : 6;
  const heightSegments = lod === 0 ? 12 : lod === 1 ? 6 : 2;
  const parts: THREE.BufferGeometry[] = [
    styled(new THREE.CylinderGeometry(
      0.13,
      0.48,
      1.45,
      radial,
      heightSegments,
      false
    ), {
      position: new THREE.Vector3(0, 0.72, 0),
      scale: new THREE.Vector3(1, 1, 0.78),
      colour: STONE_DARK,
      glow: 0.012
    }),
    styled(new THREE.TorusGeometry(0.24, 0.035, 5, radial + 4, Math.PI * 1.35), {
      position: new THREE.Vector3(0, 0.82, 0.37),
      rotation: new THREE.Euler(0, 0, -0.72),
      colour: SHELL,
      glow: 0.08
    })
  ];
  for (const side of [-1, 1]) {
    parts.push(styled(new THREE.ConeGeometry(
      0.12,
      0.72,
      radial,
      lod === 0 ? 3 : 1
    ), {
      position: new THREE.Vector3(side * 0.14, 1.45, 0),
      rotation: new THREE.Euler(0, 0, -side * 0.27),
      scale: new THREE.Vector3(1, 1, 0.82),
      colour: side < 0 ? STONE : STONE_LIGHT,
      glow: 0.02
    }));
  }
  const masonryCount = lod === 0 ? 28 : lod === 1 ? 12 : 0;
  for (let index = 0; index < masonryCount; index++) {
    const columnCount = lod === 0 ? 8 : 6;
    const row = Math.floor(index / columnCount);
    const angle = (index % columnCount) / columnCount * Math.PI * 2 +
      row * 0.12;
    parts.push(styled(stoneBlock(0.16, 0.12, 0.085, 0.01), {
      position: new THREE.Vector3(
        Math.cos(angle) * (0.32 - row * 0.03),
        0.2 + row * 0.25,
        Math.sin(angle) * (0.25 - row * 0.02)
      ),
      rotation: new THREE.Euler(0, -angle + Math.PI / 2, 0),
      colour: index % 3 === 0 ? STONE_LIGHT : STONE,
      glow: 0.012
    }));
  }
  parts.push(...rubble(lod === 0 ? 4 : 2, 0.43, 0.22, 0.09));
  return merged(parts);
}

function coralRockBase(
  lod: ArtLod,
  width = 0.72,
  compactFar = false
): THREE.BufferGeometry[] {
  if (lod === 2 && compactFar) {
    return rubble(1, width * 0.45, 0.18, 0.11);
  }
  const count = lod === 0 ? 5 : lod === 1 ? 4 : 3;
  const parts = rubble(count, width, 0.34, lod === 2 ? 0.12 : 0.1);
  parts.push(styled(new THREE.SphereGeometry(
    width * 0.55,
    lod === 0 ? 12 : lod === 1 ? 8 : 6,
    lod === 0 ? 7 : 5
  ), {
    position: new THREE.Vector3(0, 0.07, 0),
    rotation: new THREE.Euler(0.04, 0.16, -0.035),
    scale: new THREE.Vector3(1.18, 0.48, 0.94),
    colour: STONE_DARK,
    glow: 0.01
  }));
  return parts;
}

/** Staghorn coral: one trunk, repeated Y-forks, tapered living tips. */
export function createProductionBranchCoral(lod: ArtLod): THREE.BufferGeometry {
  const radial = lod === 0 ? 7 : lod === 1 ? 5 : 3;
  const parts = coralRockBase(lod, 0.63, true);
  const root = new THREE.Vector3(0, 0.12, 0);
  const middle = new THREE.Vector3(-0.03, 0.62, 0.01);
  const crown = new THREE.Vector3(0.03, 1.12, 0.03);
  parts.push(styled(branchBetween(root, middle, 0.13, 0.105, radial), {
    colour: CYAN,
    glow: 0.38
  }));
  parts.push(styled(branchBetween(middle, crown, 0.105, 0.065, radial), {
    colour: CYAN_LIGHT,
    glow: 0.48
  }));
  const forks = lod === 2 ? 1 : lod === 1 ? 3 : 7;
  for (let index = 0; index < forks; index++) {
    const side = index % 2 === 0 ? -1 : 1;
    const startY = 0.36 + (index % 4) * 0.17;
    const start = new THREE.Vector3(
      Math.sin(index * 1.2) * 0.035,
      startY,
      Math.cos(index * 0.9) * 0.045
    );
    const end = new THREE.Vector3(
      side * (0.26 + (index % 3) * 0.1),
      startY + 0.28 + (index % 2) * 0.11,
      Math.sin(index * 1.7) * 0.18
    );
    const colour = index % 3 === 0 ? ROSE : index % 3 === 1 ? CYAN : VIOLET;
    parts.push(styled(branchBetween(start, end, 0.07, 0.035, radial), {
      colour,
      glow: 0.43
    }));
    if (lod < 2) {
      parts.push(styled(new THREE.IcosahedronGeometry(0.052, 0), {
        position: end,
        scale: new THREE.Vector3(1, 0.72, 1),
        colour,
        glow: 0.54
      }));
    }
  }
  return merged(parts);
}

function createFanMembrane(lod: 0 | 1): THREE.BufferGeometry {
  const shape = new THREE.Shape();
  shape.moveTo(-0.13, 0);
  const rimSegments = lod === 0 ? 14 : 9;
  for (let index = 0; index <= rimSegments; index++) {
    const t = index / rimSegments;
    const angle = Math.PI * (1 - t);
    const scallop = 1 + Math.sin(t * Math.PI * 5) * 0.04;
    shape.lineTo(
      Math.cos(angle) * 0.7 * scallop,
      0.15 + Math.sin(angle) * 0.9 * scallop
    );
  }
  shape.lineTo(0.13, 0);
  shape.closePath();

  const holes: Array<
    readonly [number, number, number, number, number]
  > = lod === 0
    ? [
        [-0.31, 0.46, 0.12, 0.23, -0.18],
        [0, 0.62, 0.135, 0.27, 0],
        [0.31, 0.46, 0.12, 0.23, 0.18],
        [0, 0.25, 0.085, 0.14, 0]
      ]
    : [
        [-0.28, 0.48, 0.12, 0.22, -0.16],
        [0, 0.62, 0.14, 0.26, 0],
        [0.28, 0.48, 0.12, 0.22, 0.16]
      ];
  for (const [x, y, radiusX, radiusY, rotation] of holes) {
    const hole = new THREE.Path();
    hole.absellipse(
      x,
      y,
      radiusX,
      radiusY,
      0,
      Math.PI * 2,
      false,
      rotation
    );
    shape.holes.push(hole);
  }

  const depth = lod === 0 ? 0.15 : 0.13;
  const geometry = new THREE.ExtrudeGeometry(shape, {
    depth,
    steps: 1,
    curveSegments: lod === 0 ? 5 : 3,
    bevelEnabled: lod === 0,
    bevelSegments: 1,
    bevelSize: 0.018,
    bevelThickness: 0.014
  });
  geometry.translate(0, 0, -depth * 0.5);
  const positions = geometry.getAttribute("position");
  for (let index = 0; index < positions.count; index++) {
    const x = positions.getX(index);
    const y = positions.getY(index);
    const bow = Math.max(0, 1 - (x / 0.74) ** 2) *
      THREE.MathUtils.smoothstep(y, 0, 1.05) * 0.105;
    positions.setZ(index, positions.getZ(index) + bow);
  }
  positions.needsUpdate = true;
  geometry.computeVertexNormals();
  geometry.normalizeNormals();
  return geometry;
}

/**
 * Sea fan: a thick bowed tissue sheet with large organic windows.
 *
 * The old cylindrical lattice read as a pile of disconnected sticks. This
 * closed, bevelled membrane has real front/back depth and broad openings, so
 * it reads as one living organism without falling back to a flat alpha card.
 */
export function createProductionFanCoral(lod: ArtLod): THREE.BufferGeometry {
  const parts = coralRockBase(lod, 0.68, true);
  if (lod === 2) {
    const fanShape = new THREE.Shape();
    fanShape.moveTo(-0.12, 0);
    for (let index = 0; index <= 8; index++) {
      const t = index / 8;
      const angle = Math.PI * (1 - t);
      const scallop = 1 + Math.sin(t * Math.PI * 4) * 0.045;
      fanShape.lineTo(
        Math.cos(angle) * 0.68 * scallop,
        0.12 + Math.sin(angle) * 0.9 * scallop
      );
    }
    fanShape.lineTo(0.12, 0);
    fanShape.closePath();
    parts.push(styled(new THREE.ShapeGeometry(fanShape, 1), {
      position: new THREE.Vector3(0, 0.18, 0),
      rotation: new THREE.Euler(-0.08, 0.18, -0.05),
      colour: VIOLET,
      glow: 0.24
    }));
    for (const side of [-1, 1]) {
      parts.push(styled(branchBetween(
        new THREE.Vector3(0, 0.2, 0.025),
        new THREE.Vector3(side * 0.42, 0.82, 0.035),
        0.028,
        0.014,
        3
      ), {
        colour: side < 0 ? CYAN_LIGHT : ROSE,
        glow: 0.4
      }));
    }
  } else {
    parts.push(styled(createFanMembrane(lod), {
      position: new THREE.Vector3(0, 0.18, 0),
      rotation: new THREE.Euler(-0.08, 0.18, -0.05),
      colour: VIOLET,
      glow: 0.29,
      sway: (position) => THREE.MathUtils.smoothstep(position.y, 0.18, 1.2)
    }));
    for (const side of [-1, 1]) {
      parts.push(styled(branchBetween(
        new THREE.Vector3(side * 0.055, 0.18, -0.02),
        new THREE.Vector3(side * 0.42, 0.76, 0.08),
        0.043,
        0.024,
        lod === 0 ? 6 : 4
      ), {
        colour: side < 0 ? CYAN_LIGHT : ROSE,
        glow: 0.41,
        sway: (position) => THREE.MathUtils.smoothstep(position.y, 0.18, 0.9)
      }));
    }
  }
  return merged(parts);
}

/** Anemone garden: short soft tentacles, clearly unlike either coral family. */
export function createProductionAnemone(lod: ArtLod): THREE.BufferGeometry {
  const parts = coralRockBase(lod, 0.58);
  const count = lod === 0 ? 13 : lod === 1 ? 9 : 6;
  const radial = lod === 0 ? 6 : lod === 1 ? 5 : 4;
  for (let index = 0; index < count; index++) {
    const angle = index / count * Math.PI * 2;
    const ring = index % 3;
    const start = new THREE.Vector3(
      Math.cos(angle) * (0.08 + ring * 0.08),
      0.1,
      Math.sin(angle) * (0.08 + ring * 0.08)
    );
    const end = new THREE.Vector3(
      Math.cos(angle + 0.18) * (0.32 + ring * 0.04),
      0.46 + (index % 4) * 0.055,
      Math.sin(angle + 0.18) * (0.32 + ring * 0.04)
    );
    const colour = index % 3 === 0 ? ROSE : index % 3 === 1 ? CYAN : VIOLET;
    parts.push(styled(branchBetween(start, end, 0.055, 0.028, radial), {
      colour,
      glow: 0.42,
      sway: (position) => THREE.MathUtils.clamp(position.y / 0.6, 0, 1)
    }));
    if (lod < 2) {
      parts.push(styled(new THREE.SphereGeometry(
        0.045,
        radial * 2,
        radial
      ), {
        position: end,
        colour,
        glow: 0.5,
        sway: 1
      }));
    }
  }
  return merged(parts);
}

export function createProductionKelp(lod: 0 | 1 | 2): THREE.BufferGeometry {
  const parts = coralRockBase(lod, 0.5, true);
  const blades = lod === 0 ? 4 : lod === 1 ? 3 : 2;
  for (let blade = 0; blade < blades; blade++) {
    const width = 0.16 + (blade % 2) * 0.035;
    const height = 0.95 + (blade % 3) * 0.24;
    const geometry = new THREE.PlaneGeometry(
      width,
      height,
      1,
      lod === 0 ? 9 : lod === 1 ? 6 : 3
    );
    geometry.translate(0, height * 0.5, 0);
    const positions = geometry.getAttribute("position");
    for (let index = 0; index < positions.count; index++) {
      const y = positions.getY(index);
      positions.setX(
        index,
        positions.getX(index) + Math.sin(y * 4.2 + blade) * 0.075
      );
    }
    positions.needsUpdate = true;
    geometry.computeVertexNormals();
    parts.push(styled(geometry, {
      position: new THREE.Vector3((blade - 1.5) * 0.2, 0.08, (blade % 2) * 0.12),
      rotation: new THREE.Euler(0, blade * 0.7, (blade - 1.5) * 0.045),
      colour: blade % 2 === 0 ? CYAN : VIOLET,
      glow: 0.31,
      sway: (position) => THREE.MathUtils.clamp(position.y / height, 0, 1)
    }));
  }
  return merged(parts);
}

function curvedTube(
  points: THREE.Vector3[],
  tubularSegments: number,
  radius: number,
  radialSegments: number,
  closed = false
): THREE.BufferGeometry {
  return new THREE.TubeGeometry(
    new THREE.CatmullRomCurve3(points, closed, "centripetal"),
    tubularSegments,
    radius,
    radialSegments,
    closed
  );
}

function scallopedPlateShape(radius: number, lobes: number): THREE.Shape {
  const points: THREE.Vector2[] = [];
  const samples = lobes * 4;
  for (let index = 0; index < samples; index++) {
    const angle = index / samples * Math.PI * 2;
    const edge = radius * (0.9 + Math.sin(angle * lobes) * 0.1);
    points.push(new THREE.Vector2(
      Math.cos(angle) * edge,
      Math.sin(angle) * edge
    ));
  }
  return new THREE.Shape(points);
}

/**
 * Maze-ridged brain coral. The five wandering ridges are deliberately
 * non-concentric and sit on a single rounded colony, preventing the purple
 * faceted-rock/cone read seen in the Phase 3A captures.
 */
export function createProductionBrainCoral(lod: ArtLod): THREE.BufferGeometry {
  const parts = coralRockBase(lod, 0.62, true);
  const radial = lod === 0 ? 18 : lod === 1 ? 13 : 8;
  parts.push(styled(new THREE.SphereGeometry(
    0.62,
    radial,
    lod === 0 ? 11 : lod === 1 ? 8 : 5
  ), {
    position: new THREE.Vector3(0, 0.5, 0),
    scale: new THREE.Vector3(1.08, 0.72, 0.86),
    colour: VIOLET,
    glow: 0.18,
    materialRole: MATERIAL_ROLE.livingCoral
  }));
  const ridgeCount = lod === 2 ? 3 : 5;
  for (let ridge = 0; ridge < ridgeCount; ridge++) {
    const points: THREE.Vector3[] = [];
    const pointCount = lod === 0 ? 9 : lod === 1 ? 7 : 5;
    for (let point = 0; point < pointCount; point++) {
      const t = point / Math.max(1, pointCount - 1);
      const x = THREE.MathUtils.lerp(-0.5, 0.5, t);
      const dome = Math.sqrt(Math.max(0.05, 1 - (x / 0.58) ** 2));
      const row = ridge - (ridgeCount - 1) * 0.5;
      points.push(new THREE.Vector3(
        x + Math.sin(t * Math.PI * 3 + ridge) * 0.028,
        0.48 + row * 0.105 + dome * 0.15 + Math.sin(t * 8 + ridge) * 0.025,
        0.48 * dome - Math.abs(row) * 0.026
      ));
    }
    parts.push(styled(curvedTube(
      points,
      lod === 0 ? 18 : lod === 1 ? 12 : 7,
      lod === 2 ? 0.025 : 0.032,
      lod === 0 ? 6 : 4
    ), {
      colour: ridge % 2 === 0 ? ROSE : NACRE,
      glow: 0.24,
      materialRole: ridge % 2 === 0
        ? MATERIAL_ROLE.livingCoral
        : MATERIAL_ROLE.nacre,
      sway: lod === 2 ? 0 : 0.08
    }));
  }
  return merged(parts);
}

/** Thick, offset, scalloped shelves on a load-bearing organic pedestal. */
export function createProductionTableCoral(lod: ArtLod): THREE.BufferGeometry {
  const parts = coralRockBase(lod, 0.74, true);
  const radial = lod === 0 ? 8 : lod === 1 ? 6 : 4;
  parts.push(styled(branchBetween(
    new THREE.Vector3(0, 0.1, 0),
    new THREE.Vector3(-0.04, 0.7, 0.02),
    0.17,
    0.11,
    radial
  ), {
    colour: ROSE,
    glow: 0.18,
    materialRole: MATERIAL_ROLE.livingCoral
  }));
  const plateCount = lod === 2 ? 1 : 2;
  for (let index = 0; index < plateCount; index++) {
    const shape = scallopedPlateShape(index === 0 ? 0.7 : 0.45, index === 0 ? 9 : 7);
    const plate = new THREE.ExtrudeGeometry(shape, {
      depth: index === 0 ? 0.105 : 0.08,
      steps: 1,
      curveSegments: 2,
      bevelEnabled: true,
      bevelSegments: 1,
      bevelSize: 0.025,
      bevelThickness: 0.018
    });
    plate.translate(0, 0, -(index === 0 ? 0.0525 : 0.04));
    plate.rotateX(-Math.PI / 2);
    parts.push(styled(plate, {
      position: new THREE.Vector3(
        index === 0 ? 0.08 : -0.26,
        index === 0 ? 0.68 : 0.94,
        index === 0 ? 0 : 0.06
      ),
      rotation: new THREE.Euler(0.04, index * 0.45, index === 0 ? 0.02 : -0.08),
      scale: new THREE.Vector3(1.18, 1, 0.82),
      colour: index === 0 ? ROSE : VIOLET,
      glow: 0.2,
      materialRole: MATERIAL_ROLE.livingCoral,
      sway: index === 0 ? 0.08 : 0.14
    }));
  }
  return merged(parts);
}

/** Grounded palace district: terrace, stairs, colonnade, domes and obelisk. */
export function createProductionPalaceDistrict(lod: ArtLod): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = [];
  parts.push(styled(stoneBlock(2.6, 0.22, 1.5, 0.035), {
    position: new THREE.Vector3(0, 0.11, 0),
    colour: STONE_DARK,
    materialRole: MATERIAL_ROLE.limestone
  }));
  const stairs = lod === 2 ? 2 : 4;
  for (let step = 0; step < stairs; step++) {
    parts.push(styled(stoneBlock(
      1.32 - step * 0.14,
      0.08,
      0.28,
      0.008
    ), {
      position: new THREE.Vector3(0, 0.22 + step * 0.075, 0.74 - step * 0.19),
      colour: step % 2 === 0 ? LIMESTONE : STONE_LIGHT,
      materialRole: MATERIAL_ROLE.limestone
    }));
  }
  const columns = lod === 0 ? 7 : lod === 1 ? 5 : 3;
  for (let index = 0; index < columns; index++) {
    const x = THREE.MathUtils.lerp(-0.92, 0.92, index / Math.max(1, columns - 1));
    const height = index === Math.floor(columns / 2) ? 1.18 : 0.96;
    parts.push(styled(new THREE.CylinderGeometry(
      0.075,
      0.095,
      height,
      lod === 0 ? 10 : lod === 1 ? 7 : 5,
      1
    ), {
      position: new THREE.Vector3(x, 0.34 + height * 0.5, 0.18),
      colour: index % 2 === 0 ? LIMESTONE : NACRE,
      materialRole: index % 2 === 0 ? MATERIAL_ROLE.limestone : MATERIAL_ROLE.nacre
    }));
    parts.push(styled(stoneBlock(0.22, 0.075, 0.22, 0.01), {
      position: new THREE.Vector3(x, 0.34 + height + 0.02, 0.18),
      colour: BRONZE,
      glow: 0.025,
      materialRole: MATERIAL_ROLE.bronze
    }));
  }
  parts.push(styled(stoneBlock(2.15, 0.14, 0.42, 0.018), {
    position: new THREE.Vector3(0, 1.38, 0.15),
    colour: LIMESTONE,
    materialRole: MATERIAL_ROLE.limestone
  }));
  for (const side of [-1, 1]) {
    parts.push(styled(new THREE.SphereGeometry(
      0.38,
      lod === 0 ? 16 : lod === 1 ? 11 : 7,
      lod === 0 ? 8 : 5,
      0,
      Math.PI * 2,
      0,
      Math.PI * 0.54
    ), {
      position: new THREE.Vector3(side * 0.72, 1.48, 0.06),
      scale: new THREE.Vector3(1.05, 0.72, 0.86),
      colour: NACRE,
      glow: 0.024,
      materialRole: MATERIAL_ROLE.nacre
    }));
  }
  parts.push(styled(new THREE.OctahedronGeometry(0.16, 0), {
    position: new THREE.Vector3(0, 1.82, 0.12),
    scale: new THREE.Vector3(0.48, 1.8, 0.48),
    colour: CRYSTAL,
    glow: 0.09,
    materialRole: MATERIAL_ROLE.crystal
  }));
  return merged(parts);
}

/** Twin load-bearing pylons and a celestial instrument—explicitly no arch. */
export function createProductionObservatory(lod: ArtLod): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = [
    styled(stoneBlock(2.5, 0.18, 1.35, 0.025), {
      position: new THREE.Vector3(0, 0.09, 0),
      colour: STONE_DARK,
      materialRole: MATERIAL_ROLE.limestone
    })
  ];
  for (const side of [-1, 1]) {
    const pylonShape = new THREE.Shape([
      new THREE.Vector2(-0.32, 0),
      new THREE.Vector2(0.32, 0),
      new THREE.Vector2(0.23, 1.62),
      new THREE.Vector2(-0.19, 1.82)
    ]);
    const pylon = new THREE.ExtrudeGeometry(pylonShape, {
      depth: 0.5,
      steps: 1,
      bevelEnabled: true,
      bevelSegments: 1,
      bevelSize: 0.035,
      bevelThickness: 0.03
    });
    pylon.translate(0, 0, -0.25);
    parts.push(styled(pylon, {
      position: new THREE.Vector3(side * 0.82, 0.18, 0),
      scale: new THREE.Vector3(side, 1, 1),
      colour: LAPIS,
      materialRole: MATERIAL_ROLE.lapis
    }));
    parts.push(styled(new THREE.OctahedronGeometry(0.16, 0), {
      position: new THREE.Vector3(side * 0.82, 2.03, 0.03),
      scale: new THREE.Vector3(0.7, 1.55, 0.7),
      colour: CRYSTAL,
      glow: 0.12,
      materialRole: MATERIAL_ROLE.crystal
    }));
  }
  if (lod < 2) {
    parts.push(styled(new THREE.TorusGeometry(
      0.42,
      0.038,
      lod === 0 ? 8 : 6,
      lod === 0 ? 24 : 16
    ), {
      position: new THREE.Vector3(0, 1.1, 0.24),
      rotation: new THREE.Euler(0.18, 0, 0),
      colour: BRONZE,
      glow: 0.035,
      materialRole: MATERIAL_ROLE.bronze
    }));
    parts.push(styled(new THREE.OctahedronGeometry(0.13, 0), {
      position: new THREE.Vector3(0, 1.1, 0.28),
      colour: CRYSTAL,
      glow: 0.13,
      materialRole: MATERIAL_ROLE.crystal
    }));
  }
  return merged(parts);
}

function merfolkFigure(monument: boolean): THREE.BufferGeometry {
  const skin = monument ? LIMESTONE : NACRE;
  const tailColour = monument ? STONE_LIGHT : VIOLET;
  const accent = monument ? BRONZE : ROSE;
  const glow = monument ? 0.012 : 0.15;
  const skinRole = monument ? MATERIAL_ROLE.limestone : MATERIAL_ROLE.nacre;
  const parts: THREE.BufferGeometry[] = [];
  parts.push(styled(new THREE.SphereGeometry(0.18, 12, 8), {
    position: new THREE.Vector3(0, 1.27, 0),
    scale: new THREE.Vector3(0.9, 1.08, 0.82),
    colour: skin,
    glow,
    materialRole: skinRole
  }));
  if (!monument) {
    // Midground inhabitants used to have a literal blank sphere for a head.
    // Oversized light/dark eye layers and a coral mouth survive the 27–40 px
    // phone silhouette without introducing another material or draw call.
    for (const side of [-1, 1]) {
      parts.push(
        styled(new THREE.SphereGeometry(0.058, 8, 6), {
          position: new THREE.Vector3(side * 0.066, 1.3, 0.15),
          scale: new THREE.Vector3(1, 0.92, 0.42),
          colour: FACE_WHITE,
          glow: 0.24,
          materialRole: MATERIAL_ROLE.nacre
        }),
        styled(new THREE.SphereGeometry(0.032, 7, 5), {
          position: new THREE.Vector3(side * 0.066, 1.3, 0.174),
          scale: new THREE.Vector3(1, 0.96, 0.38),
          colour: EYE_DARK,
          glow: 0.05,
          materialRole: MATERIAL_ROLE.lapis
        }),
        styled(new THREE.SphereGeometry(0.01, 5, 4), {
          position: new THREE.Vector3(side * 0.058, 1.314, 0.188),
          colour: FACE_WHITE,
          glow: 0.52,
          materialRole: MATERIAL_ROLE.crystal
        })
      );
    }
    parts.push(styled(new THREE.TorusGeometry(
      0.042,
      0.009,
      4,
      10,
      Math.PI
    ), {
      position: new THREE.Vector3(0, 1.225, 0.166),
      rotation: new THREE.Euler(0, 0, Math.PI),
      scale: new THREE.Vector3(1, 0.58, 1),
      colour: ROSE,
      glow: 0.18,
      materialRole: MATERIAL_ROLE.livingCoral
    }));
  }
  parts.push(styled(new THREE.CapsuleGeometry(0.17, 0.42, 5, 10), {
    position: new THREE.Vector3(0, 0.88, 0),
    scale: new THREE.Vector3(0.9, 1, 0.72),
    colour: skin,
    glow,
    materialRole: skinRole
  }));
  const tail = new THREE.Shape([
    new THREE.Vector2(-0.15, 0.85),
    new THREE.Vector2(0.15, 0.85),
    new THREE.Vector2(0.12, 0.48),
    new THREE.Vector2(0.03, 0.18),
    new THREE.Vector2(0.28, -0.1),
    new THREE.Vector2(0.02, -0.02),
    new THREE.Vector2(-0.28, -0.1),
    new THREE.Vector2(-0.03, 0.18),
    new THREE.Vector2(-0.12, 0.48)
  ]);
  const tailGeometry = new THREE.ExtrudeGeometry(tail, {
    depth: 0.16,
    steps: 1,
    bevelEnabled: true,
    bevelSegments: 1,
    bevelSize: 0.025,
    bevelThickness: 0.018
  });
  tailGeometry.translate(0, 0, -0.08);
  parts.push(styled(tailGeometry, {
    colour: tailColour,
    glow: monument ? 0.012 : 0.18,
    materialRole: monument ? MATERIAL_ROLE.limestone : MATERIAL_ROLE.livingCoral
  }));
  for (const side of [-1, 1]) {
    parts.push(styled(curvedTube([
      new THREE.Vector3(side * 0.12, 1.02, 0),
      new THREE.Vector3(side * 0.31, 0.9, 0.015),
      new THREE.Vector3(side * 0.37, 0.68, 0.02)
    ], 7, 0.035, 5), {
      colour: skin,
      glow,
      materialRole: skinRole
    }));
    parts.push(styled(curvedTube([
      new THREE.Vector3(side * 0.12, 1.38, -0.03),
      new THREE.Vector3(side * 0.23, 1.48, 0),
      new THREE.Vector3(side * 0.29, 1.34, 0.03)
    ], 6, 0.038, 5), {
      colour: accent,
      glow: monument ? 0.018 : 0.19,
      materialRole: monument ? MATERIAL_ROLE.bronze : MATERIAL_ROLE.livingCoral
    }));
  }
  parts.push(styled(new THREE.TorusGeometry(0.26, 0.025, 5, 16, Math.PI * 1.5), {
    position: new THREE.Vector3(0, 1.3, -0.08),
    rotation: new THREE.Euler(0, 0, -Math.PI * 0.25),
    colour: accent,
    glow: monument ? 0.02 : 0.2,
    materialRole: monument ? MATERIAL_ROLE.bronze : MATERIAL_ROLE.livingCoral
  }));
  return merged(parts);
}

export interface ProductionMerfolkParts {
  body: THREE.BufferGeometry;
  face: THREE.BufferGeometry;
  eyes: THREE.BufferGeometry;
}

interface PopulationPalette {
  skin: THREE.Color;
  skinLight: THREE.Color;
  hair: THREE.Color;
  hairTip: THREE.Color;
  tail: THREE.Color;
  tailLight: THREE.Color;
  accent: THREE.Color;
}

const CITIZEN_PALETTE: PopulationPalette = {
  skin: MERFOLK_SKIN,
  skinLight: MERFOLK_SKIN_LIGHT,
  hair: MERFOLK_HAIR,
  hairTip: MERFOLK_HAIR_TIP,
  tail: MERFOLK_TAIL,
  tailLight: MERFOLK_TAIL_LIGHT,
  accent: ROSE
};

const HERALD_PALETTE: PopulationPalette = {
  skin: new THREE.Color(0xd9c2d3),
  skinLight: new THREE.Color(0xf4e1e6),
  hair: new THREE.Color(0x3b245f),
  hairTip: new THREE.Color(0x9a4f83),
  tail: new THREE.Color(0x603f88),
  tailLight: new THREE.Color(0xa1538b),
  accent: new THREE.Color(0xc45c83)
};

/**
 * A small hand-shaped face shell for the current swimmers.  The old swimmer
 * inherited the same round population head as the upright residents, which
 * made it read as a white ball with eyes when reduced to phone scale.  This
 * keeps one continuous surface while introducing fuller cheeks, a tapered
 * jaw, a softer forehead and a shallow muzzle plane.
 */
function sculptedSwimmerFaceGeometry(radius: number): THREE.BufferGeometry {
  const geometry = new THREE.SphereGeometry(radius, 18, 12);
  const positions = geometry.getAttribute("position");
  const vertex = new THREE.Vector3();
  for (let index = 0; index < positions.count; index++) {
    vertex.fromBufferAttribute(positions, index);
    const normalY = vertex.y / radius;
    const cheek = 1 + 0.105 * Math.exp(
      -Math.pow((normalY + 0.12) / 0.34, 2)
    );
    const chinProgress = THREE.MathUtils.clamp(
      (-normalY - 0.18) / 0.82,
      0,
      1
    );
    const jaw = 1 - 0.24 * chinProgress * chinProgress;
    vertex.x *= 0.94 * cheek * jaw;
    vertex.y *= 1.08;
    vertex.z *= 0.8;
    if (vertex.z > 0) {
      const centreWeight = THREE.MathUtils.clamp(
        1 - Math.pow(vertex.x / radius, 2) - Math.pow(vertex.y / radius, 2),
        0,
        1
      );
      vertex.z += centreWeight * radius * 0.045;
    }
    positions.setXYZ(index, vertex.x, vertex.y, vertex.z);
  }
  positions.needsUpdate = true;
  geometry.computeVertexNormals();
  return geometry;
}

/** A shallow almond rather than another protruding eyeball primitive. */
function almondGeometry(
  width: number,
  height: number,
  depth: number
): THREE.BufferGeometry {
  const halfWidth = width * 0.5;
  const halfHeight = height * 0.5;
  const shape = new THREE.Shape();
  shape.moveTo(-halfWidth, 0);
  shape.bezierCurveTo(
    -halfWidth * 0.46,
    halfHeight,
    halfWidth * 0.46,
    halfHeight,
    halfWidth,
    0
  );
  shape.bezierCurveTo(
    halfWidth * 0.46,
    -halfHeight,
    -halfWidth * 0.46,
    -halfHeight,
    -halfWidth,
    0
  );
  const geometry = new THREE.ExtrudeGeometry(shape, {
    depth,
    steps: 1,
    curveSegments: 4,
    bevelEnabled: true,
    bevelSegments: 1,
    bevelSize: depth * 0.22,
    bevelThickness: depth * 0.18
  });
  geometry.translate(0, 0, -depth * 0.5);
  return geometry;
}

/** Side-fin silhouette that frames the face without becoming a hair ring. */
function swimmerEarFinGeometry(): THREE.BufferGeometry {
  const shape = new THREE.Shape([
    new THREE.Vector2(0, 0),
    new THREE.Vector2(0.105, 0.095),
    new THREE.Vector2(0.17, 0.025),
    new THREE.Vector2(0.145, -0.085),
    new THREE.Vector2(0.045, -0.055)
  ]);
  const geometry = new THREE.ExtrudeGeometry(shape, {
    depth: 0.028,
    steps: 1,
    curveSegments: 2,
    bevelEnabled: true,
    bevelSegments: 1,
    bevelSize: 0.006,
    bevelThickness: 0.005
  });
  geometry.translate(0, 0, -0.014);
  return geometry;
}

function sculptedSwimmerPopulationHead(
  centre: THREE.Vector3,
  palette: PopulationPalette
): {
  body: THREE.BufferGeometry[];
  face: THREE.BufferGeometry[];
  eyes: THREE.BufferGeometry[];
} {
  const body: THREE.BufferGeometry[] = [];
  const face: THREE.BufferGeometry[] = [];
  const eyes: THREE.BufferGeometry[] = [];
  const radius = 0.265;

  face.push(styled(sculptedSwimmerFaceGeometry(radius), {
    position: centre,
    colour: palette.skinLight,
    glow: 0.13,
    materialRole: MATERIAL_ROLE.nacre
  }));

  // A high side-swept cap and two separated ribbons keep the face open.  The
  // hair trails behind the direction of travel instead of encircling the head.
  body.push(styled(new THREE.SphereGeometry(
    radius * 1.018,
    16,
    9,
    0,
    Math.PI * 2,
    0,
    Math.PI * 0.46
  ), {
    position: centre.clone().add(new THREE.Vector3(-0.012, 0.092, -0.03)),
    scale: new THREE.Vector3(1.01, 0.9, 1),
    colour: palette.hair,
    glow: 0.08,
    materialRole: MATERIAL_ROLE.lapis
  }));
  for (const [index, offset] of [-0.092, 0.088].entries()) {
    body.push(styled(curvedTube([
      centre.clone().add(new THREE.Vector3(-0.16, offset, -0.055)),
      centre.clone().add(new THREE.Vector3(-0.35, offset + 0.045, -0.07)),
      centre.clone().add(new THREE.Vector3(-0.58, offset - 0.055, -0.04))
    ], 8, index === 0 ? 0.031 : 0.027, 5), {
      colour: index === 0 ? palette.hair : palette.hairTip,
      glow: 0.12,
      sway: 0.36,
      materialRole: MATERIAL_ROLE.lapis
    }));
  }

  // Paired nacre fins make the head read as merfolk before the tiny facial
  // details resolve. They sit behind the facial plane and remain asymmetric
  // after the whole swimmer mirrors to follow its travel direction.
  for (const side of [-1, 1]) {
    body.push(styled(swimmerEarFinGeometry(), {
      position: centre.clone().add(new THREE.Vector3(side * 0.225, -0.005, 0.005)),
      scale: new THREE.Vector3(side, 1, 1),
      rotation: new THREE.Euler(0, 0, side * 0.18),
      colour: palette.tailLight,
      glow: 0.21,
      sway: 0.2,
      materialRole: MATERIAL_ROLE.crystal
    }));
  }

  const eyeY = centre.y + 0.038;
  for (const side of [-1, 1]) {
    const eyeX = centre.x + side * 0.086;
    const gazeX = eyeX + 0.012;
    eyes.push(
      // The reduced Coral-Warden evidence exposed a two-pixel eye stack even
      // though the full matrix remained readable.  Grow only the authored
      // almond and its internal marks: the swimmer body, head and choreography
      // retain the smaller Version 29 presentation scale.
      styled(almondGeometry(0.138, 0.178, 0.018), {
        position: new THREE.Vector3(eyeX, eyeY, centre.z + 0.219),
        colour: FACE_WHITE,
        glow: 0.2,
        materialRole: MATERIAL_ROLE.nacre
      }),
      styled(new THREE.CircleGeometry(0.034, 10), {
        position: new THREE.Vector3(gazeX, eyeY - 0.001, centre.z + 0.232),
        scale: new THREE.Vector3(0.92, 1, 1),
        colour: EYE_IRIS,
        glow: 0.24,
        materialRole: MATERIAL_ROLE.crystal
      }),
      styled(new THREE.CircleGeometry(0.0185, 9), {
        position: new THREE.Vector3(gazeX + 0.003, eyeY - 0.002, centre.z + 0.235),
        scale: new THREE.Vector3(0.9, 1, 1),
        colour: EYE_DARK,
        glow: 0.04,
        materialRole: MATERIAL_ROLE.lapis
      }),
      styled(new THREE.CircleGeometry(0.008, 7), {
        position: new THREE.Vector3(
          gazeX - 0.006,
          eyeY + 0.011,
          centre.z + 0.238
        ),
        colour: FACE_WHITE,
        glow: 0.48,
        materialRole: MATERIAL_ROLE.crystal
      })
    );

    // The outer brow rises slightly while the inner edge stays relaxed. This
    // reads as alert and friendly rather than wide-eyed or startled.
    face.push(styled(curvedTube([
      new THREE.Vector3(eyeX - side * 0.052, eyeY + 0.078, centre.z + 0.221),
      new THREE.Vector3(eyeX, eyeY + 0.094, centre.z + 0.226),
      new THREE.Vector3(eyeX + side * 0.052, eyeY + 0.086, centre.z + 0.221)
    ], 6, 0.0095, 4), {
      colour: palette.hair,
      glow: 0.05,
      materialRole: MATERIAL_ROLE.lapis
    }));
  }

  face.push(
    styled(new THREE.SphereGeometry(0.023, 7, 5), {
      position: centre.clone().add(new THREE.Vector3(0.014, -0.018, 0.236)),
      scale: new THREE.Vector3(0.78, 1.12, 0.42),
      colour: palette.skin,
      glow: 0.07,
      materialRole: MATERIAL_ROLE.nacre
    }),
    styled(curvedTube([
      centre.clone().add(new THREE.Vector3(-0.061, -0.078, 0.224)),
      centre.clone().add(new THREE.Vector3(-0.03, -0.098, 0.232)),
      centre.clone().add(new THREE.Vector3(0.012, -0.103, 0.235)),
      centre.clone().add(new THREE.Vector3(0.061, -0.075, 0.224))
    ], 8, 0.009, 5), {
      colour: palette.accent,
      glow: 0.15,
      materialRole: MATERIAL_ROLE.livingCoral
    }),
    styled(new THREE.SphereGeometry(0.027, 7, 5), {
      position: centre.clone().add(new THREE.Vector3(-0.139, -0.046, 0.205)),
      scale: new THREE.Vector3(1.35, 0.56, 0.3),
      colour: palette.accent,
      glow: 0.08,
      materialRole: MATERIAL_ROLE.livingCoral
    }),
    styled(new THREE.SphereGeometry(0.027, 7, 5), {
      position: centre.clone().add(new THREE.Vector3(0.139, -0.046, 0.205)),
      scale: new THREE.Vector3(1.35, 0.56, 0.3),
      colour: palette.accent,
      glow: 0.08,
      materialRole: MATERIAL_ROLE.livingCoral
    }),
    styled(new THREE.OctahedronGeometry(0.037, 0), {
      position: centre.clone().add(new THREE.Vector3(0, 0.205, 0.208)),
      scale: new THREE.Vector3(0.82, 1.18, 0.55),
      colour: palette.tailLight,
      glow: 0.38,
      materialRole: MATERIAL_ROLE.crystal
    })
  );

  return { body, face, eyes };
}

function friendlyPopulationHead(
  centre: THREE.Vector3,
  palette: PopulationPalette,
  pose: "upright" | "swim"
): {
  body: THREE.BufferGeometry[];
  face: THREE.BufferGeometry[];
  eyes: THREE.BufferGeometry[];
} {
  if (pose === "swim") {
    return sculptedSwimmerPopulationHead(centre, palette);
  }
  const body: THREE.BufferGeometry[] = [];
  const face: THREE.BufferGeometry[] = [];
  const eyes: THREE.BufferGeometry[] = [];
  const radius = 0.235;

  // A soft, warm nacre face and high hairline replace the grey blank sphere
  // and dark ring that read as a mask on a phone.
  face.push(styled(new THREE.SphereGeometry(radius, 12, 8), {
    position: centre,
    // Preserve the reduced head width/depth while giving the semantic facial
    // plane enough vertical area to survive the smallest approved capture.
    scale: new THREE.Vector3(0.96, 1.12, 0.82),
    colour: palette.skinLight,
    glow: 0.13,
    materialRole: MATERIAL_ROLE.nacre
  }));
  body.push(styled(new THREE.SphereGeometry(
    radius * 1.025,
    12,
    7,
    0,
    Math.PI * 2,
    0,
    Math.PI * 0.47
  ), {
    position: centre.clone().add(new THREE.Vector3(0, 0.082, -0.028)),
    scale: new THREE.Vector3(1, 0.9, 1),
    colour: palette.hair,
    glow: 0.08,
    materialRole: MATERIAL_ROLE.lapis
  }));

  for (const side of [-1, 1]) {
    body.push(styled(curvedTube([
      centre.clone().add(new THREE.Vector3(side * 0.17, 0.08, -0.045)),
      centre.clone().add(new THREE.Vector3(side * 0.225, -0.08, -0.055)),
      centre.clone().add(new THREE.Vector3(side * 0.19, -0.245, -0.035))
    ], 6, 0.027, 5), {
      colour: side < 0 ? palette.hair : palette.hairTip,
      glow: 0.11,
      sway: 0.26,
      materialRole: MATERIAL_ROLE.lapis
    }));
  }

  for (const side of [-1, 1]) {
    const eyeX = centre.x + side * 0.083;
    const eyeY = centre.y + 0.035;
    eyes.push(
      styled(new THREE.SphereGeometry(0.068, 9, 6), {
        position: new THREE.Vector3(eyeX, eyeY, centre.z + 0.194),
        scale: new THREE.Vector3(1, 0.92, 0.38),
        colour: FACE_WHITE,
        glow: 0.2,
        materialRole: MATERIAL_ROLE.nacre
      }),
      styled(new THREE.SphereGeometry(0.038, 8, 5), {
        position: new THREE.Vector3(eyeX, eyeY - 0.002, centre.z + 0.218),
        scale: new THREE.Vector3(1, 0.96, 0.34),
        colour: EYE_DARK,
        glow: 0.04,
        materialRole: MATERIAL_ROLE.lapis
      }),
      styled(new THREE.SphereGeometry(0.013, 5, 4), {
        position: new THREE.Vector3(
          eyeX - side * 0.009,
          eyeY + 0.014,
          centre.z + 0.232
        ),
        colour: FACE_WHITE,
        glow: 0.46,
        materialRole: MATERIAL_ROLE.crystal
      })
    );

    // A short, lifted brow gives the tiny phone-scale face an intentional
    // friendly expression instead of the blank doll stare from the original
    // population mesh.
    face.push(styled(curvedTube([
      new THREE.Vector3(eyeX - side * 0.052, eyeY + 0.084, centre.z + 0.205),
      new THREE.Vector3(eyeX, eyeY + 0.096, centre.z + 0.214),
      new THREE.Vector3(eyeX + side * 0.052, eyeY + 0.078, centre.z + 0.205)
    ], 5, 0.011, 4), {
      colour: palette.hair,
      glow: 0.06,
      materialRole: MATERIAL_ROLE.lapis
    }));
  }

  face.push(
    styled(new THREE.SphereGeometry(0.026, 6, 4), {
      position: centre.clone().add(new THREE.Vector3(0, -0.018, 0.221)),
      scale: new THREE.Vector3(0.82, 1.12, 0.5),
      colour: palette.skin,
      glow: 0.08,
      materialRole: MATERIAL_ROLE.nacre
    }),
    styled(new THREE.TorusGeometry(0.049, 0.01, 5, 11, Math.PI), {
      position: centre.clone().add(new THREE.Vector3(0, -0.09, 0.207)),
      rotation: new THREE.Euler(0, 0, Math.PI),
      scale: new THREE.Vector3(1, 0.56, 1),
      colour: palette.accent,
      glow: 0.14,
      materialRole: MATERIAL_ROLE.livingCoral
    }),
    styled(new THREE.SphereGeometry(0.024, 6, 4), {
      position: centre.clone().add(new THREE.Vector3(-0.135, -0.045, 0.192)),
      scale: new THREE.Vector3(1.25, 0.58, 0.34),
      colour: palette.accent,
      glow: 0.09,
      materialRole: MATERIAL_ROLE.livingCoral
    }),
    styled(new THREE.SphereGeometry(0.024, 6, 4), {
      position: centre.clone().add(new THREE.Vector3(0.135, -0.045, 0.192)),
      scale: new THREE.Vector3(1.25, 0.58, 0.34),
      colour: palette.accent,
      glow: 0.09,
      materialRole: MATERIAL_ROLE.livingCoral
    })
  );

  return { body, face, eyes };
}

function uprightPopulationParts(
  palette: PopulationPalette
): ProductionMerfolkParts {
  const head = friendlyPopulationHead(
    new THREE.Vector3(0, 1.31, 0),
    palette,
    "upright"
  );
  const body = [...head.body];
  body.push(
    styled(new THREE.CapsuleGeometry(0.175, 0.39, 5, 9), {
      position: new THREE.Vector3(0, 0.88, 0),
      scale: new THREE.Vector3(0.92, 1, 0.74),
      colour: palette.skin,
      glow: 0.11,
      materialRole: MATERIAL_ROLE.nacre
    }),
    styled(new THREE.TorusGeometry(0.16, 0.035, 5, 14, Math.PI), {
      position: new THREE.Vector3(0, 1.015, 0.13),
      rotation: new THREE.Euler(0, 0, Math.PI),
      scale: new THREE.Vector3(1, 0.76, 0.7),
      colour: palette.accent,
      glow: 0.17,
      materialRole: MATERIAL_ROLE.livingCoral
    })
  );

  const tail = new THREE.Shape([
    new THREE.Vector2(-0.16, 0.84),
    new THREE.Vector2(0.16, 0.84),
    new THREE.Vector2(0.13, 0.48),
    new THREE.Vector2(0.045, 0.17),
    new THREE.Vector2(0.32, -0.11),
    new THREE.Vector2(0.025, -0.025),
    new THREE.Vector2(-0.32, -0.11),
    new THREE.Vector2(-0.045, 0.17),
    new THREE.Vector2(-0.13, 0.48)
  ]);
  const tailGeometry = new THREE.ExtrudeGeometry(tail, {
    depth: 0.17,
    steps: 1,
    bevelEnabled: true,
    bevelSegments: 1,
    bevelSize: 0.025,
    bevelThickness: 0.018
  });
  tailGeometry.translate(0, 0, -0.085);
  body.push(styled(tailGeometry, {
    colour: palette.tail,
    glow: 0.16,
    sway: (position) => Math.max(0, 0.2 - position.y) * 0.8,
    materialRole: MATERIAL_ROLE.livingCoral
  }));

  for (const side of [-1, 1]) {
    body.push(styled(curvedTube([
      new THREE.Vector3(side * 0.12, 1.02, 0.01),
      new THREE.Vector3(side * 0.29, 0.91, 0.025),
      new THREE.Vector3(side * 0.34, 0.68, 0.035)
    ], 7, 0.037, 5), {
      colour: palette.skin,
      glow: 0.1,
      materialRole: MATERIAL_ROLE.nacre
    }));
  }

  return {
    body: merged(body),
    face: merged(head.face),
    eyes: merged(head.eyes)
  };
}

function swimmerPopulationParts(): ProductionMerfolkParts {
  const palette = CITIZEN_PALETTE;
  const head = friendlyPopulationHead(
    new THREE.Vector3(0.62, 0.16, 0),
    palette,
    "swim"
  );
  const body = [...head.body];
  body.push(
    styled(new THREE.CapsuleGeometry(0.17, 0.34, 5, 9), {
      position: new THREE.Vector3(0.26, 0.03, 0),
      rotation: new THREE.Euler(0, 0, -Math.PI / 2),
      scale: new THREE.Vector3(0.9, 1, 0.72),
      colour: palette.skin,
      glow: 0.12,
      materialRole: MATERIAL_ROLE.nacre
    }),
    styled(new THREE.TorusGeometry(0.155, 0.034, 5, 14, Math.PI), {
      position: new THREE.Vector3(0.34, 0.03, 0.13),
      rotation: new THREE.Euler(0, 0, Math.PI / 2),
      scale: new THREE.Vector3(1, 0.72, 0.72),
      colour: palette.accent,
      glow: 0.18,
      materialRole: MATERIAL_ROLE.livingCoral
    })
  );

  const tail = new THREE.Shape([
    new THREE.Vector2(0.22, 0.18),
    new THREE.Vector2(0.22, -0.15),
    new THREE.Vector2(-0.18, -0.14),
    new THREE.Vector2(-0.48, -0.06),
    new THREE.Vector2(-0.7, 0.07),
    new THREE.Vector2(-0.5, 0.17),
    new THREE.Vector2(-0.18, 0.2)
  ]);
  const tailGeometry = new THREE.ExtrudeGeometry(tail, {
    depth: 0.17,
    steps: 1,
    bevelEnabled: true,
    bevelSegments: 1,
    bevelSize: 0.025,
    bevelThickness: 0.018
  });
  tailGeometry.translate(0, 0, -0.085);
  body.push(styled(tailGeometry, {
    colour: palette.tail,
    glow: 0.18,
    sway: (position) => Math.max(0, -position.x) * 0.48,
    materialRole: MATERIAL_ROLE.crystal
  }));

  const upperFin = new THREE.Shape([
    new THREE.Vector2(-0.61, 0.08),
    new THREE.Vector2(-0.94, 0.38),
    new THREE.Vector2(-1.04, 0.16),
    new THREE.Vector2(-0.77, -0.01)
  ]);
  const lowerFin = new THREE.Shape([
    new THREE.Vector2(-0.61, 0.06),
    new THREE.Vector2(-0.94, -0.33),
    new THREE.Vector2(-1.05, -0.12),
    new THREE.Vector2(-0.77, 0.12)
  ]);
  for (const fin of [upperFin, lowerFin]) {
    const geometry = new THREE.ExtrudeGeometry(fin, {
      depth: 0.08,
      steps: 1,
      bevelEnabled: true,
      bevelSegments: 1,
      bevelSize: 0.012,
      bevelThickness: 0.01
    });
    geometry.translate(0, 0, -0.04);
    body.push(styled(geometry, {
      colour: palette.tailLight,
      glow: 0.22,
      sway: 0.42,
      materialRole: MATERIAL_ROLE.crystal
    }));
  }

  // Arms sweep with the current instead of hanging downward from a rotated
  // standing model. The face itself remains upright and friendly.
  for (const side of [-1, 1]) {
    body.push(styled(curvedTube([
      new THREE.Vector3(0.38, side * 0.11, 0.01),
      new THREE.Vector3(0.16, side * 0.27, 0.02),
      new THREE.Vector3(-0.09, side * 0.24, 0.03)
    ], 7, 0.035, 5), {
      colour: palette.skin,
      glow: 0.11,
      materialRole: MATERIAL_ROLE.nacre
    }));
  }

  return {
    body: merged(body),
    face: merged(head.face),
    eyes: merged(head.eyes)
  };
}

function tagPopulationParts(
  parts: ProductionMerfolkParts,
  role: string
): ProductionMerfolkParts {
  parts.body.userData["populationRole"] = role;
  parts.face.userData["populationRole"] = role;
  parts.face.userData["populationFeature"] = "friendly-face";
  parts.eyes.userData["populationRole"] = role;
  parts.eyes.userData["populationFeature"] = "expressive-eyes";
  if (role === "current-swimmer") {
    for (const geometry of [parts.body, parts.face, parts.eyes]) {
      geometry.userData["authoredCharacterVersion"] =
        "moon-current-swimmer-v2";
    }
    parts.face.userData["faceStyle"] =
      "sculpted-oval-cheeks-tapered-jaw-open-hairline";
    parts.eyes.userData["eyeLine"] = "level";
    parts.eyes.userData["gazeDirection"] = "travel-forward";
    parts.eyes.userData["eyeStyle"] =
      "almond-white-turquoise-iris-dark-pupil-catchlight";
  }
  return parts;
}

function mergePopulationParts(
  parts: ProductionMerfolkParts,
  role: string
): THREE.BufferGeometry {
  const geometry = merged([parts.body, parts.face, parts.eyes]);
  geometry.userData["populationRole"] = role;
  geometry.userData["facialFeatures"] = role === "current-swimmer"
    ? "sculpted-face-almond-eye-iris-pupil-highlight-smile-cheeks-ear-fins"
    : "warm-face-eye-white-pupil-highlight-smile-cheeks";
  geometry.userData["faceOrientation"] = role === "current-swimmer"
    ? "screen-upright-level-forward-gaze"
    : "screen-upright";
  if (role === "current-swimmer") {
    geometry.userData["authoredCharacterVersion"] =
      "moon-current-swimmer-v2";
  }
  return geometry;
}

export function createProductionMerfolkGuardian(): THREE.BufferGeometry {
  return mergePopulationParts(createProductionMerfolkCitizenParts(), "reef-citizen");
}

/**
 * Lightweight midground citizen. The legacy export name above remains as a
 * compatibility alias while the inhabited-city pass gives each population
 * role an explicit production signature.
 */
export function createProductionMerfolkCitizen(): THREE.BufferGeometry {
  return mergePopulationParts(createProductionMerfolkCitizenParts(), "reef-citizen");
}

export function createProductionMerfolkCitizenParts(): ProductionMerfolkParts {
  return tagPopulationParts(uprightPopulationParts(CITIZEN_PALETTE), "reef-citizen");
}

function merfolkMantle(
  colour: THREE.Color,
  role: MaterialRole
): THREE.BufferGeometry {
  const shape = new THREE.Shape([
    new THREE.Vector2(0, 0),
    new THREE.Vector2(0.26, 0.12),
    new THREE.Vector2(0.46, 0.02),
    new THREE.Vector2(0.32, -0.18),
    new THREE.Vector2(0.48, -0.36),
    new THREE.Vector2(0.16, -0.3),
    new THREE.Vector2(0, -0.48),
    new THREE.Vector2(-0.16, -0.3),
    new THREE.Vector2(-0.48, -0.36),
    new THREE.Vector2(-0.32, -0.18),
    new THREE.Vector2(-0.46, 0.02),
    new THREE.Vector2(-0.26, 0.12)
  ]);
  const geometry = new THREE.ExtrudeGeometry(shape, {
    depth: 0.06,
    steps: 1,
    bevelEnabled: true,
    bevelSegments: 1,
    bevelSize: 0.012,
    bevelThickness: 0.01
  });
  geometry.translate(0, 0, -0.03);
  return styled(geometry, {
    position: new THREE.Vector3(0, 1.02, -0.13),
    rotation: new THREE.Euler(0.08, 0, 0),
    scale: new THREE.Vector3(0.78, 0.72, 1),
    colour,
    glow: 0.2,
    sway: 0.34,
    materialRole: role
  });
}

/**
 * A current swimmer is authored horizontally from the start. Its eyes remain
 * level while the tail, swept arms and hair carry the swimming direction.
 */
export function createProductionMerfolkSwimmer(): THREE.BufferGeometry {
  return mergePopulationParts(
    createProductionMerfolkSwimmerParts(),
    "current-swimmer"
  );
}

export function createProductionMerfolkSwimmerParts(): ProductionMerfolkParts {
  return tagPopulationParts(swimmerPopulationParts(), "current-swimmer");
}

/**
 * Gate heralds carry a readable spiral conch and a scalloped ceremonial
 * mantle. They are paired at the gate shoulders rather than scattered as
 * generic decoration, so the city reads as inhabited and purposeful.
 */
export function createProductionMerfolkConchHerald(): THREE.BufferGeometry {
  const parts = createProductionMerfolkConchHeraldParts();
  const geometry = mergePopulationParts(parts, "conch-herald");
  geometry.userData["ceremonialProp"] = "spiral-conch";
  return geometry;
}

export function createProductionMerfolkConchHeraldParts(): ProductionMerfolkParts {
  const conchLip = new THREE.Shape([
    new THREE.Vector2(-0.12, -0.04),
    new THREE.Vector2(0.12, -0.08),
    new THREE.Vector2(0.2, 0.02),
    new THREE.Vector2(0.1, 0.1),
    new THREE.Vector2(-0.08, 0.08)
  ]);
  const lipGeometry = new THREE.ExtrudeGeometry(conchLip, {
    depth: 0.08,
    steps: 1,
    bevelEnabled: true,
    bevelSegments: 1,
    bevelSize: 0.016,
    bevelThickness: 0.012
  });
  lipGeometry.translate(0, 0, -0.04);
  const parts = uprightPopulationParts(HERALD_PALETTE);
  parts.body = merged([
    parts.body,
    merfolkMantle(ROSE, MATERIAL_ROLE.livingCoral),
    styled(new THREE.TorusGeometry(0.14, 0.052, 6, 18, Math.PI * 1.72), {
      position: new THREE.Vector3(0.24, 1.13, 0.15),
      rotation: new THREE.Euler(0.18, 0.42, -0.78),
      scale: new THREE.Vector3(1, 0.78, 0.72),
      colour: BRONZE,
      glow: 0.08,
      materialRole: MATERIAL_ROLE.bronze
    }),
    styled(lipGeometry, {
      position: new THREE.Vector3(0.36, 1.18, 0.15),
      rotation: new THREE.Euler(0.1, 0.2, -0.32),
      scale: new THREE.Vector3(0.72, 0.72, 0.72),
      colour: NACRE,
      glow: 0.12,
      materialRole: MATERIAL_ROLE.nacre
    }),
    styled(new THREE.OctahedronGeometry(0.055, 0), {
      position: new THREE.Vector3(0.24, 1.13, 0.23),
      colour: CRYSTAL,
      glow: 0.34,
      materialRole: MATERIAL_ROLE.crystal
    })
  ]);
  parts.body.userData["ceremonialProp"] = "spiral-conch";
  return tagPopulationParts(parts, "conch-herald");
}

export function createProductionMerfolkMonument(): THREE.BufferGeometry {
  const figure = merfolkFigure(true);
  return merged([
    styled(figure, {
      position: new THREE.Vector3(0, 0.2, 0),
      colour: LIMESTONE,
      materialRole: MATERIAL_ROLE.limestone
    }),
    styled(new THREE.CylinderGeometry(0.45, 0.54, 0.28, 10), {
      position: new THREE.Vector3(0, 0.14, 0),
      colour: STONE_DARK,
      materialRole: MATERIAL_ROLE.limestone
    }),
    styled(new THREE.TorusGeometry(0.4, 0.035, 5, 18), {
      position: new THREE.Vector3(0, 0.29, 0),
      rotation: new THREE.Euler(Math.PI / 2, 0, 0),
      colour: BRONZE,
      glow: 0.025,
      materialRole: MATERIAL_ROLE.bronze
    })
  ]);
}

export function createProductionTideSpear(): THREE.BufferGeometry {
  const blade = new THREE.Shape([
    new THREE.Vector2(0, 0.56),
    new THREE.Vector2(0.13, 0.24),
    new THREE.Vector2(0.05, 0.31),
    new THREE.Vector2(0, 0.18),
    new THREE.Vector2(-0.05, 0.31),
    new THREE.Vector2(-0.13, 0.24)
  ]);
  const bladeGeometry = new THREE.ExtrudeGeometry(blade, {
    depth: 0.08,
    bevelEnabled: true,
    bevelSegments: 1,
    bevelSize: 0.012,
    bevelThickness: 0.01
  });
  bladeGeometry.translate(0, 0, -0.04);
  return merged([
    styled(new THREE.CylinderGeometry(0.035, 0.055, 1.45, 8), {
      position: new THREE.Vector3(0, 0.84, 0),
      colour: BRONZE,
      glow: 0.025,
      materialRole: MATERIAL_ROLE.bronze
    }),
    styled(bladeGeometry, {
      position: new THREE.Vector3(0, 1.5, 0),
      colour: CRYSTAL,
      glow: 0.11,
      materialRole: MATERIAL_ROLE.crystal
    }),
    styled(new THREE.CylinderGeometry(0.23, 0.3, 0.18, 9), {
      position: new THREE.Vector3(0, 0.09, 0),
      colour: STONE_DARK,
      materialRole: MATERIAL_ROLE.limestone
    })
  ]);
}

export function createProductionConchFountain(): THREE.BufferGeometry {
  const spiral: THREE.Vector3[] = [];
  for (let index = 0; index < 13; index++) {
    const t = index / 12;
    const angle = t * Math.PI * 3.8;
    const radius = THREE.MathUtils.lerp(0.06, 0.34, t);
    spiral.push(new THREE.Vector3(
      Math.cos(angle) * radius,
      0.58 + Math.sin(angle) * radius,
      0.17
    ));
  }
  return merged([
    styled(new THREE.CylinderGeometry(0.48, 0.58, 0.22, 12), {
      position: new THREE.Vector3(0, 0.11, 0),
      colour: STONE_DARK,
      materialRole: MATERIAL_ROLE.limestone
    }),
    styled(new THREE.TorusGeometry(0.39, 0.075, 7, 18), {
      position: new THREE.Vector3(0, 0.24, 0),
      rotation: new THREE.Euler(Math.PI / 2, 0, 0),
      colour: NACRE,
      materialRole: MATERIAL_ROLE.nacre
    }),
    styled(curvedTube(spiral, 24, 0.045, 6), {
      colour: BRONZE,
      glow: 0.035,
      materialRole: MATERIAL_ROLE.bronze
    }),
    styled(curvedTube([
      new THREE.Vector3(0.23, 0.58, 0.16),
      new THREE.Vector3(0.34, 0.72, 0.12),
      new THREE.Vector3(0.42, 0.42, 0.06),
      new THREE.Vector3(0.34, 0.27, 0.02)
    ], 10, 0.025, 5), {
      colour: CYAN_LIGHT,
      glow: 0.16,
      materialRole: MATERIAL_ROLE.crystal,
      sway: 0.15
    })
  ]);
}

export function createProductionSkyline(): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = [];
  const heights = [0.72, 1.08, 0.84, 1.28, 0.78, 1.0, 0.64];
  for (let index = 0; index < heights.length; index++) {
    const x = THREE.MathUtils.lerp(-1.55, 1.55, index / (heights.length - 1));
    const radial = index % 2 === 0 ? 6 : 8;
    parts.push(styled(new THREE.CylinderGeometry(
      0.21 + (index % 3) * 0.018,
      0.25 + (index % 2) * 0.035,
      heights[index] ?? 1,
      radial,
      1,
      false
    ), {
      position: new THREE.Vector3(x, (heights[index] ?? 1) * 0.5, Math.sin(index) * 0.28),
      colour: index % 3 === 0 ? STONE : STONE_DARK,
      glow: 0.006
    }));
    if (index % 3 === 0) {
      const dome = new THREE.SphereGeometry(
        0.22,
        radial,
        4,
        0,
        Math.PI * 2,
        0,
        Math.PI * 0.55
      );
      parts.push(styled(dome, {
        position: new THREE.Vector3(
          x,
          heights[index] ?? 1,
          Math.sin(index) * 0.28
        ),
        scale: new THREE.Vector3(1, 0.7, 0.86),
        colour: STONE,
        glow: 0.01
      }));
    } else if (index % 2 === 1) {
      parts.push(styled(stoneBlock(0.28, 0.17, 0.28, 0.02), {
        position: new THREE.Vector3(
          x + (index % 4 === 1 ? -0.05 : 0.05),
          (heights[index] ?? 1) + 0.03,
          Math.sin(index) * 0.28
        ),
        rotation: new THREE.Euler(
          0.02,
          index % 4 === 1 ? -0.2 : 0.16,
          index % 4 === 1 ? -0.14 : 0.12
        ),
        colour: STONE_LIGHT,
        glow: 0.012
      }));
    }
  }
  return merged(parts);
}

export function createProductionMinnow(): THREE.BufferGeometry {
  return merged([
    styled(new THREE.SphereGeometry(0.28, 8, 5), {
      scale: new THREE.Vector3(1.6, 0.48, 0.55),
      colour: CYAN_LIGHT,
      glow: 0.55
    }),
    styled(new THREE.ConeGeometry(0.22, 0.34, 5), {
      position: new THREE.Vector3(-0.48, 0, 0),
      rotation: new THREE.Euler(0, 0, Math.PI / 2),
      scale: new THREE.Vector3(1, 0.3, 1),
      colour: VIOLET,
      glow: 0.42
    }),
    styled(new THREE.ConeGeometry(0.16, 0.26, 5), {
      position: new THREE.Vector3(-0.49, 0.09, 0),
      rotation: new THREE.Euler(0, 0, Math.PI / 2 + 0.38),
      scale: new THREE.Vector3(1, 0.24, 1),
      colour: ROSE,
      glow: 0.4
    })
  ]);
}

export function createProductionJelly(): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = [
    styled(new THREE.SphereGeometry(0.34, 10, 6, 0, Math.PI * 2, 0, Math.PI * 0.58), {
      scale: new THREE.Vector3(1.15, 0.72, 1),
      colour: VIOLET,
      glow: 0.56
    })
  ];
  for (let index = 0; index < 4; index++) {
    const angle = index / 4 * Math.PI * 2;
    parts.push(styled(branchBetween(
      new THREE.Vector3(Math.cos(angle) * 0.17, -0.02, Math.sin(angle) * 0.14),
      new THREE.Vector3(Math.cos(angle + 0.3) * 0.23, -0.55, Math.sin(angle + 0.3) * 0.2),
      0.025,
      0.012,
      4
    ), {
      colour: index % 2 === 0 ? CYAN : ROSE,
      glow: 0.48,
      sway: 1
    }));
  }
  return merged(parts);
}

export function createProductionRay(): THREE.BufferGeometry {
  const shape = new THREE.Shape([
    new THREE.Vector2(-0.8, 0),
    new THREE.Vector2(-0.18, 0.36),
    new THREE.Vector2(0.18, 0.36),
    new THREE.Vector2(0.8, 0),
    new THREE.Vector2(0.18, -0.28),
    new THREE.Vector2(0, -0.42),
    new THREE.Vector2(-0.18, -0.28)
  ]);
  const body = new THREE.ExtrudeGeometry(shape, {
    depth: 0.08,
    bevelEnabled: true,
    bevelSegments: 1,
    bevelSize: 0.025,
    bevelThickness: 0.025
  });
  body.rotateX(Math.PI / 2);
  return merged([
    styled(body, {
      scale: new THREE.Vector3(1, 0.55, 1),
      colour: CYAN,
      glow: 0.42
    }),
    styled(new THREE.CylinderGeometry(0.012, 0.035, 0.95, 5), {
      position: new THREE.Vector3(0, 0, 0.76),
      rotation: new THREE.Euler(Math.PI / 2, 0, 0),
      colour: VIOLET,
      glow: 0.38
    }),
    styled(new THREE.SphereGeometry(0.055, 6, 4), {
      position: new THREE.Vector3(-0.13, 0.08, 0.07),
      scale: new THREE.Vector3(1, 0.55, 1),
      colour: CYAN_LIGHT,
      glow: 0.62
    }),
    styled(new THREE.SphereGeometry(0.055, 6, 4), {
      position: new THREE.Vector3(0.13, 0.08, 0.07),
      scale: new THREE.Vector3(1, 0.55, 1),
      colour: CYAN_LIGHT,
      glow: 0.62
    })
  ]);
}

export function createProductionSpirit(): THREE.BufferGeometry {
  return merged([
    styled(new THREE.SphereGeometry(0.2, 8, 6), {
      scale: new THREE.Vector3(1.15, 0.72, 0.72),
      colour: CYAN_LIGHT,
      glow: 0.66
    }),
    styled(new THREE.TorusGeometry(0.22, 0.025, 4, 10, Math.PI * 1.4), {
      position: new THREE.Vector3(0, 0, -0.04),
      rotation: new THREE.Euler(0, 0, -0.62),
      colour: ROSE,
      glow: 0.58
    })
  ]);
}

export function productionTriangles(geometry: THREE.BufferGeometry): number {
  return Math.round(
    (geometry.index
      ? geometry.index.count
      : geometry.getAttribute("position").count) / 3
  );
}
