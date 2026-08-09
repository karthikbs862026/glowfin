import * as THREE from "three";

import {
  TIDE_SPRINT_CHARACTER_IDS,
  type TideSprintCharacterId,
} from "./crew";
import {
  createTideSprintCharacterRig,
  type TideSprintCharacterRig,
} from "./characters";
import {
  TIDE_SPRINT_FINISH_UNITS,
  TIDE_SPRINT_CURRENT_RINGS,
  TIDE_SPRINT_OBSTACLES,
  tideSprintCurrentCenter,
  tideSprintCurrentRadius,
  tideSprintSectionAtDistance,
  type TideSprintSection,
} from "./course";
import type { CleanTideSprintSnapshot } from "./director";

interface RacerVisual {
  wrapper: THREE.Group;
  rig: TideSprintCharacterRig;
  startX: number;
  startZ: number;
}

const PLAYER_WORLD_Z = 3.15;
const DISTANCE_TO_WORLD_Z = 0.115;
export const TIDE_SPRINT_GUIDE_GAPS = Object.freeze([
  5, 11, 18, 27, 38, 52, 70, 92, 118, 150, 188, 232, 282, 340,
] as const);
const GATE_COUNT = TIDE_SPRINT_GUIDE_GAPS.length;
const RIBBON_COUNT = 74;
const RIBBON_SPACING = 12;
const CHEVRON_COUNT = 38;
const CHEVRON_SPACING = 8;
const CURRENT_BANK_COUNT = RIBBON_COUNT * 2;
const BOOST_STREAK_COUNT = 10;
const SIDE_REEF_COUNT = 48;
const SIDE_REEF_COLOURS = [0x1f9f9f, 0x8b4fa7, 0xd95f86, 0x3979a8] as const;
const START_GRID_BLEND_SEC = 1.8;
const WORLD_UP = new THREE.Vector3(0, 1, 0);
const RING_FORWARD = new THREE.Vector3(0, 0, 1);
const FLAT_PLANE = new THREE.Quaternion().setFromAxisAngle(
  new THREE.Vector3(1, 0, 0),
  -Math.PI / 2,
);
const READABLE_GUIDE_PLANE = new THREE.Quaternion().setFromAxisAngle(
  new THREE.Vector3(1, 0, 0),
  -1.19,
);

export const TIDE_SPRINT_START_SLOTS = Object.freeze({
  player: Object.freeze({ x: 0, z: PLAYER_WORLD_Z }),
  "named-rival": Object.freeze({ x: -3.2, z: -0.35 }),
  "verified-echo": Object.freeze({ x: 0, z: -3.9 }),
  "moon-echo": Object.freeze({ x: 3.2, z: -0.35 }),
});

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.max(minimum, Math.min(maximum, value));
}

function smoothstep(value: number): number {
  const bounded = clamp(value, 0, 1);
  return bounded * bounded * (3 - 2 * bounded);
}

function sectionColour(section: TideSprintSection): number {
  if (section === "relic-current") return 0xff76b4;
  if (section === "final-moonflash") return 0xffdb78;
  return 0x59eaff;
}

function sectionCoreColour(section: TideSprintSection): number {
  if (section === "relic-current") return 0xffc0e1;
  if (section === "final-moonflash") return 0xfff2ae;
  return 0xbdf8ff;
}

function currentYaw(distance: number): number {
  const sample = 8;
  const before = tideSprintCurrentCenter(Math.max(0, distance - sample));
  const after = tideSprintCurrentCenter(Math.min(TIDE_SPRINT_FINISH_UNITS, distance + sample));
  const worldDeltaX = after - before;
  const worldDeltaZ = -sample * 2 * DISTANCE_TO_WORLD_Z;
  return Math.atan2(-worldDeltaX, -worldDeltaZ);
}

function createChevronGeometry(): THREE.ShapeGeometry {
  const shape = new THREE.Shape();
  shape.moveTo(0, 0.86);
  shape.lineTo(0.72, 0.08);
  shape.lineTo(0.38, -0.2);
  shape.lineTo(0, 0.22);
  shape.lineTo(-0.38, -0.2);
  shape.lineTo(-0.72, 0.08);
  shape.closePath();
  return new THREE.ShapeGeometry(shape, 2);
}

/**
 * Isolated Tide Sprint renderer. Every race rig uses local -Z as forward;
 * wrappers only apply small steering yaw and never rotate a character 180°.
 */
export class CleanTideSprintView {
  private readonly renderer: THREE.WebGLRenderer;
  private readonly scene = new THREE.Scene();
  private readonly camera = new THREE.PerspectiveCamera(52, 1, 0.1, 190);
  private readonly characterSurface = new THREE.MeshStandardMaterial({
    color: 0xffffff,
    vertexColors: true,
    roughness: 0.56,
    metalness: 0.02,
    emissive: 0x0b2637,
    emissiveIntensity: 0.32,
  });
  private readonly characterFace = new THREE.MeshBasicMaterial({
    color: 0xffffff,
    vertexColors: true,
    toneMapped: false,
  });
  private readonly currentMaterial = new THREE.MeshBasicMaterial({
    color: 0xffffff,
    vertexColors: true,
    transparent: true,
    opacity: 0.48,
    depthWrite: false,
    toneMapped: false,
    blending: THREE.AdditiveBlending,
  });
  private readonly currentCoreMaterial = new THREE.MeshBasicMaterial({
    color: 0xffffff,
    vertexColors: true,
    transparent: true,
    opacity: 0.9,
    depthWrite: false,
    toneMapped: false,
    blending: THREE.AdditiveBlending,
  });
  private readonly guideMaterial = new THREE.MeshBasicMaterial({
    color: 0xffffff,
    vertexColors: true,
    transparent: true,
    opacity: 0.92,
    depthWrite: false,
    toneMapped: false,
    blending: THREE.AdditiveBlending,
  });
  private readonly boostMaterial = new THREE.MeshBasicMaterial({
    color: 0xffe18d,
    transparent: true,
    opacity: 0.95,
    depthWrite: false,
    toneMapped: false,
    blending: THREE.AdditiveBlending,
  });
  private readonly flowHaloMaterial = new THREE.MeshBasicMaterial({
    color: 0x69edff,
    transparent: true,
    opacity: 0.62,
    depthWrite: false,
    depthTest: false,
    side: THREE.DoubleSide,
    toneMapped: false,
    blending: THREE.AdditiveBlending,
  });
  private readonly floorMaterial = new THREE.MeshStandardMaterial({
    color: 0x0b2942,
    roughness: 0.92,
    metalness: 0,
  });
  private readonly reefMaterial = new THREE.MeshStandardMaterial({
    color: 0xffffff,
    vertexColors: true,
    roughness: 0.78,
    metalness: 0.02,
    emissive: 0x311b55,
    emissiveIntensity: 0.56,
  });
  private readonly finishMaterial = new THREE.MeshBasicMaterial({
    color: 0xffe79a,
    transparent: true,
    opacity: 0.94,
    depthWrite: false,
    toneMapped: false,
    blending: THREE.AdditiveBlending,
  });
  private readonly rigs = new Map<TideSprintCharacterId, TideSprintCharacterRig>();
  private readonly racerVisuals = new Map<string, RacerVisual>();
  private readonly floorGeometry = new THREE.PlaneGeometry(27, 220);
  private readonly floor = new THREE.Mesh(this.floorGeometry, this.floorMaterial);
  private readonly gateGeometry = new THREE.TorusGeometry(2.15, 0.105, 6, 32);
  private readonly gates = new THREE.InstancedMesh(
    this.gateGeometry,
    this.guideMaterial,
    GATE_COUNT,
  );
  private readonly ribbonGeometry = new THREE.PlaneGeometry(1, 1);
  private readonly ribbon = new THREE.InstancedMesh(
    this.ribbonGeometry,
    this.currentMaterial,
    RIBBON_COUNT,
  );
  private readonly currentCore = new THREE.InstancedMesh(
    this.ribbonGeometry,
    this.currentCoreMaterial,
    RIBBON_COUNT,
  );
  private readonly currentBanks = new THREE.InstancedMesh(
    this.ribbonGeometry,
    this.guideMaterial,
    CURRENT_BANK_COUNT,
  );
  private readonly chevronGeometry = createChevronGeometry();
  private readonly chevrons = new THREE.InstancedMesh(
    this.chevronGeometry,
    this.guideMaterial,
    CHEVRON_COUNT,
  );
  private readonly wake = new THREE.InstancedMesh(
    this.ribbonGeometry,
    this.currentMaterial,
    2,
  );
  private readonly obstacleGeometry = new THREE.DodecahedronGeometry(1, 1);
  private readonly obstacles = new THREE.InstancedMesh(
    this.obstacleGeometry,
    this.reefMaterial,
    TIDE_SPRINT_OBSTACLES.length,
  );
  private readonly boostRingGeometry = new THREE.TorusGeometry(1.28, 0.2, 7, 34);
  private readonly boostRings = new THREE.InstancedMesh(
    this.boostRingGeometry,
    this.boostMaterial,
    TIDE_SPRINT_CURRENT_RINGS.length,
  );
  private readonly flowHaloGeometry = new THREE.TorusGeometry(1.2, 0.072, 7, 42);
  private readonly flowHalo = new THREE.Mesh(
    this.flowHaloGeometry,
    this.flowHaloMaterial,
  );
  private readonly boostBurstGeometry = new THREE.TorusGeometry(0.86, 0.085, 7, 40);
  private readonly boostBurst = new THREE.Mesh(
    this.boostBurstGeometry,
    this.flowHaloMaterial,
  );
  private readonly boostStreaks = new THREE.InstancedMesh(
    this.ribbonGeometry,
    this.boostMaterial,
    BOOST_STREAK_COUNT,
  );
  private readonly sideReefGeometry = new THREE.ConeGeometry(1, 2.8, 6);
  private readonly sideReef = new THREE.InstancedMesh(
    this.sideReefGeometry,
    this.reefMaterial,
    SIDE_REEF_COUNT,
  );
  private readonly finishRingGeometry = new THREE.TorusGeometry(3.25, 0.14, 7, 44);
  private readonly finishRing = new THREE.Mesh(this.finishRingGeometry, this.finishMaterial);
  private readonly finishPylonGeometry = new THREE.CylinderGeometry(0.13, 0.24, 5.8, 7);
  private readonly finishPylons = new THREE.InstancedMesh(
    this.finishPylonGeometry,
    this.finishMaterial,
    2,
  );
  private readonly finishGroup = new THREE.Group();
  private readonly bubbleGeometry: THREE.BufferGeometry;
  private readonly bubbleMaterial = new THREE.PointsMaterial({
    color: 0x9af5ff,
    size: 0.07,
    transparent: true,
    opacity: 0.42,
    depthWrite: false,
  });
  private readonly bubbles: THREE.Points;
  private readonly matrix = new THREE.Matrix4();
  private readonly quaternion = new THREE.Quaternion();
  private readonly spinQuaternion = new THREE.Quaternion();
  private readonly position = new THREE.Vector3();
  private readonly scale = new THREE.Vector3();
  private readonly colour = new THREE.Color();
  private readonly euler = new THREE.Euler();
  private elapsedSec = 0;
  private lastBoostCount = 0;
  private boostCapturePulse = 0;
  private readonly onResize = () => this.resize();

  constructor(canvas: HTMLCanvasElement) {
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.08;
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5));

    this.scene.background = new THREE.Color(0x071a34);
    this.scene.fog = new THREE.Fog(0x0a3049, 32, 122);
    this.camera.position.set(0, 3.75, 9.25);
    this.camera.lookAt(0, 0.15, -12);

    this.scene.add(new THREE.HemisphereLight(0xb8f7ff, 0x071027, 1.62));
    const moonKey = new THREE.DirectionalLight(0xc7f7ff, 1.86);
    moonKey.position.set(-4, 8, 5);
    this.scene.add(moonKey);
    const coralBounce = new THREE.DirectionalLight(0xff8cc8, 0.68);
    coralBounce.position.set(5, 1, -8);
    this.scene.add(coralBounce);

    for (const character of TIDE_SPRINT_CHARACTER_IDS) {
      this.rigs.set(character, createTideSprintCharacterRig(character, {
        surface: this.characterSurface,
        face: this.characterFace,
      }));
    }

    this.floor.rotation.x = -Math.PI / 2;
    this.floor.position.set(0, -1.12, -76);
    this.scene.add(this.floor);

    for (const mesh of [
      this.gates,
      this.ribbon,
      this.currentCore,
      this.currentBanks,
      this.chevrons,
      this.wake,
      this.obstacles,
      this.boostRings,
      this.boostStreaks,
      this.sideReef,
    ]) {
      mesh.frustumCulled = false;
      mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      this.scene.add(mesh);
    }

    this.flowHalo.renderOrder = 5;
    this.boostBurst.renderOrder = 6;
    this.boostBurst.visible = false;
    this.scene.add(this.flowHalo, this.boostBurst);

    this.finishRing.position.y = 1.65;
    this.finishGroup.add(this.finishRing, this.finishPylons);
    this.finishGroup.visible = false;
    this.scene.add(this.finishGroup);

    const bubblePositions = new Float32Array(220 * 3);
    for (let index = 0; index < 220; index += 1) {
      bubblePositions[index * 3] = Math.sin(index * 12.9898) * 11.8;
      bubblePositions[index * 3 + 1] = -0.25 + ((index * 37) % 100) / 19;
      bubblePositions[index * 3 + 2] = -5 - ((index * 53) % 118);
    }
    this.bubbleGeometry = new THREE.BufferGeometry();
    this.bubbleGeometry.setAttribute(
      "position",
      new THREE.BufferAttribute(bubblePositions, 3),
    );
    this.bubbles = new THREE.Points(this.bubbleGeometry, this.bubbleMaterial);
    this.scene.add(this.bubbles);

    window.addEventListener("resize", this.onResize);
    this.resize();
    this.renderer.render(this.scene, this.camera);
  }

  setRoster(snapshot: CleanTideSprintSnapshot): void {
    for (const visual of this.racerVisuals.values()) visual.wrapper.removeFromParent();
    this.racerVisuals.clear();
    this.lastBoostCount = snapshot.player.boosts;
    this.boostCapturePulse = 0;
    for (const racer of snapshot.racers) {
      const rig = this.rigs.get(racer.character);
      if (!rig) throw new Error(`Missing race rig for ${racer.character}.`);
      const wrapper = new THREE.Group();
      wrapper.userData["racerId"] = racer.id;
      wrapper.userData["player"] = racer.player;
      wrapper.add(rig.group);
      this.scene.add(wrapper);
      const startSlot = TIDE_SPRINT_START_SLOTS[
        racer.id as keyof typeof TIDE_SPRINT_START_SLOTS
      ] ?? TIDE_SPRINT_START_SLOTS.player;
      this.racerVisuals.set(racer.id, {
        wrapper,
        rig,
        startX: startSlot.x,
        startZ: startSlot.z,
      });
    }
  }

  update(snapshot: CleanTideSprintSnapshot, dtSec: number): void {
    this.elapsedSec += dtSec;
    if (snapshot.player.boosts > this.lastBoostCount) {
      this.boostCapturePulse = 1;
      this.lastBoostCount = snapshot.player.boosts;
    } else {
      this.boostCapturePulse = Math.max(0, this.boostCapturePulse - dtSec * 2.45);
    }
    const playerDistance = snapshot.player.distance;
    const launchBlend = smoothstep(snapshot.elapsedSec / START_GRID_BLEND_SEC);
    for (const racer of snapshot.racers) {
      const visual = this.racerVisuals.get(racer.id);
      if (!visual) continue;
      const gap = racer.distance - playerDistance;
      const bob = Math.sin(this.elapsedSec * (2.35 + racer.speed * 0.018) + racer.id.length) * 0.075;
      const raceWorldZ = racer.player
        ? PLAYER_WORLD_Z
        : clamp(PLAYER_WORLD_Z - gap * DISTANCE_TO_WORLD_Z - 0.28, -48, 6.35);
      const worldZ = THREE.MathUtils.lerp(visual.startZ, raceWorldZ, launchBlend);
      const worldX = THREE.MathUtils.lerp(visual.startX, racer.lateral, launchBlend);
      visual.wrapper.visible = racer.player || (worldZ > -48 && worldZ < 6.5);
      visual.wrapper.position.set(
        worldX,
        (racer.player ? 0.12 : 0.2) + bob,
        worldZ,
      );
      const bank = clamp(racer.lateralVelocity / 6.9, -1, 1);
      visual.wrapper.rotation.set(-0.045, -bank * 0.17, -bank * 0.3);
      const baseScale = racer.player ? 1.02 : racer.character === "miri" ? 0.88 : 0.91;
      visual.wrapper.scale.setScalar(baseScale);
      visual.rig.animate(
        this.elapsedSec + racer.id.length * 0.17,
        clamp((racer.speed - 22) / 25, 0, 1),
        bank,
      );
    }

    this.updateCurrentGates(snapshot);
    this.updateRibbon(playerDistance);
    this.updateCurrentBanks(playerDistance);
    this.updateChevrons(playerDistance);
    this.updateObstacles(playerDistance);
    this.updateBoostRings(playerDistance);
    this.updateFlowHalo(snapshot);
    this.updateBoostFeedback(snapshot);
    this.updateSideReef(playerDistance);
    this.updateFinish(snapshot);
    this.updateWake(snapshot);
    const speed01 = clamp((snapshot.player.speed - 20) / 25, 0, 1);
    const currentPulse = 0.5 + Math.sin(this.elapsedSec * 4.2) * 0.5;
    this.currentMaterial.opacity = 0.52 + currentPulse * 0.1;
    this.currentCoreMaterial.opacity = 0.84 + snapshot.player.flow * 0.1 + currentPulse * 0.05;
    this.guideMaterial.opacity = 0.82 + currentPulse * 0.14;
    this.boostMaterial.opacity = 0.82 + currentPulse * 0.16;
    const baseFov = this.camera.aspect > 1.25 ? 43.5 : 49.5;
    this.camera.fov = THREE.MathUtils.lerp(
      this.camera.fov,
      baseFov + speed01 * 7.2 + snapshot.player.boost * 2.4 + this.boostCapturePulse * 7.5,
      Math.min(1, dtSec * 8),
    );
    const cameraKick = this.boostCapturePulse * this.boostCapturePulse;
    this.camera.position.set(
      Math.sin(this.elapsedSec * 74) * cameraKick * 0.1,
      3.75 + Math.cos(this.elapsedSec * 61) * cameraKick * 0.055,
      9.25 - cameraKick * 0.28,
    );
    this.camera.lookAt(0, 0.15, -12 - cameraKick * 1.6);
    this.camera.updateProjectionMatrix();
    this.floorMaterial.color.setHex(
      snapshot.section === "relic-current"
        ? 0x111f3b
        : snapshot.section === "final-moonflash"
          ? 0x103038
          : 0x071f35,
    );
    this.bubbles.position.z = (playerDistance * DISTANCE_TO_WORLD_Z) % 18;
    this.bubbles.position.y = Math.sin(this.elapsedSec * 0.33) * 0.16;
    this.bubbleMaterial.size = 0.05 + speed01 * 0.07;
    this.bubbleMaterial.opacity = 0.24 + speed01 * 0.36;
  }

  render(): void {
    this.renderer.render(this.scene, this.camera);
  }

  stats(): {
    drawCalls: number;
    triangles: number;
    materials: number;
    geometries: number;
    textures: number;
  } {
    return {
      drawCalls: this.renderer.info.render.calls,
      triangles: this.renderer.info.render.triangles,
      materials: 11,
      geometries: this.renderer.info.memory.geometries,
      textures: this.renderer.info.memory.textures,
    };
  }

  dispose(): void {
    window.removeEventListener("resize", this.onResize);
    for (const rig of this.rigs.values()) rig.dispose();
    for (const geometry of [
      this.floorGeometry,
      this.gateGeometry,
      this.ribbonGeometry,
      this.chevronGeometry,
      this.obstacleGeometry,
      this.boostRingGeometry,
      this.flowHaloGeometry,
      this.boostBurstGeometry,
      this.sideReefGeometry,
      this.finishRingGeometry,
      this.finishPylonGeometry,
      this.bubbleGeometry,
    ]) geometry.dispose();
    for (const material of [
      this.characterSurface,
      this.characterFace,
      this.currentMaterial,
      this.currentCoreMaterial,
      this.guideMaterial,
      this.boostMaterial,
      this.flowHaloMaterial,
      this.floorMaterial,
      this.reefMaterial,
      this.finishMaterial,
      this.bubbleMaterial,
    ]) material.dispose();
    this.renderer.dispose();
  }

  private updateCurrentGates(snapshot: CleanTideSprintSnapshot): void {
    const playerDistance = snapshot.player.distance;
    for (let index = 0; index < GATE_COUNT; index += 1) {
      const gap = TIDE_SPRINT_GUIDE_GAPS[index]!;
      const desiredDistance = playerDistance + gap;
      const distance = Math.min(TIDE_SPRINT_FINISH_UNITS, desiredDistance);
      const radius = tideSprintCurrentRadius(distance);
      this.position.set(
        tideSprintCurrentCenter(distance),
        0.78,
        PLAYER_WORLD_Z - gap * DISTANCE_TO_WORLD_Z,
      );
      this.quaternion.setFromAxisAngle(WORLD_UP, currentYaw(distance));
      const visibleScale = desiredDistance <= TIDE_SPRINT_FINISH_UNITS ? 1 : 0.0001;
      this.scale.set(
        radius / 2.15 * visibleScale,
        (0.84 + radius * 0.08) * visibleScale,
        visibleScale,
      );
      this.matrix.compose(this.position, this.quaternion, this.scale);
      this.gates.setMatrixAt(index, this.matrix);
      this.gates.setColorAt(
        index,
        this.colour.setHex(
          index === 0 && snapshot.player.flow >= 0.72
            ? 0xffef9f
            : sectionColour(tideSprintSectionAtDistance(distance)),
        ),
      );
    }
    this.gates.instanceMatrix.needsUpdate = true;
    if (this.gates.instanceColor) this.gates.instanceColor.needsUpdate = true;
  }

  private updateRibbon(playerDistance: number): void {
    const firstTile = Math.floor((playerDistance - 10) / RIBBON_SPACING) * RIBBON_SPACING;
    for (let index = 0; index < RIBBON_COUNT; index += 1) {
      const distance = firstTile + index * RIBBON_SPACING;
      const gap = distance - playerDistance;
      const radius = tideSprintCurrentRadius(distance);
      const section = tideSprintSectionAtDistance(distance);
      const visibleScale = distance <= TIDE_SPRINT_FINISH_UNITS ? 1 : 0.0001;
      this.quaternion
        .setFromAxisAngle(WORLD_UP, currentYaw(distance))
        .multiply(FLAT_PLANE);
      this.position.set(
        tideSprintCurrentCenter(distance),
        -0.988,
        PLAYER_WORLD_Z - gap * DISTANCE_TO_WORLD_Z,
      );
      this.scale.set(
        radius * 2.72 * visibleScale,
        RIBBON_SPACING * DISTANCE_TO_WORLD_Z * 1.28 * visibleScale,
        visibleScale,
      );
      this.matrix.compose(this.position, this.quaternion, this.scale);
      this.ribbon.setMatrixAt(index, this.matrix);
      this.ribbon.setColorAt(
        index,
        this.colour.setHex(sectionColour(section)),
      );

      this.position.y = -0.918;
      this.scale.x = radius * 1.32 * visibleScale;
      this.matrix.compose(this.position, this.quaternion, this.scale);
      this.currentCore.setMatrixAt(index, this.matrix);
      this.currentCore.setColorAt(
        index,
        this.colour.setHex(sectionCoreColour(section)),
      );
    }
    this.ribbon.instanceMatrix.needsUpdate = true;
    if (this.ribbon.instanceColor) this.ribbon.instanceColor.needsUpdate = true;
    this.currentCore.instanceMatrix.needsUpdate = true;
    if (this.currentCore.instanceColor) this.currentCore.instanceColor.needsUpdate = true;
  }

  private updateCurrentBanks(playerDistance: number): void {
    const firstTile = Math.floor((playerDistance - 10) / RIBBON_SPACING) * RIBBON_SPACING;
    let instance = 0;
    for (let index = 0; index < RIBBON_COUNT; index += 1) {
      const distance = firstTile + index * RIBBON_SPACING;
      const gap = distance - playerDistance;
      const radius = tideSprintCurrentRadius(distance);
      const visibleScale = distance <= TIDE_SPRINT_FINISH_UNITS ? 1 : 0.0001;
      this.quaternion
        .setFromAxisAngle(WORLD_UP, currentYaw(distance))
        .multiply(FLAT_PLANE);
      for (const side of [-1, 1] as const) {
        this.position.set(
          tideSprintCurrentCenter(distance) + side * radius * 1.04,
          -0.79,
          PLAYER_WORLD_Z - gap * DISTANCE_TO_WORLD_Z,
        );
        this.scale.set(
          0.075 * visibleScale,
          RIBBON_SPACING * DISTANCE_TO_WORLD_Z * 1.22 * visibleScale,
          visibleScale,
        );
        this.matrix.compose(this.position, this.quaternion, this.scale);
        this.currentBanks.setMatrixAt(instance, this.matrix);
        this.currentBanks.setColorAt(
          instance,
          this.colour.setHex(sectionCoreColour(tideSprintSectionAtDistance(distance))),
        );
        instance += 1;
      }
    }
    this.currentBanks.instanceMatrix.needsUpdate = true;
    if (this.currentBanks.instanceColor) this.currentBanks.instanceColor.needsUpdate = true;
  }

  private updateChevrons(playerDistance: number): void {
    const flowPhase = (this.elapsedSec * 10.5) % CHEVRON_SPACING;
    for (let index = 0; index < CHEVRON_COUNT; index += 1) {
      let gap = 3.5 + index * CHEVRON_SPACING - flowPhase;
      if (gap < 3) gap += CHEVRON_COUNT * CHEVRON_SPACING;
      const distance = playerDistance + gap;
      const nearStrength = 1 - clamp((gap - 3) / 150, 0, 1);
      const pulse = 0.94 + Math.sin(this.elapsedSec * 6.4 + index * 0.72) * 0.1;
      const visibleScale = distance <= TIDE_SPRINT_FINISH_UNITS ? 1 : 0.0001;
      this.position.set(
        tideSprintCurrentCenter(distance),
        -0.64 + nearStrength * 0.15,
        PLAYER_WORLD_Z - gap * DISTANCE_TO_WORLD_Z,
      );
      this.quaternion
        .setFromAxisAngle(WORLD_UP, currentYaw(distance))
        .multiply(READABLE_GUIDE_PLANE);
      this.scale.set(
        (1.18 + nearStrength * 0.48) * pulse * visibleScale,
        (1.34 + nearStrength * 0.58) * pulse * visibleScale,
        visibleScale,
      );
      this.matrix.compose(this.position, this.quaternion, this.scale);
      this.chevrons.setMatrixAt(index, this.matrix);
      this.chevrons.setColorAt(
        index,
        this.colour.setHex(sectionCoreColour(tideSprintSectionAtDistance(distance))),
      );
    }
    this.chevrons.instanceMatrix.needsUpdate = true;
    if (this.chevrons.instanceColor) this.chevrons.instanceColor.needsUpdate = true;
  }

  private updateObstacles(playerDistance: number): void {
    for (const [index, obstacle] of TIDE_SPRINT_OBSTACLES.entries()) {
      const gap = obstacle.distance - playerDistance;
      const visible = gap > -30 && gap < 900;
      this.position.set(
        obstacle.lateral,
        -0.5,
        PLAYER_WORLD_Z - gap * DISTANCE_TO_WORLD_Z,
      );
      this.euler.set(
        0.1,
        obstacle.distance * 0.017,
        obstacle.side * 0.18,
      );
      this.quaternion.setFromEuler(this.euler);
      const size = visible ? obstacle.radius : 0.0001;
      this.scale.set(size, size * 1.45, size);
      this.matrix.compose(this.position, this.quaternion, this.scale);
      this.obstacles.setMatrixAt(index, this.matrix);
      this.obstacles.setColorAt(
        index,
        this.colour.setHex(index % 2 === 0 ? 0xa9478e : 0x4e55a8),
      );
    }
    this.obstacles.instanceMatrix.needsUpdate = true;
    if (this.obstacles.instanceColor) this.obstacles.instanceColor.needsUpdate = true;
  }

  private updateBoostRings(playerDistance: number): void {
    for (const [index, ring] of TIDE_SPRINT_CURRENT_RINGS.entries()) {
      const gap = ring.distance - playerDistance;
      const visible = gap > 0.6 && gap < 520;
      const pulse = visible
        ? 1.04 + Math.sin(this.elapsedSec * 4.6 + index * 0.83) * 0.1
        : 0.0001;
      this.position.set(
        ring.lateral,
        0.35 + Math.sin(this.elapsedSec * 2.2 + index) * 0.06,
        PLAYER_WORLD_Z - gap * DISTANCE_TO_WORLD_Z,
      );
      this.quaternion
        .setFromAxisAngle(WORLD_UP, currentYaw(ring.distance))
        .multiply(this.spinQuaternion.setFromAxisAngle(
          RING_FORWARD,
          this.elapsedSec * 0.28 + index * 0.41,
        ));
      this.scale.setScalar(pulse);
      this.matrix.compose(this.position, this.quaternion, this.scale);
      this.boostRings.setMatrixAt(index, this.matrix);
      this.boostRings.setColorAt(
        index,
        this.colour.setHex(index % 2 === 0 ? 0xffe18d : 0xffbd72),
      );
    }
    this.boostRings.instanceMatrix.needsUpdate = true;
    if (this.boostRings.instanceColor) this.boostRings.instanceColor.needsUpdate = true;
  }

  private updateFlowHalo(snapshot: CleanTideSprintSnapshot): void {
    const flow = snapshot.player.flow;
    this.flowHalo.position.set(
      snapshot.player.lateral,
      0.24,
      PLAYER_WORLD_Z - 0.42,
    );
    const pulse = 0.94 + Math.sin(this.elapsedSec * (4.2 + flow * 2.2)) * 0.08;
    this.flowHalo.scale.set(
      (1.22 + flow * 0.17) * pulse,
      (0.72 + flow * 0.1) * pulse,
      1,
    );
    this.flowHalo.rotation.z = clamp(snapshot.player.lateralVelocity / 6.9, -1, 1) * -0.12;
    this.flowHaloMaterial.opacity = 0.48 + flow * 0.34 + this.boostCapturePulse * 0.14;
    this.flowHaloMaterial.color.setHex(
      this.boostCapturePulse > 0 || snapshot.player.boost > 0
        ? 0xffdf7c
        : flow >= 0.72
          ? 0x9ffff0
          : flow >= 0.34
            ? 0x55eaff
            : 0xff6fb7,
    );
  }

  private updateBoostFeedback(snapshot: CleanTideSprintSnapshot): void {
    const strength = Math.max(snapshot.player.boost * 0.58, this.boostCapturePulse);
    this.boostBurst.visible = this.boostCapturePulse > 0.015;
    if (this.boostBurst.visible) {
      const expansion = 1 - this.boostCapturePulse;
      this.boostBurst.position.set(
        snapshot.player.lateral,
        0.24,
        PLAYER_WORLD_Z - 0.5,
      );
      this.boostBurst.scale.set(
        1 + expansion * 4.2,
        0.72 + expansion * 2.5,
        1,
      );
    }

    this.quaternion.copy(FLAT_PLANE);
    for (let index = 0; index < BOOST_STREAK_COUNT; index += 1) {
      const side = index % 2 === 0 ? -1 : 1;
      const band = Math.floor(index / 2);
      this.position.set(
        snapshot.player.lateral + side * (1.1 + band * 0.52),
        -0.35 + (band % 2) * 0.14,
        PLAYER_WORLD_Z + 0.55 + band * 0.7,
      );
      this.scale.set(
        (0.035 + band * 0.008) * strength,
        (4.2 + band * 0.7 + this.boostCapturePulse * 6.2) * strength,
        strength,
      );
      this.matrix.compose(this.position, this.quaternion, this.scale);
      this.boostStreaks.setMatrixAt(index, this.matrix);
      this.boostStreaks.setColorAt(
        index,
        this.colour.setHex(index % 3 === 0 ? 0xffffff : 0xffe38c),
      );
    }
    this.boostStreaks.instanceMatrix.needsUpdate = true;
    if (this.boostStreaks.instanceColor) this.boostStreaks.instanceColor.needsUpdate = true;
  }

  private updateSideReef(playerDistance: number): void {
    const cycle = TIDE_SPRINT_FINISH_UNITS + 500;
    for (let index = 0; index < SIDE_REEF_COUNT; index += 1) {
      const side = index % 2 === 0 ? -1 : 1;
      const baseDistance = 45 + Math.floor(index / 2) * 118;
      let gap = baseDistance - playerDistance;
      while (gap < -45) gap += cycle;
      const visible = gap < 1050;
      const laneNoise = Math.sin(index * 2.17) * 0.85;
      this.position.set(
        side * (6.1 + Math.abs(laneNoise)),
        -0.08,
        PLAYER_WORLD_Z - gap * DISTANCE_TO_WORLD_Z,
      );
      this.euler.set(
        side * 0.08,
        index * 0.71,
        side * (0.08 + Math.sin(index) * 0.08),
      );
      this.quaternion.setFromEuler(this.euler);
      const height = visible ? 0.7 + (index % 5) * 0.13 : 0.0001;
      this.scale.set(0.45 + index % 3 * 0.08, height, 0.45 + index % 4 * 0.05);
      this.matrix.compose(this.position, this.quaternion, this.scale);
      this.sideReef.setMatrixAt(index, this.matrix);
      this.sideReef.setColorAt(
        index,
        this.colour.setHex(SIDE_REEF_COLOURS[index % SIDE_REEF_COLOURS.length]!),
      );
    }
    this.sideReef.instanceMatrix.needsUpdate = true;
    if (this.sideReef.instanceColor) this.sideReef.instanceColor.needsUpdate = true;
  }

  private updateFinish(snapshot: CleanTideSprintSnapshot): void {
    this.finishGroup.visible = snapshot.progress >= 0.78;
    if (!this.finishGroup.visible) return;
    const remaining = TIDE_SPRINT_FINISH_UNITS - snapshot.player.distance;
    this.finishGroup.position.set(
      tideSprintCurrentCenter(TIDE_SPRINT_FINISH_UNITS),
      -0.15,
      clamp(PLAYER_WORLD_Z - remaining * DISTANCE_TO_WORLD_Z, -45, -5.2),
    );
    const pulse = 1 + Math.sin(this.elapsedSec * 3.3) * 0.035;
    this.finishRing.scale.setScalar(pulse);
    this.finishRing.rotation.z = Math.sin(this.elapsedSec * 0.7) * 0.04;
    for (let index = 0; index < 2; index += 1) {
      const side = index === 0 ? -1 : 1;
      this.position.set(side * 3.25, 1.05, 0);
      this.quaternion.identity();
      this.scale.set(1, 1, 1);
      this.matrix.compose(this.position, this.quaternion, this.scale);
      this.finishPylons.setMatrixAt(index, this.matrix);
    }
    this.finishPylons.instanceMatrix.needsUpdate = true;
  }

  private updateWake(snapshot: CleanTideSprintSnapshot): void {
    const speed01 = clamp((snapshot.player.speed - 20) / 25, 0, 1);
    const boostStrength = Math.max(snapshot.player.boost * 0.62, this.boostCapturePulse);
    const length = 0.65 + speed01 * 2.7 + boostStrength * 5.2;
    this.euler.set(-Math.PI / 2, 0, 0);
    this.quaternion.setFromEuler(this.euler);
    for (let index = 0; index < 2; index += 1) {
      const side = index === 0 ? -1 : 1;
      this.position.set(
        side * (0.22 + speed01 * 0.1),
        -0.03,
        PLAYER_WORLD_Z + 0.72 + length * 0.5,
      );
      this.scale.set(
        0.08 + speed01 * 0.1 + boostStrength * 0.13,
        length,
        1,
      );
      this.matrix.compose(this.position, this.quaternion, this.scale);
      this.wake.setMatrixAt(index, this.matrix);
      this.wake.setColorAt(
        index,
        this.colour.setHex(
          snapshot.player.boost > 0
            ? 0xfff1a3
            : snapshot.player.throttle > 0.78
            ? 0xffdf82
            : snapshot.player.throttle < 0.32
              ? 0xff85b7
              : 0x69ecff,
        ),
      );
    }
    this.wake.instanceMatrix.needsUpdate = true;
    if (this.wake.instanceColor) this.wake.instanceColor.needsUpdate = true;
  }

  private resize(): void {
    const width = Math.max(1, window.innerWidth);
    const height = Math.max(1, window.innerHeight);
    const aspect = width / height;
    this.camera.aspect = aspect;
    this.camera.fov = aspect > 1.25 ? 44 : 52;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(width, height, false);
  }
}
