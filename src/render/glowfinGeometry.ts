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

function createGillLeaf(radius: number, high: boolean): THREE.BufferGeometry {
  const radial = high ? 6 : 5;
  const parts: THREE.BufferGeometry[] = [];
  const stem = new THREE.CapsuleGeometry(
    radius * 0.13,
    radius * 1.42,
    high ? 3 : 2,
    radial
  );
  stem.scale(0.82, 1, 0.58);
  parts.push(stem);

  // Alternating soft leaflets turn each of the six rigged gill bones into a
  // feathery frond. The previous single ellipsoid read as a plastic ear from
  // the chase camera even though it was correctly skinned.
  const leafletCount = high ? 3 : 2;
  for (let index = 0; index < leafletCount; index++) {
    const side = index % 2 === 0 ? -1 : 1;
    const leaflet = new THREE.SphereGeometry(
      radius * (0.28 - index * 0.018),
      radial,
      high ? 5 : 4
    );
    leaflet.scale(0.72, 1.18, 0.42);
    leaflet.rotateZ(side * (0.72 - index * 0.08));
    leaflet.translate(
      side * radius * (0.21 + index * 0.025),
      -radius * 0.48 + index * radius * 0.34,
      (index % 3 - 1) * radius * 0.055
    );
    parts.push(leaflet);
  }
  const tip = new THREE.SphereGeometry(
    radius * 0.2,
    radial,
    high ? 5 : 4
  );
  tip.scale(0.7, 1.05, 0.45);
  tip.translate(0, radius * 0.82, 0);
  parts.push(tip);

  const geometry = mergeGeometries(parts, false);
  for (const part of parts) part.dispose();
  if (!geometry) throw new Error("Glowfin gill frond geometry did not merge.");
  return geometry;
}

export function createGlowfinRigGeometry(
  cfg: TuningConfig,
  lod: GlowfinLod
): GlowfinRigGeometry {
  const r = cfg.lane.creatureRadius;
  const high = lod === 0;
  const cyan = new THREE.Color(0x168eaf);
  const finCyan = new THREE.Color(0x29a9c3);
  const gillViolet = new THREE.Color(0x794799);
  const pivots = {
    finLeft: new THREE.Vector3(-r * 0.78, -r * 0.12, r * 0.18),
    finRight: new THREE.Vector3(r * 0.78, -r * 0.12, r * 0.18),
    tail: new THREE.Vector3(0, r * 0.01, r * 0.92),
    gills: [] as THREE.Vector3[]
  };

  const bodyParts: RigPart[] = [{
    geometry: new THREE.SphereGeometry(
      r,
      high ? 40 : 32,
      high ? 28 : 22
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

  // A raised rear mantle keeps the chase-camera view from collapsing into a
  // featureless sphere. It is true volume, not a camera-facing badge.
  bodyParts.push({
    geometry: new THREE.SphereGeometry(
      r * 0.42,
      high ? 20 : 14,
      high ? 13 : 9
    ),
    bone: 0,
    colour: finCyan,
    position: new THREE.Vector3(0, r * 0.02, r * 0.98),
    scale: new THREE.Vector3(0.92, 0.76, 0.2)
  });

  const finSegments = high ? [20, 14] : [14, 9];
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
      scale: new THREE.Vector3(1.76, 0.14, 1.1)
    });
  }

  // A raised vertical caudal fan reads above the body from the chase camera.
  // Keeping it off the lower silhouette prevents the projected tail from
  // resembling a long nose beneath the eyes.
  bodyParts.push({
    geometry: new THREE.SphereGeometry(
      r * 0.46,
      high ? 19 : 12,
      high ? 13 : 8
    ),
    bone: 3,
    colour: finCyan,
    position: pivots.tail.clone().add(new THREE.Vector3(
      0,
      r * 0.84,
      r * 0.16
    )),
    scale: new THREE.Vector3(0.36, 0.78, 0.11)
  });

  let bone = 4;
  for (const side of [-1, 1]) {
    for (let index = 0; index < 3; index++) {
      const pivot = new THREE.Vector3(
        side * r * (1.02 + index * 0.075),
        r * (0.54 - index * 0.31),
        r * (0.3 + index * 0.018)
      );
      pivots.gills.push(pivot);
      bodyParts.push({
        geometry: createGillLeaf(r * 0.49, high),
        bone,
        colour: gillViolet,
        position: pivot,
        rotation: new THREE.Euler(
          side * 0.06,
          side * 0.12,
          side * (1.08 - index * 0.52)
        ),
        scale: new THREE.Vector3(
          0.9 + index * 0.04,
          1.04 - index * 0.06,
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
