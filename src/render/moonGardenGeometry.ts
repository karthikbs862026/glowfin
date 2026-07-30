import * as THREE from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";

export type ArtLod = 0 | 1 | 2;

const MOONSTONE = new THREE.Color(0x315f73);
const MOONSTONE_DARK = new THREE.Color(0x183c50);
// Collision-critical stone gets its own brighter values. The surrounding
// ruins deliberately stay subdued, but every surface that can end a run must
// retain a 3:1 silhouette against the midnight lane even with caustics off.
const OBSTACLE_MOONSTONE = new THREE.Color(0x47788a);
const OBSTACLE_RECESS = new THREE.Color(0x254f63);
const SHELL_GOLD = new THREE.Color(0x789c98);
const LIVING_CYAN = new THREE.Color(0x176d82);
const MOON_VIOLET = new THREE.Color(0x4b3b78);
const HEART_ROSE = new THREE.Color(0x77375f);

interface PartOptions {
  position?: THREE.Vector3;
  rotation?: THREE.Euler;
  scale?: THREE.Vector3;
  colour: THREE.Color;
  glowWeight?: number;
  swayWeight?: number | ((position: THREE.Vector3) => number);
}

function decorate(
  geometry: THREE.BufferGeometry,
  {
    position = new THREE.Vector3(),
    rotation = new THREE.Euler(),
    scale = new THREE.Vector3(1, 1, 1),
    colour,
    glowWeight = 0,
    swayWeight = 0
  }: PartOptions
): THREE.BufferGeometry {
  if (geometry.index) {
    const indexed = geometry;
    geometry = geometry.toNonIndexed();
    indexed.dispose();
  }
  const quaternion = new THREE.Quaternion().setFromEuler(rotation);
  geometry.applyMatrix4(new THREE.Matrix4().compose(position, quaternion, scale));

  const positions = geometry.getAttribute("position");
  const colours = new Float32Array(positions.count * 3);
  const glow = new Float32Array(positions.count);
  const sway = new Float32Array(positions.count);
  const vertex = new THREE.Vector3();

  for (let index = 0; index < positions.count; index++) {
    colours[index * 3] = colour.r;
    colours[index * 3 + 1] = colour.g;
    colours[index * 3 + 2] = colour.b;
    glow[index] = glowWeight;
    vertex.fromBufferAttribute(positions, index);
    sway[index] = typeof swayWeight === "function"
      ? swayWeight(vertex)
      : swayWeight;
  }
  geometry.setAttribute("color", new THREE.BufferAttribute(colours, 3));
  geometry.setAttribute("glowWeight", new THREE.BufferAttribute(glow, 1));
  geometry.setAttribute("swayWeight", new THREE.BufferAttribute(sway, 1));
  return geometry;
}

function merge(parts: THREE.BufferGeometry[]): THREE.BufferGeometry {
  const result = mergeGeometries(parts, false);
  for (const part of parts) part.dispose();
  if (!result) throw new Error("Moon-Garden geometry attributes did not match.");
  result.computeBoundingBox();
  result.computeBoundingSphere();
  return result;
}

function extrudedWallShape(
  gapDirection: 1 | -1,
  variant: 0 | 1 | 2
): THREE.ExtrudeGeometry {
  const inner = 0.5 * gapDirection;
  const outer = -0.5 * gapDirection;
  const crowns = [
    [
      [0.5, 0.5],
      [0.34, 0.48],
      [0.18, 0.37],
      [-0.02, 0.42],
      [-0.21, 0.25],
      [-0.5, 0.16]
    ],
    [
      [0.5, 0.5],
      [0.39, 0.43],
      [0.22, 0.49],
      [0.04, 0.31],
      [-0.18, 0.36],
      [-0.5, 0.22]
    ],
    [
      [0.5, 0.5],
      [0.31, 0.46],
      [0.13, 0.29],
      [-0.04, 0.35],
      [-0.27, 0.19],
      [-0.5, 0.12]
    ]
  ] as const;
  const crown = crowns[variant];
  const points = [
    new THREE.Vector2(inner, -0.5),
    ...crown.map(([x, y]) => new THREE.Vector2(
      x * gapDirection,
      y
    )),
    new THREE.Vector2(outer, -0.5)
  ];
  const shape = new THREE.Shape(points);
  const geometry = new THREE.ExtrudeGeometry(shape, {
    depth: 1,
    bevelEnabled: false,
    curveSegments: 1,
    steps: 1
  });
  geometry.translate(0, 0, -0.5);
  return geometry;
}

/**
 * Core obstacle skin. The gap-facing edge is the unmodified x=+/-0.5 plane;
 * all broken silhouette and crescent ornament retreats into the wall mass.
 */
export function createWallFragmentGeometry(
  lod: ArtLod,
  gapDirection: 1 | -1,
  variant: 0 | 1 | 2 = 0
): THREE.BufferGeometry {
  const radial = lod === 0 ? 42 : lod === 1 ? 27 : 13;
  const tube = lod === 0 ? 8 : lod === 1 ? 5 : 3;
  const ribSegments = lod === 0 ? 14 : lod === 1 ? 8 : 2;
  const parts: THREE.BufferGeometry[] = [
    decorate(extrudedWallShape(gapDirection, variant), {
      colour: OBSTACLE_MOONSTONE,
      glowWeight: 0.025
    }),
    // A recessed copy creates the broad layered stone face seen in the Art
    // Bible without touching the collider-truth edge. It is shifted toward the
    // wall mass and slightly raised toward the camera, so the base reads as a
    // sculpted frame rather than one flat extruded card.
    decorate(extrudedWallShape(gapDirection, variant), {
      position: new THREE.Vector3(-gapDirection * 0.065, -0.055, 0),
      scale: new THREE.Vector3(0.82, 0.80, 1.035),
      colour: OBSTACLE_RECESS,
      glowWeight: 0.015
    })
  ];

  // Keep the decorative inner rib safely behind the collision-facing cyan
  // contour. At 0.435 it covered most of the 12px gameplay seam at distance,
  // leaving only isolated readable pixels in the fairness capture.
  const innerX = gapDirection * 0.35;
  parts.push(decorate(
    new THREE.BoxGeometry(0.09, 0.9, 1.025, 1, ribSegments, 1),
    {
      position: new THREE.Vector3(innerX, -0.02, 0),
      colour: OBSTACLE_RECESS,
      glowWeight: 0.025
    }
  ));
  // Dark stone channel immediately behind the gameplay seam. The emissive
  // contour is rendered independently on the exact collider plane, while this
  // inset makes it read as moon-water held inside masonry rather than a post.
  parts.push(decorate(
    new THREE.BoxGeometry(0.085, 0.9, 1.04),
    {
      position: new THREE.Vector3(gapDirection * 0.435, -0.02, 0),
      colour: OBSTACLE_RECESS,
      glowWeight: 0.01
    }
  ));
  parts.push(decorate(
    new THREE.BoxGeometry(0.045, 0.74, 1.035, 1, ribSegments, 1),
    {
      position: new THREE.Vector3(gapDirection * 0.16, -0.09, 0),
      rotation: new THREE.Euler(0, 0, -gapDirection * 0.16),
      colour: SHELL_GOLD,
      glowWeight: 0.12
    }
  ));

  parts.push(decorate(
    new THREE.TorusGeometry(0.24, 0.024, tube, radial, Math.PI * 1.42),
    {
      position: new THREE.Vector3(-gapDirection * 0.09, -0.02, 0.515),
      rotation: new THREE.Euler(0, 0, gapDirection > 0 ? -0.8 : Math.PI - 0.8),
      scale: new THREE.Vector3(0.78, 1, 1),
      colour: SHELL_GOLD,
      glowWeight: 0.18
    }
  ));

  if (lod < 2) {
    parts.push(decorate(
      new THREE.TorusGeometry(0.35, 0.018, Math.max(3, tube - 2), radial, Math.PI * 0.9),
      {
        position: new THREE.Vector3(gapDirection * 0.02, -0.11, 0.51),
        rotation: new THREE.Euler(0, 0, gapDirection > 0 ? 1.25 : -1.89),
        colour: OBSTACLE_RECESS,
        glowWeight: 0.03
      }
    ));
  }

  return merge(parts);
}

/**
 * A low, broken arch family for the middle-depth architecture layer. Individual
 * voussoir blocks, buttresses and rubble create real parallax and irregular
 * negative space without borrowing the collider wall's bright material.
 */
export function createCollapsedArchGeometry(lod: ArtLod): THREE.BufferGeometry {
  const blockCount = lod === 0 ? 9 : lod === 1 ? 7 : 5;
  const parts: THREE.BufferGeometry[] = [];

  for (const side of [-1, 1]) {
    parts.push(decorate(
      new THREE.BoxGeometry(
        lod === 2 ? 0.32 : 0.38,
        0.62,
        0.48,
        1,
        lod === 0 ? 4 : 2,
        1
      ),
      {
        position: new THREE.Vector3(side * 0.52, 0.31, 0),
        rotation: new THREE.Euler(0, side * 0.05, -side * 0.035),
        colour: side < 0 ? MOONSTONE_DARK : MOONSTONE,
        glowWeight: 0.015
      }
    ));
  }

  for (let index = 0; index < blockCount; index++) {
    // Missing crown stones keep the silhouette visibly collapsed and prevent
    // the arch from reading as another perfect luminous icon.
    if (
      (lod < 2 && index === Math.floor(blockCount * 0.54)) ||
      (lod === 0 && index === Math.floor(blockCount * 0.54) + 1)
    ) {
      continue;
    }
    const t = index / Math.max(1, blockCount - 1);
    const angle = THREE.MathUtils.lerp(0.16 * Math.PI, 0.84 * Math.PI, t);
    const x = Math.cos(angle) * 0.58;
    const y = 0.5 + Math.sin(angle) * 0.52;
    parts.push(decorate(
      new THREE.BoxGeometry(0.24, 0.19, 0.5),
      {
        position: new THREE.Vector3(x, y, Math.sin(index * 1.7) * 0.025),
        rotation: new THREE.Euler(
          Math.sin(index * 0.9) * 0.035,
          Math.sin(index * 1.3) * 0.05,
          angle - Math.PI / 2
        ),
        scale: new THREE.Vector3(
          0.9 + (index % 2) * 0.12,
          0.9 + ((index + 1) % 2) * 0.08,
          1
        ),
        colour: index % 3 === 0 ? MOONSTONE : MOONSTONE_DARK,
        glowWeight: 0.02
      }
    ));
  }

  const rubbleCount = lod === 0 ? 6 : lod === 1 ? 4 : 3;
  for (let index = 0; index < rubbleCount; index++) {
    const radius = 0.11 + (index % 3) * 0.025;
    parts.push(decorate(
      new THREE.DodecahedronGeometry(radius, 0),
      {
        position: new THREE.Vector3(
          THREE.MathUtils.lerp(-0.83, 0.83, index / Math.max(1, rubbleCount - 1)),
          radius * 0.58,
          Math.sin(index * 1.9) * 0.22
        ),
        rotation: new THREE.Euler(index * 0.31, index * 0.73, index * 0.19),
        scale: new THREE.Vector3(1.2, 0.68, 1),
        colour: MOONSTONE_DARK,
        glowWeight: 0.01
      }
    ));
  }

  return merge(parts);
}

function jaggedTowerCore(lod: ArtLod): THREE.BufferGeometry {
  const radial = lod === 0 ? 20 : lod === 1 ? 12 : 8;
  const heightSegments = lod === 0 ? 58 : lod === 1 ? 36 : 18;
  const geometry = new THREE.CylinderGeometry(
    0.34,
    0.58,
    1,
    radial,
    heightSegments,
    true
  );
  const position = geometry.getAttribute("position");
  const vertex = new THREE.Vector3();
  for (let index = 0; index < position.count; index++) {
    vertex.fromBufferAttribute(position, index);
    if (vertex.y > 0.49) {
      const angle = Math.atan2(vertex.z, vertex.x);
      const bite = Math.max(0, Math.sin(angle * 1.7 + 0.8)) * 0.17;
      position.setY(index, vertex.y - 0.04 - bite);
    }
  }
  position.needsUpdate = true;
  geometry.computeVertexNormals();
  return geometry;
}

export function createBrokenTowerGeometry(lod: ArtLod): THREE.BufferGeometry {
  const ribY = lod === 0 ? 18 : lod === 1 ? 10 : 2;
  const torusRadial = lod === 0 ? 46 : lod === 1 ? 28 : 15;
  const torusTube = lod === 0 ? 8 : lod === 1 ? 5 : 3;
  const parts: THREE.BufferGeometry[] = [
    decorate(jaggedTowerCore(lod), {
      colour: MOONSTONE_DARK,
      glowWeight: 0.08
    })
  ];

  for (let side = -1; side <= 1; side += 2) {
    parts.push(decorate(
      new THREE.BoxGeometry(0.12, 0.83, 0.18, 1, ribY, 1),
      {
        position: new THREE.Vector3(side * 0.34, -0.07, 0.24),
        rotation: new THREE.Euler(0, side * 0.12, -side * 0.08),
        colour: MOONSTONE,
        glowWeight: 0.13
      }
    ));
  }

  for (const z of [-0.405, 0.405]) {
    parts.push(decorate(
      new THREE.TorusGeometry(0.24, 0.032, torusTube, torusRadial, Math.PI * 1.45),
      {
        position: new THREE.Vector3(0, 0.12, z),
        rotation: new THREE.Euler(0, 0, -0.84),
        scale: new THREE.Vector3(0.78, 1, 1),
        colour: SHELL_GOLD,
        glowWeight: 0.86
      }
    ));
  }

  if (lod === 0) {
    for (const side of [-1, 1]) {
      parts.push(decorate(
        new THREE.BoxGeometry(0.11, 0.68, 0.14, 1, 18, 1),
        {
          position: new THREE.Vector3(side * 0.18, -0.15, -0.34),
          rotation: new THREE.Euler(0, 0, side * 0.08),
          colour: MOONSTONE,
          glowWeight: 0.12
        }
      ));
    }
  }
  return merge(parts);
}

export function createSpireGeometry(lod: ArtLod): THREE.BufferGeometry {
  const radial = lod === 0 ? 16 : lod === 1 ? 10 : 6;
  const vertical = lod === 0 ? 38 : lod === 1 ? 24 : 9;
  const hornVertical = lod === 0 ? 10 : lod === 1 ? 6 : 2;
  const hornRadial = lod === 0 ? 8 : lod === 1 ? 6 : 4;
  const parts: THREE.BufferGeometry[] = [
    decorate(
      new THREE.CylinderGeometry(0.12, 0.4, 0.86, radial, vertical, false),
      {
        position: new THREE.Vector3(0, -0.07, 0),
        colour: MOONSTONE_DARK,
        glowWeight: 0.06
      }
    )
  ];

  for (const side of [-1, 1]) {
    parts.push(decorate(
      new THREE.CylinderGeometry(0.025, 0.11, 0.42, hornRadial, hornVertical, false),
      {
        position: new THREE.Vector3(side * 0.09, 0.47, 0),
        rotation: new THREE.Euler(0, 0, -side * 0.3),
        colour: MOONSTONE,
        glowWeight: 0.16
      }
    ));
    parts.push(decorate(
      new THREE.BoxGeometry(0.055, 0.68, 0.09, 1, Math.max(1, Math.floor(vertical / 5)), 1),
      {
        position: new THREE.Vector3(side * 0.22, -0.09, 0.28),
        rotation: new THREE.Euler(0, 0, -side * 0.11),
        colour: SHELL_GOLD,
        glowWeight: 0.72
      }
    ));
  }
  parts.push(decorate(
    new THREE.TorusGeometry(
      0.12,
      0.024,
      lod === 0 ? 5 : lod === 1 ? 4 : 3,
      lod === 0 ? 24 : lod === 1 ? 16 : 8
    ),
    {
      position: new THREE.Vector3(0, -0.12, 0.39),
      colour: SHELL_GOLD,
      glowWeight: 0.82
    }
  ));
  return merge(parts);
}

export function createMediumCoralGeometry(lod: ArtLod): THREE.BufferGeometry {
  const radial = lod === 0 ? 5 : lod === 1 ? 4 : 3;
  const capSegments = lod === 0 ? 2 : 1;
  const branches = lod === 0 ? 5 : lod === 1 ? 4 : 3;
  const parts: THREE.BufferGeometry[] = [];
  const offsets = [-0.44, -0.22, 0, 0.23, 0.45];
  const heights = [0.62, 0.92, 1.12, 0.84, 0.58];

  for (let index = 0; index < branches; index++) {
    const x = offsets[index] ?? 0;
    const height = heights[index] ?? 0.6;
    const colour = index % 3 === 0
      ? LIVING_CYAN
        : index % 3 === 1
          ? MOON_VIOLET
          : HEART_ROSE;
    parts.push(decorate(
      new THREE.CapsuleGeometry(
        0.12,
        Math.max(0.12, height - 0.24),
        capSegments,
        radial
      ),
      {
        position: new THREE.Vector3(x, height * 0.5, 0.06 * Math.sin(index * 1.7)),
        rotation: new THREE.Euler(
          index % 2 === 0 ? 0.08 : -0.06,
          index * 0.5,
          x * -0.72
        ),
        colour,
        glowWeight: 0.42
      }
    ));
    if (lod < 2 && index < 3) {
      const forkSide = index % 2 === 0 ? -1 : 1;
      const forkLength = height * 0.38;
      parts.push(decorate(
        new THREE.CapsuleGeometry(
          0.075,
          Math.max(0.08, forkLength - 0.15),
          Math.max(2, capSegments - 1),
          radial
        ),
        {
          position: new THREE.Vector3(
            x + forkSide * height * 0.11,
            height * 0.69,
            0.07 + index * 0.018
          ),
          rotation: new THREE.Euler(
            forkSide * 0.08,
            index * 0.35,
            -forkSide * 0.72
          ),
          colour,
          glowWeight: 0.5
        }
      ));
    }
  }
  parts.push(decorate(
    new THREE.SphereGeometry(0.42, radial * 2, Math.max(4, radial)),
    {
      position: new THREE.Vector3(0, 0.04, 0),
      scale: new THREE.Vector3(1.28, 0.28, 0.86),
      colour: MOONSTONE_DARK,
      glowWeight: 0.035
    }
  ));
  return merge(parts);
}

/**
 * The signature Moon-Garden ecology cluster. Unlike the previous flat atlas
 * card, this is a genuinely volumetric composition: a crescent ruin fragment,
 * layered reef branches and a skirt of stones share one grounded silhouette.
 */
export function createHeroCoralGeometry(lod: ArtLod): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = [];

  const coral = createMediumCoralGeometry(lod);
  coral.scale(0.82, 0.88, 0.82);
  coral.translate(0.14, 0.02, 0.18);
  parts.push(coral);

  const archBlocks = lod === 0 ? 8 : lod === 1 ? 6 : 4;
  for (let index = 0; index < archBlocks; index++) {
    if (index === Math.floor(archBlocks * 0.58)) continue;
    const t = index / Math.max(1, archBlocks - 1);
    const angle = THREE.MathUtils.lerp(0.1 * Math.PI, 0.9 * Math.PI, t);
    const radius = 0.64;
    parts.push(decorate(
      new THREE.BoxGeometry(0.26, 0.19, 0.27),
      {
        position: new THREE.Vector3(
          -0.2 + Math.cos(angle) * radius,
          0.25 + Math.sin(angle) * radius,
          -0.13 + Math.sin(index * 1.4) * 0.035
        ),
        rotation: new THREE.Euler(
          Math.sin(index) * 0.04,
          Math.sin(index * 0.7) * 0.08,
          angle - Math.PI / 2
        ),
        colour: index % 3 === 0 ? MOONSTONE : MOONSTONE_DARK,
        glowWeight: 0.02
      }
    ));
  }

  const rockCount = lod === 2 ? 3 : 4;
  for (let index = 0; index < rockCount; index++) {
    const x = -0.72 + index * (1.44 / Math.max(1, rockCount - 1));
    const radius = index % 2 === 0 ? 0.22 : 0.17;
    parts.push(decorate(
      new THREE.DodecahedronGeometry(radius, 0),
      {
        position: new THREE.Vector3(
          x,
          radius * 0.55,
          0.04 + Math.sin(index * 1.8) * 0.18
        ),
        rotation: new THREE.Euler(index * 0.32, index * 0.51, index * 0.19),
        scale: new THREE.Vector3(1.18, 0.72, 0.92),
        colour: index === 1 ? MOONSTONE : MOONSTONE_DARK,
        glowWeight: 0.02
      }
    ));
  }

  const anemoneCount = lod === 0 ? 13 : lod === 1 ? 6 : 0;
  for (let index = 0; index < anemoneCount; index++) {
    const angle = index * 2.399963;
    const ring = 0.22 + (index % 4) * 0.13;
    const radius = 0.105 + (index % 3) * 0.018;
    parts.push(decorate(
      new THREE.IcosahedronGeometry(radius, 1),
      {
        position: new THREE.Vector3(
          -0.08 + Math.cos(angle) * ring,
          radius * 0.72 + (index % 2) * 0.035,
          0.12 + Math.sin(angle) * ring * 0.62
        ),
        scale: new THREE.Vector3(1.25, 0.7, 1),
        colour: index % 3 === 0
          ? LIVING_CYAN
          : index % 3 === 1
            ? MOON_VIOLET
            : HEART_ROSE,
        glowWeight: 0.28
      }
    ));
  }

  return merge(parts);
}

/**
 * A low shell-rosette garden used between taller reef clusters. It provides
 * physical overlap and contact detail without creating obstacle-like height.
 */
export function createShellGardenGeometry(lod: ArtLod): THREE.BufferGeometry {
  const radial = lod === 0 ? 6 : lod === 1 ? 5 : 4;
  const vertical = lod === 0 ? 4 : lod === 1 ? 3 : 2;
  const shellCount = lod === 2 ? 2 : 3;
  const parts: THREE.BufferGeometry[] = [];

  for (let index = 0; index < shellCount; index++) {
    const radius = [0.25, 0.21, 0.18][index] ?? 0.18;
    const colour = index === 0
      ? MOON_VIOLET
      : index === 1
        ? LIVING_CYAN
        : HEART_ROSE;
    parts.push(decorate(
      new THREE.SphereGeometry(radius, radial * 2, vertical),
      {
        position: new THREE.Vector3(
          (index - 1) * 0.38,
          radius * 0.62 + 0.05 + index * 0.025,
          (index % 2 === 0 ? -1 : 1) * 0.12
        ),
        rotation: new THREE.Euler(index * 0.17, index * 0.52, -0.18 + index * 0.2),
        scale: new THREE.Vector3(1.35, 0.72, 1.08),
        colour,
        glowWeight: 0.38
      }
    ));
    if (lod < 2) {
      const petalCount = lod === 0 ? 5 : 3;
      for (let petal = 0; petal < petalCount; petal++) {
        const angle = petal / petalCount * Math.PI * 2 + index * 0.43;
        parts.push(decorate(
          new THREE.SphereGeometry(
            radius * 0.46,
            lod === 0 ? 6 : 4,
            lod === 0 ? 3 : 2
          ),
          {
            position: new THREE.Vector3(
              (index - 1) * 0.38 + Math.cos(angle) * radius * 0.72,
              radius * 0.62 + 0.04,
              (index % 2 === 0 ? -1 : 1) * 0.12 +
                Math.sin(angle) * radius * 0.72
            ),
            scale: new THREE.Vector3(1.25, 0.62, 0.9),
            colour,
            glowWeight: 0.31
          }
        ));
      }
    }
  }

  const rockCount = lod === 2 ? 3 : 2;
  for (let index = 0; index < rockCount; index++) {
    const radius = 0.18 - index * 0.025;
    parts.push(decorate(
      new THREE.DodecahedronGeometry(radius, 0),
      {
        position: new THREE.Vector3(index === 0 ? -0.56 : 0.58, radius * 0.55, 0),
        rotation: new THREE.Euler(index * 0.4, index * 0.8, -index * 0.2),
        scale: new THREE.Vector3(1.28, 0.68, 0.95),
        colour: MOONSTONE_DARK,
        glowWeight: 0.02
      }
    ));
  }

  return merge(parts);
}

export function createGateFoundationGeometry(lod: ArtLod): THREE.BufferGeometry {
  const rockCount = lod === 0 ? 6 : lod === 1 ? 4 : 3;
  const parts: THREE.BufferGeometry[] = [];
  for (let index = 0; index < rockCount; index++) {
    const t = index / (rockCount - 1);
    const radius = 0.11 + (index % 3) * 0.025;
    parts.push(decorate(
      new THREE.DodecahedronGeometry(radius, 0),
      {
        position: new THREE.Vector3(
          THREE.MathUtils.lerp(-0.44, 0.44, t),
          radius * 0.55,
          Math.sin(index * 1.71) * 0.15
        ),
        rotation: new THREE.Euler(index * 0.31, index * 0.69, -index * 0.23),
        scale: new THREE.Vector3(1.24, 0.68, 1.08),
        colour: index % 3 === 0 ? MOONSTONE : MOONSTONE_DARK,
        glowWeight: 0.06
      }
    ));
  }
  parts.push(decorate(
    new THREE.BoxGeometry(0.94, 0.1, 0.54),
    {
      position: new THREE.Vector3(0, 0.025, 0),
      rotation: new THREE.Euler(0, 0.08, 0),
      colour: OBSTACLE_RECESS,
      glowWeight: 0.04
    }
  ));
  return merge(parts);
}

export function createRibbonKelpGeometry(lod: 0 | 1): THREE.BufferGeometry {
  const heightSegments = lod === 0 ? 26 : 10;
  const parts: THREE.BufferGeometry[] = [];
  for (const blade of [-1, 0, 1]) {
    const geometry = new THREE.PlaneGeometry(
      blade === 0 ? 0.34 : 0.28,
      2,
      2,
      heightSegments
    );
    geometry.translate(0, 1, 0);
    const position = geometry.getAttribute("position");
    for (let index = 0; index < position.count; index++) {
      const y = position.getY(index);
      const x = position.getX(index);
      position.setX(
        index,
        x + Math.sin(y * 2.2 + blade * 0.7) * 0.07 * (y / 2)
      );
    }
    position.needsUpdate = true;
    parts.push(decorate(geometry, {
      position: new THREE.Vector3(blade * 0.22, 0, blade === 0 ? 0.04 : 0),
      rotation: new THREE.Euler(0, blade * 0.18, -blade * 0.055),
      scale: new THREE.Vector3(1, blade === 0 ? 1.08 : 0.82, 1),
      colour: blade === 0
        ? (lod === 0 ? LIVING_CYAN : MOON_VIOLET)
        : MOON_VIOLET,
      glowWeight: blade === 0 ? 0.58 : 0.42,
      swayWeight: (vertex) => THREE.MathUtils.clamp(vertex.y / 2, 0, 1)
    }));
  }
  return merge(parts);
}

export function geometryTriangles(geometry: THREE.BufferGeometry): number {
  const count = geometry.index
    ? geometry.index.count
    : geometry.getAttribute("position").count;
  return Math.round(count / 3);
}
