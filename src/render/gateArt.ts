import * as THREE from "three";
import type { TuningConfig } from "../core/config";
import type { Gate } from "../sim/course";
import {
  gateWallGeometry,
  PROCEDURAL_GATE_VISUAL
} from "../sim/gateGeometry";
import {
  createGateFoundationGeometry,
  createWallFragmentGeometry,
  type ArtLod
} from "./moonGardenGeometry";
import { createMoonstoneObstacleMaterial } from "./moonGardenMaterial";

const MAX_GATE_PARTS = 32;

export type GateFacadeVariant = 0 | 1 | 2;

/** Stable fallback for hand-authored/test gates that predate `artVariant`. */
export function gateFacadeVariant(gate: Gate): GateFacadeVariant {
  if (gate.artVariant === 0 || gate.artVariant === 1 || gate.artVariant === 2) {
    return gate.artVariant;
  }
  const bucket = Math.abs(Math.round(gate.distance * 10));
  return (bucket % 3) as GateFacadeVariant;
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

  private readonly lods: Record<
    ArtLod,
    Record<GateFacadeVariant, LodMeshes>
  >;
  private readonly foundations: THREE.InstancedMesh;
  private readonly contours: THREE.InstancedMesh;
  private readonly matrix = new THREE.Matrix4();
  private readonly position = new THREE.Vector3();
  private readonly quaternion = new THREE.Quaternion();
  private readonly scale = new THREE.Vector3();
  private readonly disposables: Array<{ dispose(): void }> = [];

  constructor(
    private readonly cfg: TuningConfig,
    surfaceMap: THREE.Texture = new THREE.Texture()
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
      octaves: 3,
      surfaceMap
    });

    const createSide = (
      lod: ArtLod,
      gapDirection: 1 | -1,
      variant: GateFacadeVariant
    ) => {
      const geometry = createWallFragmentGeometry(lod, gapDirection, variant);
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

    const createVariant = (
      lod: ArtLod,
      variant: GateFacadeVariant
    ): LodMeshes => ({
      left: createSide(lod, 1, variant),
      right: createSide(lod, -1, variant)
    });
    this.lods = {
      0: {
        0: createVariant(0, 0),
        1: createVariant(0, 1),
        2: createVariant(0, 2)
      },
      1: {
        0: createVariant(1, 0),
        1: createVariant(1, 1),
        2: createVariant(1, 2)
      },
      2: {
        0: createVariant(2, 0),
        1: createVariant(2, 1),
        2: createVariant(2, 2)
      }
    };

    const foundationGeometry = createGateFoundationGeometry(0);
    this.foundations = new THREE.InstancedMesh(
      foundationGeometry,
      this.material,
      MAX_GATE_PARTS
    );
    this.foundations.count = 0;
    this.foundations.frustumCulled = false;
    this.foundations.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.foundations.userData["isObstacleContext"] = true;
    this.objects.push(this.foundations);

    const contourGeometry = new THREE.BoxGeometry(1, 1, 1);
    const contourMaterial = new THREE.ShaderMaterial({
      vertexShader: /* glsl */ `
        varying vec3 vLocalPosition;
        void main() {
          vLocalPosition = position;
          vec4 localPosition = vec4(position, 1.0);
          #ifdef USE_INSTANCING
            localPosition = instanceMatrix * localPosition;
          #endif
          gl_Position = projectionMatrix * modelViewMatrix * localPosition;
        }
      `,
      fragmentShader: /* glsl */ `
        precision mediump float;
        varying vec3 vLocalPosition;
        void main() {
          float endFade = smoothstep(-0.5, -0.42, vLocalPosition.y) *
            (1.0 - smoothstep(0.42, 0.5, vLocalPosition.y));
          float waterFlow = 0.94 + 0.06 *
            sin(vLocalPosition.y * 31.0 + vLocalPosition.z * 4.0);
          vec3 deepCyan = vec3(0.18, 0.88, 1.0);
          vec3 moonCyan = vec3(0.44, 0.98, 1.0);
          gl_FragColor = vec4(mix(deepCyan, moonCyan, endFade) * waterFlow, 1.0);
        }
      `,
      toneMapped: false
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
      foundationGeometry,
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
    const counts: Record<
      ArtLod,
      Record<GateFacadeVariant, { left: number; right: number }>
    > = {
      0: {
        0: { left: 0, right: 0 },
        1: { left: 0, right: 0 },
        2: { left: 0, right: 0 }
      },
      1: {
        0: { left: 0, right: 0 },
        1: { left: 0, right: 0 },
        2: { left: 0, right: 0 }
      },
      2: {
        0: { left: 0, right: 0 },
        1: { left: 0, right: 0 },
        2: { left: 0, right: 0 }
      }
    };
    let foundationCount = 0;
    let contourCount = 0;
    const near = forwardDistance - 25;
    const far = forwardDistance + this.cfg.readability.visibleAheadUnits * 1.6;

    for (const gate of gates) {
      if (gate.distance < near) continue;
      if (gate.distance > far) break;
      const distanceAhead = gate.distance - forwardDistance;
      const lod = lodForDistance(distanceAhead);
      const artVariant = gateFacadeVariant(gate);
      const walls = gateWallGeometry(gate, this.cfg.lane.halfWidth);
      for (const wall of walls) {
        if (wall.width <= 0.01 || contourCount >= MAX_GATE_PARTS) continue;
        const side = wall.side;
        const target = this.lods[lod][artVariant][side];
        const index = counts[lod][artVariant][side];
        if (index >= MAX_GATE_PARTS) continue;

        const wallHeight = PROCEDURAL_GATE_VISUAL.wallHeight *
          ([1, 0.88, 1.08][artVariant] ?? 1);
        const wallDepth = PROCEDURAL_GATE_VISUAL.wallDepth *
          ([1.08, 0.9, 1][artVariant] ?? 1);
        this.position.set(
          wall.centreX,
          PROCEDURAL_GATE_VISUAL.wallFloorY + wallHeight / 2,
          -gate.distance
        );
        this.quaternion.identity();
        this.scale.set(
          wall.width,
          wallHeight,
          wallDepth
        );
        this.matrix.compose(this.position, this.quaternion, this.scale);
        target.setMatrixAt(index, this.matrix);
        counts[lod][artVariant][side] += 1;

        // A shared bed of rubble sits beneath the same volumetric masonry.
        // Its inner edge retreats slightly into the wall so no stone implies
        // usable clearance beyond the authoritative opening.
        const foundationWidth = wall.width * 0.94;
        this.position.set(
          wall.colliderPlane - wall.gapDirection * wall.width * 0.5,
          PROCEDURAL_GATE_VISUAL.wallFloorY,
          -gate.distance + 0.08
        );
        this.scale.set(
          foundationWidth,
          [1.1, 0.92, 1.22][artVariant] ?? 1,
          PROCEDURAL_GATE_VISUAL.wallDepth * 1.18
        );
        this.matrix.compose(this.position, this.quaternion, this.scale);
        this.foundations.setMatrixAt(foundationCount, this.matrix);
        foundationCount += 1;

        // The luminous strip retreats into the collidable wall instead of
        // protruding into the safe gap. Its outer plane is exactly colliderPlane.
        const contourWidth = contourWorldWidth(
          this.cfg.visual.obstacleEdgeWidthPixels,
          camera.position.z + gate.distance,
          camera.fov,
          viewportHeightCss
        );
        // The luminous water core emerges from the masonry foundation instead
        // of continuing through the seabed. The lower dark channel and rubble
        // still carry the wall to the floor, while the measured cyan cue starts
        // at Glowfin's body height where lateral clearance is actually judged.
        const contourTop =
          PROCEDURAL_GATE_VISUAL.wallFloorY + wallHeight * 0.9 + 0.12;
        const contourBottom = PROCEDURAL_GATE_VISUAL.wallFloorY + 1.15;
        const contourHeight = Math.max(0.5, contourTop - contourBottom);
        this.position.set(
          wall.colliderPlane - wall.gapDirection * contourWidth * 0.5,
          contourBottom + contourHeight * 0.5,
          -gate.distance + wallDepth * 0.5 + 0.035
        );
        this.scale.set(
          contourWidth,
          contourHeight,
          0.04
        );
        this.matrix.compose(this.position, this.quaternion, this.scale);
        this.contours.setMatrixAt(contourCount, this.matrix);
        contourCount += 1;
      }
    }

    for (const lod of [0, 1, 2] as const) {
      for (const variant of [0, 1, 2] as const) {
        for (const side of ["left", "right"] as const) {
          const mesh = this.lods[lod][variant][side];
          mesh.count = counts[lod][variant][side];
          mesh.instanceMatrix.needsUpdate = true;
        }
      }
    }
    this.foundations.count = foundationCount;
    this.foundations.instanceMatrix.needsUpdate = true;
    this.contours.count = contourCount;
    this.contours.instanceMatrix.needsUpdate = true;
  }

  dispose(): void {
    for (const item of this.disposables) item.dispose();
  }
}
