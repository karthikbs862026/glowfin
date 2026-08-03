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
  colour: THREE.Color | ((position: THREE.Vector3) => THREE.Color);
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
  const vertex = new THREE.Vector3();
  for (let index = 0; index < vertices; index++) {
    skinIndex[index * 4] = part.bone;
    skinWeight[index * 4] = 1;
    vertex.fromBufferAttribute(geometry.getAttribute("position"), index);
    const colour = typeof part.colour === "function"
      ? part.colour(vertex)
      : part.colour;
    colours[index * 3] = colour.r;
    colours[index * 3 + 1] = colour.g;
    colours[index * 3 + 2] = colour.b;
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

function createGillLeaf(radius: number, high: boolean): THREE.BufferGeometry {
  // The supplied reference uses three clean, rounded leaves per side. Do not
  // replace these with branched fronds, leaflet spikes or folded wedges.
  const length = radius * 1.04;
  const width = radius * 0.58;
  const shape = new THREE.Shape();
  shape.moveTo(-width * 0.18, -length * 0.1);
  shape.bezierCurveTo(
    -width * 0.5,
    length * 0.08,
    -width * 0.56,
    length * 0.56,
    -width * 0.15,
    length * 0.92
  );
  shape.bezierCurveTo(
    -width * 0.05,
    length * 1.02,
    width * 0.08,
    length * 1.02,
    width * 0.18,
    length * 0.92
  );
  shape.bezierCurveTo(
    width * 0.54,
    length * 0.56,
    width * 0.48,
    length * 0.08,
    width * 0.18,
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
    bevelSize: width * 0.08,
    bevelThickness: width * 0.065
  });
  geometry.translate(0, 0, -depth * 0.5);
  const positions = geometry.getAttribute("position");
  for (let index = 0; index < positions.count; index++) {
    const along = THREE.MathUtils.clamp(
      positions.getY(index) / Math.max(length, 0.001),
      0,
      1
    );
    positions.setZ(
      index,
      positions.getZ(index) + Math.sin(along * Math.PI) * width * 0.12
    );
  }
  positions.needsUpdate = true;
  geometry.computeVertexNormals();
  geometry.normalizeNormals();
  return geometry;
}

function createMantaFin(
  radius: number,
  high: boolean,
  side: -1 | 1
): THREE.BufferGeometry {
  const shape = new THREE.Shape();
  shape.moveTo(0, -radius * 0.2);
  shape.bezierCurveTo(
    side * radius * 0.34,
    -radius * 0.25,
    side * radius * 0.5,
    -radius * 0.4,
    side * radius * 0.68,
    -radius * 0.3
  );
  shape.bezierCurveTo(
    side * radius * 0.79,
    -radius * 0.25,
    side * radius * 0.84,
    -radius * 0.38,
    side * radius * 0.96,
    -radius * 0.28
  );
  shape.bezierCurveTo(
    side * radius * 1.09,
    -radius * 0.23,
    side * radius * 1.16,
    -radius * 0.34,
    side * radius * 1.28,
    -radius * 0.21
  );
  shape.bezierCurveTo(
    side * radius * 1.48,
    -radius * 0.11,
    side * radius * 1.58,
    radius * 0.03,
    side * radius * 1.48,
    radius * 0.15
  );
  shape.bezierCurveTo(
    side * radius * 1.3,
    radius * 0.34,
    side * radius * 0.72,
    radius * 0.43,
    side * radius * 0.3,
    radius * 0.31
  );
  shape.bezierCurveTo(
    side * radius * 0.13,
    radius * 0.26,
    side * radius * 0.05,
    radius * 0.2,
    0,
    radius * 0.15
  );
  shape.closePath();
  const depth = radius * 0.13;
  const geometry = new THREE.ExtrudeGeometry(shape, {
    depth,
    steps: 1,
    curveSegments: high ? 8 : 5,
    bevelEnabled: true,
    bevelSegments: 1,
    bevelSize: radius * 0.03,
    bevelThickness: radius * 0.022
  });
  geometry.translate(0, 0, -depth * 0.5);
  const positions = geometry.getAttribute("position");
  for (let index = 0; index < positions.count; index++) {
    const span = THREE.MathUtils.clamp(
      Math.abs(positions.getX(index)) / (radius * 1.58),
      0,
      1
    );
    const vertical = THREE.MathUtils.clamp(
      1 - Math.abs(positions.getY(index)) / (radius * 0.48),
      0,
      1
    );
    positions.setZ(
      index,
      positions.getZ(index) + Math.sin(span * Math.PI) *
        vertical * radius * 0.12
    );
  }
  positions.needsUpdate = true;
  geometry.computeVertexNormals();
  geometry.normalizeNormals();
  return geometry;
}

function createTailPaddle(
  radius: number,
  high: boolean
): THREE.BufferGeometry {
  const shape = new THREE.Shape();
  shape.moveTo(-radius * 0.13, radius * 0.12);
  shape.bezierCurveTo(
    -radius * 0.32,
    -radius * 0.15,
    -radius * 0.37,
    -radius * 0.58,
    -radius * 0.22,
    -radius * 0.92
  );
  shape.bezierCurveTo(
    -radius * 0.15,
    -radius * 1.05,
    -radius * 0.05,
    -radius * 0.86,
    0,
    -radius * 0.82
  );
  shape.bezierCurveTo(
    radius * 0.05,
    -radius * 0.86,
    radius * 0.15,
    -radius * 1.05,
    radius * 0.22,
    -radius * 0.92
  );
  shape.bezierCurveTo(
    radius * 0.37,
    -radius * 0.58,
    radius * 0.32,
    -radius * 0.15,
    radius * 0.13,
    radius * 0.12
  );
  shape.closePath();
  const depth = radius * 0.15;
  const geometry = new THREE.ExtrudeGeometry(shape, {
    depth,
    steps: 1,
    curveSegments: high ? 8 : 5,
    bevelEnabled: true,
    bevelSegments: 1,
    bevelSize: radius * 0.028,
    bevelThickness: radius * 0.022
  });
  geometry.translate(0, 0, -depth * 0.5);
  const positions = geometry.getAttribute("position");
  for (let index = 0; index < positions.count; index++) {
    const length = THREE.MathUtils.clamp(
      (radius * 0.12 - positions.getY(index)) / (radius * 1.17),
      0,
      1
    );
    positions.setZ(
      index,
      positions.getZ(index) + Math.sin(length * Math.PI) * radius * 0.08
    );
  }
  positions.needsUpdate = true;
  geometry.computeVertexNormals();
  geometry.normalizeNormals();
  return geometry;
}

export function createGlowfinRigGeometry(
  cfg: TuningConfig,
  lod: GlowfinLod
): GlowfinRigGeometry {
  const r = cfg.lane.creatureRadius;
  const high = lod === 0;
  const deepCyan = new THREE.Color(0x036ca4);
  const cyan = new THREE.Color(0x08a9d2);
  const finRootCyan = new THREE.Color(0x057ba8);
  const finGlowCyan = new THREE.Color(0x79edf2);
  const gillViolet = new THREE.Color(0x7659d4);
  const gillGlow = new THREE.Color(0xc5adff);
  const pivots = {
    finLeft: new THREE.Vector3(-r * 0.34, -r * 0.1, r * 0.12),
    finRight: new THREE.Vector3(r * 0.34, -r * 0.1, r * 0.12),
    tail: new THREE.Vector3(0, -r * 0.52, r * 0.7),
    gills: [] as THREE.Vector3[]
  };

  const bodyParts: RigPart[] = [{
    geometry: new THREE.SphereGeometry(
      r,
      high ? 52 : 36,
      high ? 38 : 26
    ),
    bone: 0,
    colour: (position) => deepCyan.clone().lerp(
      cyan,
      THREE.MathUtils.clamp(
        0.28 + (-position.y / Math.max(r, 0.001)) * 0.34,
        0,
        1
      )
    ),
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
      geometry: createMantaFin(r * 1.04, high, side as -1 | 1),
      bone: side < 0 ? 1 : 2,
      colour: (position) => finRootCyan.clone().lerp(
        finGlowCyan,
        THREE.MathUtils.clamp(
          (Math.abs(position.x) / Math.max(r, 0.001) - 0.28) / 1.34,
          0,
          1
        )
      ),
      position: pivot.clone(),
      rotation: new THREE.Euler(-0.08, side * 0.02, side * 0.035),
      scale: new THREE.Vector3(1, 0.98, 1)
    });
  }

  // The supplied reference uses one small centered teardrop tail.
  bodyParts.push({
    geometry: createTailPaddle(r * 0.92, high),
    bone: 3,
    colour: (position) => finRootCyan.clone().lerp(
      finGlowCyan,
      THREE.MathUtils.clamp(
        (-position.y / Math.max(r, 0.001) - 0.42) / 1.08,
        0,
        1
      )
    ),
    position: pivots.tail.clone(),
    rotation: new THREE.Euler(-0.045, 0, 0),
    scale: new THREE.Vector3(1.08, 0.94, 1)
  });

  let bone = 4;
  for (const side of [-1, 1]) {
    for (let index = 0; index < 3; index++) {
      const pivot = new THREE.Vector3(
        side * r * (0.84 + index * 0.04),
        r * (0.58 - index * 0.18),
        r * (0.56 + index * 0.012)
      );
      pivots.gills.push(pivot);
      bodyParts.push({
        geometry: createGillLeaf(r * 0.4, high),
        bone,
        colour: (position) => gillViolet.clone().lerp(
          gillGlow,
          THREE.MathUtils.clamp(
            (Math.abs(position.x) / Math.max(r, 0.001) - 0.76) / 0.55,
            0,
            0.72
          )
        ),
        position: pivot,
        rotation: new THREE.Euler(
          side * 0.025,
          side * 0.045,
          -side * (0.82 + index * 0.42)
        ),
        scale: new THREE.Vector3(
          1 - index * 0.02,
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
    const eye = new THREE.SphereGeometry(
      eyeRadius,
      high ? 18 : 12,
      high ? 13 : 8
    );
    // A broad, shallow lens remains readable at the portrait gameplay scale
    // without turning back toward the chase camera. Depth stays compressed so
    // the visible surface still faces the negative-Z obstacle corridor.
    eye.scale(1, 0.82, 0.36);
    eyeParts.push(prepareEye(
      eye,
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
