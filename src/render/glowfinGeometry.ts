import * as THREE from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import type { TuningConfig } from "../core/config";

export type GlowfinLod = 0 | 1;

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
  const quaternion = new THREE.Quaternion().setFromEuler(
    part.rotation ?? new THREE.Euler()
  );
  part.geometry.applyMatrix4(
    new THREE.Matrix4().compose(part.position, quaternion, part.scale)
  );
  const vertices = part.geometry.getAttribute("position").count;
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
  part.geometry.setAttribute(
    "skinIndex",
    new THREE.Uint16BufferAttribute(skinIndex, 4)
  );
  part.geometry.setAttribute(
    "skinWeight",
    new THREE.Float32BufferAttribute(skinWeight, 4)
  );
  part.geometry.setAttribute(
    "color",
    new THREE.Float32BufferAttribute(colours, 3)
  );
  return part.geometry;
}

function prepareEye(
  geometry: THREE.BufferGeometry,
  position: THREE.Vector3
): THREE.BufferGeometry {
  geometry.translate(position.x, position.y, position.z);
  return geometry;
}

export function createGlowfinRigGeometry(
  cfg: TuningConfig,
  lod: GlowfinLod
): GlowfinRigGeometry {
  const r = cfg.lane.creatureRadius;
  const high = lod === 0;
  const cyan = new THREE.Color(0x1598c3);
  const finCyan = new THREE.Color(0x2eb3d2);
  const gillViolet = new THREE.Color(0x8d5fd0);
  const pivots = {
    finLeft: new THREE.Vector3(-r * 0.78, -r * 0.12, r * 0.18),
    finRight: new THREE.Vector3(r * 0.78, -r * 0.12, r * 0.18),
    tail: new THREE.Vector3(0, r * 0.01, r * 0.92),
    gills: [] as THREE.Vector3[]
  };

  const bodyParts: RigPart[] = [{
    geometry: new THREE.SphereGeometry(
      r,
      high ? 48 : 34,
      high ? 32 : 22
    ),
    bone: 0,
    colour: cyan,
    position: new THREE.Vector3(),
    scale: new THREE.Vector3(
      1,
      cfg.creature.bodyHeight,
      cfg.creature.bodyLength
    )
  }];

  const finSegments = high ? [24, 16] : [16, 10];
  for (const side of [-1, 1]) {
    const pivot = side < 0 ? pivots.finLeft : pivots.finRight;
    bodyParts.push({
      geometry: new THREE.SphereGeometry(
        r * 0.78,
        finSegments[0],
        finSegments[1]
      ),
      bone: side < 0 ? 1 : 2,
      colour: finCyan,
      position: pivot.clone(),
      rotation: new THREE.Euler(0, side * 0.16, side * 0.12),
      scale: new THREE.Vector3(1.82, 0.12, 1.06)
    });
  }

  bodyParts.push({
    geometry: new THREE.SphereGeometry(
      r * 0.70,
      high ? 22 : 14,
      high ? 15 : 9
    ),
    bone: 3,
    colour: finCyan,
    position: pivots.tail.clone(),
    scale: new THREE.Vector3(0.30, 0.88, 1.22)
  });

  let bone = 4;
  for (const side of [-1, 1]) {
    for (let index = 0; index < 3; index++) {
      const pivot = new THREE.Vector3(
      side * r * 0.8,
      r * (0.43 - index * 0.25),
      r * (0.7 + index * 0.035)
      );
      pivots.gills.push(pivot);
      bodyParts.push({
        geometry: new THREE.SphereGeometry(
          r * 0.20,
          high ? 14 : 9,
          high ? 9 : 6
        ),
        bone,
        colour: gillViolet,
        position: pivot,
        rotation: new THREE.Euler(0, side * 0.42, side * 0.24),
        scale: new THREE.Vector3(0.86, 0.46, 2.05)
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

  const eyeRadius = r * cfg.creature.eyeRadius * 0.8;
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
