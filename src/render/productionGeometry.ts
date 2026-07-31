import * as THREE from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import type { ArtLod } from "./moonGardenGeometry";

const STONE = new THREE.Color(0x0b3158);
const STONE_LIGHT = new THREE.Color(0x1b5778);
const STONE_DARK = new THREE.Color(0x021322);
const JOINT = new THREE.Color(0x04111d);
const SHELL = new THREE.Color(0x9a7747);
const CYAN = new THREE.Color(0x075c70);
const CYAN_LIGHT = new THREE.Color(0x20a7b5);
const VIOLET = new THREE.Color(0x56357b);
const ROSE = new THREE.Color(0x873c70);

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
    new THREE.Vector2(innerX, 0.3 + variant * 0.012),
    new THREE.Vector2(gapDirection * 0.44, 0.43 + variant * 0.006),
    new THREE.Vector2(gapDirection * 0.34, 0.5 - variant * 0.014),
    new THREE.Vector2(gapDirection * 0.21, 0.45 - variant * 0.012),
    new THREE.Vector2(gapDirection * 0.08, 0.27 + variant * 0.01),
    new THREE.Vector2(-gapDirection * 0.07, 0.04 + variant * 0.016),
    new THREE.Vector2(-gapDirection * 0.27, -0.17 - variant * 0.016),
    new THREE.Vector2(outerX, -0.25 - variant * 0.018),
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

  // A broad carved manta buttress sits in front of the masonry courses. It
  // turns the dominant read into one hand-sculpted load-bearing sweep while
  // letting a few irregular course edges survive around the collapsed bank.
  // This remains wholly inside the collidable wall half.
  if (lod < 2) {
    const buttress = new THREE.Shape();
    buttress.moveTo(outerX, -0.48);
    buttress.lineTo(innerX - gapDirection * 0.12, -0.46);
    buttress.lineTo(innerX - gapDirection * 0.12, 0.36);
    buttress.bezierCurveTo(
      gapDirection * 0.34,
      0.29,
      gapDirection * 0.18,
      0.05,
      -gapDirection * 0.02,
      -0.1
    );
    buttress.bezierCurveTo(
      -gapDirection * 0.17,
      -0.22,
      outerX + gapDirection * 0.08,
      -0.32,
      outerX,
      -0.48
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
      colour: STONE,
      glow: 0.014
    }));
    parts.push(styled(new THREE.TorusGeometry(
      0.21,
      0.026,
      lod === 0 ? 5 : 3,
      lod === 0 ? 20 : 9,
      Math.PI * 1.3
    ), {
      position: new THREE.Vector3(
        -gapDirection * (0.13 + variant * 0.012),
        -0.08 + variant * 0.018,
        0.61
      ),
      rotation: new THREE.Euler(
        0,
        0,
        gapDirection * (-0.64 + variant * 0.08)
      ),
      scale: new THREE.Vector3(0.82, 1.12, 1),
      colour: SHELL,
      glow: 0.05
    }));
  }

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
  const pierBlocks = lod === 0 ? 5 : lod === 1 ? 4 : 1;
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
        colour: index % 2 === 0 ? STONE_LIGHT : STONE,
        glow: 0.025
      }
    ));
  }

  // A recessed curved shoulder gives the irregular voussoirs one continuous
  // architectural gesture. Unlike a perfect torus, the rising ribbon seats
  // directly on the collapsed bank and aims inward toward the broken opening.
  if (lod < 2) {
    const samples = lod === 0 ? 9 : 6;
    const upper: THREE.Vector2[] = [];
    const lower: THREE.Vector2[] = [];
    for (let index = 0; index <= samples; index++) {
      const t = index / samples;
      const x = THREE.MathUtils.lerp(
        outerX + gapDirection * 0.15,
        innerX - gapDirection * 0.055,
        t
      );
      const centreY = -0.01 + Math.pow(t, 0.78) * 0.45 +
        Math.sin(t * Math.PI * 2 + variant) * 0.008;
      const thickness = THREE.MathUtils.lerp(0.14, 0.1, t);
      upper.push(new THREE.Vector2(x, centreY + thickness * 0.5));
      lower.push(new THREE.Vector2(x, centreY - thickness * 0.5));
    }
    const shoulder = new THREE.Shape();
    const first = upper[0];
    if (!first) throw new Error("Moon-gate shoulder requires samples.");
    shoulder.moveTo(first.x, first.y);
    for (const point of upper.slice(1)) shoulder.lineTo(point.x, point.y);
    for (const point of lower.reverse()) shoulder.lineTo(point.x, point.y);
    shoulder.closePath();
    parts.push(styled(
      new THREE.ExtrudeGeometry(shoulder, {
        depth: 0.19,
        steps: 1,
        bevelEnabled: lod === 0,
        bevelSegments: 1,
        bevelSize: 0.014,
        bevelThickness: 0.014
      }),
      {
        position: new THREE.Vector3(0, 0, 0.36),
        colour: JOINT,
        glow: 0.006
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

/**
 * A non-colliding overhead ruin that visually joins the two authoritative wall
 * halves into one broken moon gate. The opening remains clear at Glowfin's
 * flight height; the canopy sits behind the collider-aligned seams and carries
 * only the upper architectural silhouette.
 */
export function createProductionGateCanopyGeometry(
  lod: ArtLod
): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = [];
  const samples = lod === 0 ? 18 : lod === 1 ? 12 : 7;
  const start = 0.08 * Math.PI;
  const end = 0.92 * Math.PI;

  // One uninterrupted carved body carries its weight into both springers.
  // The previous two independent ribbons had no visible load path and read as
  // two tusks suspended between the piers even when their transforms touched.
  parts.push(styled(archRibbonSegment(
    start,
    end,
    samples,
    0.54,
    0.32,
    -0.1,
    0.34
  ), {
    position: new THREE.Vector3(0, 0, 0.02),
    colour: STONE_LIGHT,
    glow: 0.018
  }));

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
      colour: STONE,
      glow: 0.014
    }));
    if (lod < 2) {
      parts.push(styled(stoneBlock(0.28, 0.12, 0.42, 0.016), {
        position: new THREE.Vector3(side * 0.64, 0.1, 0.015),
        rotation: new THREE.Euler(0, -side * 0.018, side * 0.012),
        colour: STONE_LIGHT,
        glow: 0.018
      }));
    }
  }

  // A recessed shell-metal inner band is carved into the same full arch. It
  // supplies the Moon-Garden identity without detached gold blocks.
  if (lod < 2) {
    parts.push(styled(archRibbonSegment(
      start + 0.015,
      end - 0.015,
      lod === 0 ? 16 : 10,
      0.335,
      0.307,
      -0.1,
      0.37
    ), {
      position: new THREE.Vector3(0, 0, 0.13),
      colour: SHELL,
      glow: 0.04
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

/**
 * Sea fan: an open, bowed branch lattice with a scalloped crown.
 *
 * Near and middle LODs are real cylindrical tissue, not an opaque polygon with
 * painted ribs. Only the far LOD keeps a single silhouette because its holes
 * are already below a pixel at the validated portrait distance.
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
    const radial = lod === 0 ? 5 : 4;
    const rimSegments = lod === 0 ? 9 : 4;
    const crown: THREE.Vector3[] = [];
    for (let index = 0; index <= rimSegments; index++) {
      const t = index / rimSegments;
      const angle = THREE.MathUtils.lerp(
        0.12 * Math.PI,
        0.88 * Math.PI,
        t
      );
      const scallop = 1 + Math.sin(t * Math.PI * 5) * 0.045;
      crown.push(new THREE.Vector3(
        Math.cos(angle) * 0.7 * scallop,
        0.3 + Math.sin(angle) * 0.86 * scallop,
        0.055 + Math.sin(angle * 2.0) * 0.085
      ));
    }
    for (let index = 1; index < crown.length; index++) {
      const start = crown[index - 1];
      const end = crown[index];
      if (!start || !end) continue;
      parts.push(styled(branchBetween(
        start,
        end,
        lod === 0 ? 0.032 : 0.037,
        lod === 0 ? 0.027 : 0.031,
        radial
      ), {
        colour: index % 3 === 0 ? ROSE : VIOLET,
        glow: 0.34
      }));
    }

    const ribs = lod === 0 ? 6 : 3;
    const root = new THREE.Vector3(0, 0.19, -0.015);
    for (let index = 0; index < ribs; index++) {
      const crownIndex = Math.round(
        THREE.MathUtils.lerp(1, crown.length - 2, index / Math.max(1, ribs - 1))
      );
      const end = crown[crownIndex];
      if (!end) continue;
      const fork = end.clone().lerp(root, 0.38);
      fork.z += index % 2 === 0 ? 0.04 : -0.025;
      parts.push(styled(branchBetween(
        root,
        fork,
        0.033,
        0.019,
        radial
      ), {
        colour: index % 2 === 0 ? CYAN_LIGHT : ROSE,
        glow: 0.43
      }));
      parts.push(styled(branchBetween(
        fork,
        end,
        0.019,
        0.011,
        radial
      ), {
        colour: index % 2 === 0 ? CYAN_LIGHT : VIOLET,
        glow: 0.46
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
