/**
 * Production renderer for the Phase 3B Moon-Garden vertical slice.
 *
 * Gameplay remains bound to deterministic simulation data. Repeated art is
 * instanced, LOD-bucketed and hard-capped; no art collection grows per frame.
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
import {
  tierSettings,
  type QualityTier,
  type TierSettings
} from "../perf/quality";
import { readGpuName } from "../perf/metrics";
import { TrailRibbon } from "./trail";
import { Creature } from "./creature";
import { Environment } from "./environment";
import { MoonGardenGates } from "./gateArt";
import { EffectComposer } from "three/examples/jsm/postprocessing/EffectComposer.js";
import { RenderPass } from "three/examples/jsm/postprocessing/RenderPass.js";
import { UnrealBloomPass } from "three/examples/jsm/postprocessing/UnrealBloomPass.js";

/** Hard caps. Part 4.6 requires pool sizes be part of the performance budget. */
const MAX_POOLED_STRIPES = 40;
const STRIPE_SPACING_UNITS = 14;

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

export class GameView {
  readonly scene = new THREE.Scene();
  readonly camera: THREE.PerspectiveCamera;
  private readonly renderer: THREE.WebGLRenderer;

  private readonly creature: Creature;
  private readonly environment: Environment;
  private readonly gates: MoonGardenGates;
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
    // The mask represents authoritative collision truth, not what happened to
    // win the beauty render's depth test. Drawing it through depth makes a
    // visually occluded seam disappear from the evidence instead of producing
    // the low-contrast samples that should block release.
    depthTest: false,
    depthWrite: false,
    vertexShader: `
      varying float vDepth;
      void main() {
        vec4 localPosition = vec4(position, 1.0);
        #ifdef USE_INSTANCING
          localPosition = instanceMatrix * localPosition;
        #endif
        vec4 mv = modelViewMatrix * localPosition;
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
  /** Obstacle art outside the authoritative playable contour: ignore, not background. */
  private readonly maskObstacleContext = new THREE.MeshBasicMaterial({ color: 0x808080 });
  private readonly maskOther = new THREE.MeshBasicMaterial({ color: 0x000000 });
  private readonly savedMaterials = new Map<THREE.Mesh, THREE.Material | THREE.Material[]>();
  private maskMode = false;
  readonly gpuName: string;
  private readonly speedInlays: THREE.InstancedMesh;
  private readonly speedInlayMatrix = new THREE.Matrix4();
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

    this.scene.background = new THREE.Color(0x020916);
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
      0x071425,
      cfg.readability.visibleAheadUnits * cfg.visual.fogNearMultiplier,
      cfg.readability.visibleAheadUnits * cfg.visual.fogFarMultiplier
    );

    this.camera = new THREE.PerspectiveCamera(
      cfg.camera.fovAtZeroMomentum,
      window.innerWidth / window.innerHeight,
      0.1,
      cfg.readability.visibleAheadUnits * (cfg.visual.fogFarMultiplier + 0.4)
    );

    this.scene.add(new THREE.HemisphereLight(0x6fb8db, 0x06111f, 1.35));
    this.scene.add(new THREE.AmbientLight(0x356d91, 0.7));
    const key = new THREE.DirectionalLight(0xb9edff, 1.25);
    key.position.set(0.4, 1, 0.6);
    this.scene.add(key);

    const halfWidth = cfg.lane.halfWidth;

    const fogNear = cfg.readability.visibleAheadUnits * cfg.visual.fogNearMultiplier;
    const fogFar = cfg.readability.visibleAheadUnits * cfg.visual.fogFarMultiplier;

    // --- grounded seabed and readable Moon-Garden route ---
    //
    // The old floor ended exactly at the lane boundary, leaving coral and
    // ruins floating against black. A broad seabed now grounds the ecology,
    // while the narrower route keeps the playable corridor legible.
    const seabedGeo = new THREE.PlaneGeometry(72, 4000);
    const seabedMaterial = new THREE.MeshStandardMaterial({
      color: 0x061522,
      roughness: 1,
      metalness: 0
    });
    const seabed = new THREE.Mesh(seabedGeo, seabedMaterial);
    seabed.rotation.x = -Math.PI / 2;
    seabed.position.y = -1.08;
    this.scene.add(seabed);
    this.disposables.push(seabedGeo, seabedMaterial);

    const floorGeo = new THREE.PlaneGeometry(halfWidth * 2.05, 4000);
    this.floorMaterial = createCausticMaterial({
      baseColor: 0x10293b,
      causticColor: 0x2ea8d8,
      scale: cfg.visual.causticScaleFloor,
      intensity: cfg.visual.causticIntensityFloor,
      sharpness: cfg.visual.causticSharpness,
      speed: cfg.visual.causticSpeed,
      fogColor: 0x071425,
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
    const navigationMaterial = new THREE.MeshStandardMaterial({
      color: 0x143748,
      emissive: 0x17465d,
      emissiveIntensity: 0.42,
      roughness: 0.82
    });
    for (const sign of [-1, 1]) {
      const edge = new THREE.Mesh(edgeGeo, navigationMaterial);
      edge.position.set(sign * halfWidth, -0.8, 0);
      this.scene.add(edge);
    }
    this.disposables.push(edgeGeo, navigationMaterial);

    // --- submerged crescent inlays: one instanced draw, not forty debug bars ---
    const inlayGeo = new THREE.TorusGeometry(
      0.66,
      0.035,
      4,
      22,
      Math.PI * 1.18
    );
    inlayGeo.rotateX(-Math.PI / 2);
    inlayGeo.rotateZ(-Math.PI * 0.59);
    inlayGeo.scale(halfWidth * 0.73, 1, 1.45);
    const inlayMaterial = new THREE.MeshBasicMaterial({
      color: 0x55bdd7,
      transparent: true,
      opacity: 0.22,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      toneMapped: false
    });
    this.speedInlays = new THREE.InstancedMesh(
      inlayGeo,
      inlayMaterial,
      MAX_POOLED_STRIPES
    );
    this.speedInlays.frustumCulled = false;
    this.speedInlays.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.scene.add(this.speedInlays);
    this.disposables.push(inlayGeo, inlayMaterial);

    // --- game-ready wall-fragment kit with independently truthful contours ---
    this.gates = new MoonGardenGates(cfg);
    this.wallMaterial = this.gates.material;
    for (const object of this.gates.objects) this.scene.add(object);

    // --- creature (Part 3.1) ---
    this.creature = new Creature(cfg);
    this.scene.add(this.creature.group);

    // --- drowned city, god-rays, responsive coral (Part 3.2 #3 and #5) ---
    this.environment = new Environment(cfg);
    for (const object of this.environment.objects) this.scene.add(object);

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
        object.material = object.userData["isObstacle"]
          ? this.maskObstacle
          : object.userData["isObstacleContext"]
            ? this.maskObstacleContext
            : this.maskOther;
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

  /** Current internal-to-CSS pixel scale, used to keep probe offsets resolution-aware. */
  capturePixelRatio(): number {
    return this.renderer.getPixelRatio();
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

  /** Clear the ribbon and any live coral glow so a fresh run starts clean. */
  resetTrail(): void {
    this.trail.reset();
    this.environment.reset();
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

  /**
   * Deterministic capture override. Unlike normal adaptive quality, the art
   * matrix must be able to force bloom and caustics independently.
   */
  setCaptureEffects(
    quality: QualityTier,
    bloom: boolean,
    caustics: boolean
  ): void {
    const settings = tierSettings(quality);
    this.setQuality(settings);

    this.bloomEnabled = bloom;
    this.bloomPass.enabled = bloom;

    const floorIntensity = this.floorMaterial.uniforms["uIntensity"];
    const wallIntensity = this.wallMaterial.uniforms["uIntensity"];
    if (floorIntensity) {
      floorIntensity.value = caustics
        ? this.cfg.visual.causticIntensityFloor
        : 0;
    }
    if (wallIntensity) {
      wallIntensity.value = caustics
        ? this.cfg.visual.causticIntensityWall
        : 0;
    }
  }

  /** Metrics the capture harness cannot infer reliably from render.info. */
  artStats(): {
    activeMaterials: number;
    godRayMeshes: number;
    textureMemoryMB: number;
  } {
    const materials = new Set<string>();
    this.scene.traverse((object) => {
      if (!(object instanceof THREE.Mesh) || !object.visible) return;
      const list = Array.isArray(object.material)
        ? object.material
        : [object.material];
      for (const material of list) materials.add(material.uuid);
    });
    return {
      activeMaterials: materials.size,
      godRayMeshes: this.cfg.environment.godRayCount,
      // This code-native slice uses vertex colour and shaders, not textures.
      textureMemoryMB: 0
    };
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
    const collisionFraction = cfg.momentum.stunDurationSec <= 0
      ? 0
      : Math.min(1, sim.stunRemainingSec / cfg.momentum.stunDurationSec);
    const recoveryFraction =
      sim.stunRemainingSec <= 0 &&
      cfg.momentum.invulnerabilityDurationSec > 0
        ? Math.min(
          1,
          sim.invulnerableRemainingSec /
            cfg.momentum.invulnerabilityDurationSec
        )
        : 0;
    this.creature.update(
      momentumFraction,
      lightFraction,
      sim.smoothedSteering,
      frameSec,
      collisionFraction,
      recoveryFraction
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

    this.environment.update(
      sim.forwardDistance,
      sim.lateralPosition,
      momentumFraction
    );

    this.updateStripes(sim.forwardDistance);
    this.gates.update(
      sim.forwardDistance,
      gates,
      this.camera,
      this.renderer.domElement.clientHeight || window.innerHeight
    );

    if (this.bloomEnabled) this.composer.render();
    else this.renderer.render(this.scene, this.camera);
  }

  private updateStripes(distance: number): void {
    const first = Math.floor((distance - 20) / STRIPE_SPACING_UNITS);
    for (let i = 0; i < MAX_POOLED_STRIPES; i++) {
      this.speedInlayMatrix.makeTranslation(
        0,
        -0.985,
        -(first + i) * STRIPE_SPACING_UNITS
      );
      this.speedInlays.setMatrixAt(i, this.speedInlayMatrix);
    }
    this.speedInlays.instanceMatrix.needsUpdate = true;
  }

  /** Release GPU resources. Full context-loss rebuild is Phase 5 (Part 4.3). */
  dispose(): void {
    window.removeEventListener("resize", this.handleResize);
    for (const item of this.disposables) item.dispose();
    this.trail.dispose();
    this.creature.dispose();
    this.environment.dispose();
    this.gates.dispose();
    this.maskObstacle.dispose();
    this.maskObstacleContext.dispose();
    this.maskOther.dispose();
    this.composer.dispose();
    this.renderer.dispose();
  }
}
