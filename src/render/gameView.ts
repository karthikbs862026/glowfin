/**
 * Primitive-shape renderer for Phase 1 (Part 9: "primitives only").
 *
 * No shaders, no art — the point is to make the simulation playable and
 * readable so the tuning can be judged by hand instead of only by synthetic
 * pilots. Caustics, trail ribbon and the rest arrive in Phase 2.
 *
 * Everything repeated is pooled and hard-capped (Part 3.3, 4.3). Nothing here
 * allocates per frame.
 */
import * as THREE from "three";
import type { TuningConfig } from "../core/config";
import type { Gate } from "../sim/course";
import type { SimState } from "../sim/state";

/** Hard caps. Part 4.6 requires pool sizes be part of the performance budget. */
const MAX_POOLED_GATES = 16;
const MAX_POOLED_STRIPES = 40;
const STRIPE_SPACING_UNITS = 14;
const WALL_HEIGHT = 4;
const WALL_DEPTH = 1.4;

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

interface GateVisual {
  left: THREE.Mesh;
  right: THREE.Mesh;
}

export class GameView {
  readonly scene = new THREE.Scene();
  readonly camera: THREE.PerspectiveCamera;
  private readonly renderer: THREE.WebGLRenderer;

  private readonly creature: THREE.Mesh;
  private readonly creatureMaterial: THREE.MeshStandardMaterial;
  private readonly gatePool: GateVisual[] = [];
  private readonly stripePool: THREE.Mesh[] = [];
  private readonly disposables: Array<{ dispose(): void }> = [];

  constructor(
    canvas: HTMLCanvasElement,
    private readonly cfg: TuningConfig
  ) {
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.setSize(window.innerWidth, window.innerHeight, false);

    this.scene.background = new THREE.Color(0x04060f);
    // Fog starts well beyond the sight distance so it never eats an obstacle
    // the player is supposed to be reading (Part 3.4).
    this.scene.fog = new THREE.Fog(
      0x04060f,
      cfg.readability.visibleAheadUnits * 1.15,
      cfg.readability.visibleAheadUnits * 2.4
    );

    this.camera = new THREE.PerspectiveCamera(
      cfg.camera.fovAtZeroMomentum,
      window.innerWidth / window.innerHeight,
      0.1,
      cfg.readability.visibleAheadUnits * 3
    );

    this.scene.add(new THREE.AmbientLight(0x4488cc, 1.1));
    const key = new THREE.DirectionalLight(0xaaddff, 1.0);
    key.position.set(0.4, 1, 0.6);
    this.scene.add(key);

    const halfWidth = cfg.lane.halfWidth;

    // --- floor ---
    const floorGeo = new THREE.PlaneGeometry(halfWidth * 2, 4000);
    const floorMat = new THREE.MeshStandardMaterial({ color: 0x0a1424, roughness: 1 });
    const floor = new THREE.Mesh(floorGeo, floorMat);
    floor.rotation.x = -Math.PI / 2;
    floor.position.y = -1;
    this.scene.add(floor);
    this.disposables.push(floorGeo, floorMat);

    // --- lane edges: the player needs a fixed reference to read lateral position ---
    const edgeGeo = new THREE.BoxGeometry(0.25, 0.5, 4000);
    const edgeMat = new THREE.MeshStandardMaterial({
      color: 0x0d2a3a,
      emissive: 0x18506b,
      emissiveIntensity: 0.8
    });
    for (const sign of [-1, 1]) {
      const edge = new THREE.Mesh(edgeGeo, edgeMat);
      edge.position.set(sign * halfWidth, -0.8, 0);
      this.scene.add(edge);
    }
    this.disposables.push(edgeGeo, edgeMat);

    // --- speed stripes: without moving reference objects, speed is invisible ---
    const stripeGeo = new THREE.BoxGeometry(halfWidth * 2 * 0.9, 0.06, 0.7);
    const stripeMat = new THREE.MeshStandardMaterial({
      color: 0x102a3d,
      emissive: 0x1d4f70,
      emissiveIntensity: 0.6
    });
    for (let i = 0; i < MAX_POOLED_STRIPES; i++) {
      const stripe = new THREE.Mesh(stripeGeo, stripeMat);
      stripe.position.y = -0.95;
      this.scene.add(stripe);
      this.stripePool.push(stripe);
    }
    this.disposables.push(stripeGeo, stripeMat);

    // --- gate walls: one shared unit box, scaled per gate ---
    const wallGeo = new THREE.BoxGeometry(1, 1, 1);
    const wallMat = new THREE.MeshStandardMaterial({
      color: 0x14304a,
      emissive: 0x2f8fb8,
      emissiveIntensity: 0.55
    });
    for (let i = 0; i < MAX_POOLED_GATES; i++) {
      const left = new THREE.Mesh(wallGeo, wallMat);
      const right = new THREE.Mesh(wallGeo, wallMat);
      left.visible = false;
      right.visible = false;
      this.scene.add(left, right);
      this.gatePool.push({ left, right });
    }
    this.disposables.push(wallGeo, wallMat);

    // --- creature ---
    const bodyGeo = new THREE.SphereGeometry(cfg.lane.creatureRadius, 20, 14);
    this.creatureMaterial = new THREE.MeshStandardMaterial({
      color: 0x9fe8ff,
      emissive: 0x35d0ff,
      emissiveIntensity: 1.6,
      roughness: 0.6
    });
    this.creature = new THREE.Mesh(bodyGeo, this.creatureMaterial);
    this.scene.add(this.creature);
    this.disposables.push(bodyGeo, this.creatureMaterial);

    window.addEventListener("resize", this.handleResize);
  }

  private handleResize = (): void => {
    this.camera.aspect = window.innerWidth / window.innerHeight;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(window.innerWidth, window.innerHeight, false);
  };

  /**
   * Update visuals from simulation state and render.
   *
   * `lightFraction` drives creature body brightness; `momentum` drives camera
   * and hue. Keeping those on separate visual channels is the split proposed in
   * ADR-0006 — it needs real validation in Phase 3, not assertion here.
   */
  render(sim: SimState, gates: readonly Gate[], lightFraction: number): void {
    const cfg = this.cfg;
    const momentumFraction =
      cfg.momentum.ceiling === 0 ? 0 : sim.momentum / cfg.momentum.ceiling;
    const worldZ = -sim.forwardDistance;

    // --- creature ---
    this.creature.position.set(sim.lateralPosition, 0, worldZ);
    this.creatureMaterial.emissiveIntensity = lerp(0.25, 2.2, Math.max(0, lightFraction));
    // Eye-hue stand-in: calm blue at rest, warm toward maximum momentum
    // (Part 3.1). A sphere has no eyes yet; this previews the mapping.
    this.creatureMaterial.emissive.setHSL(
      lerp(0.55, 0.92, momentumFraction),
      0.85,
      0.55
    );

    // --- camera (Part 4.5: readability at speed) ---
    const behind = lerp(
      cfg.camera.distanceBehindAtZeroMomentum,
      cfg.camera.distanceBehindAtMaxMomentum,
      momentumFraction
    );
    const fov = lerp(cfg.camera.fovAtZeroMomentum, cfg.camera.fovAtMaxMomentum, momentumFraction);
    if (Math.abs(this.camera.fov - fov) > 0.01) {
      this.camera.fov = fov;
      this.camera.updateProjectionMatrix();
    }
    const camX = sim.lateralPosition * cfg.camera.lateralFollowFraction;
    this.camera.position.set(camX, cfg.camera.height, worldZ + behind);
    this.camera.lookAt(camX * 0.5, cfg.camera.lookHeight, worldZ - cfg.camera.lookAheadUnits);

    this.updateStripes(sim.forwardDistance);
    this.updateGates(sim.forwardDistance, gates);

    this.renderer.render(this.scene, this.camera);
  }

  private updateStripes(distance: number): void {
    const first = Math.floor((distance - 20) / STRIPE_SPACING_UNITS);
    for (let i = 0; i < this.stripePool.length; i++) {
      const stripe = this.stripePool[i];
      if (!stripe) continue;
      stripe.position.z = -(first + i) * STRIPE_SPACING_UNITS;
    }
  }

  private updateGates(distance: number, gates: readonly Gate[]): void {
    const cfg = this.cfg;
    const halfWidth = cfg.lane.halfWidth;
    const near = distance - 25;
    const far = distance + cfg.readability.visibleAheadUnits * 1.6;

    let slot = 0;
    for (const gate of gates) {
      if (gate.distance < near) continue;
      if (gate.distance > far) break;
      const visual = this.gatePool[slot];
      if (!visual) break; // pool exhausted: hard cap, never grow at runtime
      slot++;

      const z = -gate.distance;
      const leftWidth = gate.gapLeft - -halfWidth;
      const rightWidth = halfWidth - gate.gapRight;

      if (leftWidth > 0.01) {
        visual.left.visible = true;
        visual.left.scale.set(leftWidth, WALL_HEIGHT, WALL_DEPTH);
        visual.left.position.set(-halfWidth + leftWidth / 2, WALL_HEIGHT / 2 - 1, z);
      } else {
        visual.left.visible = false;
      }

      if (rightWidth > 0.01) {
        visual.right.visible = true;
        visual.right.scale.set(rightWidth, WALL_HEIGHT, WALL_DEPTH);
        visual.right.position.set(halfWidth - rightWidth / 2, WALL_HEIGHT / 2 - 1, z);
      } else {
        visual.right.visible = false;
      }
    }

    for (let i = slot; i < this.gatePool.length; i++) {
      const visual = this.gatePool[i];
      if (!visual) continue;
      visual.left.visible = false;
      visual.right.visible = false;
    }
  }

  /** Release GPU resources. Full context-loss rebuild is Phase 5 (Part 4.3). */
  dispose(): void {
    window.removeEventListener("resize", this.handleResize);
    for (const item of this.disposables) item.dispose();
    this.renderer.dispose();
  }
}
