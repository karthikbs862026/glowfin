import * as THREE from "three";

import {
  LUMEN_MOTE_POOL_SIZE,
  type LumenMotePresentation,
} from "../expedition/lumenMotes";

const TINY_SCALE = 0.0001;

export class LumenMoteField {
  readonly mesh: THREE.InstancedMesh;
  private readonly geometry = new THREE.OctahedronGeometry(0.42, 0);
  private readonly matrix = new THREE.Matrix4();
  private readonly quaternion = new THREE.Quaternion();
  private readonly position = new THREE.Vector3();
  private readonly scale = new THREE.Vector3();
  private readonly colour = new THREE.Color();
  private readonly rotation = new THREE.Euler();

  constructor(material: THREE.MeshBasicMaterial) {
    this.mesh = new THREE.InstancedMesh(
      this.geometry,
      material,
      LUMEN_MOTE_POOL_SIZE,
    );
    this.mesh.count = 0;
    this.mesh.visible = false;
    this.mesh.frustumCulled = false;
    this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.mesh.userData["hideInArtMask"] = true;
    this.mesh.userData["lumenMotes"] = true;
  }

  update(
    motes: readonly LumenMotePresentation[],
    elapsedSec: number,
    chainIntensity: number,
    reducedMotion: boolean,
  ): void {
    this.mesh.visible = motes.length > 0;
    this.mesh.count = Math.min(motes.length, LUMEN_MOTE_POOL_SIZE);
    if (this.mesh.count < 1) return;

    const motionScale = reducedMotion ? 0 : 1;
    const chainScale = 1 + Math.max(0, Math.min(1, chainIntensity)) * 0.16;
    for (let slot = 0; slot < this.mesh.count; slot += 1) {
      const mote = motes[slot];
      if (!mote) continue;
      const pulse = mote.visible
        ? 1 + Math.sin(elapsedSec * 4.1 * motionScale + mote.sequence * 0.72) *
          0.11 * motionScale
        : TINY_SCALE;
      const size = mote.visible ? pulse * chainScale : TINY_SCALE;
      this.position.set(mote.lateral, mote.height, -mote.distance);
      this.rotation.set(
        elapsedSec * 0.8 * motionScale,
        elapsedSec * 1.1 * motionScale + mote.sequence * 0.31,
        mote.sequence * 0.17,
      );
      this.quaternion.setFromEuler(this.rotation);
      this.scale.setScalar(size);
      this.matrix.compose(this.position, this.quaternion, this.scale);
      this.mesh.setMatrixAt(slot, this.matrix);
      this.mesh.setColorAt(
        slot,
        this.colour.setHSL(
          0.105 + (mote.sequence % 4) * 0.008,
          1,
          0.43 + chainIntensity * 0.05,
        ),
      );
    }
    this.mesh.instanceMatrix.needsUpdate = true;
    if (this.mesh.instanceColor) this.mesh.instanceColor.needsUpdate = true;
  }

  triangleBudget(): number {
    const count = this.geometry.getIndex()?.count ??
      this.geometry.getAttribute("position").count;
    return Math.ceil(count / 3) * LUMEN_MOTE_POOL_SIZE;
  }

  dispose(): void {
    this.geometry.dispose();
  }
}
