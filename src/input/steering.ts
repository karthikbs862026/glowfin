/**
 * Steering input (Part 2.1).
 *
 * Split deliberately into two layers:
 *
 *   SteeringSource  — pure logic over abstract pointer events. No DOM. Fully
 *                     testable headlessly with synthetic input, which is what
 *                     Part 6.4's edge-case suite needs.
 *   attachPointerInput — thin browser adapter translating DOM PointerEvents
 *                     into abstract ones.
 *
 * Steering is *relative drag from an anchor*, not absolute finger position.
 * Absolute steering forces the player's thumb to sit where the creature is,
 * which occludes the thing they're trying to read and makes the lane edges
 * awkward to reach one-handed. Relative drag can be initiated anywhere on
 * screen and keeps the creature visible.
 *
 * IMPORTANT: this layer produces an unsmoothed *target*. Smoothing is applied
 * inside the fixed-timestep sim step, not here. Smoothing on the browser event
 * stream would make feel depend on pointer event rate, which differs across
 * devices — a determinism and fairness bug (Part 1.3).
 */

export type PointerEventKind = "down" | "move" | "up" | "cancel";

export interface AbstractPointerEvent {
  kind: PointerEventKind;
  pointerId: number;
  /** Pointer X normalized to 0..1 across the viewport width. */
  normalizedX: number;
}

export interface SteeringOptions {
  /** Fraction of viewport width dragged for full deflection. */
  dragRangeFraction: number;
  sensitivity: number;
  /** Deflection magnitudes below this read as zero. */
  deadZone: number;
}

export class SteeringSource {
  private activePointerId: number | null = null;
  private anchorX = 0;
  private target = 0;

  constructor(private readonly options: SteeringOptions) {}

  /** Current steering target, normalized to -1..1. Unsmoothed. */
  getTarget(): number {
    return this.target;
  }

  /** True while a finger is actively steering. */
  isEngaged(): boolean {
    return this.activePointerId !== null;
  }

  handle(event: AbstractPointerEvent): void {
    switch (event.kind) {
      case "down":
        // Part 2.1: ignore extra fingers cleanly. First finger down owns
        // steering until it lifts; later fingers are dropped without
        // disturbing the anchor, so a second touch cannot jolt the creature.
        if (this.activePointerId !== null) return;
        this.activePointerId = event.pointerId;
        this.anchorX = event.normalizedX;
        this.target = 0;
        return;

      case "move":
        if (event.pointerId !== this.activePointerId) return;
        this.target = this.computeTarget(event.normalizedX);
        return;

      case "up":
      case "cancel":
        // "cancel" covers gesture interruption (system swipe, incoming call).
        if (event.pointerId !== this.activePointerId) return;
        this.activePointerId = null;
        this.target = 0;
        return;
    }
  }

  /**
   * Drop all input state. Call on app backgrounding: the finger that was down
   * before the interruption is not down any more, and resuming with a stale
   * anchor would send the creature sideways on the first frame back.
   */
  reset(): void {
    this.activePointerId = null;
    this.anchorX = 0;
    this.target = 0;
  }

  private computeTarget(normalizedX: number): number {
    const { dragRangeFraction, sensitivity, deadZone } = this.options;
    const raw = ((normalizedX - this.anchorX) / dragRangeFraction) * sensitivity;
    const clamped = Math.max(-1, Math.min(1, raw));
    const magnitude = Math.abs(clamped);
    if (magnitude < deadZone) return 0;
    // Rescale past the dead zone so there is no jump at the threshold.
    const rescaled = (magnitude - deadZone) / (1 - deadZone);
    return Math.sign(clamped) * rescaled;
  }
}

/**
 * Wire a SteeringSource to a canvas. Returns a detach function.
 *
 * Sets `touch-action: none` so the browser does not steal the drag as a
 * scroll/zoom gesture (Part 2.1), and resets on visibility change so
 * backgrounding mid-run cannot resume with a stale anchor.
 */
export function attachPointerInput(
  canvas: HTMLCanvasElement,
  source: SteeringSource
): () => void {
  canvas.style.touchAction = "none";

  const toAbstract = (
    kind: PointerEventKind,
    event: PointerEvent
  ): AbstractPointerEvent => ({
    kind,
    pointerId: event.pointerId,
    normalizedX: event.clientX / Math.max(1, window.innerWidth)
  });

  const onDown = (e: PointerEvent) => {
    // Capture so a finger that slides off the canvas keeps steering rather
    // than silently stopping mid-gesture.
    canvas.setPointerCapture?.(e.pointerId);
    source.handle(toAbstract("down", e));
  };
  const onMove = (e: PointerEvent) => source.handle(toAbstract("move", e));
  const onUp = (e: PointerEvent) => source.handle(toAbstract("up", e));
  const onCancel = (e: PointerEvent) => source.handle(toAbstract("cancel", e));
  const onVisibility = () => {
    if (document.hidden) source.reset();
  };

  canvas.addEventListener("pointerdown", onDown);
  canvas.addEventListener("pointermove", onMove);
  canvas.addEventListener("pointerup", onUp);
  canvas.addEventListener("pointercancel", onCancel);
  document.addEventListener("visibilitychange", onVisibility);

  return () => {
    canvas.removeEventListener("pointerdown", onDown);
    canvas.removeEventListener("pointermove", onMove);
    canvas.removeEventListener("pointerup", onUp);
    canvas.removeEventListener("pointercancel", onCancel);
    document.removeEventListener("visibilitychange", onVisibility);
  };
}
