/**
 * Dense-but-readable Moon-Garden environment.
 *
 * Gameplay geometry remains entirely in the simulation/gate renderer. This
 * layer adds authored parallax ruins, reef families, ambient creatures and
 * moonlit particles outside that authority. Every placement is deterministic
 * from its world band, so endless-runner recycling never causes visual pops.
 */
import * as THREE from "three";
import type { TuningConfig } from "../core/config";
import type { Gate } from "../sim/course";
import type { ActiveLivingWorldEvent } from "../sim/obstacleVariety";
import {
  createProductionAnemone,
  createProductionBrainCoral,
  createProductionBranchCoral,
  createProductionCollapsedArch,
  createProductionConchFountain,
  createProductionFanCoral,
  createProductionJelly,
  createProductionKelp,
  createProductionMerfolkCitizenParts,
  createProductionMerfolkConchHeraldParts,
  createProductionMerfolkMonument,
  createProductionMerfolkSwimmerParts,
  createProductionMinnow,
  createProductionObservatory,
  createProductionPalaceDistrict,
  createProductionRay,
  createProductionSkyline,
  createProductionSpire,
  createProductionTableCoral,
  createProductionTideSpear,
  createProductionTower
} from "./productionGeometry";
import {
  createMoonGardenMaterial,
  updateMoonGardenMaterial
} from "./moonGardenMaterial";
import { HeroMerfolkGuardian } from "./merfolkGuardian";
import {
  guardianRoleForGateFamily,
  type MerfolkGuardianRole
} from "../art/merfolkCharacter";
import {
  sampleMerfolkChoreography,
  type MerfolkPopulationRole
} from "../art/merfolkChoreography";
import {
  buildLivingDistrictStage,
  LIVING_DISTRICT_CONTRACT
} from "../art/livingDistrict";
import type { GateFacadeVariant } from "../art/premiumWorld";
import {
  RUNTIME_PRODUCTION_ASSETS,
  type RuntimeReefFamily
} from "../art/runtimeAssetContract";
import type { RuntimeReefGeometrySet } from "./runtimeProductionAssets";
import type { RealmId } from "../realms/definition";

function hash01(a: number, salt: number): number {
  let h = Math.imul(a ^ salt, 0x27d4eb2d);
  h ^= h >>> 15;
  h = Math.imul(h, 0x85ebca6b);
  h ^= h >>> 13;
  return (h >>> 0) / 4294967296;
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

function positiveMod(value: number, modulus: number): number {
  return ((value % modulus) + modulus) % modulus;
}

function livingEventStrength(
  active: ActiveLivingWorldEvent,
  timeSec: number
): number {
  const progress = THREE.MathUtils.clamp(
    (timeSec - active.startedAtSec) / Math.max(0.001, active.plan.durationSec),
    0,
    1
  );
  return Math.sin(progress * Math.PI);
}

const REEF_FAMILY_TINTS = [
  [0.92, 0.76, 1],
  [1, 0.72, 0.86],
  [0.66, 0.98, 0.92],
  [0.78, 0.72, 1],
  [1, 0.68, 0.9],
  [0.58, 0.9, 0.98]
] as const;

class InstancedVolumeFamily {
  readonly object: THREE.InstancedMesh;
  halfWidth: number;
  height: number;
  private count = 0;

  constructor(
    geometry: THREE.BufferGeometry,
    material: THREE.Material,
    maxCount: number,
    private readonly disposables: Array<{ dispose(): void }>,
    private readonly grounded = true
  ) {
    const bounds = this.prepareGeometry(geometry);
    this.halfWidth = bounds.halfWidth;
    this.height = bounds.height;

    this.object = new THREE.InstancedMesh(geometry, material, maxCount);
    this.object.count = 0;
    this.object.frustumCulled = false;
    this.object.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    disposables.push(geometry);
  }

  private prepareGeometry(geometry: THREE.BufferGeometry): {
    halfWidth: number;
    height: number;
  } {
    geometry.computeBoundingBox();
    const bounds = geometry.boundingBox;
    if (!bounds) throw new Error("Moon-Garden volume is missing bounds.");
    if (this.grounded) geometry.translate(0, -bounds.min.y, 0);
    geometry.computeBoundingBox();
    const groundedBounds = geometry.boundingBox;
    if (!groundedBounds) throw new Error("Moon-Garden volume could not be grounded.");
    return {
      halfWidth: (groundedBounds.max.x - groundedBounds.min.x) * 0.5,
      height: Math.max(0.01, groundedBounds.max.y - groundedBounds.min.y)
    };
  }

  replaceGeometry(geometry: THREE.BufferGeometry): void {
    const bounds = this.prepareGeometry(geometry);
    const previous = this.object.geometry;
    this.object.geometry = geometry;
    this.halfWidth = bounds.halfWidth;
    this.height = bounds.height;
    this.object.userData["runtimeProductionAsset"] = true;
    previous.dispose();
    this.disposables.push(geometry);
  }

  begin(): void {
    this.count = 0;
  }

  add(matrix: THREE.Matrix4, colour: THREE.Color): void {
    if (this.count >= this.object.instanceMatrix.count) return;
    this.object.setMatrixAt(this.count, matrix);
    this.object.setColorAt(this.count, colour);
    this.count += 1;
  }

  finish(): void {
    this.object.count = this.count;
    this.object.instanceMatrix.needsUpdate = true;
    if (this.object.instanceColor) this.object.instanceColor.needsUpdate = true;
  }
}

/** Three synchronized instanced draws keep body, face and eyes independently
 * measurable in the real depth buffer without giving up population batching. */
class InstancedMerfolkFamily {
  readonly object = new THREE.Group();
  private readonly body: InstancedVolumeFamily;
  private readonly face: InstancedVolumeFamily;
  private readonly eyes: InstancedVolumeFamily;

  constructor(
    parts: {
      body: THREE.BufferGeometry;
      face: THREE.BufferGeometry;
      eyes: THREE.BufferGeometry;
    },
    material: THREE.Material,
    maxCount: number,
    role: MerfolkPopulationRole,
    disposables: Array<{ dispose(): void }>
  ) {
    this.body = new InstancedVolumeFamily(
      parts.body,
      material,
      maxCount,
      disposables,
      false
    );
    this.face = new InstancedVolumeFamily(
      parts.face,
      material,
      maxCount,
      disposables,
      false
    );
    this.eyes = new InstancedVolumeFamily(
      parts.eyes,
      material,
      maxCount,
      disposables,
      false
    );
    this.object.name = `moon-garden-${role}-rig`;
    this.object.userData["nonCollidable"] = true;
    const meshes = [this.body.object, this.face.object, this.eyes.object];
    const maskRoles = [role, `${role}-face`, `${role}-eyes`];
    for (const [index, mesh] of meshes.entries()) {
      mesh.name = `moon-garden-${maskRoles[index]}`;
      mesh.userData["merfolkMaskRole"] = maskRoles[index];
      mesh.userData["populationRole"] = role;
      mesh.userData["nonCollidable"] = true;
      this.object.add(mesh);
    }
  }

  begin(): void {
    this.body.begin();
    this.face.begin();
    this.eyes.begin();
  }

  add(matrix: THREE.Matrix4, colour: THREE.Color): void {
    this.body.add(matrix, colour);
    this.face.add(matrix, colour);
    this.eyes.add(matrix, colour);
  }

  finish(): void {
    this.body.finish();
    this.face.finish();
    this.eyes.finish();
  }
}

export interface MoonGardenTextures {
  surfaceMap: THREE.Texture;
  livingMap: THREE.Texture;
}

const POINT_COUNT = 193;

interface HeroStage {
  anchor: number;
  side: -1 | 1;
  role: MerfolkGuardianRole;
  gateFamily: GateFacadeVariant;
}

export class Environment {
  readonly objects: THREE.Object3D[] = [];

  private readonly volumeMaterial: THREE.ShaderMaterial;
  private readonly architecture: readonly InstancedVolumeFamily[];
  private readonly skyline: InstancedVolumeFamily;
  private readonly reef: readonly InstancedVolumeFamily[];
  private readonly life: readonly InstancedVolumeFamily[];
  private readonly merfolkPopulation: readonly InstancedMerfolkFamily[];
  private readonly props: readonly InstancedVolumeFamily[];
  private readonly heroMerfolk: HeroMerfolkGuardian;
  private readonly godRays: THREE.InstancedMesh;
  private readonly moonAndMotes: THREE.Points;
  private readonly pointPositions: THREE.BufferAttribute;

  private density = 1;
  private activeRealm: RealmId = "moon-garden";
  private readonly matrix = new THREE.Matrix4();
  private readonly position = new THREE.Vector3();
  private readonly quaternion = new THREE.Quaternion();
  private readonly scale = new THREE.Vector3();
  private readonly colour = new THREE.Color();
  private readonly disposables: Array<{ dispose(): void }> = [];

  constructor(
    private readonly cfg: TuningConfig,
    textures: MoonGardenTextures
  ) {
    const env = cfg.environment;
    const fogNear =
      cfg.readability.visibleAheadUnits * cfg.visual.fogNearMultiplier;
    const fogFar =
      cfg.readability.visibleAheadUnits * cfg.visual.fogFarMultiplier;
    this.volumeMaterial = createMoonGardenMaterial({
      fogColor: 0x12364c,
      fogNear,
      fogFar,
      glowRadius: cfg.environment.coralPulseRadiusUnits,
      surfaceMap: textures.surfaceMap,
      livingMap: textures.livingMap
    });
    this.disposables.push(this.volumeMaterial);

    // Every visible world family is volumetric. The former skyline and
    // ambient-life atlas cards are retired rather than hidden at distance.
    const architectureGeometry = [
      createProductionTower(1),
      createProductionCollapsedArch(1),
      createProductionSpire(1),
      createProductionPalaceDistrict(1),
      createProductionObservatory(1)
    ] as const;
    this.architecture = architectureGeometry.map((geometry) =>
      new InstancedVolumeFamily(
        geometry,
        this.volumeMaterial,
        env.buildingCount,
        this.disposables
      )
    );
    this.skyline = new InstancedVolumeFamily(
      createProductionSkyline(),
      this.volumeMaterial,
      4,
      this.disposables
    );
    const reefGeometry = [
      createProductionBrainCoral(1),
      createProductionTableCoral(1),
      createProductionBranchCoral(1),
      createProductionFanCoral(1),
      createProductionAnemone(1),
      createProductionKelp(1)
    ] as const;
    this.reef = reefGeometry.map((geometry) =>
      new InstancedVolumeFamily(
        geometry,
        this.volumeMaterial,
        env.coralCount,
        this.disposables
      )
    );
    const lifeCaps = [
      LIVING_DISTRICT_CONTRACT.life.fishPool,
      LIVING_DISTRICT_CONTRACT.life.jellyPool,
      LIVING_DISTRICT_CONTRACT.life.rayPool
    ];
    const lifeGeometry = [
      createProductionMinnow(),
      createProductionJelly(),
      createProductionRay()
    ] as const;
    this.life = lifeGeometry.map((geometry, index) =>
      new InstancedVolumeFamily(
        geometry,
        this.volumeMaterial,
        lifeCaps[index] ?? 8,
        this.disposables,
        false
      )
    );
    const populationRoles = [
      "reef-citizen",
      "current-swimmer",
      "conch-herald"
    ] as const;
    const populationParts = [
      createProductionMerfolkCitizenParts(),
      createProductionMerfolkSwimmerParts(),
      createProductionMerfolkConchHeraldParts()
    ] as const;
    const populationCaps = [6, 4, 4] as const;
    this.merfolkPopulation = populationParts.map((parts, index) =>
      new InstancedMerfolkFamily(
        parts,
        this.volumeMaterial,
        populationCaps[index] ?? 4,
        populationRoles[index] ?? "reef-citizen",
        this.disposables
      )
    );
    this.heroMerfolk = new HeroMerfolkGuardian(
      this.volumeMaterial,
      this.cfg.lane.halfWidth
    );
    const propGeometry = [
      createProductionMerfolkMonument(),
      createProductionTideSpear(),
      createProductionConchFountain()
    ] as const;
    this.props = propGeometry.map((geometry) =>
      new InstancedVolumeFamily(
        geometry,
        this.volumeMaterial,
        8,
        this.disposables,
        false
      )
    );
    this.objects.push(
      ...this.architecture.map((family) => family.object),
      this.skyline.object,
      ...this.reef.map((family) => family.object),
      ...this.life.map((family) => family.object),
      ...this.merfolkPopulation.map((family) => family.object),
      this.heroMerfolk.object,
      ...this.props.map((family) => family.object)
    );

    const rayGeometry = new THREE.PlaneGeometry(1, 1, 3, 2);
    const rayPositions = rayGeometry.getAttribute("position");
    for (let index = 0; index < rayPositions.count; index++) {
      const y = rayPositions.getY(index);
      const width = lerp(0.2, 1, y + 0.5);
      rayPositions.setX(index, rayPositions.getX(index) * width);
    }
    rayPositions.needsUpdate = true;
    const rayMaterial = new THREE.ShaderMaterial({
      transparent: true,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      depthTest: false,
      side: THREE.DoubleSide,
      toneMapped: true,
      vertexShader: /* glsl */ `
        varying vec2 vUv;
        varying vec3 vTint;
        void main() {
          vUv = uv;
          vTint = vec3(0.48, 0.78, 1.0);
          #ifdef USE_INSTANCING_COLOR
            vTint *= instanceColor;
          #endif
          vec4 localPosition = vec4(position, 1.0);
          #ifdef USE_INSTANCING
            localPosition = instanceMatrix * localPosition;
          #endif
          gl_Position = projectionMatrix * modelViewMatrix * localPosition;
        }
      `,
      fragmentShader: /* glsl */ `
        precision mediump float;
        varying vec2 vUv;
        varying vec3 vTint;
        void main() {
          float horizontal = 1.0 - smoothstep(0.04, 0.5, abs(vUv.x - 0.5));
          float lowerFade = smoothstep(0.0, 0.22, vUv.y);
          float upperFade = 1.0 - smoothstep(0.78, 1.0, vUv.y);
          float alpha = horizontal * lowerFade * upperFade * 0.11;
          gl_FragColor = vec4(vTint * 0.9, alpha);
        }
      `
    });
    this.godRays = new THREE.InstancedMesh(
      rayGeometry,
      rayMaterial,
      env.godRayCount
    );
    this.godRays.frustumCulled = false;
    this.godRays.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.objects.push(this.godRays);
    this.disposables.push(rayGeometry, rayMaterial);

    const pointGeometry = new THREE.BufferGeometry();
    const positions = new Float32Array(POINT_COUNT * 3);
    const sizes = new Float32Array(POINT_COUNT);
    const colours = new Float32Array(POINT_COUNT * 3);
    for (let index = 0; index < POINT_COUNT; index++) {
      const isMoon = index === 0;
      sizes[index] = isMoon ? 20 : lerp(0.42, 0.92, hash01(index, 601));
      colours[index * 3] = isMoon ? 0.32 : lerp(0.35, 0.75, hash01(index, 602));
      colours[index * 3 + 1] = isMoon ? 0.78 : lerp(0.62, 0.9, hash01(index, 603));
      colours[index * 3 + 2] = 1;
    }
    this.pointPositions = new THREE.BufferAttribute(positions, 3);
    pointGeometry.setAttribute("position", this.pointPositions);
    pointGeometry.setAttribute("aSize", new THREE.BufferAttribute(sizes, 1));
    pointGeometry.setAttribute("aColour", new THREE.BufferAttribute(colours, 3));
    const pointMaterial = new THREE.ShaderMaterial({
      transparent: true,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      toneMapped: false,
      vertexShader: /* glsl */ `
        attribute float aSize;
        attribute vec3 aColour;
        varying vec3 vColour;
        void main() {
          vColour = aColour;
          vec4 mv = modelViewMatrix * vec4(position, 1.0);
          gl_PointSize = aSize * (300.0 / max(1.0, -mv.z));
          gl_Position = projectionMatrix * mv;
        }
      `,
      fragmentShader: /* glsl */ `
        precision mediump float;
        varying vec3 vColour;
        void main() {
          float radius = length(gl_PointCoord - vec2(0.5));
          float alpha = 1.0 - smoothstep(0.1, 0.5, radius);
          gl_FragColor = vec4(vColour * alpha * 1.18, alpha * 0.82);
        }
      `
    });
    this.moonAndMotes = new THREE.Points(pointGeometry, pointMaterial);
    this.moonAndMotes.frustumCulled = false;
    this.objects.push(this.moonAndMotes);
    this.disposables.push(pointGeometry, pointMaterial);
  }

  /** Reuse the world shader for named Expedition actors without new materials. */
  sharedLivingMaterial(): THREE.ShaderMaterial {
    return this.volumeMaterial;
  }

  /** Replace only the six reef families selected for the Phase 3C slice. */
  installRuntimeReefGeometry(assets: RuntimeReefGeometrySet): void {
    const expectedOrder: readonly RuntimeReefFamily[] = [
      "BrainCoral",
      "TableCoral",
      "Staghorn",
      "SeaFan",
      "Anemone",
      "Kelp"
    ];
    if (
      expectedOrder.length !== RUNTIME_PRODUCTION_ASSETS.reefFamilies.length
    ) {
      throw new Error("Runtime reef family contract and renderer order diverged.");
    }
    expectedOrder.forEach((family, index) => {
      const target = this.reef[index];
      if (!target) throw new Error(`Renderer is missing reef slot ${index}.`);
      target.replaceGeometry(assets[family]);
    });
  }

  setDensity(fraction: number): void {
    this.density = THREE.MathUtils.clamp(fraction, 0.25, 1);
    this.heroMerfolk.setDetail(this.density);
  }

  setRealm(realmId: RealmId): void {
    this.activeRealm = realmId;
    const visible = realmId === "moon-garden";
    for (const object of this.objects) object.visible = visible;
  }

  reset(): void {
    // All placements derive from simulation distance; no retained response state.
  }

  heroMerfolkScreenHeightPixels(
    camera: THREE.Camera,
    viewportHeightPixels: number
  ): number {
    return this.heroMerfolk.screenHeightPixels(camera, viewportHeightPixels);
  }

  heroMerfolkFaceHeightPixels(
    camera: THREE.Camera,
    viewportHeightPixels: number
  ): number {
    return this.heroMerfolk.faceHeightPixels(camera, viewportHeightPixels);
  }

  heroMerfolkEyeDiameterPixels(
    camera: THREE.Camera,
    viewportHeightPixels: number
  ): number {
    return this.heroMerfolk.eyeDiameterPixels(camera, viewportHeightPixels);
  }

  heroMerfolkRole(): MerfolkGuardianRole {
    return this.heroMerfolk.activeRole;
  }

  update(
    forwardDistance: number,
    lateralPosition: number,
    momentumFraction: number,
    timeSec: number,
    gates: readonly Gate[] = [],
    activeLivingEvents: readonly ActiveLivingWorldEvent[] = []
  ): void {
    const time = Math.max(0, timeSec);
    const moonBloom = activeLivingEvents.find(
      (active) => active.plan.kind === "moon-bloom-pulse"
    );
    updateMoonGardenMaterial(
      this.volumeMaterial,
      time,
      this.position.set(lateralPosition, -0.15, -forwardDistance),
      momentumFraction,
      moonBloom
        ? {
            anchorDistance: moonBloom.plan.anchorDistance,
            strength: livingEventStrength(moonBloom, time)
      }
        : null
    );
    if (this.activeRealm !== "moon-garden") return;
    const heroStage = this.resolveHeroStage(forwardDistance, gates);
    this.updateArchitecture(forwardDistance, heroStage);
    this.updateSkyline(forwardDistance);
    this.updateReef(
      forwardDistance,
      lateralPosition,
      momentumFraction,
      heroStage
    );
    this.updateProps(forwardDistance, heroStage);
    this.updateLife(
      forwardDistance,
      time,
      momentumFraction,
      heroStage,
      activeLivingEvents
    );
    this.updateMoonAndMotes(forwardDistance, time);
    this.updateGodRays(forwardDistance, momentumFraction);
  }

  private updateArchitecture(
    forwardDistance: number,
    heroStage: HeroStage
  ): void {
    const env = this.cfg.environment;
    const count = Math.min(
      12,
      Math.max(6, Math.floor(env.buildingCount * this.density))
    );
    const perSide = Math.floor(count / 2);
    // Architecture starts beside the readable route rather than only at the
    // horizon. Bounds-aware lateral placement keeps every volume outside the
    // authoritative lane while allowing real foreground/midground parallax.
    const firstBand = Math.ceil(
      (forwardDistance + 20) / env.buildingBandSpacing
    );
    for (const family of this.architecture) family.begin();

    for (let side = -1; side <= 1; side += 2) {
      for (let index = 0; index < perSide; index++) {
        const band = firstBand + index;
        const salt = side > 0 ? 7717 : 3313;
        const rawVariant = positiveMod(band + (side > 0 ? 1 : 0), 5);
        // Collapsed arches remain part of the ruin language, but they no
        // longer repeat in every foreground band. Most of those slots become
        // towers or spires, leaving the active gameplay gate as the only
        // dominant portal silhouette.
        const variant = rawVariant === 1 && positiveMod(band, 3) !== 0
          ? (side > 0 ? 2 : 0)
          : rawVariant;
        const zDistance = band * env.buildingBandSpacing +
          (hash01(band, salt + 4) - 0.5) * env.buildingBandSpacing * 0.45;
        const height = lerp(
          Math.max(4.2, env.buildingMinHeight * 0.82),
          Math.min(8.2, env.buildingMaxHeight),
          Math.pow(hash01(band, salt), 1.5)
        );
        const family = this.architecture[variant];
        if (!family) continue;
        const silhouetteScale = [0.92, 0.8, 0.86, 0.76, 0.78][variant] ?? 0.84;
        const unitScale = height * silhouetteScale / family.height;
        const widthStretch = [0.76, 0.9, 0.82, 1.04, 0.94][variant] ?? 0.82;
        const depthStretch = [0.72, 0.84, 0.76, 0.9, 0.88][variant] ?? 0.76;
        const archRetreat = variant === 1 ? 1.7 : 0;
        const safeInnerEdge =
          this.cfg.lane.halfWidth +
          family.halfWidth * unitScale * widthStretch +
          0.42 + archRetreat;
        const lateral = lerp(
          safeInnerEdge,
          Math.max(safeInnerEdge + 3.8, env.buildingLateralMax * 0.82),
          Math.pow(hash01(band, salt + 3), 1.8)
        );
        const sink = lerp(
          0,
          1.1,
          (lateral - env.buildingLateralMin) /
            Math.max(1, env.buildingLateralMax - env.buildingLateralMin)
        ) + (variant === 1 ? 0.34 : 0);
        this.position.set(side * lateral, -1 - sink, -zDistance);
        this.quaternion.setFromEuler(new THREE.Euler(
          0,
          side * lerp(-0.16, 0.1, hash01(band, salt + 9)),
          -side * lerp(0, 0.035, hash01(band, salt + 8))
        ));
        const mirror = hash01(band, salt + 10) < 0.5 ? -1 : 1;
        this.scale.set(
          mirror * unitScale * widthStretch,
          unitScale,
          unitScale * depthStretch
        );
        this.matrix.compose(this.position, this.quaternion, this.scale);
        const brightness = lerp(0.28, 0.43, hash01(band, salt + 5)) *
          (variant === 1 ? 0.8 : 1);
        this.colour.setRGB(
          brightness * 0.67,
          brightness * 0.84,
          brightness
        );
        family.add(this.matrix, this.colour);
      }
    }

    // The random city bands create depth, but they cannot guarantee that the
    // next gate reads as the entrance to a real district. Four deterministic
    // existing-family instances now form a bright, tall court behind every
    // encounter. Actual geometry bounds still determine the safe inner edge.
    const stage = buildLivingDistrictStage(
      heroStage.gateFamily,
      heroStage.side
    );
    for (const placement of stage.architecture) {
      const family = this.architecture[placement.familyIndex];
      if (!family) continue;
      const unitScale = placement.desiredHeight / family.height;
      const safeInnerEdge =
        this.cfg.lane.halfWidth +
        family.halfWidth * unitScale * placement.widthStretch +
        placement.outerMargin;
      this.position.set(
        placement.side * safeInnerEdge,
        -1.02,
        -(heroStage.anchor + placement.depthOffset)
      );
      this.quaternion.setFromEuler(new THREE.Euler(
        0,
        -placement.side * 0.075,
        placement.side * 0.012
      ));
      this.scale.set(
        placement.side * unitScale * placement.widthStretch,
        unitScale,
        unitScale * placement.depthStretch
      );
      this.matrix.compose(this.position, this.quaternion, this.scale);
      this.colour.setRGB(...placement.tint);
      family.add(this.matrix, this.colour);
    }
    for (const family of this.architecture) family.finish();
  }

  private updateSkyline(forwardDistance: number): void {
    // Broad, offset city shelves create three readable depth bands without
    // placing a single giant silhouette behind the playable opening.
    const spacing = 72;
    const count = this.density > 0.8 ? 3 : 2;
    const firstBand = Math.floor((forwardDistance + 34) / spacing) + 1;
    this.skyline.begin();
    for (let index = 0; index < count; index++) {
      const band = firstBand + index;
      const side = index % 2 === 0 ? -1 : 1;
      this.position.set(
        side * lerp(10, 15.5, hash01(band, 712)),
        -1.28 - index * 0.16,
        -(band * spacing + 12 + index * 10)
      );
      this.quaternion.setFromEuler(new THREE.Euler(
        0,
        side * lerp(-0.06, 0.1, hash01(band, 717)),
        side * lerp(-0.012, 0.018, hash01(band, 718))
      ));
      this.scale.set(
        lerp(2.8, 4.1, hash01(band, 713)),
        lerp(2.6, 3.8, hash01(band, 714)),
        lerp(2.4, 3.4, hash01(band, 716))
      );
      this.matrix.compose(this.position, this.quaternion, this.scale);
      const brightness =
        lerp(0.34, 0.48, hash01(band, 715)) * (1 - index * 0.09);
      this.colour.setRGB(
        brightness * 0.65,
        brightness * 0.82,
        brightness
      );
      this.skyline.add(this.matrix, this.colour);
    }
    this.skyline.finish();
  }

  private updateReef(
    forwardDistance: number,
    lateralPosition: number,
    momentumFraction: number,
    heroStage: HeroStage
  ): void {
    const env = this.cfg.environment;
    const halfWidth = this.cfg.lane.halfWidth;
    const count = Math.max(24, Math.floor(env.coralCount * this.density));
    const perSide = Math.floor(count / 2);
    const firstBand = Math.ceil(
      (forwardDistance + 1.5) / env.coralBandSpacing
    );
    for (const family of this.reef) family.begin();

    for (let side = -1; side <= 1; side += 2) {
      for (let index = 0; index < perSide; index++) {
        const band = firstBand + index;
        const salt = side > 0 ? 9091 : 1213;
        const cluster = Math.floor(band / 3);
        const clusterMember = positiveMod(band, 3);
        const variant = positiveMod(
          cluster * 3 + clusterMember + (side > 0 ? 2 : 0),
          6
        );
        const family = this.reef[variant];
        if (!family) continue;
        const clusterStart = cluster * env.coralBandSpacing * 3;
        const localOffset = [0, 0.88, 2.05][clusterMember] ?? 0;
        const zDistance = clusterStart + localOffset +
          (hash01(band, salt + 2) - 0.5) * 0.58;
        const isHero = variant < 2 && positiveMod(band, 4) === 0;
        const familyHeightFloor = [1.8, 1.55, 1.5, 1.58, 1.08, 2.1][variant] ?? 1.4;
        const familyHeightCeiling = [3.0, 2.5, 3.08, 2.92, 1.72, 3.22][variant] ?? 2.8;
        const signatureDistance = Math.abs(zDistance - heroStage.anchor);
        const isDistrictSignature = signatureDistance <
          LIVING_DISTRICT_CONTRACT.reef.signatureRadiusWorldUnits;
        const signatureHeightBoost = isDistrictSignature
          ? LIVING_DISTRICT_CONTRACT.reef.signatureHeightBoost[variant] ?? 1
          : 1;
        const desiredHeight = lerp(
          familyHeightFloor,
          familyHeightCeiling,
          hash01(band, salt + 1)
        ) * (isHero ? (isDistrictSignature ? 1.12 : 1.28) : 1) *
          signatureHeightBoost;
        const unitScale = desiredHeight / family.height;
        const signatureWidthBoost = isDistrictSignature
          ? LIVING_DISTRICT_CONTRACT.reef.signatureWidthBoost[variant] ?? 1
          : 1;
        const widthStretch = lerp(
          variant === 5 ? 1.08 : variant < 2 ? 1.18 : 1.26,
          variant === 5 ? 1.46 : variant < 2 ? 1.56 : 1.78,
          hash01(band, salt + 5)
        ) * signatureWidthBoost;
        const depthStretch = [0.88, 0.78, 1.05, 0.92, 0.96, 0.72][variant] ?? 0.9;
        // Place from the actual 3D bounds' inner edge. Larger volumetric reef
        // can overlap in depth while remaining entirely outside gameplay.
        const halfVisualWidth = family.halfWidth * unitScale * widthStretch;
        // Most clusters hug the safe edge to form the continuous garden banks
        // promised by the acceptance target. A squared distribution still
        // scatters occasional clusters deeper into the world, avoiding a
        // hedge-like line while retaining the exact same safety calculation.
        const depthIntoBank = THREE.MathUtils.clamp(
          Math.pow(hash01(cluster, salt), 2.3) +
            (clusterMember - 1) * 0.035,
          0,
          1
        );
        let lateral = side * lerp(
          halfWidth +
            halfVisualWidth +
            LIVING_DISTRICT_CONTRACT.reef.laneSafetyWorldUnits,
          halfWidth + halfVisualWidth + 3.6,
          depthIntoBank
        );
        // Reserve a deliberate character alcove around the staged guardian.
        // Reef remains dense, but it frames rather than buries her silhouette.
        if (
          side === heroStage.side &&
          Math.abs(zDistance - heroStage.anchor) < 12.5
        ) {
          lateral = side * Math.max(
            Math.abs(lateral),
            halfWidth + halfVisualWidth + 3.45
          );
        }
        this.position.set(lateral, -1.02, -zDistance);
        this.quaternion.setFromEuler(new THREE.Euler(
          0,
          side * lerp(-0.28, 0.22, hash01(band, salt + 8)),
          side * lerp(-0.025, 0.045, hash01(band, salt + 6))
        ));
        this.scale.set(
          (hash01(band, salt + 7) < 0.5 ? -1 : 1) *
            unitScale * widthStretch,
          unitScale,
          unitScale * depthStretch
        );
        this.matrix.compose(this.position, this.quaternion, this.scale);

        const dx = lateral - lateralPosition;
        const dz = zDistance - forwardDistance;
        const distance = Math.hypot(dx, dz);
        const response = Math.max(
          0,
          1 - distance / Math.max(1, env.coralPulseRadiusUnits)
        );
        const brightness = 0.56 + response * 0.22 + momentumFraction * 0.025;
        const familyTint = REEF_FAMILY_TINTS[variant] ?? REEF_FAMILY_TINTS[0];
        this.colour.setRGB(
          brightness * familyTint[0],
          brightness * familyTint[1],
          brightness * familyTint[2]
        );
        family.add(this.matrix, this.colour);
      }
    }
    for (const family of this.reef) family.finish();
  }

  private updateProps(
    forwardDistance: number,
    heroStage: HeroStage
  ): void {
    for (const family of this.props) family.begin();
    const stage = buildLivingDistrictStage(
      heroStage.gateFamily,
      heroStage.side
    );
    for (const placement of stage.props) {
      const family = this.props[placement.familyIndex];
      if (!family) continue;
      const safeInnerEdge =
        this.cfg.lane.halfWidth +
        family.halfWidth * placement.scale +
        placement.outerMargin;
      this.position.set(
        placement.side * safeInnerEdge,
        -0.98,
        -(heroStage.anchor + placement.depthOffset)
      );
      this.quaternion.setFromEuler(new THREE.Euler(
        0,
        -placement.side * 0.16,
        placement.side * 0.018
      ));
      this.scale.set(
        placement.side * placement.scale,
        placement.scale,
        placement.scale
      );
      this.matrix.compose(this.position, this.quaternion, this.scale);
      this.colour.setRGB(...placement.tint);
      family.add(this.matrix, this.colour);
    }
    const spacing = 31;
    const count = Math.max(5, Math.round(8 * this.density));
    const firstBand = Math.ceil((forwardDistance + 10) / spacing);
    for (let index = 0; index < count; index++) {
      const band = firstBand + index;
      const variant = positiveMod(band, this.props.length);
      const family = this.props[variant];
      if (!family) continue;
      const side = hash01(band, 731) < 0.5 ? -1 : 1;
      const size = lerp(1.08, variant === 0 ? 1.52 : 1.34, hash01(band, 732));
      const safeInnerEdge = this.cfg.lane.halfWidth + family.halfWidth * size + 0.7;
      let lateral = side * lerp(
        safeInnerEdge,
        safeInnerEdge + 2.8,
        Math.pow(hash01(band, 733), 1.7)
      );
      const zDistance = band * spacing + hash01(band, 734) * 7;
      if (
        side === heroStage.side &&
        Math.abs(zDistance - heroStage.anchor) < 9
      ) {
        lateral += side * 2.4;
      }
      this.position.set(
        lateral,
        -0.98,
        -zDistance
      );
      this.quaternion.setFromEuler(new THREE.Euler(
        0,
        side * lerp(-0.24, 0.18, hash01(band, 735)),
        side * lerp(-0.035, 0.035, hash01(band, 736))
      ));
      this.scale.set(side * size, size, size);
      this.matrix.compose(this.position, this.quaternion, this.scale);
      this.colour.setRGB(0.72, 0.82, 0.9);
      family.add(this.matrix, this.colour);
    }
    for (const family of this.props) family.finish();
  }

  private updateLife(
    forwardDistance: number,
    time: number,
    momentumFraction: number,
    heroStage: HeroStage,
    activeLivingEvents: readonly ActiveLivingWorldEvent[]
  ): void {
    for (const family of this.life) family.begin();
    for (const family of this.merfolkPopulation) family.begin();

    const schoolCount = Math.max(
      3,
      Math.round(
        LIVING_DISTRICT_CONTRACT.life.maximumFishSchools * this.density
      )
    );
    const fishPerSchool = LIVING_DISTRICT_CONTRACT.life.fishPerSchool;
    const schoolSpacing = 24;
    const firstSchool = Math.ceil((forwardDistance + 12) / schoolSpacing);
    for (let school = 0; school < schoolCount; school++) {
      const band = firstSchool + school;
      const phase = time * 0.62 + band * 1.77;
      const direction = hash01(band, 811) < 0.5 ? -1 : 1;
      const schoolSide = hash01(band, 813) < 0.5 ? -1 : 1;
      const schoolX = schoolSide *
        lerp(
          this.cfg.lane.halfWidth + 2.2,
          this.cfg.lane.halfWidth + 5.6,
          hash01(band, 812)
        ) +
        Math.sin(phase) * 0.65;
      const schoolY = lerp(4.6, 10.6, hash01(band, 815));
      for (let member = 0; member < fishPerSchool; member++) {
        const row = Math.floor(member / 3);
        const column = member % 3;
        this.position.set(
          schoolX + direction * ((column - 1) * 0.72 + row * 0.32),
          schoolY + (column - 1) * 0.34 - row * 0.42,
          -(band * schoolSpacing + member * 0.92)
        );
        this.quaternion.setFromEuler(new THREE.Euler(
          0,
          direction > 0 ? 0 : Math.PI,
          Math.sin(phase + member) * 0.035
        ));
        const size = lerp(0.5, 0.74, hash01(band + member, 814));
        this.scale.set(size * 1.24, size, 1);
        this.matrix.compose(this.position, this.quaternion, this.scale);
        this.colour.setRGB(0.72, 0.86, 1);
        this.life[0]?.add(this.matrix, this.colour);
      }
    }

    const jellyCount = Math.max(
      3,
      Math.round(LIVING_DISTRICT_CONTRACT.life.maximumJellies * this.density)
    );
    const jellySpacing = 32;
    const jellyFirst = Math.ceil((forwardDistance + 16) / jellySpacing);
    for (let index = 0; index < jellyCount; index++) {
      const band = jellyFirst + index;
      const side = hash01(band, 821) < 0.5 ? -1 : 1;
      const rise = positiveMod(time * 0.48 + hash01(band, 822) * 9, 9);
      this.position.set(
        side * lerp(
          this.cfg.lane.halfWidth + 2.4,
          this.cfg.lane.halfWidth + 6.8,
          hash01(band, 823)
        ) +
          Math.sin(time * 0.45 + band) * 0.65,
        1.2 + rise,
        -(band * jellySpacing + 6)
      );
      this.quaternion.identity();
      const pulse = 1 + Math.sin(time * 2 + band) * 0.06;
      const size = lerp(0.82, 1.28, hash01(band, 824)) * pulse;
      this.scale.set(size, size, 1);
      this.matrix.compose(this.position, this.quaternion, this.scale);
      this.colour.setRGB(0.72, 0.82, 1);
      this.life[1]?.add(this.matrix, this.colour);
    }

    const rayCount = Math.max(
      2,
      Math.round(LIVING_DISTRICT_CONTRACT.life.maximumRays * this.density)
    );
    const raySpacing = 48;
    const rayFirst = Math.ceil((forwardDistance + 24) / raySpacing);
    for (let index = 0; index < rayCount; index++) {
      const band = rayFirst + index;
      const phase = time * 0.28 + band * 2.4;
      const side = hash01(band, 832) < 0.5 ? -1 : 1;
      this.position.set(
        side * lerp(
          this.cfg.lane.halfWidth + 2.1,
          this.cfg.lane.halfWidth + 5.4,
          hash01(band, 834)
        ) +
          Math.sin(phase) * 0.9,
        7.6 + Math.sin(phase * 1.4) * 1.45,
        -(band * raySpacing + 16)
      );
      this.quaternion.setFromEuler(new THREE.Euler(0, 0, Math.cos(phase) * 0.08));
      const size = lerp(1.72, 2.46, hash01(band, 833));
      const wingBeat = 1 + Math.sin(phase * 3.2) * 0.09;
      this.scale.set(
        (Math.cos(phase) >= 0 ? size : -size) * wingBeat,
        size,
        1
      );
      this.matrix.compose(this.position, this.quaternion, this.scale);
      this.colour.setRGB(0.58, 0.72, 0.92);
      this.life[2]?.add(this.matrix, this.colour);
    }

    const rayProcession = activeLivingEvents.find(
      (active) => active.plan.kind === "ray-procession"
    );
    if (rayProcession) {
      const progress = THREE.MathUtils.clamp(
        (time - rayProcession.startedAtSec) /
          Math.max(0.001, rayProcession.plan.durationSec),
        0,
        1
      );
      const direction = (rayProcession.plan.seed & 1) === 0 ? 1 : -1;
      for (let member = 0; member < 2; member++) {
        const memberProgress = THREE.MathUtils.clamp(
          progress * 1.18 - member * 0.18,
          0,
          1
        );
        this.position.set(
          direction * THREE.MathUtils.lerp(-10.5, 10.5, memberProgress),
          8.8 + member * 1.1 + Math.sin(memberProgress * Math.PI) * 1.25,
          -(rayProcession.plan.anchorDistance + member * 4.2)
        );
        this.quaternion.setFromEuler(new THREE.Euler(
          0,
          direction > 0 ? 0 : Math.PI,
          direction * Math.sin(memberProgress * Math.PI * 2) * 0.12
        ));
        const size = 2.7 - member * 0.28;
        this.scale.set(size, size, 1);
        this.matrix.compose(this.position, this.quaternion, this.scale);
        this.colour.setRGB(0.72, 0.82, 1);
        this.life[2]?.add(this.matrix, this.colour);
      }
    }

    // One deterministic sampler owns the entire cast composition. Residents
    // and heralds stay vertically anchored; two independently seeded swimmers
    // occupy opposite galleries and never enter collider truth.
    const population = sampleMerfolkChoreography({
      laneHalfWidth: this.cfg.lane.halfWidth,
      anchor: heroStage.anchor,
      heroSide: heroStage.side,
      timeSec: time,
      momentumFraction,
      density: this.density
    });
    const familyIndex: Record<MerfolkPopulationRole, number> = {
      "reef-citizen": 0,
      "current-swimmer": 1,
      "conch-herald": 2
    };
    for (const pose of population) {
      this.position.set(
        pose.position.x,
        pose.position.y,
        pose.position.z
      );
      this.quaternion.setFromEuler(new THREE.Euler(
        pose.rotation.x,
        pose.rotation.y,
        pose.rotation.z
      ));
      this.scale.set(pose.scale.x, pose.scale.y, pose.scale.z);
      this.matrix.compose(this.position, this.quaternion, this.scale);
      // Preserve the authored warm skin/teal-tail vertex palette. Small role
      // tints remain subtle enough that eye whites do not collapse into grey.
      // The swimmer keeps one instanced mesh, but inherits the active district
      // colour temperature so it belongs to the Tidekeeper, Coral Warden or
      // Astral Oracle court instead of reading as a pasted generic citizen.
      if (pose.role === "current-swimmer") {
        if (heroStage.role === "coral-warden") {
          this.colour.setRGB(1, 0.935, 0.965);
        } else if (heroStage.role === "astral-oracle") {
          this.colour.setRGB(0.91, 0.94, 1);
        } else {
          this.colour.setRGB(0.94, 0.99, 1);
        }
      } else if (pose.role === "conch-herald") {
        this.colour.setRGB(1, 0.94, 0.98);
      } else {
        this.colour.setRGB(0.98, 0.97, 1);
      }
      this.merfolkPopulation[familyIndex[pose.role]]?.add(
        this.matrix,
        this.colour
      );
    }

    for (const family of this.life) family.finish();
    for (const family of this.merfolkPopulation) family.finish();
    const guardianSalute = activeLivingEvents.find((active) => (
      active.plan.kind === "guardian-salute" &&
      Math.abs(active.plan.anchorDistance - heroStage.anchor) < 1
    ));
    this.heroMerfolk.update(
      forwardDistance,
      time,
      momentumFraction,
      heroStage,
      guardianSalute ? livingEventStrength(guardianSalute, time) : 0
    );
  }

  private resolveHeroStage(
    forwardDistance: number,
    gates: readonly Gate[]
  ): HeroStage {
    const gate = gates
      .filter((candidate) => {
        const ahead = candidate.distance - forwardDistance;
        return ahead >= 18 && ahead <= 72;
      })
      .sort((left, right) => left.distance - right.distance)[0];
    if (gate) {
      // Match gateArt's stable fallback exactly so the guardian's identity is
      // always native to the visible district, including hand-authored/test
      // gates that predate the explicit artVariant field.
      const gateFamily = (gate.artVariant ?? positiveMod(
        Math.abs(Math.round(gate.distance * 10)),
        5
      )) as GateFacadeVariant;
      return {
        anchor: gate.distance,
        side: gateFamily % 2 === 0 ? 1 : -1,
        role: guardianRoleForGateFamily(gateFamily),
        gateFamily
      };
    }

    const band = Math.floor((forwardDistance + 30) / 64);
    const gateFamily = positiveMod(band, 5) as GateFacadeVariant;
    return {
      anchor: band * 64 + 27,
      side: band % 2 === 0 ? 1 : -1,
      role: guardianRoleForGateFamily(gateFamily),
      gateFamily
    };
  }

  private updateMoonAndMotes(forwardDistance: number, time: number): void {
    // A quiet moon-disc/bioluminescent source sits high above the open
    // corridor, rather than merging with the gate at the horizon.
    this.pointPositions.setXYZ(0, 0, 17.5, -forwardDistance - 124);
    const activeMotes = Math.max(28, Math.floor((POINT_COUNT - 1) * this.density));
    // Forward-only particulate placement prevents one random mote from
    // crossing the near plane and becoming a second fake moon.
    const firstBand = Math.ceil((forwardDistance + 14) / 5);
    for (let index = 1; index < POINT_COUNT; index++) {
      if (index > activeMotes) {
        this.pointPositions.setXYZ(index, 0, -1000, 0);
        continue;
      }
      const band = firstBand + index;
      const phase = time * lerp(0.18, 0.46, hash01(index, 902)) + band;
      this.pointPositions.setXYZ(
        index,
        lerp(-17, 17, hash01(band, 903)) + Math.sin(phase) * 0.45,
        lerp(-0.2, 14.5, hash01(band, 904)) + Math.cos(phase * 0.8) * 0.25,
        -(band * 5 + hash01(band, 905) * 4)
      );
    }
    this.pointPositions.needsUpdate = true;
  }

  private updateGodRays(
    forwardDistance: number,
    momentumFraction: number
  ): void {
    const env = this.cfg.environment;
    const firstBand = Math.floor(forwardDistance / env.godRayBandSpacing);
    for (let index = 0; index < env.godRayCount; index++) {
      const band = firstBand + index + 1;
      const side = index % 2 === 0 ? -1 : 1;
      this.position.set(
        side * lerp(5.5, 13.5, hash01(band, 5051)),
        env.godRayHeight * 0.42,
        -(band * env.godRayBandSpacing)
      );
      this.quaternion.setFromEuler(new THREE.Euler(
        0,
        0,
        lerp(-0.22, 0.22, hash01(band, 5052))
      ));
      this.scale.set(
        env.godRayWidth * lerp(0.7, 1.45, hash01(band, 5053)),
        env.godRayHeight,
        1
      );
      this.matrix.compose(this.position, this.quaternion, this.scale);
      this.godRays.setMatrixAt(index, this.matrix);
      const strength = env.godRayIntensity *
        lerp(0.55, 1.05, hash01(band, 5054)) *
        lerp(0.78, 1.15, momentumFraction);
      this.colour.setRGB(
        strength * 2.6,
        strength * 3.8,
        strength * 4.6
      );
      this.godRays.setColorAt(index, this.colour);
    }
    this.godRays.instanceMatrix.needsUpdate = true;
    if (this.godRays.instanceColor) {
      this.godRays.instanceColor.needsUpdate = true;
    }
  }

  dispose(): void {
    this.heroMerfolk.dispose();
    for (const item of this.disposables) item.dispose();
  }
}
