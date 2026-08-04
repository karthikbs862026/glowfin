/**
 * Production-style Glowfin vertical-slice creature.
 *
 * The body, broad manta fins, tail and six grouped gill leaves are merged into
 * one skinned mesh with ten bones. Both eyes share one mesh and one emissive
 * material, so the complete character costs two draw calls instead of twelve.
 * The authored forward axis is -Z: the portrait chase camera sees Glowfin's
 * round back, broad fins and centered tail. Its eyes sit high on the forward
 * face edge, visibly inboard and above the three-leaf external gills while
 * remaining physically ahead of them. Their irises and pupils face the -Z
 * obstacle direction; the chase camera sees only the crown-side shells, never
 * a rear-facing gaze.
 * Animation remains simulation-driven for deterministic replay.
 */
import * as THREE from "three";
import type { TuningConfig } from "../core/config";
import {
  createGlowfinRigGeometry,
  GLOWFIN_EYE_LOOK_AXIS
} from "./glowfinGeometry";
import type { RuntimeGlowfinGeometrySet } from "./runtimeProductionAssets";

const BODY_VERTEX = /* glsl */ `
  #include <common>
  #include <skinning_pars_vertex>
  varying vec3 vNormalV;
  varying vec3 vViewPosition;
  varying vec3 vColour;
  varying vec3 vObjectPosition;
  varying vec2 vUv;

  void main() {
    #include <beginnormal_vertex>
    #include <skinbase_vertex>
    #include <skinnormal_vertex>
    #include <defaultnormal_vertex>
    #include <begin_vertex>
    #include <skinning_vertex>

    vec4 mvPosition = modelViewMatrix * vec4(transformed, 1.0);
    vNormalV = normalize(transformedNormal);
    vViewPosition = -mvPosition.xyz;
    vColour = color;
    vObjectPosition = transformed;
    vUv = uv;
    gl_Position = projectionMatrix * mvPosition;
  }
`;

const BODY_FRAGMENT = /* glsl */ `
  precision mediump float;
  uniform float uGlow;
  uniform float uRimStrength;
  uniform float uRimPower;
  uniform float uMomentum;
  uniform float uCollision;
  uniform float uRecovery;
  uniform float uGhost;
  uniform sampler2D uSkinMap;
  varying vec3 vNormalV;
  varying vec3 vViewPosition;
  varying vec3 vColour;
  varying vec3 vObjectPosition;
  varying vec2 vUv;

  void main() {
    vec3 viewDir = normalize(vViewPosition);
    vec3 normalV = normalize(vNormalV);
    float facing = clamp(dot(normalV, viewDir), 0.0, 1.0);
    float fresnel = pow(1.0 - facing, uRimPower);
    float internal = mix(0.46, 1.0, facing);
    float moonKey = clamp(
      dot(normalV, normalize(vec3(-0.46, 0.72, 0.52))) * 0.5 + 0.5,
      0.0,
      1.0
    );
    float softVolume = mix(0.46, 1.14, smoothstep(0.08, 0.95, moonKey));
    float crownLight = smoothstep(-0.42, 0.72, normalV.y);

    vec3 cyan = vec3(0.388, 0.878, 1.0);
    vec3 violet = vec3(0.545, 0.420, 0.910);
    vec3 rose = vec3(0.941, 0.416, 0.725);
    vec3 gold = vec3(0.957, 0.835, 0.545);
    vec3 momentumColour = mix(cyan, violet, smoothstep(0.22, 0.7, uMomentum));
    momentumColour = mix(momentumColour, rose, smoothstep(0.7, 0.94, uMomentum));
    momentumColour = mix(momentumColour, gold, smoothstep(0.94, 1.0, uMomentum) * 0.56);

    float broadMottle =
      sin(vObjectPosition.x * 5.1 + vObjectPosition.z * 3.7) *
      sin(vObjectPosition.y * 6.3 - vObjectPosition.z * 2.1);
    float handPainted = 0.92 + 0.08 * broadMottle;
    float gillMask = smoothstep(0.03, 0.14, vColour.r - vColour.g);
    // Red separates the intentionally brighter membrane from both the dark
    // body and its intermediate shoulder. The former green-channel test
    // classified all three as fin tissue, erasing the attachment gradient and
    // making each membrane look like a pale plate pasted onto a pale sphere.
    float finMask = smoothstep(0.14, 0.23, vColour.r) *
      (1.0 - gillMask);
    vec3 authoredPigment = vec3(0.006, 0.27, 0.58);
    authoredPigment = mix(
      authoredPigment,
      vec3(0.018, 0.58, 0.72),
      finMask
    );
    authoredPigment = mix(
      authoredPigment,
      vec3(0.36, 0.18, 0.68),
      gillMask
    );
    vec3 skinSurface = texture2D(
      uSkinMap,
      vUv * vec2(0.88, 0.76)
    ).rgb;
    vec3 skinTint = clamp(
      skinSurface / vec3(0.08, 0.18, 0.34),
      vec3(0.48),
      vec3(1.26)
    );
    float appendageMask = max(finMask, gillMask);
    vec3 seaGlass = mix(
      authoredPigment,
      vColour,
      mix(0.2, 0.86, appendageMask)
    );
    seaGlass *= mix(vec3(1.0), skinTint, (1.0 - gillMask) * 0.34);
    vec3 base = mix(seaGlass, momentumColour, 0.04 + uMomentum * 0.17);
    base *= handPainted * mix(0.74, 1.0, internal) *
      mix(0.76, 1.08, softVolume) *
      mix(0.62, 1.12, crownLight);
    base = mix(base, vec3(0.23, 0.29, 0.36), uCollision * 0.72);
    vec3 rim = mix(vec3(0.85, 0.965, 1.0), gold, uMomentum * 0.45);
    float core = smoothstep(-0.8, 0.55, vObjectPosition.y) *
      (1.0 - smoothstep(0.15, 1.25, abs(vObjectPosition.x)));
    float seaGlassSpecular = pow(max(facing, 0.0), 18.0) * 0.11;
    float livingPulse = 0.5 + 0.5 * sin(
      vObjectPosition.y * 7.2 + vObjectPosition.x * 2.8
    );
    float membraneGradient = smoothstep(0.28, 0.78, vColour.g);
    float finRay = appendageMask * smoothstep(
      0.72,
      0.98,
      0.5 + 0.5 * sin(
        vObjectPosition.x * 12.0 +
        vObjectPosition.y * 5.4 -
        vObjectPosition.z * 7.2
      )
    );
    float membraneLight = appendageMask *
      (0.055 + 0.12 * livingPulse) *
      mix(0.3, 1.0, membraneGradient) * uGlow;
    vec3 colour = base * mix(0.76, 1.02, uGlow) +
      momentumColour * core * 0.055 * uGlow +
      rim * fresnel * uRimStrength * uGlow *
        mix(0.24, 0.5, appendageMask) +
      mix(vec3(0.25, 0.95, 1.0), vec3(0.68, 0.42, 1.0), gillMask) *
        membraneLight +
      mix(vec3(0.08, 0.8, 0.96), vec3(0.72, 0.42, 1.0), gillMask) *
        finRay * (0.025 + 0.06 * uMomentum) * uGlow +
      vec3(0.34, 0.96, 1.0) * uRecovery *
        smoothstep(-0.72, 0.8, vObjectPosition.y) * 0.11 +
      vec3(0.42, 0.78, 0.94) * seaGlassSpecular;
    // Preserve Glowfin's authored blue/teal identity under ACES. The previous
    // equal-channel lift made the body read as grey plastic in the browser
    // even though the source pigment was saturated.
    colour *= mix(
      vec3(0.42, 0.98, 1.2),
      vec3(1.0, 0.7, 1.08),
      gillMask
    );
    float reefBounce = pow(
      max(dot(normalV, normalize(vec3(0.62, -0.18, 0.76))), 0.0),
      1.5
    );
    colour += vec3(0.16, 0.025, 0.13) * reefBounce *
      mix(0.035, 0.11, gillMask);
    colour = min(colour * 0.94, vec3(0.46, 0.9, 1.0));
    colour = mix(colour, vec3(0.34, 0.92, 1.0), uGhost * 0.58);
    gl_FragColor = vec4(colour, mix(1.0, 0.3, uGhost));
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
  }
`;

const EYE_VERTEX = /* glsl */ `
  varying vec3 vNormalV;
  varying vec3 vViewPosition;
  varying vec3 vObjectNormal;
  void main() {
    vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
    vNormalV = normalize(normalMatrix * normal);
    vViewPosition = -mvPosition.xyz;
    vObjectNormal = normalize(normal);
    gl_Position = projectionMatrix * mvPosition;
  }
`;

export const GLOWFIN_EYE_FRAGMENT_SHADER = /* glsl */ `
  precision mediump float;
  uniform vec3 uColor;
  uniform float uGlow;
  uniform float uEnergy;
  uniform float uCollision;
  uniform float uRecovery;
  uniform float uGhost;
  uniform vec3 uLookDirection;
  varying vec3 vNormalV;
  varying vec3 vViewPosition;
  varying vec3 vObjectNormal;
  void main() {
    float viewFacing = clamp(
      dot(normalize(vNormalV), normalize(vViewPosition)),
      0.0,
      1.0
    );
    // Gaze is authored in Glowfin-local space. It must follow the -Z swim axis,
    // never the camera vector; otherwise the rear shell becomes a false face.
    float forwardFacing = clamp(
      dot(normalize(vObjectNormal), normalize(uLookDirection)),
      0.0,
      1.0
    );
    float irisMask = smoothstep(0.2, 0.78, forwardFacing);
    float pupilMask = smoothstep(0.88, 0.985, forwardFacing);
    vec3 pupil = vec3(0.002, 0.008, 0.022);
    vec3 shell = mix(
      vec3(0.18, 0.68, 0.78),
      uColor,
      0.24 + uEnergy * 0.1
    ) * mix(0.84, 1.04, viewFacing) * mix(0.86, 1.0, uGlow);
    vec3 iris = mix(
      vec3(0.018, 0.14, 0.24),
      uColor,
      mix(0.68, 0.9, uEnergy)
    ) * mix(0.86, 1.12, uEnergy) * uGlow;
    vec3 eye = mix(shell, iris, irisMask * mix(0.84, 0.94, uEnergy));
    eye = mix(eye, pupil, pupilMask * 0.94);
    float edge = pow(
      1.0 - abs(dot(normalize(vNormalV), normalize(vViewPosition))),
      2.4
    );
    vec3 edgeColour = mix(
      vec3(0.04, 0.22, 0.34),
      vec3(0.34, 0.12, 0.42),
      uEnergy
    );
    eye += edgeColour * edge * mix(0.12, 0.2, uEnergy);
    eye = mix(eye, vec3(0.16, 0.055, 0.12), uCollision * 0.54);
    eye += vec3(0.32, 0.94, 1.0) * uRecovery * irisMask * 0.22;
    eye = mix(eye, vec3(0.55, 0.96, 1.0), uGhost * 0.62);
    gl_FragColor = vec4(eye, mix(1.0, 0.38, uGhost));
  }
`;

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

function clamp01(value: number): number {
  return Math.max(0, Math.min(1, value));
}

/**
 * Both systems deliberately contribute to the eye signal. Momentum describes
 * the run's stored intensity; normalized forward speed describes what the
 * player is experiencing now. Keeping the weight tunable prevents either
 * channel from silently taking over the diegetic readout.
 */
export function eyeEnergyTarget(
  momentumFraction: number,
  speedFraction: number,
  speedInfluence: number
): number {
  const speedWeight = clamp01(speedInfluence);
  return clamp01(
    clamp01(momentumFraction) * (1 - speedWeight) +
    clamp01(speedFraction) * speedWeight
  );
}

/** Frame-rate-independent smoothing avoids rapid colour chatter. */
export function smoothEyeEnergy(
  current: number,
  target: number,
  dtSec: number,
  halfLifeSec: number
): number {
  const alpha = halfLifeSec <= 0
    ? 1
    : 1 - Math.pow(2, -Math.max(0, dtSec) / halfLifeSec);
  return current + (clamp01(target) - current) * alpha;
}

/**
 * Piecewise colour stops keep the gameplay states visibly distinct. A direct
 * calm-to-max hue lerp made the middle and maximum states both read as pink.
 */
export function eyeHueForEnergy(
  energy: number,
  calmHue: number,
  cruiseHue: number,
  fastHue: number,
  maxHue: number
): number {
  const value = clamp01(energy);
  if (value <= 0.42) {
    return lerp(calmHue, cruiseHue, value / 0.42);
  }
  if (value <= 0.78) {
    return lerp(cruiseHue, fastHue, (value - 0.42) / 0.36);
  }
  return lerp(fastHue, maxHue, (value - 0.78) / 0.22);
}

export type GlowfinAnimationState =
  | "calm"
  | "mid"
  | "max"
  | "collision"
  | "recovery";

export interface CreatureOptions {
  ghost?: boolean;
}

/**
 * The production rig exposes five visually distinct states, but simulation
 * remains the sole authority. Collision and recovery override propulsion;
 * otherwise momentum selects the calm, mid or maximum swim language.
 */
export function resolveGlowfinAnimationState(
  momentumFraction: number,
  collisionFraction: number,
  recoveryFraction: number
): GlowfinAnimationState {
  if (clamp01(collisionFraction) > 0.001) return "collision";
  if (clamp01(recoveryFraction) > 0.001) return "recovery";
  if (clamp01(momentumFraction) >= 0.78) return "max";
  if (clamp01(momentumFraction) >= 0.32) return "mid";
  return "calm";
}

export class Creature {
  readonly group = new THREE.Group();

  private readonly body: THREE.SkinnedMesh;
  private readonly eyes: THREE.Mesh;
  private readonly rootBone = new THREE.Bone();
  private readonly finLeftBone = new THREE.Bone();
  private readonly finRightBone = new THREE.Bone();
  private readonly tailBone = new THREE.Bone();
  private readonly gillBones: THREE.Bone[] = [];
  private readonly bodyMaterial: THREE.ShaderMaterial;
  private readonly eyeMaterial: THREE.ShaderMaterial;
  private readonly disposables: Array<{ dispose(): void }> = [];

  private flutterPhase = 0;
  private breathPhase = 0;
  private bank = 0;
  private eyeEnergy = 0;
  private activeAnimationState: GlowfinAnimationState = "calm";
  private animationStateTimeSec = 0;

  constructor(
    private readonly cfg: TuningConfig,
    skinMap: THREE.Texture,
    options: CreatureOptions = {}
  ) {
    const ghost = options.ghost === true;
    const rig = createGlowfinRigGeometry(cfg, 0);
    this.bodyMaterial = new THREE.ShaderMaterial({
      vertexColors: true,
      uniforms: {
        uGlow: { value: 1 },
        uRimStrength: { value: cfg.creature.rimStrength },
        uRimPower: { value: cfg.creature.rimPower },
        uMomentum: { value: 0 },
        uCollision: { value: 0 },
        uRecovery: { value: 0 },
        uGhost: { value: ghost ? 1 : 0 },
        uSkinMap: { value: skinMap }
      },
      vertexShader: BODY_VERTEX,
      fragmentShader: BODY_FRAGMENT,
      transparent: ghost,
      depthWrite: !ghost
    });
    this.eyeMaterial = new THREE.ShaderMaterial({
      uniforms: {
        uColor: { value: new THREE.Color(0x3aa6ff) },
        uGlow: { value: 1 },
        uEnergy: { value: 0 },
        uCollision: { value: 0 },
        uRecovery: { value: 0 },
        uGhost: { value: ghost ? 1 : 0 },
        uLookDirection: {
          value: new THREE.Vector3(...GLOWFIN_EYE_LOOK_AXIS)
        }
      },
      vertexShader: EYE_VERTEX,
      fragmentShader: GLOWFIN_EYE_FRAGMENT_SHADER,
      toneMapped: false,
      transparent: ghost,
      depthWrite: !ghost
    });

    this.rootBone.name = "GlowfinRoot";
    this.finLeftBone.name = "FinLeft";
    this.finRightBone.name = "FinRight";
    this.tailBone.name = "Tail";
    this.finLeftBone.position.copy(rig.pivots.finLeft);
    this.finRightBone.position.copy(rig.pivots.finRight);
    this.tailBone.position.copy(rig.pivots.tail);
    this.rootBone.add(
      this.finLeftBone,
      this.finRightBone,
      this.tailBone
    );
    for (const [index, pivot] of rig.pivots.gills.entries()) {
      const gill = new THREE.Bone();
      gill.name = `Gill${index + 1}`;
      gill.position.copy(pivot);
      this.rootBone.add(gill);
      this.gillBones.push(gill);
    }

    this.body = new THREE.SkinnedMesh(rig.body, this.bodyMaterial);
    this.body.add(this.rootBone);
    this.body.bind(new THREE.Skeleton([
      this.rootBone,
      this.finLeftBone,
      this.finRightBone,
      this.tailBone,
      ...this.gillBones
    ]));
    this.body.frustumCulled = false;
    this.body.renderOrder = ghost ? 3 : 4;

    this.eyes = new THREE.Mesh(rig.eyes, this.eyeMaterial);
    this.eyes.renderOrder = ghost ? 3 : 5;
    this.group.add(this.body, this.eyes);
    this.disposables.push(
      this.bodyMaterial,
      this.eyeMaterial
    );
  }

  /**
   * Atomically replace the construction fallback with the validated compressed
   * GLB geometry. The runtime rig keeps the same ten semantic bones, custom
   * shaders and simulation driver, so loading production art cannot change
   * steering, collision or replay behaviour.
   */
  installRuntimeGeometry(geometry: RuntimeGlowfinGeometrySet): void {
    const previousBody = this.body.geometry;
    const previousEyes = this.eyes.geometry;
    this.body.geometry = geometry.body;
    this.eyes.geometry = geometry.eyes;
    previousBody.dispose();
    previousEyes.dispose();
    this.body.geometry.userData = {
      ...this.body.geometry.userData,
      runtimeClips: [...geometry.clips],
      runtimeBones: geometry.bones
    };
  }

  update(
    momentumFraction: number,
    speedFraction: number,
    lightFraction: number,
    smoothedSteering: number,
    dtSec: number,
    collisionFraction = 0,
    recoveryFraction = 0
  ): void {
    const cfg = this.cfg.creature;
    const nextState = resolveGlowfinAnimationState(
      momentumFraction,
      collisionFraction,
      recoveryFraction
    );
    if (nextState === this.activeAnimationState) {
      this.animationStateTimeSec += Math.max(0, Math.min(dtSec, 0.25));
    } else {
      this.activeAnimationState = nextState;
      this.animationStateTimeSec = 0;
    }
    const eyeTarget = eyeEnergyTarget(
      momentumFraction,
      speedFraction,
      cfg.eyeSpeedInfluence
    );
    this.eyeEnergy = smoothEyeEnergy(
      this.eyeEnergy,
      eyeTarget,
      Math.min(dtSec, 0.25),
      cfg.eyeResponseHalfLifeSec
    );
    const stateFrequencyScale = this.activeAnimationState === "calm"
      ? 0.72
      : this.activeAnimationState === "max"
        ? 1.12
        : this.activeAnimationState === "collision"
          ? 0.42
          : this.activeAnimationState === "recovery"
            ? 0.88
            : 1;
    const flutterHz = lerp(
      cfg.finFlutterHzAtZeroMomentum,
      cfg.finFlutterHzAtMaxMomentum,
      momentumFraction
    ) * stateFrequencyScale;
    this.flutterPhase += flutterHz * dtSec * Math.PI * 2;
    this.breathPhase += cfg.breathHz * dtSec * Math.PI * 2;

    const stateAmplitudeScale = this.activeAnimationState === "calm"
      ? 0.68
      : this.activeAnimationState === "max"
        ? 0.86
        : this.activeAnimationState === "recovery"
          ? 1.18
          : 1;
    const glide = Math.sin(this.breathPhase * 0.54) * 0.075;
    const flutter = (
      Math.sin(this.flutterPhase) * cfg.finFlutterAmplitude *
      stateAmplitudeScale
    ) + glide;
    const collisionDroop = collisionFraction * 0.46;
    const recoveryBeat = recoveryFraction * (
      0.88 + Math.sin(this.animationStateTimeSec * Math.PI * 4) * 0.12
    );
    const recoveryFlare = recoveryBeat * 0.19;
    this.finLeftBone.rotation.z = flutter - collisionDroop - recoveryFlare;
    this.finRightBone.rotation.z = -flutter + collisionDroop + recoveryFlare;
    this.finLeftBone.rotation.x = -0.04 - momentumFraction * 0.08;
    this.finRightBone.rotation.x = -0.04 - momentumFraction * 0.08;
    this.tailBone.rotation.y =
      Math.sin(this.flutterPhase - Math.PI * 0.5) *
      cfg.tailSwayAmplitude *
      lerp(0.58, 1.2, momentumFraction) *
      (1 - collisionFraction * 0.7);
    this.tailBone.rotation.z =
      -smoothedSteering * 0.16 * (1 - collisionFraction);
    for (const [index, gill] of this.gillBones.entries()) {
      const side = index < 3 ? -1 : 1;
      const localIndex = index % 3;
      gill.rotation.x =
        Math.sin(this.flutterPhase * 0.6 + localIndex * 0.8) *
        0.25 *
        (1 - collisionFraction * 0.65);
      gill.rotation.y = side * (0.34 + recoveryFraction * 0.12);
      gill.rotation.z = side * (
        Math.sin(this.breathPhase + localIndex * 0.42) * 0.055 -
        collisionFraction * 0.12 +
        recoveryBeat * 0.1
      );
    }

    const targetBank = -smoothedSteering * cfg.bankAngleMaxRadians;
    const alpha = cfg.bankSmoothingHalfLifeSec <= 0
      ? 1
      : 1 - Math.pow(2, -dtSec / cfg.bankSmoothingHalfLifeSec);
    this.bank += (targetBank - this.bank) * alpha;
    this.group.rotation.z = this.bank;
    // Lean and yaw into the intended course while preserving the -Z forward
    // axis. The high crown-side eye shells remain visible from rear chase, but
    // their shader-locked irises and pupils continue looking toward obstacles.
    this.group.rotation.x = -momentumFraction * 0.07;
    this.group.rotation.y = -smoothedSteering * 0.12;

    const breath = 1 + Math.sin(this.breathPhase) * cfg.breathAmount;
    const collisionSquash = 1 - collisionFraction * 0.26;
    const recoveryExpand = 1 + recoveryFraction * 0.08;
    const streamline = momentumFraction * 0.035;
    this.rootBone.scale.set(
      (1 / breath) * recoveryExpand * (1 - streamline * 0.58),
      breath * collisionSquash * (1 - streamline),
      (1 + momentumFraction * 0.14) * collisionSquash
    );
    this.eyes.scale.setScalar(
      lerp(1, 0.86, collisionFraction) *
      lerp(1, 1.06, recoveryFraction)
    );
    const glow = lerp(
      cfg.bodyGlowAtZeroLight,
      cfg.bodyGlowAtFullLight,
      Math.max(0, lightFraction)
    );
    const bodyGlow = this.bodyMaterial.uniforms["uGlow"];
    if (bodyGlow) bodyGlow.value = glow;
    const momentum = this.bodyMaterial.uniforms["uMomentum"];
    if (momentum) momentum.value = momentumFraction;
    const collision = this.bodyMaterial.uniforms["uCollision"];
    if (collision) collision.value = collisionFraction;
    const recovery = this.bodyMaterial.uniforms["uRecovery"];
    if (recovery) recovery.value = recoveryFraction;

    const eyeColour = this.eyeMaterial.uniforms["uColor"];
    if (eyeColour) {
      (eyeColour.value as THREE.Color).setHSL(
        eyeHueForEnergy(
          this.eyeEnergy,
          cfg.eyeHueCalm,
          cfg.eyeHueCruise,
          cfg.eyeHueFast,
          cfg.eyeHueMax
        ),
        lerp(0.84, 0.94, this.eyeEnergy),
        lerp(0.4, 0.58, this.eyeEnergy)
      );
    }
    const eyeGlow = this.eyeMaterial.uniforms["uGlow"];
    if (eyeGlow) {
      eyeGlow.value =
        lerp(0.88, 1.04, clamp01(lightFraction)) *
        lerp(0.92, 1.08, this.eyeEnergy);
    }
    const eyeEnergy = this.eyeMaterial.uniforms["uEnergy"];
    if (eyeEnergy) eyeEnergy.value = this.eyeEnergy;
    const eyeCollision = this.eyeMaterial.uniforms["uCollision"];
    if (eyeCollision) eyeCollision.value = collisionFraction;
    const eyeRecovery = this.eyeMaterial.uniforms["uRecovery"];
    if (eyeRecovery) eyeRecovery.value = recoveryFraction;
  }

  animationState(): GlowfinAnimationState {
    return this.activeAnimationState;
  }

  dispose(): void {
    this.body.geometry.dispose();
    this.eyes.geometry.dispose();
    for (const item of this.disposables) item.dispose();
  }
}
