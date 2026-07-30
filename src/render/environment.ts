/**
 * The drowned city — background silhouettes, god-rays, and coral that responds
 * to the creature passing (Part 3.2 priorities 3 and 5, plus Part 1.2's setting).
 *
 * ALL THREE ARE INSTANCED, one draw call each. The scene already sits at 62 of a
 * 90 draw budget, and dozens of individual buildings would blow it on their own.
 *
 * EVERYTHING HERE IS BACKGROUND and must never compete with obstacle silhouettes
 * (Part 3.4). Concretely: ruins sit well outside the lane, god-rays are additive
 * so they can only brighten and never darken an obstacle, and coral rests dim
 * until the creature is near enough to wake it.
 *
 * PLACEMENT IS DERIVED, NOT STORED. Each object belongs to a numbered "band"
 * along the course, and its size and offset come from hashing that band index.
 * So a given band always looks identical regardless of when it is computed,
 * which keeps the world stable as slots recycle and makes it reproducible in a
 * replay without carrying any generator state.
 */
import * as THREE from "three";
import type { TuningConfig } from "../core/config";

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

export class Environment {
  readonly objects: THREE.Object3D[] = [];

  private readonly buildings: THREE.InstancedMesh;
  private readonly godRays: THREE.InstancedMesh;
  private readonly coral: THREE.InstancedMesh;

  /** Which band each coral slot currently holds, so a recycled slot resets. */
  private readonly coralBand: Int32Array;
  /** Live pulse level per coral slot, 0..1. */
  private readonly coralPulse: Float32Array;

  private readonly matrix = new THREE.Matrix4();
  private readonly position = new THREE.Vector3();
  private readonly quaternion = new THREE.Quaternion();
  private readonly scale = new THREE.Vector3();
  private readonly colour = new THREE.Color();
  private readonly disposables: Array<{ dispose(): void }> = [];

  constructor(private readonly cfg: TuningConfig) {
    const env = cfg.environment;

    // --- ruins ---
    const buildingGeo = new THREE.BoxGeometry(1, 1, 1);
    const buildingMat = new THREE.MeshBasicMaterial({ fog: true });
    this.buildings = new THREE.InstancedMesh(buildingGeo, buildingMat, env.buildingCount);
    this.buildings.frustumCulled = false;
    this.buildings.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.objects.push(this.buildings);
    this.disposables.push(buildingGeo, buildingMat);

    // --- god-rays ---
    // A quad with the gradient baked into vertex colours: bright at the top,
    // black at the bottom. Under additive blending black contributes nothing,
    // so the shaft fades out downward without needing a texture or alpha.
    const rayGeo = new THREE.PlaneGeometry(1, 1, 1, 1);
    const rayColours = new Float32Array([
      1, 1, 1, 1, 1, 1, // top two vertices
      0, 0, 0, 0, 0, 0 // bottom two
    ]);
    rayGeo.setAttribute("color", new THREE.BufferAttribute(rayColours, 3));
    const rayMat = new THREE.MeshBasicMaterial({
      vertexColors: true,
      transparent: true,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      side: THREE.DoubleSide,
      fog: true
    });
    this.godRays = new THREE.InstancedMesh(rayGeo, rayMat, env.godRayCount);
    this.godRays.frustumCulled = false;
    this.godRays.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.objects.push(this.godRays);
    this.disposables.push(rayGeo, rayMat);

    // --- coral ---
    const coralGeo = new THREE.ConeGeometry(0.28, 1, 6);
    const coralMat = new THREE.MeshBasicMaterial({ fog: true });
    this.coral = new THREE.InstancedMesh(coralGeo, coralMat, env.coralCount);
    this.coral.frustumCulled = false;
    this.coral.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.objects.push(this.coral);
    this.disposables.push(coralGeo, coralMat);

    this.coralBand = new Int32Array(env.coralCount).fill(-1);
    this.coralPulse = new Float32Array(env.coralCount);
  }

  /** Drop all live pulses, so a new run does not start mid-glow. */
  reset(): void {
    this.coralPulse.fill(0);
    this.coralBand.fill(-1);
  }

  update(
    forwardDistance: number,
    lateralPosition: number,
    momentumFraction: number,
    dtSec: number
  ): void {
    this.updateBuildings(forwardDistance);
    this.updateGodRays(forwardDistance, momentumFraction);
    this.updateCoral(forwardDistance, lateralPosition, dtSec);
  }

  private updateBuildings(forwardDistance: number): void {
    const env = this.cfg.environment;
    const perSide = Math.floor(env.buildingCount / 2);
    // Start a little behind so ruins do not pop in at the edge of vision.
    const firstBand = Math.floor((forwardDistance - env.buildingBandSpacing * 2) / env.buildingBandSpacing);

    let index = 0;
    for (let side = -1; side <= 1; side += 2) {
      for (let i = 0; i < perSide && index < env.buildingCount; i++, index++) {
        const band = firstBand + i;
        const saltBase = side > 0 ? 7717 : 3313;

        const height = lerp(
          env.buildingMinHeight,
          env.buildingMaxHeight,
          Math.pow(hash01(band, saltBase), 1.7)
        );

        // Proportion varies hard rather than gently: a city reads as a city
        // because of the contrast between slender towers and squat blocks. A
        // uniform range of box sizes just reads as boxes.
        const slender = hash01(band, saltBase + 6) < 0.4;
        const width = slender
          ? lerp(1.2, 3.0, hash01(band, saltBase + 1))
          : lerp(5, 13, hash01(band, saltBase + 1));
        const depth = slender
          ? lerp(1.2, 3.4, hash01(band, saltBase + 2))
          : lerp(5, 15, hash01(band, saltBase + 2));

        const lateral = lerp(
          env.buildingLateralMin,
          env.buildingLateralMax,
          hash01(band, saltBase + 3)
        );
        const jitter = (hash01(band, saltBase + 4) - 0.5) * env.buildingBandSpacing * 0.8;

        // A drowned city is a collapsed one. A few ruins lean, which does more
        // for the read than any amount of colour work on upright boxes.
        const leaning = hash01(band, saltBase + 7) < 0.22;
        const lean = leaning ? lerp(-0.20, 0.20, hash01(band, saltBase + 8)) : 0;

        // Sunk deeper the further out they sit, so the skyline recedes into the
        // water rather than standing on a flat plane.
        const sink = lerp(0, 5, (lateral - env.buildingLateralMin) / Math.max(1, env.buildingLateralMax - env.buildingLateralMin));

        this.position.set(
          side * lateral,
          height * 0.5 - 1 - sink,
          -(band * env.buildingBandSpacing + jitter)
        );
        this.quaternion.setFromEuler(new THREE.Euler(0, lerp(-0.5, 0.5, hash01(band, saltBase + 9)), lean));
        this.scale.set(width, height, depth);
        this.matrix.compose(this.position, this.quaternion, this.scale);
        this.buildings.setMatrixAt(index, this.matrix);

        // Taller ruins read very slightly brighter, which gives the skyline
        // depth without any of them approaching obstacle brightness.
        const distanceFade =
          1 - 0.55 * ((lateral - env.buildingLateralMin) / Math.max(1, env.buildingLateralMax - env.buildingLateralMin));
        const brightness =
          env.buildingBrightness * lerp(0.6, 1.25, hash01(band, saltBase + 5)) * distanceFade;
        this.colour.setRGB(brightness * 0.5, brightness * 0.8, brightness);
        this.buildings.setColorAt(index, this.colour);
      }
    }

    this.buildings.instanceMatrix.needsUpdate = true;
    if (this.buildings.instanceColor) this.buildings.instanceColor.needsUpdate = true;
  }

  private updateGodRays(forwardDistance: number, momentumFraction: number): void {
    const env = this.cfg.environment;
    const firstBand = Math.floor((forwardDistance - env.godRayBandSpacing) / env.godRayBandSpacing);

    for (let i = 0; i < env.godRayCount; i++) {
      const band = firstBand + i;
      // Kept out to the sides. A shaft crossing the lane sits directly between
      // the player and the obstacles they are reading, and additive brightness
      // over a dark scene turns into a grey wash rather than a beam.
      const side = hash01(band, 5055) < 0.5 ? -1 : 1;
      const lateral = side * lerp(7, 17, hash01(band, 5051));
      const tilt = lerp(-0.34, 0.34, hash01(band, 5052));

      this.position.set(lateral, env.godRayHeight * 0.42, -(band * env.godRayBandSpacing));
      this.quaternion.setFromEuler(new THREE.Euler(0, 0, tilt));
      this.scale.set(
        env.godRayWidth * lerp(0.7, 1.5, hash01(band, 5053)),
        env.godRayHeight,
        1
      );
      this.matrix.compose(this.position, this.quaternion, this.scale);
      this.godRays.setMatrixAt(i, this.matrix);

      // Shafts strengthen slightly with momentum, so the world brightens as the
      // player does — the same promise the trail and creature glow make.
      const strength =
        env.godRayIntensity * lerp(0.5, 1.2, hash01(band, 5054)) * lerp(0.8, 1.25, momentumFraction);
      this.colour.setRGB(strength * 0.55, strength * 0.85, strength);
      this.godRays.setColorAt(i, this.colour);
    }

    this.godRays.instanceMatrix.needsUpdate = true;
    if (this.godRays.instanceColor) this.godRays.instanceColor.needsUpdate = true;
  }

  private updateCoral(forwardDistance: number, lateralPosition: number, dtSec: number): void {
    const env = this.cfg.environment;
    const halfWidth = this.cfg.lane.halfWidth;
    const perSide = Math.floor(env.coralCount / 2);
    const firstBand = Math.floor((forwardDistance - env.coralBandSpacing * 3) / env.coralBandSpacing);
    const decay = Math.exp(-env.coralPulseDecayPerSec * dtSec);

    let index = 0;
    for (let side = -1; side <= 1; side += 2) {
      for (let i = 0; i < perSide && index < env.coralCount; i++, index++) {
        const band = firstBand + i;
        const salt = side > 0 ? 9091 : 1213;

        // A recycled slot must not inherit the previous band's glow.
        if (this.coralBand[index] !== band) {
          this.coralBand[index] = band;
          this.coralPulse[index] = 0;
        }

        const lateral = side * lerp(halfWidth + 0.35, halfWidth + 2.6, hash01(band, salt));
        const height = lerp(0.5, 1.9, hash01(band, salt + 1));
        const z = -(band * env.coralBandSpacing + (hash01(band, salt + 2) - 0.5) * 5);

        this.position.set(lateral, height * 0.5 - 1, z);
        this.quaternion.setFromEuler(
          new THREE.Euler(lerp(-0.25, 0.25, hash01(band, salt + 3)), 0, side * 0.12)
        );
        this.scale.set(1, height, 1);
        this.matrix.compose(this.position, this.quaternion, this.scale);
        this.coral.setMatrixAt(index, this.matrix);

        // --- the response (Part 3.2 priority 5) ---
        const dz = -forwardDistance - z;
        const dx = lateralPosition - lateral;
        const distance = Math.hypot(dx, dz);

        let pulse = (this.coralPulse[index] ?? 0) * decay;
        if (distance < env.coralPulseRadiusUnits) {
          // Nearer passes wake it more strongly, so hugging the lane edge —
          // which is also where near-misses live — lights the world up.
          const proximity = 1 - distance / env.coralPulseRadiusUnits;
          pulse = Math.max(pulse, proximity * proximity);
        }
        this.coralPulse[index] = pulse;

        const glow = env.coralBaseGlow + env.coralPulseGlow * pulse;
        const hue = lerp(0.45, 0.86, hash01(band, salt + 4));
        this.colour.setHSL(hue, 0.85, 0.5).multiplyScalar(glow);
        this.coral.setColorAt(index, this.colour);
      }
    }

    this.coral.instanceMatrix.needsUpdate = true;
    if (this.coral.instanceColor) this.coral.instanceColor.needsUpdate = true;
  }

  dispose(): void {
    for (const item of this.disposables) item.dispose();
  }
}
