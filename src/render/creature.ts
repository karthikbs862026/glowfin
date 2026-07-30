/**
 * The creature — Part 3.1, built procedurally from primitives.
 *
 * Not final sculpted art. A modelled and rigged axolotl is asset work I cannot
 * author, so this is assembled from scaled spheres: pudgy body, oversized
 * pectoral fins, tail, axolotl gill fronds, and big eyes. It reads as a
 * creature rather than a blob, and — more usefully — it makes the two things
 * Part 3.1 says to *test rather than assume* actually testable:
 *
 *   1. Is the silhouette readable at speed? That is what the oversized fins are
 *      for, and it is a fairness property rather than a style preference.
 *   2. Can eye hue replace a momentum meter? Part 3.1 explicitly warns against
 *      assuming it can. There is deliberately no momentum HUD, so this is the
 *      only momentum indicator and can be judged honestly on device.
 *
 * ANIMATION is entirely derived from simulation state — momentum, light, and
 * smoothed steering. Nothing here is on its own clock, so the creature stays
 * deterministic alongside everything else and replays identically.
 */
import * as THREE from "three";
import type { TuningConfig } from "../core/config";

const VERTEX = /* glsl */ `
  varying vec3 vNormalW;
  varying vec3 vWorldPos;
  void main() {
    vec4 worldPosition = modelMatrix * vec4(position, 1.0);
    vWorldPos = worldPosition.xyz;
    vNormalW = normalize(mat3(modelMatrix) * normal);
    gl_Position = projectionMatrix * viewMatrix * worldPosition;
  }
`;

/**
 * Matte body with an internal glow and a fresnel rim.
 *
 * Matte on purpose: Part 3.1 asks for a body that is not glossy so the light
 * reads as coming from inside rather than reflecting off a plastic surface. A
 * specular highlight would immediately read as "shiny toy".
 */
const BODY_FRAGMENT = /* glsl */ `
  precision mediump float;
  uniform vec3 uCore;
  uniform vec3 uRimColor;
  uniform float uGlow;
  uniform float uRimStrength;
  uniform float uRimPower;
  varying vec3 vNormalW;
  varying vec3 vWorldPos;

  void main() {
    vec3 viewDir = normalize(cameraPosition - vWorldPos);
    float facing = clamp(dot(normalize(vNormalW), viewDir), 0.0, 1.0);

    // Soft internal falloff rather than a lit surface: brightest where the body
    // faces us, so it looks like light escaping a translucent creature.
    float internal = mix(0.55, 1.0, facing);
    float fresnel = pow(1.0 - facing, uRimPower);

    vec3 colour = uCore * uGlow * internal + uRimColor * fresnel * uRimStrength * uGlow;
    gl_FragColor = vec4(colour, 1.0);
  }
`;

const EYE_FRAGMENT = /* glsl */ `
  precision mediump float;
  uniform vec3 uColor;
  uniform float uGlow;
  varying vec3 vNormalW;
  varying vec3 vWorldPos;
  void main() {
    vec3 viewDir = normalize(cameraPosition - vWorldPos);
    float facing = clamp(dot(normalize(vNormalW), viewDir), 0.0, 1.0);
    // Flat and saturated, with a soft edge — a big single-colour eye, not a
    // shaded ball (Part 3.1).
    gl_FragColor = vec4(uColor * uGlow * mix(0.75, 1.25, facing), 1.0);
  }
`;

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

export class Creature {
  readonly group = new THREE.Group();

  private readonly body: THREE.Mesh;
  private readonly finLeft: THREE.Mesh;
  private readonly finRight: THREE.Mesh;
  private readonly tail: THREE.Mesh;
  private readonly gills: THREE.Mesh[] = [];
  private readonly bodyMaterial: THREE.ShaderMaterial;
  private readonly eyeMaterial: THREE.ShaderMaterial;
  private readonly disposables: Array<{ dispose(): void }> = [];

  private flutterPhase = 0;
  private breathPhase = 0;
  private bank = 0;

  constructor(private readonly cfg: TuningConfig) {
    const r = cfg.lane.creatureRadius;

    this.bodyMaterial = new THREE.ShaderMaterial({
      uniforms: {
        uCore: { value: new THREE.Color(0x7fe4ff) },
        uRimColor: { value: new THREE.Color(0xd9f6ff) },
        uGlow: { value: 1 },
        uRimStrength: { value: cfg.creature.rimStrength },
        uRimPower: { value: cfg.creature.rimPower }
      },
      vertexShader: VERTEX,
      fragmentShader: BODY_FRAGMENT
    });

    this.eyeMaterial = new THREE.ShaderMaterial({
      uniforms: {
        uColor: { value: new THREE.Color(0x3aa6ff) },
        uGlow: { value: 1 }
      },
      vertexShader: VERTEX,
      fragmentShader: EYE_FRAGMENT
    });
    this.disposables.push(this.bodyMaterial, this.eyeMaterial);

    // --- body: round and slightly squat, elongated along travel ---
    const bodyGeo = new THREE.SphereGeometry(r, 20, 14);
    this.body = new THREE.Mesh(bodyGeo, this.bodyMaterial);
    this.body.scale.set(1, cfg.creature.bodyHeight, cfg.creature.bodyLength);
    this.group.add(this.body);
    this.disposables.push(bodyGeo);

    // --- eyes ---
    //
    // Positioned to BREAK THE SILHOUETTE when seen from behind, which is the
    // only angle this game ever shows. The first version placed them
    // anatomically — on the face, pointing forward — and they were completely
    // invisible: the camera sits behind the creature, so its face points away.
    // Part 3.1 asks for eye hue as a momentum indicator, and an indicator the
    // player cannot see indicates nothing.
    //
    // Set wide and high enough that each eye protrudes past the body's outline,
    // so both read as glowing spots from directly astern. Less anatomically
    // honest, entirely legible.
    const eyeGeo = new THREE.SphereGeometry(r * cfg.creature.eyeRadius, 12, 10);
    for (const side of [-1, 1]) {
      const eye = new THREE.Mesh(eyeGeo, this.eyeMaterial);
      eye.position.set(
        side * r * cfg.creature.eyeOffsetX,
        r * cfg.creature.eyeOffsetY,
        r * cfg.creature.eyeOffsetZ
      );
      this.group.add(eye);
    }
    this.disposables.push(eyeGeo);

    // --- pectoral fins: deliberately oversized for silhouette at speed ---
    const finGeo = new THREE.SphereGeometry(r * 0.62, 10, 8);
    this.finLeft = new THREE.Mesh(finGeo, this.bodyMaterial);
    this.finRight = new THREE.Mesh(finGeo, this.bodyMaterial);
    for (const [fin, side] of [
      [this.finLeft, -1],
      [this.finRight, 1]
    ] as const) {
      fin.scale.set(1.35, 0.16, 0.8);
      fin.position.set(side * r * 0.9, -r * 0.1, r * 0.05);
      this.group.add(fin);
    }
    this.disposables.push(finGeo);

    // --- tail ---
    const tailGeo = new THREE.SphereGeometry(r * 0.66, 10, 8);
    this.tail = new THREE.Mesh(tailGeo, this.bodyMaterial);
    this.tail.scale.set(0.2, 0.95, 1.05);
    this.tail.position.set(0, r * 0.05, r * 1.1);
    this.group.add(this.tail);
    this.disposables.push(tailGeo);

    // --- gill fronds: the detail that makes it read as axolotl ---
    const gillGeo = new THREE.SphereGeometry(r * 0.15, 8, 6);
    for (const side of [-1, 1]) {
      for (let i = 0; i < 3; i++) {
        const gill = new THREE.Mesh(gillGeo, this.bodyMaterial);
        gill.scale.set(0.7, 0.7, 1.5);
        gill.position.set(side * r * 0.72, r * (0.34 - i * 0.22), -r * 0.16 + i * r * 0.16);
        gill.userData["side"] = side;
        gill.userData["index"] = i;
        this.group.add(gill);
        this.gills.push(gill);
      }
    }
    this.disposables.push(gillGeo);
  }

  /**
   * @param momentumFraction 0..1
   * @param lightFraction    0..1, drives body brightness (ADR-0006)
   * @param smoothedSteering -1..1, drives bank
   */
  update(
    momentumFraction: number,
    lightFraction: number,
    smoothedSteering: number,
    dtSec: number
  ): void {
    const cfg = this.cfg.creature;

    // --- phases advance with momentum, so the creature visibly works harder ---
    const flutterHz = lerp(
      cfg.finFlutterHzAtZeroMomentum,
      cfg.finFlutterHzAtMaxMomentum,
      momentumFraction
    );
    this.flutterPhase += flutterHz * dtSec * Math.PI * 2;
    this.breathPhase += cfg.breathHz * dtSec * Math.PI * 2;

    const flutter = Math.sin(this.flutterPhase) * cfg.finFlutterAmplitude;
    this.finLeft.rotation.z = flutter;
    this.finRight.rotation.z = -flutter;

    // Tail trails the fins by a quarter cycle, which reads as propulsion
    // rather than everything twitching in unison.
    this.tail.rotation.y = Math.sin(this.flutterPhase - Math.PI * 0.5) * cfg.tailSwayAmplitude;

    for (const gill of this.gills) {
      const side = (gill.userData["side"] as number) ?? 1;
      const index = (gill.userData["index"] as number) ?? 0;
      gill.rotation.x = Math.sin(this.flutterPhase * 0.6 + index * 0.8) * 0.25;
      gill.rotation.y = side * 0.35;
    }

    // --- bank into the turn ---
    // Eased rather than instant, but with a short half-life: too much smoothing
    // and the creature visibly lags the input the player just gave, which reads
    // as latency even though the simulation responded immediately.
    const targetBank = -smoothedSteering * cfg.bankAngleMaxRadians;
    const alpha =
      cfg.bankSmoothingHalfLifeSec <= 0
        ? 1
        : 1 - Math.pow(2, -dtSec / cfg.bankSmoothingHalfLifeSec);
    this.bank += (targetBank - this.bank) * alpha;
    this.group.rotation.z = this.bank;
    // A little nose-down at speed, as though pushing through water.
    this.group.rotation.x = momentumFraction * 0.12;

    // --- idle squash and stretch, plus stretch with momentum ---
    const breath = 1 + Math.sin(this.breathPhase) * cfg.breathAmount;
    this.body.scale.set(
      1 / breath,
      cfg.bodyHeight * breath,
      cfg.bodyLength * (1 + momentumFraction * 0.12)
    );

    // --- light drives body glow, momentum drives eye hue (ADR-0006) ---
    const glow = lerp(cfg.bodyGlowAtZeroLight, cfg.bodyGlowAtFullLight, Math.max(0, lightFraction));
    const bodyGlow = this.bodyMaterial.uniforms["uGlow"];
    if (bodyGlow) bodyGlow.value = glow;

    const eyeColour = this.eyeMaterial.uniforms["uColor"];
    if (eyeColour) {
      (eyeColour.value as THREE.Color).setHSL(
        lerp(cfg.eyeHueCalm, cfg.eyeHueMax, momentumFraction),
        0.9,
        0.6
      );
    }
    const eyeGlow = this.eyeMaterial.uniforms["uGlow"];
    // Eyes stay bright even as the body dims, so the momentum read survives a
    // near-death moment — that is exactly when the player most needs it.
    if (eyeGlow) eyeGlow.value = lerp(0.9, 1.5, Math.max(0, lightFraction));
  }

  dispose(): void {
    for (const item of this.disposables) item.dispose();
  }
}
