import * as THREE from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import type { TuningConfig } from "../core/config";
import type { RealmId } from "../realms/definition";
import { realmOpeningsAt } from "../realms/mechanics";
import type { Gate } from "../sim/course";
import { gateWallSegmentsAt } from "../sim/gateGeometry";

const MAX_COLUMNS = 48;
const MAX_HOLDFASTS = 48;
const MAX_DECORATIVE_FRONDS = 144;
const MAX_GATE_FRONDS = 120;
const MAX_CANOPY_ARCHES = 18;
const MAX_OPENING_VINES = 40;
const MAX_BELLS = 36;
const MAX_SEA_DRAGONS = 12;
const MAX_LIGHT_SHAFTS = 18;
const MAX_CURRENT_RIBBONS = 24;
const MAX_LIGHT_POOLS = 48;
const SPORE_COUNT = 320;
const COLUMN_SPACING = 16;

export interface KelpCathedralTextures {
  blade: THREE.Texture;
  stipe: THREE.Texture;
  seabed: THREE.Texture;
}

function hash01(value: number, salt: number): number {
  let hash = Math.imul(value ^ salt, 0x27d4eb2d);
  hash ^= hash >>> 15;
  hash = Math.imul(hash, 0x85ebca6b);
  return ((hash ^ (hash >>> 13)) >>> 0) / 0x1_0000_0000;
}

function triangleCount(geometry: THREE.BufferGeometry): number {
  return geometry.index
    ? geometry.index.count / 3
    : (geometry.getAttribute("position")?.count ?? 0) / 3;
}

function prepareInstanced(
  geometry: THREE.BufferGeometry,
  material: THREE.Material,
  count: number,
  name: string,
  obstacle = false,
): THREE.InstancedMesh {
  const mesh = new THREE.InstancedMesh(geometry, material, count);
  mesh.name = name;
  mesh.count = 0;
  mesh.frustumCulled = false;
  mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  mesh.userData["realm"] = "kelp-cathedral";
  mesh.userData["isObstacle"] = obstacle;
  mesh.userData["nonCollidable"] = !obstacle;
  return mesh;
}

function tintGeometry(
  geometry: THREE.BufferGeometry,
  colour: THREE.ColorRepresentation,
): THREE.BufferGeometry {
  const value = new THREE.Color(colour);
  const count = geometry.getAttribute("position").count;
  const colours = new Float32Array(count * 3);
  for (let index = 0; index < count; index += 1) {
    colours[index * 3] = value.r;
    colours[index * 3 + 1] = value.g;
    colours[index * 3 + 2] = value.b;
  }
  geometry.setAttribute("color", new THREE.BufferAttribute(colours, 3));
  return geometry;
}

function mergeOrThrow(geometries: THREE.BufferGeometry[]): THREE.BufferGeometry {
  const merged = mergeGeometries(geometries, false);
  if (!merged) throw new Error("Kelp Cathedral geometry attributes did not merge.");
  for (const geometry of geometries) geometry.dispose();
  return merged;
}

function createColumnGeometry(): THREE.BufferGeometry {
  const curve = new THREE.CatmullRomCurve3([
    new THREE.Vector3(0, 0, 0),
    new THREE.Vector3(0.16, 3.8, 0.08),
    new THREE.Vector3(-0.18, 7.6, 0.2),
    new THREE.Vector3(0.22, 11.7, -0.12),
    new THREE.Vector3(0.04, 16, 0.16),
  ]);
  return new THREE.TubeGeometry(curve, 23, 0.42, 7, false);
}

function createHoldfastGeometry(): THREE.BufferGeometry {
  const roots: THREE.BufferGeometry[] = [];
  const centre = new THREE.SphereGeometry(0.72, 8, 6);
  centre.scale(1, 0.48, 1);
  centre.translate(0, 0.25, 0);
  roots.push(centre);
  for (let index = 0; index < 7; index += 1) {
    const angle = index / 7 * Math.PI * 2;
    const reach = 1.45 + (index % 3) * 0.28;
    const curve = new THREE.CatmullRomCurve3([
      new THREE.Vector3(0, 0.42, 0),
      new THREE.Vector3(
        Math.cos(angle) * reach * 0.38,
        0.24,
        Math.sin(angle) * reach * 0.38,
      ),
      new THREE.Vector3(
        Math.cos(angle) * reach,
        0.03,
        Math.sin(angle) * reach,
      ),
    ]);
    roots.push(new THREE.TubeGeometry(curve, 8, 0.13, 5, false));
  }
  return mergeOrThrow(roots);
}

function createFrondGeometry(): THREE.BufferGeometry {
  const segments = 10;
  const positions: number[] = [];
  const uvs: number[] = [];
  const indices: number[] = [];
  for (let segment = 0; segment <= segments; segment += 1) {
    const fraction = segment / segments;
    const centre = Math.sin(fraction * Math.PI * 1.35) * 0.22;
    const envelope = Math.sin(Math.pow(fraction, 0.82) * Math.PI);
    const serration = segment % 2 === 0 ? 1 : 0.88;
    const width = (0.13 + envelope * 0.92) * (1 - fraction * 0.2) * serration;
    const y = fraction * 6.5;
    const z = Math.sin(fraction * Math.PI) * 0.62 +
      Math.sin(fraction * Math.PI * 3) * 0.13;
    positions.push(centre - width, y, z, centre + width, y, z);
    uvs.push(0, fraction * 2.2, 1, fraction * 2.2);
    if (segment < segments) {
      const base = segment * 2;
      indices.push(base, base + 1, base + 2, base + 1, base + 3, base + 2);
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute("uv", new THREE.Float32BufferAttribute(uvs, 2));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  return geometry;
}

function createBraidedArchGeometry(): THREE.BufferGeometry {
  const strands: THREE.BufferGeometry[] = [];
  for (let strand = 0; strand < 3; strand += 1) {
    const phase = strand / 3 * Math.PI * 2;
    const points: THREE.Vector3[] = [];
    for (let sample = 0; sample <= 14; sample += 1) {
      const fraction = sample / 14;
      const arch = Math.sin(fraction * Math.PI);
      points.push(new THREE.Vector3(
        -1 + fraction * 2,
        arch * 1.08 + Math.sin(fraction * Math.PI * 6 + phase) * 0.045,
        Math.cos(fraction * Math.PI * 6 + phase) * 0.08,
      ));
    }
    const tube = new THREE.TubeGeometry(
      new THREE.CatmullRomCurve3(points),
      28,
      0.052,
      5,
      false,
    );
    tintGeometry(tube, strand === 1 ? 0xb3cc72 : 0x6d9d4f);
    strands.push(tube);
  }
  return mergeOrThrow(strands);
}

function createOpeningVineGeometry(): THREE.BufferGeometry {
  const pieces: THREE.BufferGeometry[] = [];
  const curve = new THREE.CatmullRomCurve3([
    new THREE.Vector3(0, 0, 0),
    new THREE.Vector3(0.1, 1.4, 0.04),
    new THREE.Vector3(-0.08, 3, 0.12),
    new THREE.Vector3(0.12, 4.6, -0.05),
    new THREE.Vector3(0, 6.1, 0.08),
  ]);
  pieces.push(new THREE.TubeGeometry(curve, 18, 0.11, 6, false));
  for (let index = 1; index <= 4; index += 1) {
    const bead = new THREE.SphereGeometry(0.19, 7, 5);
    const point = curve.getPoint(index / 5);
    bead.translate(point.x, point.y, point.z);
    pieces.push(bead);
  }
  return mergeOrThrow(pieces);
}

function createBellGeometry(): THREE.BufferGeometry {
  const profile = [
    new THREE.Vector2(0.12, 0),
    new THREE.Vector2(0.2, -0.12),
    new THREE.Vector2(0.3, -0.38),
    new THREE.Vector2(0.48, -0.72),
    new THREE.Vector2(0.68, -0.9),
    new THREE.Vector2(0.76, -0.96),
  ];
  const shell = tintGeometry(new THREE.LatheGeometry(profile, 14), 0xffd784);
  const clapper = new THREE.SphereGeometry(0.16, 8, 6);
  clapper.translate(0, -1.14, 0);
  tintGeometry(clapper, 0xfff1bc);
  const cord = new THREE.CylinderGeometry(0.035, 0.035, 0.45, 5);
  cord.translate(0, -0.9, 0);
  tintGeometry(cord, 0xc88b3b);
  return mergeOrThrow([shell, clapper, cord]);
}

function createSeaDragonGeometry(): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = [];
  const bodyCurve = new THREE.CatmullRomCurve3([
    new THREE.Vector3(-1.45, -0.05, 0),
    new THREE.Vector3(-0.9, 0.22, 0.1),
    new THREE.Vector3(-0.3, -0.08, -0.08),
    new THREE.Vector3(0.28, 0.2, 0.09),
    new THREE.Vector3(0.82, 0.02, 0),
    new THREE.Vector3(1.18, 0.14, -0.02),
  ]);
  parts.push(tintGeometry(
    new THREE.TubeGeometry(bodyCurve, 18, 0.12, 6, false),
    0xd4b55d,
  ));
  const head = new THREE.SphereGeometry(0.25, 8, 6);
  head.scale(1.25, 0.85, 0.82);
  head.translate(1.28, 0.16, 0);
  tintGeometry(head, 0xe8c76d);
  parts.push(head);
  const snout = new THREE.ConeGeometry(0.11, 0.38, 6);
  snout.rotateZ(-Math.PI / 2);
  snout.translate(1.58, 0.13, 0);
  tintGeometry(snout, 0xf0d98a);
  parts.push(snout);
  for (let index = 0; index < 4; index += 1) {
    const fin = new THREE.ConeGeometry(0.13 + index * 0.015, 0.38, 5);
    fin.rotateZ(Math.PI);
    fin.translate(-0.45 + index * 0.38, 0.36, 0);
    tintGeometry(fin, index % 2 === 0 ? 0x88b75f : 0xc9a851);
    parts.push(fin);
  }
  const tail = createFrondGeometry();
  tail.scale(0.32, 0.24, 0.34);
  tail.rotateZ(Math.PI / 2);
  tail.translate(-1.42, -0.02, 0);
  tintGeometry(tail, 0x7fab57);
  parts.push(tail);
  return mergeOrThrow(parts);
}

function createMantaGeometry(): THREE.BufferGeometry {
  const shape = new THREE.Shape();
  shape.moveTo(0, 0.48);
  shape.bezierCurveTo(-0.5, 0.62, -1.45, 0.46, -1.85, -0.02);
  shape.bezierCurveTo(-1.38, -0.15, -0.86, -0.72, 0, -0.36);
  shape.bezierCurveTo(0.86, -0.72, 1.38, -0.15, 1.85, -0.02);
  shape.bezierCurveTo(1.45, 0.46, 0.5, 0.62, 0, 0.48);
  const body = tintGeometry(new THREE.ExtrudeGeometry(shape, {
    depth: 0.2,
    bevelEnabled: true,
    bevelSegments: 2,
    bevelSize: 0.06,
    bevelThickness: 0.06,
    curveSegments: 8,
  }), 0xc5f3dd);
  const tailCurve = new THREE.CatmullRomCurve3([
    new THREE.Vector3(0, -0.28, 0.1),
    new THREE.Vector3(0.08, -0.9, 0.1),
    new THREE.Vector3(-0.05, -1.5, 0.1),
    new THREE.Vector3(0.03, -2.05, 0.1),
  ]);
  const indexedTail = new THREE.TubeGeometry(tailCurve, 12, 0.045, 5, false);
  const tail = tintGeometry(indexedTail.toNonIndexed(), 0x86d4bd);
  indexedTail.dispose();
  const merged = mergeOrThrow([body, tail]);
  merged.center();
  return merged;
}

const SPORE_VERTEX = /* glsl */ `
  attribute float aPhase;
  varying float vPulse;
  uniform float uTime;
  void main() {
    vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
    vPulse = 0.68 + 0.32 * sin(uTime * 1.4 + aPhase * 6.2831853);
    gl_PointSize = clamp((46.0 * vPulse) / max(3.0, -mvPosition.z), 1.6, 6.5);
    gl_Position = projectionMatrix * mvPosition;
  }
`;

const SPORE_FRAGMENT = /* glsl */ `
  precision mediump float;
  varying float vPulse;
  void main() {
    float distanceFromCentre = length(gl_PointCoord - vec2(0.5));
    float alpha = smoothstep(0.5, 0.12, distanceFromCentre) * vPulse;
    if (alpha < 0.025) discard;
    vec3 colour = mix(vec3(0.45, 1.0, 0.72), vec3(1.0, 0.82, 0.38), vPulse * 0.28);
    gl_FragColor = vec4(colour, alpha * 0.88);
  }
`;

/**
 * Living Kelp Cathedral presentation.
 *
 * Every landmark is a readable biological form: fibrous curved stipes and
 * holdfasts, three-strand canopy braids, broad collision-aligned fronds,
 * scalloped shell bells, recognisable sea dragons and a persistent manta
 * rescue beacon. The realm never reuses Moon Garden masonry or floor art.
 */
export class KelpCathedralField {
  readonly group = new THREE.Group();

  private readonly columnGeometry = createColumnGeometry();
  private readonly holdfastGeometry = createHoldfastGeometry();
  private readonly frondGeometry = createFrondGeometry();
  private readonly archGeometry = createBraidedArchGeometry();
  private readonly openingVineGeometry = createOpeningVineGeometry();
  private readonly bellGeometry = createBellGeometry();
  private readonly dragonGeometry = createSeaDragonGeometry();
  private readonly shaftGeometry = new THREE.ConeGeometry(1.45, 18, 10, 1, true);
  private readonly currentGeometry = new THREE.PlaneGeometry(1, 1, 1, 1);
  private readonly lightPoolGeometry = new THREE.CircleGeometry(1, 18);
  private readonly mantaGeometry = createMantaGeometry();
  private readonly mantaHaloGeometry = new THREE.SphereGeometry(1, 12, 8);
  private readonly sporeGeometry = new THREE.BufferGeometry();
  private readonly seabedGeometry = new THREE.PlaneGeometry(72, 4000);

  private readonly stipeMaterial: THREE.MeshStandardMaterial;
  private readonly frondMaterial: THREE.MeshStandardMaterial;
  private readonly shellMaterial = new THREE.MeshStandardMaterial({
    color: 0xffedbd,
    emissive: 0x5b3510,
    emissiveIntensity: 0.7,
    roughness: 0.38,
    metalness: 0.04,
    vertexColors: true,
  });
  private readonly edgeMaterial = new THREE.MeshBasicMaterial({
    color: 0xe2fff3,
    transparent: true,
    opacity: 0.92,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    toneMapped: false,
    vertexColors: true,
  });
  private readonly currentMaterial = new THREE.MeshBasicMaterial({
    color: 0xe1fff5,
    transparent: true,
    opacity: 0.15,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    side: THREE.DoubleSide,
    toneMapped: false,
    vertexColors: true,
  });
  private readonly mantaMaterial = new THREE.MeshStandardMaterial({
    color: 0xb9f2df,
    emissive: 0x286f65,
    emissiveIntensity: 0.82,
    roughness: 0.36,
    metalness: 0,
    side: THREE.DoubleSide,
    vertexColors: true,
  });
  private readonly sporeMaterial = new THREE.ShaderMaterial({
    uniforms: { uTime: { value: 0 } },
    vertexShader: SPORE_VERTEX,
    fragmentShader: SPORE_FRAGMENT,
    transparent: true,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    toneMapped: false,
  });
  private readonly seabedMaterial: THREE.MeshStandardMaterial;

  private readonly seabed: THREE.Mesh;
  private readonly columns: THREE.InstancedMesh;
  private readonly holdfasts: THREE.InstancedMesh;
  private readonly decorativeFronds: THREE.InstancedMesh;
  private readonly gateFronds: THREE.InstancedMesh;
  private readonly canopyArches: THREE.InstancedMesh;
  private readonly openingVines: THREE.InstancedMesh;
  private readonly bells: THREE.InstancedMesh;
  private readonly dragons: THREE.InstancedMesh;
  private readonly lightShafts: THREE.InstancedMesh;
  private readonly currentRibbons: THREE.InstancedMesh;
  private readonly lightPools: THREE.InstancedMesh;
  private readonly manta: THREE.Mesh;
  private readonly mantaHalo: THREE.Mesh;
  private readonly spores: THREE.Points;
  private readonly sporePositions = new Float32Array(SPORE_COUNT * 3);
  private readonly sporePhases = new Float32Array(SPORE_COUNT);

  private readonly matrix = new THREE.Matrix4();
  private readonly position = new THREE.Vector3();
  private readonly quaternion = new THREE.Quaternion();
  private readonly scale = new THREE.Vector3();
  private readonly colour = new THREE.Color();

  constructor(
    private readonly cfg: TuningConfig,
    textures: Readonly<KelpCathedralTextures>,
  ) {
    this.shaftGeometry.translate(0, 8, 0);
    this.currentGeometry.rotateX(-Math.PI / 2);
    this.lightPoolGeometry.rotateX(-Math.PI / 2);
    this.seabedGeometry.rotateX(-Math.PI / 2);

    this.stipeMaterial = new THREE.MeshStandardMaterial({
      color: 0xbcd5ae,
      map: textures.stipe,
      emissive: 0x123923,
      emissiveIntensity: 0.46,
      roughness: 0.74,
      metalness: 0,
      vertexColors: true,
    });
    this.frondMaterial = new THREE.MeshStandardMaterial({
      color: 0xcfe4a5,
      map: textures.blade,
      emissive: 0x153b1e,
      emissiveIntensity: 0.42,
      roughness: 0.6,
      metalness: 0,
      side: THREE.DoubleSide,
      transparent: true,
      opacity: 0.94,
      vertexColors: true,
    });
    this.seabedMaterial = new THREE.MeshStandardMaterial({
      color: 0x87906b,
      map: textures.seabed,
      roughness: 0.98,
      metalness: 0,
    });
    this.seabed = new THREE.Mesh(this.seabedGeometry, this.seabedMaterial);
    this.seabed.name = "kelp-cathedral-natural-seabed";
    this.seabed.position.set(0, -1.035, -1980);
    this.seabed.userData["nonCollidable"] = true;
    this.seabed.userData["realm"] = "kelp-cathedral";

    this.columns = prepareInstanced(
      this.columnGeometry,
      this.stipeMaterial,
      MAX_COLUMNS,
      "kelp-cathedral-curved-stipe-columns",
    );
    this.holdfasts = prepareInstanced(
      this.holdfastGeometry,
      this.stipeMaterial,
      MAX_HOLDFASTS,
      "kelp-cathedral-rooted-holdfasts",
    );
    this.decorativeFronds = prepareInstanced(
      this.frondGeometry,
      this.frondMaterial,
      MAX_DECORATIVE_FRONDS,
      "kelp-cathedral-canopy-fronds",
    );
    this.gateFronds = prepareInstanced(
      this.frondGeometry,
      this.frondMaterial,
      MAX_GATE_FRONDS,
      "kelp-cathedral-collision-frond-curtains",
      true,
    );
    this.canopyArches = prepareInstanced(
      this.archGeometry,
      this.frondMaterial,
      MAX_CANOPY_ARCHES,
      "kelp-cathedral-three-strand-braided-canopy",
    );
    this.openingVines = prepareInstanced(
      this.openingVineGeometry,
      this.edgeMaterial,
      MAX_OPENING_VINES,
      "kelp-cathedral-luminous-opening-vines",
      true,
    );
    this.bells = prepareInstanced(
      this.bellGeometry,
      this.shellMaterial,
      MAX_BELLS,
      "kelp-cathedral-scalloped-shell-bells",
    );
    this.dragons = prepareInstanced(
      this.dragonGeometry,
      this.frondMaterial,
      MAX_SEA_DRAGONS,
      "kelp-cathedral-recognisable-sea-dragons",
    );
    this.lightShafts = prepareInstanced(
      this.shaftGeometry,
      this.currentMaterial,
      MAX_LIGHT_SHAFTS,
      "kelp-cathedral-filtered-light-shafts",
    );
    this.currentRibbons = prepareInstanced(
      this.currentGeometry,
      this.currentMaterial,
      MAX_CURRENT_RIBBONS,
      "kelp-cathedral-reversing-current-ribbons",
    );
    this.lightPools = prepareInstanced(
      this.lightPoolGeometry,
      this.currentMaterial,
      MAX_LIGHT_POOLS,
      "kelp-cathedral-natural-light-pools",
    );

    this.manta = new THREE.Mesh(this.mantaGeometry, this.mantaMaterial);
    this.manta.name = "kelp-cathedral-baby-manta-rescue-target";
    this.manta.renderOrder = 4;
    this.manta.userData["nonCollidable"] = true;
    this.manta.userData["realm"] = "kelp-cathedral";
    this.mantaHalo = new THREE.Mesh(this.mantaHaloGeometry, this.currentMaterial);
    this.mantaHalo.name = "kelp-cathedral-manta-light-beacon";
    this.mantaHalo.userData["nonCollidable"] = true;
    this.mantaHalo.userData["realm"] = "kelp-cathedral";

    for (let index = 0; index < SPORE_COUNT; index += 1) {
      this.sporePhases[index] = hash01(index, 1171);
    }
    this.sporeGeometry.setAttribute(
      "position",
      new THREE.BufferAttribute(this.sporePositions, 3),
    );
    this.sporeGeometry.setAttribute(
      "aPhase",
      new THREE.BufferAttribute(this.sporePhases, 1),
    );
    this.spores = new THREE.Points(this.sporeGeometry, this.sporeMaterial);
    this.spores.name = "kelp-cathedral-readable-luminous-spores";
    this.spores.frustumCulled = false;
    this.spores.userData["nonCollidable"] = true;
    this.spores.userData["realm"] = "kelp-cathedral";

    this.group.name = "kelp-cathedral-realistic-living-nave";
    this.group.visible = false;
    this.group.add(
      this.seabed,
      this.columns,
      this.holdfasts,
      this.decorativeFronds,
      this.gateFronds,
      this.canopyArches,
      this.openingVines,
      this.bells,
      this.dragons,
      this.lightShafts,
      this.currentRibbons,
      this.lightPools,
      this.mantaHalo,
      this.manta,
      this.spores,
    );
  }

  private setInstance(
    mesh: THREE.InstancedMesh,
    index: number,
    colour: THREE.ColorRepresentation,
  ): void {
    this.matrix.compose(this.position, this.quaternion, this.scale);
    mesh.setMatrixAt(index, this.matrix);
    mesh.setColorAt(index, this.colour.set(colour));
  }

  private finishInstances(mesh: THREE.InstancedMesh, count: number): void {
    mesh.count = count;
    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
  }

  update(
    realmId: RealmId,
    forwardDistance: number,
    elapsedSec: number,
    gates: readonly Gate[],
    rescuedManta: boolean,
  ): void {
    const active = realmId === "kelp-cathedral";
    this.group.visible = active;
    if (!active) return;

    const firstBand = Math.floor((forwardDistance - 24) / COLUMN_SPACING);
    let columnCount = 0;
    let holdfastCount = 0;
    let decorativeFrondCount = 0;
    let archCount = 0;
    let bellCount = 0;
    let dragonCount = 0;
    let shaftCount = 0;
    let poolCount = 0;

    for (let index = 0; index < MAX_COLUMNS / 2; index += 1) {
      const band = firstBand + index;
      const z = -band * COLUMN_SPACING;
      for (const side of [-1, 1] as const) {
        if (columnCount >= MAX_COLUMNS) break;
        const salt = side < 0 ? 137 : 281;
        const lateral = side * (
          this.cfg.lane.halfWidth + 2.7 + hash01(band, salt) * 4.7
        );
        const heightScale = 0.82 + hash01(band, salt + 43) * 0.48;
        const widthScale = 0.78 + hash01(band, salt + 97) * 0.35;
        const sway = Math.sin(elapsedSec * 0.32 + band * 0.47 + side) * 0.055;

        this.position.set(lateral, -1.02, z);
        this.quaternion.setFromEuler(new THREE.Euler(0, band * 0.33, sway * side));
        this.scale.set(widthScale, heightScale, widthScale);
        this.setInstance(
          this.columns,
          columnCount,
          side < 0 ? 0x4d8150 : 0x5c9059,
        );
        columnCount += 1;

        if (holdfastCount < MAX_HOLDFASTS) {
          this.position.set(lateral, -1, z);
          this.quaternion.setFromEuler(new THREE.Euler(0, band * 0.71, 0));
          this.scale.setScalar(0.88 + widthScale * 0.22);
          this.setInstance(this.holdfasts, holdfastCount, 0x60724b);
          holdfastCount += 1;
        }

        for (let crown = 0; crown < 3; crown += 1) {
          if (decorativeFrondCount >= MAX_DECORATIVE_FRONDS) break;
          const crownPhase = crown - 1;
          this.position.set(
            lateral - side * (0.18 + crown * 0.2),
            5.3 + heightScale * (1.35 + crown * 1.05),
            z + crownPhase * 0.72,
          );
          this.quaternion.setFromEuler(new THREE.Euler(
            crownPhase * 0.07,
            side * (0.48 + crown * 0.16) + sway * 2,
            -side * (0.82 - crown * 0.08) + sway,
          ));
          this.scale.set(
            1.18 + heightScale * 0.28,
            0.84 + heightScale * 0.18,
            1,
          );
          this.setInstance(
            this.decorativeFronds,
            decorativeFrondCount,
            crown === 1 ? 0x9caf52 : crown === 0 ? 0x658c3f : 0x7ea749,
          );
          decorativeFrondCount += 1;
        }
      }

      if (band % 2 === 0 && archCount < MAX_CANOPY_ARCHES) {
        const archZ = z - 2.4;
        this.position.set(0, 6.8 + hash01(band, 523) * 1.2, archZ);
        this.quaternion.setFromEuler(new THREE.Euler(0.015, 0, (hash01(band, 541) - 0.5) * 0.045));
        this.scale.set(
          this.cfg.lane.halfWidth + 2.5,
          2.6 + hash01(band, 571) * 0.55,
          1.3,
        );
        this.setInstance(this.canopyArches, archCount, band % 4 === 0 ? 0xa5b860 : 0x78954c);
        archCount += 1;

        for (const side of [-1, 1] as const) {
          if (bellCount >= MAX_BELLS) break;
          this.position.set(
            side * (this.cfg.lane.halfWidth + 1.25),
            6.05 + Math.sin(elapsedSec * 0.65 + band + side) * 0.12,
            archZ + 0.25,
          );
          this.quaternion.setFromEuler(new THREE.Euler(0, band * 0.24, side * 0.08));
          this.scale.setScalar(1.25 + hash01(band, 631 + side) * 0.34);
          this.setInstance(this.bells, bellCount, side < 0 ? 0xffd479 : 0xffe6a0);
          bellCount += 1;
        }
      }

      if (band % 4 === 1 && dragonCount < MAX_SEA_DRAGONS) {
        const side = band % 8 === 1 ? -1 : 1;
        this.position.set(
          side * (this.cfg.lane.halfWidth + 1.35),
          2.8 + Math.sin(elapsedSec * 0.72 + band) * 0.72,
          z - 3.1,
        );
        this.quaternion.setFromEuler(new THREE.Euler(
          0,
          side * Math.PI * 0.34,
          Math.sin(elapsedSec * 0.9 + band) * 0.2,
        ));
        this.scale.setScalar(1.72 + hash01(band, 673) * 0.42);
        this.setInstance(this.dragons, dragonCount, band % 3 === 0 ? 0xf1cb70 : 0x9ec35f);
        dragonCount += 1;
      }

      if (band % 3 === 0 && shaftCount < MAX_LIGHT_SHAFTS) {
        this.position.set(
          (hash01(band, 691) - 0.5) * (this.cfg.lane.halfWidth * 1.45),
          -1,
          z - 5,
        );
        this.quaternion.setFromEuler(new THREE.Euler(0, 0, (hash01(band, 719) - 0.5) * 0.1));
        this.scale.set(
          0.82 + hash01(band, 733) * 0.6,
          1,
          0.72 + hash01(band, 751) * 0.45,
        );
        this.setInstance(this.lightShafts, shaftCount, band % 6 === 0 ? 0xffdf8a : 0x75ffd0);
        shaftCount += 1;
      }

      for (let pool = 0; pool < 2 && poolCount < MAX_LIGHT_POOLS; pool += 1) {
        const poolSalt = 761 + pool * 37;
        this.position.set(
          (hash01(band, poolSalt) - 0.5) * (this.cfg.lane.halfWidth * 2.8),
          -0.985,
          z - hash01(band, poolSalt + 11) * COLUMN_SPACING,
        );
        this.quaternion.setFromEuler(new THREE.Euler(0, hash01(band, poolSalt + 19) * Math.PI, 0));
        this.scale.set(
          1.8 + hash01(band, poolSalt + 23) * 2.8,
          1,
          2.4 + hash01(band, poolSalt + 29) * 4.1,
        );
        this.setInstance(this.lightPools, poolCount, pool === 0 ? 0x5bdda3 : 0xe6c96e);
        poolCount += 1;
      }
    }

    let gateFrondCount = 0;
    let openingVineCount = 0;
    let currentCount = 0;
    const near = forwardDistance + 0.75;
    const far = forwardDistance + this.cfg.readability.visibleAheadUnits * 1.55;
    for (const gate of gates) {
      if (gate.distance < near) continue;
      if (gate.distance > far) break;
      const plan = gate.realmPlan;
      if (!plan) continue;
      const walls = gateWallSegmentsAt(gate, this.cfg.lane.halfWidth, elapsedSec);
      const planColour = plan.verb === "manta-rescue"
        ? 0xa9c85d
        : plan.verb === "relic-current"
          ? 0xb49b43
          : plan.verb === "reversing-current-tunnel"
            ? 0x4c9a70
            : 0x6ca84f;

      for (const wall of walls) {
        const leaves = Math.max(1, Math.min(10, Math.ceil(wall.width / 1.05)));
        for (let leaf = 0; leaf < leaves; leaf += 1) {
          if (gateFrondCount >= MAX_GATE_FRONDS) break;
          const fraction = (leaf + 0.5) / leaves;
          const x = wall.left + wall.width * fraction;
          const seed = Math.round(gate.distance * 10) + leaf * 19;
          const sway = Math.sin(elapsedSec * 0.92 + x * 0.63 + gate.distance * 0.025) * 0.1;
          this.position.set(x, -1.02, -gate.distance + (hash01(seed, 811) - 0.5) * 0.52);
          this.quaternion.setFromEuler(new THREE.Euler(
            0,
            sway + (hash01(seed, 821) - 0.5) * 0.18,
            sway * 0.55 + (hash01(seed, 829) - 0.5) * 0.1,
          ));
          this.scale.set(
            0.88 + hash01(seed, 853) * 0.36,
            0.9 + hash01(seed, 877) * 0.25,
            1,
          );
          this.setInstance(this.gateFronds, gateFrondCount, planColour);
          gateFrondCount += 1;
        }
      }

      const openings = realmOpeningsAt(
        plan,
        { left: gate.gapLeft, right: gate.gapRight },
        elapsedSec,
      );
      for (const opening of openings) {
        const openingColour = opening.route === "relic"
          ? 0xffd56f
          : opening.route === "rescue"
            ? 0xd9ff91
            : 0x83ffcf;
        for (const edge of [opening.left, opening.right]) {
          if (openingVineCount >= MAX_OPENING_VINES) break;
          this.position.set(edge, -1.02, -gate.distance + 0.42);
          this.quaternion.setFromEuler(new THREE.Euler(
            0,
            0,
            Math.sin(elapsedSec * 1.15 + edge) * 0.035,
          ));
          this.scale.set(1.04, 1, 1.04);
          this.setInstance(this.openingVines, openingVineCount, openingColour);
          openingVineCount += 1;
        }
      }

      if (plan.verb === "reversing-current-tunnel") {
        const midpoint = (plan.startDistance + plan.endDistance) * 0.5;
        const halves = [
          { start: plan.startDistance, end: midpoint, direction: plan.lateralDriftPerSec },
          { start: midpoint, end: plan.endDistance, direction: -plan.lateralDriftPerSec },
        ];
        for (const half of halves) {
          if (currentCount >= MAX_CURRENT_RIBBONS) break;
          const length = Math.max(0.1, half.end - half.start);
          const centre = (half.start + half.end) * 0.5;
          this.position.set(
            (plan.laneLeft + plan.laneRight) * 0.5,
            -0.972,
            -centre,
          );
          this.quaternion.setFromEuler(new THREE.Euler(0, half.direction < 0 ? -0.08 : 0.08, 0));
          this.scale.set(
            Math.max(1, plan.laneRight - plan.laneLeft),
            1,
            length,
          );
          this.setInstance(
            this.currentRibbons,
            currentCount,
            half.direction < 0 ? 0x62c8ee : 0xf2bf62,
          );
          currentCount += 1;
        }
      }
    }

    this.finishInstances(this.columns, columnCount);
    this.finishInstances(this.holdfasts, holdfastCount);
    this.finishInstances(this.decorativeFronds, decorativeFrondCount);
    this.finishInstances(this.gateFronds, gateFrondCount);
    this.finishInstances(this.canopyArches, archCount);
    this.finishInstances(this.openingVines, openingVineCount);
    this.finishInstances(this.bells, bellCount);
    this.finishInstances(this.dragons, dragonCount);
    this.finishInstances(this.lightShafts, shaftCount);
    this.finishInstances(this.currentRibbons, currentCount);
    this.finishInstances(this.lightPools, poolCount);

    const rescueGate = gates.find((gate) => (
      gate.realmPlan?.verb === "manta-rescue" && gate.distance >= forwardDistance - 18
    ));
    this.manta.visible = Boolean(rescueGate) && !rescuedManta;
    this.mantaHalo.visible = this.manta.visible;
    if (rescueGate && this.manta.visible) {
      const plan = rescueGate.realmPlan;
      const center = plan?.verb === "manta-rescue" ? plan.center : 0;
      const wing = Math.sin(elapsedSec * 2.2);
      const visibleDistance = Math.max(
        forwardDistance + 30,
        Math.min(rescueGate.distance - 2.2, forwardDistance + 68),
      );
      this.manta.position.set(
        center,
        1.75 + Math.sin(elapsedSec * 1.45) * 0.24,
        -visibleDistance,
      );
      this.manta.rotation.set(0.05, wing * 0.035, wing * 0.09);
      this.manta.scale.set(1.55 + wing * 0.08, 1.42 - wing * 0.08, 1.2);
      this.mantaHalo.position.copy(this.manta.position);
      this.mantaHalo.position.z -= 0.42;
      const beaconPulse = 2.6 + (wing + 1) * 0.24;
      this.mantaHalo.scale.set(beaconPulse * 1.4, beaconPulse, 0.28);
    }

    this.sporeMaterial.uniforms["uTime"]!.value = elapsedSec;
    const firstSporeBand = Math.floor((forwardDistance - 10) / 5.5);
    for (let index = 0; index < SPORE_COUNT; index += 1) {
      const band = firstSporeBand + (index % 38);
      const offset = index * 3;
      this.sporePositions[offset] =
        (hash01(index, 1013) - 0.5) * (this.cfg.lane.halfWidth * 3.25);
      this.sporePositions[offset + 1] =
        -0.2 + hash01(index, 1031) * 11.8 +
        Math.sin(elapsedSec * 0.42 + index) * 0.18;
      this.sporePositions[offset + 2] =
        -(band * 5.5 + hash01(index, 1061) * 5.3);
    }
    const positionAttribute = this.sporeGeometry.getAttribute("position");
    positionAttribute.needsUpdate = true;
  }

  additionalDrawCalls(): number {
    return 15;
  }

  additionalMaterials(): number {
    return 8;
  }

  triangleBudget(): number {
    return Math.ceil(
      triangleCount(this.seabedGeometry) +
      triangleCount(this.columnGeometry) * MAX_COLUMNS +
      triangleCount(this.holdfastGeometry) * MAX_HOLDFASTS +
      triangleCount(this.frondGeometry) *
        (MAX_DECORATIVE_FRONDS + MAX_GATE_FRONDS) +
      triangleCount(this.archGeometry) * MAX_CANOPY_ARCHES +
      triangleCount(this.openingVineGeometry) * MAX_OPENING_VINES +
      triangleCount(this.bellGeometry) * MAX_BELLS +
      triangleCount(this.dragonGeometry) * MAX_SEA_DRAGONS +
      triangleCount(this.shaftGeometry) * MAX_LIGHT_SHAFTS +
      triangleCount(this.currentGeometry) * MAX_CURRENT_RIBBONS +
      triangleCount(this.lightPoolGeometry) * MAX_LIGHT_POOLS +
      triangleCount(this.mantaGeometry) +
      triangleCount(this.mantaHaloGeometry),
    );
  }

  dispose(): void {
    for (const geometry of [
      this.seabedGeometry,
      this.columnGeometry,
      this.holdfastGeometry,
      this.frondGeometry,
      this.archGeometry,
      this.openingVineGeometry,
      this.bellGeometry,
      this.dragonGeometry,
      this.shaftGeometry,
      this.currentGeometry,
      this.lightPoolGeometry,
      this.mantaGeometry,
      this.mantaHaloGeometry,
      this.sporeGeometry,
    ]) geometry.dispose();
    for (const material of [
      this.stipeMaterial,
      this.frondMaterial,
      this.shellMaterial,
      this.edgeMaterial,
      this.currentMaterial,
      this.mantaMaterial,
      this.sporeMaterial,
      this.seabedMaterial,
    ]) material.dispose();
  }
}
