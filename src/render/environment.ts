/**
 * Moon-Garden Ruins vertical slice.
 *
 * The visual-reset branch uses authored tower and reef impostors while final
 * GLB models are produced. They replace the rejected box/cone silhouettes in
 * the actual build, remain instanced, and are deliberately documented as
 * review assets rather than being misrepresented as final 3D production art.
 */
import * as THREE from "three";
import type { TuningConfig } from "../core/config";
import {
  createRibbonKelpGeometry,
  createSpireGeometry,
  type ArtLod
} from "./moonGardenGeometry";
import {
  createMoonGardenMaterial,
  updateMoonGardenMaterial
} from "./moonGardenMaterial";

/** Deterministic hash -> [0,1). Stable for a band index, no state required. */
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

function lodForDistance(distanceAhead: number): ArtLod {
  if (distanceAhead < 30) return 0;
  if (distanceAhead < 70) return 1;
  return 2;
}

class InstancedLodFamily {
  readonly objects: THREE.InstancedMesh[] = [];
  private readonly counts = [0, 0, 0];

  constructor(
    geometries: Array<THREE.BufferGeometry | null>,
    material: THREE.Material,
    maxCount: number,
    disposables: Array<{ dispose(): void }>
  ) {
    for (const geometry of geometries) {
      if (!geometry) continue;
      const mesh = new THREE.InstancedMesh(geometry, material, maxCount);
      mesh.count = 0;
      mesh.frustumCulled = false;
      mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      this.objects.push(mesh);
      disposables.push(geometry);
    }
  }

  begin(): void {
    this.counts.fill(0);
  }

  add(lod: ArtLod, matrix: THREE.Matrix4, colour: THREE.Color): void {
    const mesh = this.objects[lod] ?? this.objects[this.objects.length - 1];
    if (!mesh) return;
    const index = this.counts[lod] ?? 0;
    if (index >= mesh.instanceMatrix.count) return;
    mesh.setMatrixAt(index, matrix);
    mesh.setColorAt(index, colour);
    this.counts[lod] = index + 1;
  }

  finish(): void {
    for (let lod = 0; lod < this.objects.length; lod++) {
      const mesh = this.objects[lod];
      if (!mesh) continue;
      mesh.count = this.counts[lod] ?? 0;
      mesh.instanceMatrix.needsUpdate = true;
      if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    }
  }
}

class InstancedBillboardFamily {
  readonly object: THREE.InstancedMesh;
  private count = 0;

  constructor(
    material: THREE.Material,
    aspect: number,
    uvRect: { uMin: number; vMin: number; uMax: number; vMax: number },
    maxCount: number,
    disposables: Array<{ dispose(): void }>
  ) {
    const geometry = new THREE.PlaneGeometry(aspect, 1);
    const uv = geometry.getAttribute("uv");
    for (let index = 0; index < uv.count; index++) {
      uv.setXY(
        index,
        lerp(uvRect.uMin, uvRect.uMax, uv.getX(index)),
        lerp(uvRect.vMin, uvRect.vMax, uv.getY(index))
      );
    }
    uv.needsUpdate = true;
    // Placement matrices refer to the grounded base, not the image centre.
    geometry.translate(0, 0.5, 0);
    this.object = new THREE.InstancedMesh(geometry, material, maxCount);
    this.object.count = 0;
    this.object.frustumCulled = false;
    this.object.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    disposables.push(geometry);
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

export interface MoonGardenTextures {
  reviewAtlas: THREE.Texture;
}

export class Environment {
  readonly objects: THREE.Object3D[] = [];

  private readonly material: THREE.ShaderMaterial;
  private readonly towers: InstancedBillboardFamily;
  private readonly spires: InstancedLodFamily;
  private readonly coral: InstancedBillboardFamily;
  private readonly kelp: InstancedLodFamily;
  private readonly godRays: THREE.InstancedMesh;

  private readonly matrix = new THREE.Matrix4();
  private readonly position = new THREE.Vector3();
  private readonly quaternion = new THREE.Quaternion();
  private readonly scale = new THREE.Vector3();
  private readonly colour = new THREE.Color();
  private readonly glowCentre = new THREE.Vector3();
  private readonly disposables: Array<{ dispose(): void }> = [];

  constructor(
    private readonly cfg: TuningConfig,
    textures: MoonGardenTextures
  ) {
    const env = cfg.environment;
    const fogNear = cfg.readability.visibleAheadUnits * cfg.visual.fogNearMultiplier;
    const fogFar = cfg.readability.visibleAheadUnits * cfg.visual.fogFarMultiplier;
    this.material = createMoonGardenMaterial({
      fogColor: 0x12364c,
      fogNear,
      fogFar,
      glowRadius: env.coralPulseRadiusUnits
    });
    this.disposables.push(this.material);

    const reviewMaterial = new THREE.MeshBasicMaterial({
      map: textures.reviewAtlas,
      color: 0xffffff,
      // These are authored colour plates, not dark albedo waiting for scene
      // lights. The previous tone-mapped/instance-tinted path crushed both
      // tower and coral cards to black silhouettes in the actual capture.
      // One shared atlas material stays inside the active-material budget;
      // restrained instance colours preserve tower/reef hierarchy.
      vertexColors: true,
      alphaTest: 0.08,
      side: THREE.DoubleSide,
      depthWrite: true,
      fog: true,
      toneMapped: false
    });
    this.disposables.push(reviewMaterial);

    this.towers = new InstancedBillboardFamily(
      reviewMaterial,
      683 / 1024,
      { uMin: 0, vMin: 0.25, uMax: 0.5, vMax: 1 },
      env.buildingCount,
      this.disposables
    );
    this.spires = new InstancedLodFamily(
      [0, 1, 2].map((lod) => createSpireGeometry(lod as ArtLod)),
      this.material,
      env.buildingCount,
      this.disposables
    );
    this.coral = new InstancedBillboardFamily(
      reviewMaterial,
      1024 / 723,
      { uMin: 0.5, vMin: 0, uMax: 1, vMax: 362 / 1024 },
      env.coralCount,
      this.disposables
    );
    this.kelp = new InstancedLodFamily(
      [
        createRibbonKelpGeometry(0),
        createRibbonKelpGeometry(1),
        createRibbonKelpGeometry(1)
      ],
      this.material,
      Math.max(12, Math.floor(env.coralCount / 3)),
      this.disposables
    );
    this.objects.push(
      this.towers.object,
      ...this.spires.objects,
      this.coral.object,
      ...this.kelp.objects
    );

    // A subdivided tapered plane gives the shaft a stable twelve-triangle
    // silhouette without resorting to an expensive volumetric effect.
    const rayGeometry = new THREE.PlaneGeometry(1, 1, 3, 2);
    const rayPositions = rayGeometry.getAttribute("position");
    const rayColours = new Float32Array(rayPositions.count * 3);
    for (let index = 0; index < rayPositions.count; index++) {
      const y = rayPositions.getY(index);
      const width = lerp(0.2, 1, y + 0.5);
      rayPositions.setX(index, rayPositions.getX(index) * width);
      const strength = THREE.MathUtils.clamp(y + 0.5, 0, 1);
      rayColours[index * 3] = strength;
      rayColours[index * 3 + 1] = strength;
      rayColours[index * 3 + 2] = strength;
    }
    rayPositions.needsUpdate = true;
    rayGeometry.setAttribute(
      "color",
      new THREE.BufferAttribute(rayColours, 3)
    );
    const rayMaterial = new THREE.ShaderMaterial({
      transparent: true,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      depthTest: false,
      side: THREE.DoubleSide,
      toneMapped: false,
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
          float horizontal = 1.0 - smoothstep(
            0.04,
            0.5,
            abs(vUv.x - 0.5)
          );
          float lowerFade = smoothstep(0.0, 0.22, vUv.y);
          float upperFade = 1.0 - smoothstep(0.78, 1.0, vUv.y);
          float alpha = horizontal * lowerFade * upperFade * 0.16;
          gl_FragColor = vec4(vTint * alpha * 1.4, alpha);
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
  }

  reset(): void {
    // Placement and response are derived directly from current simulation state.
  }

  update(
    forwardDistance: number,
    lateralPosition: number,
    momentumFraction: number
  ): void {
    this.glowCentre.set(lateralPosition, 0, -forwardDistance);
    updateMoonGardenMaterial(
      this.material,
      forwardDistance / Math.max(1, this.cfg.speed.forwardAtZeroMomentum),
      this.glowCentre,
      momentumFraction
    );
    this.updateArchitecture(forwardDistance);
    this.updateReef(forwardDistance);
    this.updateGodRays(forwardDistance, momentumFraction);
  }

  private updateArchitecture(forwardDistance: number): void {
    const env = this.cfg.environment;
    const perSide = Math.floor(env.buildingCount / 2);
    const firstBand = Math.floor(
      (forwardDistance - env.buildingBandSpacing * 2) /
      env.buildingBandSpacing
    );
    this.towers.begin();
    this.spires.begin();

    for (let side = -1; side <= 1; side += 2) {
      for (let index = 0; index < perSide; index++) {
        const band = firstBand + index;
        const salt = side > 0 ? 7717 : 3313;
        const zDistance = band * env.buildingBandSpacing +
          (hash01(band, salt + 4) - 0.5) * env.buildingBandSpacing * 0.65;
        // The first pass mixed authored towers with dark procedural spires,
        // which recreated the rejected black skyline. Until the spire receives
        // its own approved authored source, build this review skyline entirely
        // from the broken-tower family with deterministic mirroring and scale.
        const isTower = true;
        const height = lerp(
          env.buildingMinHeight * 1.25,
          env.buildingMaxHeight,
          Math.pow(hash01(band, salt), 1.45)
        );
        const width = lerp(3.8, 8.5, hash01(band, salt + 1));
        const lateral = lerp(
          env.buildingLateralMin,
          env.buildingLateralMax,
          hash01(band, salt + 3)
        );
        const sink = lerp(
          0,
          1.25,
          (lateral - env.buildingLateralMin) /
            Math.max(1, env.buildingLateralMax - env.buildingLateralMin)
        );

        this.position.set(
          side * lateral,
          // Billboard geometry is already translated so local y=0 is its
          // base. Adding half the height again made every tower float.
          -1 - sink,
          -zDistance
        );
        // Tiny outward lean only; silhouettes never fall across the corridor.
        this.quaternion.setFromEuler(new THREE.Euler(
          0,
          isTower ? 0 : lerp(-0.35, 0.35, hash01(band, salt + 9)),
          -side * lerp(0, 0.035, hash01(band, salt + 8))
        ));
        this.scale.set(
          (hash01(band, salt + 10) < 0.5 ? -1 : 1) *
            width / (683 / 1024),
          height,
          1
        );
        this.matrix.compose(this.position, this.quaternion, this.scale);

        const distanceFade = 1 - 0.55 * (
          (lateral - env.buildingLateralMin) /
          Math.max(1, env.buildingLateralMax - env.buildingLateralMin)
        );
        const brightness = lerp(0.74, 0.98, hash01(band, salt + 5)) *
          lerp(0.72, 1, distanceFade);
        this.colour.setRGB(
          brightness * 0.92,
          brightness * 0.97,
          brightness
        );
        this.towers.add(this.matrix, this.colour);
      }
    }
    this.towers.finish();
    this.spires.finish();
  }

  private updateReef(forwardDistance: number): void {
    const env = this.cfg.environment;
    const halfWidth = this.cfg.lane.halfWidth;
    const perSide = Math.floor(env.coralCount / 2);
    const firstBand = Math.floor(
      (forwardDistance - env.coralBandSpacing * 3) / env.coralBandSpacing
    );
    this.coral.begin();
    this.kelp.begin();

    for (let side = -1; side <= 1; side += 2) {
      for (let index = 0; index < perSide; index++) {
        const band = firstBand + index;
        const salt = side > 0 ? 9091 : 1213;
        const zDistance = band * env.coralBandSpacing +
          (hash01(band, salt + 2) - 0.5) * 5;
        const distanceAhead = zDistance - forwardDistance;
        const lod = lodForDistance(distanceAhead);
        const lateral = side * lerp(
          halfWidth + 0.65,
          halfWidth + 3.2,
          hash01(band, salt)
        );
        const heroScale = index % 7 === 0 ? 1.32 : 1;
        const height = lerp(0.82, 2.35, hash01(band, salt + 1)) * heroScale;
        this.position.set(lateral, -1, -zDistance);
        this.quaternion.setFromEuler(new THREE.Euler(0, 0, side * 0.035));
        this.scale.set(
          height * lerp(0.72, 1.05, hash01(band, salt + 5)),
          height,
          1
        );
        this.matrix.compose(this.position, this.quaternion, this.scale);
        const brightness = lerp(0.82, 1, hash01(band, salt + 4));
        this.colour.setRGB(
          brightness * 0.78,
          brightness * 0.9,
          brightness
        );
        this.coral.add(this.matrix, this.colour);

        if (index % 3 === 0) {
          const kelpLod: ArtLod = lod === 0 ? 0 : 1;
          this.position.x += side * 0.58;
          this.scale.set(
            lerp(0.72, 1.1, hash01(band, salt + 7)),
            lerp(0.72, 1.45, hash01(band, salt + 8)),
            1
          );
          this.matrix.compose(this.position, this.quaternion, this.scale);
          this.colour.setHSL(
            lerp(0.46, 0.69, hash01(band, salt + 9)),
            0.74,
            0.3
          );
          this.kelp.add(kelpLod, this.matrix, this.colour);
        }
      }
    }
    this.coral.finish();
    this.kelp.finish();
  }

  private updateGodRays(
    forwardDistance: number,
    momentumFraction: number
  ): void {
    const env = this.cfg.environment;
    const firstBand = Math.floor(forwardDistance / env.godRayBandSpacing);
    for (let index = 0; index < env.godRayCount; index++) {
      // Always place shafts ahead of the camera. The old "-1, 0, 1" band
      // selection put one plane through the camera and produced the giant
      // opaque-looking slab seen in the rejected evidence.
      const band = firstBand + index + 1;
      const side = hash01(band, 5055) < 0.5 ? -1 : 1;
      const lateral = side * lerp(8.5, 17, hash01(band, 5051));
      this.position.set(
        lateral,
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
        lerp(0.5, 1.15, hash01(band, 5054)) *
        lerp(0.78, 1.2, momentumFraction);
      this.colour.setRGB(
        strength * 0.55,
        strength * 0.85,
        strength
      );
      this.godRays.setColorAt(index, this.colour);
    }
    this.godRays.instanceMatrix.needsUpdate = true;
    if (this.godRays.instanceColor) {
      this.godRays.instanceColor.needsUpdate = true;
    }
  }

  dispose(): void {
    for (const item of this.disposables) item.dispose();
  }
}
