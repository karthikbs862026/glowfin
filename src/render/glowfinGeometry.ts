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
  const radial = high ? 8 : 6;
  const geometry = new THREE.CapsuleGeometry(
    radius * 0.3,
    radius * 0.86,
    high ? 5 : 3,
    radial
  );
  geometry.scale(0.82, 1, 0.22);
  return geometry;
}

function createMantaFin(
  radius: number,
  high: boolean,
  side: -1 | 1
): THREE.BufferGeometry {
  const shape = new THREE.Shape();
  shape.moveTo(0, -radius * 0.14);
  shape.bezierCurveTo(
    side * radius * 0.25,
    -radius * 0.2,
    side * radius * 0.46,
    -radius * 0.31,
    side * radius * 0.62,
    -radius * 0.24
  );
  shape.bezierCurveTo(
    side * radius * 0.7,
    -radius * 0.2,
    side * radius * 0.76,
    -radius * 0.18,
    side * radius * 0.82,
    -radius * 0.19
  );
  shape.bezierCurveTo(
    side * radius * 1.02,
    -radius * 0.3,
    side * radius * 1.25,
    -radius * 0.2,
    side * radius * 1.38,
    -radius * 0.04
  );
  shape.bezierCurveTo(
    side * radius * 1.52,
    -radius * 0.01,
    side * radius * 1.5,
    radius * 0.12,
    side * radius * 1.34,
    radius * 0.16
  );
  shape.bezierCurveTo(
    side * radius * 1.08,
    radius * 0.4,
    side * radius * 0.46,
    radius * 0.42,
    0,
    radius * 0.18
  );
  shape.closePath();
  const depth = radius * 0.12;
  const geometry = new THREE.ExtrudeGeometry(shape, {
    depth,
    steps: 1,
    curveSegments: high ? 8 : 5,
    bevelEnabled: true,
    bevelSegments: 1,
    bevelSize: radius * 0.035,
    bevelThickness: radius * 0.025
  });
  geometry.translate(0, 0, -depth * 0.5);
  return geometry;
}

function createTailPaddle(
  radius: number,
  high: boolean
): THREE.BufferGeometry {
  const shape = new THREE.Shape();
  shape.moveTo(-radius * 0.13, radius * 0.08);
  shape.bezierCurveTo(
    -radius * 0.32,
    -radius * 0.18,
    -radius * 0.24,
    -radius * 0.7,
    0,
    -radius * 1.02
  );
  shape.bezierCurveTo(
    radius * 0.24,
    -radius * 0.7,
    radius * 0.3,
    -radius * 0.18,
    radius * 0.13,
    radius * 0.08
  );
  shape.closePath();
  const depth = radius * 0.16;
  const geometry = new THREE.ExtrudeGeometry(shape, {
    depth,
    steps: 1,
    curveSegments: high ? 8 : 5,
    bevelEnabled: true,
    bevelSegments: 1,
    bevelSize: radius * 0.03,
    bevelThickness: radius * 0.024
  });
  geometry.translate(0, 0, -depth * 0.5);
  return geometry;
}

export function createGlowfinRigGeometry(
  cfg: TuningConfig,
  lod: GlowfinLod
): GlowfinRigGeometry {
  const r = cfg.lane.creatureRadius;
  const high = lod === 0;
  const cyan = new THREE.Color(0x058fbd);
  const finCyan = new THREE.Color(0x42c9df);
  const gillViolet = new THREE.Color(0xa94fc3);
  const pivots = {
    finLeft: new THREE.Vector3(-r * 0.38, -r * 0.1, r * 0.08),
    finRight: new THREE.Vector3(r * 0.38, -r * 0.1, r * 0.08),
    tail: new THREE.Vector3(0, -r * 0.52, r * 0.72),
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
      geometry: createMantaFin(r * 1.02, high, side as -1 | 1),
      bone: side < 0 ? 1 : 2,
      colour: finCyan,
      position: pivot.clone(),
      rotation: new THREE.Euler(-0.1, side * 0.035, side * 0.055),
      scale: new THREE.Vector3(1, 0.94, 1)
    });
  }

  // The supplied reference uses one small centered teardrop tail.
  bodyParts.push({
    geometry: createTailPaddle(r * 0.92, high),
    bone: 3,
    colour: finCyan,
    position: pivots.tail.clone(),
    rotation: new THREE.Euler(-0.06, 0, 0),
    scale: new THREE.Vector3(1.05, 0.88, 1)
  });

  let bone = 4;
  for (const side of [-1, 1]) {
    for (let index = 0; index < 3; index++) {
      const pivot = new THREE.Vector3(
        side * r * (0.76 + index * 0.055),
        r * (0.55 - index * 0.23),
        r * (0.56 - index * 0.015)
      );
      pivots.gills.push(pivot);
      bodyParts.push({
        geometry: createGillLeaf(r * 0.4, high),
        bone,
        colour: gillViolet,
        position: pivot,
        rotation: new THREE.Euler(
          side * 0.035,
          side * 0.08,
          -side * (0.85 + index * 0.6)
        ),
        scale: new THREE.Vector3(
          0.92 + index * 0.035,
          1 - index * 0.045,
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
    eye.scale(0.68, 1, 0.45);
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
