import * as THREE from "three";
import type { DuskmawMinionTier } from "../realms/mechanics";

export interface ShadowBroodPose {
  tier: DuskmawMinionTier;
  elapsedSec: number;
  reducedMotion: boolean;
  damageFraction: number;
  attackCharge: number;
  defeatProgress: number;
  hitFlash: number;
}

export interface ShadowBroodMaterials {
  dart: ShadowBroodMaterialSet;
  warden: ShadowBroodMaterialSet;
  sentinel: ShadowBroodMaterialSet;
}

interface ShadowBroodMaterialSet {
  body: THREE.Material;
  accent: THREE.Material;
  luminous: THREE.Material;
}

function mark<T extends THREE.Object3D>(object: T, name: string): T {
  object.name = name;
  object.userData["realm"] = "leviathan-graveyard";
  object.userData["nonCollidable"] = true;
  object.userData["actualThreeDimensionalGeometry"] = true;
  return object;
}

function prepareInstanced(
  geometry: THREE.BufferGeometry,
  material: THREE.Material,
  count: number,
  name: string,
): THREE.InstancedMesh {
  const mesh = mark(new THREE.InstancedMesh(geometry, material, count), name);
  mesh.frustumCulled = false;
  mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  return mesh;
}

function triangles(geometry: THREE.BufferGeometry): number {
  return geometry.index
    ? geometry.index.count / 3
    : (geometry.getAttribute("position")?.count ?? 0) / 3;
}

function makeFinGeometry(): THREE.ExtrudeGeometry {
  const shape = new THREE.Shape();
  shape.moveTo(0.78, 0);
  shape.bezierCurveTo(0.16, 0.08, -0.34, 0.72, -0.9, 1.18);
  shape.bezierCurveTo(-0.72, 0.36, -0.18, 0.02, 0.78, 0);
  shape.closePath();
  const geometry = new THREE.ExtrudeGeometry(shape, {
    depth: 0.07,
    bevelEnabled: true,
    bevelSegments: 1,
    bevelSize: 0.025,
    bevelThickness: 0.025,
    curveSegments: 7,
  });
  geometry.center();
  geometry.computeVertexNormals();
  return geometry;
}

function makeRayWingGeometry(): THREE.ExtrudeGeometry {
  const shape = new THREE.Shape();
  shape.moveTo(1.05, 0.04);
  shape.bezierCurveTo(0.28, 0.74, -0.72, 2.18, -2.72, 3.35);
  shape.bezierCurveTo(-2.18, 1.46, -1.08, 0.28, -0.24, -0.08);
  shape.closePath();
  const geometry = new THREE.ExtrudeGeometry(shape, {
    depth: 0.14,
    bevelEnabled: true,
    bevelSegments: 1,
    bevelSize: 0.035,
    bevelThickness: 0.035,
    curveSegments: 8,
  });
  geometry.rotateX(Math.PI / 2);
  geometry.translate(0, 0.07, 0);
  geometry.computeVertexNormals();
  return geometry;
}

/**
 * Three unrelated, readable 3D species. L1 is a flexible needle predator with
 * a real jaw, gills and forked caudal fin. L2 is a broad moonbone crustacean
 * with a segmented abdomen, articulated walking legs and two working pincers.
 * L3 remains a wide abyssal ray. No tier is a recoloured or scaled Duskmaw.
 */
export class ShadowBroodRig {
  readonly group = mark(
    new THREE.Group(),
    "three-distinct-shadow-brood-species-not-miniature-duskmaws",
  );

  private readonly sphereGeometry = new THREE.SphereGeometry(1, 18, 12);
  private readonly eyeGeometry = new THREE.SphereGeometry(1, 10, 7);
  private readonly dartSnoutGeometry = new THREE.ConeGeometry(0.19, 1.72, 10);
  private readonly dartJawGeometry = new THREE.CapsuleGeometry(0.13, 1.05, 4, 8);
  private readonly finGeometry = makeFinGeometry();
  private readonly shellPlateGeometry = new THREE.DodecahedronGeometry(1, 1);
  private readonly limbGeometry = new THREE.CapsuleGeometry(0.1, 0.72, 4, 8);
  private readonly telsonGeometry = new THREE.ConeGeometry(0.42, 1.42, 7);
  private readonly rayWingGeometry = makeRayWingGeometry();
  private readonly rayTailGeometry = new THREE.CylinderGeometry(0.09, 0.2, 4.4, 7);
  private readonly rayBarbGeometry = new THREE.ConeGeometry(0.32, 0.9, 5);

  private readonly dart = mark(
    new THREE.Group(),
    "l1-rift-dart-one-hit-needlefish-distinct-3d-character",
  );
  private readonly warden = mark(
    new THREE.Group(),
    "l2-grave-warden-two-hit-armoured-crustacean-distinct-3d-character",
  );
  private readonly sentinel = mark(
    new THREE.Group(),
    "l3-maw-sentinel-three-hit-abyssal-ray-distinct-3d-character",
  );

  private readonly dartBody: THREE.InstancedMesh;
  private readonly dartSkull: THREE.Mesh;
  private readonly dartSnout: THREE.Mesh;
  private readonly dartJaw: THREE.Mesh;
  private readonly dartFins: THREE.InstancedMesh;
  private readonly dartEyes: THREE.InstancedMesh;
  private readonly dartGills: THREE.InstancedMesh;

  private readonly wardenShell: THREE.Mesh;
  private readonly wardenShellPlates: THREE.InstancedMesh;
  private readonly wardenAbdomen: THREE.InstancedMesh;
  private readonly wardenHead: THREE.Mesh;
  private readonly wardenLimbs: THREE.InstancedMesh;
  private readonly wardenClaws: THREE.InstancedMesh;
  private readonly wardenEyes: THREE.InstancedMesh;
  private readonly wardenTelson: THREE.Mesh;
  private readonly wardenCracks: THREE.InstancedMesh;

  private readonly sentinelBody: THREE.Mesh;
  private readonly sentinelHead: THREE.Mesh;
  private readonly sentinelNearWing: THREE.Mesh;
  private readonly sentinelFarWing: THREE.Mesh;
  private readonly sentinelTail: THREE.Mesh;
  private readonly sentinelBarb: THREE.Mesh;
  private readonly sentinelEyes: THREE.InstancedMesh;

  private readonly dummy = new THREE.Object3D();
  private tier: DuskmawMinionTier = 1;

  constructor(materials: ShadowBroodMaterials) {
    this.group.userData["speciesContract"] =
      "l1-anatomical-rift-dart-l2-articulated-moonbone-warden-l3-abyssal-ray-three-immediately-distinguishable-silhouettes";

    this.dartSnoutGeometry.rotateZ(-Math.PI / 2);
    this.dartJawGeometry.rotateZ(-Math.PI / 2);
    this.telsonGeometry.rotateZ(Math.PI / 2);
    this.rayTailGeometry.rotateZ(Math.PI / 2);
    this.rayBarbGeometry.rotateZ(Math.PI / 2);

    this.dartBody = prepareInstanced(
      this.sphereGeometry,
      materials.dart.body,
      5,
      "rift-dart-five-flexing-fusiform-body-segments",
    );
    this.dartSkull = mark(
      new THREE.Mesh(this.sphereGeometry, materials.dart.body),
      "rift-dart-sculpted-skull-with-visible-gill-line",
    );
    this.dartSkull.position.set(0.9, 0, 0);
    this.dartSkull.scale.set(0.76, 0.43, 0.48);
    this.dartSnout = mark(
      new THREE.Mesh(this.dartSnoutGeometry, materials.dart.accent),
      "rift-dart-long-forward-spear-snout",
    );
    this.dartSnout.position.set(1.75, 0.1, 0);
    this.dartJaw = mark(
      new THREE.Mesh(this.dartJawGeometry, materials.dart.accent),
      "rift-dart-articulated-lower-jaw-visible-during-charge",
    );
    this.dartJaw.position.set(1.42, -0.24, 0);
    this.dartFins = prepareInstanced(
      this.finGeometry,
      materials.dart.accent,
      6,
      "rift-dart-paired-pectoral-dorsal-anal-and-forked-caudal-fins",
    );
    this.dartEyes = prepareInstanced(
      this.eyeGeometry,
      materials.dart.luminous,
      2,
      "rift-dart-paired-violet-hunter-eyes",
    );
    this.dartGills = prepareInstanced(
      this.eyeGeometry,
      materials.dart.luminous,
      6,
      "rift-dart-cyan-lateral-gill-marks-not-body-rings",
    );
    this.dart.add(
      this.dartBody,
      this.dartSkull,
      this.dartSnout,
      this.dartJaw,
      this.dartFins,
      this.dartEyes,
      this.dartGills,
    );

    this.wardenShell = mark(
      new THREE.Mesh(this.sphereGeometry, materials.warden.body),
      "grave-warden-heavy-moonbone-plated-carapace",
    );
    this.wardenShell.position.set(-0.25, 0.05, 0);
    this.wardenShell.scale.set(1.52, 0.62, 1.32);
    this.wardenShellPlates = prepareInstanced(
      this.shellPlateGeometry,
      materials.warden.body,
      5,
      "grave-warden-overlapping-eroded-carapace-plates",
    );
    this.wardenAbdomen = prepareInstanced(
      this.sphereGeometry,
      materials.warden.accent,
      4,
      "grave-warden-four-segment-armoured-abdomen",
    );
    this.wardenHead = mark(
      new THREE.Mesh(this.sphereGeometry, materials.warden.accent),
      "grave-warden-forward-crustacean-head-and-mouth",
    );
    this.wardenHead.position.set(1.04, -0.05, 0);
    this.wardenHead.scale.set(0.72, 0.46, 0.76);
    this.wardenLimbs = prepareInstanced(
      this.limbGeometry,
      materials.warden.accent,
      14,
      "grave-warden-articulated-forearms-and-ten-jointed-walking-legs",
    );
    this.wardenClaws = prepareInstanced(
      this.shellPlateGeometry,
      materials.warden.body,
      4,
      "grave-warden-two-opening-moonbone-pincers-with-separate-fingers",
    );
    this.wardenEyes = prepareInstanced(
      this.eyeGeometry,
      materials.warden.luminous,
      2,
      "grave-warden-two-amber-stalk-eyes",
    );
    this.wardenTelson = mark(
      new THREE.Mesh(this.telsonGeometry, materials.warden.accent),
      "grave-warden-trailing-telson-not-a-leviathan-tail",
    );
    this.wardenTelson.position.set(-3.05, -0.05, 0);
    this.wardenCracks = prepareInstanced(
      this.dartJawGeometry,
      materials.warden.luminous,
      3,
      "grave-warden-progressive-glowing-shell-fractures",
    );
    this.warden.add(
      this.wardenShell,
      this.wardenShellPlates,
      this.wardenAbdomen,
      this.wardenHead,
      this.wardenLimbs,
      this.wardenClaws,
      this.wardenEyes,
      this.wardenTelson,
      this.wardenCracks,
    );

    this.sentinelBody = mark(
      new THREE.Mesh(this.sphereGeometry, materials.sentinel.body),
      "maw-sentinel-wide-flattened-ray-body",
    );
    this.sentinelBody.scale.set(1.42, 0.34, 1.18);
    this.sentinelBody.position.x = -0.15;
    this.sentinelHead = mark(
      new THREE.Mesh(this.sphereGeometry, materials.sentinel.accent),
      "maw-sentinel-hammered-ray-head-with-forward-mouth",
    );
    this.sentinelHead.scale.set(0.84, 0.4, 1.08);
    this.sentinelHead.position.x = 1.02;
    this.sentinelNearWing = mark(
      new THREE.Mesh(this.rayWingGeometry, materials.sentinel.accent),
      "maw-sentinel-near-broad-ray-wing",
    );
    this.sentinelFarWing = mark(
      new THREE.Mesh(this.rayWingGeometry, materials.sentinel.body),
      "maw-sentinel-far-broad-ray-wing",
    );
    this.sentinelNearWing.position.z = 0.38;
    this.sentinelFarWing.position.z = -0.38;
    this.sentinelFarWing.scale.z = -1;
    this.sentinelTail = mark(
      new THREE.Mesh(this.rayTailGeometry, materials.sentinel.body),
      "maw-sentinel-straight-whip-tail",
    );
    this.sentinelTail.position.set(-2.62, 0, 0);
    this.sentinelBarb = mark(
      new THREE.Mesh(this.rayBarbGeometry, materials.sentinel.accent),
      "maw-sentinel-terminal-tail-barb",
    );
    this.sentinelBarb.position.set(-4.88, 0, 0);
    this.sentinelEyes = prepareInstanced(
      this.eyeGeometry,
      materials.sentinel.luminous,
      2,
      "maw-sentinel-paired-crimson-ray-eyes",
    );
    this.sentinel.add(
      this.sentinelBody,
      this.sentinelHead,
      this.sentinelNearWing,
      this.sentinelFarWing,
      this.sentinelTail,
      this.sentinelBarb,
      this.sentinelEyes,
    );

    this.group.add(this.dart, this.warden, this.sentinel);
    this.setTier(1);
  }

  private setInstance(
    mesh: THREE.InstancedMesh,
    index: number,
    position: readonly [number, number, number],
    rotation: readonly [number, number, number],
    scale: readonly [number, number, number],
  ): void {
    this.dummy.position.set(...position);
    this.dummy.rotation.set(...rotation);
    this.dummy.scale.set(...scale);
    this.dummy.updateMatrix();
    mesh.setMatrixAt(index, this.dummy.matrix);
  }

  private finish(mesh: THREE.InstancedMesh): void {
    mesh.instanceMatrix.needsUpdate = true;
  }

  setTier(tier: DuskmawMinionTier): void {
    this.tier = tier;
    this.dart.visible = tier === 1;
    this.warden.visible = tier === 2;
    this.sentinel.visible = tier === 3;
    this.group.userData["activeSpecies"] = tier === 1
      ? "rift-dart-needlefish"
      : tier === 2
        ? "grave-warden-armoured-crustacean"
        : "maw-sentinel-abyssal-ray";
  }

  private updateDart(pose: ShadowBroodPose, motion: number, damage: number): void {
    const defeat = THREE.MathUtils.clamp(pose.defeatProgress, 0, 1);
    const hit = THREE.MathUtils.clamp(pose.hitFlash, 0, 1);
    const swim = pose.elapsedSec * 8.4;
    for (let segment = 0; segment < 5; segment += 1) {
      const fraction = segment / 4;
      const scatter = defeat * (0.12 + segment * 0.12);
      this.setInstance(
        this.dartBody,
        segment,
        [0.5 - segment * 0.43, Math.sin(swim - segment * 0.72) * 0.055 * motion + scatter * (segment % 2 ? 1 : -1), Math.sin(swim - segment * 0.82) * 0.12 * motion + scatter],
        [0, Math.sin(swim - segment * 0.7) * 0.05 * motion + defeat * segment * 0.08, Math.cos(swim - segment * 0.8) * 0.035 * motion],
        [0.55 - fraction * 0.12, 0.37 - fraction * 0.08, 0.43 - fraction * 0.08],
      );
    }
    this.finish(this.dartBody);

    const recoil = hit * 0.22 + defeat * 0.34;
    this.dartSkull.position.set(0.9 - recoil, hit * 0.08, 0);
    this.dartSkull.rotation.z = -hit * 0.14 + defeat * 0.24;
    this.dartSnout.position.set(1.75 - recoil, 0.1 + hit * 0.08, 0);
    this.dartSnout.rotation.z = defeat * 0.18;
    const jawOpen = pose.attackCharge * 0.28;
    this.dartJaw.position.set(1.42 - recoil, -0.24 - jawOpen * 0.42, 0);
    this.dartJaw.rotation.z = -jawOpen - defeat * 0.22;

    const tailBeat = Math.sin(swim - 2.4) * 0.28 * motion;
    const finData: Array<readonly [number, number, number, number, number, number, number, number, number]> = [
      [0.05, -0.02, 0.48, Math.PI / 2, 0.14, -0.08, 0.58, 0.56, 0.48],
      [0.05, -0.02, -0.48, -Math.PI / 2, -0.14, 0.08, 0.58, 0.56, 0.48],
      [-0.42, 0.42, 0, 0, 0, 0.08, 0.72, 0.55, 0.52],
      [-0.48, -0.36, 0, Math.PI, 0, -0.08, 0.62, 0.48, 0.48],
      [-1.62, 0.25, tailBeat * 0.45, 0, tailBeat, -0.72, 0.84, 0.72, 0.6],
      [-1.62, -0.25, -tailBeat * 0.45, Math.PI, -tailBeat, 0.72, 0.84, 0.72, 0.6],
    ];
    for (let index = 0; index < finData.length; index += 1) {
      const [x, y, z, rx, ry, rz, sx, sy, sz] = finData[index]!;
      const burst = defeat * (index - 2.5) * 0.18;
      this.setInstance(
        this.dartFins,
        index,
        [x - defeat * 0.2, y + Math.abs(burst), z + burst],
        [rx + defeat * 0.4, ry + defeat * 0.35, rz + defeat * (index % 2 ? -0.7 : 0.7)],
        [sx * (1 - defeat * 0.22), sy * (1 - defeat * 0.22), sz],
      );
    }
    this.finish(this.dartFins);

    for (let side = 0; side < 2; side += 1) {
      const sign = side === 0 ? 1 : -1;
      this.setInstance(this.dartEyes, side, [1.08 - recoil, 0.2, sign * 0.37], [0, 0, 0], [0.13, 0.13, 0.09]);
    }
    this.finish(this.dartEyes);
    for (let markIndex = 0; markIndex < 6; markIndex += 1) {
      const side = markIndex < 3 ? 1 : -1;
      const row = markIndex % 3;
      this.setInstance(
        this.dartGills,
        markIndex,
        [0.58 - row * 0.22 - recoil, 0.05 + row * 0.02, side * (0.39 - row * 0.015)],
        [0, 0, side * 0.28],
        [0.045 + damage * 0.018, 0.13, 0.035],
      );
    }
    this.finish(this.dartGills);
    this.dart.rotation.set(0, -hit * 0.08, Math.sin(swim) * 0.045 * motion + defeat * 0.8);
  }

  private updateWarden(pose: ShadowBroodPose, motion: number, damage: number): void {
    const defeat = THREE.MathUtils.clamp(pose.defeatProgress, 0, 1);
    const hit = THREE.MathUtils.clamp(pose.hitFlash, 0, 1);
    const walk = pose.elapsedSec * 2.65;
    const rupture = smootherStep((damage - 0.42) / 0.58);
    this.wardenShell.position.set(-0.25 - hit * 0.12, 0.05 + hit * 0.08, 0);
    this.wardenShell.rotation.set(defeat * 0.28, -hit * 0.08, defeat * 0.62);
    this.wardenShell.scale.set(
      1.52 * (1 - defeat * 0.16),
      0.62 * (1 - rupture * 0.08),
      1.32 * (1 + rupture * 0.04),
    );

    const plateData: Array<readonly [number, number, number, number, number, number]> = [
      [-0.1, 0.55, 0, 0.58, 0.22, 0.62],
      [-0.58, 0.42, 0.68, 0.48, 0.19, 0.5],
      [-0.58, 0.42, -0.68, 0.48, 0.19, 0.5],
      [0.58, 0.35, 0.72, 0.42, 0.17, 0.46],
      [0.58, 0.35, -0.72, 0.42, 0.17, 0.46],
    ];
    for (let index = 0; index < plateData.length; index += 1) {
      const [x, y, z, sx, sy, sz] = plateData[index]!;
      const scatter = defeat * (0.45 + index * 0.13);
      const side = z === 0 ? (index % 2 ? -1 : 1) : Math.sign(z);
      this.setInstance(
        this.wardenShellPlates,
        index,
        [x - scatter * 0.2, y + scatter * (0.5 + index * 0.08), z + side * scatter],
        [defeat * (0.4 + index * 0.12), index * 0.48, side * defeat * 0.72],
        [sx * (1 - defeat * 0.18), sy, sz * (1 - defeat * 0.18)],
      );
    }
    this.finish(this.wardenShellPlates);

    for (let segment = 0; segment < 4; segment += 1) {
      const fraction = segment / 3;
      this.setInstance(
        this.wardenAbdomen,
        segment,
        [-1.24 - segment * 0.46, -0.02 + Math.sin(walk - segment * 0.4) * 0.035 * motion + defeat * segment * 0.2, 0],
        [0, defeat * segment * 0.15, defeat * (segment - 1.5) * 0.2],
        [0.52 - fraction * 0.12, 0.36 - fraction * 0.04, 0.76 - fraction * 0.16],
      );
    }
    this.finish(this.wardenAbdomen);

    this.wardenHead.position.set(1.04 - hit * 0.16, -0.05, 0);
    this.wardenHead.rotation.z = -hit * 0.12 + defeat * 0.3;
    this.wardenHead.scale.set(0.72, 0.46 - pose.attackCharge * 0.035, 0.76 + pose.attackCharge * 0.06);

    for (let index = 0; index < 14; index += 1) {
      const side = index % 2 === 0 ? 1 : -1;
      if (index < 4) {
        const armRow = Math.floor(index / 2);
        const open = pose.attackCharge * (0.24 + armRow * 0.08);
        this.setInstance(
          this.wardenLimbs,
          index,
          [0.65 - armRow * 0.32, -0.18, side * (0.92 + armRow * 0.33 + open)],
          [side * (0.12 + open), 0, side * (-1.12 + armRow * 0.16 + defeat * 0.62)],
          [1.04 + armRow * 0.18, 1.02, 1.04],
        );
      } else {
        const leg = index - 4;
        const row = Math.floor(leg / 2);
        const gait = Math.sin(walk + row * 0.72 + (side > 0 ? 0 : Math.PI)) * 0.18 * motion;
        this.setInstance(
          this.wardenLimbs,
          index,
          [0.38 - row * 0.48, -0.48 - defeat * row * 0.05, side * (0.82 + row * 0.1 + defeat * 0.18 * row)],
          [side * (0.2 + gait + defeat * 0.42), 0, side * (0.62 - row * 0.055 + defeat * 0.38)],
          [0.9 + row * 0.06, 0.92 + row * 0.08, 0.9],
        );
      }
    }
    this.finish(this.wardenLimbs);

    for (let index = 0; index < 4; index += 1) {
      const side = index < 2 ? 1 : -1;
      const finger = index % 2;
      const open = 0.14 + pose.attackCharge * 0.34;
      this.setInstance(
        this.wardenClaws,
        index,
        [1.25 - hit * 0.08, -0.08 + finger * 0.22, side * (1.28 + (finger ? open : -open * 0.18) + defeat * 0.62)],
        [finger ? 0.18 : -0.18, side * (finger ? -0.28 : 0.2), side * (finger ? 0.42 : -0.22) + defeat * side * 0.8],
        [0.54 + (side < 0 ? 0.08 : 0), 0.25, 0.34],
      );
    }
    this.finish(this.wardenClaws);

    for (let side = 0; side < 2; side += 1) {
      const sign = side === 0 ? 1 : -1;
      this.setInstance(this.wardenEyes, side, [1.34 - hit * 0.14, 0.32, sign * 0.46], [0, 0, 0], [0.16, 0.16, 0.12]);
    }
    this.finish(this.wardenEyes);
    this.wardenTelson.position.set(-3.05, -0.05 + defeat * 0.4, 0);
    this.wardenTelson.rotation.set(0, defeat * 0.7, defeat * 0.5);

    const crackCount = damage > 0.15 ? Math.min(3, Math.ceil(damage * 3)) : 0;
    this.wardenCracks.count = crackCount;
    for (let crack = 0; crack < crackCount; crack += 1) {
      this.setInstance(
        this.wardenCracks,
        crack,
        [-0.55 + crack * 0.52, 0.58 + crack * 0.025, (crack - 1) * 0.42],
        [Math.PI / 2, crack * 0.5, 0.2 - crack * 0.18],
        [0.52 + damage * 0.2, 0.045, 0.05],
      );
    }
    this.finish(this.wardenCracks);
    this.warden.rotation.set(0, Math.sin(walk * 0.45) * 0.045 * motion, -Math.sin(walk * 0.6) * 0.028 * motion + defeat * 0.38);
  }

  update(pose: ShadowBroodPose): void {
    this.setTier(pose.tier);
    const motion = pose.reducedMotion ? 0 : 1;
    const damage = THREE.MathUtils.clamp(pose.damageFraction, 0, 1);
    if (pose.tier === 1) this.updateDart(pose, motion, damage);
    if (pose.tier === 2) this.updateWarden(pose, motion, damage);

    const defeat = THREE.MathUtils.clamp(pose.defeatProgress, 0, 1);
    const hit = THREE.MathUtils.clamp(pose.hitFlash, 0, 1);
    const wingBeat = Math.sin(pose.elapsedSec * 2.15) * 0.22 * motion;
    this.sentinelNearWing.rotation.x = wingBeat - defeat * 0.72;
    this.sentinelFarWing.rotation.x = -wingBeat + defeat * 0.72;
    this.sentinel.rotation.set(hit * 0.08, -hit * 0.1, Math.sin(pose.elapsedSec * 0.82) * 0.055 * motion + defeat * 0.66);
    this.sentinelHead.position.x = 1.02 - hit * 0.18;
    this.sentinelHead.scale.set(
      0.84 + pose.attackCharge * 0.09,
      0.4 + pose.attackCharge * 0.04,
      1.08 + pose.attackCharge * 0.06,
    );
    this.sentinelBody.scale.set(1.42 - damage * 0.14, 0.34, 1.18 - damage * 0.1);
  }

  mouthWorldPosition(target = new THREE.Vector3()): THREE.Vector3 {
    const local = this.tier === 1
      ? new THREE.Vector3(2.22, -0.18, 0)
      : this.tier === 2
        ? new THREE.Vector3(1.62, -0.16, 0)
        : new THREE.Vector3(1.74, -0.16, 0);
    this.group.updateWorldMatrix(true, false);
    return target.copy(local).applyMatrix4(this.group.matrixWorld);
  }

  headWorldPosition(target = new THREE.Vector3()): THREE.Vector3 {
    const local = this.tier === 1
      ? new THREE.Vector3(1.18, 0.04, 0)
      : this.tier === 2
        ? new THREE.Vector3(0.88, 0.08, 0)
        : new THREE.Vector3(1.02, 0.02, 0);
    this.group.updateWorldMatrix(true, false);
    return target.copy(local).applyMatrix4(this.group.matrixWorld);
  }

  drawCalls(): number {
    return 9;
  }

  triangleBudget(): number {
    return Math.ceil(
      triangles(this.sphereGeometry) * 16 +
      triangles(this.eyeGeometry) * 12 +
      triangles(this.dartSnoutGeometry) +
      triangles(this.dartJawGeometry) * 4 +
      triangles(this.finGeometry) * 6 +
      triangles(this.shellPlateGeometry) * 9 +
      triangles(this.limbGeometry) * 14 +
      triangles(this.telsonGeometry) +
      triangles(this.rayWingGeometry) * 2 +
      triangles(this.rayTailGeometry) +
      triangles(this.rayBarbGeometry)
    );
  }

  dispose(): void {
    this.sphereGeometry.dispose();
    this.eyeGeometry.dispose();
    this.dartSnoutGeometry.dispose();
    this.dartJawGeometry.dispose();
    this.finGeometry.dispose();
    this.shellPlateGeometry.dispose();
    this.limbGeometry.dispose();
    this.telsonGeometry.dispose();
    this.rayWingGeometry.dispose();
    this.rayTailGeometry.dispose();
    this.rayBarbGeometry.dispose();
  }
}

function smootherStep(value: number): number {
  const t = THREE.MathUtils.clamp(value, 0, 1);
  return t * t * t * (t * (t * 6 - 15) + 10);
}
