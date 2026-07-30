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

interface UvRect {
  uMin: number;
  vMin: number;
  uMax: number;
  vMax: number;
}

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

function createAtlasPlane(aspect: number, uvRect: UvRect): THREE.PlaneGeometry {
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
  // Matrices position the grounded base rather than the image centre.
  geometry.translate(0, 0.5, 0);
  return geometry;
}

class InstancedBillboardFamily {
  readonly object: THREE.InstancedMesh;
  private count = 0;

  constructor(
    material: THREE.Material,
    aspect: number,
    uvRect: UvRect,
    maxCount: number,
    disposables: Array<{ dispose(): void }>
  ) {
    const geometry = createAtlasPlane(aspect, uvRect);
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
  worldAtlas: THREE.Texture;
  architectureMaterial: THREE.Material;
}

const SKYLINE_RECT: UvRect = {
  uMin: 0,
  vMin: 1 - 306 / 1024,
  uMax: 1,
  vMax: 1
};

const ARCHITECTURE_RECTS: readonly UvRect[] = [
  { uMin: 0, vMin: 0, uMax: 341 / 1024, vMax: 1 },
  { uMin: 341 / 1024, vMin: 0, uMax: 682 / 1024, vMax: 1 },
  { uMin: 682 / 1024, vMin: 0, uMax: 1, vMax: 1 }
];

// Bottom-left 512² of the world atlas contains a 2×2 reef sheet.
const REEF_RECTS: readonly UvRect[] = [
  { uMin: 0, vMin: 0.25, uMax: 0.25, vMax: 0.5 },
  { uMin: 0.25, vMin: 0.25, uMax: 0.5, vMax: 0.5 },
  { uMin: 0, vMin: 0, uMax: 0.25, vMax: 0.25 },
  { uMin: 0.25, vMin: 0, uMax: 0.5, vMax: 0.25 }
];

// Bottom-right 512² contains fish, jelly, ray and garden-spirit groups.
const LIFE_RECTS: readonly UvRect[] = [
  { uMin: 0.5, vMin: 0.25, uMax: 0.75, vMax: 0.5 },
  { uMin: 0.75, vMin: 0.25, uMax: 1, vMax: 0.5 },
  { uMin: 0.5, vMin: 0, uMax: 0.75, vMax: 0.25 },
  { uMin: 0.75, vMin: 0, uMax: 1, vMax: 0.25 }
];

const POINT_COUNT = 65;

export class Environment {
  readonly objects: THREE.Object3D[] = [];

  private readonly worldMaterial: THREE.MeshBasicMaterial;
  private readonly architecture: readonly InstancedBillboardFamily[];
  private readonly skyline: InstancedBillboardFamily;
  private readonly reef: readonly InstancedBillboardFamily[];
  private readonly life: readonly InstancedBillboardFamily[];
  private readonly godRays: THREE.InstancedMesh;
  private readonly moonAndMotes: THREE.Points;
  private readonly pointPositions: THREE.BufferAttribute;

  private density = 1;
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
    this.worldMaterial = new THREE.MeshBasicMaterial({
      map: textures.worldAtlas,
      color: 0xffffff,
      alphaTest: 0.08,
      side: THREE.DoubleSide,
      depthWrite: true,
      fog: true,
      toneMapped: false
    });
    this.disposables.push(this.worldMaterial);

    this.architecture = ARCHITECTURE_RECTS.map((rect) =>
      new InstancedBillboardFamily(
        textures.architectureMaterial,
        1 / 3,
        rect,
        env.buildingCount,
        this.disposables
      )
    );
    this.skyline = new InstancedBillboardFamily(
      this.worldMaterial,
      1024 / 306,
      SKYLINE_RECT,
      4,
      this.disposables
    );
    this.reef = REEF_RECTS.map((rect) =>
      new InstancedBillboardFamily(
        this.worldMaterial,
        1,
        rect,
        env.coralCount,
        this.disposables
      )
    );
    const lifeCaps = [8, 6, 4, 8];
    this.life = LIFE_RECTS.map((rect, index) =>
      new InstancedBillboardFamily(
        this.worldMaterial,
        1,
        rect,
        lifeCaps[index] ?? 8,
        this.disposables
      )
    );
    this.objects.push(
      ...this.architecture.map((family) => family.object),
      this.skyline.object,
      ...this.reef.map((family) => family.object),
      ...this.life.map((family) => family.object)
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
          float horizontal = 1.0 - smoothstep(0.04, 0.5, abs(vUv.x - 0.5));
          float lowerFade = smoothstep(0.0, 0.22, vUv.y);
          float upperFade = 1.0 - smoothstep(0.78, 1.0, vUv.y);
          float alpha = horizontal * lowerFade * upperFade * 0.2;
          gl_FragColor = vec4(vTint * 2.2, alpha);
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
      sizes[index] = isMoon ? 34 : lerp(0.32, 0.72, hash01(index, 601));
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
          gl_FragColor = vec4(vColour * alpha * 1.45, alpha);
        }
      `
    });
    this.moonAndMotes = new THREE.Points(pointGeometry, pointMaterial);
    this.moonAndMotes.frustumCulled = false;
    this.objects.push(this.moonAndMotes);
    this.disposables.push(pointGeometry, pointMaterial);
  }

  setDensity(fraction: number): void {
    this.density = THREE.MathUtils.clamp(fraction, 0.25, 1);
  }

  reset(): void {
    // All placements derive from simulation distance; no retained response state.
  }

  update(
    forwardDistance: number,
    lateralPosition: number,
    momentumFraction: number
  ): void {
    const time = forwardDistance /
      Math.max(1, this.cfg.speed.forwardAtZeroMomentum);
    this.updateArchitecture(forwardDistance);
    this.updateSkyline(forwardDistance);
    this.updateReef(forwardDistance, lateralPosition, momentumFraction);
    this.updateLife(forwardDistance, time);
    this.updateMoonAndMotes(forwardDistance, time);
    this.updateGodRays(forwardDistance, momentumFraction);
  }

  private updateArchitecture(forwardDistance: number): void {
    const env = this.cfg.environment;
    const count = Math.max(6, Math.floor(env.buildingCount * this.density));
    const perSide = Math.floor(count / 2);
    const firstBand = Math.floor(
      (forwardDistance - env.buildingBandSpacing * 1.5) /
      env.buildingBandSpacing
    );
    for (const family of this.architecture) family.begin();

    for (let side = -1; side <= 1; side += 2) {
      for (let index = 0; index < perSide; index++) {
        const band = firstBand + index;
        const salt = side > 0 ? 7717 : 3313;
        const variant = positiveMod(band + (side > 0 ? 1 : 0), 3);
        const zDistance = band * env.buildingBandSpacing +
          (hash01(band, salt + 4) - 0.5) * env.buildingBandSpacing * 0.45;
        const lateral = lerp(
          env.buildingLateralMin,
          env.buildingLateralMax,
          hash01(band, salt + 3)
        );
        const height = lerp(
          env.buildingMinHeight * 0.95,
          env.buildingMaxHeight * 0.86,
          Math.pow(hash01(band, salt), 1.5)
        );
        const sink = lerp(
          0,
          1.1,
          (lateral - env.buildingLateralMin) /
            Math.max(1, env.buildingLateralMax - env.buildingLateralMin)
        );
        this.position.set(side * lateral, -1 - sink, -zDistance);
        this.quaternion.setFromEuler(new THREE.Euler(
          0,
          0,
          -side * lerp(0, 0.035, hash01(band, salt + 8))
        ));
        const mirror = hash01(band, salt + 10) < 0.5 ? -1 : 1;
        this.scale.set(
          mirror * lerp(4.2, 7.6, hash01(band, salt + 1)),
          height,
          1
        );
        this.matrix.compose(this.position, this.quaternion, this.scale);
        const brightness = lerp(0.56, 0.82, hash01(band, salt + 5));
        this.colour.setRGB(
          brightness * 0.82,
          brightness * 0.9,
          brightness
        );
        this.architecture[variant]?.add(this.matrix, this.colour);
      }
    }
    for (const family of this.architecture) family.finish();
  }

  private updateSkyline(forwardDistance: number): void {
    // Keep the first city layer inside the fog transition. The previous
    // 150-unit spacing compressed the authored skyline into a thin, nearly
    // black horizon strip and left half of the portrait empty.
    const spacing = 112;
    const count = this.density > 0.8 ? 3 : 2;
    const firstBand = Math.floor(forwardDistance / spacing) + 1;
    this.skyline.begin();
    for (let index = 0; index < count; index++) {
      const band = firstBand + index;
      this.position.set(
        lerp(-4, 4, hash01(band, 712)),
        -1.1,
        -(band * spacing + 18)
      );
      this.quaternion.identity();
      this.scale.set(
        lerp(58, 72, hash01(band, 713)),
        lerp(26, 36, hash01(band, 714)),
        1
      );
      this.matrix.compose(this.position, this.quaternion, this.scale);
      const brightness = lerp(0.48, 0.68, hash01(band, 715));
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
    momentumFraction: number
  ): void {
    const env = this.cfg.environment;
    const halfWidth = this.cfg.lane.halfWidth;
    const count = Math.max(16, Math.floor(env.coralCount * this.density));
    const perSide = Math.floor(count / 2);
    const firstBand = Math.floor(
      (forwardDistance - env.coralBandSpacing * 4) / env.coralBandSpacing
    );
    for (const family of this.reef) family.begin();

    for (let side = -1; side <= 1; side += 2) {
      for (let index = 0; index < perSide; index++) {
        const band = firstBand + index;
        const salt = side > 0 ? 9091 : 1213;
        const variant = positiveMod(band + (side > 0 ? 2 : 0), 4);
        const zDistance = band * env.coralBandSpacing +
          (hash01(band, salt + 2) - 0.5) * env.coralBandSpacing * 0.55;
        const lateral = side * lerp(
          halfWidth + 0.72,
          halfWidth + 4.2,
          hash01(band, salt)
        );
        const heroScale = positiveMod(band, 9) === 0 ? 1.28 : 1;
        const height = lerp(0.85, 2.45, hash01(band, salt + 1)) * heroScale;
        this.position.set(lateral, -1.02, -zDistance);
        this.quaternion.setFromEuler(new THREE.Euler(
          0,
          0,
          side * lerp(-0.025, 0.045, hash01(band, salt + 6))
        ));
        this.scale.set(
          (hash01(band, salt + 7) < 0.5 ? -1 : 1) *
            height * lerp(0.88, 1.34, hash01(band, salt + 5)),
          height,
          1
        );
        this.matrix.compose(this.position, this.quaternion, this.scale);

        const dx = lateral - lateralPosition;
        const dz = zDistance - forwardDistance;
        const distance = Math.hypot(dx, dz);
        const response = Math.max(
          0,
          1 - distance / Math.max(1, env.coralPulseRadiusUnits)
        );
        const brightness = 0.76 + response * 0.34 + momentumFraction * 0.04;
        this.colour.setRGB(
          brightness * 0.82,
          brightness * 0.9,
          brightness
        );
        this.reef[variant]?.add(this.matrix, this.colour);
      }
    }
    for (const family of this.reef) family.finish();
  }

  private updateLife(forwardDistance: number, time: number): void {
    for (const family of this.life) family.begin();

    const fishCount = Math.max(2, Math.round(7 * this.density));
    const fishFirst = Math.floor((forwardDistance - 12) / 25);
    for (let index = 0; index < fishCount; index++) {
      const band = fishFirst + index;
      const phase = time * 0.72 + band * 1.91;
      const direction = hash01(band, 811) < 0.5 ? -1 : 1;
      this.position.set(
        Math.sin(phase) * 10.5,
        lerp(4.2, 9.8, hash01(band, 812)) + Math.sin(phase * 0.7) * 0.5,
        -(band * 25 + hash01(band, 813) * 6)
      );
      this.quaternion.identity();
      const size = lerp(1.15, 2.1, hash01(band, 814));
      this.scale.set(direction * size * 1.3, size, 1);
      this.matrix.compose(this.position, this.quaternion, this.scale);
      this.colour.setRGB(0.72, 0.86, 1);
      this.life[0]?.add(this.matrix, this.colour);
    }

    const jellyCount = Math.max(2, Math.round(5 * this.density));
    const jellyFirst = Math.floor((forwardDistance - 20) / 38);
    for (let index = 0; index < jellyCount; index++) {
      const band = jellyFirst + index;
      const side = hash01(band, 821) < 0.5 ? -1 : 1;
      const rise = positiveMod(time * 0.48 + hash01(band, 822) * 9, 9);
      this.position.set(
        side * lerp(7.8, 15, hash01(band, 823)) +
          Math.sin(time * 0.45 + band) * 0.65,
        1.2 + rise,
        -(band * 38 + 8)
      );
      this.quaternion.identity();
      const pulse = 1 + Math.sin(time * 2 + band) * 0.06;
      const size = lerp(1.3, 2.5, hash01(band, 824)) * pulse;
      this.scale.set(size, size, 1);
      this.matrix.compose(this.position, this.quaternion, this.scale);
      this.colour.setRGB(0.72, 0.82, 1);
      this.life[1]?.add(this.matrix, this.colour);
    }

    const rayCount = Math.max(1, Math.round(3 * this.density));
    const rayFirst = Math.floor((forwardDistance - 15) / 58);
    for (let index = 0; index < rayCount; index++) {
      const band = rayFirst + index;
      const phase = time * 0.28 + band * 2.4;
      this.position.set(
        Math.sin(phase) * 13,
        9.5 + Math.sin(phase * 1.4) * 1.8,
        -(band * 58 + 24)
      );
      this.quaternion.setFromEuler(new THREE.Euler(0, 0, Math.cos(phase) * 0.08));
      const size = lerp(2.4, 3.8, hash01(band, 833));
      this.scale.set(Math.cos(phase) >= 0 ? size : -size, size, 1);
      this.matrix.compose(this.position, this.quaternion, this.scale);
      this.colour.setRGB(0.58, 0.72, 0.92);
      this.life[2]?.add(this.matrix, this.colour);
    }

    const spiritCount = Math.max(2, Math.round(6 * this.density));
    const spiritFirst = Math.floor((forwardDistance - 10) / 22);
    for (let index = 0; index < spiritCount; index++) {
      const band = spiritFirst + index;
      const side = hash01(band, 841) < 0.5 ? -1 : 1;
      const phase = time * 0.9 + band;
      this.position.set(
        side * lerp(7, 11, hash01(band, 842)) + Math.sin(phase) * 0.45,
        0.25 + hash01(band, 843) * 1.6 + Math.sin(phase * 1.7) * 0.18,
        -(band * 22 + hash01(band, 844) * 5)
      );
      this.quaternion.identity();
      const size = lerp(0.72, 1.25, hash01(band, 845));
      this.scale.set(side * size, size, 1);
      this.matrix.compose(this.position, this.quaternion, this.scale);
      this.colour.setRGB(0.74, 0.78, 1);
      this.life[3]?.add(this.matrix, this.colour);
    }

    for (const family of this.life) family.finish();
  }

  private updateMoonAndMotes(forwardDistance: number, time: number): void {
    // A quiet moon-disc/bioluminescent source sits high above the open
    // corridor, rather than merging with the gate at the horizon.
    this.pointPositions.setXYZ(0, 0, 17.5, -forwardDistance - 124);
    const activeMotes = Math.max(20, Math.floor((POINT_COUNT - 1) * this.density));
    const firstBand = Math.floor((forwardDistance - 18) / 5);
    for (let index = 1; index < POINT_COUNT; index++) {
      if (index > activeMotes) {
        this.pointPositions.setXYZ(index, 0, -1000, 0);
        continue;
      }
      const band = firstBand + index;
      const phase = time * lerp(0.18, 0.46, hash01(index, 902)) + band;
      this.pointPositions.setXYZ(
        index,
        lerp(-15, 15, hash01(band, 903)) + Math.sin(phase) * 0.45,
        lerp(-0.2, 8.2, hash01(band, 904)) + Math.cos(phase * 0.8) * 0.25,
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
      const side = hash01(band, 5055) < 0.5 ? -1 : 1;
      this.position.set(
        side * lerp(7.5, 16, hash01(band, 5051)),
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
    for (const item of this.disposables) item.dispose();
  }
}
