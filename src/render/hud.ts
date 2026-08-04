/**
 * DOM overlay HUD. Meta-progression stays in DOM so cosmetics and retention UI
 * consume zero WebGL draws/materials and remain crisp on portrait phones.
 */
import { eyeHueForEnergy } from "./creature";
import type { TelemetryConsent } from "../persistence/progress";
import type { CosmeticCategory } from "../meta/progression";
import type { StreakSummary } from "../meta/daily";
import type {
  LeaderboardEntryV1,
  LeaderboardSnapshotV1
} from "../competitive/leaderboard";
import type {
  AccessPreferencesV2,
  LeaderboardDivision,
  MotorAssistMode
} from "../competitive/assists";

export interface HudObjectivePresentation {
  id: string;
  label: string;
  progress: number;
  target: number;
  completed: boolean;
}
export interface HudMetaPresentation {
  lumenPearls: number;
  tideLevel: number;
  tideXpIntoLevel: number;
  tideXpForNextLevel: number;
  tideFraction: number;
  cosmeticNames: Record<CosmeticCategory, string>;
}

export interface RunEndPresentation extends HudMetaPresentation {
  bestScore: number;
  newBest: boolean;
  raceGhostScore: number | null;
  raceGhostLabel: string;
  rewardPearls: number;
  unlockedNames: string[];
  objectives: HudObjectivePresentation[];
  streak: StreakSummary;
  dailyDayId: string;
  dailyCompleted: boolean;
  calendarRewardRejected: boolean;
  leaderboardDivision: LeaderboardDivision;
}

export class Hud {
  private readonly score: HTMLElement;
  private readonly multiplier: HTMLElement;
  private readonly best: HTMLElement;
  private readonly ghostGap: HTMLElement;
  private readonly lightBar: HTMLElement;
  private readonly momentumBar: HTMLElement;
  private readonly pearlCount: HTMLElement;
  private readonly tideLevel: HTMLElement;
  private readonly gameOver: HTMLElement;
  private readonly finalScore: HTMLElement;
  private readonly finalDetail: HTMLElement;
  private readonly newBest: HTMLElement;
  private readonly runReward: HTMLElement;
  private readonly tideProgressFill: HTMLElement;
  private readonly tideProgressLabel: HTMLElement;
  private readonly unlockBanner: HTMLElement;
  private readonly objectiveList: HTMLElement;
  private readonly streak: HTMLElement;
  private readonly competitiveDivision: HTMLElement;
  private readonly leaderboardStatus: HTMLElement;
  private readonly leaderboardList: HTMLElement;
  private readonly raceBest: HTMLButtonElement;
  private readonly dailyTrial: HTMLButtonElement;
  private readonly submitScore: HTMLButtonElement;
  private readonly shareClip: HTMLButtonElement;
  private readonly motorAssist: HTMLButtonElement;
  private readonly reducedMotion: HTMLButtonElement;
  private readonly highContrast: HTMLButtonElement;
  private readonly rewardedPearls: HTMLButtonElement;
  private readonly telemetryChoice: HTMLButtonElement;
  private readonly wardrobe = new Map<CosmeticCategory, HTMLButtonElement>();

  constructor(root: Document = document) {
    this.score = Hud.require(root, "hud-score");
    this.multiplier = Hud.require(root, "hud-multiplier");
    this.best = Hud.require(root, "hud-best");
    this.ghostGap = Hud.require(root, "hud-ghost-gap");
    this.lightBar = Hud.require(root, "hud-light-fill");
    this.momentumBar = Hud.require(root, "hud-momentum-fill");
    this.pearlCount = Hud.require(root, "hud-pearls");
    this.tideLevel = Hud.require(root, "hud-tide-level");
    this.gameOver = Hud.require(root, "hud-gameover");
    this.finalScore = Hud.require(root, "hud-final-score");
    this.finalDetail = Hud.require(root, "hud-final-detail");
    this.newBest = Hud.require(root, "hud-new-best");
    this.runReward = Hud.require(root, "hud-run-reward");
    this.tideProgressFill = Hud.require(root, "hud-tide-progress-fill");
    this.tideProgressLabel = Hud.require(root, "hud-tide-progress-label");
    this.unlockBanner = Hud.require(root, "hud-unlock-banner");
    this.objectiveList = Hud.require(root, "hud-objectives");
    this.streak = Hud.require(root, "hud-streak");
    this.competitiveDivision = Hud.require(root, "hud-competitive-division");
    this.leaderboardStatus = Hud.require(root, "hud-leaderboard-status");
    this.leaderboardList = Hud.require(root, "hud-leaderboard-list");
    this.raceBest = Hud.requireButton(root, "hud-race-best");
    this.dailyTrial = Hud.requireButton(root, "hud-daily-trial");
    this.submitScore = Hud.requireButton(root, "hud-submit-score");
    this.shareClip = Hud.requireButton(root, "hud-share-clip");
    this.motorAssist = Hud.requireButton(root, "hud-motor-assist");
    this.reducedMotion = Hud.requireButton(root, "hud-reduced-motion");
    this.highContrast = Hud.requireButton(root, "hud-high-contrast");
    this.rewardedPearls = Hud.requireButton(root, "hud-rewarded-pearls");
    this.telemetryChoice = Hud.requireButton(root, "hud-telemetry-choice");
    for (const category of ["glow", "fin", "trail", "aura"] as const) {
      this.wardrobe.set(category, Hud.requireButton(root, `hud-cosmetic-${category}`));
    }
  }

  private static require(root: Document, id: string): HTMLElement {
    const element = root.getElementById(id);
    if (!element) throw new Error(`Hud: missing required element #${id}`);
    return element;
  }

  private static requireButton(root: Document, id: string): HTMLButtonElement {
    const element = root.getElementById(id);
    if (!(element instanceof HTMLButtonElement)) {
      throw new Error(`Hud: missing required button #${id}`);
    }
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
    this.lightBar.style.background = pct < 35
      ? "linear-gradient(90deg,#ff5b7f,#ffb36b)"
      : "linear-gradient(90deg,#35d0ff,#8a7bff)";

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

  setBestScore(score: number): void {
    this.best.textContent = `Best ${Math.floor(score).toLocaleString()}`;
  }

  setMeta(meta: HudMetaPresentation): void {
    this.pearlCount.textContent = `◇ ${meta.lumenPearls.toLocaleString()}`;
    this.tideLevel.textContent = `Tide ${meta.tideLevel}`;
    const pct = Math.max(0, Math.min(1, meta.tideFraction)) * 100;
    this.tideProgressFill.style.width = `${pct.toFixed(1)}%`;
    this.tideProgressLabel.textContent =
      `Tide ${meta.tideLevel} · ${Math.floor(meta.tideXpIntoLevel)}/${Math.floor(meta.tideXpForNextLevel)} current`;
    const labels: Record<CosmeticCategory, string> = {
      glow: "Glow",
      fin: "Fins",
      trail: "Trail",
      aura: "Aura"
    };
    for (const category of ["glow", "fin", "trail", "aura"] as const) {
      const button = this.wardrobe.get(category);
      if (button) button.textContent = `${labels[category]} · ${meta.cosmeticNames[category]}`;
    }
  }

  updateGhostGap(playerDistance: number, ghostDistance: number): void {
    const gap = playerDistance - ghostDistance;
    const magnitude = Math.abs(gap);
    this.ghostGap.dataset["active"] = "true";
    this.ghostGap.textContent = magnitude < 0.5
      ? "Ghost even"
      : gap > 0
        ? `You +${magnitude.toFixed(0)}m`
        : `Ghost +${magnitude.toFixed(0)}m`;
  }

  hideGhostGap(): void {
    this.ghostGap.dataset["active"] = "false";
  }

  setTelemetryConsent(consent: TelemetryConsent): void {
    this.telemetryChoice.textContent = consent === "granted"
      ? "Anonymous playtest data: On"
      : consent === "denied"
        ? "Anonymous playtest data: Off"
        : "Share anonymous playtest data";
    this.telemetryChoice.setAttribute("aria-pressed", consent === "granted" ? "true" : "false");
  }

  private wireAction(button: HTMLButtonElement, listener: () => void): void {
    button.addEventListener("pointerdown", (event) => event.stopPropagation());
    button.addEventListener("click", (event) => {
      event.stopPropagation();
      listener();
    });
  }

  onRaceBest(listener: () => void): void {
    this.wireAction(this.raceBest, listener);
  }

  onDailyTrial(listener: () => void): void {
    this.wireAction(this.dailyTrial, listener);
  }

  onSubmitScore(listener: () => void): void {
    this.wireAction(this.submitScore, listener);
  }

  onShareClip(listener: () => void): void {
    this.wireAction(this.shareClip, listener);
  }

  onMotorAssistToggle(listener: () => void): void {
    this.wireAction(this.motorAssist, listener);
  }

  onReducedMotionToggle(listener: () => void): void {
    this.wireAction(this.reducedMotion, listener);
  }

  onHighContrastToggle(listener: () => void): void {
    this.wireAction(this.highContrast, listener);
  }

  onRewardedPearls(listener: () => void): void {
    this.wireAction(this.rewardedPearls, listener);
  }

  onCosmeticCycle(category: CosmeticCategory, listener: () => void): void {
    const button = this.wardrobe.get(category);
    if (button) this.wireAction(button, listener);
  }

  onTelemetryChoice(listener: () => void): void {
    this.wireAction(this.telemetryChoice, listener);
  }

  isActionTarget(target: EventTarget | null): boolean {
    return target instanceof Element && Boolean(target.closest("[data-hud-action]"));
  }

  setMotorAssist(mode: MotorAssistMode): void {
    this.motorAssist.textContent = mode === "reduced-travel"
      ? "Steering · Reduced travel (Assisted)"
      : "Steering · Standard division";
    this.motorAssist.setAttribute("aria-pressed", mode === "reduced-travel" ? "true" : "false");
  }

  setPresentationPreferences(
    preferences: Pick<AccessPreferencesV2, "reducedMotion" | "highContrast">
  ): void {
    this.reducedMotion.textContent = preferences.reducedMotion
      ? "Motion effects · Reduced"
      : "Motion effects · Standard";
    this.reducedMotion.setAttribute(
      "aria-pressed",
      preferences.reducedMotion ? "true" : "false"
    );
    this.highContrast.textContent = preferences.highContrast
      ? "Contrast · High"
      : "Contrast · Standard";
    this.highContrast.setAttribute(
      "aria-pressed",
      preferences.highContrast ? "true" : "false"
    );
  }

  setSubmitState(
    state: "ready" | "submitting" | "submitted" | "unavailable" | "rejected",
    rank: number | null = null
  ): void {
    this.submitScore.disabled = state === "unavailable";
    this.submitScore.dataset["state"] = state;
    this.submitScore.textContent = state === "submitting"
      ? "Validating replay…"
      : state === "submitted"
        ? rank ? `Ranked #${rank}` : "Score validated"
        : state === "rejected"
          ? "Replay was not ranked"
          : "Submit verified score";
  }

  setShareState(
    state: "ready" | "publishing" | "shared" | "unavailable" | "failed"
  ): void {
    this.shareClip.disabled = state === "unavailable";
    this.shareClip.dataset["state"] = state;
    this.shareClip.textContent = state === "publishing"
      ? "Creating Moonflash…"
      : state === "shared"
        ? "Moonflash link ready"
        : state === "failed"
          ? "Moonflash unavailable"
          : "Share best Moonflash";
  }

  setRewardedOffer(pearls: number | null, state: "ready" | "showing" | "claimed" | "failed" = "ready"): void {
    const available = pearls !== null && pearls > 0;
    this.rewardedPearls.disabled = !available || state === "claimed";
    this.rewardedPearls.dataset["state"] = state;
    this.rewardedPearls.textContent = state === "showing"
      ? "Opening rewarded video…"
      : state === "claimed"
        ? "Bonus Lumen secured"
        : state === "failed"
          ? "Rewarded video unavailable"
          : available
            ? `Watch · +${pearls} bonus Lumen`
            : "Rewarded video unavailable";
  }

  setLeaderboard(
    snapshot: LeaderboardSnapshotV1 | null,
    status: "loading" | "ready" | "empty" | "offline" = "ready"
  ): void {
    this.leaderboardStatus.textContent = status === "loading"
      ? "Loading verified currents…"
      : status === "offline"
        ? "Verified board unavailable offline"
        : status === "empty"
          ? "No verified currents yet"
          : snapshot
            ? `${snapshot.scope === "daily" ? "Daily" : "Global"} · ${snapshot.division} division`
            : "Verified currents";
    const entries: LeaderboardEntryV1[] = snapshot?.entries ?? [];
    this.leaderboardList.replaceChildren(...entries.map((entry) => {
      const row = document.createElement("div");
      row.className = "hud-leaderboard-row";
      const rank = document.createElement("strong");
      rank.textContent = `#${entry.rank}`;
      const alias = document.createElement("span");
      alias.textContent = entry.alias;
      const score = document.createElement("b");
      score.textContent = Math.floor(entry.score).toLocaleString();
      row.append(rank, alias, score);
      return row;
    }));
  }

  showGameOver(
    score: number,
    seconds: number,
    nearMisses: number,
    collisions: number,
    presentation: RunEndPresentation
  ): void {
    this.finalScore.textContent = Math.floor(score).toLocaleString();
    this.finalDetail.textContent = `${seconds.toFixed(0)}s · ${nearMisses} near-miss · ${collisions} hits`;
    this.setBestScore(presentation.bestScore);
    this.setMeta(presentation);
    this.newBest.dataset["visible"] = presentation.newBest ? "true" : "false";
    this.runReward.textContent = presentation.rewardPearls > 0
      ? `+${presentation.rewardPearls.toLocaleString()} Lumen Pearls`
      : "Rewards already secured";
    this.unlockBanner.dataset["visible"] = presentation.unlockedNames.length > 0 ? "true" : "false";
    this.unlockBanner.textContent = presentation.unlockedNames.length > 0
      ? `Unlocked · ${presentation.unlockedNames.join(" · ")}`
      : "";
    this.objectiveList.replaceChildren(...presentation.objectives.map((objective) => {
      const row = document.createElement("div");
      row.className = "hud-objective";
      row.dataset["complete"] = objective.completed ? "true" : "false";
      const label = document.createElement("span");
      label.textContent = objective.label;
      const value = document.createElement("strong");
      value.textContent = objective.completed
        ? "Complete"
        : `${Math.floor(objective.progress).toLocaleString()}/${Math.floor(objective.target).toLocaleString()}`;
      row.append(label, value);
      return row;
    }));
    const grace = presentation.streak.graceAvailable
      ? "Grace day ready"
      : `Grace protected ${presentation.streak.graceUsedForDay ?? "one missed day"}`;
    this.streak.textContent = `${presentation.streak.current}-day Tide streak · ${grace}`;
    if (presentation.calendarRewardRejected) {
      this.streak.textContent = "Daily rewards paused until the device date is corrected";
    }
    this.raceBest.disabled = presentation.raceGhostScore === null;
    this.raceBest.textContent = presentation.raceGhostScore === null
      ? presentation.raceGhostLabel
      : `${presentation.raceGhostLabel} · ${Math.floor(presentation.raceGhostScore).toLocaleString()}`;
    this.dailyTrial.textContent = presentation.dailyCompleted
      ? `Replay Daily Tide Trial · ${presentation.dailyDayId}`
      : `Daily Tide Trial · ${presentation.dailyDayId}`;
    this.competitiveDivision.textContent = presentation.leaderboardDivision === "assisted"
      ? "Assisted division · replay validated separately"
      : "Standard division · deterministic replay validation";
    this.gameOver.style.display = "flex";
  }

  hideGameOver(): void {
    this.gameOver.style.display = "none";
  }
}
