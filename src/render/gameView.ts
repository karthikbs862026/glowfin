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
import {
  createCausticMaterial,
  setCausticOctaves,
  advanceCausticTime
} from "./causticMaterial";
import type { TierSettings } from "../perf/quality";
import { readGpuName } from "../perf/metrics";
import { TrailRibbon } from "./trail";
import { Creature } from "./creature";
import { EffectComposer } from "three/examples/jsm/postprocessing/EffectComposer.js";
import { RenderPass } from "three/examples/jsm/postprocessing/RenderPass.js";
import { UnrealBloomPass } from "three/examples/jsm/postprocessing/UnrealBloomPass.js";

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

  private readonly creature: Creature;
  private readonly floorMaterial: THREE.ShaderMaterial;
  private readonly wallMaterial: THREE.ShaderMaterial;
  private readonly trail: TrailRibbon;
  private readonly composer: EffectComposer;
  private readonly bloomPass: UnrealBloomPass;
  private bloomEnabled = true;
  private readonly wallCausticBase = new THREE.Color(0x63e0ff);
  private readonly wallCausticHot = new THREE.Color(0xff6be0);
  private readonly wallCausticScratch = new THREE.Color();
  /**
   * Mask material for the contrast probe. Outputs white only for obstacles
   * within the reaction window; anything further reads as background.
   *
   * Without the depth limit the probe reports contrast for obstacles that fog
   * has deliberately faded into the background — they measure 1:1 because they
   * *are* the background, which is correct behaviour being scored as a failure.
   * Only obstacles the player is expected to react to belong in the measurement.
   */
  private readonly maskObstacle = new THREE.ShaderMaterial({
    uniforms: { uMaxDepth: { value: 1e9 } },
    vertexShader: `
      varying float vDepth;
      void main() {
        vec4 mv = modelViewMatrix * vec4(position, 1.0);
        vDepth = -mv.z;
        gl_Position = projectionMatrix * mv;
      }
    `,
    fragmentShader: `
      precision mediump float;
      uniform float uMaxDepth;
      varying float vDepth;
      void main() {
        // Three states, not two:
        //   1.0  obstacle inside the reaction window -> measure it
        //   0.5  obstacle beyond the window          -> ignore entirely
        //   0.0  (other mask material) true background
        //
        // A binary mask made distant obstacles read as background, so a near
        // wall silhouetted against a far wall scored ~1:1 — two walls are
        // nearly the same colour. The analysis side of this shipped two rounds
        // ago; this shader half did not, so the fix was never actually live.
        float inRange = step(vDepth, uMaxDepth);
        gl_FragColor = vec4(vec3(mix(0.5, 1.0, inRange)), 1.0);
      }
    `
  });
  private readonly maskOther = new THREE.MeshBasicMaterial({ color: 0x000000 });
  private readonly savedMaterials = new Map<THREE.Mesh, THREE.Material | THREE.Material[]>();
  private maskMode = false;
  readonly gpuName: string;
  private readonly gatePool: GateVisual[] = [];
  private readonly stripePool: THREE.Mesh[] = [];
  private readonly disposables: Array<{ dispose(): void }> = [];

  constructor(
    canvas: HTMLCanvasElement,
    private readonly cfg: TuningConfig
  ) {
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
    // EffectComposer runs several passes and renderer.info auto-resets on each
    // one, so by the time stats() reads it, it describes bloom's final
    // fullscreen quad rather than the scene — the overlay showed "draws 1
    // tris 1" while actually drawing ~34. Reset manually once per frame
    // instead, so the counters accumulate across every pass. Post-processing
    // draws are real draws and belong in the budget.
    this.renderer.info.autoReset = false;
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.setSize(window.innerWidth, window.innerHeight, false);

    this.scene.background = new THREE.Color(0x04060f);
    // Fog starts well beyond the sight distance so it never eats an obstacle
    // the player is supposed to be reading (Part 3.4).
    // Fog must begin BEYOND the reaction window, not at its edge.
    //
    // It previously started at visibleAhead * 1.15 = 103.5 camera depth, while
    // an obstacle at the far edge of the required 90-unit reaction window sits
    // at 90 + camera distance = 103.5. Identical. The game was fading obstacles
    // out at exactly the distance Part 4.5 requires them to stay readable, and
    // the probe caught it as near-black obstacles on a near-black background.
    this.scene.fog = new THREE.Fog(
      0x04060f,
      cfg.readability.visibleAheadUnits * cfg.visual.fogNearMultiplier,
      cfg.readability.visibleAheadUnits * cfg.visual.fogFarMultiplier
    );

    this.camera = new THREE.PerspectiveCamera(
      cfg.camera.fovAtZeroMomentum,
      window.innerWidth / window.innerHeight,
      0.1,
      cfg.readability.visibleAheadUnits * (cfg.visual.fogFarMultiplier + 0.4)
    );

    this.scene.add(new THREE.AmbientLight(0x4488cc, 1.1));
    const key = new THREE.DirectionalLight(0xaaddff, 1.0);
    key.position.set(0.4, 1, 0.6);
    this.scene.add(key);

    const halfWidth = cfg.lane.halfWidth;

    const fogNear = cfg.readability.visibleAheadUnits * cfg.visual.fogNearMultiplier;
    const fogFar = cfg.readability.visibleAheadUnits * cfg.visual.fogFarMultiplier;

    // --- floor, with caustics (Part 3.2 priority 1) ---
    const floorGeo = new THREE.PlaneGeometry(halfWidth * 2, 4000);
    this.floorMaterial = createCausticMaterial({
      baseColor: 0x081426,
      causticColor: 0x2ea8d8,
      scale: cfg.visual.causticScaleFloor,
      intensity: cfg.visual.causticIntensityFloor,
      sharpness: cfg.visual.causticSharpness,
      speed: cfg.visual.causticSpeed,
      fogColor: 0x04060f,
      fogNear,
      fogFar,
      octaves: 3
    });
    const floor = new THREE.Mesh(floorGeo, this.floorMaterial);
    floor.rotation.x = -Math.PI / 2;
    floor.position.y = -1;
    this.scene.add(floor);
    this.disposables.push(floorGeo, this.floorMaterial);

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
    // Caustics contribute *additively* on top of a base colour chosen to sit
    // well clear of the background. That is deliberate: an additive term can
    // only brighten an obstacle, never darken it, so no lighting state can push
    // a silhouette below the Part 3.4 contrast floor. A multiplicative or
    // shadowing term could, which is why this is not one.
    this.wallMaterial = createCausticMaterial({
      baseColor: 0x1b4668,
      causticColor: 0x63e0ff,
      scale: cfg.visual.causticScaleWall,
      intensity: cfg.visual.causticIntensityWall,
      sharpness: cfg.visual.causticSharpness,
      speed: cfg.visual.causticSpeed,
      fogColor: 0x04060f,
      fogNear,
      fogFar,
      octaves: 3,
      edgeStrength: cfg.visual.obstacleEdgeStrength,
      edgeWidthPixels: cfg.visual.obstacleEdgeWidthPixels,
      edgeColor: 0xbdf4ff
    });
    const wallMat = this.wallMaterial;
    for (let i = 0; i < MAX_POOLED_GATES; i++) {
      const left = new THREE.Mesh(wallGeo, wallMat);
      const right = new THREE.Mesh(wallGeo, wallMat);
      // Tagged so the contrast probe can identify obstacle silhouettes without
      // the renderer keeping a parallel list in sync.
      left.userData["isObstacle"] = true;
      right.userData["isObstacle"] = true;
      left.visible = false;
      right.visible = false;
      this.scene.add(left, right);
      this.gatePool.push({ left, right });
    }
    this.disposables.push(wallGeo, this.wallMaterial);

    // --- creature (Part 3.1) ---
    this.creature = new Creature(cfg);
    this.scene.add(this.creature.group);

    // --- trail ribbon (Part 3.2 priority 2) ---
    this.trail = new TrailRibbon(cfg);
    this.scene.add(this.trail.mesh);

    // --- bloom ---
    // Not in Part 3.2's numbered list, but Part 3.4 and 6.5 both assume it is
    // present ("with all effects enabled (bloom, trail, caustics active)").
    // Without it, emissive surfaces read as flat coloured shapes rather than as
    // anything bioluminescent.
    this.composer = new EffectComposer(this.renderer);
    this.composer.addPass(new RenderPass(this.scene, this.camera));
    this.bloomPass = new UnrealBloomPass(
      new THREE.Vector2(window.innerWidth * 0.5, window.innerHeight * 0.5),
      cfg.visual.bloomStrength,
      cfg.visual.bloomRadius,
      cfg.visual.bloomThreshold
    );
    this.composer.addPass(this.bloomPass);
    this.composer.setSize(window.innerWidth, window.innerHeight);

    this.gpuName = readGpuName(this.renderer.getContext());
    window.addEventListener("resize", this.handleResize);
  }

  /**
   * Swap every material for flat white (obstacles) or black (everything else)
   * so a render produces a silhouette mask. Used only by the contrast probe
   * (Part 3.4 / 6.5); never during play.
   */
  setMaskMode(enabled: boolean): void {
    if (enabled === this.maskMode) return;
    this.maskMode = enabled;

    if (enabled) {
      // The trail is additive and depth-write-disabled during play. Swapping it
      // for an opaque black material would make it a depth-writing occluder and
      // punch false holes in the silhouette mask, so it is hidden instead.
      this.trail.mesh.visible = false;
      this.scene.traverse((object) => {
        if (!(object instanceof THREE.Mesh)) return;
        this.savedMaterials.set(object, object.material);
        object.material = object.userData["isObstacle"] ? this.maskObstacle : this.maskOther;
      });
    } else {
      for (const [mesh, material] of this.savedMaterials) mesh.material = material;
      this.savedMaterials.clear();
      this.trail.mesh.visible = true;
    }
  }

  /**
   * Read the framebuffer. Must run synchronously after a render, before the
   * browser composites, or the buffer is already gone.
   */
  capturePixels(): { pixels: Uint8Array; width: number; height: number } {
    const gl = this.renderer.getContext();
    const width = this.renderer.domElement.width;
    const height = this.renderer.domElement.height;
    const pixels = new Uint8Array(width * height * 4);
    gl.readPixels(0, 0, width, height, gl.RGBA, gl.UNSIGNED_BYTE, pixels);
    return { pixels, width, height };
  }

  /** Limit which obstacles count as silhouettes, by view depth. */
  setMaskMaxDepth(depth: number): void {
    const uniform = this.maskObstacle.uniforms["uMaxDepth"];
    if (uniform) uniform.value = depth;
  }

  /** Render the silhouette mask directly, bypassing post-processing. */
  renderMask(): void {
    this.renderer.render(this.scene, this.camera);
  }

  /**
   * Render the scene with no post-processing. Used by the probe to separate a
   * genuine contrast problem from bloom bleed: a bright edge glows outward onto
   * the pixels being sampled as background, which lowers measured contrast
   * without the obstacle itself being any harder to see.
   */
  renderWithoutBloom(): void {
    this.renderer.render(this.scene, this.camera);
  }

  /** Clear the ribbon so it does not streak across a fresh run. */
  resetTrail(): void {
    this.trail.reset();
  }

  /** Apply a quality tier (Part 4.6 dynamic scaling). */
  setQuality(settings: TierSettings): void {
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, settings.pixelRatioCap));
    this.renderer.setSize(window.innerWidth, window.innerHeight, false);

    this.bloomEnabled = settings.bloomEnabled;
    this.bloomPass.enabled = settings.bloomEnabled;
    this.bloomPass.resolution.set(
      Math.max(64, window.innerWidth * settings.bloomResolutionScale),
      Math.max(64, window.innerHeight * settings.bloomResolutionScale)
    );

    const octaves = settings.causticsEnabled ? settings.causticOctaves : 1;
    setCausticOctaves(this.floorMaterial, octaves);
    setCausticOctaves(this.wallMaterial, octaves);

    const intensityScale = settings.causticsEnabled ? 1 : 0;
    const floorIntensity = this.floorMaterial.uniforms["uIntensity"];
    const wallIntensity = this.wallMaterial.uniforms["uIntensity"];
    if (floorIntensity) {
      floorIntensity.value = this.cfg.visual.causticIntensityFloor * intensityScale;
    }
    if (wallIntensity) {
      wallIntensity.value = this.cfg.visual.causticIntensityWall * intensityScale;
    }
  }

  /** Live draw-call and triangle counts, for the Part 4.6 budget check. */
  stats(): { drawCalls: number; triangles: number } {
    return {
      drawCalls: this.renderer.info.render.calls,
      triangles: this.renderer.info.render.triangles
    };
  }

  private handleResize = (): void => {
    this.camera.aspect = window.innerWidth / window.innerHeight;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(window.innerWidth, window.innerHeight, false);
    this.composer.setSize(window.innerWidth, window.innerHeight);
  };

  /**
   * Update visuals from simulation state and render.
   *
   * `lightFraction` drives creature body brightness; `momentum` drives camera
   * and hue. Keeping those on separate visual channels is the split proposed in
   * ADR-0006 — it needs real validation in Phase 3, not assertion here.
   */
  render(
    sim: SimState,
    gates: readonly Gate[],
    lightFraction: number,
    elapsedSec: number,
    frameSec: number
  ): void {
    const cfg = this.cfg;
    this.renderer.info.reset();
    advanceCausticTime(this.floorMaterial, elapsedSec, cfg.visual.causticSpeed);
    advanceCausticTime(this.wallMaterial, elapsedSec, cfg.visual.causticSpeed);
    const momentumFraction =
      cfg.momentum.ceiling === 0 ? 0 : sim.momentum / cfg.momentum.ceiling;
    const worldZ = -sim.forwardDistance;

    // --- creature (Part 3.1) ---
    this.creature.group.position.set(sim.lateralPosition, 0, worldZ);
    this.creature.update(momentumFraction, lightFraction, sim.smoothedSteering, frameSec);

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

    // Obstacle caustics drift cyan -> magenta with momentum, which gives the
    // Part 3.4 palette its range and ties the world's colour to the same value
    // driving speed and trail (Part 2.2).
    this.wallCausticScratch
      .copy(this.wallCausticBase)
      .lerp(this.wallCausticHot, momentumFraction * cfg.visual.causticMagentaShiftAtMaxMomentum);
    const wallColour = this.wallMaterial.uniforms["uCausticColor"];
    if (wallColour) (wallColour.value as THREE.Color).copy(this.wallCausticScratch);

    this.trail.update(
      sim.lateralPosition,
      sim.forwardDistance,
      momentumFraction,
      0,
      frameSec
    );

    this.updateStripes(sim.forwardDistance);
    this.updateGates(sim.forwardDistance, gates);

    if (this.bloomEnabled) this.composer.render();
    else this.renderer.render(this.scene, this.camera);
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
    this.trail.dispose();
    this.creature.dispose();
    this.maskObstacle.dispose();
    this.maskOther.dispose();
    this.composer.dispose();
    this.renderer.dispose();
  }
}
