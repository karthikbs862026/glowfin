import * as THREE from "three";
import {
  RELIC_ATLAS_IDS,
  type RelicAtlasEntryState,
  type RelicAtlasId,
  type RelicAtlasState,
  type RestorationDistrictId,
} from "../meta/relicAtlas";

export interface LivingAtlasHotspot {
  xPercent: number;
  yPercent: number;
}

export interface LivingAtlasTextureSet {
  moonstone?: THREE.Texture;
  kelp?: THREE.Texture;
  crystal?: THREE.Texture;
  fossil?: THREE.Texture;
}

interface AtlasNodeVisual {
  id: RelicAtlasId;
  districtId: RestorationDistrictId;
  group: THREE.Group;
  core: THREE.Mesh;
  accents: THREE.Object3D[];
  halo: THREE.Mesh;
  basePosition: THREE.Vector3;
  phase: number;
  state: RelicAtlasEntryState;
}

interface DistrictVisual {
  id: RestorationDistrictId;
  group: THREE.Group;
  basePosition: THREE.Vector3;
  material: THREE.MeshStandardMaterial;
  restored: boolean;
  phase: number;
}

const NODE_LAYOUT: Record<
  RelicAtlasId,
  readonly [number, number, number, RestorationDistrictId]
> = {
  "moonseed-fragment": [-1.28, 3.08, 0.72, "moon-well"],
  "manta-lullaby-shell": [1.18, 1.63, 0.74, "kelp-conservatory"],
  "cathedral-hymn-page": [-0.92, 1.07, 0.7, "kelp-conservatory"],
  "prism-current-key": [1.08, -0.03, 0.72, "prism-observatory"],
  "mirror-current-crest": [-1.02, -0.58, 0.7, "prism-observatory"],
  "auralis-mooncrest": [0.78, -2.05, 0.76, "guardian-sanctum"],
};

const DISTRICT_POSITIONS: Record<
  RestorationDistrictId,
  readonly [number, number, number]
> = {
  "moon-well": [-0.48, 2.91, -1.1],
  "kelp-conservatory": [0.08, 1.25, -1.2],
  "prism-observatory": [-0.06, -0.33, -1.18],
  "guardian-sanctum": [0.08, -1.95, -1.25],
};

function extrudedShape(
  points: readonly (readonly [number, number])[],
  depth = 0.16,
): THREE.ExtrudeGeometry {
  const shape = new THREE.Shape();
  const [first, ...rest] = points;
  if (!first) throw new Error("A relic silhouette needs at least one point.");
  shape.moveTo(first[0], first[1]);
  for (const point of rest) shape.lineTo(point[0], point[1]);
  shape.closePath();
  const geometry = new THREE.ExtrudeGeometry(shape, {
    depth,
    steps: 1,
    curveSegments: 4,
    bevelEnabled: true,
    bevelSegments: 2,
    bevelSize: Math.min(0.035, depth * 0.22),
    bevelThickness: Math.min(0.035, depth * 0.22),
  });
  geometry.translate(0, 0, -depth * 0.5);
  return geometry;
}

function relicGeometry(id: RelicAtlasId): THREE.BufferGeometry {
  switch (id) {
    case "moonseed-fragment": {
      const seed = new THREE.Shape();
      seed.moveTo(0, 0.58);
      seed.bezierCurveTo(-0.42, 0.28, -0.47, -0.19, 0, -0.58);
      seed.bezierCurveTo(0.47, -0.19, 0.42, 0.28, 0, 0.58);
      const geometry = new THREE.ExtrudeGeometry(seed, {
        depth: 0.22,
        steps: 1,
        curveSegments: 12,
        bevelEnabled: true,
        bevelSegments: 2,
        bevelSize: 0.045,
        bevelThickness: 0.045,
      });
      geometry.translate(0, 0, -0.11);
      return geometry;
    }
    case "manta-lullaby-shell": {
      const shell = new THREE.Shape();
      shell.moveTo(0, 0.45);
      shell.bezierCurveTo(-0.18, 0.36, -0.62, 0.26, -0.7, -0.14);
      shell.bezierCurveTo(-0.38, -0.03, -0.2, -0.16, 0, -0.5);
      shell.bezierCurveTo(0.2, -0.16, 0.38, -0.03, 0.7, -0.14);
      shell.bezierCurveTo(0.62, 0.26, 0.18, 0.36, 0, 0.45);
      const geometry = new THREE.ExtrudeGeometry(shell, {
        depth: 0.18,
        steps: 1,
        curveSegments: 12,
        bevelEnabled: true,
        bevelSegments: 2,
        bevelSize: 0.035,
        bevelThickness: 0.035,
      });
      geometry.translate(0, 0, -0.09);
      return geometry;
    }
    case "cathedral-hymn-page":
      return extrudedShape([
        [-0.44, 0.55],
        [0.4, 0.49],
        [0.46, 0.19],
        [0.39, -0.03],
        [0.45, -0.46],
        [0.18, -0.55],
        [-0.02, -0.49],
        [-0.22, -0.56],
        [-0.46, -0.49],
        [-0.4, -0.12],
        [-0.47, 0.18],
      ], 0.12);
    case "prism-current-key":
      return extrudedShape([
        [0, 0.63],
        [0.34, 0.31],
        [0.19, 0.08],
        [0.12, -0.28],
        [0.34, -0.32],
        [0.34, -0.5],
        [0.09, -0.48],
        [0.03, -0.66],
        [-0.16, -0.62],
        [-0.11, -0.28],
        [-0.18, 0.08],
        [-0.34, 0.31],
      ], 0.18);
    case "mirror-current-crest": {
      const crest = new THREE.Shape();
      crest.moveTo(0, 0.58);
      crest.bezierCurveTo(-0.25, 0.45, -0.57, 0.41, -0.62, 0.04);
      crest.bezierCurveTo(-0.57, -0.37, -0.25, -0.53, 0, -0.66);
      crest.bezierCurveTo(0.25, -0.53, 0.57, -0.37, 0.62, 0.04);
      crest.bezierCurveTo(0.57, 0.41, 0.25, 0.45, 0, 0.58);
      const geometry = new THREE.ExtrudeGeometry(crest, {
        depth: 0.16,
        steps: 1,
        curveSegments: 10,
        bevelEnabled: true,
        bevelSegments: 2,
        bevelSize: 0.035,
        bevelThickness: 0.035,
      });
      geometry.translate(0, 0, -0.08);
      return geometry;
    }
    case "auralis-mooncrest": {
      const crescent = new THREE.Shape();
      crescent.absarc(0, 0, 0.58, 0, Math.PI * 2, false);
      const cutout = new THREE.Path();
      cutout.absarc(0.24, 0.13, 0.48, 0, Math.PI * 2, true);
      crescent.holes.push(cutout);
      const geometry = new THREE.ExtrudeGeometry(crescent, {
        depth: 0.18,
        steps: 1,
        curveSegments: 24,
        bevelEnabled: true,
        bevelSegments: 2,
        bevelSize: 0.032,
        bevelThickness: 0.032,
      });
      geometry.translate(0, 0, -0.09);
      return geometry;
    }
  }
}

function addMesh(
  group: THREE.Group,
  geometry: THREE.BufferGeometry,
  material: THREE.Material,
  position: readonly [number, number, number],
  rotation: readonly [number, number, number] = [0, 0, 0],
  scale: readonly [number, number, number] = [1, 1, 1],
): THREE.Mesh {
  const mesh = new THREE.Mesh(geometry, material);
  mesh.position.set(...position);
  mesh.rotation.set(...rotation);
  mesh.scale.set(...scale);
  group.add(mesh);
  return mesh;
}

interface InstanceTransform {
  position: readonly [number, number, number];
  rotation?: readonly [number, number, number];
  scale?: readonly [number, number, number];
}

function addInstances(
  group: THREE.Group,
  geometry: THREE.BufferGeometry,
  material: THREE.Material,
  transforms: readonly InstanceTransform[],
): THREE.InstancedMesh {
  const mesh = new THREE.InstancedMesh(geometry, material, transforms.length);
  const matrix = new THREE.Matrix4();
  const quaternion = new THREE.Quaternion();
  const position = new THREE.Vector3();
  const scale = new THREE.Vector3();
  for (const [index, transform] of transforms.entries()) {
    position.set(...transform.position);
    quaternion.setFromEuler(new THREE.Euler(...(transform.rotation ?? [0, 0, 0])));
    scale.set(...(transform.scale ?? [1, 1, 1]));
    matrix.compose(position, quaternion, scale);
    mesh.setMatrixAt(index, matrix);
  }
  mesh.instanceMatrix.needsUpdate = true;
  group.add(mesh);
  return mesh;
}

/**
 * Presentation-only 3D atlas rendered by Glowfin's existing WebGL renderer.
 * The diorama never owns a second renderer or mutates simulation, collision,
 * rewards, progression, or save truth.
 */
export class LivingAtlasField {
  readonly scene = new THREE.Scene();
  readonly camera = new THREE.PerspectiveCamera(44, 1, 0.1, 40);

  private readonly root = new THREE.Group();
  private readonly nodes = new Map<RelicAtlasId, AtlasNodeVisual>();
  private readonly districts = new Map<RestorationDistrictId, DistrictVisual>();
  private readonly stateMaterials: Record<RelicAtlasEntryState, THREE.MeshStandardMaterial> = {
    recovered: new THREE.MeshStandardMaterial({
      color: 0xffd785,
      emissive: 0xe3a145,
      emissiveIntensity: 1.72,
      metalness: 0.52,
      roughness: 0.2,
    }),
    available: new THREE.MeshStandardMaterial({
      color: 0x8ffff4,
      emissive: 0x16bfc4,
      emissiveIntensity: 2.08,
      metalness: 0.28,
      roughness: 0.2,
    }),
    locked: new THREE.MeshStandardMaterial({
      color: 0x16233c,
      emissive: 0x071126,
      emissiveIntensity: 0.18,
      metalness: 0.12,
      roughness: 0.78,
      transparent: true,
      opacity: 0.9,
    }),
  };
  private readonly haloMaterial = new THREE.MeshBasicMaterial({
    color: 0xb5ffff,
    transparent: true,
    opacity: 0.56,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    toneMapped: false,
  });
  private readonly accentMaterial = new THREE.MeshStandardMaterial({
    color: 0xdca562,
    emissive: 0x8b5d30,
    emissiveIntensity: 0.72,
    metalness: 0.58,
    roughness: 0.3,
  });
  private readonly moonMaterial = new THREE.MeshStandardMaterial({
    color: 0x7fa9a8,
    emissive: 0x174f60,
    emissiveIntensity: 0.68,
    metalness: 0.14,
    roughness: 0.58,
  });
  private readonly kelpMaterial = new THREE.MeshStandardMaterial({
    color: 0x2b806b,
    emissive: 0x0e524b,
    emissiveIntensity: 0.74,
    metalness: 0.04,
    roughness: 0.7,
  });
  private readonly crystalMaterial = new THREE.MeshStandardMaterial({
    color: 0x6ca5d9,
    emissive: 0x354bc5,
    emissiveIntensity: 1.08,
    metalness: 0.26,
    roughness: 0.18,
    transparent: true,
    opacity: 0.92,
  });
  private readonly fossilMaterial = new THREE.MeshStandardMaterial({
    color: 0xbcae94,
    emissive: 0x3c7775,
    emissiveIntensity: 0.6,
    metalness: 0.06,
    roughness: 0.7,
  });
  private readonly currentMaterial = new THREE.MeshBasicMaterial({
    color: 0x5cf2ef,
    transparent: true,
    opacity: 0.25,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    toneMapped: false,
  });
  private readonly particleMaterial = new THREE.PointsMaterial({
    color: 0xdffeff,
    size: 0.065,
    sizeAttenuation: true,
    transparent: true,
    opacity: 0.78,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    toneMapped: false,
  });
  private readonly backdropMaterial = new THREE.ShaderMaterial({
    uniforms: {
      uTime: { value: 0 },
      uRestoration: { value: 0 },
    },
    vertexShader: `
      varying vec2 vUv;
      void main() {
        vUv = uv;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: `
      precision mediump float;
      uniform float uTime;
      uniform float uRestoration;
      varying vec2 vUv;
      float hash(vec2 p) {
        return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453);
      }
      void main() {
        vec2 p = vUv - vec2(0.5);
        float depth = smoothstep(0.0, 1.0, 1.0 - vUv.y);
        float causticA = pow(max(0.0, sin((p.x * 13.0 + p.y * 19.0) - uTime * 0.42)), 18.0);
        float causticB = pow(max(0.0, sin((p.x * -17.0 + p.y * 12.0) + uTime * 0.31)), 22.0);
        float haze = smoothstep(0.72, 0.04, length(p * vec2(0.74, 1.0)));
        float silt = step(0.986, hash(floor(vUv * vec2(92.0, 148.0))));
        vec3 abyss = vec3(0.004, 0.015, 0.05);
        vec3 upper = vec3(0.018, 0.18, 0.25);
        vec3 royal = vec3(0.12, 0.055, 0.24);
        vec3 colour = mix(upper, abyss, depth);
        colour += royal * haze * (0.13 + uRestoration * 0.22);
        colour += vec3(0.12, 0.58, 0.62) * (causticA + causticB) * 0.045 * (1.0 - depth);
        colour += vec3(0.5, 0.9, 1.0) * silt * 0.22;
        float vignette = smoothstep(0.78, 0.28, length(p));
        gl_FragColor = vec4(colour * (0.46 + vignette * 0.74), 1.0);
      }
    `,
    depthWrite: false,
    depthTest: false,
  });
  private readonly currentCurve: THREE.CatmullRomCurve3;
  private readonly currentMesh: THREE.Mesh;
  private readonly particles: THREE.Points;
  private readonly particlePositions: Float32Array;
  private readonly selection = new THREE.Group();
  private readonly wildlife = new THREE.Group();
  private readonly disposables: Array<{ dispose(): void }> = [];
  private selectedId: RelicAtlasId = "moonseed-fragment";
  private elapsedSec = 0;
  private selectionAgeSec = 0;
  private restorationFraction = 0;

  constructor(
    width = window.innerWidth,
    height = window.innerHeight,
    textures: Readonly<LivingAtlasTextureSet> = {},
  ) {
    this.moonMaterial.map = textures.moonstone ?? null;
    this.kelpMaterial.map = textures.kelp ?? null;
    this.crystalMaterial.map = textures.crystal ?? null;
    this.fossilMaterial.map = textures.fossil ?? null;
    for (const material of [
      this.moonMaterial,
      this.kelpMaterial,
      this.crystalMaterial,
      this.fossilMaterial,
    ]) material.needsUpdate = true;
    this.scene.background = new THREE.Color(0x01040e);
    this.scene.fog = new THREE.Fog(0x020817, 8.5, 19);
    this.camera.position.set(0, 0.46, 11.45);
    this.camera.lookAt(0, 0.4, 0);
    this.resize(width, height);

    const hemisphere = new THREE.HemisphereLight(0xb5fbff, 0x07051c, 1.72);
    const moonKey = new THREE.DirectionalLight(0xb8fbff, 2.15);
    moonKey.position.set(-2.8, 5.4, 6.2);
    const reefBounce = new THREE.PointLight(0x3effd7, 22, 12, 1.7);
    reefBounce.position.set(-2.1, 1.1, 3.2);
    const royalRim = new THREE.PointLight(0xffbd8d, 20, 12, 1.8);
    royalRim.position.set(2.5, -2.6, 3.8);
    this.scene.add(hemisphere, moonKey, reefBounce, royalRim, this.root);

    const backdrop = new THREE.Mesh(
      new THREE.PlaneGeometry(18, 25),
      this.backdropMaterial,
    );
    backdrop.position.set(0, 0.4, -4.8);
    this.scene.add(backdrop);

    this.currentCurve = new THREE.CatmullRomCurve3([
      new THREE.Vector3(-1.45, 3.25, 0.18),
      new THREE.Vector3(-0.15, 2.68, 0.06),
      new THREE.Vector3(1.2, 1.7, 0.16),
      new THREE.Vector3(0.12, 1.28, 0.06),
      new THREE.Vector3(-0.98, 1.05, 0.14),
      new THREE.Vector3(0.1, 0.45, 0.04),
      new THREE.Vector3(1.1, -0.03, 0.14),
      new THREE.Vector3(0, -0.36, 0.04),
      new THREE.Vector3(-1.04, -0.58, 0.14),
      new THREE.Vector3(-0.18, -1.23, 0.04),
      new THREE.Vector3(0.82, -2.05, 0.16),
    ], false, "centripetal");
    const currentGeometry = new THREE.TubeGeometry(
      this.currentCurve,
      128,
      0.032,
      6,
      false,
    );
    this.currentMesh = new THREE.Mesh(currentGeometry, this.currentMaterial);
    this.root.add(this.currentMesh);

    const particleCount = 108;
    this.particlePositions = new Float32Array(particleCount * 3);
    const particleGeometry = new THREE.BufferGeometry();
    particleGeometry.setAttribute(
      "position",
      new THREE.BufferAttribute(this.particlePositions, 3),
    );
    this.particles = new THREE.Points(particleGeometry, this.particleMaterial);
    this.particles.frustumCulled = false;
    this.root.add(this.particles);

    this.createLightShafts();
    this.createDistrictDioramas();
    this.createRelicNodes();
    this.createSelectionFocus();
    this.createWildlife();

    this.disposables.push(
      backdrop.geometry,
      this.backdropMaterial,
      currentGeometry,
      this.currentMaterial,
      particleGeometry,
      this.particleMaterial,
      this.haloMaterial,
      this.accentMaterial,
      this.moonMaterial,
      this.kelpMaterial,
      this.crystalMaterial,
      this.fossilMaterial,
      ...Object.values(this.stateMaterials),
    );
  }

  private createLightShafts(): void {
    const shaftGeometry = new THREE.ConeGeometry(0.44, 4.6, 14, 1, true);
    addInstances(this.root, shaftGeometry, this.currentMaterial, [
      { position: [-1.65, 3.3, -2.7], rotation: [0, 0, -0.18], scale: [0.55, 1.2, 0.7] },
      { position: [1.55, 0.65, -2.6], rotation: [0, 0, 0.2], scale: [0.7, 1.45, 0.8] },
      { position: [-1.25, -2.1, -2.7], rotation: [0, 0, -0.1], scale: [0.48, 1.15, 0.65] },
    ]);
    this.disposables.push(shaftGeometry);
  }

  private createDistrictDioramas(): void {
    this.createMoonGarden();
    this.createKelpCathedral();
    this.createCrystalTrench();
    this.createLeviathanGraveyard();
  }

  private registerDistrict(
    id: RestorationDistrictId,
    material: THREE.MeshStandardMaterial,
    phase: number,
  ): THREE.Group {
    const group = new THREE.Group();
    const basePosition = new THREE.Vector3(...DISTRICT_POSITIONS[id]);
    group.position.copy(basePosition);
    this.root.add(group);
    this.districts.set(id, {
      id,
      group,
      basePosition,
      material,
      restored: false,
      phase,
    });
    return group;
  }

  private createMoonGarden(): void {
    const group = this.registerDistrict("moon-well", this.moonMaterial, 0.1);
    const island = new THREE.CylinderGeometry(1.42, 1.08, 0.38, 12, 1);
    addMesh(group, island, this.moonMaterial, [0, -0.06, -0.22], [Math.PI / 2, 0, 0], [1, 0.72, 1]);
    const terrace = new THREE.TorusGeometry(0.84, 0.1, 8, 38);
    addMesh(group, terrace, this.moonMaterial, [-0.18, 0.07, 0.08], [0.18, 0, 0.05], [1.12, 0.72, 1]);
    const well = new THREE.CylinderGeometry(0.38, 0.5, 0.2, 14);
    addMesh(group, well, this.accentMaterial, [-0.18, -0.02, 0.12], [Math.PI / 2, 0, 0]);

    const columnGeometry = new THREE.CylinderGeometry(0.075, 0.1, 0.92, 7);
    addInstances(group, columnGeometry, this.moonMaterial, [
      { position: [-1.05, 0.26, -0.02], scale: [1, 1.28, 1] },
      { position: [-0.72, 0.47, -0.08], scale: [1, 1.7, 1] },
      { position: [0.58, 0.48, -0.12], scale: [1, 1.68, 1] },
      { position: [0.94, 0.22, -0.04], scale: [1, 1.18, 1] },
    ]);
    const domeGeometry = new THREE.SphereGeometry(0.32, 12, 7, 0, Math.PI * 2, 0, Math.PI * 0.55);
    addInstances(group, domeGeometry, this.moonMaterial, [
      { position: [-0.72, 1.02, -0.08], scale: [1.05, 0.72, 0.82] },
      { position: [0.58, 1.02, -0.12], scale: [1.05, 0.72, 0.82] },
    ]);
    const petalGeometry = new THREE.SphereGeometry(0.12, 8, 6);
    const petals: InstanceTransform[] = [];
    for (let index = 0; index < 7; index += 1) {
      const angle = (index / 7) * Math.PI * 2;
      petals.push({
        position: [
          -0.18 + Math.cos(angle) * 0.43,
          0.08 + Math.sin(angle) * 0.31,
          0.34,
        ],
        rotation: [0, 0, angle],
        scale: [1.5, 0.48, 0.44],
      });
    }
    addInstances(group, petalGeometry, this.accentMaterial, petals);
    this.disposables.push(island, terrace, well, columnGeometry, domeGeometry, petalGeometry);
  }

  private createKelpCathedral(): void {
    const group = this.registerDistrict("kelp-conservatory", this.kelpMaterial, 1.4);
    const island = new THREE.CylinderGeometry(1.58, 1.24, 0.34, 13, 1);
    addMesh(group, island, this.kelpMaterial, [0, -0.08, -0.3], [Math.PI / 2, 0, 0], [1, 0.68, 1]);
    for (const [side, offset] of [[-1, -0.24], [1, 0.24]] as const) {
      const outer = new THREE.CatmullRomCurve3([
        new THREE.Vector3(side * 1.32, -0.35, -0.02),
        new THREE.Vector3(side * 1.1, 0.22, 0.02),
        new THREE.Vector3(side * 0.68, 0.82, 0.02),
        new THREE.Vector3(side * 0.08, 1.12 + offset, 0.05),
      ]);
      const inner = new THREE.CatmullRomCurve3([
        new THREE.Vector3(side * 0.96, -0.44, 0.08),
        new THREE.Vector3(side * 0.78, 0.18, 0.1),
        new THREE.Vector3(side * 0.42, 0.72, 0.12),
        new THREE.Vector3(side * 0.04, 0.98 - offset, 0.14),
      ]);
      const outerGeometry = new THREE.TubeGeometry(outer, 22, 0.09, 6, false);
      const innerGeometry = new THREE.TubeGeometry(inner, 20, 0.055, 5, false);
      addMesh(group, outerGeometry, this.kelpMaterial, [0, 0, 0]);
      addMesh(group, innerGeometry, this.accentMaterial, [0, 0, 0]);
      this.disposables.push(outerGeometry, innerGeometry);
    }
    const bellGeometry = new THREE.SphereGeometry(0.16, 9, 6, 0, Math.PI * 2, 0, Math.PI * 0.66);
    addInstances(group, bellGeometry, this.accentMaterial, [
      { position: [-0.72, 0.48, 0.23], rotation: [Math.PI, 0, 0], scale: [1, 1.25, 0.72] },
      { position: [0.04, 0.85, 0.23], rotation: [Math.PI, 0, 0], scale: [1.08, 1.38, 0.76] },
      { position: [0.74, 0.43, 0.23], rotation: [Math.PI, 0, 0], scale: [0.94, 1.16, 0.7] },
    ]);
    const mantaGeometry = relicGeometry("manta-lullaby-shell");
    addMesh(group, mantaGeometry, this.kelpMaterial, [0.12, 0.13, 0.38], [0.1, -0.06, -0.05], [0.58, 0.58, 0.58]);
    this.disposables.push(island, bellGeometry, mantaGeometry);
  }

  private createCrystalTrench(): void {
    const group = this.registerDistrict("prism-observatory", this.crystalMaterial, 2.8);
    const island = new THREE.CylinderGeometry(1.56, 1.18, 0.4, 12, 1);
    addMesh(group, island, this.crystalMaterial, [0, -0.08, -0.32], [Math.PI / 2, 0, 0], [1.02, 0.64, 1]);
    const spireGeometry = new THREE.ConeGeometry(0.22, 1.38, 5);
    addInstances(group, spireGeometry, this.crystalMaterial, [
      { position: [-1.18, 0.22, -0.02], rotation: [0.03, 0, -0.16], scale: [0.82, 0.82, 0.82] },
      { position: [-0.78, 0.48, -0.12], rotation: [0.04, 0, -0.08], scale: [1, 1.12, 1] },
      { position: [-0.3, 0.34, -0.2], rotation: [0, 0, 0.04], scale: [0.82, 0.92, 0.82] },
      { position: [0.22, 0.58, -0.2], rotation: [0, 0, -0.03], scale: [1.05, 1.24, 1.05] },
      { position: [0.7, 0.36, -0.12], rotation: [0.04, 0, 0.1], scale: [0.86, 0.98, 0.86] },
      { position: [1.13, 0.17, -0.03], rotation: [0.03, 0, 0.18], scale: [0.72, 0.76, 0.72] },
    ]);
    const lensOuter = new THREE.TorusGeometry(0.55, 0.07, 8, 36);
    const lensInner = new THREE.TorusGeometry(0.35, 0.035, 6, 30);
    addMesh(group, lensOuter, this.accentMaterial, [0.08, 0.06, 0.36], [0.2, 0.08, 0]);
    addMesh(group, lensInner, this.crystalMaterial, [0.08, 0.06, 0.4], [0.2, 0.08, 0.48]);
    const pylonGeometry = new THREE.CylinderGeometry(0.08, 0.14, 0.92, 6);
    addInstances(group, pylonGeometry, this.accentMaterial, [
      { position: [-0.58, 0.03, 0.22], rotation: [0, 0, -0.14] },
      { position: [0.72, 0.03, 0.22], rotation: [0, 0, 0.14] },
    ]);
    this.disposables.push(island, spireGeometry, lensOuter, lensInner, pylonGeometry);
  }

  private createLeviathanGraveyard(): void {
    const group = this.registerDistrict("guardian-sanctum", this.fossilMaterial, 4.2);
    const island = new THREE.CylinderGeometry(1.72, 1.28, 0.42, 13, 1);
    addMesh(group, island, this.fossilMaterial, [0, -0.12, -0.34], [Math.PI / 2, 0, 0], [1.04, 0.66, 1]);
    const ribGeometry = new THREE.TorusGeometry(0.84, 0.075, 7, 30, Math.PI * 1.18);
    addInstances(group, ribGeometry, this.fossilMaterial, [
      { position: [-0.85, 0.18, -0.04], rotation: [0.03, 0, -0.42], scale: [0.9, 1.08, 0.9] },
      { position: [-0.44, 0.34, -0.12], rotation: [0.04, 0, -0.22], scale: [1, 1.18, 1] },
      { position: [0, 0.42, -0.16], rotation: [0.04, 0, 0], scale: [1.08, 1.28, 1.08] },
      { position: [0.44, 0.34, -0.12], rotation: [0.04, 0, 0.22], scale: [1, 1.18, 1] },
      { position: [0.85, 0.18, -0.04], rotation: [0.03, 0, 0.42], scale: [0.9, 1.08, 0.9] },
    ]);
    const skull = new THREE.DodecahedronGeometry(0.46, 0);
    addMesh(group, skull, this.fossilMaterial, [-0.72, -0.18, 0.2], [0.12, -0.15, -0.24], [1.25, 0.72, 0.62]);
    const jaw = new THREE.TorusGeometry(0.34, 0.06, 6, 22, Math.PI * 1.08);
    addMesh(group, jaw, this.fossilMaterial, [-0.7, -0.41, 0.3], [0, 0, -0.08], [1.25, 0.72, 1]);
    const sanctum = relicGeometry("auralis-mooncrest");
    addMesh(group, sanctum, this.accentMaterial, [0.7, 0.12, 0.35], [0.08, 0.12, 0.02], [0.9, 0.9, 0.9]);
    this.disposables.push(island, ribGeometry, skull, jaw, sanctum);
  }

  private createRelicNodes(): void {
    for (const [index, id] of RELIC_ATLAS_IDS.entries()) {
      const [x, y, z, districtId] = NODE_LAYOUT[id];
      const group = new THREE.Group();
      const basePosition = new THREE.Vector3(x, y, z);
      group.position.copy(basePosition);
      const coreGeometry = relicGeometry(id);
      const core = new THREE.Mesh(coreGeometry, this.stateMaterials.available);
      core.rotation.set(0.1, index * 0.3, index % 2 === 0 ? -0.08 : 0.08);
      core.scale.setScalar(id === "manta-lullaby-shell" ? 0.66 : 0.72);
      const haloGeometry = new THREE.TorusGeometry(0.51, 0.018, 6, 40);
      const halo = new THREE.Mesh(haloGeometry, this.haloMaterial);
      halo.rotation.set(0.12, 0.04, index * 0.44);
      const accentGeometry = new THREE.SphereGeometry(0.055, 8, 6);
      const accent = new THREE.Mesh(accentGeometry, this.accentMaterial);
      accent.position.set(
        id === "auralis-mooncrest" ? 0.18 : 0,
        id === "moonseed-fragment" ? 0.04 : -0.05,
        0.18,
      );
      group.add(core, halo, accent);
      this.root.add(group);
      this.nodes.set(id, {
        id,
        districtId,
        group,
        core,
        accents: [accent],
        halo,
        basePosition,
        phase: index * 0.87,
        state: "available",
      });
      this.disposables.push(coreGeometry, haloGeometry, accentGeometry);
    }
  }

  private createSelectionFocus(): void {
    const outer = new THREE.Mesh(
      new THREE.TorusGeometry(0.68, 0.028, 6, 46),
      this.haloMaterial,
    );
    const orbit = new THREE.Mesh(
      new THREE.TorusGeometry(0.58, 0.014, 5, 38),
      this.haloMaterial,
    );
    orbit.rotation.set(0.92, 0.18, 0.08);
    const beam = new THREE.Mesh(
      new THREE.ConeGeometry(0.34, 1.7, 14, 1, true),
      this.currentMaterial,
    );
    beam.position.set(0, 0.92, -0.12);
    beam.rotation.z = Math.PI;
    this.selection.add(outer, orbit, beam);
    this.root.add(this.selection);
    this.disposables.push(outer.geometry, orbit.geometry, beam.geometry);
  }

  private createWildlife(): void {
    const fishGeometry = new THREE.ConeGeometry(0.045, 0.18, 3);
    const transforms: InstanceTransform[] = [];
    for (let index = 0; index < 18; index += 1) {
      const school = index < 7 ? 0 : index < 13 ? 1 : 2;
      const local = school === 0 ? index : school === 1 ? index - 7 : index - 13;
      transforms.push({
        position: [
          (school === 0 ? -1.55 : school === 1 ? 1.45 : -1.2) + local * 0.12,
          (school === 0 ? 2.25 : school === 1 ? 0.15 : -1.55) + Math.sin(local * 1.7) * 0.12,
          -0.35 - (local % 3) * 0.08,
        ],
        rotation: [0, 0, school === 1 ? -Math.PI / 2 : Math.PI / 2],
        scale: [0.7 + (local % 2) * 0.18, 1, 1],
      });
    }
    addInstances(this.wildlife, fishGeometry, this.currentMaterial, transforms);
    this.root.add(this.wildlife);
    this.disposables.push(fishGeometry);
  }

  resize(width: number, height: number): void {
    this.camera.aspect = Math.max(0.2, width / Math.max(1, height));
    this.camera.fov = height > width * 1.45 ? 43 : 48;
    this.camera.updateProjectionMatrix();
  }

  setState(state: Readonly<RelicAtlasState>): void {
    this.restorationFraction = state.restorationFraction;
    const restoration = this.backdropMaterial.uniforms["uRestoration"];
    if (restoration) restoration.value = state.restorationFraction;
    for (const entry of state.entries) {
      const node = this.nodes.get(entry.id);
      if (!node) continue;
      node.state = entry.state;
      node.core.material = this.stateMaterials[entry.state];
      node.halo.visible = entry.state !== "locked";
      for (const accent of node.accents) accent.visible = entry.state !== "locked";
    }
    for (const district of state.districts) {
      const visual = this.districts.get(district.id);
      if (!visual) continue;
      visual.restored = district.restored;
      visual.material.emissiveIntensity = district.restored
        ? district.id === "prism-observatory" ? 1.52 : 1.08
        : district.id === "prism-observatory" ? 0.72 : 0.48;
      visual.material.opacity = district.restored ? 1 : 0.78;
      visual.material.transparent = !district.restored || district.id === "prism-observatory";
      visual.material.needsUpdate = true;
    }
    const requested = state.nextRelicId ?? this.selectedId;
    if (this.nodes.has(requested)) this.select(requested);
  }

  select(id: RelicAtlasId): void {
    const node = this.nodes.get(id);
    if (!node) return;
    this.selectedId = id;
    this.selectionAgeSec = 0;
    this.selection.position.copy(node.group.position);
  }

  update(frameSec: number, reducedMotion: boolean): void {
    const delta = Math.max(0, Math.min(frameSec, 0.1));
    this.elapsedSec += delta * (reducedMotion ? 0.08 : 1);
    this.selectionAgeSec += delta;
    const timeUniform = this.backdropMaterial.uniforms["uTime"];
    if (timeUniform) timeUniform.value = this.elapsedSec;

    const motion = reducedMotion ? 0 : 1;
    this.root.rotation.z = Math.sin(this.elapsedSec * 0.18) * 0.006 * motion;
    this.wildlife.position.x = Math.sin(this.elapsedSec * 0.23) * 0.13 * motion;
    this.wildlife.position.y = Math.cos(this.elapsedSec * 0.19) * 0.05 * motion;

    const selectedDistrictId = this.nodes.get(this.selectedId)?.districtId;
    for (const district of this.districts.values()) {
      const selected = selectedDistrictId === district.id;
      district.group.position.copy(district.basePosition);
      district.group.position.y += Math.sin(this.elapsedSec * 0.44 + district.phase) * 0.025 * motion;
      const targetScale = selected ? 1.035 : 1;
      const scale = THREE.MathUtils.lerp(
        district.group.scale.x,
        targetScale,
        1 - Math.exp(-delta * 4),
      );
      district.group.scale.setScalar(scale);
      district.group.rotation.y = Math.sin(this.elapsedSec * 0.2 + district.phase) * 0.018 * motion;
    }

    for (const node of this.nodes.values()) {
      const selected = node.id === this.selectedId;
      const bob = Math.sin(this.elapsedSec * 1.08 + node.phase) * 0.055 * motion;
      node.group.position.copy(node.basePosition);
      node.group.position.y += bob;
      const targetScale = selected ? 1.26 : node.state === "locked" ? 0.9 : 1;
      const scale = THREE.MathUtils.lerp(
        node.group.scale.x,
        targetScale,
        1 - Math.exp(-delta * 10),
      );
      node.group.scale.setScalar(scale);
      node.core.rotation.y += delta * (selected ? 0.72 : 0.18) * (reducedMotion ? 0.12 : 1);
      node.halo.rotation.z -= delta * (selected ? 0.48 : 0.12) * (reducedMotion ? 0.12 : 1);
    }

    const selectedNode = this.nodes.get(this.selectedId);
    if (selectedNode) {
      this.selection.position.lerp(selectedNode.group.position, 1 - Math.exp(-delta * 14));
      this.selection.rotation.z += delta * 0.52 * (reducedMotion ? 0.12 : 1);
      this.selection.rotation.y -= delta * 0.34 * (reducedMotion ? 0.12 : 1);
      const arrival = 1 - Math.exp(-this.selectionAgeSec * 7);
      const pulse = reducedMotion ? 0 : Math.sin(this.elapsedSec * 3.1) * 0.025;
      this.selection.scale.setScalar((0.74 + arrival * 0.26) * (1 + pulse));
    }

    this.currentMaterial.opacity = 0.18 + this.restorationFraction * 0.1 +
      Math.sin(this.elapsedSec * 1.25) * 0.022 * motion;
    const positionAttribute = this.particles.geometry.getAttribute("position");
    const particleCount = this.particlePositions.length / 3;
    for (let index = 0; index < particleCount; index += 1) {
      const t = (index / particleCount + this.elapsedSec * 0.028) % 1;
      const point = this.currentCurve.getPointAt(t);
      const wave = Math.sin(index * 2.17 + this.elapsedSec * 1.5) * 0.09 * motion;
      this.particlePositions[index * 3] = point.x + wave;
      this.particlePositions[index * 3 + 1] = point.y +
        Math.cos(index * 1.71 + this.elapsedSec) * 0.065 * motion;
      this.particlePositions[index * 3 + 2] = point.z + 0.2 + (index % 5) * 0.016;
    }
    positionAttribute.needsUpdate = true;

    const focus = selectedNode?.group.position ?? new THREE.Vector3();
    const targetX = focus.x * 0.035;
    const targetY = 0.46 + focus.y * 0.012;
    this.camera.position.x = THREE.MathUtils.lerp(
      this.camera.position.x,
      targetX,
      1 - Math.exp(-delta * 2.1),
    );
    this.camera.position.y = THREE.MathUtils.lerp(
      this.camera.position.y,
      targetY,
      1 - Math.exp(-delta * 2.1),
    );
    this.camera.lookAt(this.camera.position.x * 0.16, 0.38, 0);
  }

  hotspots(): Readonly<Partial<Record<RelicAtlasId, LivingAtlasHotspot>>> {
    this.scene.updateMatrixWorld(true);
    const projected: Partial<Record<RelicAtlasId, LivingAtlasHotspot>> = {};
    const world = new THREE.Vector3();
    for (const node of this.nodes.values()) {
      node.group.getWorldPosition(world);
      world.project(this.camera);
      projected[node.id] = {
        xPercent: THREE.MathUtils.clamp((world.x + 1) * 50, 8, 92),
        yPercent: THREE.MathUtils.clamp((1 - world.y) * 50, 12, 73),
      };
    }
    return projected;
  }

  budget(): { drawCalls: number; triangles: number; materials: number } {
    let drawCalls = 0;
    let triangles = 0;
    const materials = new Set<string>();
    this.scene.traverse((object) => {
      if (!(object instanceof THREE.Mesh || object instanceof THREE.Points)) return;
      drawCalls += 1;
      const geometry = object.geometry;
      const index = geometry.index;
      const position = geometry.getAttribute("position");
      const geometryTriangles = index
        ? Math.floor(index.count / 3)
        : position ? Math.floor(position.count / 3) : 0;
      triangles += geometryTriangles * (object instanceof THREE.InstancedMesh ? object.count : 1);
      const source = Array.isArray(object.material) ? object.material : [object.material];
      for (const material of source) materials.add(material.uuid);
    });
    return { drawCalls, triangles, materials: materials.size };
  }

  dispose(): void {
    for (const disposable of this.disposables) disposable.dispose();
  }
}
