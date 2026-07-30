import * as THREE from "three";

const VERTEX = /* glsl */ `
  attribute float glowWeight;
  attribute float swayWeight;
  varying vec3 vWorldPos;
  varying vec3 vNormalW;
  varying vec3 vColour;
  varying float vGlowWeight;
  varying float vViewDepth;
  uniform float uTime;

  void main() {
    vec3 transformed = position;
    float phase = uTime * 0.85 + position.y * 1.45;
    transformed.x += sin(phase) * 0.19 * swayWeight;
    transformed.z += cos(phase * 0.73) * 0.07 * swayWeight;

    vec4 localPosition = vec4(transformed, 1.0);
    #ifdef USE_INSTANCING
      localPosition = instanceMatrix * localPosition;
    #endif
    vec4 worldPosition = modelMatrix * localPosition;
    vWorldPos = worldPosition.xyz;

    vec3 transformedNormal = normal;
    #ifdef USE_INSTANCING
      mat3 instanceNormal = mat3(instanceMatrix);
      transformedNormal /= vec3(
        dot(instanceNormal[0], instanceNormal[0]),
        dot(instanceNormal[1], instanceNormal[1]),
        dot(instanceNormal[2], instanceNormal[2])
      );
      transformedNormal = instanceNormal * transformedNormal;
    #endif
    vNormalW = normalize(mat3(modelMatrix) * transformedNormal);

    vColour = color;
    #ifdef USE_INSTANCING_COLOR
      // Instance colour creates depth variation without bleaching vertex-authored
      // stone and living hues into the pale cyan seen in the rejected render.
      vColour *= vec3(0.72) + instanceColor * 0.52;
    #endif
    vGlowWeight = glowWeight;
    vec4 mvPosition = viewMatrix * worldPosition;
    vViewDepth = -mvPosition.z;
    gl_Position = projectionMatrix * mvPosition;
  }
`;

const FRAGMENT = /* glsl */ `
  precision mediump float;
  uniform vec3 uGlowCentre;
  uniform float uGlowRadius;
  uniform float uMomentum;
  uniform vec3 uFogColor;
  uniform float uFogNear;
  uniform float uFogFar;
  uniform sampler2D uSurfaceMap;
  uniform float uSurfaceScale;
  varying vec3 vWorldPos;
  varying vec3 vNormalW;
  varying vec3 vColour;
  varying float vGlowWeight;
  varying float vViewDepth;

  void main() {
    float broadWash = 0.88 + 0.12 * sin(
      vWorldPos.y * 0.82 + vWorldPos.x * 0.19 + vWorldPos.z * 0.07
    );
    vec3 keyDirection = normalize(vec3(-0.35, 0.82, 0.45));
    float keyLight = dot(normalize(vNormalW), keyDirection) * 0.5 + 0.5;
    float topLight = mix(0.54, 1.02, keyLight);
    float groundContact = 1.0 - smoothstep(-0.96, -0.18, vWorldPos.y);
    float distanceToGlow = distance(vWorldPos.xz, uGlowCentre.xz);
    float wake = 1.0 - smoothstep(0.0, uGlowRadius, distanceToGlow);
    wake *= wake * vGlowWeight;

    vec3 livingCyan = vec3(0.388, 0.878, 1.0);
    vec3 moonViolet = vec3(0.545, 0.420, 0.910);
    vec3 heartRose = vec3(0.941, 0.416, 0.725);
    vec3 awakened = mix(livingCyan, moonViolet, smoothstep(0.22, 0.72, uMomentum));
    awakened = mix(awakened, heartRose, smoothstep(0.72, 1.0, uMomentum));

    vec3 n = abs(normalize(vNormalW));
    vec2 stoneUv = n.y > n.z
      ? vWorldPos.xz
      : vWorldPos.xy;
    stoneUv *= vec2(0.34, 0.22);
    vec2 cell = abs(fract(stoneUv + vec2(floor(stoneUv.y) * 0.37, 0.0)) - 0.5);
    float joint = 1.0 - smoothstep(0.025, 0.065, min(0.5 - cell.x, 0.5 - cell.y));
    float stoneWeight = 1.0 - smoothstep(0.08, 0.30, vGlowWeight);
    float livingWeight = smoothstep(0.3, 0.72, vGlowWeight);
    float porousBreakup = 0.5 + 0.5 * sin(
      vWorldPos.x * 8.7 + sin(vWorldPos.y * 6.2) + vWorldPos.z * 7.1
    );
    vec3 blend = pow(abs(normalize(vNormalW)), vec3(4.0));
    blend /= max(0.0001, blend.x + blend.y + blend.z);
    vec3 surface =
      texture2D(uSurfaceMap, vWorldPos.zy * uSurfaceScale).rgb * blend.x +
      texture2D(uSurfaceMap, vWorldPos.xz * uSurfaceScale).rgb * blend.y +
      texture2D(uSurfaceMap, vWorldPos.xy * uSurfaceScale).rgb * blend.z;
    vec3 surfaceBreakup = clamp(
      surface / vec3(0.24, 0.31, 0.36),
      vec3(0.52),
      vec3(1.55)
    );

    vec3 colour = vColour * broadWash * topLight;
    colour *= mix(vec3(1.0), surfaceBreakup, stoneWeight * 0.72);
    vec3 paintedStone =
      surface * mix(0.72, 1.08, keyLight) +
      vColour * 0.16;
    colour = mix(colour, paintedStone, stoneWeight * 0.66);
    colour *= 1.0 - joint * 0.20 * stoneWeight;
    colour *= mix(1.0, 0.84 + porousBreakup * 0.14, livingWeight);
    colour *= mix(1.0, 0.52, groundContact);
    colour += vec3(0.025, 0.065, 0.085) * stoneWeight;
    colour += awakened * wake * mix(0.18, 0.58, uMomentum);

    float fog = smoothstep(uFogNear, uFogFar, vViewDepth);
    colour = mix(colour, uFogColor, fog);
    gl_FragColor = vec4(colour, 1.0);
  }
`;

export interface MoonGardenMaterialOptions {
  fogColor: THREE.ColorRepresentation;
  fogNear: number;
  fogFar: number;
  glowRadius: number;
  surfaceMap: THREE.Texture;
}

/**
 * One shared material for background ruins, reef life and ribbon kelp.
 * Vertex attributes decide which surfaces can awaken; this keeps the complete
 * outside-lane art kit to one active material.
 */
export function createMoonGardenMaterial({
  fogColor,
  fogNear,
  fogFar,
  glowRadius,
  surfaceMap
}: MoonGardenMaterialOptions): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    vertexColors: true,
    fog: false,
    side: THREE.DoubleSide,
    dithering: true,
    uniforms: {
      uTime: { value: 0 },
      uGlowCentre: { value: new THREE.Vector3() },
      uGlowRadius: { value: glowRadius },
      uMomentum: { value: 0 },
      uFogColor: { value: new THREE.Color(fogColor) },
      uFogNear: { value: fogNear },
      uFogFar: { value: fogFar },
      uSurfaceMap: { value: surfaceMap },
      uSurfaceScale: { value: 0.42 }
    },
    vertexShader: VERTEX,
    fragmentShader: FRAGMENT
  });
}

export function updateMoonGardenMaterial(
  material: THREE.ShaderMaterial,
  timeSec: number,
  glowCentre: THREE.Vector3,
  momentumFraction: number
): void {
  const time = material.uniforms["uTime"];
  if (time) time.value = timeSec;
  const centre = material.uniforms["uGlowCentre"];
  if (centre) (centre.value as THREE.Vector3).copy(glowCentre);
  const momentum = material.uniforms["uMomentum"];
  if (momentum) momentum.value = momentumFraction;
}

const OBSTACLE_VERTEX = /* glsl */ `
  attribute float glowWeight;
  varying vec3 vWorldPos;
  varying vec3 vNormalW;
  varying vec3 vColour;
  varying float vGlowWeight;
  varying float vViewDepth;

  void main() {
    vec4 localPosition = vec4(position, 1.0);
    #ifdef USE_INSTANCING
      localPosition = instanceMatrix * localPosition;
    #endif
    vec4 worldPosition = modelMatrix * localPosition;
    vWorldPos = worldPosition.xyz;

    vec3 transformedNormal = normal;
    #ifdef USE_INSTANCING
      mat3 instanceNormal = mat3(instanceMatrix);
      transformedNormal /= vec3(
        dot(instanceNormal[0], instanceNormal[0]),
        dot(instanceNormal[1], instanceNormal[1]),
        dot(instanceNormal[2], instanceNormal[2])
      );
      transformedNormal = instanceNormal * transformedNormal;
    #endif
    vNormalW = normalize(mat3(modelMatrix) * transformedNormal);
    vColour = color;
    vGlowWeight = glowWeight;

    vec4 mvPosition = viewMatrix * worldPosition;
    vViewDepth = -mvPosition.z;
    gl_Position = projectionMatrix * mvPosition;
  }
`;

const OBSTACLE_FRAGMENT = /* glsl */ `
  precision highp float;
  uniform float uTime;
  uniform vec3 uCausticColor;
  uniform float uScale;
  uniform float uIntensity;
  uniform float uSharpness;
  uniform vec3 uFogColor;
  uniform float uFogNear;
  uniform float uFogFar;
  uniform sampler2D uSurfaceMap;
  uniform float uSurfaceScale;
  varying vec3 vWorldPos;
  varying vec3 vNormalW;
  varying vec3 vColour;
  varying float vGlowWeight;
  varying float vViewDepth;

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
    value = value / max(total, 0.0001);
    value = clamp(value * 0.45 + 0.5, 0.0, 1.0);
    return pow(value, uSharpness);
  }

  void main() {
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
    vec3 normalW = normalize(vNormalW);
    vec3 keyDirection = normalize(vec3(-0.35, 0.82, 0.45));
    float keyLight = dot(normalW, keyDirection) * 0.5 + 0.5;
    float facing = clamp(normalW.y * 0.24 + 0.78, 0.0, 1.0);
    float wash = 0.88 + 0.12 * sin(
      vWorldPos.y * 0.76 + vWorldPos.x * 0.18 + vWorldPos.z * 0.09
    );
    float stoneMottle = 0.92 + 0.08 * sin(
      vWorldPos.x * 2.7 + sin(vWorldPos.y * 1.9) + vWorldPos.z * 2.1
    );
    float groundContact = 1.0 - smoothstep(-0.96, -0.08, vWorldPos.y);
    vec2 stoneUv = n.y > n.z
      ? vWorldPos.xz
      : vWorldPos.xy;
    stoneUv *= vec2(0.36, 0.24);
    vec2 cell = abs(fract(stoneUv + vec2(floor(stoneUv.y) * 0.35, 0.0)) - 0.5);
    float joint = 1.0 - smoothstep(0.028, 0.07, min(0.5 - cell.x, 0.5 - cell.y));
    vec3 blend = pow(abs(normalW), vec3(4.0));
    blend /= max(0.0001, blend.x + blend.y + blend.z);
    vec3 surface =
      texture2D(uSurfaceMap, vWorldPos.zy * uSurfaceScale).rgb * blend.x +
      texture2D(uSurfaceMap, vWorldPos.xz * uSurfaceScale).rgb * blend.y +
      texture2D(uSurfaceMap, vWorldPos.xy * uSurfaceScale).rgb * blend.z;
    vec3 surfaceBreakup = clamp(
      surface / vec3(0.24, 0.31, 0.36),
      vec3(0.5),
      vec3(1.58)
    );

    vec3 colour = vColour * wash * stoneMottle * mix(0.54, 1.02, keyLight);
    colour *= surfaceBreakup;
    vec3 paintedStone =
      surface * mix(0.68, 1.06, keyLight) +
      vColour * 0.14;
    colour = mix(colour, paintedStone, 0.68);
    colour *= 1.0 - joint * 0.18;
    colour *= mix(1.0, 0.5, groundContact);
    float stoneWeight = 1.0 - smoothstep(0.28, 0.66, vGlowWeight);
    colour += vec3(0.035, 0.085, 0.11) * stoneWeight;
    colour += uCausticColor * pattern * uIntensity * facing;
    colour += vColour * vGlowWeight * 0.035;

    float fog = smoothstep(uFogNear, uFogFar, vViewDepth);
    colour = mix(colour, uFogColor, fog);
    gl_FragColor = vec4(colour, 1.0);
  }
`;

export interface MoonstoneObstacleMaterialOptions {
  causticColor: THREE.ColorRepresentation;
  scale: number;
  intensity: number;
  sharpness: number;
  fogColor: THREE.ColorRepresentation;
  fogNear: number;
  fogFar: number;
  octaves: number;
  surfaceMap: THREE.Texture;
}

export function createMoonstoneObstacleMaterial({
  causticColor,
  scale,
  intensity,
  sharpness,
  fogColor,
  fogNear,
  fogFar,
  octaves,
  surfaceMap
}: MoonstoneObstacleMaterialOptions): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    vertexColors: true,
    dithering: true,
    defines: { CAUSTIC_OCTAVES: Math.max(1, Math.round(octaves)) },
    uniforms: {
      uTime: { value: 0 },
      uCausticColor: { value: new THREE.Color(causticColor) },
      uScale: { value: scale },
      uIntensity: { value: intensity },
      uSharpness: { value: sharpness },
      uFogColor: { value: new THREE.Color(fogColor) },
      uFogNear: { value: fogNear },
      uFogFar: { value: fogFar },
      uSurfaceMap: { value: surfaceMap },
      uSurfaceScale: { value: 0.42 }
    },
    vertexShader: OBSTACLE_VERTEX,
    fragmentShader: OBSTACLE_FRAGMENT
  });
}
