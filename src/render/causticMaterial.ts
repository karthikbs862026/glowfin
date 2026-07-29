/**
 * Caustics — Part 3.2's first and highest-ROI shader.
 *
 * Animated light-through-water bands projected onto environment geometry.
 * Procedural rather than a scrolling texture: no texture memory, no atlasing,
 * no seams, and the pattern never visibly repeats across a run.
 *
 * TWO BUGS FIXED FROM THE FIRST VERSION, both only visible on a device:
 *
 * 1. Spatial scale was ~6x too low. At 0.16 cycles/unit the pattern completed
 *    barely one cycle across a 12-unit lane, so instead of light bands the
 *    floor showed a single enormous slow blob. Scale is now tuning data
 *    (`visual.causticScale*`) precisely because this is the kind of value that
 *    cannot be judged without looking at it.
 *
 * 2. Caustics were sampled from world XZ on every surface. That is right for a
 *    floor and wrong for a wall: a vertical face barely varies in Z, so the
 *    pattern collapsed into flat vertical stripes with no variation up the
 *    face. Projection is now chosen by dominant surface normal.
 *
 * PERFORMANCE (Part 4.6):
 * - Octave count is a `#define`, not a uniform loop bound. WebGL1 GLSL requires
 *   constant loop bounds and a dynamic bound costs more than it saves even on
 *   WebGL2. Quality changes recompile, which the cooldown throttles to seconds.
 * - Projection selection branches rather than blending three samples. A blend
 *   would triple the caustic cost for a effect nobody would notice.
 */
import * as THREE from "three";

export interface CausticParams {
  baseColor: THREE.ColorRepresentation;
  causticColor: THREE.ColorRepresentation;
  /** Cycles per world unit. */
  scale: number;
  intensity: number;
  /** Higher = tighter, brighter bands with more dark between them. */
  sharpness: number;
  speed: number;
  fogColor: THREE.ColorRepresentation;
  fogNear: number;
  fogFar: number;
  octaves: number;
}

const VERTEX = /* glsl */ `
  varying vec3 vWorldPos;
  varying vec3 vNormalW;
  varying float vViewDepth;

  void main() {
    vec4 worldPosition = modelMatrix * vec4(position, 1.0);
    vWorldPos = worldPosition.xyz;
    vNormalW = normalize(mat3(modelMatrix) * normal);

    vec4 mvPosition = viewMatrix * worldPosition;
    vViewDepth = -mvPosition.z;
    gl_Position = projectionMatrix * mvPosition;
  }
`;

const FRAGMENT = /* glsl */ `
  precision highp float;

  uniform float uTime;
  uniform vec3 uBaseColor;
  uniform vec3 uCausticColor;
  uniform float uScale;
  uniform float uIntensity;
  uniform float uSharpness;
  uniform vec3 uFogColor;
  uniform float uFogNear;
  uniform float uFogFar;

  varying vec3 vWorldPos;
  varying vec3 vNormalW;
  varying float vViewDepth;

  // Layered sine interference. Cheaper and far more predictable on mobile than
  // the division-heavy caustic loops that circulate, and the sharpening pow is
  // what turns soft interference into readable light bands.
  float caustics(vec2 p, float t) {
    float value = 0.0;
    float amplitude = 1.0;
    float total = 0.0;

    for (int i = 0; i < CAUSTIC_OCTAVES; i++) {
      float fi = float(i);
      vec2 q = p * (1.0 + fi * 0.85) + vec2(fi * 3.1, fi * 1.7);
      float a = sin(q.x * 1.3 + t * 0.9 + fi);
      float b = sin(q.y * 1.1 - t * 0.7 + fi * 1.7);
      float c = sin((q.x + q.y) * 0.8 + t * 1.3);
      value += amplitude * (a * b + c * 0.5);
      total += amplitude;
      amplitude *= 0.55;
    }

    // Normalise by the amplitude sum so octave count does not change overall
    // brightness — otherwise dropping to 1 octave for the low quality tier
    // would also make the scene dimmer, which is not what that tier is for.
    value = value / max(total, 0.0001);
    value = clamp(value * 0.45 + 0.5, 0.0, 1.0);
    return pow(value, uSharpness);
  }

  void main() {
    // Project along whichever axis the surface most faces. A floor samples XZ,
    // a wall facing along X samples ZY, a wall facing along Z samples XY.
    vec3 n = abs(vNormalW);
    vec2 projected;
    if (n.y >= n.x && n.y >= n.z) {
      projected = vWorldPos.xz;
    } else if (n.x >= n.z) {
      projected = vWorldPos.zy;
    } else {
      projected = vWorldPos.xy;
    }

    float pattern = caustics(projected * uScale, uTime);

    // Upward-facing surfaces catch more of the light from above. Cheap, and it
    // stops floor and walls reading as the same flat material.
    float facing = clamp(vNormalW.y * 0.35 + 0.72, 0.0, 1.0);

    vec3 colour = uBaseColor + uCausticColor * pattern * uIntensity * facing;

    float fog = smoothstep(uFogNear, uFogFar, vViewDepth);
    colour = mix(colour, uFogColor, fog);

    gl_FragColor = vec4(colour, 1.0);
  }
`;

export function createCausticMaterial(params: CausticParams): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    defines: { CAUSTIC_OCTAVES: Math.max(1, Math.round(params.octaves)) },
    uniforms: {
      uTime: { value: 0 },
      uBaseColor: { value: new THREE.Color(params.baseColor) },
      uCausticColor: { value: new THREE.Color(params.causticColor) },
      uScale: { value: params.scale },
      uIntensity: { value: params.intensity },
      uSharpness: { value: params.sharpness },
      uFogColor: { value: new THREE.Color(params.fogColor) },
      uFogNear: { value: params.fogNear },
      uFogFar: { value: params.fogFar }
    },
    vertexShader: VERTEX,
    fragmentShader: FRAGMENT
  });
}

/** Change octave count in place. Triggers a recompile, so call sparingly. */
export function setCausticOctaves(material: THREE.ShaderMaterial, octaves: number): void {
  const next = Math.max(1, Math.round(octaves));
  if (material.defines?.["CAUSTIC_OCTAVES"] === next) return;
  material.defines = { ...material.defines, CAUSTIC_OCTAVES: next };
  material.needsUpdate = true;
}

function setUniform(material: THREE.ShaderMaterial, name: string, value: number): void {
  const uniform = material.uniforms[name];
  if (uniform) uniform.value = value;
}

export function setCausticIntensity(material: THREE.ShaderMaterial, intensity: number): void {
  setUniform(material, "uIntensity", intensity);
}

export function advanceCausticTime(
  material: THREE.ShaderMaterial,
  seconds: number,
  speed = 1
): void {
  setUniform(material, "uTime", seconds * speed);
}
