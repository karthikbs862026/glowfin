/**
 * Development-only entry point served by art-gate.html.
 *
 * It is intentionally not referenced by index.html, so Vite's production build
 * does not ship the capture harness or its structured evidence endpoint.
 */

import { tuning } from "./core/config";
import { GameView } from "./render/gameView";
import {
  browserGraphicsBootSignals,
  selectGraphicsBootProfile,
} from "./render/bootProfile";
import { acquireWebGL2Context } from "./render/graphicsContext";
import { runArtGateCapture } from "./render/artGateCapture";
import {
  RendererSoakHarness,
  type RendererSoakSnapshot
} from "./render/soakHarness";

const canvasElement = document.querySelector<HTMLCanvasElement>("#glowfin-canvas");
if (!canvasElement) throw new Error("Canvas #glowfin-canvas not found");
const canvas: HTMLCanvasElement = canvasElement;

const parameters = new URLSearchParams(window.location.search);
const rawTier = parameters.get("tier");
if (rawTier !== "fast" && rawTier !== "full" && rawTier !== "soak") {
  throw new Error(
    'art-gate.html requires "?tier=fast", "?tier=full" or "?tier=soak".'
  );
}
const requestedTier: "fast" | "full" | "soak" = rawTier;
const device = parameters.get("device") ?? "ci-chromium";
const bootProfile = selectGraphicsBootProfile(browserGraphicsBootSignals());
const graphics = acquireWebGL2Context(canvas, bootProfile);
if (!graphics.context) {
  throw new Error(
    `Art gate requires WebGL2; ${graphics.attempts.join(" · ") || "no context attempts"}`,
  );
}
const view = new GameView(canvas, tuning, bootProfile, graphics.context);

async function capture(): Promise<void> {
  await view.ready;
  const productionAssets = view.productionAssetStatus();
  if (
    productionAssets.glowfin !== "glb" ||
    productionAssets.gate !== "glb" ||
    productionAssets.reef !== "glb"
  ) {
    throw new Error(
      `Art gate requires runtime GLBs; fallback was active: ` +
      `${productionAssets.error ?? "unknown asset error"}`
    );
  }
  if (requestedTier === "soak") {
    const renderFps = Number(parameters.get("renderFps") ?? "30");
    const minutes = Number(parameters.get("minutes") ?? "30");
    const harness = new RendererSoakHarness(
      view,
      tuning,
      renderFps,
      minutes * 60,
      canvas
    );
    (
      window as typeof window & {
        __GLOWFIN_SOAK__?: {
          advance(frameCount: number): RendererSoakSnapshot;
          snapshot(): RendererSoakSnapshot;
        };
      }
    ).__GLOWFIN_SOAK__ = harness;
    document.body.dataset["artGateReady"] = "true";
    console.info("GLOWFIN_SOAK_READY", harness.snapshot());
    return;
  }

  const tier: "fast" | "full" = requestedTier;
  const bundle = runArtGateCapture(view, tuning, tier, device);
  (
    window as typeof window & {
      __GLOWFIN_ART_GATE__?: typeof bundle;
    }
  ).__GLOWFIN_ART_GATE__ = bundle;
  document.body.dataset["artGateReady"] = "true";
  console.info("GLOWFIN_ART_GATE_READY", bundle);
}

void capture();
