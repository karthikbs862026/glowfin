import * as THREE from "three";
import { LIVING_DISTRICT_CONTRACT } from "../art/livingDistrict";

const VERTEX = /* glsl */ `
  attribute float glowWeight;
  attribute float swayWeight;
  attribute float materialRole;
  varying vec3 vWorldPos;
  varying vec3 vNormalW;
  varying vec3 vColour;
  varying float vGlowWeight;
  varying float vMaterialRole;
  varying float vViewDepth;
  uniform float uTime;

  void main() {
    vec3 transformed = position;
    float phase = uTime * 0.85 + position.y * 1.45;
    transformed.x += sin(phase) * ${LIVING_DISTRICT_CONTRACT.reef.maximumSwayWorldUnits} * swayWeight;
    transformed.z += cos(phase * 0.73) * ${LIVING_DISTRICT_CONTRACT.reef.maximumSwayWorldUnits * 0.42} * swayWeight;

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
    vMaterialRole = materialRole;
    vec4 mvPosition = viewMatrix * worldPosition;
    vViewDepth = -mvPosition.z;
    gl_Position = projectionMatrix * mvPosition;
  }
`;

const FRAGMENT = /* glsl */ `
  precision highp float;
  uniform float uTime;
  uniform vec3 uGlowCentre;
  uniform float uGlowRadius;
  uniform float uMomentum;
  uniform float uRestoration;
  uniform float uMoonBloomCentreZ;
  uniform float uMoonBloomStrength;
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
  varying float vMaterialRole;
  varying float vViewDepth;

  vec3 perturbSurfaceNormal(
    vec3 surfacePosition,
    vec3 surfaceNormal,
    float height,
    float strength
  ) {
    vec3 sigmaX = dFdx(surfacePosition);
    vec3 sigmaY = dFdy(surfacePosition);
    vec3 r1 = cross(sigmaY, surfaceNormal);
    vec3 r2 = cross(surfaceNormal, sigmaX);
    float determinant = dot(sigmaX, r1);
    vec2 gradient = vec2(dFdx(height), dFdy(height));
    vec3 surfaceGradient = sign(determinant) *
      (gradient.x * r1 + gradient.y * r2);
    return normalize(
      abs(determinant) * surfaceNormal -
      surfaceGradient * strength
    );
  }

  float roleIs(float target) {
    return 1.0 - smoothstep(0.18, 0.45, abs(vMaterialRole - target));
  }

  void main() {
    float broadWash = 0.88 + 0.12 * sin(
      vWorldPos.y * 0.82 + vWorldPos.x * 0.19 + vWorldPos.z * 0.07
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
    awakened = mix(awakened, vec3(0.55, 1.0, 0.78), uRestoration * 0.42);

    vec3 n = abs(normalize(vNormalW));
    vec2 stoneUv = n.y > n.z
      ? vWorldPos.xz
      : vWorldPos.xy;
    stoneUv *= vec2(0.42, 0.3);
    vec2 cell = abs(fract(stoneUv + vec2(floor(stoneUv.y) * 0.37, 0.0)) - 0.5);
    float joint = 1.0 - smoothstep(0.025, 0.065, min(0.5 - cell.x, 0.5 - cell.y));
    float stoneWeight = 1.0 - smoothstep(0.08, 0.30, vGlowWeight);
    float livingWeight = smoothstep(0.3, 0.72, vGlowWeight);
    float limestoneRole = roleIs(0.0);
    float nacreRole = roleIs(1.0);
    float bronzeRole = roleIs(2.0);
    float lapisRole = roleIs(3.0);
    float crystalRole = roleIs(4.0);
    float coralRole = roleIs(5.0);
    float roleTotal = max(
      0.001,
      limestoneRole + nacreRole + bronzeRole + lapisRole + crystalRole + coralRole
    );
    vec3 authoredBase = (
      vec3(0.46, 0.48, 0.36) * limestoneRole +
      vec3(0.50, 0.43, 0.59) * nacreRole +
      vec3(0.50, 0.245, 0.065) * bronzeRole +
      vec3(0.055, 0.13, 0.43) * lapisRole +
      vec3(0.055, 0.45, 0.56) * crystalRole +
      max(vColour, vec3(0.16, 0.08, 0.18)) * coralRole
    ) / roleTotal;
    float porousBreakup = 0.5 + 0.5 * sin(
      vWorldPos.x * 8.7 + sin(vWorldPos.y * 6.2) + vWorldPos.z * 7.1
    );
    vec3 blend = pow(abs(normalize(vNormalW)), vec3(4.0));
    blend /= max(0.0001, blend.x + blend.y + blend.z);
    // A stone fragment previously paid for both triplanar texture families,
    // even though livingWeight made the coral sample contribute zero (and the
    // inverse was true for fully living surfaces). The branches are coherent
    // within each authored draw family, so real phones and CI SwiftShader can
    // skip three texture fetches across the large district silhouettes while
    // preserving the exact blended result on transition vertices.
    vec3 surface = vec3(0.24, 0.31, 0.36);
    if (livingWeight < 0.995) {
      surface =
        texture2D(uSurfaceMap, vWorldPos.zy * uSurfaceScale).rgb * blend.x +
        texture2D(uSurfaceMap, vWorldPos.xz * uSurfaceScale).rgb * blend.y +
        texture2D(uSurfaceMap, vWorldPos.xy * uSurfaceScale).rgb * blend.z;
    }
    vec3 livingSurface = vec3(0.12, 0.18, 0.24);
    if (livingWeight > 0.005) {
      livingSurface =
        texture2D(uLivingMap, vWorldPos.zy * uSurfaceScale * 0.82).rgb * blend.x +
        texture2D(uLivingMap, vWorldPos.xz * uSurfaceScale * 0.82).rgb * blend.y +
        texture2D(uLivingMap, vWorldPos.xy * uSurfaceScale * 0.82).rgb * blend.z;
    }
    float surfaceHeight = dot(
      mix(surface, livingSurface, livingWeight),
      vec3(0.2126, 0.7152, 0.0722)
    );
    vec3 normalW = perturbSurfaceNormal(
      vWorldPos,
      normalize(vNormalW),
      surfaceHeight,
      mix(0.28, 0.42, livingWeight)
    );
    vec3 keyDirection = normalize(vec3(-0.35, 0.82, 0.45));
    float keyLight = dot(normalW, keyDirection) * 0.5 + 0.5;
    float topLight = mix(0.2, 1.16, smoothstep(0.08, 0.94, keyLight));
    vec3 viewDirection = normalize(cameraPosition - vWorldPos);
    float moonRim = pow(
      1.0 - clamp(abs(dot(normalW, viewDirection)), 0.0, 1.0),
      2.2
    );
    vec3 surfaceBreakup = clamp(
      surface / vec3(0.24, 0.31, 0.36),
      vec3(0.52),
      vec3(1.55)
    );

    float cavity = smoothstep(0.12, 0.78, keyLight) *
      mix(0.7, 1.0, broadWash);
    vec3 colour = vColour * broadWash * topLight;
    colour *= mix(vec3(1.0), surfaceBreakup, stoneWeight * 0.52);
    vec3 paintedStone =
      vColour * surfaceBreakup * mix(0.78, 1.1, keyLight);
    colour = mix(colour, paintedStone, stoneWeight * 0.24);
    // Geometry already carries real courses, ribs and recesses. Keep only a
    // broad, quiet joint wash; the previous high-frequency grid stamped every
    // ruin and coral rock with the same miniature brick pattern.
    colour *= 1.0 - joint * 0.12 * stoneWeight;
    colour *= mix(1.0, 0.84 + porousBreakup * 0.14, livingWeight);
    vec3 livingBreakup = clamp(
      livingSurface / vec3(0.12, 0.18, 0.24),
      vec3(0.46),
      vec3(1.42)
    );
    colour *= mix(vec3(1.0), livingBreakup, livingWeight * 0.52);
    // Material identity must survive the portrait downsample. The previous
    // role response was mostly an after-light tint, so limestone, nacre,
    // bronze and lapis all inherited the same blue stone value. Establish a
    // distinct authored base before specular/rim/emission are added.
    float authoredStrength = 0.46 +
      bronzeRole * 0.18 +
      lapisRole * 0.16 +
      nacreRole * 0.12 +
      crystalRole * 0.14 -
      coralRole * 0.1;
    colour = mix(
      colour,
      authoredBase * mix(0.58, 1.2, keyLight) *
        mix(vec3(1.0), surfaceBreakup, stoneWeight * 0.42),
      clamp(authoredStrength, 0.34, 0.68)
    );
    colour *= mix(1.0, 0.46, groundContact);
    colour *= mix(0.82, 1.0, cavity * stoneWeight + livingWeight);
    colour += vec3(0.018, 0.05, 0.07) * stoneWeight;
    colour += vec3(0.07, 0.29, 0.4) * moonRim *
      mix(0.15, 0.38, stoneWeight);
    vec3 coralDirection = normalize(vec3(0.58, -0.18, -0.8));
    float coralBounce = pow(
      max(dot(normalW, coralDirection), 0.0),
      1.4
    );
    colour += vec3(0.2, 0.035, 0.15) * coralBounce *
      mix(0.05, 0.2, livingWeight);
    float wetSpecular = pow(
      max(
        dot(reflect(-keyDirection, normalW), viewDirection),
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

    // One shared shader, six authored material responses. Role-specific
    // roughness, colour travel and restrained emission keep a district from
    // reading as one uniformly painted procedural mesh.
    colour = mix(
      colour,
      colour * vec3(1.12, 1.05, 0.82) + vec3(0.014, 0.018, 0.01),
      limestoneRole * 0.3
    );
    vec3 nacreShift = mix(
      vec3(0.28, 0.52, 0.62),
      vec3(0.5, 0.29, 0.58),
      clamp(viewDirection.y * 0.5 + moonRim, 0.0, 1.0)
    );
    colour += nacreShift * nacreRole * (0.075 + moonRim * 0.18);
    colour = mix(colour, colour * vec3(1.3, 0.76, 0.34), bronzeRole * 0.38);
    colour += vec3(0.3, 0.13, 0.018) * wetSpecular * bronzeRole * 0.44;
    colour = mix(colour, colour * vec3(0.38, 0.58, 1.36), lapisRole * 0.34);
    colour += vec3(0.035, 0.3, 0.43) * crystalRole * (0.28 + moonRim * 0.42);
    float travellingWave = 0.0;
    if (coralRole > 0.05) {
      float tideWaveA = smoothstep(
        0.72,
        0.98,
        sin(
          vWorldPos.z * 0.23 -
          uTime * ${LIVING_DISTRICT_CONTRACT.reef.travellingWaveSpeed} +
          vWorldPos.x * 0.11
        ) * 0.5 + 0.5
      );
      float tideWaveB = smoothstep(
        0.78,
        0.99,
        sin(
          vWorldPos.z * 0.39 -
          uTime * ${LIVING_DISTRICT_CONTRACT.reef.travellingWaveSpeed * 1.37} -
          vWorldPos.x * 0.17 + 1.8
        ) * 0.5 + 0.5
      );
      travellingWave = max(tideWaveA, tideWaveB * 0.72);
    }
    colour += awakened * coralRole * travellingWave *
      (0.095 + uMomentum * 0.085);
    float moonBloomBand = 1.0 - smoothstep(
      0.0,
      22.0,
      abs(vWorldPos.z - uMoonBloomCentreZ)
    );
    colour += mix(
      vec3(0.16, 0.74, 0.88),
      vec3(0.92, 0.25, 0.72),
      smoothstep(0.2, 0.9, moonBloomBand)
    ) * moonBloomBand * uMoonBloomStrength *
      (coralRole * 0.62 + crystalRole * 0.38);

    // Realm restoration is a persistent presentation layer only: healed
    // districts gain warmer nacre, healthier coral and brighter route-side
    // life without changing a single collision or steering value.
    float restoredLife = clamp(coralRole * 0.68 + crystalRole * 0.46 + nacreRole * 0.18, 0.0, 1.0);
    colour = mix(colour, colour * vec3(1.08, 1.16, 1.10), uRestoration * restoredLife * 0.48);
    colour += vec3(0.08, 0.24, 0.17) * uRestoration * restoredLife *
      (0.34 + 0.22 * sin(vWorldPos.z * 0.08 - uTime * 0.38));
    colour += vec3(0.16, 0.11, 0.035) * uRestoration * limestoneRole * moonRim * 0.18;

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
      uRestoration: { value: 0 },
      uMoonBloomCentreZ: { value: -10000 },
      uMoonBloomStrength: { value: 0 },
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
  momentumFraction: number,
  moonBloom: { anchorDistance: number; strength: number } | null = null,
  restorationFraction = 0,
): void {
  const time = material.uniforms["uTime"];
  if (time) time.value = timeSec;
  const centre = material.uniforms["uGlowCentre"];
  if (centre) (centre.value as THREE.Vector3).copy(glowCentre);
  const momentum = material.uniforms["uMomentum"];
  if (momentum) momentum.value = momentumFraction;
  const restoration = material.uniforms["uRestoration"];
  if (restoration) restoration.value = THREE.MathUtils.clamp(restorationFraction, 0, 1);
  const bloomCentre = material.uniforms["uMoonBloomCentreZ"];
  if (bloomCentre) bloomCentre.value = moonBloom ? -moonBloom.anchorDistance : -10000;
  const bloomStrength = material.uniforms["uMoonBloomStrength"];
  if (bloomStrength) bloomStrength.value = moonBloom
    ? THREE.MathUtils.clamp(moonBloom.strength, 0, 1)
    : 0;
}

const OBSTACLE_VERTEX = /* glsl */ `
  attribute float glowWeight;
  attribute float materialRole;
  varying vec3 vWorldPos;
  varying vec3 vNormalW;
  varying vec3 vColour;
  varying float vGlowWeight;
  varying float vMaterialRole;
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
    vMaterialRole = materialRole;

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
  varying float vMaterialRole;
  varying float vViewDepth;

  vec3 perturbSurfaceNormal(
    vec3 surfacePosition,
    vec3 surfaceNormal,
    float height,
    float strength
  ) {
    vec3 sigmaX = dFdx(surfacePosition);
    vec3 sigmaY = dFdy(surfacePosition);
    vec3 r1 = cross(sigmaY, surfaceNormal);
    vec3 r2 = cross(surfaceNormal, sigmaX);
    float determinant = dot(sigmaX, r1);
    vec2 gradient = vec2(dFdx(height), dFdy(height));
    vec3 surfaceGradient = sign(determinant) *
      (gradient.x * r1 + gradient.y * r2);
    return normalize(
      abs(determinant) * surfaceNormal -
      surfaceGradient * strength
    );
  }

  float roleIs(float target) {
    return 1.0 - smoothstep(0.18, 0.45, abs(vMaterialRole - target));
  }

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
    stoneUv *= vec2(0.44, 0.31);
    vec2 cell = abs(fract(stoneUv + vec2(floor(stoneUv.y) * 0.35, 0.0)) - 0.5);
    float joint = 1.0 - smoothstep(0.028, 0.07, min(0.5 - cell.x, 0.5 - cell.y));
    vec3 blend = pow(abs(normalize(vNormalW)), vec3(4.0));
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
    float surfaceHeight = dot(surface, vec3(0.2126, 0.7152, 0.0722));
    vec3 normalW = perturbSurfaceNormal(
      vWorldPos,
      normalize(vNormalW),
      surfaceHeight,
      0.34
    );
    vec3 keyDirection = normalize(vec3(-0.35, 0.82, 0.45));
    float keyLight = dot(normalW, keyDirection) * 0.5 + 0.5;
    vec3 viewDirection = normalize(cameraPosition - vWorldPos);
    float moonRim = pow(
      1.0 - clamp(abs(dot(normalW, viewDirection)), 0.0, 1.0),
      2.2
    );
    float facing = clamp(normalW.y * 0.24 + 0.78, 0.0, 1.0);

    float sculptLight = mix(
      0.18,
      1.1,
      smoothstep(0.08, 0.94, keyLight)
    );
    vec3 colour = vColour * wash * stoneMottle * sculptLight;
    colour *= mix(vec3(1.0), surfaceBreakup, 0.58);
    vec3 paintedStone =
      vColour * surfaceBreakup * mix(0.74, 1.08, keyLight);
    colour = mix(colour, paintedStone, 0.24);
    // Physical course geometry supplies the masonry read. This restrained
    // joint term avoids projecting a second block grid across the carved arch
    // and continuous buttress surfaces.
    colour *= 1.0 - joint * 0.14;
    colour *= mix(1.0, 0.43, groundContact);
    float stoneWeight = 1.0 - smoothstep(0.28, 0.66, vGlowWeight);
    float limestoneRole = roleIs(0.0);
    float nacreRole = roleIs(1.0);
    float bronzeRole = roleIs(2.0);
    float lapisRole = roleIs(3.0);
    float crystalRole = roleIs(4.0);
    float coralRole = roleIs(5.0);
    float roleTotal = max(
      0.001,
      limestoneRole + nacreRole + bronzeRole + lapisRole + crystalRole + coralRole
    );
    vec3 authoredBase = (
      vec3(0.48, 0.49, 0.37) * limestoneRole +
      vec3(0.52, 0.45, 0.62) * nacreRole +
      vec3(0.52, 0.25, 0.06) * bronzeRole +
      vec3(0.05, 0.12, 0.44) * lapisRole +
      vec3(0.05, 0.48, 0.6) * crystalRole +
      max(vColour, vec3(0.17, 0.075, 0.19)) * coralRole
    ) / roleTotal;
    float authoredStrength = clamp(
      0.5 + bronzeRole * 0.16 + lapisRole * 0.14 +
      nacreRole * 0.1 + crystalRole * 0.14 - coralRole * 0.08,
      0.4,
      0.68
    );
    colour = mix(
      colour,
      authoredBase * mix(0.56, 1.18, keyLight) *
        mix(vec3(1.0), surfaceBreakup, 0.42),
      authoredStrength
    );
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
    colour += mix(vec3(0.04, 0.18, 0.23), vec3(0.24, 0.07, 0.22), moonRim) *
      nacreRole * (0.075 + moonRim * 0.14);
    colour = mix(colour, colour * vec3(1.3, 0.74, 0.32), bronzeRole * 0.36);
    colour = mix(colour, colour * vec3(0.36, 0.55, 1.38), lapisRole * 0.34);
    colour += vec3(0.03, 0.31, 0.43) * crystalRole * (0.22 + moonRim * 0.3);
    float tideWave = smoothstep(
      0.74,
      0.98,
      sin(vWorldPos.z * 0.21 - uTime * 1.25 + vWorldPos.y * 0.13) * 0.5 + 0.5
    );
    colour += vec3(0.22, 0.07, 0.24) * coralRole * tideWave * 0.16;

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
