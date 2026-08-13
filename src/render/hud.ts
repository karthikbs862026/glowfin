/**
 * DOM overlay HUD. Meta-progression stays in DOM so cosmetics and retention UI
 * consume zero WebGL draws/materials and remain crisp on portrait phones.
 */
import { eyeHueForEnergy } from "./creature";
import type { TelemetryConsent } from "../persistence/progress";
import type { CosmeticCategory } from "../meta/progression";
import type { StreakSummary } from "../meta/daily";
import type { SignatureObstacleVerb } from "../sim/obstacleVariety";
import type { RealmGameplayVerb } from "../realms/definition";
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

export interface SignatureCuePresentation {
  verb: SignatureObstacleVerb | RealmGameplayVerb;
  title: string;
  detail: string;
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
  realmResult?:
    | {
        kind: "kelp-cathedral";
        title: string;
        rescuedManta: boolean;
        relicPageFound: boolean;
        crystalTrenchUnlocked: boolean;
      }
    | {
        kind: "crystal-trench";
        title: string;
        thresholdCrossed: boolean;
        prismPulsesCleared: number;
        platesCleared: number;
        raceWon: boolean;
        raceAttempts: number;
        cleanPerformance: boolean;
      }
    | {
        kind: "duskmaw-pursuit";
        title: string;
        integrated: boolean;
        completed: boolean;
        currentBreaks: number;
        currentBreakTarget: number;
        captures: number;
        cleanPerformance: boolean;
      };
}

export interface ExpeditionEndPresentation {
  completed: boolean;
  seconds: number;
  collisions: number;
  relicsDiscovered: number;
  primaryMark: boolean;
  relicMark: boolean;
  cleanMark: boolean;
  moonWellRestored: boolean;
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
  private readonly finalLabel: HTMLElement;
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
  private readonly diveAgain: HTMLButtonElement;
  private readonly openHub: HTMLButtonElement;
  private readonly raceBest: HTMLButtonElement;
  private readonly dailyTrial: HTMLButtonElement;
  private readonly submitScore: HTMLButtonElement;
  private readonly shareClip: HTMLButtonElement;
  private readonly motorAssist: HTMLButtonElement;
  private readonly reducedMotion: HTMLButtonElement;
  private readonly highContrast: HTMLButtonElement;
  private readonly haptics: HTMLButtonElement;
  private readonly rewardedPearls: HTMLButtonElement;
  private readonly telemetryChoice: HTMLButtonElement;
  private readonly signatureCue: HTMLElement;
  private readonly signatureCueTitle: HTMLElement;
  private readonly signatureCueDetail: HTMLElement;

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
    const finalLabel = this.gameOver.querySelector<HTMLElement>(".label");
    if (!finalLabel) throw new Error("Hud: game-over label is missing");
    this.finalLabel = finalLabel;
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
    this.diveAgain = Hud.requireButton(root, "hud-dive-again");
    this.openHub = Hud.requireButton(root, "hud-open-hub");
    this.raceBest = Hud.requireButton(root, "hud-race-best");
    this.dailyTrial = Hud.requireButton(root, "hud-daily-trial");
    this.submitScore = Hud.requireButton(root, "hud-submit-score");
    this.shareClip = Hud.requireButton(root, "hud-share-clip");
    this.motorAssist = Hud.requireButton(root, "hud-motor-assist");
    this.reducedMotion = Hud.requireButton(root, "hud-reduced-motion");
    this.highContrast = Hud.requireButton(root, "hud-high-contrast");
    this.haptics = Hud.requireButton(root, "hud-haptics");
    this.rewardedPearls = Hud.requireButton(root, "hud-rewarded-pearls");
    this.telemetryChoice = Hud.requireButton(root, "hud-telemetry-choice");
    this.signatureCue = Hud.require(root, "hud-signature-cue");
    const signatureCueTitle = this.signatureCue.querySelector("strong");
    const signatureCueDetail = this.signatureCue.querySelector("span");
    if (!(signatureCueTitle instanceof HTMLElement) || !(signatureCueDetail instanceof HTMLElement)) {
      throw new Error("Hud: signature cue copy is incomplete");
    }
    this.signatureCueTitle = signatureCueTitle;
    this.signatureCueDetail = signatureCueDetail;
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

  setSignatureCue(presentation: SignatureCuePresentation | null): void {
    this.signatureCue.dataset["active"] = presentation ? "true" : "false";
    if (!presentation) return;
    this.signatureCue.dataset["verb"] = presentation.verb;
    this.signatureCueTitle.textContent = presentation.title;
    this.signatureCueDetail.textContent = presentation.detail;
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

  onDiveAgain(listener: () => void): void {
    this.wireAction(this.diveAgain, listener);
  }

  onOpenHub(listener: () => void): void {
    this.wireAction(this.openHub, listener);
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

  onHapticsToggle(listener: () => void): void {
    this.wireAction(this.haptics, listener);
  }

  onRewardedPearls(listener: () => void): void {
    this.wireAction(this.rewardedPearls, listener);
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

  setHapticsPreference(enabled: boolean, nativeAvailable: boolean): void {
    this.haptics.textContent = nativeAvailable
      ? enabled ? "Haptics · On" : "Haptics · Off"
      : enabled ? "Haptics · On when installed" : "Haptics · Off";
    this.haptics.setAttribute("aria-pressed", enabled ? "true" : "false");
    this.haptics.dataset["nativeAvailable"] = String(nativeAvailable);
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
    this.shareClip.disabled = state === "unavailable" || state === "publishing";
    this.shareClip.dataset["state"] = state;
    this.shareClip.textContent = state === "publishing"
      ? "Creating Moonflash…"
      : state === "shared"
        ? "Beat My Current link ready"
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
    const realmResult = presentation.realmResult;
    this.finalLabel.textContent = realmResult
      ? realmResult.kind === "kelp-cathedral"
        ? realmResult.rescuedManta
          ? `${realmResult.title} restored`
          : `${realmResult.title} explored`
        : realmResult.kind === "crystal-trench"
          ? realmResult.raceWon
            ? `${realmResult.title} · Mirror Current won`
            : `${realmResult.title} surveyed`
          : realmResult.completed
            ? realmResult.integrated
              ? `${realmResult.title} · Auralis freed`
              : `${realmResult.title} · Moon Seal reached`
            : `${realmResult.title} explored`
      : "Moonwake gathered";
    this.diveAgain.textContent = presentation.realmResult
      ? presentation.realmResult.kind === "kelp-cathedral" &&
          presentation.realmResult.crystalTrenchUnlocked
        ? "Continue to Crystal Trench"
        : presentation.realmResult.kind === "duskmaw-pursuit"
          ? "Face Duskmaw Again"
          : `Return to ${presentation.realmResult.title}`
      : "Dive Again";
    this.finalScore.textContent = Math.floor(score).toLocaleString();
    this.finalDetail.textContent = realmResult
      ? realmResult.kind === "kelp-cathedral"
        ? `${seconds.toFixed(0)}s · ${realmResult.rescuedManta ? "baby manta rescued" : "rescue current continues"} · ${realmResult.relicPageFound ? "Relic Page found" : "relic still hidden"}${realmResult.crystalTrenchUnlocked ? " · Realm 2 unlocked" : ""}`
        : realmResult.kind === "crystal-trench"
          ? `${seconds.toFixed(0)}s · ${realmResult.thresholdCrossed ? "Trench Gate sealed" : "threshold reforms ahead"} · ${realmResult.platesCleared} plates · ${realmResult.raceWon ? `Neri beaten in ${realmResult.raceAttempts} race${realmResult.raceAttempts === 1 ? "" : "s"}` : "Mirror Current still open"}${realmResult.cleanPerformance ? " · clean mark" : ""}`
          : `${seconds.toFixed(0)}s · ${realmResult.currentBreaks}/${realmResult.currentBreakTarget} Current Breaks · ${realmResult.captures === 0 ? "no captures" : `${realmResult.captures} capture${realmResult.captures === 1 ? "" : "s"} recovered`} · ${realmResult.completed ? realmResult.integrated ? "Auralis freed · Duskmaw sealed" : "Moon Seal reached" : "Heartlight War continues"}${realmResult.cleanPerformance ? " · clean mark" : ""}`
      : `${seconds.toFixed(0)}s · ${nearMisses} near-miss · ${collisions} hits`;
    this.setBestScore(presentation.bestScore);
    this.setMeta(presentation);
    this.newBest.dataset["visible"] = presentation.newBest ? "true" : "false";
    this.runReward.textContent = realmResult?.kind === "duskmaw-pursuit"
      ? realmResult.integrated
        ? realmResult.completed
          ? presentation.rewardPearls > 0
            ? `+${presentation.rewardPearls.toLocaleString()} Lumen Pearls · Mooncrest Covenant secured`
            : "Mooncrest Covenant active · Realm 3 rewards secured"
          : "Realm 3 history saved · return stronger for Auralis"
        : realmResult.completed
          ? "Mooncrest Covenant awarded by Auralis · Guardian alliance preview"
          : "Review encounter · progression unchanged"
      : presentation.rewardPearls > 0
      ? `+${presentation.rewardPearls.toLocaleString()} Lumen Pearls`
      : "Rewards already secured";
    this.unlockBanner.dataset["visible"] = presentation.unlockedNames.length > 0 ? "true" : "false";
    this.unlockBanner.textContent = presentation.unlockedNames.length > 0
      ? realmResult?.kind === "duskmaw-pursuit"
        ? realmResult.integrated
          ? `Permanent Realm 3 reward · ${presentation.unlockedNames.join(" · ")}`
          : `Ceremonial 3D reward · ${presentation.unlockedNames.join(" · ")} · Realm 3 route awakened`
        : `Now available in Wardrobe · ${presentation.unlockedNames.join(" · ")}`
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

  showExpeditionResult(presentation: ExpeditionEndPresentation): void {
    this.finalLabel.textContent = presentation.completed
      ? "Chapter 1 complete"
      : "The Moonseed current waits";
    this.finalScore.textContent = presentation.completed ? "Restored" : "Try again";
    this.finalDetail.textContent =
      `${presentation.seconds.toFixed(0)}s · ${presentation.collisions} hits · Guided Expedition`;
    this.newBest.dataset["visible"] = "false";
    this.runReward.textContent = presentation.completed
      ? "Expedition marks and relics secured"
      : "No Expedition progress lost";
    this.unlockBanner.dataset["visible"] = presentation.moonWellRestored
      ? "true"
      : "false";
    this.unlockBanner.textContent = presentation.moonWellRestored
      ? "The Moon Well now shines in the hub"
      : "";
    const marks = [
      ["Primary objective", presentation.primaryMark],
      ["Hidden relic", presentation.relicMark],
      ["Clean chase", presentation.cleanMark],
    ] as const;
    this.objectiveList.replaceChildren(...marks.map(([label, completed]) => {
      const row = document.createElement("div");
      row.className = "hud-objective";
      row.dataset["complete"] = String(completed);
      const copy = document.createElement("span");
      copy.textContent = label;
      const value = document.createElement("strong");
      value.textContent = completed ? "Complete" : "Open";
      row.append(copy, value);
      return row;
    }));
    this.streak.textContent = `Relic Atlas ${presentation.relicsDiscovered}/6`;
    this.competitiveDivision.textContent = "Guided Expedition · unranked";
    this.leaderboardStatus.textContent = presentation.completed
      ? "Moon Well restoration recorded locally"
      : "Missed targets return on the next attempt";
    this.leaderboardList.replaceChildren();
    this.raceBest.disabled = true;
    this.raceBest.textContent = "Ghosts stay in Classic Dive";
    this.submitScore.disabled = true;
    this.shareClip.disabled = true;
    this.rewardedPearls.disabled = true;
    this.diveAgain.textContent = "Replay Chapter 1";
    this.gameOver.style.display = "flex";
  }

  hideGameOver(): void {
    this.gameOver.style.display = "none";
  }
}
