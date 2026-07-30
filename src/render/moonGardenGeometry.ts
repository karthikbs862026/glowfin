import * as THREE from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";

export type ArtLod = 0 | 1 | 2;

const MOONSTONE = new THREE.Color(0x315c71);
const MOONSTONE_DARK = new THREE.Color(0x20384a);
// Collision-critical stone gets its own brighter values. The surrounding
// ruins deliberately stay subdued, but every surface that can end a run must
// retain a 3:1 silhouette against the midnight lane even with caustics off.
const OBSTACLE_MOONSTONE = new THREE.Color(0x5f96ae);
const OBSTACLE_RECESS = new THREE.Color(0x508198);
const SHELL_GOLD = new THREE.Color(0xf4d58b);
const LIVING_CYAN = new THREE.Color(0x63e0ff);
const MOON_VIOLET = new THREE.Color(0x8b6be8);
const HEART_ROSE = new THREE.Color(0xf06ab9);

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

function extrudedWallShape(gapDirection: 1 | -1): THREE.ExtrudeGeometry {
  const inner = 0.5 * gapDirection;
  const outer = -0.5 * gapDirection;
  const points = [
    new THREE.Vector2(inner, -0.5),
    new THREE.Vector2(inner, 0.5),
    new THREE.Vector2(0.31 * gapDirection, 0.47),
    new THREE.Vector2(0.13 * gapDirection, 0.38),
    new THREE.Vector2(-0.04 * gapDirection, 0.44),
    new THREE.Vector2(-0.23 * gapDirection, 0.27),
    new THREE.Vector2(outer, 0.18),
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
  gapDirection: 1 | -1
): THREE.BufferGeometry {
  const radial = lod === 0 ? 42 : lod === 1 ? 27 : 13;
  const tube = lod === 0 ? 8 : lod === 1 ? 5 : 3;
  const ribSegments = lod === 0 ? 14 : lod === 1 ? 8 : 2;
  const parts: THREE.BufferGeometry[] = [
    decorate(extrudedWallShape(gapDirection), {
      colour: OBSTACLE_MOONSTONE,
      glowWeight: 0.08
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
      glowWeight: 0.1
    }
  ));
  parts.push(decorate(
    new THREE.BoxGeometry(0.065, 0.74, 1.035, 1, ribSegments, 1),
    {
      position: new THREE.Vector3(gapDirection * 0.16, -0.09, 0),
      rotation: new THREE.Euler(0, 0, -gapDirection * 0.16),
      colour: SHELL_GOLD,
      glowWeight: 0.62
    }
  ));

  parts.push(decorate(
    new THREE.TorusGeometry(0.24, 0.032, tube, radial, Math.PI * 1.42),
    {
      position: new THREE.Vector3(-gapDirection * 0.09, -0.02, 0.515),
      rotation: new THREE.Euler(0, 0, gapDirection > 0 ? -0.8 : Math.PI - 0.8),
      scale: new THREE.Vector3(0.78, 1, 1),
      colour: SHELL_GOLD,
      glowWeight: 0.78
    }
  ));

  if (lod < 2) {
    parts.push(decorate(
      new THREE.TorusGeometry(0.35, 0.018, Math.max(3, tube - 2), radial, Math.PI * 0.9),
      {
        position: new THREE.Vector3(gapDirection * 0.02, -0.11, 0.51),
        rotation: new THREE.Euler(0, 0, gapDirection > 0 ? 1.25 : -1.89),
        colour: OBSTACLE_RECESS,
        glowWeight: 0.18
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
  const radial = lod === 0 ? 8 : lod === 1 ? 6 : 4;
  const vertical = lod === 0 ? 5 : lod === 1 ? 3 : 1;
  const branches = lod === 0 ? 5 : lod === 1 ? 4 : 3;
  const parts: THREE.BufferGeometry[] = [];
  const offsets = [-0.38, -0.18, 0, 0.2, 0.4];
  const heights = [0.58, 0.83, 1.05, 0.76, 0.52];

  for (let index = 0; index < branches; index++) {
    const x = offsets[index] ?? 0;
    const height = heights[index] ?? 0.6;
    const colour = index % 3 === 0
      ? LIVING_CYAN
      : index % 3 === 1
        ? MOON_VIOLET
        : HEART_ROSE;
    parts.push(decorate(
      new THREE.CylinderGeometry(0.055, 0.12, height, radial, vertical, false),
      {
        position: new THREE.Vector3(x, height * 0.5, 0.06 * Math.sin(index * 1.7)),
        rotation: new THREE.Euler(0, index * 0.5, x * -0.42),
        colour,
        glowWeight: 0.92
      }
    ));
    const cupCount = lod === 0 ? 3 : 2;
    if (lod < 2 && index < cupCount) {
      parts.push(decorate(
        new THREE.TorusGeometry(
          0.075,
          0.028,
          3,
          lod === 0 ? 12 : 10
        ),
        {
          position: new THREE.Vector3(x, height, 0.06 * Math.sin(index * 1.7)),
          rotation: new THREE.Euler(Math.PI / 2, 0, 0),
          colour,
          glowWeight: 1
        }
      ));
    }
  }
  parts.push(decorate(
    new THREE.SphereGeometry(0.42, radial * 2, Math.max(4, radial)),
    {
      position: new THREE.Vector3(0, 0.04, 0),
      scale: new THREE.Vector3(1, 0.22, 0.72),
      colour: MOONSTONE_DARK,
      glowWeight: 0.16
    }
  ));
  return merge(parts);
}

export function createRibbonKelpGeometry(lod: 0 | 1): THREE.BufferGeometry {
  const widthSegments = lod === 0 ? 4 : 2;
  const heightSegments = lod === 0 ? 52 : 30;
  const geometry = new THREE.PlaneGeometry(0.62, 2, widthSegments, heightSegments);
  geometry.translate(0, 1, 0);
  const position = geometry.getAttribute("position");
  for (let index = 0; index < position.count; index++) {
    const y = position.getY(index);
    const x = position.getX(index);
    position.setX(index, x + Math.sin(y * 2.2) * 0.09 * (y / 2));
  }
  position.needsUpdate = true;
  return decorate(geometry, {
    colour: lod === 0 ? LIVING_CYAN : MOON_VIOLET,
    glowWeight: 0.72,
    swayWeight: (vertex) => THREE.MathUtils.clamp(vertex.y / 2, 0, 1)
  });
}

export function geometryTriangles(geometry: THREE.BufferGeometry): number {
  const count = geometry.index
    ? geometry.index.count
    : geometry.getAttribute("position").count;
  return Math.round(count / 3);
}
