import { describe, expect, it } from "vitest";
import * as THREE from "three";
import {
  guardianRoleForGateFamily,
  MERFOLK_CHARACTER_CONTRACT,
  MERFOLK_ANIMATION,
  MERFOLK_CITY_CONTRACT,
  MERFOLK_GUARDIAN_ROLES
} from "../src/art/merfolkCharacter";
import { PRODUCTION_ART } from "../src/art/productionManifest";
import { HeroMerfolkGuardian } from "../src/render/merfolkGuardian";

function createRig(): {
  rig: HeroMerfolkGuardian;
  material: THREE.MeshBasicMaterial;
} {
  const material = new THREE.MeshBasicMaterial({ vertexColors: true });
  return {
    rig: new HeroMerfolkGuardian(material, 6),
    material
  };
}

describe("Phase 3B hero merfolk guardian", () => {
  it("contains every phone-readable character part in one material budget", () => {
    const { rig, material } = createRig();
    const declared = rig.object.userData["characterParts"] as string[];
    expect(declared).toEqual([
      ...MERFOLK_CHARACTER_CONTRACT.requiredParts
    ]);
    for (const part of MERFOLK_CHARACTER_CONTRACT.requiredParts) {
      if (part === "readable-hands") {
        expect(rig.object.getObjectByName("left-hand")).toBeDefined();
        expect(rig.object.getObjectByName("right-hand")).toBeDefined();
        continue;
      }
      expect(rig.object.getObjectByName(part)).toBeDefined();
    }

    const materials = new Set<THREE.Material>();
    rig.object.traverse((object) => {
      if (object instanceof THREE.Mesh) materials.add(object.material);
    });
    expect(materials.size).toBeLessThanOrEqual(
      MERFOLK_CHARACTER_CONTRACT.maxMaterials
    );
    expect(rig.drawCount).toBeLessThanOrEqual(
      MERFOLK_CHARACTER_CONTRACT.maxDraws
    );
    expect(rig.triangleCount).toBeGreaterThanOrEqual(
      MERFOLK_CHARACTER_CONTRACT.triangleRange[0]
    );
    expect(rig.triangleCount).toBeLessThanOrEqual(
      MERFOLK_CHARACTER_CONTRACT.triangleRange[1]
    );
    expect(rig.triangleCount).toBe(
      PRODUCTION_ART.heroMerfolkGuardian.lod0
    );
    expect(rig.drawCount).toBe(PRODUCTION_ART.heroMerfolkGuardian.draws);
    rig.dispose();
    material.dispose();
  });

  it("stages the hero outside collider truth at a readable world height", () => {
    const { rig, material } = createRig();
    rig.update(0, 1.1, 0.35, { anchor: 38, side: 1 });
    rig.object.updateMatrixWorld(true);
    const bounds = new THREE.Box3().setFromObject(rig.object);
    const innerEdge = Math.min(Math.abs(bounds.min.x), Math.abs(bounds.max.x));
    expect(innerEdge).toBeGreaterThanOrEqual(
      6 + MERFOLK_CHARACTER_CONTRACT.safeLaneMarginUnits
    );
    expect(bounds.max.y - bounds.min.y).toBeGreaterThanOrEqual(
      MERFOLK_CHARACTER_CONTRACT.minimumWorldHeight
    );
    const camera = new THREE.PerspectiveCamera(53, 390 / 844, 0.1, 400);
    camera.position.set(0, 3.7, 11);
    camera.lookAt(0, 1.18, -23);
    camera.updateMatrixWorld(true);
    expect(rig.screenHeightPixels(camera, 844)).toBeGreaterThanOrEqual(
      MERFOLK_CHARACTER_CONTRACT.minimumReadableHeightPixels
    );
    expect(rig.faceHeightPixels(camera, 844)).toBeGreaterThanOrEqual(
      MERFOLK_CHARACTER_CONTRACT.minimumFaceHeightPixels
    );
    expect(rig.eyeDiameterPixels(camera, 844)).toBeGreaterThanOrEqual(
      MERFOLK_CHARACTER_CONTRACT.minimumEyeDiameterPixels
    );
    expect(rig.object.userData["nonCollidable"]).toBe(true);
    rig.dispose();
    material.dispose();
  });

  it("drives greeting, hair and tail joints from deterministic simulation time", () => {
    const { rig, material } = createRig();
    expect(rig.animationDriver).toBe(MERFOLK_ANIMATION.driver);
    expect(rig.animationClips).toEqual(MERFOLK_ANIMATION.clips);

    rig.update(0, 0.2, 0.1);
    const armA = rig.object.getObjectByName("articulated-arms")
      ?.getObjectByName("left-hand")?.parent?.rotation.z;
    const tailA = rig.object.getObjectByName("scaled-tail")?.rotation.z;
    const hairA = rig.object.getObjectByName("flowing-hair")
      ?.getObjectByName("hair-ribbon-left")?.parent?.rotation.z;

    rig.update(0, 1.9, 0.1);
    const armB = rig.object.getObjectByName("articulated-arms")
      ?.getObjectByName("left-hand")?.parent?.rotation.z;
    const tailB = rig.object.getObjectByName("scaled-tail")?.rotation.z;
    const hairB = rig.object.getObjectByName("flowing-hair")
      ?.getObjectByName("hair-ribbon-left")?.parent?.rotation.z;

    expect(armA).not.toBe(armB);
    expect(tailA).not.toBe(tailB);
    expect(hairA).not.toBe(hairB);
    rig.dispose();
    material.dispose();
  });

  it("maps all five districts to three distinct guardian identities", () => {
    expect(Array.from({ length: 5 }, (_, family) =>
      guardianRoleForGateFamily(family)
    )).toEqual([
      "tidekeeper",
      "astral-oracle",
      "coral-warden",
      "tidekeeper",
      "astral-oracle"
    ]);
    expect(MERFOLK_GUARDIAN_ROLES.map((role) => role.key)).toEqual(
      MERFOLK_CITY_CONTRACT.guardianRoles
    );
  });

  it("switches district regalia without multiplying hero draw calls", () => {
    const { rig, material } = createRig();
    const geometryIds = new Set<string>();
    for (const role of MERFOLK_GUARDIAN_ROLES) {
      rig.update(0, 0.8, 0.25, {
        anchor: 38,
        side: 1,
        role: role.key
      });
      expect(rig.activeRole).toBe(role.key);
      expect(rig.object.userData["castRole"]).toBe(role.key);
      const regalia = rig.object.getObjectByName("district-regalia");
      expect(regalia).toBeInstanceOf(THREE.Mesh);
      if (regalia instanceof THREE.Mesh) {
        expect(regalia.geometry.userData["castRole"]).toBe(role.key);
        geometryIds.add(regalia.geometry.uuid);
      }
      expect(rig.drawCount).toBeLessThanOrEqual(
        MERFOLK_CHARACTER_CONTRACT.maxDraws
      );
    }
    expect(geometryIds.size).toBe(MERFOLK_GUARDIAN_ROLES.length);
    rig.dispose();
    material.dispose();
  });
});
