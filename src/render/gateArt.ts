import * as THREE from "three";
import type { TuningConfig } from "../core/config";
import type { Gate } from "../sim/course";
import {
  gateWallGeometry,
  PROCEDURAL_GATE_VISUAL
} from "../sim/gateGeometry";
import {
  createWallFragmentGeometry,
  type ArtLod
} from "./moonGardenGeometry";
import { createMoonstoneObstacleMaterial } from "./moonGardenMaterial";

const MAX_GATE_PARTS = 32;

export interface MoonGardenGateTextures {
  wallFragmentAtlas: THREE.Texture;
}

export type GateFacadeVariant = 0 | 1 | 2;

/** Stable fallback for hand-authored/test gates that predate `artVariant`. */
export function gateFacadeVariant(gate: Gate): GateFacadeVariant {
  if (gate.artVariant === 0 || gate.artVariant === 1 || gate.artVariant === 2) {
    return gate.artVariant;
  }
  const bucket = Math.abs(Math.round(gate.distance * 10));
  return (bucket % 3) as GateFacadeVariant;
}

function createAtlasPlane(
  uMin: number,
  uMax: number
): THREE.PlaneGeometry {
  const geometry = new THREE.PlaneGeometry(1, 1);
  const uv = geometry.getAttribute("uv");
  for (let index = 0; index < uv.count; index++) {
    uv.setXY(
      index,
      THREE.MathUtils.lerp(uMin, uMax, uv.getX(index)),
      uv.getY(index)
    );
  }
  uv.needsUpdate = true;
  geometry.translate(0, 0.5, 0);
  return geometry;
}

export function contourWorldWidth(
  screenPixels: number,
  viewDepth: number,
  verticalFovDegrees: number,
  viewportHeightCss: number
): number {
  const safeHeight = Math.max(1, viewportHeightCss);
  const verticalSpan =
    2 * Math.max(1, viewDepth) * Math.tan(THREE.MathUtils.degToRad(verticalFovDegrees * 0.5));
  return screenPixels * verticalSpan / safeHeight;
}

interface LodMeshes {
  left: THREE.InstancedMesh;
  right: THREE.InstancedMesh;
}

function lodForDistance(distanceAhead: number): ArtLod {
  if (distanceAhead < 30) return 0;
  if (distanceAhead < 70) return 1;
  return 2;
}

export class MoonGardenGates {
  readonly objects: THREE.Object3D[] = [];
  readonly material: THREE.ShaderMaterial;
  readonly facadeMaterial: THREE.MeshBasicMaterial;

  private readonly lods: Record<ArtLod, LodMeshes>;
  private readonly facades: readonly [
    THREE.InstancedMesh,
    THREE.InstancedMesh,
    THREE.InstancedMesh
  ];
  private readonly contours: THREE.InstancedMesh;
  private readonly matrix = new THREE.Matrix4();
  private readonly position = new THREE.Vector3();
  private readonly quaternion = new THREE.Quaternion();
  private readonly scale = new THREE.Vector3();
  private readonly disposables: Array<{ dispose(): void }> = [];

  constructor(
    private readonly cfg: TuningConfig,
    textures?: MoonGardenGateTextures
  ) {
    const fogNear = cfg.readability.visibleAheadUnits * cfg.visual.fogNearMultiplier;
    const fogFar = cfg.readability.visibleAheadUnits * cfg.visual.fogFarMultiplier;
    this.material = createMoonstoneObstacleMaterial({
      causticColor: 0x63e0ff,
      scale: cfg.visual.causticScaleWall,
      intensity: cfg.visual.causticIntensityWall,
      sharpness: cfg.visual.causticSharpness,
      fogColor: 0x12364c,
      fogNear,
      fogFar,
      octaves: 3
    });

    const createSide = (lod: ArtLod, gapDirection: 1 | -1) => {
      const geometry = createWallFragmentGeometry(lod, gapDirection);
      const mesh = new THREE.InstancedMesh(
        geometry,
        this.material,
        MAX_GATE_PARTS
      );
      mesh.count = 0;
      mesh.frustumCulled = false;
      mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      // The stone gives the contour visual context. The continuous cyan face
      // below is the deliberate player-facing clearance cue; broken outer
      // silhouettes may sit against other ruins and are not lane boundaries.
      mesh.userData["isObstacleContext"] = true;
      this.objects.push(mesh);
      this.disposables.push(geometry);
      return mesh;
    };

    this.lods = {
      0: {
        left: createSide(0, 1),
        right: createSide(0, -1)
      },
      1: {
        left: createSide(1, 1),
        right: createSide(1, -1)
      },
      2: {
        left: createSide(2, 1),
        right: createSide(2, -1)
      }
    };

    // Authored facade establishes the approved manta/nautilus architecture in
    // the playable frame while the final UV-authored GLB is modeled. Its
    // source image has one perfectly straight inner edge; mirroring happens
    // away from that edge, so it never implies extra clearance.
    this.facadeMaterial = new THREE.MeshBasicMaterial({
      map: textures?.wallFragmentAtlas ?? null,
      color: 0xffffff,
      alphaTest: 0.08,
      side: THREE.DoubleSide,
      depthWrite: false,
      fog: true,
      toneMapped: false,
      polygonOffset: true,
      polygonOffsetFactor: -4,
      polygonOffsetUnits: -4
    });
    const facadeUvColumns = [
      [0, 341 / 1024],
      [341 / 1024, 682 / 1024],
      [682 / 1024, 1]
    ] as const;
    this.facades = facadeUvColumns.map(([uMin, uMax]) => {
      const geometry = createAtlasPlane(uMin, uMax);
      const mesh = new THREE.InstancedMesh(
        geometry,
        this.facadeMaterial,
        MAX_GATE_PARTS
      );
      mesh.count = 0;
      mesh.frustumCulled = false;
      mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      mesh.userData["isObstacleContext"] = true;
      // The mask scores the authoritative cyan contour. Review facades are
      // hidden only in the semantic mask so their camera-facing depth offset
      // cannot occlude the collider-truth sample geometry.
      mesh.userData["hideInArtMask"] = true;
      mesh.renderOrder = 500;
      this.objects.push(mesh);
      this.disposables.push(geometry);
      return mesh;
    }) as unknown as typeof this.facades;

    const contourGeometry = new THREE.BoxGeometry(1, 1, 1);
    const contourMaterial = new THREE.MeshBasicMaterial({
      // Deliberately below the global bloom threshold. This remains a
      // high-contrast pale-cyan edge against moonstone, but no longer washes
      // the adjacent safe-gap pixel into the same luminance on medium quality.
      color: 0x59cde0,
      toneMapped: false,
      // The contour shares the wall's front plane so its projected gap edge
      // remains collider-true. Polygon offset resolves the coplanar surface
      // without moving that edge toward the camera.
      polygonOffset: true,
      polygonOffsetFactor: -8,
      polygonOffsetUnits: -8
    });
    this.contours = new THREE.InstancedMesh(
      contourGeometry,
      contourMaterial,
      MAX_GATE_PARTS
    );
    this.contours.count = 0;
    this.contours.frustumCulled = false;
    this.contours.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.contours.userData["isObstacle"] = true;
    // During the art-gate mask pass this guarantees the authoritative contour
    // is written after contextual ruins. Beauty rendering still uses ordinary
    // depth testing, so the captured image remains the player's actual view.
    this.contours.renderOrder = 1000;
    this.objects.push(this.contours);
    this.disposables.push(
      this.material,
      this.facadeMaterial,
      contourGeometry,
      contourMaterial
    );
  }

  update(
    forwardDistance: number,
    gates: readonly Gate[],
    camera: THREE.PerspectiveCamera,
    viewportHeightCss: number
  ): void {
    const counts: Record<ArtLod, { left: number; right: number }> = {
      0: { left: 0, right: 0 },
      1: { left: 0, right: 0 },
      2: { left: 0, right: 0 }
    };
    const facadeCounts = [0, 0, 0];
    let contourCount = 0;
    const near = forwardDistance - 25;
    const far = forwardDistance + this.cfg.readability.visibleAheadUnits * 1.6;

    for (const gate of gates) {
      if (gate.distance < near) continue;
      if (gate.distance > far) break;
      const distanceAhead = gate.distance - forwardDistance;
      const lod = lodForDistance(distanceAhead);
      const facadeVariant = gateFacadeVariant(gate);
      const walls = gateWallGeometry(gate, this.cfg.lane.halfWidth);
      for (const wall of walls) {
        if (wall.width <= 0.01 || contourCount >= MAX_GATE_PARTS) continue;
        const side = wall.side;
        const target = this.lods[lod][side];
        const index = counts[lod][side];
        if (index >= MAX_GATE_PARTS) continue;

        this.position.set(
          wall.centreX,
          PROCEDURAL_GATE_VISUAL.wallFloorY +
            PROCEDURAL_GATE_VISUAL.wallHeight / 2,
          -gate.distance
        );
        this.quaternion.identity();
        this.scale.set(
          wall.width,
          PROCEDURAL_GATE_VISUAL.wallHeight,
          PROCEDURAL_GATE_VISUAL.wallDepth
        );
        this.matrix.compose(this.position, this.quaternion, this.scale);
        target.setMatrixAt(index, this.matrix);
        counts[lod][side] += 1;

        // Keep the generated facade's straight inner edge on the exact
        // runtime collider plane. The right wall mirrors the image by using a
        // negative x scale; all ornament still retreats into the wall mass.
        const facadeWidthBoost = [1.35, 1.05, 1.2][facadeVariant] ?? 1.1;
        const facadeWidth = Math.max(
          3.2,
          Math.min(5.2, wall.width + facadeWidthBoost)
        );
        const facadeHeight = [9.2, 8.2, 7.6][facadeVariant] ?? 8.2;
        this.position.set(
          wall.colliderPlane - wall.gapDirection * facadeWidth * 0.5,
          PROCEDURAL_GATE_VISUAL.wallFloorY,
          // Sit safely in front of the generated wall skin. The inner x edge
          // remains collider-aligned; this z-only offset retreats the
          // projected facade outward from the safe opening.
          -gate.distance + PROCEDURAL_GATE_VISUAL.wallDepth * 0.5 + 0.15
        );
        this.scale.set(
          wall.gapDirection > 0 ? facadeWidth : -facadeWidth,
          facadeHeight,
          1
        );
        this.matrix.compose(this.position, this.quaternion, this.scale);
        const facade = this.facades[facadeVariant];
        const facadeIndex = facadeCounts[facadeVariant] ?? 0;
        facade.setMatrixAt(facadeIndex, this.matrix);
        facadeCounts[facadeVariant] = facadeIndex + 1;

        // The luminous strip retreats into the collidable wall instead of
        // protruding into the safe gap. Its outer plane is exactly colliderPlane.
        const contourWidth = contourWorldWidth(
          this.cfg.visual.obstacleEdgeWidthPixels,
          camera.position.z + gate.distance,
          camera.fov,
          viewportHeightCss
        );
        this.position.set(
          wall.colliderPlane - wall.gapDirection * contourWidth * 0.5,
          PROCEDURAL_GATE_VISUAL.wallFloorY +
            PROCEDURAL_GATE_VISUAL.wallHeight / 2,
          -gate.distance
        );
        this.scale.set(
          contourWidth,
          PROCEDURAL_GATE_VISUAL.wallHeight,
          PROCEDURAL_GATE_VISUAL.wallDepth
        );
        this.matrix.compose(this.position, this.quaternion, this.scale);
        this.contours.setMatrixAt(contourCount, this.matrix);
        contourCount += 1;
      }
    }

    for (const lod of [0, 1, 2] as const) {
      for (const side of ["left", "right"] as const) {
        const mesh = this.lods[lod][side];
        mesh.count = counts[lod][side];
        mesh.instanceMatrix.needsUpdate = true;
      }
    }
    for (let variant = 0; variant < this.facades.length; variant++) {
      const facade = this.facades[variant];
      if (!facade) continue;
      facade.count = facadeCounts[variant] ?? 0;
      facade.instanceMatrix.needsUpdate = true;
    }
    this.contours.count = contourCount;
    this.contours.instanceMatrix.needsUpdate = true;
  }

  dispose(): void {
    for (const item of this.disposables) item.dispose();
  }
}
