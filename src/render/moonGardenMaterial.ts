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
      // Preserve the authored material family. Instance colour now contributes
      // only subtle depth variation; the old strong multiply pushed stone,
      // coral and creatures toward the same grey-cyan value.
      vec3 instanceTint = vec3(0.78) + instanceColor * 0.34;
      vColour *= mix(vec3(1.0), instanceTint, 0.24);
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
  uniform sampler2D uLivingMap;
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
    float topLight = mix(0.2, 1.16, smoothstep(0.08, 0.94, keyLight));
    vec3 viewDirection = normalize(cameraPosition - vWorldPos);
    float moonRim = pow(
      1.0 - clamp(abs(dot(normalize(vNormalW), viewDirection)), 0.0, 1.0),
      2.2
    );
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
    stoneUv *= vec2(0.62, 0.42);
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
    vec3 livingSurface =
      texture2D(uLivingMap, vWorldPos.zy * uSurfaceScale * 0.82).rgb * blend.x +
      texture2D(uLivingMap, vWorldPos.xz * uSurfaceScale * 0.82).rgb * blend.y +
      texture2D(uLivingMap, vWorldPos.xy * uSurfaceScale * 0.82).rgb * blend.z;
    vec3 surfaceBreakup = clamp(
      surface / vec3(0.24, 0.31, 0.36),
      vec3(0.52),
      vec3(1.55)
    );

    float cavity = smoothstep(0.12, 0.78, keyLight) *
      mix(0.7, 1.0, broadWash);
    vec3 colour = vColour * broadWash * topLight;
    colour *= mix(vec3(1.0), surfaceBreakup, stoneWeight * 0.72);
    vec3 paintedStone =
      vColour * surfaceBreakup * mix(0.78, 1.1, keyLight);
    colour = mix(colour, paintedStone, stoneWeight * 0.34);
    colour *= 1.0 - joint * 0.28 * stoneWeight;
    colour *= mix(1.0, 0.84 + porousBreakup * 0.14, livingWeight);
    vec3 livingBreakup = clamp(
      livingSurface / vec3(0.12, 0.18, 0.24),
      vec3(0.46),
      vec3(1.42)
    );
    colour *= mix(vec3(1.0), livingBreakup, livingWeight * 0.52);
    colour *= mix(1.0, 0.46, groundContact);
    colour *= mix(0.82, 1.0, cavity * stoneWeight + livingWeight);
    colour += vec3(0.018, 0.05, 0.07) * stoneWeight;
    colour += vec3(0.07, 0.29, 0.4) * moonRim *
      mix(0.15, 0.38, stoneWeight);
    vec3 coralDirection = normalize(vec3(0.58, -0.18, -0.8));
    float coralBounce = pow(
      max(dot(normalize(vNormalW), coralDirection), 0.0),
      1.4
    );
    colour += vec3(0.2, 0.035, 0.15) * coralBounce *
      mix(0.05, 0.2, livingWeight);
    float wetSpecular = pow(
      max(
        dot(reflect(-keyDirection, normalize(vNormalW)), viewDirection),
        0.0
      ),
      mix(18.0, 34.0, stoneWeight)
    );
    colour += vec3(0.18, 0.48, 0.58) * wetSpecular *
      mix(0.025, 0.075, stoneWeight);
    // Living species keep their own cyan/violet/rose albedo and receive a
    // restrained translucent lift. They no longer read as unlit plastic rods.
    colour += vColour * livingWeight * (0.16 + moonRim * 0.16);
    float livingVein = smoothstep(
      0.08,
      0.24,
      livingSurface.b - livingSurface.r
    );
    colour += vec3(0.035, 0.31, 0.4) * livingVein *
      livingWeight * 0.08;
    colour += awakened * wake * livingWeight * mix(0.16, 0.52, uMomentum);

    float fog = smoothstep(uFogNear, uFogFar, vViewDepth);
    colour = mix(colour, uFogColor, fog);
    gl_FragColor = vec4(colour, 1.0);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
  }
`;

export interface MoonGardenMaterialOptions {
  fogColor: THREE.ColorRepresentation;
  fogNear: number;
  fogFar: number;
  glowRadius: number;
  surfaceMap: THREE.Texture;
  livingMap: THREE.Texture;
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
  surfaceMap,
  livingMap
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
      uLivingMap: { value: livingMap },
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
    vec3 viewDirection = normalize(cameraPosition - vWorldPos);
    float moonRim = pow(
      1.0 - clamp(abs(dot(normalW, viewDirection)), 0.0, 1.0),
      2.2
    );
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
    stoneUv *= vec2(0.72, 0.5);
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

    float sculptLight = mix(
      0.28,
      1.18,
      smoothstep(0.08, 0.94, keyLight)
    );
    vec3 colour = vColour * wash * stoneMottle * sculptLight;
    colour *= surfaceBreakup;
    vec3 paintedStone =
      vColour * surfaceBreakup * mix(0.74, 1.08, keyLight);
    colour = mix(colour, paintedStone, 0.38);
    colour *= 1.0 - joint * 0.43;
    colour *= mix(1.0, 0.43, groundContact);
    float stoneWeight = 1.0 - smoothstep(0.28, 0.66, vGlowWeight);
    colour += vec3(0.035, 0.085, 0.11) * stoneWeight;
    colour += vec3(0.08, 0.34, 0.46) * moonRim * 0.28;
    vec3 coralDirection = normalize(vec3(0.6, -0.2, -0.77));
    float coralBounce = pow(
      max(dot(normalW, coralDirection), 0.0),
      1.5
    );
    colour += vec3(0.19, 0.035, 0.14) * coralBounce * 0.12;
    float wetSpecular = pow(
      max(dot(reflect(-keyDirection, normalW), viewDirection), 0.0),
      22.0
    );
    colour += vec3(0.46, 0.72, 0.82) * wetSpecular * 0.12;
    colour += uCausticColor * pattern * uIntensity * facing;
    colour += vColour * vGlowWeight * 0.035;

    float fog = smoothstep(uFogNear, uFogFar, vViewDepth);
    colour = mix(colour, uFogColor, fog);
    gl_FragColor = vec4(colour, 1.0);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
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
