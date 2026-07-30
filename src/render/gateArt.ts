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

  private readonly lods: Record<ArtLod, LodMeshes>;
  private readonly contours: THREE.InstancedMesh;
  private readonly matrix = new THREE.Matrix4();
  private readonly position = new THREE.Vector3();
  private readonly quaternion = new THREE.Quaternion();
  private readonly scale = new THREE.Vector3();
  private readonly disposables: Array<{ dispose(): void }> = [];

  constructor(private readonly cfg: TuningConfig) {
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

    const contourGeometry = new THREE.BoxGeometry(1, 1, 1);
    const contourMaterial = new THREE.MeshBasicMaterial({
      color: 0xbdf4ff,
      toneMapped: false,
      // The contour shares the wall's front plane so its projected gap edge
      // remains collider-true. Polygon offset resolves the coplanar surface
      // without moving that edge toward the camera.
      polygonOffset: true,
      polygonOffsetFactor: -2,
      polygonOffsetUnits: -2
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
    let contourCount = 0;
    const near = forwardDistance - 25;
    const far = forwardDistance + this.cfg.readability.visibleAheadUnits * 1.6;

    for (const gate of gates) {
      if (gate.distance < near) continue;
      if (gate.distance > far) break;
      const distanceAhead = gate.distance - forwardDistance;
      const lod = lodForDistance(distanceAhead);
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
    this.contours.count = contourCount;
    this.contours.instanceMatrix.needsUpdate = true;
  }

  dispose(): void {
    for (const item of this.disposables) item.dispose();
  }
}
