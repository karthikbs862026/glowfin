/**
 * Production-style Glowfin vertical-slice creature.
 *
 * The body, broad manta fins, tail and six grouped gill leaves are merged into
 * one skinned mesh with ten bones. Both eyes share one mesh and one emissive
 * material, so the complete character costs two draw calls instead of twelve.
 * Animation remains simulation-driven for deterministic replay.
 */
import * as THREE from "three";
import type { TuningConfig } from "../core/config";
import { createGlowfinRigGeometry } from "./glowfinGeometry";

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
    float finMask = smoothstep(0.34, 0.46, vColour.g) *
      (1.0 - gillMask);
    vec3 authoredPigment = vec3(0.018, 0.225, 0.34);
    authoredPigment = mix(
      authoredPigment,
      vec3(0.025, 0.285, 0.39),
      finMask
    );
    authoredPigment = mix(
      authoredPigment,
      vec3(0.265, 0.07, 0.37),
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
    vec3 seaGlass = mix(authoredPigment, vColour, 0.14);
    seaGlass *= mix(vec3(1.0), skinTint, (1.0 - gillMask) * 0.34);
    vec3 base = mix(seaGlass, momentumColour, 0.05 + uMomentum * 0.2);
    base *= handPainted * mix(0.74, 1.0, internal) *
      mix(0.76, 1.08, softVolume);
    base = mix(base, vec3(0.23, 0.29, 0.36), uCollision * 0.72);
    vec3 rim = mix(vec3(0.85, 0.965, 1.0), gold, uMomentum * 0.45);
    float core = smoothstep(-0.8, 0.55, vObjectPosition.y) *
      (1.0 - smoothstep(0.15, 1.25, abs(vObjectPosition.x)));
    float seaGlassSpecular = pow(max(facing, 0.0), 18.0) * 0.11;
    vec3 colour = base * mix(0.74, 0.94, uGlow) +
      momentumColour * core * 0.045 * uGlow +
      rim * fresnel * uRimStrength * uGlow * 0.22 +
      vec3(0.42, 0.78, 0.94) * seaGlassSpecular;
    colour = min(
      colour * 0.66,
      vec3(0.27, 0.52, 0.62)
    );
    gl_FragColor = vec4(colour, 1.0);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
  }
`;

const EYE_VERTEX = /* glsl */ `
  varying vec3 vNormalV;
  varying vec3 vViewPosition;
  void main() {
    vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
    vNormalV = normalize(normalMatrix * normal);
    vViewPosition = -mvPosition.xyz;
    gl_Position = projectionMatrix * mvPosition;
  }
`;

const EYE_FRAGMENT = /* glsl */ `
  precision mediump float;
  uniform vec3 uColor;
  uniform float uGlow;
  varying vec3 vNormalV;
  varying vec3 vViewPosition;
  void main() {
    float facing = clamp(
      dot(normalize(vNormalV), normalize(vViewPosition)),
      0.0,
      1.0
    );
    float lens = smoothstep(0.18, 0.86, facing);
    vec3 socket = vec3(0.012, 0.026, 0.055);
    vec3 iris = uColor * uGlow * mix(0.42, 0.86, facing);
    float pupil = smoothstep(0.9, 0.985, facing);
    vec3 eye = mix(socket, iris, lens);
    eye = mix(eye, socket * 0.32, pupil);
    eye += vec3(0.55, 0.9, 1.0) *
      smoothstep(0.965, 0.998, facing) * 0.18;
    gl_FragColor = vec4(eye, 1.0);
  }
`;

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
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

  constructor(
    private readonly cfg: TuningConfig,
    skinMap: THREE.Texture
  ) {
    const rig = createGlowfinRigGeometry(cfg, 0);
    this.bodyMaterial = new THREE.ShaderMaterial({
      vertexColors: true,
      uniforms: {
        uGlow: { value: 1 },
        uRimStrength: { value: cfg.creature.rimStrength },
        uRimPower: { value: cfg.creature.rimPower },
        uMomentum: { value: 0 },
        uCollision: { value: 0 },
        uSkinMap: { value: skinMap }
      },
      vertexShader: BODY_VERTEX,
      fragmentShader: BODY_FRAGMENT
    });
    this.eyeMaterial = new THREE.ShaderMaterial({
      uniforms: {
        uColor: { value: new THREE.Color(0x3aa6ff) },
        uGlow: { value: 1 }
      },
      vertexShader: EYE_VERTEX,
      fragmentShader: EYE_FRAGMENT,
      toneMapped: false
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

    this.eyes = new THREE.Mesh(rig.eyes, this.eyeMaterial);
    this.group.add(this.body, this.eyes);
    this.disposables.push(
      rig.body,
      rig.eyes,
      this.bodyMaterial,
      this.eyeMaterial
    );
  }

  update(
    momentumFraction: number,
    lightFraction: number,
    smoothedSteering: number,
    dtSec: number,
    collisionFraction = 0,
    recoveryFraction = 0
  ): void {
    const cfg = this.cfg.creature;
    const flutterHz = lerp(
      cfg.finFlutterHzAtZeroMomentum,
      cfg.finFlutterHzAtMaxMomentum,
      momentumFraction
    );
    this.flutterPhase += flutterHz * dtSec * Math.PI * 2;
    this.breathPhase += cfg.breathHz * dtSec * Math.PI * 2;

    const flutter = Math.sin(this.flutterPhase) * cfg.finFlutterAmplitude;
    const collisionDroop = collisionFraction * 0.46;
    this.finLeftBone.rotation.z = flutter - collisionDroop;
    this.finRightBone.rotation.z = -flutter + collisionDroop;
    this.tailBone.rotation.y =
      Math.sin(this.flutterPhase - Math.PI * 0.5) *
      cfg.tailSwayAmplitude *
      (1 - collisionFraction * 0.7);
    for (const [index, gill] of this.gillBones.entries()) {
      const side = index < 3 ? -1 : 1;
      const localIndex = index % 3;
      gill.rotation.x =
        Math.sin(this.flutterPhase * 0.6 + localIndex * 0.8) *
        0.25 *
        (1 - collisionFraction * 0.65);
      gill.rotation.y = side * (0.34 + recoveryFraction * 0.12);
    }

    const targetBank = -smoothedSteering * cfg.bankAngleMaxRadians;
    const alpha = cfg.bankSmoothingHalfLifeSec <= 0
      ? 1
      : 1 - Math.pow(2, -dtSec / cfg.bankSmoothingHalfLifeSec);
    this.bank += (targetBank - this.bank) * alpha;
    this.group.rotation.z = this.bank;
    this.group.rotation.x = momentumFraction * 0.12;

    const breath = 1 + Math.sin(this.breathPhase) * cfg.breathAmount;
    const collisionSquash = 1 - collisionFraction * 0.26;
    const recoveryExpand = 1 + recoveryFraction * 0.08;
    this.rootBone.scale.set(
      (1 / breath) * recoveryExpand,
      breath * collisionSquash,
      (1 + momentumFraction * 0.12) * collisionSquash
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

    const eyeColour = this.eyeMaterial.uniforms["uColor"];
    if (eyeColour) {
      (eyeColour.value as THREE.Color).setHSL(
        lerp(cfg.eyeHueCalm, cfg.eyeHueMax, momentumFraction),
        0.56,
        0.34
      );
    }
    const eyeGlow = this.eyeMaterial.uniforms["uGlow"];
    if (eyeGlow) {
      eyeGlow.value = lerp(0.64, 0.94, Math.max(0, lightFraction));
    }
  }

  dispose(): void {
    for (const item of this.disposables) item.dispose();
  }
}
