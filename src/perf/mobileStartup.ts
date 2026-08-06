/**
 * Chooses a conservative first-frame render tier for touch-first and narrow
 * screens. Starting cheaply matters on mobile: a device that cannot finish the
 * high-tier sampling window can never ask the adaptive controller to step down.
 */
import type { QualityTier } from "./quality";

export interface StartupSurface {
  coarsePointer: boolean;
  viewportWidth: number;
  viewportHeight: number;
}

const NARROW_VIEWPORT_PX = 820;

export function shouldStartMobileSafe(surface: StartupSurface): boolean {
  return surface.coarsePointer ||
    Math.min(surface.viewportWidth, surface.viewportHeight) <= NARROW_VIEWPORT_PX;
}

export function initialMobileQualityTier(surface: StartupSurface): QualityTier {
  return shouldStartMobileSafe(surface) ? "low" : "high";
}

export function initialRendererPixelRatioCap(coarsePointer: boolean): 1 | 2 {
  return coarsePointer ? 1 : 2;
}
