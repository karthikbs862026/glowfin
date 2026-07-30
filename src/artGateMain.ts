/**
 * Development-only entry point served by art-gate.html.
 *
 * It is intentionally not referenced by index.html, so Vite's production build
 * does not ship the capture harness or its structured evidence endpoint.
 */

import { tuning } from "./core/config";
import { GameView } from "./render/gameView";
import { runArtGateCapture } from "./render/artGateCapture";

const canvas = document.querySelector<HTMLCanvasElement>("#glowfin-canvas");
if (!canvas) throw new Error("Canvas #glowfin-canvas not found");

const parameters = new URLSearchParams(window.location.search);
const rawTier = parameters.get("tier");
if (rawTier !== "fast" && rawTier !== "full") {
  throw new Error('art-gate.html requires "?tier=fast" or "?tier=full".');
}
const tier: "fast" | "full" = rawTier;
const device = parameters.get("device") ?? "ci-chromium";
const view = new GameView(canvas, tuning);

async function capture(): Promise<void> {
  await view.ready;
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
