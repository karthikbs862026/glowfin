import * as THREE from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import type { ArtLod } from "./moonGardenGeometry";

const STONE = new THREE.Color(0x0a395e);
const STONE_LIGHT = new THREE.Color(0x1f6382);
const STONE_DARK = new THREE.Color(0x03172a);
const JOINT = new THREE.Color(0x071b2b);
const SHELL = new THREE.Color(0x668b82);
const CYAN = new THREE.Color(0x08758a);
const CYAN_LIGHT = new THREE.Color(0x20aeb9);
const VIOLET = new THREE.Color(0x512b70);
const ROSE = new THREE.Color(0x8b335d);

interface PartStyle {
  colour: THREE.Color;
  position?: THREE.Vector3;
  rotation?: THREE.Euler;
  scale?: THREE.Vector3;
  glow?: number;
  sway?: number | ((position: THREE.Vector3) => number);
}

function styled(
  source: THREE.BufferGeometry,
  {
    colour,
    position = new THREE.Vector3(),
    rotation = new THREE.Euler(),
    scale = new THREE.Vector3(1, 1, 1),
    glow = 0,
    sway = 0
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
  const vertex = new THREE.Vector3();
  for (let index = 0; index < positions.count; index++) {
    colours[index * 3] = colour.r;
    colours[index * 3 + 1] = colour.g;
    colours[index * 3 + 2] = colour.b;
    glowWeights[index] = glow;
    vertex.fromBufferAttribute(positions, index);
    swayWeights[index] = typeof sway === "function" ? sway(vertex) : sway;
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
  radius: number
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
        colour: index % 2 === 0 ? STONE_DARK : STONE,
        glow: 0.01
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
  variant: 0 | 1 | 2
): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = [];
  const innerX = gapDirection * 0.5;
  const outerX = -gapDirection * 0.5;

  // Dark backing closes every collidable opening while real stone courses
  // create the visible silhouette and readable joints in front of it.
  const backing = new THREE.Shape([
    new THREE.Vector2(innerX, -0.5),
    new THREE.Vector2(innerX, 0.34 + variant * 0.018),
    new THREE.Vector2(gapDirection * 0.42, 0.44 - variant * 0.012),
    new THREE.Vector2(gapDirection * 0.27, 0.49 - variant * 0.018),
    new THREE.Vector2(gapDirection * 0.12, 0.31 + variant * 0.012),
    new THREE.Vector2(-gapDirection * 0.05, 0.06 + variant * 0.02),
    new THREE.Vector2(-gapDirection * 0.26, -0.16 - variant * 0.018),
    new THREE.Vector2(outerX, -0.27 - variant * 0.02),
    new THREE.Vector2(outerX, -0.5)
  ]);
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
    colour: STONE_DARK,
    glow: 0.012
  }));

  const columns = lod === 0 ? 4 : lod === 1 ? 3 : 2;
  const rows = lod === 0 ? 4 : lod === 1 ? 3 : 1;
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
            ? STONE_LIGHT
            : STONE,
          glow: 0.018
        }
      ));
    }
  }

  // A stacked gap-facing pier is the primary readable gate silhouette.
  const pierBlocks = lod === 0 ? 6 : lod === 1 ? 4 : 1;
  for (let index = 0; index < pierBlocks; index++) {
    const height = 0.17 + (index % 2) * 0.012;
    parts.push(styled(
      stoneBlock(0.16, height, 0.28, 0.015),
      {
        position: new THREE.Vector3(
          innerX - gapDirection * 0.082,
          -0.4 + index * 0.18,
          0.51 + (index % 2) * 0.015
        ),
        rotation: new THREE.Euler(
          0,
          gapDirection * (index % 2) * 0.025,
          gapDirection * Math.sin(index * 1.3) * 0.018
        ),
        colour: index % 2 === 0 ? STONE_LIGHT : STONE,
        glow: 0.025
      }
    ));
  }

  // A recessed arch channel gives the irregular voussoirs one continuous
  // architectural gesture. It remains behind the stone and entirely inside
  // collidable mass, so it cannot suggest false playable clearance.
  if (lod < 2) {
    const archRadius = 0.48;
    const archCentre = new THREE.Vector3(
      innerX - gapDirection * archRadius,
      0.08,
      0.43
    );
    parts.push(styled(
      new THREE.TorusGeometry(
        archRadius,
        lod === 0 ? 0.052 : 0.045,
        lod === 0 ? 5 : 3,
        lod === 0 ? 18 : 8,
        1.34
      ),
      {
        position: archCentre,
        scale: new THREE.Vector3(gapDirection, 1, 0.82),
        colour: JOINT,
        glow: 0.006
      }
    ));
  }

  // Broken voussoirs turn the pair into an unmistakable ancient arch while
  // all decorative mass retreats away from the safe opening.
  const archStones = lod === 0 ? 10 : lod === 1 ? 6 : 2;
  for (let index = 0; index < archStones; index++) {
    if (
      (index === archStones - 2 && variant === 2) ||
      (index === archStones - 4 && variant === 1)
    ) {
      continue;
    }
    const t = index / Math.max(1, archStones - 1);
    const angle = THREE.MathUtils.lerp(0.04, 1.32, t);
    const radius = 0.48;
    const x =
      innerX - gapDirection * radius +
      gapDirection * Math.cos(angle) * radius;
    const y = 0.08 + Math.sin(angle) * radius;
    parts.push(styled(
      stoneBlock(
        0.18 + (index % 2) * 0.014,
        0.11 + (index % 3) * 0.009,
        0.27,
        0.016
      ),
      {
        position: new THREE.Vector3(
          x,
          y,
          0.56 + Math.sin(index * 1.9) * 0.018
        ),
        rotation: new THREE.Euler(
          Math.sin(index * 1.4) * 0.026,
          gapDirection * Math.sin(index) * 0.045,
          gapDirection * (angle - Math.PI * 0.5)
        ),
        colour: index % 3 === 0 ? SHELL : STONE_LIGHT,
        glow: index % 3 === 0 ? 0.09 : 0.02
      }
    ));
  }

  if (lod < 2) {
    const buttressX = outerX + gapDirection * 0.12;
    parts.push(styled(
      stoneBlock(0.19, 0.54, 0.34, 0.02),
      {
        position: new THREE.Vector3(buttressX, -0.22, 0.28),
        rotation: new THREE.Euler(0, gapDirection * 0.08, gapDirection * 0.05),
        colour: STONE_DARK,
        glow: 0.01
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
      glow: 0.38
    }));
  }

  parts.push(...rubble(
    lod === 0 ? 7 : lod === 1 ? 5 : 1,
    0.43,
    0.38,
    lod === 2 ? 0.07 : 0.055
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

export function createProductionCollapsedArch(lod: ArtLod): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = [];
  const blocks = lod === 0 ? 8 : lod === 1 ? 7 : 4;
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
  for (let index = 0; index < blocks; index++) {
    if (index === Math.floor(blocks * 0.56) || index === blocks - 2) continue;
    const t = index / Math.max(1, blocks - 1);
    const angle = THREE.MathUtils.lerp(0.13 * Math.PI, 0.87 * Math.PI, t);
    parts.push(styled(stoneBlock(0.23, 0.18, 0.44, 0.022), {
      position: new THREE.Vector3(
        Math.cos(angle) * 0.66,
        0.64 + Math.sin(angle) * 0.59,
        Math.sin(index * 1.8) * 0.04
      ),
      rotation: new THREE.Euler(
        Math.sin(index) * 0.025,
        Math.sin(index * 0.7) * 0.045,
        angle - Math.PI / 2
      ),
      colour: index % 3 === 0 ? STONE_LIGHT : STONE,
      glow: 0.014
    }));
  }
  parts.push(...rubble(lod === 0 ? 4 : lod === 1 ? 2 : 2, 0.9, 0.28, 0.11));
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

/** Sea fan: broad scalloped silhouette plus a visible branching rib network. */
export function createProductionFanCoral(lod: ArtLod): THREE.BufferGeometry {
  const parts = coralRockBase(lod, 0.68, true);
  const fanShape = new THREE.Shape();
  fanShape.moveTo(-0.12, 0);
  const segments = lod === 0 ? 18 : lod === 1 ? 12 : 8;
  for (let index = 0; index <= segments; index++) {
    const t = index / segments;
    const angle = Math.PI * (1 - t);
    const scallop = 1 + Math.sin(t * Math.PI * 6) * 0.055;
    fanShape.lineTo(
      Math.cos(angle) * 0.68 * scallop,
      0.12 + Math.sin(angle) * 0.9 * scallop
    );
  }
  fanShape.lineTo(0.12, 0);
  fanShape.closePath();
  const fan = lod === 2
    ? new THREE.ShapeGeometry(fanShape, 1)
    : new THREE.ExtrudeGeometry(fanShape, {
      depth: 0.055,
      steps: 1,
      bevelEnabled: true,
      bevelSegments: 1,
      bevelSize: 0.018,
      bevelThickness: 0.018
    });
  if (lod !== 2) fan.translate(0, 0, -0.0275);
  parts.push(styled(fan, {
    position: new THREE.Vector3(0, 0.18, 0),
    rotation: new THREE.Euler(-0.08, 0.18, -0.05),
    colour: VIOLET,
    glow: 0.33
  }));
  const ribs = lod === 0 ? 7 : lod === 1 ? 5 : 3;
  for (let index = 0; index < ribs; index++) {
    const t = ribs <= 1 ? 0.5 : index / (ribs - 1);
    const angle = THREE.MathUtils.lerp(0.22 * Math.PI, 0.78 * Math.PI, t);
    const end = new THREE.Vector3(
      Math.cos(angle) * 0.57,
      0.32 + Math.sin(angle) * 0.72,
      0.045
    );
    parts.push(styled(branchBetween(
      new THREE.Vector3(0, 0.2, 0.045),
      end,
      0.025,
      0.012,
      lod === 0 ? 5 : 4
    ), {
      colour: index % 2 === 0 ? CYAN_LIGHT : ROSE,
      glow: 0.45
    }));
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
