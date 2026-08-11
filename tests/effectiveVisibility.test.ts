import * as THREE from "three";
import { describe, expect, it } from "vitest";
import { isEffectivelyVisible } from "../src/render/effectiveVisibility";

describe("effective scene visibility", () => {
  it("excludes a visible mesh when its realm group is hidden", () => {
    const scene = new THREE.Scene();
    const realm = new THREE.Group();
    const mesh = new THREE.Mesh(
      new THREE.BoxGeometry(1, 1, 1),
      new THREE.MeshBasicMaterial(),
    );
    scene.add(realm);
    realm.add(mesh);

    expect(isEffectivelyVisible(mesh)).toBe(true);
    realm.visible = false;
    expect(mesh.visible).toBe(true);
    expect(isEffectivelyVisible(mesh)).toBe(false);
    realm.visible = true;
    expect(isEffectivelyVisible(mesh)).toBe(true);

    mesh.geometry.dispose();
    (mesh.material as THREE.Material).dispose();
  });
});
