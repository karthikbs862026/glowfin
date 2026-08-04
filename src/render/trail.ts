/**
 * Momentum-driven trail ribbon — Part 3.2 priority 2.
 *
 * Mesh-based, explicitly **not** particles. Part 3.3 names particle bursts as
 * the primary cause of memory-spike crashes on iOS Safari, and a ribbon gets a
 * continuous unbroken streak that particles cannot without spawning hundreds of
 * them. One geometry, one draw call, fixed vertex count, zero allocation after
 * construction.
 *
 * The ribbon lies in a horizontal plane rather than billboarding toward the
 * camera. Billboarding is the usual choice for trails, but it degenerates here:
 * the camera sits almost directly behind the creature, so the trail runs nearly
 * parallel to the view direction and the cross product used to orient a
 * billboard collapses toward zero. A horizontal ribbon reads cleanly from an
 * elevated chase camera and has no degenerate case.
 *
 * Width and brightness both scale with momentum (Part 3.2), which is the
 * mechanism behind Part 1.2's promise that playing well makes the game visibly
 * more beautiful rather than merely harder.
 */
import * as THREE from "three";
import type { TuningConfig } from "../core/config";
import type { CosmeticPalette } from "../meta/progression";

interface TrailSample {
  x: number;
  z: number;
  momentumFraction: number;
}

export class TrailRibbon {
  readonly mesh: THREE.Mesh;
  private readonly geometry: THREE.BufferGeometry;
  private readonly material: THREE.ShaderMaterial;
  private readonly positions: Float32Array;
  private readonly alphas: Float32Array;
  private readonly samples: TrailSample[] = [];
  private readonly maxSamples: number;
  private secondsSinceSample = 0;

  constructor(private readonly cfg: TuningConfig) {
    this.maxSamples = Math.max(4, Math.round(cfg.trail.segmentCount));

    // Two vertices per sample (left and right edge of the ribbon).
    const vertexCount = this.maxSamples * 2;
    this.positions = new Float32Array(vertexCount * 3);
    this.alphas = new Float32Array(vertexCount);

    this.geometry = new THREE.BufferGeometry();
    this.geometry.setAttribute("position", new THREE.BufferAttribute(this.positions, 3));
    this.geometry.setAttribute("aAlpha", new THREE.BufferAttribute(this.alphas, 1));

    // Index buffer is built once and never changes; only the vertex positions
    // move. Draw range is what shortens the ribbon while it fills up.
    const indices: number[] = [];
    for (let i = 0; i < this.maxSamples - 1; i++) {
      const a = i * 2;
      indices.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
    }
    this.geometry.setIndex(indices);
    this.geometry.setDrawRange(0, 0);

    this.material = new THREE.ShaderMaterial({
      uniforms: {
        uColorNear: { value: new THREE.Color(0x8fefff) },
        uColorFar: { value: new THREE.Color(0x7a5cff) },
        uBrightness: { value: 1 }
      },
      vertexShader: /* glsl */ `
        attribute float aAlpha;
        varying float vAlpha;
        void main() {
          vAlpha = aAlpha;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
      `,
      fragmentShader: /* glsl */ `
        precision mediump float;
        uniform vec3 uColorNear;
        uniform vec3 uColorFar;
        uniform float uBrightness;
        varying float vAlpha;
        void main() {
          vec3 colour = mix(uColorFar, uColorNear, vAlpha);
          gl_FragColor = vec4(colour * uBrightness * vAlpha, vAlpha);
        }
      `,
      transparent: true,
      // Additive so the ribbon only ever adds light. It cannot darken an
      // obstacle behind it, which keeps it clear of the Part 3.4 contrast floor.
      blending: THREE.AdditiveBlending,
      depthWrite: false
    });

    this.mesh = new THREE.Mesh(this.geometry, this.material);
    this.mesh.frustumCulled = false;
  }

  /** Drop the ribbon, e.g. on restart, so it does not streak across a new run. */
  reset(): void {
    this.samples.length = 0;
    this.secondsSinceSample = 0;
    this.geometry.setDrawRange(0, 0);
  }

  /** Switch colours on the existing ribbon material; zero new GPU resources. */
  applyCosmeticPalette(palette: CosmeticPalette): void {
    const near = this.material.uniforms["uColorNear"];
    if (near) (near.value as THREE.Color).setHex(palette.trailNearColor);
    const far = this.material.uniforms["uColorFar"];
    if (far) (far.value as THREE.Color).setHex(palette.trailFarColor);
  }

  update(
    lateralPosition: number,
    forwardDistance: number,
    momentumFraction: number,
    creatureY: number,
    dtSec: number
  ): void {
    const cfg = this.cfg;

    this.secondsSinceSample += dtSec;
    if (this.secondsSinceSample >= cfg.trail.sampleIntervalSec) {
      this.secondsSinceSample = 0;
      this.samples.push({ x: lateralPosition, z: -forwardDistance, momentumFraction });
      if (this.samples.length > this.maxSamples) this.samples.shift();
    }

    const count = this.samples.length;
    if (count < 2) {
      this.geometry.setDrawRange(0, 0);
      return;
    }

    const width =
      cfg.trail.widthAtZeroMomentum +
      (cfg.trail.widthAtMaxMomentum - cfg.trail.widthAtZeroMomentum) * momentumFraction;
    const y = creatureY + cfg.trail.heightOffset;

    for (let i = 0; i < count; i++) {
      const sample = this.samples[i];
      if (!sample) continue;

      // Tangent from neighbours, so the ribbon follows curves rather than
      // kinking at each sample.
      const previous = this.samples[Math.max(0, i - 1)] ?? sample;
      const next = this.samples[Math.min(count - 1, i + 1)] ?? sample;
      let tx = next.x - previous.x;
      let tz = next.z - previous.z;
      const length = Math.hypot(tx, tz) || 1;
      tx /= length;
      tz /= length;

      // Perpendicular in the horizontal plane.
      const px = -tz;
      const pz = tx;

      // Taper toward the tail — but never to nothing.
      //
      // The obvious taper (width and alpha both -> 0 at the tail) made the
      // ribbon invisible here. With a chase camera the *tail* is the part
      // nearest the viewer and the head sits underneath the creature's own
      // glow, so tapering to zero hides precisely the section that can be seen.
      // Floors on both keep the visible stretch readable while still reading as
      // a fading wake.
      const age = i / (count - 1);
      const halfWidth = (width * 0.5) * (0.4 + 0.6 * age);

      const base = i * 6;
      this.positions[base] = sample.x + px * halfWidth;
      this.positions[base + 1] = y;
      this.positions[base + 2] = sample.z + pz * halfWidth;
      this.positions[base + 3] = sample.x - px * halfWidth;
      this.positions[base + 4] = y;
      this.positions[base + 5] = sample.z - pz * halfWidth;

      const fade = 0.3 + 0.7 * age;
      this.alphas[i * 2] = fade;
      this.alphas[i * 2 + 1] = fade;
    }

    const positionAttribute = this.geometry.getAttribute("position");
    const alphaAttribute = this.geometry.getAttribute("aAlpha");
    positionAttribute.needsUpdate = true;
    alphaAttribute.needsUpdate = true;
    this.geometry.setDrawRange(0, (count - 1) * 6);

    const brightness =
      cfg.trail.brightnessAtZeroMomentum +
      (cfg.trail.brightnessAtMaxMomentum - cfg.trail.brightnessAtZeroMomentum) *
        momentumFraction;
    const uniform = this.material.uniforms["uBrightness"];
    if (uniform) uniform.value = brightness;
  }

  dispose(): void {
    this.geometry.dispose();
    this.material.dispose();
  }
}
