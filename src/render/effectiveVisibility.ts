import type * as THREE from "three";

/**
 * Three.js leaves child `visible` flags untouched when a parent group is
 * hidden. Art-budget instrumentation must therefore evaluate the complete
 * ancestor chain instead of counting hidden-realm child materials as active.
 */
export function isEffectivelyVisible(object: THREE.Object3D): boolean {
  let current: THREE.Object3D | null = object;
  while (current) {
    if (!current.visible) return false;
    current = current.parent;
  }
  return true;
}
