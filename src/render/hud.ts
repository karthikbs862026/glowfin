/**
 * DOM overlay HUD.
 *
 * Deliberately DOM rather than in-scene text: zero extra draw calls, crisp at
 * any pixel ratio, and it keeps the WebGL budget for the things that actually
 * need it (Part 4.6).
 *
 * MOMENTUM METER — added because the test said to.
 *
 * Part 3.1 proposes creature eye hue as a diegetic momentum indicator and
 * explicitly says to test whether it is legible enough to replace a HUD meter
 * rather than assume it. Tested on device: it is not, because the chase camera
 * only ever shows the creature from behind and the eyes were on its face.
 *
 * The eyes have since been repositioned to be visible, but Part 3.1's
 * instruction for that outcome is unambiguous — add a minimal HUD element
 * rather than compromise readability for aesthetic purity. So both exist, and
 * the meter's hue tracks the same calm-to-hot mapping as the eyes, so the HUD
 * reinforces the diegetic read instead of competing with it.
 */
import { eyeHueForEnergy } from "./creature";

export class Hud {
  private readonly score: HTMLElement;
  private readonly multiplier: HTMLElement;
  private readonly lightBar: HTMLElement;
  private readonly momentumBar: HTMLElement;
  private readonly gameOver: HTMLElement;
  private readonly finalScore: HTMLElement;
  private readonly finalDetail: HTMLElement;

  constructor(root: Document = document) {
    this.score = Hud.require(root, "hud-score");
    this.multiplier = Hud.require(root, "hud-multiplier");
    this.lightBar = Hud.require(root, "hud-light-fill");
    this.momentumBar = Hud.require(root, "hud-momentum-fill");
    this.gameOver = Hud.require(root, "hud-gameover");
    this.finalScore = Hud.require(root, "hud-final-score");
    this.finalDetail = Hud.require(root, "hud-final-detail");
  }

  private static require(root: Document, id: string): HTMLElement {
    const element = root.getElementById(id);
    if (!element) throw new Error(`Hud: missing required element #${id}`);
    return element;
  }

  update(
    score: number,
    multiplier: number,
    lightFraction: number,
    momentumFraction: number,
    eyeHueCalm: number,
    eyeHueCruise: number,
    eyeHueFast: number,
    eyeHueMax: number
  ): void {
    this.score.textContent = Math.floor(score).toLocaleString();
    this.multiplier.textContent = `x${multiplier.toFixed(1)}`;
    const pct = Math.max(0, Math.min(1, lightFraction)) * 100;
    this.lightBar.style.width = `${pct.toFixed(1)}%`;
    // Warn as the resource runs down — this is the run-end signal.
    this.lightBar.style.background =
      pct < 35 ? "linear-gradient(90deg,#ff5b7f,#ffb36b)" : "linear-gradient(90deg,#35d0ff,#8a7bff)";

    // Momentum meter, hue-matched to the creature's eyes so the two readouts
    // agree rather than compete.
    const momentum = Math.max(0, Math.min(1, momentumFraction));
    const hueDegrees = eyeHueForEnergy(
      momentum,
      eyeHueCalm,
      eyeHueCruise,
      eyeHueFast,
      eyeHueMax
    ) * 360;
    this.momentumBar.style.width = `${(momentum * 100).toFixed(1)}%`;
    this.momentumBar.style.background = `hsl(${hueDegrees.toFixed(0)}, 90%, 62%)`;
  }

  showGameOver(score: number, seconds: number, nearMisses: number, collisions: number): void {
    this.finalScore.textContent = Math.floor(score).toLocaleString();
    this.finalDetail.textContent =
      `${seconds.toFixed(0)}s · ${nearMisses} near-miss · ${collisions} hits`;
    this.gameOver.style.display = "flex";
  }

  hideGameOver(): void {
    this.gameOver.style.display = "none";
  }
}
