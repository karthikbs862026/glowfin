import * as THREE from "three";
import type { RealmId } from "../realms/definition";
import {
  eclipseCourtOpeningAt,
  type EclipseCourtGatePlan,
} from "../realms/mechanics";
import type { Gate } from "../sim/course";
import type { EclipseCourtRunStatus } from "../sim/run";

const SCENERY_BAYS = 18;
const MAX_VISIBLE_GATES = 12;
const MAX_GATE_PARTS = MAX_VISIBLE_GATES * 2;
const CROWN_PETALS = 12;
const MAX_NECTARY_FRONDS = MAX_VISIBLE_GATES * 5;
const WITNESSES = 6;
const MANTA_WINGS = WITNESSES * 2;
const MANTA_LOBES = WITNESSES * 2;
const MANTA_EYES = WITNESSES * 2;
const MANTA_MARKS = WITNESSES * 5;
const MANTA_WAKE_PEARLS = WITNESSES * 6;
const POLLEN_INSTANCES = 224;
const SHELL_TOWERS = SCENERY_BAYS * 2;
const REEF_BOULDERS = 48;
const CORAL_FANS = 54;
const MOON_GRASS = 180;
const SCHOOL_FISH = 96;
const PEARL_LANTERNS = 42;
const CLAM_CANOPIES = 14;
const LIGHT_SHAFTS = 4;
const HALO_ARCHES = 12;
const WEAVE_ATOLLS = 18;
const WEAVE_BEACONS = 24;
const VERDICT_TERRACES = 28;
const VERDICT_BLADES = 20;
const CURRENT_STRANDS = 1;
const CURRENT_POINTS = 48;
const LANE_EDGE = 8.4;

/** Conservative live budgets, including transparent two-sided passes. */
export const ECLIPSE_COURT_DRAW_CALLS = 50 as const;
export const ECLIPSE_COURT_MATERIALS = 11 as const;
export const ECLIPSE_COURT_TRIANGLES = 112_400;

interface SurfaceSample {
  x: number;
  y: number;
  z: number;
  shade: number;
}

interface CourtChamber {
  near: number;
  far: number;
  usableNear: number;
  usableFar: number;
}

const COURT_WALL_CLEARANCE = 5.5;
const MANTA_WALL_CLEARANCE = 2.25;

/** Builds a sealed, softly faceted organic surface instead of a paper plane. */
function closedSurfaceGeometry(
  rows: number,
  columns: number,
  thickness: number,
  sample: (u: number, v: number) => SurfaceSample,
): THREE.BufferGeometry {
  const positions: number[] = [];
  const uvs: number[] = [];
  const colours: number[] = [];
  const indices: number[] = [];
  const stride = columns + 1;
  const layerSize = (rows + 1) * stride;

  for (let layer = 0; layer < 2; layer += 1) {
    const side = layer === 0 ? 1 : -1;
    for (let row = 0; row <= rows; row += 1) {
      const v = row / rows;
      for (let column = 0; column <= columns; column += 1) {
        const u = column / columns;
        const point = sample(u, v);
        positions.push(point.x, point.y, point.z + thickness * side);
        uvs.push(u, v);
        const shade = THREE.MathUtils.clamp(point.shade * (layer === 0 ? 1 : 0.62), 0, 1);
        colours.push(shade, shade, shade);
      }
    }
  }

  for (let row = 0; row < rows; row += 1) {
    for (let column = 0; column < columns; column += 1) {
      const a = row * stride + column;
      const b = a + 1;
      const c = a + stride;
      const d = c + 1;
      indices.push(a, c, b, b, c, d);
      indices.push(
        layerSize + a, layerSize + b, layerSize + c,
        layerSize + b, layerSize + d, layerSize + c,
      );
    }
  }

  const join = (a: number, b: number): void => {
    indices.push(a, b, layerSize + a, b, layerSize + b, layerSize + a);
  };
  for (let column = 0; column < columns; column += 1) {
    join(column, column + 1);
    join(rows * stride + column + 1, rows * stride + column);
  }
  for (let row = 0; row < rows; row += 1) {
    join(row * stride, (row + 1) * stride);
    join((row + 1) * stride + columns, row * stride + columns);
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute("uv", new THREE.Float32BufferAttribute(uvs, 2));
  geometry.setAttribute("color", new THREE.Float32BufferAttribute(colours, 3));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  return geometry;
}

function withWhiteVertexColours<T extends THREE.BufferGeometry>(geometry: T): T {
  if (!geometry.getAttribute("color")) {
    const position = geometry.getAttribute("position");
    const colours = new Float32Array(position.count * 3);
    colours.fill(1);
    geometry.setAttribute("color", new THREE.BufferAttribute(colours, 3));
  }
  return geometry;
}

/**
 * One open lunar rib. Paired and mirrored at the lane edges, these preserve
 * the ceremonial crescent language without ever creating an overhead bar that
 * can swallow the route on a portrait camera.
 */
function lunarRibGeometry(): THREE.BufferGeometry {
  const curve = new THREE.CatmullRomCurve3([
    new THREE.Vector3(0, -1, 0),
    new THREE.Vector3(0.42, -0.72, 0.04),
    new THREE.Vector3(0.78, -0.18, 0.11),
    new THREE.Vector3(0.8, 0.28, 0.13),
    new THREE.Vector3(0.46, 0.76, 0.05),
    new THREE.Vector3(0, 1, 0),
  ]);
  return withWhiteVertexColours(
    new THREE.TubeGeometry(curve, 20, 0.075, 7, false),
  );
}

/** Thick crescent shell. u=0 is the authoritative, perfectly straight opening edge. */
function buttressGeometry(): THREE.BufferGeometry {
  return closedSurfaceGeometry(16, 10, 0.11, (u, v) => {
    const vertical = v * 2 - 1;
    const radialRidge = Math.pow(Math.max(0, Math.sin(u * Math.PI * 5.0)), 2.2);
    const crown = 1 - 0.28 * Math.pow(u, 1.24);
    const scallop = 1 - 0.07 * Math.sin(u * Math.PI * 4.0) * (1 - vertical * vertical);
    const mantleFold = Math.pow(1 - Math.abs(vertical), 1.6);
    return {
      x: u * (1 + 0.035 * Math.sin(v * Math.PI * 6) * u),
      y: vertical * crown * scallop,
      z: Math.sin(u * Math.PI) * (0.34 + mantleFold * 0.2) +
        radialRidge * (0.075 + mantleFold * 0.09) +
        Math.cos(v * Math.PI * 2) * 0.035,
      shade: 0.5 + 0.3 * Math.sin(u * Math.PI) + radialRidge * 0.18 +
        0.08 * Math.cos(v * Math.PI * 6),
    };
  });
}

/** Broad floating manta-wing reef. Its straight inner edge still matches gameplay. */
function weaveGateGeometry(): THREE.BufferGeometry {
  return closedSurfaceGeometry(14, 10, 0.14, (u, v) => {
    const vertical = v * 2 - 1;
    const body = Math.pow(Math.sin(v * Math.PI), 0.58);
    const trailingScallop = 0.84 + Math.sin(v * Math.PI * 5) * 0.07 * u;
    const sweep = u * (0.72 + body * 0.28) * trailingScallop;
    return {
      x: sweep,
      y: vertical * (0.94 - u * 0.36) + Math.sin(u * Math.PI) * vertical * 0.14,
      z: Math.sin(u * Math.PI) * (0.22 + body * 0.28) +
        Math.pow(Math.max(0, Math.cos(v * Math.PI * 4)), 5) * 0.06,
      shade: 0.46 + body * 0.34 + Math.sin(u * Math.PI * 3) * 0.1,
    };
  });
}

/** Stepped shell-crown wall. Its inner cyan edge remains mathematically straight. */
function verdictGateGeometry(): THREE.BufferGeometry {
  return closedSurfaceGeometry(15, 10, 0.17, (u, v) => {
    const vertical = v * 2 - 1;
    const tier = Math.floor(v * 5) / 5;
    const crown = 0.86 + Math.pow(Math.abs(vertical), 1.6) * 0.14;
    const shoulder = 1 - u * (0.12 + tier * 0.08);
    const ridge = Math.pow(Math.max(0, Math.sin(u * Math.PI * 5)), 3);
    return {
      x: u * crown,
      y: vertical * shoulder + Math.sign(vertical || 1) * ridge * 0.055,
      z: Math.sin(u * Math.PI) * 0.24 + ridge * 0.18 + tier * 0.025,
      shade: 0.42 + ridge * 0.34 + tier * 0.22,
    };
  });
}

/** Living tissue occupies the outer shell only; it cannot flatten the route opening. */
function tissueGeometry(): THREE.BufferGeometry {
  const positions: number[] = [];
  const uvs: number[] = [];
  const indices: number[] = [];
  const rows = 14;
  const columns = 7;
  for (let row = 0; row <= rows; row += 1) {
    const v = row / rows;
    const vertical = v * 2 - 1;
    for (let column = 0; column <= columns; column += 1) {
      const t = column / columns;
      const u = 0.1 + t * 0.72;
      const fold = Math.pow(Math.max(0, Math.sin(t * Math.PI * 4)), 2);
      positions.push(
        u,
        vertical * (0.82 - u * 0.34) * (0.97 + Math.sin(v * Math.PI * 3) * 0.03),
        0.27 + Math.sin(t * Math.PI) * (1 - vertical * vertical) * 0.2 + fold * 0.055,
      );
      uvs.push(t, v);
    }
  }
  const stride = columns + 1;
  for (let row = 0; row < rows; row += 1) {
    for (let column = 0; column < columns; column += 1) {
      const a = row * stride + column;
      const b = a + 1;
      const c = a + stride;
      const d = c + 1;
      indices.push(a, c, b, b, c, d);
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute("uv", new THREE.Float32BufferAttribute(uvs, 2));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  return geometry;
}

function petalGeometry(): THREE.BufferGeometry {
  return closedSurfaceGeometry(12, 7, 0.045, (u, v) => {
    const lateral = u * 2 - 1;
    const width = (0.16 + Math.pow(Math.sin(v * Math.PI), 0.72) * 0.84) *
      (0.9 + v * 0.1);
    const fold = Math.pow(Math.abs(lateral), 1.55);
    return {
      x: lateral * width,
      y: v * 2 - 1,
      z: Math.sin(v * Math.PI) * (0.2 - fold * 0.1) + fold * 0.045,
      shade: 0.68 + Math.sin(v * Math.PI) * 0.25 - fold * 0.12,
    };
  });
}

/** A true manta planform: swept triangular wing, camber and sealed thickness. */
function mantaWingGeometry(): THREE.BufferGeometry {
  return closedSurfaceGeometry(9, 8, 0.026, (u, v) => {
    const longitudinal = 0.58 - v * 0.98;
    const outer = 0.34 + Math.pow(Math.sin(v * Math.PI), 0.72) * 0.98;
    const root = 0.1 + Math.sin(v * Math.PI) * 0.05;
    const x = THREE.MathUtils.lerp(root, outer, Math.pow(u, 0.86));
    const tipFlex = Math.pow(u, 1.7);
    return {
      x,
      y: longitudinal - tipFlex * 0.08,
      z: Math.sin(u * Math.PI) * 0.075 + Math.sin(v * Math.PI) * 0.025 - tipFlex * 0.025,
      shade: 0.46 + (1 - u) * 0.3 + Math.sin(v * Math.PI * 3) * 0.08,
    };
  });
}

function thornGeometry(): THREE.TubeGeometry {
  return new THREE.TubeGeometry(new THREE.CatmullRomCurve3([
    new THREE.Vector3(0, -1, 0),
    new THREE.Vector3(0.12, -0.56, 0.08),
    new THREE.Vector3(-0.16, -0.12, -0.04),
    new THREE.Vector3(0.2, 0.38, 0.1),
    new THREE.Vector3(-0.05, 1, 0),
  ]), 10, 0.075, 6, false);
}

function shellTowerGeometry(): THREE.LatheGeometry {
  const geometry = new THREE.LatheGeometry([
    new THREE.Vector2(0.82, -1),
    new THREE.Vector2(1.08, -0.9),
    new THREE.Vector2(0.88, -0.62),
    new THREE.Vector2(0.72, -0.18),
    new THREE.Vector2(0.8, 0.22),
    new THREE.Vector2(0.58, 0.58),
    new THREE.Vector2(0.38, 0.83),
    new THREE.Vector2(0.12, 1),
  ], 16);
  const position = geometry.getAttribute("position") as THREE.BufferAttribute;
  for (let index = 0; index < position.count; index += 1) {
    const x = position.getX(index);
    const y = position.getY(index);
    const z = position.getZ(index);
    const angle = Math.atan2(z, x);
    const flute = 1 + Math.pow(Math.cos(angle * 8), 2) * (0.055 + (y + 1) * 0.025);
    position.setXYZ(index, x * flute, y, z * flute);
  }
  position.needsUpdate = true;
  geometry.computeVertexNormals();
  return geometry;
}

function reefBoulderGeometry(): THREE.IcosahedronGeometry {
  const geometry = new THREE.IcosahedronGeometry(1, 1);
  const position = geometry.getAttribute("position") as THREE.BufferAttribute;
  for (let index = 0; index < position.count; index += 1) {
    const x = position.getX(index);
    const y = position.getY(index);
    const z = position.getZ(index);
    const perturb = 1 + Math.sin(x * 7.1 + z * 4.7 + y * 3.9) * 0.1;
    position.setXYZ(index, x * perturb, y * 0.68 * perturb, z * 1.18 * perturb);
  }
  position.needsUpdate = true;
  geometry.computeVertexNormals();
  return geometry;
}

function coralFanGeometry(): THREE.BufferGeometry {
  return closedSurfaceGeometry(9, 6, 0.018, (u, v) => {
    const lateral = u * 2 - 1;
    const height = Math.pow(v, 0.88);
    const width = (0.08 + Math.sin(height * Math.PI * 0.92) * 0.92) *
      (0.88 + Math.cos(lateral * Math.PI * 3) * 0.06);
    const crownScallop = 1 - Math.pow(v, 5) * (0.08 + Math.cos(u * Math.PI * 5) * 0.055);
    return {
      x: lateral * width,
      y: -1 + height * 2 * crownScallop,
      z: Math.sin(lateral * Math.PI) * 0.1 + Math.sin(v * Math.PI) * 0.16,
      shade: 0.5 + height * 0.28 + Math.pow(Math.cos(lateral * Math.PI * 3), 2) * 0.14,
    };
  });
}

function moonGrassGeometry(): THREE.BufferGeometry {
  return closedSurfaceGeometry(7, 2, 0.012, (u, v) => {
    const lateral = u * 2 - 1;
    const width = Math.sin(v * Math.PI) * 0.88 + 0.08;
    return {
      x: lateral * width,
      y: -1 + v * 2,
      z: Math.sin(v * Math.PI) * 0.16 + lateral * lateral * 0.035,
      shade: 0.46 + v * 0.38,
    };
  });
}

function schoolFishGeometry(): THREE.BufferGeometry {
  const geometry = new THREE.BufferGeometry();
  const positions = new Float32Array([
    0, 0.12, -0.72, -0.26, 0, -0.2, 0, -0.12, -0.72, 0.26, 0, -0.2,
    0, 0.11, 0.38, -0.22, 0, 0.22, 0, -0.11, 0.38, 0.22, 0, 0.22,
    0, 0, 0.58, -0.32, 0.24, 0.84, -0.32, -0.24, 0.84,
    0.32, 0.24, 0.84, 0.32, -0.24, 0.84,
  ]);
  geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
  geometry.setAttribute("uv", new THREE.Float32BufferAttribute([
    0.5, 0, 0.1, 0.24, 0.5, 0, 0.9, 0.24,
    0.5, 0.54, 0.16, 0.5, 0.5, 0.54, 0.84, 0.5,
    0.5, 0.7, 0, 1, 0.16, 0.84, 1, 1, 0.84, 0.84,
  ], 2));
  geometry.setIndex([
    0, 1, 2, 0, 2, 3, 0, 4, 1, 0, 3, 4, 2, 1, 6, 3, 2, 6,
    1, 4, 5, 1, 5, 6, 3, 7, 4, 3, 6, 7, 4, 8, 5, 6, 5, 8, 4, 7, 8, 6, 8, 7,
    8, 9, 10, 8, 10, 9, 8, 12, 11, 8, 11, 12,
  ]);
  geometry.computeVertexNormals();
  return geometry;
}

function openingLipGeometry(): THREE.TubeGeometry {
  return new THREE.TubeGeometry(new THREE.CatmullRomCurve3([
    new THREE.Vector3(0, -1, 0.03),
    new THREE.Vector3(-0.02, -0.55, 0.12),
    new THREE.Vector3(0.035, 0, 0.18),
    new THREE.Vector3(-0.02, 0.55, 0.12),
    new THREE.Vector3(0, 1, 0.03),
  ]), 14, 0.055, 7, false);
}

function sanctuaryFloorGeometry(): THREE.BufferGeometry {
  const columns = 18;
  const rows = 66;
  const positions: number[] = [];
  const uvs: number[] = [];
  const colours: number[] = [];
  const indices: number[] = [];
  for (let row = 0; row <= rows; row += 1) {
    const v = row / rows;
    const z = (0.5 - v) * 340;
    for (let column = 0; column <= columns; column += 1) {
      const u = column / columns;
      const x = (u * 2 - 1) * 15;
      const channel = Math.exp(-x * x * 0.025);
      const reef = Math.sin(x * 0.58 + z * 0.052) * 0.18 +
        Math.sin(x * 1.37 - z * 0.029) * 0.09;
      const y = -1.32 + reef * (1 - channel * 0.55) + Math.abs(x) * 0.035;
      positions.push(x, y, z);
      uvs.push(u * 5, v * 18);
      const shade = 0.48 + channel * 0.2 + Math.sin(z * 0.08) * 0.06;
      colours.push(shade * 0.74, shade * 0.92, shade);
    }
  }
  const stride = columns + 1;
  for (let row = 0; row < rows; row += 1) {
    for (let column = 0; column < columns; column += 1) {
      const a = row * stride + column;
      const b = a + 1;
      const c = a + stride;
      const d = c + 1;
      indices.push(a, c, b, b, c, d);
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute("uv", new THREE.Float32BufferAttribute(uvs, 2));
  geometry.setAttribute("color", new THREE.Float32BufferAttribute(colours, 3));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  return geometry;
}

function currentGeometry(): THREE.BufferGeometry {
  const verticesPerStrand = CURRENT_POINTS * 2;
  const positions = new Float32Array(CURRENT_STRANDS * verticesPerStrand * 3);
  const uvs = new Float32Array(CURRENT_STRANDS * verticesPerStrand * 2);
  const indices: number[] = [];
  for (let strand = 0; strand < CURRENT_STRANDS; strand += 1) {
    const vertexBase = strand * verticesPerStrand;
    for (let index = 0; index < CURRENT_POINTS; index += 1) {
      const v = index / (CURRENT_POINTS - 1);
      const uvBase = (vertexBase + index * 2) * 2;
      uvs.set([0, v, 1, v], uvBase);
      if (index < CURRENT_POINTS - 1) {
        const a = vertexBase + index * 2;
        indices.push(a, a + 2, a + 1, a + 1, a + 2, a + 3);
      }
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
  geometry.setAttribute("uv", new THREE.BufferAttribute(uvs, 2));
  geometry.setIndex(indices);
  return geometry;
}

function regentBodyGeometry(): THREE.LatheGeometry {
  return new THREE.LatheGeometry([
    new THREE.Vector2(0.1, -1.5),
    new THREE.Vector2(0.36, -1.08),
    new THREE.Vector2(0.58, -0.28),
    new THREE.Vector2(0.5, 0.62),
    new THREE.Vector2(0.22, 1.08),
  ], 18);
}

function patternedTexture(kind: "nacre" | "manta" | "silt" | "detail"): THREE.DataTexture {
  const size = 64;
  const data = new Uint8Array(size * size * 4);
  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      const u = x / (size - 1);
      const v = y / (size - 1);
      const noise = 0.5 + 0.5 * Math.sin(x * 12.9898 + y * 78.233 + Math.sin(x * y) * 0.17);
      let r = 0;
      let g = 0;
      let b = 0;
      if (kind === "nacre") {
        const band = 0.5 + 0.5 * Math.sin(v * 82 + Math.sin(u * 13) * 5);
        r = 72 + band * 48 + noise * 18;
        g = 104 + band * 46 + noise * 20;
        b = 112 + band * 52 + noise * 25;
      } else if (kind === "manta") {
        const star = Math.pow(Math.max(0, Math.sin(u * 47 + v * 31) * Math.cos(v * 53 - u * 19)), 10);
        r = 22 + noise * 15 + star * 130;
        g = 56 + noise * 23 + star * 160;
        b = 73 + noise * 32 + star * 175;
      } else if (kind === "silt") {
        const ripple = 0.5 + 0.5 * Math.sin(u * 65 + Math.sin(v * 17) * 4);
        r = 24 + ripple * 18 + noise * 10;
        g = 47 + ripple * 25 + noise * 12;
        b = 58 + ripple * 28 + noise * 14;
      } else {
        const ridges = 0.5 + 0.5 * Math.sin(v * 78 + Math.sin(u * 19) * 7);
        const pores = Math.pow(Math.max(0, Math.sin(u * 93) * Math.cos(v * 87)), 4);
        r = g = b = 90 + ridges * 84 + pores * 48 + noise * 24;
      }
      const offset = (y * size + x) * 4;
      data[offset] = Math.min(255, Math.round(r));
      data[offset + 1] = Math.min(255, Math.round(g));
      data[offset + 2] = Math.min(255, Math.round(b));
      data[offset + 3] = 255;
    }
  }
  const texture = new THREE.DataTexture(data, size, size, THREE.RGBAFormat);
  texture.colorSpace = kind === "detail" ? THREE.NoColorSpace : THREE.SRGBColorSpace;
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.magFilter = THREE.LinearFilter;
  texture.minFilter = THREE.LinearMipmapLinearFilter;
  texture.generateMipmaps = true;
  texture.needsUpdate = true;
  return texture;
}

/**
 * The Eclipse Court is the First Moonseed: a bio-lunar reef sanctuary, not a
 * remapped ruin set. Deterministic openings remain the collision authority;
 * every richer surface grows outward from those exact borders.
 */
export class EclipseCourtField {
  readonly group = new THREE.Group();

  private readonly nacreTexture = patternedTexture("nacre");
  private readonly mantaTexture = patternedTexture("manta");
  private readonly siltTexture = patternedTexture("silt");
  private readonly detailTexture = patternedTexture("detail");

  private readonly buttressGeo = buttressGeometry();
  private readonly weaveGateGeo = weaveGateGeometry();
  private readonly verdictGateGeo = verdictGateGeometry();
  private readonly tissueGeo = tissueGeometry();
  private readonly petalGeo = petalGeometry();
  private readonly mantaWingGeo = mantaWingGeometry();
  private readonly mantaBodyGeo = withWhiteVertexColours(new THREE.SphereGeometry(1, 18, 12));
  private readonly mantaLobeGeo = withWhiteVertexColours(new THREE.CapsuleGeometry(0.075, 0.3, 4, 8));
  private readonly mantaTailGeo = withWhiteVertexColours(new THREE.ConeGeometry(0.035, 1.35, 7, 1, true));
  private readonly eyeGeo = new THREE.SphereGeometry(1, 8, 5);
  private readonly markGeo = new THREE.SphereGeometry(1, 7, 4);
  private readonly thornGeo = thornGeometry();
  private readonly shellTowerGeo = withWhiteVertexColours(shellTowerGeometry());
  private readonly reefBoulderGeo = withWhiteVertexColours(reefBoulderGeometry());
  private readonly coralFanGeo = coralFanGeometry();
  private readonly moonGrassGeo = moonGrassGeometry();
  private readonly schoolFishGeo = withWhiteVertexColours(schoolFishGeometry());
  private readonly floorGeo = sanctuaryFloorGeometry();
  private readonly rimGeo = openingLipGeometry();
  private readonly pearlGeo = new THREE.SphereGeometry(1, 14, 9);
  private readonly cupGeo = new THREE.LatheGeometry([
    new THREE.Vector2(0.12, -0.55),
    new THREE.Vector2(0.34, -0.38),
    new THREE.Vector2(0.5, 0.02),
    new THREE.Vector2(0.68, 0.32),
    new THREE.Vector2(0.55, 0.52),
  ], 14);
  private readonly pollenGeo = new THREE.IcosahedronGeometry(0.075, 0);
  private readonly discGeo = new THREE.SphereGeometry(1, 24, 16);
  private readonly coronaGeo = new THREE.TorusGeometry(1, 0.13, 9, 56);
  private readonly currentGeo = currentGeometry();
  private readonly shaftGeo = new THREE.CylinderGeometry(0.3, 1.4, 1, 14, 1, true);
  private readonly haloArchGeo = lunarRibGeometry();
  private readonly weaveAtollGeo = withWhiteVertexColours(new THREE.DodecahedronGeometry(1, 1));
  private readonly weaveBeaconGeo = withWhiteVertexColours(new THREE.OctahedronGeometry(1, 1));
  private readonly verdictTerraceGeo = withWhiteVertexColours(new THREE.CylinderGeometry(1, 1.34, 0.72, 9, 2));
  private readonly regentBodyGeo = regentBodyGeometry();
  private readonly regentHeadGeo = new THREE.SphereGeometry(1, 18, 12);

  private readonly shellMaterial = new THREE.MeshPhysicalMaterial({
    color: 0xb7cbc4, map: this.nacreTexture, vertexColors: true,
    bumpMap: this.detailTexture, bumpScale: 0.085,
    roughness: 0.48, metalness: 0.08, clearcoat: 0.28,
    clearcoatRoughness: 0.42, iridescence: 0.22, iridescenceIOR: 1.26,
    emissive: 0x102e3a, emissiveIntensity: 0.3, side: THREE.DoubleSide,
  });
  private readonly tissueMaterial = new THREE.MeshPhysicalMaterial({
    color: 0x8db7bc, map: this.nacreTexture, bumpMap: this.detailTexture,
    bumpScale: 0.055, roughness: 0.3, metalness: 0.04,
    clearcoat: 0.4, clearcoatRoughness: 0.34, iridescence: 0.34,
    iridescenceIOR: 1.28, emissive: 0x173d4b, emissiveIntensity: 0.42,
    transparent: true, opacity: 0.72, side: THREE.DoubleSide, forceSinglePass: true,
  });
  private readonly glowMaterial = new THREE.MeshBasicMaterial({
    color: 0xffdc8a, transparent: true, opacity: 0.74,
    blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false,
  });
  private readonly mantaMaterial = new THREE.MeshPhysicalMaterial({
    color: 0x6ca2b2, map: this.mantaTexture, bumpMap: this.detailTexture,
    bumpScale: 0.025, vertexColors: true,
    roughness: 0.43, metalness: 0.06, clearcoat: 0.18,
    clearcoatRoughness: 0.62, iridescence: 0.12, emissive: 0x082a3a,
    emissiveIntensity: 0.42, side: THREE.DoubleSide,
  });
  private readonly mantaDetailMaterial = new THREE.MeshStandardMaterial({
    color: 0x89e9f0, roughness: 0.35, metalness: 0.08,
    emissive: 0x256b78, emissiveIntensity: 0.8,
  });
  private readonly eclipseMaterial = new THREE.MeshPhysicalMaterial({
    color: 0x080914, roughness: 0.2, metalness: 0.68, clearcoat: 0.5,
    emissive: 0x18183b, emissiveIntensity: 0.58,
  });
  private readonly heartMaterial = new THREE.MeshPhysicalMaterial({
    color: 0x34244c, roughness: 0.18, metalness: 0.34, clearcoat: 0.68,
    emissive: 0x6e3ba8, emissiveIntensity: 1.05,
  });
  private readonly regentMaterial = new THREE.MeshPhysicalMaterial({
    color: 0xb9ded8, map: this.nacreTexture, roughness: 0.3, metalness: 0.08,
    iridescence: 0.24, emissive: 0x416d7e, emissiveIntensity: 0.8,
    transparent: true, opacity: 0.76, side: THREE.DoubleSide, forceSinglePass: true,
  });
  private readonly seabedMaterial = new THREE.MeshStandardMaterial({
    color: 0x496e75, map: this.siltTexture, bumpMap: this.detailTexture,
    bumpScale: 0.12, vertexColors: true,
    roughness: 0.94, metalness: 0.02, emissive: 0x071b2b, emissiveIntensity: 0.28,
  });
  private readonly currentMaterial = new THREE.ShaderMaterial({
    uniforms: {
      uColour: { value: new THREE.Color(0xffd884) },
      uSecondary: { value: new THREE.Color(0x83e9ff) },
      uTime: { value: 0 }, uOpacity: { value: 1 }, uMode: { value: 0 },
    },
    vertexShader: `varying vec2 vUv; void main(){vUv=uv;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0);}`,
    fragmentShader: `
      precision mediump float; uniform vec3 uColour; uniform vec3 uSecondary;
      uniform float uTime; uniform float uOpacity; uniform float uMode; varying vec2 vUv;
      void main(){
        float lateral=abs(vUv.x-.5)*2.;
        float body=pow(1.-smoothstep(.12,1.,lateral),1.45);
        float core=1.-smoothstep(.0,.38,lateral);
        float tide=.5+.5*sin(vUv.y*44.-uTime*2.6+sin(vUv.y*9.)*.8);
        float pearls=pow(max(0.,sin(vUv.y*(uMode<.5?72.:uMode<1.5?118.:54.)+uTime*1.35)),18.);
        float stageMask=uMode<.5 ? (.72+.28*sin(vUv.y*18.-uTime)) :
          uMode<1.5 ? (.56+.44*pearls) : smoothstep(.18,.5,abs(sin(vUv.y*22.-uTime*.8)));
        vec3 colour=mix(uSecondary,uColour,.34+tide*.28);
        float alpha=(body*(.06+tide*.04)+core*.11+pearls*core*.17)*stageMask*uOpacity;
        gl_FragColor=vec4(colour*(.62+core*.42+pearls*.2),alpha);
      }`,
    transparent: true, depthWrite: false, side: THREE.DoubleSide,
    blending: THREE.AdditiveBlending, toneMapped: false,
  });
  private readonly volumeMaterial = new THREE.ShaderMaterial({
    uniforms: {
      uColour: { value: new THREE.Color(0x8fdde7) },
      uTime: { value: 0 },
    },
    vertexShader: `varying vec2 vUv; varying vec3 vNormal; void main(){vUv=uv;vNormal=normalize(normalMatrix*normal);gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0);}`,
    fragmentShader: `
      precision mediump float; uniform vec3 uColour; uniform float uTime;
      varying vec2 vUv; varying vec3 vNormal;
      void main(){
        float vertical=sin(vUv.y*3.14159265);
        float around=pow(abs(vNormal.z),1.4);
        float shimmer=.74+.26*sin(vUv.y*19.-uTime*.42+vUv.x*8.);
        float alpha=vertical*around*shimmer*.075;
        gl_FragColor=vec4(uColour*(.7+shimmer*.25),alpha);
      }`,
    transparent: true,
    depthWrite: false,
    side: THREE.DoubleSide,
    blending: THREE.AdditiveBlending,
    toneMapped: false,
  });

  private readonly floor = new THREE.Mesh(this.floorGeo, this.seabedMaterial);
  private readonly gateShells = new THREE.InstancedMesh(this.buttressGeo, this.shellMaterial, MAX_GATE_PARTS);
  private readonly weaveGateShells = new THREE.InstancedMesh(this.weaveGateGeo, this.shellMaterial, MAX_GATE_PARTS);
  private readonly verdictGateShells = new THREE.InstancedMesh(this.verdictGateGeo, this.shellMaterial, MAX_GATE_PARTS);
  private readonly gateTissues = new THREE.InstancedMesh(this.tissueGeo, this.tissueMaterial, MAX_GATE_PARTS);
  private readonly gateRims = new THREE.InstancedMesh(this.rimGeo, this.glowMaterial, MAX_GATE_PARTS);
  private readonly shellTowers = new THREE.InstancedMesh(this.shellTowerGeo, this.shellMaterial, SHELL_TOWERS);
  private readonly reefBoulders = new THREE.InstancedMesh(this.reefBoulderGeo, this.seabedMaterial, REEF_BOULDERS);
  private readonly coralFans = new THREE.InstancedMesh(this.coralFanGeo, this.tissueMaterial, CORAL_FANS);
  private readonly moonGrass = new THREE.InstancedMesh(this.moonGrassGeo, this.tissueMaterial, MOON_GRASS);
  private readonly schoolFish = new THREE.InstancedMesh(this.schoolFishGeo, this.mantaMaterial, SCHOOL_FISH);
  private readonly pearlLanterns = new THREE.InstancedMesh(this.pearlGeo, this.glowMaterial, PEARL_LANTERNS);
  private readonly clamCanopies = new THREE.InstancedMesh(this.petalGeo, this.shellMaterial, CLAM_CANOPIES);
  private readonly crownPetals = new THREE.InstancedMesh(this.petalGeo, this.shellMaterial, CROWN_PETALS);
  private readonly nectaryCups = new THREE.InstancedMesh(this.cupGeo, this.tissueMaterial, MAX_VISIBLE_GATES);
  private readonly nectaryFronds = new THREE.InstancedMesh(this.petalGeo, this.glowMaterial, MAX_NECTARY_FRONDS);
  private readonly mantaBodies = new THREE.InstancedMesh(this.mantaBodyGeo, this.mantaMaterial, WITNESSES);
  private readonly mantaWings = new THREE.InstancedMesh(this.mantaWingGeo, this.mantaMaterial, MANTA_WINGS);
  private readonly mantaLobes = new THREE.InstancedMesh(this.mantaLobeGeo, this.mantaMaterial, MANTA_LOBES);
  private readonly mantaTails = new THREE.InstancedMesh(this.mantaTailGeo, this.mantaMaterial, WITNESSES);
  private readonly mantaEyes = new THREE.InstancedMesh(this.eyeGeo, this.mantaDetailMaterial, MANTA_EYES);
  private readonly mantaMarks = new THREE.InstancedMesh(this.markGeo, this.mantaDetailMaterial, MANTA_MARKS);
  private readonly mantaWakePearls = new THREE.InstancedMesh(this.pollenGeo, this.glowMaterial, MANTA_WAKE_PEARLS);
  private readonly pollen = new THREE.InstancedMesh(this.pollenGeo, this.glowMaterial, POLLEN_INSTANCES);
  private readonly iris = new THREE.InstancedMesh(this.petalGeo, this.tissueMaterial, 5);
  private readonly thorns = new THREE.InstancedMesh(this.thornGeo, this.heartMaterial, 9);
  private readonly current = new THREE.Mesh(this.currentGeo, this.currentMaterial);
  private readonly lightShafts = new THREE.InstancedMesh(this.shaftGeo, this.volumeMaterial, LIGHT_SHAFTS);
  private readonly haloArches = new THREE.InstancedMesh(this.haloArchGeo, this.shellMaterial, HALO_ARCHES);
  private readonly weaveAtolls = new THREE.InstancedMesh(this.weaveAtollGeo, this.seabedMaterial, WEAVE_ATOLLS);
  private readonly weaveBeacons = new THREE.InstancedMesh(this.weaveBeaconGeo, this.glowMaterial, WEAVE_BEACONS);
  private readonly verdictTerraces = new THREE.InstancedMesh(this.verdictTerraceGeo, this.shellMaterial, VERDICT_TERRACES);
  private readonly verdictBlades = new THREE.InstancedMesh(this.petalGeo, this.tissueMaterial, VERDICT_BLADES);

  private readonly eclipse = new THREE.Group();
  private readonly disc = new THREE.Mesh(this.discGeo, this.eclipseMaterial);
  private readonly corona = new THREE.Mesh(this.coronaGeo, this.glowMaterial);
  private readonly heart = new THREE.Mesh(this.pearlGeo, this.heartMaterial);
  private readonly regent = new THREE.Group();
  private readonly regentBody = new THREE.Mesh(this.regentBodyGeo, this.regentMaterial);
  private readonly regentHead = new THREE.Mesh(this.regentHeadGeo, this.regentMaterial);
  private readonly regentVeil = new THREE.Mesh(this.petalGeo, this.regentMaterial);
  private readonly sanctuaryLight = new THREE.PointLight(0xffdf9b, 32, 125, 2);
  private readonly routeLight = new THREE.PointLight(0x88eaff, 14, 54, 2);

  private readonly matrix = new THREE.Matrix4();
  private readonly localMatrix = new THREE.Matrix4();
  private readonly position = new THREE.Vector3();
  private readonly rotation = new THREE.Quaternion();
  private readonly scale = new THREE.Vector3();
  private readonly euler = new THREE.Euler();
  private readonly mantaPositions = Array.from({ length: WITNESSES }, () => new THREE.Vector3());
  private readonly mantaMatrices = Array.from({ length: WITNESSES }, () => new THREE.Matrix4());
  private readonly gold = new THREE.Color(0xf2c875);
  private readonly cyan = new THREE.Color(0x55c8dc);
  private readonly rose = new THREE.Color(0xca78b9);
  private readonly violet = new THREE.Color(0x8e67c7);
  private readonly pearl = new THREE.Color(0xc9e4df);
  private readonly deepTeal = new THREE.Color(0x294d58);
  private readonly deepViolet = new THREE.Color(0x3d3159);
  private readonly dormant = new THREE.Color(0x172a38);
  private active = false;
  private stageIndex = 0;

  constructor() {
    this.group.name = "eclipse-court-original-world";
    this.group.userData["artDirection"] = "first-moonseed-eclipse-bloom";
    this.group.userData["environmentRevision"] = "full-realm-campaign-r6";
    this.group.userData["stageSilhouettes"] = [
      "halo-lunar-rib-procession",
      "open-constellation-atolls",
      "rising-crown-amphitheatre",
    ];
    this.group.visible = false;

    const instances = [
      this.gateShells, this.weaveGateShells, this.verdictGateShells,
      this.gateTissues, this.gateRims, this.shellTowers,
      this.reefBoulders, this.coralFans, this.moonGrass, this.schoolFish,
      this.pearlLanterns, this.clamCanopies, this.crownPetals,
      this.nectaryCups, this.nectaryFronds,
      this.mantaBodies, this.mantaWings, this.mantaLobes, this.mantaTails,
      this.mantaEyes, this.mantaMarks, this.mantaWakePearls, this.pollen, this.iris,
      this.thorns, this.lightShafts, this.haloArches, this.weaveAtolls,
      this.weaveBeacons, this.verdictTerraces, this.verdictBlades,
    ];
    for (const mesh of instances) {
      mesh.frustumCulled = false;
      mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    }
    for (const object of [
      this.floor, this.shellTowers, this.reefBoulders, this.coralFans,
      this.moonGrass, this.schoolFish, this.pearlLanterns, this.clamCanopies,
      this.crownPetals,
      this.gateTissues, this.gateRims, this.nectaryCups, this.nectaryFronds,
      this.mantaBodies, this.mantaWings, this.mantaLobes, this.mantaTails,
      this.mantaEyes, this.mantaMarks, this.mantaWakePearls, this.pollen, this.iris,
      this.thorns, this.current, this.lightShafts, this.haloArches,
      this.weaveAtolls, this.weaveBeacons, this.verdictTerraces,
      this.verdictBlades,
    ]) object.userData["hideInArtMask"] = true;

    this.floor.name = "court-silted-reef-floor";
    this.gateShells.name = "living-petal-collision-membranes";
    this.gateShells.userData["isObstacle"] = true;
    this.weaveGateShells.name = "weave-floating-manta-isle-gates";
    this.weaveGateShells.userData["isObstacle"] = true;
    this.verdictGateShells.name = "verdict-stepped-crown-gates";
    this.verdictGateShells.userData["isObstacle"] = true;
    this.gateTissues.name = "court-sculpted-shell-buttresses";
    this.gateRims.name = "court-luminous-collider-lips";
    this.shellTowers.name = "court-gallery-architecture";
    this.reefBoulders.name = "court-layered-calcium-reef";
    this.coralFans.name = "court-living-coral-gardens";
    this.moonGrass.name = "court-moon-grass-meadows";
    this.schoolFish.name = "court-reef-life-schools";
    this.pearlLanterns.name = "court-pearl-lanterns";
    this.clamCanopies.name = "court-giant-clam-canopies";
    this.crownPetals.name = "first-moonseed-growth-lines";
    this.nectaryCups.name = "halo-nectaries";
    this.nectaryFronds.name = "halo-nectary-anemones";
    this.mantaBodies.name = "six-star-manta-witnesses";
    this.mantaWings.name = "star-manta-articulated-wings";
    this.mantaLobes.name = "star-manta-cephalic-lobes";
    this.mantaTails.name = "star-manta-whip-tails";
    this.mantaEyes.name = "star-manta-lateral-eyes";
    this.mantaMarks.name = "star-manta-constellation-markings";
    this.mantaWakePearls.name = "free-swimming-manta-wakes";
    this.pollen.name = "pearl-pollen-current";
    this.iris.name = "five-crown-iris-plates";
    this.thorns.name = "duskmaw-shadow-thorn";
    this.current.name = "constellation-route-ribbon";
    this.lightShafts.name = "subsurface-refracted-light-shafts";
    this.haloArches.name = "halo-procession-side-lunar-ribs";
    this.weaveAtolls.name = "weave-floating-reef-atolls";
    this.weaveBeacons.name = "weave-constellation-beacons";
    this.verdictTerraces.name = "verdict-rising-amphitheatre";
    this.verdictBlades.name = "verdict-crown-blade-canopy";
    this.current.frustumCulled = false;

    this.eclipse.name = "black-sun-horizon";
    this.disc.name = "first-moonseed-eclipse-core";
    this.corona.name = "first-moonseed-corona";
    this.heart.name = "living-crown-heart";
    this.eclipse.add(this.disc, this.corona, this.heart);

    this.regent.name = "vaelune-regent";
    this.regentBody.scale.set(0.72, 1.18, 0.62);
    this.regentHead.scale.setScalar(0.46);
    this.regentHead.position.y = 1.62;
    this.regentVeil.scale.set(1.5, 2.8, 0.7);
    this.regentVeil.position.set(0, 0.15, -0.18);
    this.regentVeil.rotation.z = Math.PI;
    this.regent.add(this.regentVeil, this.regentBody, this.regentHead);
    this.regent.userData["hideInArtMask"] = true;

    this.floor.receiveShadow = true;
    this.group.add(
      this.floor, this.shellTowers, this.reefBoulders, this.coralFans,
      this.moonGrass, this.schoolFish, this.pearlLanterns, this.clamCanopies,
      this.crownPetals,
      this.gateShells, this.weaveGateShells, this.verdictGateShells,
      this.gateTissues, this.gateRims,
      this.nectaryCups, this.nectaryFronds,
      this.mantaBodies, this.mantaWings, this.mantaLobes, this.mantaTails,
      this.mantaEyes, this.mantaMarks, this.mantaWakePearls, this.pollen,
      this.iris, this.thorns, this.current, this.lightShafts,
      this.haloArches, this.weaveAtolls, this.weaveBeacons,
      this.verdictTerraces, this.verdictBlades,
      this.eclipse, this.regent, this.sanctuaryLight, this.routeLight,
    );
  }

  setActive(colour: string | null, stageIndex = 0): void {
    this.active = colour !== null;
    this.stageIndex = Math.max(0, Math.min(2, Math.floor(stageIndex)));
    this.group.userData["activeSilhouette"] = [
      "halo-lunar-rib-procession",
      "open-constellation-atolls",
      "rising-crown-amphitheatre",
    ][this.stageIndex];
    const accent = this.stageAccent();
    const secondary = this.stageIndex === 0 ? this.cyan : this.stageIndex === 1 ? this.rose : this.gold;
    (this.currentMaterial.uniforms["uColour"]!.value as THREE.Color).copy(accent);
    (this.currentMaterial.uniforms["uSecondary"]!.value as THREE.Color).copy(secondary);
    this.currentMaterial.uniforms["uMode"]!.value = this.stageIndex;
    this.glowMaterial.color.copy(accent);
    this.shellMaterial.color.set(this.stageIndex === 0 ? 0xa9bbb0 : this.stageIndex === 1 ? 0x8eafb5 : 0xa38aa9);
    this.shellMaterial.emissive.copy(accent).multiplyScalar(0.075);
    this.shellMaterial.roughness = this.stageIndex === 0 ? 0.4 : this.stageIndex === 1 ? 0.72 : 0.3;
    this.shellMaterial.clearcoat = this.stageIndex === 2 ? 0.52 : this.stageIndex === 0 ? 0.34 : 0.14;
    this.tissueMaterial.color.set(this.stageIndex === 0 ? 0xa8c3b5 : this.stageIndex === 1 ? 0x83bcc5 : 0xb39bbd);
    this.tissueMaterial.emissive.copy(accent).multiplyScalar(0.2);
    this.tissueMaterial.opacity = this.stageIndex === 0 ? 0.78 : this.stageIndex === 1 ? 0.64 : 0.82;
    this.seabedMaterial.roughness = this.stageIndex === 1 ? 0.98 : this.stageIndex === 2 ? 0.72 : 0.9;
    this.sanctuaryLight.color.copy(accent);
    this.routeLight.color.copy(secondary);
    if (!this.active) this.group.visible = false;
  }

  update(realmId: RealmId, forwardDistance: number, elapsedSec: number, gates: readonly Gate[], status: Readonly<EclipseCourtRunStatus> | null, reducedMotion: boolean): void {
    this.group.visible = this.active && realmId === "eclipse-court";
    if (!this.group.visible) return;
    const time = reducedMotion ? 0 : elapsedSec;
    const visible = this.visiblePlans(gates, forwardDistance);
    this.updateEnvironment(forwardDistance, time, reducedMotion, gates, visible);
    this.updateBloom(forwardDistance, time, status, reducedMotion);
    this.updateGates(visible, time, status, reducedMotion);
    this.updateCurrent(visible, forwardDistance, time, status);
    this.updateWitnesses(forwardDistance, time, status, reducedMotion, visible);
    this.updatePollen(forwardDistance, time, status);
  }

  private stageAccent(): THREE.Color {
    return this.stageIndex === 0 ? this.gold : this.stageIndex === 1 ? this.cyan : this.violet;
  }

  private visiblePlans(gates: readonly Gate[], forward: number): Array<{ gate: Gate; plan: EclipseCourtGatePlan }> {
    const result: Array<{ gate: Gate; plan: EclipseCourtGatePlan }> = [];
    for (const gate of gates) {
      if (gate.distance < forward - 12) continue;
      if (gate.distance > forward + 275) break;
      const plan = gate.realmPlan;
      if (plan?.verb !== "orbital-thread" && plan?.verb !== "umbra-shift" && plan?.verb !== "eclipse-verdict") continue;
      result.push({ gate, plan });
      if (result.length >= MAX_VISIBLE_GATES) break;
    }
    return result;
  }

  private compose(index: number, mesh: THREE.InstancedMesh, x: number, y: number, z: number, sx: number, sy: number, sz: number, rx = 0, ry = 0, rz = 0): void {
    this.position.set(x, y, z);
    this.euler.set(rx, ry, rz);
    this.rotation.setFromEuler(this.euler);
    this.scale.set(sx, sy, sz);
    this.matrix.compose(this.position, this.rotation, this.scale);
    mesh.setMatrixAt(index, this.matrix);
  }

  private composePart(index: number, mesh: THREE.InstancedMesh, parent: THREE.Matrix4, x: number, y: number, z: number, sx: number, sy: number, sz: number, rx = 0, ry = 0, rz = 0): void {
    this.position.set(x, y, z);
    this.euler.set(rx, ry, rz);
    this.rotation.setFromEuler(this.euler);
    this.scale.set(sx, sy, sz);
    this.localMatrix.compose(this.position, this.rotation, this.scale);
    this.matrix.multiplyMatrices(parent, this.localMatrix);
    mesh.setMatrixAt(index, this.matrix);
  }

  private bloomDepth(): number {
    return this.stageIndex === 0 ? 210 : this.stageIndex === 1 ? 176 : 132;
  }

  private commitInstances(mesh: THREE.InstancedMesh, count: number): void {
    mesh.count = count;
    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
  }

  private clearCourtArchitecture(): void {
    for (const mesh of [
      this.shellTowers, this.reefBoulders, this.coralFans, this.moonGrass,
      this.schoolFish, this.pearlLanterns, this.clamCanopies, this.haloArches,
      this.weaveAtolls, this.weaveBeacons, this.verdictTerraces,
      this.verdictBlades,
    ]) mesh.count = 0;
  }

  /**
   * Court walls divide the run into real rooms. Solid scenery is authored only
   * inside these rooms, never on a wall plane. This keeps the visual world and
   * the collision world spatially truthful on a portrait camera.
   */
  private courtChambers(forward: number, gates: readonly Gate[]): CourtChamber[] {
    const walls = gates
      .filter((gate) => {
        const verb = gate.realmPlan?.verb;
        return verb === "orbital-thread" || verb === "umbra-shift" || verb === "eclipse-verdict";
      })
      .map((gate) => gate.distance)
      .sort((a, b) => a - b);
    const chambers: CourtChamber[] = [];
    let near = 0;
    for (const far of walls) {
      if (far >= forward - 20 && near <= forward + 360) {
        const usableNear = near + COURT_WALL_CLEARANCE;
        const usableFar = far - COURT_WALL_CLEARANCE;
        if (usableFar - usableNear >= 5) {
          chambers.push({ near, far, usableNear, usableFar });
        }
      }
      near = far;
      if (near > forward + 360) break;
    }

    const horizon = forward + 360;
    while (near < horizon) {
      const far = near + 34;
      if (far >= forward - 20) {
        chambers.push({
          near,
          far,
          usableNear: near + COURT_WALL_CLEARANCE,
          usableFar: far - COURT_WALL_CLEARANCE,
        });
      }
      near = far;
    }

    return chambers.length > 0 ? chambers : [{
      near: forward + 8,
      far: forward + 42,
      usableNear: forward + 13.5,
      usableFar: forward + 36.5,
    }];
  }

  private chamberDistance(
    chambers: readonly CourtChamber[],
    chamberIndex: number,
    fraction = 0.5,
  ): number {
    const chamber = chambers[chamberIndex % chambers.length]!;
    return THREE.MathUtils.lerp(
      chamber.usableNear,
      chamber.usableFar,
      THREE.MathUtils.clamp(fraction, 0, 1),
    );
  }

  /** Funnel swimming actors through the same mathematical opening as Glowfin. */
  private wallSafeRouteX(
    visible: readonly { gate: Gate; plan: EclipseCourtGatePlan }[],
    distance: number,
    time: number,
    desiredX: number,
    halfWidth: number,
    approachDistance = 15,
  ): number {
    let nearest: { gate: Gate; plan: EclipseCourtGatePlan } | null = null;
    let nearestDelta = Number.POSITIVE_INFINITY;
    for (const candidate of visible) {
      const delta = Math.abs(candidate.gate.distance - distance);
      if (delta < nearestDelta) {
        nearest = candidate;
        nearestDelta = delta;
      }
    }
    if (!nearest || nearestDelta >= approachDistance) return desiredX;

    const opening = eclipseCourtOpeningAt(nearest.plan, time);
    const safeLeft = opening.left + halfWidth;
    const safeRight = opening.right - halfWidth;
    const center = (opening.left + opening.right) * 0.5;
    const target = safeLeft <= safeRight
      ? THREE.MathUtils.clamp(desiredX, safeLeft, safeRight)
      : center;
    const funnel = 1 - THREE.MathUtils.smoothstep(nearestDelta, 0, approachDistance);
    return THREE.MathUtils.lerp(desiredX, target, funnel * funnel * (3 - 2 * funnel));
  }

  /** A ceremonial procession whose paired side ribs never cover the route. */
  private updateHaloProcession(
    forward: number,
    time: number,
    reducedMotion: boolean,
    chambers: readonly CourtChamber[],
    visible: readonly { gate: Gate; plan: EclipseCourtGatePlan }[],
  ): void {
    for (let index = 0; index < HALO_ARCHES; index += 1) {
      const row = Math.floor(index / 2);
      const side = index % 2 === 0 ? -1 : 1;
      const depth = this.chamberDistance(chambers, row, 0.5);
      const breathe = reducedMotion ? 0 : Math.sin(time * 0.24 + row * 0.8) * 0.035;
      const x = side * (5.12 + (row % 2) * 0.24);
      this.compose(
        index,
        this.haloArches,
        x,
        1.52,
        -depth,
        side * (1.78 + (row % 3) * 0.08),
        4.12 + breathe,
        1.08,
        0,
        side * 0.06,
        side * 0.025,
      );
      this.haloArches.setColorAt(index, row % 3 === 0 ? this.gold : this.pearl);
    }
    this.commitInstances(this.haloArches, HALO_ARCHES);

    let towerCount = 0;
    for (let row = 0; row < 7; row += 1) {
      for (const side of [-1, 1] as const) {
        const index = towerCount++;
        const depth = this.chamberDistance(chambers, row, side > 0 ? 0.72 : 0.28);
        const height = 3.6 + (row % 3) * 0.65;
        this.compose(index, this.shellTowers, side * 6.45, 1.65 + height * 0.45, -depth,
          side * 1.05, height, 1.15, side * 0.03, row * 0.28, side * 0.08);
        this.shellTowers.setColorAt(index, row % 2 === 0 ? this.pearl : this.gold);
      }
    }
    this.commitInstances(this.shellTowers, towerCount);

    let clamCount = 0;
    for (let row = 0; row < 7; row += 1) {
      const side = row % 2 === 0 ? -1 : 1;
      const depth = this.chamberDistance(chambers, row, 0.58);
      const opening = 0.92 + (reducedMotion ? 0 : Math.sin(time * 0.31 + row) * 0.09);
      const x = side * (4.75 + (row % 3) * 0.38);
      for (const half of [-1, 1] as const) {
        const index = clamCount++;
        this.compose(index, this.clamCanopies, x + half * 0.38, 0.38 + (row % 2) * 0.28, -depth,
          1.28, 1.48 * opening, 0.68, half * 0.48, side * 0.22, half * (0.72 + opening * 0.16));
        this.clamCanopies.setColorAt(index, half < 0 ? this.gold : this.pearl);
      }
    }
    this.commitInstances(this.clamCanopies, clamCount);

    let lanternCount = 0;
    for (let row = 0; row < 10; row += 1) {
      for (const side of [-1, 1] as const) {
        const index = lanternCount++;
        const pulse = reducedMotion ? 1 : 1 + Math.sin(time * 0.9 + index) * 0.12;
        const size = (0.24 + (row % 3) * 0.045) * pulse;
        const depth = this.chamberDistance(chambers, row, side > 0 ? 0.76 : 0.24);
        this.compose(index, this.pearlLanterns, side * (4.25 + (row % 2) * 0.4), 3.1 + (row % 3) * 0.7,
          -depth, size, size, size);
        this.pearlLanterns.setColorAt(index, row % 2 === 0 ? this.gold : this.pearl);
      }
    }
    for (let row = 0; row < 7; row += 1) {
      const index = lanternCount++;
      const side = row % 2 === 0 ? -1 : 1;
      const pulse = reducedMotion ? 1 : 1 + Math.sin(time * 1.2 + row) * 0.1;
      const size = 0.34 * pulse;
      const depth = this.chamberDistance(chambers, row, 0.58);
      this.compose(index, this.pearlLanterns, side * (4.75 + (row % 3) * 0.38), 0.72 + (row % 2) * 0.28,
        -depth, size, size, size);
      this.pearlLanterns.setColorAt(index, this.gold);
    }
    this.commitInstances(this.pearlLanterns, lanternCount);

    for (let index = 0; index < 28; index += 1) {
      const side = index % 2 === 0 ? -1 : 1;
      const row = Math.floor(index / 2);
      const size = 0.82 + (index % 4) * 0.17;
      const depth = this.chamberDistance(chambers, row, 0.18 + (index % 4) * 0.21);
      this.compose(index, this.reefBoulders, side * (5.55 + (index % 3) * 0.5), -0.82,
        -depth, size * 1.7, size * 0.62, size * 1.25, index * 0.12, index * 0.37, side * 0.08);
      this.reefBoulders.setColorAt(index, index % 4 === 0 ? this.gold : this.deepTeal);
    }
    this.commitInstances(this.reefBoulders, 28);

    for (let index = 0; index < 32; index += 1) {
      const side = index % 2 === 0 ? -1 : 1;
      const row = Math.floor(index / 2);
      const sway = reducedMotion ? 0 : Math.sin(time * 0.45 + index) * 0.08;
      const depth = this.chamberDistance(chambers, row, 0.14 + (index % 4) * 0.24);
      this.compose(index, this.coralFans, side * (5.1 + (index % 4) * 0.38), 0.3 + (index % 3) * 0.22,
        -depth, side * 0.72, 1.12, 0.7, 0, side * 0.15, side * (0.22 + sway));
      this.coralFans.setColorAt(index, index % 5 === 0 ? this.rose : this.pearl);
    }
    this.commitInstances(this.coralFans, 32);

    for (let index = 0; index < 72; index += 1) {
      const side = index % 2 === 0 ? -1 : 1;
      const row = Math.floor(index / 2);
      const sway = reducedMotion ? 0 : Math.sin(time * 0.62 + index * 0.77) * 0.11;
      const height = 0.52 + (index % 6) * 0.11;
      const depth = this.chamberDistance(chambers, row, 0.08 + (index % 6) * 0.17);
      this.compose(index, this.moonGrass, side * (4.55 + (index % 5) * 0.34), -0.42 + height * 0.55,
        -depth, side * 0.2, height, 0.22, sway * 0.16, index * 0.19, side * (0.08 + sway));
      this.moonGrass.setColorAt(index, index % 8 === 0 ? this.gold : index % 3 === 0 ? this.pearl : this.deepTeal);
    }
    this.commitInstances(this.moonGrass, 72);

    for (let index = 0; index < 48; index += 1) {
      const school = index % 3;
      const depth = 18 + (index * 7.7 + time * (reducedMotion ? 0 : 1.1)) % 210;
      const phase = index * 1.73;
      const size = 0.42 + (index % 4) * 0.06;
      const distance = forward + depth;
      const x = this.wallSafeRouteX(visible, distance, time, Math.sin(phase) * 4.2, 0.78);
      this.compose(index, this.schoolFish, x, 3.35 + school * 0.62 + Math.cos(phase) * 0.4,
        -distance, size * 1.35, size, size * 1.7, 0, school % 2 ? 0.22 : -0.22, Math.sin(phase) * 0.08);
      this.schoolFish.setColorAt(index, index % 9 === 0 ? this.gold : this.cyan);
    }
    this.commitInstances(this.schoolFish, 48);
  }

  /** An open pelagic arena of floating reefs; the race pack occupies the lane. */
  private updateConstellationWeave(
    forward: number,
    time: number,
    reducedMotion: boolean,
    chambers: readonly CourtChamber[],
    visible: readonly { gate: Gate; plan: EclipseCourtGatePlan }[],
  ): void {
    for (let index = 0; index < WEAVE_ATOLLS; index += 1) {
      const side = index % 2 === 0 ? -1 : 1;
      const row = Math.floor(index / 2);
      const depth = this.chamberDistance(chambers, row, side > 0 ? 0.72 : 0.28);
      const drift = reducedMotion ? 0 : Math.sin(time * 0.19 + index * 0.77) * 0.18;
      const size = 1.45 + (row % 3) * 0.25;
      this.compose(index, this.weaveAtolls, side * (6.65 + (row % 2) * 0.55), 0.35 + (row % 4) * 0.72 + drift,
        -depth, size * 1.72, size * 0.48, size * 1.3, index * 0.13, index * 0.41, side * 0.08);
      this.weaveAtolls.setColorAt(index, index % 4 === 0 ? this.cyan : index % 3 === 0 ? this.pearl : this.deepTeal);
    }
    this.commitInstances(this.weaveAtolls, WEAVE_ATOLLS);

    for (let index = 0; index < WEAVE_BEACONS; index += 1) {
      const side = index % 2 === 0 ? -1 : 1;
      const row = Math.floor(index / 2);
      const pulse = reducedMotion ? 1 : 1 + Math.sin(time * 1.05 + index * 0.61) * 0.15;
      const size = (0.24 + (index % 4) * 0.055) * pulse;
      const depth = this.chamberDistance(chambers, Math.floor(row * 0.68), side > 0 ? 0.8 : 0.2);
      this.compose(index, this.weaveBeacons, side * (2.25 + (row % 4) * 0.72), 4.15 + (row % 3) * 0.75,
        -depth, size, size * 1.35, size, 0, time * (reducedMotion ? 0 : 0.18), Math.PI * 0.25);
      this.weaveBeacons.setColorAt(index, index % 5 === 0 ? this.pearl : this.cyan);
    }
    this.commitInstances(this.weaveBeacons, WEAVE_BEACONS);

    for (let index = 0; index < 42; index += 1) {
      const side = index % 2 === 0 ? -1 : 1;
      const row = Math.floor(index / 2);
      const sway = reducedMotion ? 0 : Math.sin(time * 0.54 + index) * 0.1;
      const depth = this.chamberDistance(chambers, row, 0.12 + (index % 4) * 0.25);
      this.compose(index, this.coralFans, side * (4.7 + (row % 3) * 0.72), 1.25 + (row % 4) * 0.78,
        -depth, side * 0.78, 1.34, 0.74, 0.03, side * 0.22, side * (0.28 + sway));
      this.coralFans.setColorAt(index, index % 6 === 0 ? this.rose : index % 2 ? this.cyan : this.pearl);
    }
    this.commitInstances(this.coralFans, 42);

    const fishMotion = reducedMotion ? 0 : time * 2.55;
    for (let index = 0; index < SCHOOL_FISH; index += 1) {
      const school = index % 6;
      const depth = 14 + (index * 9.1 + fishMotion * (0.75 + school * 0.08)) % 230;
      const phase = index * 2.117 + time * (reducedMotion ? 0 : 0.32);
      const x = Math.sin(phase * 0.71 + school) * 4.65;
      const y = 1.7 + (school % 4) * 0.92 + Math.cos(phase) * 0.42;
      const size = 0.48 + (index % 5) * 0.075;
      const distance = forward + depth;
      const routedX = this.wallSafeRouteX(visible, distance, time, x, 0.9);
      this.compose(index, this.schoolFish, routedX, y, -distance, size * 1.42, size, size * 1.76,
        Math.sin(phase) * 0.08, school % 2 ? 0.31 : -0.31, Math.cos(phase) * 0.13);
      this.schoolFish.setColorAt(index, index % 13 === 0 ? this.gold : index % 7 === 0 ? this.rose : this.cyan);
    }
    this.commitInstances(this.schoolFish, SCHOOL_FISH);

    for (let index = 0; index < 16; index += 1) {
      const side = index % 2 === 0 ? -1 : 1;
      const row = Math.floor(index / 2);
      const pulse = reducedMotion ? 1 : 1 + Math.sin(time * 0.72 + index) * 0.1;
      const size = (0.18 + (index % 3) * 0.04) * pulse;
      const depth = this.chamberDistance(chambers, row, side > 0 ? 0.7 : 0.3);
      this.compose(index, this.pearlLanterns, side * (4.1 + (row % 3) * 0.62), 2.4 + (row % 4) * 0.72,
        -depth, size, size, size);
      this.pearlLanterns.setColorAt(index, index % 4 === 0 ? this.pearl : this.cyan);
    }
    this.commitInstances(this.pearlLanterns, 16);
  }

  /** A compressed royal arena: rising polygonal stands and a crown-blade roof. */
  private updateCrownVerdict(
    forward: number,
    time: number,
    reducedMotion: boolean,
    chambers: readonly CourtChamber[],
    visible: readonly { gate: Gate; plan: EclipseCourtGatePlan }[],
  ): void {
    for (let index = 0; index < VERDICT_TERRACES; index += 1) {
      const side = index % 2 === 0 ? -1 : 1;
      const row = Math.floor(index / 2);
      const depth = this.chamberDistance(chambers, row, 0.18 + (index % 4) * 0.21);
      const rise = Math.min(3.2, row * 0.24);
      const scale = 1.35 + (row % 4) * 0.18;
      this.compose(index, this.verdictTerraces, side * (6.9 + (row % 3) * 0.38), -0.48 + rise,
        -depth, scale * 2.15, 0.88 + row * 0.035, scale * 1.45, 0, row * 0.13, side * 0.025);
      this.verdictTerraces.setColorAt(index, row % 3 === 0 ? this.violet : row % 2 ? this.rose : this.deepViolet);
    }
    this.commitInstances(this.verdictTerraces, VERDICT_TERRACES);

    for (let index = 0; index < VERDICT_BLADES; index += 1) {
      const side = index % 2 === 0 ? -1 : 1;
      const row = Math.floor(index / 2);
      const depth = this.chamberDistance(chambers, Math.floor(row * 0.68), side > 0 ? 0.75 : 0.25);
      const breathe = reducedMotion ? 0 : Math.sin(time * 0.28 + row) * 0.08;
      this.compose(index, this.verdictBlades, side * (4.75 + (row % 3) * 0.58), 5.15 + (row % 2) * 0.68,
        -depth, side * (1.08 + (row % 2) * 0.2), 2.65 + breathe, 0.75,
        -0.12, side * 0.18, side * (0.58 + (row % 3) * 0.12));
      this.verdictBlades.setColorAt(index, row % 4 === 0 ? this.rose : this.violet);
    }
    this.commitInstances(this.verdictBlades, VERDICT_BLADES);

    for (let index = 0; index < 36; index += 1) {
      const side = index % 2 === 0 ? -1 : 1;
      const row = Math.floor(index / 2);
      const sway = reducedMotion ? 0 : Math.sin(time * 0.37 + index * 0.9) * 0.06;
      const depth = this.chamberDistance(chambers, row, 0.12 + (index % 4) * 0.25);
      this.compose(index, this.coralFans, side * (4.85 + (row % 4) * 0.42), 0.75 + Math.min(2.9, row * 0.18),
        -depth, side * 0.78, 1.5, 0.82, 0, side * 0.2, side * (0.34 + sway));
      this.coralFans.setColorAt(index, index % 5 === 0 ? this.pearl : index % 2 === 0 ? this.rose : this.violet);
    }
    this.commitInstances(this.coralFans, 36);

    for (let index = 0; index < 24; index += 1) {
      const side = index % 2 === 0 ? -1 : 1;
      const row = Math.floor(index / 2);
      const size = 0.76 + (index % 4) * 0.16;
      const depth = this.chamberDistance(chambers, row, 0.15 + (index % 4) * 0.23);
      this.compose(index, this.reefBoulders, side * (5.1 + (row % 3) * 0.52), -0.66 + row * 0.16,
        -depth, size * 1.7, size * 0.72, size * 1.3, index * 0.16, index * 0.33, side * 0.06);
      this.reefBoulders.setColorAt(index, index % 3 === 0 ? this.deepViolet : this.rose);
    }
    this.commitInstances(this.reefBoulders, 24);

    for (let index = 0; index < 18; index += 1) {
      const side = index % 2 === 0 ? -1 : 1;
      const row = Math.floor(index / 2);
      const size = 0.22 + (index % 3) * 0.05;
      const depth = this.chamberDistance(chambers, row, side > 0 ? 0.68 : 0.32);
      this.compose(index, this.pearlLanterns, side * (3.85 + (row % 3) * 0.65), 3.15 + (row % 4) * 0.66,
        -depth, size, size, size);
      this.pearlLanterns.setColorAt(index, index % 3 === 0 ? this.pearl : this.rose);
    }
    this.commitInstances(this.pearlLanterns, 18);

    for (let index = 0; index < 36; index += 1) {
      const depth = 22 + (index * 13.4 + time * (reducedMotion ? 0 : 1.25)) % 190;
      const phase = index * 1.91;
      const size = 0.4 + (index % 4) * 0.06;
      const distance = forward + depth;
      const x = this.wallSafeRouteX(visible, distance, time, Math.sin(phase) * 4.1, 0.78);
      this.compose(index, this.schoolFish, x, 3.5 + (index % 4) * 0.52,
        -distance, size * 1.38, size, size * 1.7, 0, index % 2 ? 0.24 : -0.24, Math.cos(phase) * 0.1);
      this.schoolFish.setColorAt(index, index % 7 === 0 ? this.pearl : this.violet);
    }
    this.commitInstances(this.schoolFish, 36);
  }

  private updateCourtLightShafts(forward: number, time: number): void {
    const count = this.stageIndex === 1 ? 2 : this.stageIndex === 0 ? 4 : 3;
    for (let index = 0; index < count; index += 1) {
      const depth = this.stageIndex === 0 ? 54 + index * 62 : this.stageIndex === 1 ? 68 + index * 96 : 46 + index * 58;
      const spread = this.stageIndex === 0 ? 4.6 : this.stageIndex === 1 ? 3.4 : 2.5;
      const x = (index - (count - 1) * 0.5) * spread + Math.sin(time * 0.11 + index) * 0.5;
      this.compose(index, this.lightShafts, x, 10.4, -forward - depth,
        1.45 + index * 0.16, 22, 1.45 + index * 0.16, 0.02, 0, (index - 1) * 0.035);
    }
    this.commitInstances(this.lightShafts, count);
    this.volumeMaterial.uniforms["uTime"]!.value = time;
    (this.volumeMaterial.uniforms["uColour"]!.value as THREE.Color).copy(
      this.stageIndex === 0 ? this.pearl : this.stageIndex === 1 ? this.cyan : this.violet,
    );
  }

  private updateEnvironment(
    forward: number,
    time: number,
    reducedMotion: boolean,
    gates: readonly Gate[],
    visible: readonly { gate: Gate; plan: EclipseCourtGatePlan }[],
  ): void {
    this.floor.position.set(0, this.stageIndex === 1 ? -2.6 : this.stageIndex === 2 ? -0.45 : 0, -forward - 140);
    this.floor.scale.set(this.stageIndex === 1 ? 1.35 : this.stageIndex === 2 ? 0.88 : 1, 1, 1);
    this.routeLight.position.set(reducedMotion ? 0 : Math.sin(time * 0.24) * 0.8, 3.4, -forward - 30);
    this.clearCourtArchitecture();
    const chambers = this.courtChambers(forward, gates);
    if (this.stageIndex === 0) this.updateHaloProcession(forward, time, reducedMotion, chambers, visible);
    else if (this.stageIndex === 1) this.updateConstellationWeave(forward, time, reducedMotion, chambers, visible);
    else this.updateCrownVerdict(forward, time, reducedMotion, chambers, visible);
    this.updateCourtLightShafts(forward, time);
  }

  private updateBloom(forward: number, time: number, status: Readonly<EclipseCourtRunStatus> | null, reducedMotion: boolean): void {
    const progress = status?.completionFraction ?? 0;
    const complete = status?.completed ?? false;
    const completionAge = complete ? Math.max(0, time - (status?.lastAlignmentSec ?? time)) : 0;
    const unfurl = complete ? THREE.MathUtils.smoothstep(completionAge, 0, 4.2) : 0;
    const centerZ = -forward - this.bloomDepth();
    const centerY = this.stageIndex === 2 ? 8.8 : 9.8;
    const accent = this.stageAccent();

    this.sanctuaryLight.position.set(0, centerY, centerZ + 11);
    this.sanctuaryLight.intensity = 24 + progress * 22 + unfurl * 18;
    this.eclipse.position.set(0, centerY, centerZ);
    this.eclipse.rotation.z = reducedMotion ? 0 : time * 0.012;
    const discScale = this.stageIndex === 0 ? 3.45 : this.stageIndex === 1 ? 3.8 : 4.15;
    this.disc.scale.set(discScale, discScale, discScale * 0.34);
    this.corona.scale.setScalar(discScale * (1.22 + progress * 0.06 + unfurl * 0.16));
    this.glowMaterial.opacity = 0.68 + progress * 0.1 + unfurl * 0.08;
    this.heart.visible = this.stageIndex === 2;
    this.heart.scale.setScalar(1.45 + progress * 0.35 + unfurl * 0.28);
    this.heart.position.z = 1.35;
    this.heartMaterial.emissiveIntensity = 0.92 + progress * 1.2 + unfurl * 0.9;

    for (let index = 0; index < CROWN_PETALS; index += 1) {
      const angle = index / CROWN_PETALS * Math.PI * 2;
      const breathe = reducedMotion ? 1 : 1 + Math.sin(time * 0.34 + index * 0.83) * 0.028;
      const opening = (this.stageIndex === 0 ? 0.72 : this.stageIndex === 1 ? 0.88 : 0.96) + unfurl * 0.16;
      const radius = 4.5 + unfurl * 0.8;
      this.compose(index, this.crownPetals, Math.cos(angle) * radius, centerY + Math.sin(angle) * radius, centerZ + 0.55, 1.72 + this.stageIndex * 0.12, (3.5 + unfurl * 0.8) * opening * breathe, 1.25, 0.02, Math.sin(angle) * 0.08, angle - Math.PI * 0.5);
      this.crownPetals.setColorAt(index, index % 4 === 0 ? accent : index % 3 === 0 ? this.pearl : this.stageIndex === 2 ? this.deepViolet : this.deepTeal);
    }
    this.crownPetals.count = CROWN_PETALS;
    this.crownPetals.instanceMatrix.needsUpdate = true;
    if (this.crownPetals.instanceColor) this.crownPetals.instanceColor.needsUpdate = true;

    if (this.stageIndex === 2) {
      for (let index = 0; index < 5; index += 1) {
        const awakened = index < (status?.alignments ?? 0);
        const angle = index / 5 * Math.PI * 2 - Math.PI * 0.5;
        const open = awakened ? 0.34 : 0.04;
        const breathe = reducedMotion ? 0 : Math.sin(time * 0.42 + index) * 0.025;
        this.compose(index, this.iris, Math.cos(angle) * 2.15, centerY + Math.sin(angle) * 2.15, centerZ + 2.15, 1.12 + open * 0.52, 2.8 + open * 1.4 + unfurl * 0.6, 0.8, 0, 0, angle + open + breathe - Math.PI * 0.5);
        this.iris.setColorAt(index, awakened ? this.pearl : index % 2 ? this.violet : this.rose);
      }
      this.iris.count = 5;
      this.iris.instanceMatrix.needsUpdate = true;
      if (this.iris.instanceColor) this.iris.instanceColor.needsUpdate = true;

      const thornCount = complete ? Math.max(0, 9 - Math.ceil(unfurl * 9)) : Math.max(2, 9 - Math.floor(progress * 6));
      for (let index = 0; index < thornCount; index += 1) {
        const angle = index / Math.max(1, thornCount) * Math.PI * 2;
        const radius = 1.3 + (index % 3) * 0.42;
        this.compose(index, this.thorns, Math.cos(angle) * radius, centerY + Math.sin(angle) * radius, centerZ + 3, 1.2, 2.2 + (index % 3) * 0.45, 1.2, Math.sin(angle) * 0.2, Math.cos(angle) * 0.18, angle - 0.4);
        this.thorns.setColorAt(index, index % 2 === 0 ? this.deepViolet : this.rose);
      }
      this.thorns.count = thornCount;
      this.thorns.instanceMatrix.needsUpdate = true;
      if (this.thorns.instanceColor) this.thorns.instanceColor.needsUpdate = true;
    } else {
      this.iris.count = 0;
      this.thorns.count = 0;
    }

    this.regent.visible = this.stageIndex === 2;
    if (this.regent.visible) {
      const reveal = Math.min(1, 0.12 + progress * 0.66 + unfurl * 0.52);
      this.regent.position.set(reducedMotion ? 0 : Math.sin(time * 0.29) * 0.28, centerY - 2.05 + reveal * 1.05, centerZ + 4.8 + reveal * 7.4);
      this.regent.scale.setScalar(1.18 + reveal * 0.5);
      this.regent.rotation.y = Math.PI + (reducedMotion ? 0 : Math.sin(time * 0.25) * 0.08);
      this.regentMaterial.opacity = 0.14 + reveal * 0.76;
      this.regentMaterial.emissiveIntensity = 0.58 + reveal * 1.18;
    }
  }

  private updateGates(visible: readonly { gate: Gate; plan: EclipseCourtGatePlan }[], time: number, status: Readonly<EclipseCourtRunStatus> | null, reducedMotion: boolean): void {
    let partIndex = 0;
    let nectaryIndex = 0;
    let frondIndex = 0;
    const obstacleMesh = this.stageIndex === 0
      ? this.gateShells
      : this.stageIndex === 1
        ? this.weaveGateShells
        : this.verdictGateShells;
    this.gateShells.count = 0;
    this.weaveGateShells.count = 0;
    this.verdictGateShells.count = 0;
    this.gateTissues.count = 0;
    const verticalScale = this.stageIndex === 1 ? 3.18 : this.stageIndex === 2 ? 3.5 : 3.36;
    const verticalCenter = this.stageIndex === 2 ? 1.05 : 1.18;
    for (const { gate, plan } of visible) {
      const opening = eclipseCourtOpeningAt(plan, time);
      const leftWidth = Math.max(0.18, opening.left + LANE_EDGE);
      const rightWidth = Math.max(0.18, LANE_EDGE - opening.right);
      const shellColour = this.stageIndex === 0 ? plan.sequence % 3 === 0 ? this.gold : this.deepTeal : this.stageIndex === 1 ? plan.sequence % 4 === 0 ? this.cyan : this.deepTeal : plan.verb === "eclipse-verdict" ? this.deepViolet : this.rose;
      const tissueColour = this.stageIndex === 0 ? plan.sequence % 2 === 0 ? this.pearl : this.gold : this.stageIndex === 1 ? this.cyan : this.violet;
      const breath = reducedMotion ? 0 : Math.sin(time * 0.52 + plan.sequence * 1.7) * 0.025;

      this.compose(partIndex, obstacleMesh, opening.left, verticalCenter, -gate.distance, -leftWidth, verticalScale, 1.7, 0.02, 0.08, -0.025 + breath);
      obstacleMesh.setColorAt(partIndex, shellColour);
      if (this.stageIndex === 0) {
        this.compose(partIndex, this.gateTissues, opening.left, verticalCenter, -gate.distance + 0.12, -leftWidth, verticalScale, 1.72, 0.02, 0.08, -0.025 + breath);
        this.gateTissues.setColorAt(partIndex, tissueColour);
      }
      this.compose(partIndex, this.gateRims, opening.left, verticalCenter, -gate.distance + 0.48, 1, verticalScale * 1.08, 1, 0, 0, breath * 0.3);
      this.gateRims.setColorAt(partIndex, this.stageAccent());
      partIndex += 1;

      this.compose(partIndex, obstacleMesh, opening.right, verticalCenter, -gate.distance, rightWidth, verticalScale, 1.7, -0.02, -0.08, 0.025 - breath);
      obstacleMesh.setColorAt(partIndex, shellColour);
      if (this.stageIndex === 0) {
        this.compose(partIndex, this.gateTissues, opening.right, verticalCenter, -gate.distance + 0.12, rightWidth, verticalScale, 1.72, -0.02, -0.08, 0.025 - breath);
        this.gateTissues.setColorAt(partIndex, tissueColour);
      }
      this.compose(partIndex, this.gateRims, opening.right, verticalCenter, -gate.distance + 0.48, 1, verticalScale * 1.08, 1, 0, 0, -breath * 0.3);
      this.gateRims.setColorAt(partIndex, this.stageAccent());
      partIndex += 1;

      if (this.stageIndex === 0) {
        const awakened = plan.sequence <= (status?.alignments ?? 0) + 1;
        const side = plan.sequence % 2 === 0 ? -1 : 1;
        const x = side < 0 ? opening.left - Math.min(1.8, leftWidth * 0.45) : opening.right + Math.min(1.8, rightWidth * 0.45);
        const pulse = 1 + (reducedMotion ? 0 : Math.sin(time * 1.1 + plan.sequence) * 0.08);
        this.compose(nectaryIndex, this.nectaryCups, x, 3.1, -gate.distance + 1.05, 0.52 * pulse, 0.62 * pulse, 0.52);
        this.nectaryCups.setColorAt(nectaryIndex, awakened ? this.gold : this.deepTeal);
        for (let petal = 0; petal < 5; petal += 1) {
          const angle = petal / 5 * Math.PI * 2;
          this.compose(frondIndex, this.nectaryFronds, x + Math.cos(angle) * 0.42, 3.1 + Math.sin(angle) * 0.42, -gate.distance + 1.12, 0.22 * pulse, 0.54 * pulse, 0.25, 0, 0, angle - Math.PI * 0.5);
          this.nectaryFronds.setColorAt(frondIndex++, awakened ? this.gold : this.dormant);
        }
        nectaryIndex += 1;
      }
    }
    for (const mesh of [obstacleMesh, this.gateRims]) {
      mesh.count = partIndex;
      mesh.instanceMatrix.needsUpdate = true;
      if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    }
    if (this.stageIndex === 0) {
      this.gateTissues.count = partIndex;
      this.gateTissues.instanceMatrix.needsUpdate = true;
      if (this.gateTissues.instanceColor) this.gateTissues.instanceColor.needsUpdate = true;
    }
    this.nectaryCups.count = nectaryIndex;
    this.nectaryFronds.count = frondIndex;
    this.nectaryCups.instanceMatrix.needsUpdate = true;
    this.nectaryFronds.instanceMatrix.needsUpdate = true;
    if (this.nectaryCups.instanceColor) this.nectaryCups.instanceColor.needsUpdate = true;
    if (this.nectaryFronds.instanceColor) this.nectaryFronds.instanceColor.needsUpdate = true;
  }

  private openingCenter(visible: readonly { gate: Gate; plan: EclipseCourtGatePlan }[], distance: number, time: number): number {
    if (visible.length === 0) return 0;
    let previous = visible[0]!;
    for (let index = 1; index < visible.length; index += 1) {
      const next = visible[index]!;
      if (distance <= next.gate.distance) {
        const from = eclipseCourtOpeningAt(previous.plan, time).center;
        const to = eclipseCourtOpeningAt(next.plan, time).center;
        const blend = THREE.MathUtils.clamp((distance - previous.gate.distance) / Math.max(0.001, next.gate.distance - previous.gate.distance), 0, 1);
        return THREE.MathUtils.lerp(from, to, blend * blend * (3 - 2 * blend));
      }
      previous = next;
    }
    return eclipseCourtOpeningAt(previous.plan, time).center;
  }

  private updateCurrent(visible: readonly { gate: Gate; plan: EclipseCourtGatePlan }[], forward: number, time: number, status: Readonly<EclipseCourtRunStatus> | null): void {
    const positions = this.currentGeo.getAttribute("position") as THREE.BufferAttribute;
    const streamHalfWidth = this.stageIndex === 0 ? 1.7 : this.stageIndex === 1 ? 1.42 : 1.22;
    const verticesPerStrand = CURRENT_POINTS * 2;
    for (let strand = 0; strand < CURRENT_STRANDS; strand += 1) {
      for (let index = 0; index < CURRENT_POINTS; index += 1) {
        const distance = forward + 3 + index * 6.4;
        const routeCenter = this.openingCenter(visible, distance, time);
        const drift = Math.sin(index * 0.29 + time * 0.62) * 0.13;
        const center = routeCenter + drift;
        const wave = Math.sin(time * 0.72 + index * 0.41) * 0.035;
        const vertex = strand * verticesPerStrand + index * 2;
        positions.setXYZ(vertex, center - streamHalfWidth, -1.06 + wave, -distance + 0.72);
        positions.setXYZ(vertex + 1, center + streamHalfWidth, -1.06 - wave, -distance + 0.72);
      }
    }
    positions.needsUpdate = true;
    this.currentMaterial.uniforms["uTime"]!.value = time;
    this.currentMaterial.uniforms["uOpacity"]!.value = status?.completed ? 1.08 : 0.86;
  }

  private updateWitnesses(
    forward: number,
    time: number,
    status: Readonly<EclipseCourtRunStatus> | null,
    reducedMotion: boolean,
    visible: readonly { gate: Gate; plan: EclipseCourtGatePlan }[],
  ): void {
    const progress = status?.completionFraction ?? 0;
    const awakened = Math.min(WITNESSES, status?.alignments ?? 0);
    for (let index = 0; index < WITNESSES; index += 1) {
      const phase = index / WITNESSES * Math.PI * 2;
      const bob = reducedMotion ? 0 : Math.sin(time * 0.68 + index * 1.31) * 0.22;
      let size = 1;
      let colour = this.deepTeal;
      let roll = 0;
      let pitch = -0.06;
      let yaw = 0;
      if (this.stageIndex === 0) {
        const depth = [13, 23, 35, 49, 66, 86][index]!;
        const lane = [-2.6, 2.15, -1.15, 3.05, -3.35, 0.9][index]!;
        const glide = reducedMotion ? 0 : Math.sin(time * 0.44 + index * 1.2) * 0.7;
        const distance = forward + depth;
        const x = this.wallSafeRouteX(
          visible, distance, time, lane + glide, MANTA_WALL_CLEARANCE,
        );
        this.mantaPositions[index]!.set(x, 1.65 + (index % 3) * 0.72 + bob, -distance);
        size = 1.18 + (index % 3) * 0.09;
        colour = index % 3 === 0 ? this.gold : index % 2 === 0 ? this.deepTeal : this.pearl;
        roll = -glide * 0.11;
        pitch = -0.11;
        yaw = glide * 0.045;
      } else if (this.stageIndex === 1) {
        const depth = [11, 18, 26, 35, 47, 61][index]!;
        const lane = [-2.25, 2.4, -0.7, 1.05, -3.0, 3.15][index]!;
        const racingDrift = reducedMotion ? 0 : Math.sin(time * 0.86 + index * 1.43) * 0.62;
        const overtake = reducedMotion ? 0 : Math.sin(time * 0.41 + index * 1.17) * (index < 4 ? 4.2 : 2.2);
        const distance = forward + Math.max(8.5, depth + overtake);
        const x = this.wallSafeRouteX(
          visible, distance, time, lane + racingDrift, MANTA_WALL_CLEARANCE,
        );
        this.mantaPositions[index]!.set(
          x,
          1.45 + (index % 3) * 0.68 + bob,
          -distance,
        );
        size = 1.34 + (index % 3) * 0.1 + (index < awakened ? 0.08 : 0);
        colour = index < awakened
          ? index % 2 === 0 ? this.pearl : this.cyan
          : index % 3 === 0 ? this.deepViolet : this.deepTeal;
        roll = -racingDrift * 0.14;
        pitch = -0.12;
        yaw = racingDrift * 0.06;
      } else {
        const depth = [13, 22, 33, 46, 61, 79][index]!;
        const lane = [-2.4, 2.3, -0.55, 0.75, -3.1, 3.0][index]!;
        const ceremonialTurn = reducedMotion ? 0 : Math.sin(time * 0.38 + phase) * 0.48;
        const distance = forward + depth - progress * (index < 2 ? 2.5 : 0);
        const x = this.wallSafeRouteX(
          visible, distance, time, lane + ceremonialTurn, MANTA_WALL_CLEARANCE,
        );
        this.mantaPositions[index]!.set(
          x,
          1.75 + (index % 3) * 0.78 + bob + progress * 0.35,
          -distance,
        );
        size = 1.28 + progress * 0.14 + (index % 2) * 0.08;
        colour = index % 3 === 0 ? this.violet : index % 2 === 0 ? this.deepTeal : this.rose;
        roll = -ceremonialTurn * 0.16;
        pitch = -0.1;
        yaw = ceremonialTurn * 0.05;
      }

      const p = this.mantaPositions[index]!;
      this.position.copy(p);
      this.euler.set(pitch, yaw, roll);
      this.rotation.setFromEuler(this.euler);
      this.scale.setScalar(size);
      const parent = this.mantaMatrices[index]!;
      parent.compose(this.position, this.rotation, this.scale);
      const flap = reducedMotion ? 0.05 : Math.sin(time * 1.46 + index * 0.87) * 0.2;

      this.composePart(index, this.mantaBodies, parent, 0, 0.06, 0.015, 0.47, 0.68, 0.17);
      this.mantaBodies.setColorAt(index, colour);
      this.composePart(index * 2, this.mantaWings, parent, 0, 0, 0, 1, 1, 1, 0, flap, -0.02);
      this.mantaWings.setColorAt(index * 2, colour);
      this.composePart(index * 2 + 1, this.mantaWings, parent, 0, 0, 0, -1, 1, 1, 0, -flap, 0.02);
      this.mantaWings.setColorAt(index * 2 + 1, colour);
      this.composePart(index * 2, this.mantaLobes, parent, -0.16, 0.58, 0.07, 1, 1, 0.82, 0, 0, -0.18);
      this.mantaLobes.setColorAt(index * 2, colour);
      this.composePart(index * 2 + 1, this.mantaLobes, parent, 0.16, 0.58, 0.07, 1, 1, 0.82, 0, 0, 0.18);
      this.mantaLobes.setColorAt(index * 2 + 1, colour);
      this.composePart(index, this.mantaTails, parent, 0, -1.03, 0, 1, 1, 1, 0, 0, Math.PI);
      this.mantaTails.setColorAt(index, colour);

      for (let eye = 0; eye < 2; eye += 1) {
        const side = eye === 0 ? -1 : 1;
        this.composePart(index * 2 + eye, this.mantaEyes, parent, side * 0.25, 0.42, 0.16, 0.045, 0.052, 0.028);
        this.mantaEyes.setColorAt(index * 2 + eye, this.dormant);
      }
      for (let mark = 0; mark < 5; mark += 1) {
        const side = mark % 2 === 0 ? -1 : 1;
        const rank = Math.floor(mark / 2);
        this.composePart(index * 5 + mark, this.mantaMarks, parent, side * (0.38 + rank * 0.18), 0.28 - rank * 0.2, 0.105, 0.035 + rank * 0.007, 0.055 + rank * 0.006, 0.018);
        this.mantaMarks.setColorAt(index * 5 + mark, this.stageIndex === 2 ? this.rose : this.cyan);
      }
    }

    for (const mesh of [this.mantaBodies, this.mantaWings, this.mantaLobes, this.mantaTails, this.mantaEyes, this.mantaMarks]) {
      mesh.instanceMatrix.needsUpdate = true;
      if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    }
    this.mantaBodies.count = WITNESSES;
    this.mantaWings.count = MANTA_WINGS;
    this.mantaLobes.count = MANTA_LOBES;
    this.mantaTails.count = WITNESSES;
    this.mantaEyes.count = MANTA_EYES;
    this.mantaMarks.count = MANTA_MARKS;

    let wakeIndex = 0;
    for (let index = 0; index < WITNESSES; index += 1) {
      const p = this.mantaPositions[index]!;
      const pearls = this.stageIndex === 1 ? 4 : 3;
      for (let pearl = 0; pearl < pearls; pearl += 1) {
        const distance = 0.7 + pearl * 0.55;
        const drift = reducedMotion ? (pearl % 2 ? 0.06 : -0.06) :
          Math.sin(time * 1.1 + index * 1.7 + pearl * 1.4) * 0.13;
        const size = 0.13 - pearl * 0.014;
        this.compose(wakeIndex, this.mantaWakePearls, p.x + drift, p.y - 0.08 - pearl * 0.025, p.z + distance, size, size, size);
        this.mantaWakePearls.setColorAt(wakeIndex, this.stageIndex === 2 ? this.rose : index % 2 === 0 ? this.cyan : this.gold);
        wakeIndex += 1;
      }
    }
    this.mantaWakePearls.count = wakeIndex;
    this.mantaWakePearls.instanceMatrix.needsUpdate = true;
    if (this.mantaWakePearls.instanceColor) this.mantaWakePearls.instanceColor.needsUpdate = true;
  }

  private updatePollen(forward: number, time: number, status: Readonly<EclipseCourtRunStatus> | null): void {
    const first = Math.floor((forward - 8) / 11.5);
    const age = time - (status?.lastAlignmentSec ?? Number.NEGATIVE_INFINITY);
    const burst = age >= 0 && age < 1.1 ? Math.sin(age / 1.1 * Math.PI) : 0;
    for (let index = 0; index < POLLEN_INSTANCES; index += 1) {
      const row = index % 112;
      const phase = index * 2.399963;
      const side = index % 2 === 0 ? -1 : 1;
      const nearRoute = index % 7 === 0;
      const xBase = nearRoute ? 2.8 + (index % 5) * 0.45 : 5.2 + (index % 11) * 0.68;
      const size = (0.22 + (index % 4) * 0.055) * (1 + burst * 1.15);
      this.compose(index, this.pollen, side * xBase + Math.sin(phase + time * 0.18) * 0.48, 0.25 + (index % 17) * 0.52 + Math.cos(phase + time * 0.27) * 0.22, -(first + row) * 8.6 - (index >= 112 ? 4.3 : 0), size, size, size, time * 0.08, phase, 0);
      this.pollen.setColorAt(index, index % 13 === 0 ? this.gold : index % 7 === 0 ? this.rose : this.cyan);
    }
    this.pollen.count = POLLEN_INSTANCES;
    this.pollen.instanceMatrix.needsUpdate = true;
    if (this.pollen.instanceColor) this.pollen.instanceColor.needsUpdate = true;
  }

  additionalDrawCalls(): 50 { return ECLIPSE_COURT_DRAW_CALLS; }
  triangleBudget(): number { return ECLIPSE_COURT_TRIANGLES; }
  additionalMaterials(): 11 { return ECLIPSE_COURT_MATERIALS; }

  dispose(): void {
    for (const geometry of new Set<THREE.BufferGeometry>([
      this.buttressGeo, this.weaveGateGeo, this.verdictGateGeo,
      this.tissueGeo, this.petalGeo, this.mantaWingGeo,
      this.mantaBodyGeo, this.mantaLobeGeo, this.mantaTailGeo, this.eyeGeo,
      this.markGeo, this.thornGeo, this.shellTowerGeo, this.reefBoulderGeo,
      this.coralFanGeo, this.moonGrassGeo, this.schoolFishGeo,
      this.floorGeo, this.rimGeo, this.pearlGeo, this.cupGeo, this.pollenGeo,
      this.discGeo, this.coronaGeo, this.currentGeo,
      this.shaftGeo, this.haloArchGeo, this.weaveAtollGeo,
      this.weaveBeaconGeo, this.verdictTerraceGeo,
      this.regentBodyGeo, this.regentHeadGeo,
    ])) geometry.dispose();
    for (const material of [
      this.shellMaterial, this.tissueMaterial, this.glowMaterial,
      this.mantaMaterial, this.mantaDetailMaterial, this.eclipseMaterial,
      this.heartMaterial, this.regentMaterial, this.seabedMaterial,
      this.currentMaterial, this.volumeMaterial,
    ]) material.dispose();
    this.nacreTexture.dispose();
    this.mantaTexture.dispose();
    this.siltTexture.dispose();
    this.detailTexture.dispose();
    this.group.removeFromParent();
  }
}
