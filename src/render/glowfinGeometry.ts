import * as THREE from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import type { TuningConfig } from "../core/config";

export type GlowfinLod = 0 | 1;

/**
 * Runtime travel is toward decreasing world Z. Keep this explicit because
 * camera-facing facial features can make an otherwise correctly moving mesh
 * read as if it is swimming backwards.
 */
export const GLOWFIN_FORWARD_AXIS = [0, 0, -1] as const;
export const GLOWFIN_REAR_AXIS = [0, 0, 1] as const;

export interface GlowfinRigGeometry {
  body: THREE.BufferGeometry;
  eyes: THREE.BufferGeometry;
  pivots: {
    finLeft: THREE.Vector3;
    finRight: THREE.Vector3;
    tail: THREE.Vector3;
    gills: THREE.Vector3[];
  };
  triangles: number;
}

interface RigPart {
  geometry: THREE.BufferGeometry;
  bone: number;
  colour: THREE.Color;
  position: THREE.Vector3;
  rotation?: THREE.Euler;
  scale: THREE.Vector3;
}

function triangleCount(geometry: THREE.BufferGeometry): number {
  const count = geometry.index
    ? geometry.index.count
    : geometry.getAttribute("position").count;
  return Math.round(count / 3);
}

function preparePart(part: RigPart): THREE.BufferGeometry {
  let geometry = part.geometry;
  if (geometry.index) {
    const indexed = geometry;
    geometry = geometry.toNonIndexed();
    indexed.dispose();
  }
  const quaternion = new THREE.Quaternion().setFromEuler(
    part.rotation ?? new THREE.Euler()
  );
  geometry.applyMatrix4(
    new THREE.Matrix4().compose(part.position, quaternion, part.scale)
  );
  const vertices = geometry.getAttribute("position").count;
  const skinIndex = new Uint16Array(vertices * 4);
  const skinWeight = new Float32Array(vertices * 4);
  const colours = new Float32Array(vertices * 3);
  for (let index = 0; index < vertices; index++) {
    skinIndex[index * 4] = part.bone;
    skinWeight[index * 4] = 1;
    colours[index * 3] = part.colour.r;
    colours[index * 3 + 1] = part.colour.g;
    colours[index * 3 + 2] = part.colour.b;
  }
  geometry.setAttribute(
    "skinIndex",
    new THREE.Uint16BufferAttribute(skinIndex, 4)
  );
  geometry.setAttribute(
    "skinWeight",
    new THREE.Float32BufferAttribute(skinWeight, 4)
  );
  geometry.setAttribute(
    "color",
    new THREE.Float32BufferAttribute(colours, 3)
  );
  return geometry;
}

function prepareEye(
  geometry: THREE.BufferGeometry,
  position: THREE.Vector3
): THREE.BufferGeometry {
  geometry.translate(position.x, position.y, position.z);
  return geometry;
}

function createGillPetal(
  length: number,
  width: number,
  high: boolean
): THREE.BufferGeometry {
  const shape = new THREE.Shape();
  // The root is deliberately narrow and extends below the pivot so it can be
  // buried in the body. A rounded, asymmetric petal reads as a stylised
  // external axolotl gill without falling back to forbidden micro-fronds.
  shape.moveTo(-width * 0.2, -length * 0.1);
  shape.bezierCurveTo(
    -width * 0.48,
    length * 0.08,
    -width * 0.58,
    length * 0.54,
    -width * 0.16,
    length * 0.92
  );
  shape.bezierCurveTo(
    -width * 0.05,
    length * 1.02,
    width * 0.12,
    length * 1.02,
    width * 0.22,
    length * 0.88
  );
  shape.bezierCurveTo(
    width * 0.5,
    length * 0.5,
    width * 0.42,
    length * 0.08,
    width * 0.2,
    -length * 0.1
  );
  shape.closePath();

  const depth = width * 0.42;
  const geometry = new THREE.ExtrudeGeometry(shape, {
    depth,
    steps: 1,
    curveSegments: high ? 7 : 4,
    bevelEnabled: true,
    bevelSegments: 1,
    bevelSize: width * 0.1,
    bevelThickness: width * 0.08
  });
  geometry.translate(0, 0, -depth * 0.5);
  const positions = geometry.getAttribute("position");
  for (let index = 0; index < positions.count; index++) {
    const y = THREE.MathUtils.clamp(
      positions.getY(index) / Math.max(0.001, length),
      0,
      1
    );
    positions.setZ(
      index,
      positions.getZ(index) + Math.sin(y * Math.PI) * width * 0.14
    );
  }
  positions.needsUpdate = true;
  geometry.computeVertexNormals();
  geometry.normalizeNormals();
  return geometry;
}

interface MembranePoint {
  x: number;
  y: number;
  z: number;
  thickness: number;
}

function createClosedMembrane(
  uSegments: number,
  vSegments: number,
  parameterNormalSign: -1 | 1,
  sample: (u: number, v: number) => MembranePoint
): THREE.BufferGeometry {
  const positions: number[] = [];
  const uvs: number[] = [];
  const indices: number[] = [];
  const columns = vSegments + 1;
  const surfaceVertexCount = (uSegments + 1) * columns;
  const vertexIndex = (
    surfaceIndex: number,
    uIndex: number,
    vIndex: number
  ) => surfaceIndex * surfaceVertexCount + uIndex * columns + vIndex;

  for (const surfaceSign of [-1, 1] as const) {
    for (let uIndex = 0; uIndex <= uSegments; uIndex++) {
      const u = uIndex / uSegments;
      for (let vIndex = 0; vIndex <= vSegments; vIndex++) {
        const v01 = vIndex / vSegments;
        const v = v01 * 2 - 1;
        const point = sample(u, v);
        positions.push(
          point.x,
          point.y,
          point.z + surfaceSign * point.thickness
        );
        uvs.push(u, v01);
      }
    }
  }

  for (let surfaceIndex = 0; surfaceIndex < 2; surfaceIndex++) {
    const surfaceSign = surfaceIndex === 0 ? -1 : 1;
    const standardWinding = parameterNormalSign === surfaceSign;
    for (let uIndex = 0; uIndex < uSegments; uIndex++) {
      for (let vIndex = 0; vIndex < vSegments; vIndex++) {
        const a = vertexIndex(surfaceIndex, uIndex, vIndex);
        const b = vertexIndex(surfaceIndex, uIndex + 1, vIndex);
        const c = vertexIndex(surfaceIndex, uIndex, vIndex + 1);
        const d = vertexIndex(surfaceIndex, uIndex + 1, vIndex + 1);
        if (standardWinding) {
          indices.push(a, b, c, b, d, c);
        } else {
          indices.push(a, c, b, b, c, d);
        }
      }
    }
  }

  const connectEdge = (
    frontA: number,
    frontB: number,
    backA: number,
    backB: number
  ) => {
    indices.push(frontA, frontB, backA, frontB, backB, backA);
  };
  for (let uIndex = 0; uIndex < uSegments; uIndex++) {
    for (const vIndex of [0, vSegments]) {
      connectEdge(
        vertexIndex(1, uIndex, vIndex),
        vertexIndex(1, uIndex + 1, vIndex),
        vertexIndex(0, uIndex, vIndex),
        vertexIndex(0, uIndex + 1, vIndex)
      );
    }
  }
  for (let vIndex = 0; vIndex < vSegments; vIndex++) {
    for (const uIndex of [0, uSegments]) {
      connectEdge(
        vertexIndex(1, uIndex, vIndex),
        vertexIndex(1, uIndex, vIndex + 1),
        vertexIndex(0, uIndex, vIndex),
        vertexIndex(0, uIndex, vIndex + 1)
      );
    }
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute(
    "position",
    new THREE.Float32BufferAttribute(positions, 3)
  );
  geometry.setAttribute("uv", new THREE.Float32BufferAttribute(uvs, 2));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  geometry.normalizeNormals();
  return geometry;
}

function createMantaFin(
  radius: number,
  high: boolean,
  side: -1 | 1
): THREE.BufferGeometry {
  return createClosedMembrane(
    high ? 12 : 8,
    high ? 6 : 4,
    side,
    (u, v) => {
      const eased = 1 - (1 - u) ** 1.22;
      const span = radius * 1.5 * eased;
      const halfHeight = radius * (
        0.29 * (1 - u) +
        0.25 * Math.sin(u * Math.PI) +
        0.025
      );
      return {
        x: side * span,
        y: v * halfHeight + Math.sin(u * Math.PI) * radius * 0.025,
        z: Math.sin(u * Math.PI) *
          (1 - v * v) * radius * 0.12 -
          u * u * radius * 0.02,
        thickness: radius * (0.045 - u * 0.018)
      };
    }
  );
}

function createTailPaddle(
  radius: number,
  high: boolean
): THREE.BufferGeometry {
  return createClosedMembrane(
    high ? 10 : 7,
    high ? 5 : 4,
    1,
    (u, v) => {
      const halfWidth = radius * (
        0.28 * (1 - u) +
        0.16 * Math.sin(u * Math.PI)
      );
      return {
        x: v * halfWidth,
        y: radius * (0.24 - u * 1.24),
        z: Math.sin(u * Math.PI) *
          (1 - v * v) * radius * 0.065,
        thickness: radius * (0.055 - u * 0.025)
      };
    }
  );
}

export function createGlowfinRigGeometry(
  cfg: TuningConfig,
  lod: GlowfinLod
): GlowfinRigGeometry {
  const r = cfg.lane.creatureRadius;
  const high = lod === 0;
  const cyan = new THREE.Color(0x058fbd);
  const shoulderCyan = new THREE.Color(0x179fc6);
  const finCyan = new THREE.Color(0x42c9df);
  const gillViolet = new THREE.Color(0xa94fc3);
  const pivots = {
    finLeft: new THREE.Vector3(-r * 0.48, -r * 0.08, r * 0.28),
    finRight: new THREE.Vector3(r * 0.48, -r * 0.08, r * 0.28),
    tail: new THREE.Vector3(0, -r * 0.54, r * 0.52),
    gills: [] as THREE.Vector3[]
  };

  const bodyParts: RigPart[] = [{
    geometry: new THREE.SphereGeometry(
      r,
      high ? 52 : 36,
      high ? 38 : 26
    ),
    bone: 0,
    colour: cyan,
    position: new THREE.Vector3(),
    scale: new THREE.Vector3(
      0.96,
      cfg.creature.bodyHeight,
      cfg.creature.bodyLength
    )
  }];

  for (const side of [-1, 1]) {
    const pivot = side < 0 ? pivots.finLeft : pivots.finRight;
    bodyParts.push({
      geometry: new THREE.SphereGeometry(
        r * 0.42,
        high ? 16 : 10,
        high ? 10 : 7
      ),
      bone: side < 0 ? 1 : 2,
      colour: shoulderCyan,
      position: pivot.clone().add(new THREE.Vector3(
        side * r * 0.1,
        r * 0.015,
        r * 0.17
      )),
      rotation: new THREE.Euler(0, side * 0.08, side * 0.035),
      scale: new THREE.Vector3(0.96, 0.58, 0.34)
    });
    bodyParts.push({
      geometry: createMantaFin(r * 0.88, high, side as -1 | 1),
      bone: side < 0 ? 1 : 2,
      colour: finCyan,
      position: pivot.clone().add(new THREE.Vector3(0, 0, r * 0.13)),
      rotation: new THREE.Euler(-0.08, side * 0.025, side * 0.045),
      scale: new THREE.Vector3(1, 0.96, 1)
    });
  }

  // A low-profile shoulder disappears under the body while the paddle begins
  // inside the same volume. This produces one continuous caudal transition
  // without the capsule-and-paddle seam visible in the rejected screenshot.
  bodyParts.push({
    geometry: new THREE.SphereGeometry(
      r * 0.38,
      high ? 14 : 9,
      high ? 9 : 6
    ),
    bone: 3,
    colour: shoulderCyan,
    position: pivots.tail.clone().add(new THREE.Vector3(0, r * 0.12, 0)),
    scale: new THREE.Vector3(0.55, 0.72, 0.34)
  });

  // The cute approved rear read uses one small tapered central paddle.
  bodyParts.push({
    geometry: createTailPaddle(r * 0.78, high),
    bone: 3,
    colour: finCyan,
    position: pivots.tail.clone(),
    rotation: new THREE.Euler(-0.04, 0, 0),
    scale: new THREE.Vector3(0.94, 1, 1)
  });

  let bone = 4;
  for (const side of [-1, 1]) {
    for (let index = 0; index < 3; index++) {
      const pivot = new THREE.Vector3(
        side * r * (0.6 + index * 0.035),
        r * (0.3 - index * 0.2),
        r * (0.7 - index * 0.015)
      );
      pivots.gills.push(pivot);
      bodyParts.push({
        geometry: createGillPetal(
          r * (0.45 - index * 0.035),
          r * (0.24 - index * 0.012),
          high
        ),
        bone,
        colour: gillViolet,
        position: pivot,
        rotation: new THREE.Euler(
          0.18,
          side * 0.055,
          -side * (1.18 - index * 0.44)
        ),
        scale: new THREE.Vector3(
          1 - index * 0.025,
          1 - index * 0.035,
          1
        )
      });
      bone += 1;
    }
  }

  const prepared = bodyParts.map(preparePart);
  const body = mergeGeometries(prepared, false);
  for (const part of prepared) part.dispose();
  if (!body) throw new Error("Glowfin rig geometry attributes did not match.");
  body.computeBoundingBox();
  body.computeBoundingSphere();

  const eyeRadius = r * cfg.creature.eyeRadius;
  const eyeParts: THREE.BufferGeometry[] = [];
  for (const side of [-1, 1]) {
    eyeParts.push(prepareEye(
      new THREE.SphereGeometry(
        eyeRadius,
        high ? 18 : 12,
        high ? 13 : 8
      ),
      new THREE.Vector3(
        side * r * cfg.creature.eyeOffsetX,
        r * cfg.creature.eyeOffsetY,
        r * cfg.creature.eyeOffsetZ
      )
    ));
  }
  const eyes = mergeGeometries(eyeParts, false);
  for (const part of eyeParts) part.dispose();
  if (!eyes) throw new Error("Glowfin eye geometry attributes did not match.");
  eyes.computeBoundingBox();
  eyes.computeBoundingSphere();

  return {
    body,
    eyes,
    pivots,
    triangles: triangleCount(body) + triangleCount(eyes)
  };
}
