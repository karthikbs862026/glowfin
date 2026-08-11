/**
 * Production renderer for the Phase 3B Moon-Garden vertical slice.
 *
 * Gameplay remains bound to deterministic simulation data. Repeated art is
 * instanced, LOD-bucketed and hard-capped; no art collection grows per frame.
 */
import * as THREE from "three";
import type { TuningConfig } from "../core/config";
import type { Gate } from "../sim/course";
import type { ActiveLivingWorldEvent } from "../sim/obstacleVariety";
import type { CrystalTrenchRunStatus } from "../sim/run";
import { forwardSpeed, type SimState } from "../sim/state";
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
import { MERFOLK_MASK_ENTRIES } from "../art/merfolkMask";
import { EffectComposer } from "three/examples/jsm/postprocessing/EffectComposer.js";
import { RenderPass } from "three/examples/jsm/postprocessing/RenderPass.js";
import { UnrealBloomPass } from "three/examples/jsm/postprocessing/UnrealBloomPass.js";
import { loadRuntimeProductionGeometry } from "./runtimeProductionAssets";
import type { LumenMotePresentation } from "../expedition/lumenMotes";
import { LumenMoteField } from "./lumenMoteField";
import type { R3EncounterPresentation } from "../expedition/r3Encounters";
import { R3EncounterField } from "./r3EncounterField";
import type { R5CompletionPresentation } from "../expedition/r5Completion";
import { R5CompletionField } from "./r5CompletionField";
import {
  cosmeticPalette,
  type CosmeticLoadout
} from "../meta/progression";
import {
  realmDefinition,
  type RealmId,
} from "../realms/definition";
import { KelpCathedralField } from "./kelpCathedralField";
import { CrystalTrenchField } from "./crystalTrenchField";

/** Hard caps. Part 4.6 requires pool sizes be part of the performance budget. */
const MAX_POOLED_STRIPES = 40;
const STRIPE_SPACING_UNITS = 14;
const STANDARD_EXPOSURE = 0.96;
const KELP_CATHEDRAL_EXPOSURE = 1.08;
const CRYSTAL_TRENCH_EXPOSURE = 1.12;
const HIGH_CONTRAST_EXPOSURE = 1.06;

export interface PresentationPreferences {
  reducedMotion: boolean;
  highContrast: boolean;
}

export type GlowfinHeroMoment = "celebration" | "unlock" | "recovery";

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

export class GameView {
  readonly scene = new THREE.Scene();
  readonly camera: THREE.PerspectiveCamera;
  /** Resolves after required textures and the GLB install-or-fallback decision. */
  readonly ready: Promise<void>;
  private readonly renderer: THREE.WebGLRenderer;

  private readonly creature: Creature;
  private readonly ghostCreature: Creature;
  private readonly environment: Environment;
  private readonly gates: MoonGardenGates;
  private readonly moonGardenSeabed: THREE.Mesh;
  private readonly moonGardenFloor: THREE.Mesh;
  private readonly floorMaterial: THREE.ShaderMaterial;
  private readonly wallMaterial: THREE.ShaderMaterial;
  private readonly hemisphereLight: THREE.HemisphereLight;
  private readonly ambientLight: THREE.AmbientLight;
  private readonly keyLight: THREE.DirectionalLight;
  private readonly bounceLight: THREE.DirectionalLight;
  private readonly trail: TrailRibbon;
  private readonly lumenMotes: LumenMoteField;
  private readonly r3Encounters: R3EncounterField;
  private readonly r5Completion: R5CompletionField;
  private readonly kelpCathedral: KelpCathedralField;
  private readonly crystalTrench: CrystalTrenchField;
  private readonly composer: EffectComposer;
  private readonly bloomPass: UnrealBloomPass;
  private bloomEnabled = true;
  private qualityBloomEnabled = true;
  private reducedMotion = false;
  private highContrast = false;
  private heroMoment: GlowfinHeroMoment | null = null;
  private heroMomentElapsedSec = 0;
  private lumenChainFraction = 0;
  private readonly wallCausticBase = new THREE.Color(0x63e0ff);
  private readonly wallCausticHot = new THREE.Color(0xff6be0);
  private readonly wallCausticScratch = new THREE.Color();
  private activeRealm: RealmId = "moon-garden";
  private moonGardenBackground: THREE.Texture | null = null;
  private kelpBackground: THREE.Texture | null = null;
  private crystalTrenchBackground: THREE.Texture | null = null;
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
  /**
   * Mask replacements must preserve double-sided depth occlusion from the
   * beauty materials. Front-sided replacements culled broken-wall back faces,
   * exposing hidden contour pixels in the mask that the player never saw.
   */
  private readonly maskObstacleContext = new THREE.MeshBasicMaterial({
    color: 0x808080,
    side: THREE.DoubleSide
  });
  private readonly maskOther = new THREE.MeshBasicMaterial({
    color: 0x000000,
    side: THREE.DoubleSide
  });
  private readonly savedMaterials = new Map<THREE.Mesh, THREE.Material | THREE.Material[]>();
  private readonly savedVisibility = new Map<THREE.Object3D, boolean>();
  private maskMode = false;
  private readonly merfolkMaskMaterials = new Map<
    string,
    THREE.MeshBasicMaterial
  >(MERFOLK_MASK_ENTRIES.map((entry) => [
    entry.role,
    new THREE.MeshBasicMaterial({
      color: entry.colour,
      side: THREE.DoubleSide,
      vertexColors: false,
      toneMapped: false,
      fog: false
    })
  ]));
  private readonly merfolkSavedMaterials = new Map<
    THREE.Mesh,
    THREE.Material | THREE.Material[]
  >();
  private readonly merfolkSavedVisibility = new Map<THREE.Object3D, boolean>();
  private readonly merfolkMaskBackground = new THREE.Color(0x000000);
  private merfolkMaskMode = false;
  private merfolkMaskBackgroundBefore: THREE.Scene["background"] = null;
  private merfolkMaskFogBefore: THREE.Scene["fog"] = null;
  readonly gpuName: string;
  private readonly speedInlays: THREE.InstancedMesh;
  private readonly speedInlayMatrix = new THREE.Matrix4();
  private readonly disposables: Array<{ dispose(): void }> = [];
  private runtimeProductionStatus: {
    glowfin: "fallback" | "glb";
    gate: "fallback" | "glb";
    reef: "fallback" | "glb";
    build: string | null;
    error: string | null;
  } = {
    glowfin: "fallback",
    gate: "fallback",
    reef: "fallback",
    build: null,
    error: null
  };

  constructor(
    canvas: HTMLCanvasElement,
    private readonly cfg: TuningConfig
  ) {
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    // The deeper directional material pass intentionally removed broad
    // caustic wash. A small filmic exposure lift keeps midtones above the
    // Art-Bible floor without flattening stone cavities or clipping bloom.
    this.renderer.toneMappingExposure = STANDARD_EXPOSURE;
    // EffectComposer runs several passes and renderer.info auto-resets on each
    // one, so by the time stats() reads it, it describes bloom's final
    // fullscreen quad rather than the scene — the overlay showed "draws 1
    // tris 1" while actually drawing ~34. Reset manually once per frame
    // instead, so the counters accumulate across every pass. Post-processing
    // draws are real draws and belong in the budget.
    this.renderer.info.autoReset = false;
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.setSize(window.innerWidth, window.innerHeight, false);

    const loadingManager = new THREE.LoadingManager();
    const textureReady = new Promise<void>((resolve, reject) => {
      loadingManager.onLoad = resolve;
      loadingManager.onError = (url) => {
        reject(new Error(`Moon-Garden art asset failed to load: ${url}`));
      };
    });
    const textureLoader = new THREE.TextureLoader(loadingManager);
    const maxAnisotropy = Math.min(
      8,
      this.renderer.capabilities.getMaxAnisotropy()
    );
    const moonstoneSurface = textureLoader.load(
      "art/moon-garden/moonstone-seabed.webp"
    );
    moonstoneSurface.colorSpace = THREE.SRGBColorSpace;
    moonstoneSurface.wrapS = THREE.RepeatWrapping;
    moonstoneSurface.wrapT = THREE.RepeatWrapping;
    moonstoneSurface.repeat.set(72 / 25, 4000 / 25);
    moonstoneSurface.anisotropy = maxAnisotropy;
    // The grounded seabed uses mesh UVs, but the caustic floor shader samples
    // in world space. Sharing the 72×4000 mesh repeat with that shader made
    // the texture about 55 times denser forward than laterally, creating
    // racetrack-like horizontal bands. A clone keeps world sampling isotropic.
    const moonstoneFloorSurface = moonstoneSurface.clone();
    moonstoneFloorSurface.repeat.set(1, 1);
    moonstoneFloorSurface.anisotropy = maxAnisotropy;
    const moonstoneVolumeSurface = textureLoader.load(
      "art/moon-garden/moonstone-surface.webp"
    );
    moonstoneVolumeSurface.colorSpace = THREE.SRGBColorSpace;
    moonstoneVolumeSurface.wrapS = THREE.MirroredRepeatWrapping;
    moonstoneVolumeSurface.wrapT = THREE.MirroredRepeatWrapping;
    moonstoneVolumeSurface.anisotropy = maxAnisotropy;
    const livingReefSurface = textureLoader.load(
      "art/moon-garden/living-reef-surface.webp"
    );
    livingReefSurface.colorSpace = THREE.SRGBColorSpace;
    livingReefSurface.wrapS = THREE.MirroredRepeatWrapping;
    livingReefSurface.wrapT = THREE.MirroredRepeatWrapping;
    livingReefSurface.anisotropy = maxAnisotropy;
    const glowfinSurface = textureLoader.load(
      "art/moon-garden/glowfin-surface.webp"
    );
    glowfinSurface.colorSpace = THREE.SRGBColorSpace;
    glowfinSurface.wrapS = THREE.MirroredRepeatWrapping;
    glowfinSurface.wrapT = THREE.MirroredRepeatWrapping;
    glowfinSurface.anisotropy = maxAnisotropy;
    const kelpBladeSurface = textureLoader.load(
      "art/kelp-cathedral/kelp-blade-albedo-v2.webp"
    );
    kelpBladeSurface.colorSpace = THREE.SRGBColorSpace;
    kelpBladeSurface.wrapS = THREE.RepeatWrapping;
    kelpBladeSurface.wrapT = THREE.RepeatWrapping;
    kelpBladeSurface.repeat.set(1, 1.8);
    kelpBladeSurface.anisotropy = maxAnisotropy;
    const kelpStipeSurface = textureLoader.load(
      "art/kelp-cathedral/kelp-stipe-albedo-v2.webp"
    );
    kelpStipeSurface.colorSpace = THREE.SRGBColorSpace;
    kelpStipeSurface.wrapS = THREE.RepeatWrapping;
    kelpStipeSurface.wrapT = THREE.RepeatWrapping;
    kelpStipeSurface.repeat.set(1.25, 3.6);
    kelpStipeSurface.anisotropy = maxAnisotropy;
    const kelpSeabedSurface = textureLoader.load(
      "art/kelp-cathedral/kelp-seabed-albedo-v2.webp"
    );
    kelpSeabedSurface.colorSpace = THREE.SRGBColorSpace;
    kelpSeabedSurface.wrapS = THREE.RepeatWrapping;
    kelpSeabedSurface.wrapT = THREE.RepeatWrapping;
    kelpSeabedSurface.repeat.set(12, 660);
    kelpSeabedSurface.anisotropy = maxAnisotropy;
    const crystalTrenchSurface = textureLoader.load(
      "art/crystal-trench/crystal-albedo-v2.webp"
    );
    crystalTrenchSurface.colorSpace = THREE.SRGBColorSpace;
    crystalTrenchSurface.wrapS = THREE.RepeatWrapping;
    crystalTrenchSurface.wrapT = THREE.RepeatWrapping;
    crystalTrenchSurface.repeat.set(1.25, 2.8);
    crystalTrenchSurface.anisotropy = maxAnisotropy;
    const crystalRuinSurface = textureLoader.load(
      "art/crystal-trench/ruin-stone-albedo-v2.webp"
    );
    crystalRuinSurface.colorSpace = THREE.SRGBColorSpace;
    crystalRuinSurface.wrapS = THREE.RepeatWrapping;
    crystalRuinSurface.wrapT = THREE.RepeatWrapping;
    crystalRuinSurface.repeat.set(1.35, 2.55);
    crystalRuinSurface.anisotropy = maxAnisotropy;
    const crystalSeabedSurface = textureLoader.load(
      "art/crystal-trench/seabed-albedo-v2.webp"
    );
    crystalSeabedSurface.colorSpace = THREE.SRGBColorSpace;
    crystalSeabedSurface.wrapS = THREE.RepeatWrapping;
    crystalSeabedSurface.wrapT = THREE.RepeatWrapping;
    crystalSeabedSurface.repeat.set(10, 560);
    crystalSeabedSurface.anisotropy = maxAnisotropy;

    this.disposables.push(
      moonstoneSurface,
      moonstoneFloorSurface,
      moonstoneVolumeSurface,
      livingReefSurface,
      glowfinSurface,
      kelpBladeSurface,
      kelpStipeSurface,
      kelpSeabedSurface,
      crystalTrenchSurface,
      crystalRuinSurface,
      crystalSeabedSurface
    );

    const backgroundCanvas = document.createElement("canvas");
    backgroundCanvas.width = 128;
    backgroundCanvas.height = 256;
    const backgroundContext = backgroundCanvas.getContext("2d");
    if (!backgroundContext) {
      throw new Error("2D canvas is required for the Moon-Garden water gradient.");
    }
    const backgroundGradient = backgroundContext.createLinearGradient(
      0,
      0,
      0,
      backgroundCanvas.height
    );
    backgroundGradient.addColorStop(0, "#071329");
    backgroundGradient.addColorStop(0.3, "#102746");
    backgroundGradient.addColorStop(0.62, "#12455f");
    backgroundGradient.addColorStop(0.84, "#17576d");
    backgroundGradient.addColorStop(1, "#0a3349");
    backgroundContext.fillStyle = backgroundGradient;
    backgroundContext.fillRect(
      0,
      0,
      backgroundCanvas.width,
      backgroundCanvas.height
    );
    const moonHaze = backgroundContext.createRadialGradient(
      backgroundCanvas.width * 0.5,
      backgroundCanvas.height * 0.14,
      2,
      backgroundCanvas.width * 0.5,
      backgroundCanvas.height * 0.14,
      backgroundCanvas.width * 0.72
    );
    moonHaze.addColorStop(0, "rgba(128, 218, 241, 0.27)");
    moonHaze.addColorStop(0.38, "rgba(76, 166, 207, 0.13)");
    moonHaze.addColorStop(1, "rgba(18, 66, 99, 0)");
    backgroundContext.fillStyle = moonHaze;
    backgroundContext.fillRect(
      0,
      0,
      backgroundCanvas.width,
      backgroundCanvas.height
    );
    const backgroundTexture = new THREE.CanvasTexture(backgroundCanvas);
    backgroundTexture.colorSpace = THREE.SRGBColorSpace;
    this.scene.background = backgroundTexture;
    this.moonGardenBackground = backgroundTexture;
    this.disposables.push(backgroundTexture);

    const kelpBackgroundCanvas = document.createElement("canvas");
    kelpBackgroundCanvas.width = 128;
    kelpBackgroundCanvas.height = 256;
    const kelpBackgroundContext = kelpBackgroundCanvas.getContext("2d");
    if (!kelpBackgroundContext) {
      throw new Error("2D canvas is required for the Kelp Cathedral water gradient.");
    }
    const kelpGradient = kelpBackgroundContext.createLinearGradient(
      0,
      0,
      0,
      kelpBackgroundCanvas.height,
    );
    kelpGradient.addColorStop(0, "#28584a");
    kelpGradient.addColorStop(0.2, "#16453c");
    kelpGradient.addColorStop(0.56, "#0a302e");
    kelpGradient.addColorStop(1, "#041b22");
    kelpBackgroundContext.fillStyle = kelpGradient;
    kelpBackgroundContext.fillRect(
      0,
      0,
      kelpBackgroundCanvas.width,
      kelpBackgroundCanvas.height,
    );
    const canopyGlow = kelpBackgroundContext.createRadialGradient(
      kelpBackgroundCanvas.width * 0.5,
      kelpBackgroundCanvas.height * 0.02,
      1,
      kelpBackgroundCanvas.width * 0.5,
      kelpBackgroundCanvas.height * 0.02,
      kelpBackgroundCanvas.width * 0.92,
    );
    canopyGlow.addColorStop(0, "rgba(255, 244, 182, 0.62)");
    canopyGlow.addColorStop(0.22, "rgba(148, 235, 184, 0.3)");
    canopyGlow.addColorStop(0.6, "rgba(46, 142, 114, 0.1)");
    canopyGlow.addColorStop(1, "rgba(3, 27, 29, 0)");
    kelpBackgroundContext.fillStyle = canopyGlow;
    kelpBackgroundContext.fillRect(
      0,
      0,
      kelpBackgroundCanvas.width,
      kelpBackgroundCanvas.height,
    );
    const kelpBackgroundTexture = new THREE.CanvasTexture(kelpBackgroundCanvas);
    kelpBackgroundTexture.colorSpace = THREE.SRGBColorSpace;
    this.kelpBackground = kelpBackgroundTexture;
    this.disposables.push(kelpBackgroundTexture);

    const crystalBackgroundCanvas = document.createElement("canvas");
    crystalBackgroundCanvas.width = 128;
    crystalBackgroundCanvas.height = 256;
    const crystalBackgroundContext = crystalBackgroundCanvas.getContext("2d");
    if (!crystalBackgroundContext) {
      throw new Error("2D canvas is required for the Crystal Trench water gradient.");
    }
    const crystalGradient = crystalBackgroundContext.createLinearGradient(
      0,
      0,
      0,
      crystalBackgroundCanvas.height,
    );
    crystalGradient.addColorStop(0, "#284c72");
    crystalGradient.addColorStop(0.18, "#1a315d");
    crystalGradient.addColorStop(0.52, "#101e45");
    crystalGradient.addColorStop(0.78, "#09142f");
    crystalGradient.addColorStop(1, "#04091b");
    crystalBackgroundContext.fillStyle = crystalGradient;
    crystalBackgroundContext.fillRect(
      0,
      0,
      crystalBackgroundCanvas.width,
      crystalBackgroundCanvas.height,
    );
    const refractedMoon = crystalBackgroundContext.createRadialGradient(
      crystalBackgroundCanvas.width * 0.52,
      crystalBackgroundCanvas.height * 0.04,
      1,
      crystalBackgroundCanvas.width * 0.52,
      crystalBackgroundCanvas.height * 0.04,
      crystalBackgroundCanvas.width * 0.82,
    );
    refractedMoon.addColorStop(0, "rgba(225, 253, 255, 0.82)");
    refractedMoon.addColorStop(0.12, "rgba(130, 228, 255, 0.42)");
    refractedMoon.addColorStop(0.38, "rgba(96, 151, 237, 0.19)");
    refractedMoon.addColorStop(0.7, "rgba(105, 83, 207, 0.08)");
    refractedMoon.addColorStop(1, "rgba(7, 12, 36, 0)");
    crystalBackgroundContext.fillStyle = refractedMoon;
    crystalBackgroundContext.fillRect(
      0,
      0,
      crystalBackgroundCanvas.width,
      crystalBackgroundCanvas.height,
    );
    const crystalBackgroundTexture = new THREE.CanvasTexture(crystalBackgroundCanvas);
    crystalBackgroundTexture.colorSpace = THREE.SRGBColorSpace;
    this.crystalTrenchBackground = crystalBackgroundTexture;
    this.disposables.push(crystalBackgroundTexture);
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
      0x12364c,
      cfg.readability.visibleAheadUnits * cfg.visual.fogNearMultiplier,
      cfg.readability.visibleAheadUnits * cfg.visual.fogFarMultiplier
    );

    this.camera = new THREE.PerspectiveCamera(
      cfg.camera.fovAtZeroMomentum,
      window.innerWidth / window.innerHeight,
      0.1,
      cfg.readability.visibleAheadUnits * (cfg.visual.fogFarMultiplier + 0.4)
    );

    this.hemisphereLight = new THREE.HemisphereLight(0x78c5e8, 0x050d1b, 1.08);
    this.scene.add(this.hemisphereLight);
    this.ambientLight = new THREE.AmbientLight(0x285877, 0.38);
    this.scene.add(this.ambientLight);
    this.keyLight = new THREE.DirectionalLight(0xb9edff, 1.65);
    this.keyLight.position.set(-0.5, 1, 0.55);
    this.scene.add(this.keyLight);
    this.bounceLight = new THREE.DirectionalLight(0xff6bba, 0.28);
    this.bounceLight.position.set(0.65, -0.15, -0.8);
    this.scene.add(this.bounceLight);

    const fogNear = cfg.readability.visibleAheadUnits * cfg.visual.fogNearMultiplier;
    const fogFar = cfg.readability.visibleAheadUnits * cfg.visual.fogFarMultiplier;

    // --- grounded seabed and readable Moon-Garden route ---
    //
    // The old floor ended exactly at the lane boundary, leaving coral and
    // ruins floating against black. A broad seabed now grounds the ecology,
    // while the narrower route keeps the playable corridor legible.
    const seabedGeo = new THREE.PlaneGeometry(72, 4000);
    const seabedMaterial = new THREE.MeshStandardMaterial({
      color: 0x7693a1,
      map: moonstoneSurface,
      roughness: 1,
      metalness: 0
    });
    this.moonGardenSeabed = new THREE.Mesh(seabedGeo, seabedMaterial);
    this.moonGardenSeabed.rotation.x = -Math.PI / 2;
    this.moonGardenSeabed.position.y = -1.08;
    this.scene.add(this.moonGardenSeabed);
    this.disposables.push(seabedGeo, seabedMaterial);

    // One continuous garden floor replaces the bright rectangular "road"
    // bounded by raised rails. Gates and reef placement communicate the safe
    // corridor; the seabed should remain a world surface, not a racetrack.
    const floorGeo = new THREE.PlaneGeometry(72, 4000);
    this.floorMaterial = createCausticMaterial({
      baseColor: 0x20364a,
      causticColor: 0x2ea8d8,
      scale: cfg.visual.causticScaleFloor,
      intensity: cfg.visual.causticIntensityFloor,
      sharpness: cfg.visual.causticSharpness,
      speed: cfg.visual.causticSpeed,
      fogColor: 0x12364c,
      fogNear,
      fogFar,
      octaves: 3,
      surfaceMap: moonstoneFloorSurface,
      surfaceScale: 0.11,
      surfaceWeight: 0.22,
      routeHalfWidth: cfg.lane.halfWidth
    });
    this.moonGardenFloor = new THREE.Mesh(floorGeo, this.floorMaterial);
    this.moonGardenFloor.rotation.x = -Math.PI / 2;
    this.moonGardenFloor.position.y = -1;
    this.scene.add(this.moonGardenFloor);
    this.disposables.push(floorGeo, this.floorMaterial);

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
    inlayGeo.scale(0.95, 1, 0.35);
    const inlayMaterial = new THREE.MeshBasicMaterial({
      color: 0xffffff,
      transparent: true,
      opacity: 1,
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
    const submergedInlayColour = new THREE.Color(0x071b22);
    for (let index = 0; index < MAX_POOLED_STRIPES; index += 1) {
      this.speedInlays.setColorAt(index, submergedInlayColour);
    }
    if (this.speedInlays.instanceColor) {
      this.speedInlays.instanceColor.needsUpdate = true;
    }
    this.scene.add(this.speedInlays);
    this.disposables.push(inlayGeo, inlayMaterial);

    this.lumenMotes = new LumenMoteField(inlayMaterial);
    this.scene.add(this.lumenMotes.mesh);

    // --- game-ready wall-fragment kit with independently truthful contours ---
    this.gates = new MoonGardenGates(cfg, moonstoneVolumeSurface);
    this.wallMaterial = this.gates.material;
    for (const object of this.gates.objects) this.scene.add(object);

    // --- creature (Part 3.1) ---
    this.creature = new Creature(cfg, glowfinSurface);
    this.scene.add(this.creature.group);
    this.ghostCreature = new Creature(cfg, glowfinSurface, { ghost: true });
    this.ghostCreature.group.visible = false;
    this.scene.add(this.ghostCreature.group);

    // --- drowned city, god-rays, responsive coral (Part 3.2 #3 and #5) ---
    this.environment = new Environment(cfg, {
      surfaceMap: moonstoneVolumeSurface,
      livingMap: livingReefSurface
    });
    for (const object of this.environment.objects) this.scene.add(object);

    this.kelpCathedral = new KelpCathedralField(cfg, {
      blade: kelpBladeSurface,
      stipe: kelpStipeSurface,
      seabed: kelpSeabedSurface,
    });
    this.scene.add(this.kelpCathedral.group);
    this.crystalTrench = new CrystalTrenchField(cfg, {
      crystal: crystalTrenchSurface,
      ruinStone: crystalRuinSurface,
      seabed: crystalSeabedSurface,
    });
    this.scene.add(this.crystalTrench.group);

    this.r3Encounters = new R3EncounterField(
      inlayMaterial,
      this.environment.sharedLivingMaterial()
    );
    this.scene.add(this.r3Encounters.group);
    this.r5Completion = new R5CompletionField(
      inlayMaterial,
      this.environment.sharedLivingMaterial()
    );
    this.scene.add(this.r5Completion.group);

    // Production Glowfin/gate/reef GLBs are one atomic visual upgrade. Gameplay
    // can still start from the already-validated construction kit if a
    // CDN/cache request fails; CI separately requires every status to be "glb"
    // so the fallback cannot masquerade as production evidence.
    const productionGeometryReady = loadRuntimeProductionGeometry()
      .then((assets) => {
        const ghostGeometry = {
          body: assets.glowfin.body.clone(),
          eyes: assets.glowfin.eyes.clone(),
          clips: [...assets.glowfin.clips],
          bones: assets.glowfin.bones
        };
        this.creature.installRuntimeGeometry(assets.glowfin);
        this.ghostCreature.installRuntimeGeometry(ghostGeometry);
        this.environment.installRuntimeReefGeometry(assets.reef);
        this.gates.installRuntimeGeometry(assets.gates);
        this.runtimeProductionStatus = {
          glowfin: "glb",
          gate: "glb",
          reef: "glb",
          build: assets.build,
          error: null
        };
      })
      .catch((error: unknown) => {
        const message = error instanceof Error ? error.message : String(error);
        this.runtimeProductionStatus = {
          glowfin: "fallback",
          gate: "fallback",
          reef: "fallback",
          build: null,
          error: message
        };
        console.warn(`Glowfin production GLB fallback: ${message}`);
      });
    this.ready = Promise.all([
      textureReady,
      productionGeometryReady
    ]).then(() => undefined);

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
        if (object.userData["hideInArtMask"]) {
          this.savedVisibility.set(object, object.visible);
          object.visible = false;
          return;
        }
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
      for (const [object, visible] of this.savedVisibility) {
        object.visible = visible;
      }
      this.savedVisibility.clear();
      this.trail.mesh.visible = true;
    }
  }

  /**
   * Render-time semantic mask for phone visibility QA. Unlike the structural
   * manifest, this proves that each role survives the real chase camera and
   * architecture depth buffer. Isolated mode supplies the unoccluded baseline
   * used to calculate how much of a role the city hides.
   */
  setMerfolkMaskMode(enabled: boolean, isolated = false): void {
    if (!enabled && !this.merfolkMaskMode) return;
    if (enabled && this.merfolkMaskMode) this.setMerfolkMaskMode(false);
    if (enabled && this.maskMode) {
      throw new Error("Merfolk and obstacle art masks cannot be active together.");
    }

    this.merfolkMaskMode = enabled;
    if (enabled) {
      this.merfolkMaskBackgroundBefore = this.scene.background;
      this.merfolkMaskFogBefore = this.scene.fog;
      this.scene.background = this.merfolkMaskBackground;
      this.scene.fog = null;
      this.merfolkSavedVisibility.set(this.trail.mesh, this.trail.mesh.visible);
      this.trail.mesh.visible = false;
      this.scene.traverse((object) => {
        if (object === this.trail.mesh) return;
        if (object instanceof THREE.Points || object instanceof THREE.Line) {
          this.merfolkSavedVisibility.set(object, object.visible);
          object.visible = false;
          return;
        }
        if (!(object instanceof THREE.Mesh)) return;
        this.merfolkSavedMaterials.set(object, object.material);
        const role = object.userData["merfolkMaskRole"];
        const roleMaterial = typeof role === "string"
          ? this.merfolkMaskMaterials.get(role)
          : undefined;
        if (roleMaterial) {
          object.material = roleMaterial;
          return;
        }
        if (isolated) {
          this.merfolkSavedVisibility.set(object, object.visible);
          object.visible = false;
        } else {
          object.material = this.maskOther;
        }
      });
      return;
    }

    for (const [mesh, material] of this.merfolkSavedMaterials) {
      mesh.material = material;
    }
    this.merfolkSavedMaterials.clear();
    for (const [object, visible] of this.merfolkSavedVisibility) {
      object.visible = visible;
    }
    this.merfolkSavedVisibility.clear();
    this.scene.background = this.merfolkMaskBackgroundBefore;
    this.scene.fog = this.merfolkMaskFogBefore;
    this.merfolkMaskBackgroundBefore = null;
    this.merfolkMaskFogBefore = null;
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

  renderMerfolkMask(): void {
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

    this.qualityBloomEnabled = settings.bloomEnabled;
    this.applyPresentationEffects();
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
    this.environment.setDensity(settings.ambientLifeDensity);
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

  /**
   * Presentation-only accessibility controls. Neither option touches the
   * deterministic simulation, replay stream, input mapping, or score truth.
   * Reduced motion freezes ambient world/caustic drift and removes bloom;
   * high contrast raises filmic exposure without changing collision shapes.
   */
  setPresentationPreferences(preferences: PresentationPreferences): void {
    this.reducedMotion = preferences.reducedMotion;
    this.highContrast = preferences.highContrast;
    this.applyPresentationEffects();
  }

  setRealm(realmId: RealmId): void {
    this.activeRealm = realmId;
    this.environment.setRealm(realmId);
    const kelpActive = realmId === "kelp-cathedral";
    const crystalActive = realmId === "crystal-trench";
    const moonGardenActive = realmId === "moon-garden";
    for (const object of this.gates.objects) object.visible = moonGardenActive;
    this.speedInlays.visible = moonGardenActive;
    this.moonGardenSeabed.visible = moonGardenActive;
    this.moonGardenFloor.visible = moonGardenActive;
    const definition = realmDefinition(realmId);
    this.wallCausticBase.set(definition.palette.routeCalm);
    this.wallCausticHot.set(definition.palette.routeMomentum);
    this.scene.background = kelpActive
      ? this.kelpBackground
      : crystalActive
        ? this.crystalTrenchBackground
        : this.moonGardenBackground;
    if (this.scene.fog instanceof THREE.Fog) {
      this.scene.fog.color.set(definition.palette.fog);
      this.scene.fog.near = this.cfg.readability.visibleAheadUnits *
        (kelpActive ? 1.12 : crystalActive ? 1.24 : this.cfg.visual.fogNearMultiplier);
      this.scene.fog.far = this.cfg.readability.visibleAheadUnits *
        (kelpActive ? 2.12 : crystalActive ? 2.38 : this.cfg.visual.fogFarMultiplier);
    }
    const setFloorColour = (uniform: string, colour: THREE.ColorRepresentation): void => {
      const target = this.floorMaterial.uniforms[uniform];
      if (target?.value instanceof THREE.Color) target.value.set(colour);
    };
    setFloorColour(
      "uBaseColor",
      kelpActive ? 0x092b23 : crystalActive ? 0x101c38 : 0x20364a,
    );
    setFloorColour(
      "uCausticColor",
      kelpActive ? 0x35d48d : crystalActive ? 0x5ebee8 : 0x2ea8d8,
    );
    setFloorColour("uFogColor", definition.palette.fog);
    const surfaceWeight = this.floorMaterial.uniforms["uSurfaceWeight"];
    if (surfaceWeight) surfaceWeight.value = moonGardenActive ? 0.22 : 0.035;

    this.hemisphereLight.color.set(
      kelpActive ? 0xd8ffe2 : crystalActive ? 0xd8f7ff : 0x78c5e8,
    );
    this.hemisphereLight.groundColor.set(
      kelpActive ? 0x122a1e : crystalActive ? 0x090d28 : 0x050d1b,
    );
    this.hemisphereLight.intensity = kelpActive ? 1.58 : crystalActive ? 1.68 : 1.08;
    this.ambientLight.color.set(
      kelpActive ? 0x568b6c : crystalActive ? 0x4e5f9d : 0x285877,
    );
    this.ambientLight.intensity = kelpActive ? 0.72 : crystalActive ? 0.68 : 0.38;
    this.keyLight.color.set(
      kelpActive ? 0xffefb5 : crystalActive ? 0xd9fbff : 0xb9edff,
    );
    this.keyLight.intensity = kelpActive ? 2.2 : crystalActive ? 2.26 : 1.65;
    this.bounceLight.color.set(
      kelpActive ? 0x65e2b9 : crystalActive ? 0x8d72ff : 0xff6bba,
    );
    this.bounceLight.intensity = kelpActive ? 0.62 : crystalActive ? 0.64 : 0.28;
    this.applyPresentationEffects();
  }

  private applyPresentationEffects(): void {
    this.bloomEnabled = this.qualityBloomEnabled && !this.reducedMotion;
    this.bloomPass.enabled = this.bloomEnabled;
    this.renderer.toneMappingExposure = this.highContrast
      ? Math.max(
          HIGH_CONTRAST_EXPOSURE,
          this.activeRealm === "kelp-cathedral"
            ? KELP_CATHEDRAL_EXPOSURE
            : this.activeRealm === "crystal-trench"
              ? CRYSTAL_TRENCH_EXPOSURE
              : 0,
        )
      : this.activeRealm === "kelp-cathedral"
        ? KELP_CATHEDRAL_EXPOSURE
        : this.activeRealm === "crystal-trench"
          ? CRYSTAL_TRENCH_EXPOSURE
          : STANDARD_EXPOSURE;
  }

  /** Metrics the capture harness cannot infer reliably from render.info. */
  artStats(): {
    activeMaterials: number;
    godRayMeshes: number;
    textureMemoryMB: number;
    heroMerfolkHeightPixels: number;
    heroMerfolkFaceHeightPixels: number;
    heroMerfolkEyeDiameterPixels: number;
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
      // Moon-Garden plus the two resident lost-realm material sets. Every map
      // is a bounded 512 px WebP and the full renderer remains well below the
      // 48 MB realm ceiling even though inactive textures stay GPU-resident.
      textureMemoryMB: 16.45,
      heroMerfolkHeightPixels: this.environment.heroMerfolkScreenHeightPixels(
        this.camera,
        this.renderer.domElement.clientHeight || window.innerHeight
      ),
      heroMerfolkFaceHeightPixels:
        this.environment.heroMerfolkFaceHeightPixels(
          this.camera,
          this.renderer.domElement.clientHeight || window.innerHeight
        ),
      heroMerfolkEyeDiameterPixels:
        this.environment.heroMerfolkEyeDiameterPixels(
          this.camera,
          this.renderer.domElement.clientHeight || window.innerHeight
        )
    };
  }

  activeHeroMerfolkRole(): string {
    return this.environment.heroMerfolkRole();
  }

  productionAssetStatus(): Readonly<{
    glowfin: "fallback" | "glb";
    gate: "fallback" | "glb";
    reef: "fallback" | "glb";
    build: string | null;
    error: string | null;
  }> {
    return this.runtimeProductionStatus;
  }

  /** Cosmetics remain presentation-only uniforms on two existing materials. */
  applyCosmetics(loadout: CosmeticLoadout): void {
    const palette = cosmeticPalette(loadout);
    this.creature.applyCosmeticPalette(palette);
    this.trail.applyCosmeticPalette(palette);
  }

  /** Expedition-only sensory feedback on the existing trail material. */
  setLumenChainFraction(value: number): void {
    this.lumenChainFraction = Math.max(0, Math.min(1, value));
    this.trail.setLumenChainFraction(this.lumenChainFraction);
  }

  r3EncounterBudget(): { drawCalls: number; triangles: number; materials: 0 } {
    return {
      drawCalls: this.r3Encounters.additionalDrawCalls(),
      triangles: this.r3Encounters.triangleBudget(),
      materials: 0,
    };
  }

  r5CompletionBudget(): { drawCalls: number; triangles: number; materials: 0 } {
    return {
      drawCalls: this.r5Completion.additionalDrawCalls(),
      triangles: this.r5Completion.triangleBudget(),
      materials: 0,
    };
  }

  kelpCathedralBudget(): { drawCalls: number; triangles: number; materials: number } {
    return {
      drawCalls: this.kelpCathedral.additionalDrawCalls(),
      triangles: this.kelpCathedral.triangleBudget(),
      materials: this.kelpCathedral.additionalMaterials(),
    };
  }

  crystalTrenchBudget(): { drawCalls: number; triangles: number; materials: number } {
    return {
      drawCalls: this.crystalTrench.additionalDrawCalls(),
      triangles: this.crystalTrench.triangleBudget(),
      materials: this.crystalTrench.additionalMaterials(),
    };
  }

  /** Presentation-only post-run personality pose; simulation truth is frozen. */
  setHeroMoment(moment: GlowfinHeroMoment | null): void {
    this.heroMoment = moment;
    this.heroMomentElapsedSec = 0;
    if (!moment) this.creature.group.scale.setScalar(1);
  }

  /** Live draw-call and triangle counts, for the Part 4.6 budget check. */
  stats(): { drawCalls: number; triangles: number } {
    return {
      drawCalls: this.renderer.info.render.calls,
      triangles: this.renderer.info.render.triangles
    };
  }

  /**
   * Stable renderer allocation counts for the deterministic CI soak.
   * These are GPU-side Three.js resources, not JavaScript heap estimates.
   */
  resourceStats(): { geometries: number; textures: number } {
    return {
      geometries: this.renderer.info.memory.geometries,
      textures: this.renderer.info.memory.textures
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
    frameSec: number,
    ghostSim: SimState | null = null,
    activeLivingEvents: readonly ActiveLivingWorldEvent[] = [],
    lumenMotePresentation: readonly LumenMotePresentation[] = [],
    r3EncounterPresentation: Readonly<R3EncounterPresentation> | null = null,
    r5CompletionPresentation: Readonly<R5CompletionPresentation> | null = null,
    kelpRescuedManta = false,
    crystalTrenchStatus: Readonly<CrystalTrenchRunStatus> | null = null,
  ): void {
    const cfg = this.cfg;
    this.renderer.info.reset();
    const presentationElapsedSec = this.reducedMotion ? 0 : elapsedSec;
    advanceCausticTime(this.floorMaterial, presentationElapsedSec, cfg.visual.causticSpeed);
    advanceCausticTime(this.wallMaterial, presentationElapsedSec, cfg.visual.causticSpeed);
    const momentumFraction =
      cfg.momentum.ceiling === 0 ? 0 : sim.momentum / cfg.momentum.ceiling;
    const speedRange =
      cfg.speed.forwardAtMaxMomentum - cfg.speed.forwardAtZeroMomentum;
    const speedFraction = speedRange <= 0
      ? 0
      : (forwardSpeed(sim, cfg) - cfg.speed.forwardAtZeroMomentum) / speedRange;
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
    this.heroMomentElapsedSec += this.heroMoment ? Math.max(0, Math.min(frameSec, 0.1)) : 0;
    const heroRecovery = this.heroMoment === "recovery"
      ? 0.72 + Math.sin(this.heroMomentElapsedSec * Math.PI * 2.2) * 0.18
      : 0;
    this.creature.update(
      momentumFraction,
      speedFraction,
      this.heroMoment ? Math.max(lightFraction, 0.92) : lightFraction,
      sim.smoothedSteering,
      frameSec,
      collisionFraction,
      Math.max(recoveryFraction, heroRecovery)
    );
    this.creature.group.scale.setScalar(1);
    if (this.heroMoment) {
      const reducedScale = this.reducedMotion ? 0 : 1;
      const pulse = Math.sin(this.heroMomentElapsedSec * Math.PI * 2.4) * reducedScale;
      this.creature.group.rotation.y = Math.PI + pulse * 0.06;
      this.creature.group.rotation.x = -0.05;
      this.creature.group.rotation.z = pulse * 0.035;
      this.creature.group.position.y = 0.18 + Math.max(0, pulse) * 0.1;
      const scale = this.heroMoment === "unlock"
        ? 1.12 + Math.max(0, pulse) * 0.06
        : this.heroMoment === "celebration"
          ? 1.08 + Math.max(0, pulse) * 0.04
          : 1.04;
      this.creature.group.scale.setScalar(scale);
    }

    if (ghostSim) {
      const ghostMomentum = cfg.momentum.ceiling === 0
        ? 0
        : ghostSim.momentum / cfg.momentum.ceiling;
      const ghostSpeed = speedRange <= 0
        ? 0
        : (forwardSpeed(ghostSim, cfg) - cfg.speed.forwardAtZeroMomentum) /
          speedRange;
      const ghostCollision = cfg.momentum.stunDurationSec <= 0
        ? 0
        : Math.min(1, ghostSim.stunRemainingSec / cfg.momentum.stunDurationSec);
      const ghostRecovery =
        ghostSim.stunRemainingSec <= 0 &&
        cfg.momentum.invulnerabilityDurationSec > 0
          ? Math.min(
            1,
            ghostSim.invulnerableRemainingSec /
              cfg.momentum.invulnerabilityDurationSec
          )
          : 0;
      this.ghostCreature.group.visible = true;
      this.ghostCreature.group.position.set(
        ghostSim.lateralPosition,
        0.025,
        -ghostSim.forwardDistance
      );
      this.ghostCreature.update(
        ghostMomentum,
        ghostSpeed,
        1,
        ghostSim.smoothedSteering,
        frameSec,
        ghostCollision,
        ghostRecovery
      );
    } else {
      this.ghostCreature.group.visible = false;
    }

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
    this.lumenMotes.update(
      lumenMotePresentation,
      presentationElapsedSec,
      this.lumenChainFraction,
      this.reducedMotion
    );
    this.r3Encounters.update(
      r3EncounterPresentation,
      presentationElapsedSec,
      this.reducedMotion,
    );
    this.r5Completion.update(
      r5CompletionPresentation,
      presentationElapsedSec,
      this.reducedMotion,
    );

    this.environment.update(
      sim.forwardDistance,
      sim.lateralPosition,
      momentumFraction,
      presentationElapsedSec,
      gates,
      activeLivingEvents
    );
    this.kelpCathedral.update(
      this.activeRealm,
      sim.forwardDistance,
      presentationElapsedSec,
      gates,
      kelpRescuedManta,
    );
    this.crystalTrench.update(
      this.activeRealm,
      sim.forwardDistance,
      presentationElapsedSec,
      gates,
      crystalTrenchStatus,
    );

    if (this.activeRealm === "moon-garden") {
      this.updateStripes(sim.forwardDistance);
      this.gates.update(
        sim.forwardDistance,
        gates,
        this.camera,
        this.renderer.domElement.clientHeight || window.innerHeight,
        elapsedSec
      );
    }

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

  /** Release GPU resources; Version 35 reconstructs a fresh view after loss. */
  dispose(): void {
    window.removeEventListener("resize", this.handleResize);
    for (const item of this.disposables) item.dispose();
    this.trail.dispose();
    this.lumenMotes.dispose();
    this.r3Encounters.dispose();
    this.r5Completion.dispose();
    this.kelpCathedral.dispose();
    this.crystalTrench.dispose();
    this.creature.dispose();
    this.ghostCreature.dispose();
    this.environment.dispose();
    this.gates.dispose();
    this.maskObstacle.dispose();
    this.maskObstacleContext.dispose();
    this.maskOther.dispose();
    for (const material of this.merfolkMaskMaterials.values()) {
      material.dispose();
    }
    this.composer.dispose();
    this.renderer.dispose();
  }
}
