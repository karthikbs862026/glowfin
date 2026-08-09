import * as THREE from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";

import type {
  R5ActorPresentation,
  R5CompletionPresentation,
} from "../expedition/r5Completion";

const TINY_SCALE = 0.0001;
const LIVING_ROLE = 5;

function triangleCount(geometry: THREE.BufferGeometry): number {
  const count = geometry.getIndex()?.count ??
    geometry.getAttribute("position").count;
  return Math.ceil(count / 3);
}

function livingGeometry(
  source: THREE.BufferGeometry,
  colour: THREE.ColorRepresentation,
  glowWeight: number,
  swayFromZ = false,
): THREE.BufferGeometry {
  const geometry = source.index ? source.toNonIndexed() : source.clone();
  source.dispose();
  for (const attribute of Object.keys(geometry.attributes)) {
    if (attribute !== "position" && attribute !== "normal") {
      geometry.deleteAttribute(attribute);
    }
  }
  geometry.computeVertexNormals();
  const positions = geometry.getAttribute("position");
  const base = new THREE.Color(colour);
  const midnight = new THREE.Color(0x08091e);
  const colours = new Float32Array(positions.count * 3);
  const glow = new Uint8Array(positions.count);
  const sway = new Uint8Array(positions.count);
  const roles = new Uint8Array(positions.count);
  const point = new THREE.Vector3();
  for (let index = 0; index < positions.count; index += 1) {
    point.fromBufferAttribute(positions, index);
    const depth = Math.max(0, Math.min(1, (point.z + 3.2) / 6.4));
    const paint = midnight.clone().lerp(base, 0.42 + depth * 0.44);
    colours[index * 3] = paint.r;
    colours[index * 3 + 1] = paint.g;
    colours[index * 3 + 2] = paint.b;
    glow[index] = Math.round(Math.max(0, Math.min(1, glowWeight + depth * 0.18)) * 255);
    sway[index] = Math.round((swayFromZ ? depth : 0.12) * 255);
    roles[index] = LIVING_ROLE;
  }
  geometry.setAttribute("color", new THREE.Float32BufferAttribute(colours, 3));
  geometry.setAttribute("glowWeight", new THREE.Uint8BufferAttribute(glow, 1, true));
  geometry.setAttribute("swayWeight", new THREE.Uint8BufferAttribute(sway, 1, true));
  geometry.setAttribute("materialRole", new THREE.Uint8BufferAttribute(roles, 1, false));
  return geometry;
}

function createDuskmawGeometry(): THREE.BufferGeometry {
  const path = new THREE.CatmullRomCurve3([
    new THREE.Vector3(0, 0.08, -3.1),
    new THREE.Vector3(-0.28, 0.18, -2.2),
    new THREE.Vector3(0.26, -0.1, -1.15),
    new THREE.Vector3(-0.18, 0.04, 0),
    new THREE.Vector3(0.15, 0.02, 1.15),
    new THREE.Vector3(0, 0.08, 2.25),
    new THREE.Vector3(0, 0, 3.05),
  ]);
  const body = livingGeometry(
    new THREE.TubeGeometry(path, 36, 0.52, 10, false),
    0x4d2b78,
    0.24,
    true,
  );
  const head = livingGeometry(
    new THREE.SphereGeometry(1, 14, 9).scale(0.72, 0.52, 0.9)
      .translate(0, 0.1, -3.05),
    0x3b235f,
    0.3,
  );
  const finLeft = livingGeometry(
    new THREE.ConeGeometry(0.75, 1.6, 5)
      .rotateZ(Math.PI * 0.42)
      .rotateX(Math.PI * 0.5)
      .scale(0.18, 0.72, 0.9)
      .translate(-0.64, 0.08, -1.25),
    0x7250a6,
    0.4,
    true,
  );
  const finRight = livingGeometry(
    new THREE.ConeGeometry(0.75, 1.6, 5)
      .rotateZ(-Math.PI * 0.42)
      .rotateX(Math.PI * 0.5)
      .scale(0.18, 0.72, 0.9)
      .translate(0.64, 0.08, -1.25),
    0x7250a6,
    0.4,
    true,
  );
  const tailLeft = livingGeometry(
    new THREE.ConeGeometry(0.8, 1.4, 5)
      .rotateX(Math.PI * 0.5)
      .rotateZ(Math.PI * 0.2)
      .scale(0.5, 0.1, 0.9)
      .translate(-0.32, 0, 3.15),
    0x57357e,
    0.35,
    true,
  );
  const tailRight = livingGeometry(
    new THREE.ConeGeometry(0.8, 1.4, 5)
      .rotateX(Math.PI * 0.5)
      .rotateZ(-Math.PI * 0.2)
      .scale(0.5, 0.1, 0.9)
      .translate(0.32, 0, 3.15),
    0x57357e,
    0.35,
    true,
  );
  const merged = mergeGeometries([
    body,
    head,
    finLeft,
    finRight,
    tailLeft,
    tailRight,
  ], false);
  for (const part of [body, head, finLeft, finRight, tailLeft, tailRight]) {
    part.dispose();
  }
  if (!merged) throw new Error("Duskmaw geometry could not be merged.");
  merged.computeVertexNormals();
  merged.computeBoundingBox();
  merged.computeBoundingSphere();
  return merged;
}

export class R5CompletionField {
  readonly group = new THREE.Group();
  readonly targets: THREE.InstancedMesh;
  readonly moonseed: THREE.InstancedMesh;
  readonly duskmaw: THREE.InstancedMesh;
  private readonly targetGeometry = new THREE.TorusGeometry(1, 0.13, 6, 26);
  private readonly moonseedGeometry = new THREE.IcosahedronGeometry(0.75, 1);
  private readonly duskmawGeometry = createDuskmawGeometry();
  private readonly matrix = new THREE.Matrix4();
  private readonly position = new THREE.Vector3();
  private readonly scale = new THREE.Vector3();
  private readonly quaternion = new THREE.Quaternion();
  private readonly rotation = new THREE.Euler();
  private readonly colour = new THREE.Color();

  constructor(
    routeMaterial: THREE.MeshBasicMaterial,
    livingMaterial: THREE.Material,
  ) {
    this.targets = new THREE.InstancedMesh(this.targetGeometry, routeMaterial, 2);
    this.moonseed = new THREE.InstancedMesh(this.moonseedGeometry, routeMaterial, 1);
    this.duskmaw = new THREE.InstancedMesh(this.duskmawGeometry, livingMaterial, 1);
    this.group.add(this.targets, this.moonseed, this.duskmaw);
    this.group.visible = false;
    for (const [role, mesh] of [
      ["targets", this.targets],
      ["moonseed", this.moonseed],
      ["duskmaw", this.duskmaw],
    ] as const) {
      mesh.frustumCulled = false;
      mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      mesh.userData["hideInArtMask"] = true;
      mesh.userData["nonCollidable"] = true;
      mesh.userData["r5CompletionRole"] = role;
    }
  }

  update(
    presentation: Readonly<R5CompletionPresentation> | null,
    elapsedSec: number,
    reducedMotion: boolean,
  ): void {
    this.group.visible = Boolean(presentation?.active);
    if (!presentation?.active) {
      this.targets.count = 0;
      this.targets.visible = false;
      this.moonseed.visible = false;
      this.duskmaw.visible = false;
      return;
    }

    let slot = 0;
    for (const item of presentation.targets) {
      if (!item.visible || slot >= 2) continue;
      const pulse = reducedMotion
        ? 1
        : 1 + Math.sin(elapsedSec * 3.4 + slot * 1.3) * 0.06;
      this.position.set(item.lateral, 0.42, -item.distance);
      this.rotation.set(0, 0, reducedMotion ? 0 : elapsedSec * 0.24);
      this.quaternion.setFromEuler(this.rotation);
      this.scale.setScalar(item.radius * pulse);
      this.matrix.compose(this.position, this.quaternion, this.scale);
      this.targets.setMatrixAt(slot, this.matrix);
      this.targets.setColorAt(slot, this.colour.set(item.colour));
      slot += 1;
    }
    this.targets.count = slot;
    this.targets.visible = slot > 0;
    if (slot > 0) {
      this.targets.instanceMatrix.needsUpdate = true;
      if (this.targets.instanceColor) this.targets.instanceColor.needsUpdate = true;
    }

    this.updateActor(
      this.moonseed,
      presentation.moonseed,
      elapsedSec,
      reducedMotion,
      "moonseed",
    );
    this.updateActor(
      this.duskmaw,
      presentation.duskmaw,
      elapsedSec,
      reducedMotion,
      "duskmaw",
    );
  }

  triangleBudget(): number {
    return triangleCount(this.targetGeometry) * 2 +
      triangleCount(this.moonseedGeometry) +
      triangleCount(this.duskmawGeometry);
  }

  additionalDrawCalls(): number {
    return 3;
  }

  dispose(): void {
    this.targetGeometry.dispose();
    this.moonseedGeometry.dispose();
    this.duskmawGeometry.dispose();
  }

  private updateActor(
    mesh: THREE.InstancedMesh,
    actor: R5ActorPresentation,
    elapsedSec: number,
    reducedMotion: boolean,
    role: "moonseed" | "duskmaw",
  ): void {
    mesh.visible = actor.visible;
    mesh.count = actor.visible ? 1 : 0;
    if (!actor.visible) return;
    const motion = reducedMotion ? 0 : 1;
    const bob = Math.sin(elapsedSec * (role === "duskmaw" ? 1.2 : 2.8)) *
      (role === "duskmaw" ? 0.18 : 0.1) * motion;
    this.position.set(actor.lateral, actor.height + bob, -actor.distance);
    if (role === "duskmaw") {
      this.rotation.set(
        Math.sin(elapsedSec * 0.8) * 0.04 * motion,
        Math.sin(elapsedSec * 0.7) * 0.16 * motion,
        Math.sin(elapsedSec * 1.15) * 0.08 * motion,
      );
    } else {
      this.rotation.set(
        elapsedSec * 0.45 * motion,
        elapsedSec * 0.9 * motion,
        0,
      );
    }
    this.quaternion.setFromEuler(this.rotation);
    const pulse = role === "moonseed" && !reducedMotion
      ? 1 + Math.sin(elapsedSec * 3.6) * 0.09
      : 1;
    this.scale.setScalar(Math.max(TINY_SCALE, actor.scale * pulse));
    this.matrix.compose(this.position, this.quaternion, this.scale);
    mesh.setMatrixAt(0, this.matrix);
    mesh.setColorAt(0, this.colour.set(actor.colour));
    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
  }
}
