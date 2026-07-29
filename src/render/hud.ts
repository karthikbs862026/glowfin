/**
 * DOM overlay HUD.
 *
 * Deliberately DOM rather than in-scene text: zero extra draw calls, crisp at
 * any pixel ratio, and it keeps the WebGL budget for the things that actually
 * need it (Part 4.6).
 *
 * Part 3.1 hopes creature eye hue can replace a momentum meter. It probably
 * can't yet — a primitive sphere has no eyes — so momentum is shown numerically
 * for now and the claim gets tested properly in Phase 3.
 */
export class Hud {
  private readonly score: HTMLElement;
  private readonly multiplier: HTMLElement;
  private readonly lightBar: HTMLElement;
  private readonly gameOver: HTMLElement;
  private readonly finalScore: HTMLElement;
  private readonly finalDetail: HTMLElement;

  constructor(root: Document = document) {
    this.score = Hud.require(root, "hud-score");
    this.multiplier = Hud.require(root, "hud-multiplier");
    this.lightBar = Hud.require(root, "hud-light-fill");
    this.gameOver = Hud.require(root, "hud-gameover");
    this.finalScore = Hud.require(root, "hud-final-score");
    this.finalDetail = Hud.require(root, "hud-final-detail");
  }

  private static require(root: Document, id: string): HTMLElement {
    const element = root.getElementById(id);
    if (!element) throw new Error(`Hud: missing required element #${id}`);
    return element;
  }

  update(score: number, multiplier: number, lightFraction: number): void {
    this.score.textContent = Math.floor(score).toLocaleString();
    this.multiplier.textContent = `x${multiplier.toFixed(1)}`;
    const pct = Math.max(0, Math.min(1, lightFraction)) * 100;
    this.lightBar.style.width = `${pct.toFixed(1)}%`;
    // Warn as the resource runs down — this is the run-end signal.
    this.lightBar.style.background =
      pct < 35 ? "linear-gradient(90deg,#ff5b7f,#ffb36b)" : "linear-gradient(90deg,#35d0ff,#8a7bff)";
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
