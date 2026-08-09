import {
  reduceExpeditionUiState,
  type ExpeditionUiEvent,
  type ExpeditionUiState,
} from "./chapterOne";
import type {
  LumenMotePickup,
  LumenMoteSnapshot,
} from "./lumenMotes";
import type {
  R3Direction,
  R3EncounterBeat,
  R3EncounterSnapshot,
} from "./r3Encounters";
import type {
  R5CompletionBeat,
  R5CompletionSnapshot,
  R5Direction,
} from "./r5Completion";

export class ExpeditionDirector {
  private readonly missionCard: HTMLButtonElement;
  private readonly briefing: HTMLElement;
  private readonly begin: HTMLButtonElement;
  private readonly back: HTMLButtonElement;
  private readonly runStatus: HTMLElement;
  private readonly objective: HTMLElement;
  private readonly objectiveFill: HTMLElement;
  private readonly beatTitle: HTMLElement;
  private readonly direction: HTMLElement;
  private readonly character: HTMLElement;
  private readonly stageStats: HTMLElement;
  private readonly chain: HTMLElement;
  private readonly moteScore: HTMLElement;
  private readonly feedback: HTMLElement;
  private state: ExpeditionUiState = "mission-card";
  private beat: R3EncounterBeat | R5CompletionBeat = "follow-light";
  private feedbackTimer: number | null = null;

  constructor(root: Document = document) {
    this.missionCard = ExpeditionDirector.requireButton(root, "expedition-mission-card");
    this.briefing = ExpeditionDirector.require(root, "expedition-briefing");
    this.begin = ExpeditionDirector.requireButton(root, "expedition-begin");
    this.back = ExpeditionDirector.requireButton(root, "expedition-back");
    this.runStatus = ExpeditionDirector.require(root, "expedition-run-status");
    this.objective = ExpeditionDirector.require(root, "expedition-objective");
    this.objectiveFill = ExpeditionDirector.require(root, "expedition-objective-fill");
    this.beatTitle = ExpeditionDirector.require(root, "expedition-beat-title");
    this.direction = ExpeditionDirector.require(root, "expedition-direction");
    this.character = ExpeditionDirector.require(root, "expedition-character");
    this.stageStats = ExpeditionDirector.require(root, "expedition-stage-stats");
    this.chain = ExpeditionDirector.require(root, "expedition-chain");
    this.moteScore = ExpeditionDirector.require(root, "expedition-mote-score");
    this.feedback = ExpeditionDirector.require(root, "expedition-collect-feedback");
    this.resetLumenObjective();
    this.render();
  }

  private static require(root: Document, id: string): HTMLElement {
    const element = root.getElementById(id);
    if (!element) throw new Error(`ExpeditionDirector: missing required element #${id}`);
    return element;
  }

  private static requireButton(root: Document, id: string): HTMLButtonElement {
    const element = ExpeditionDirector.require(root, id);
    if (!(element instanceof HTMLButtonElement)) {
      throw new Error(`ExpeditionDirector: #${id} must be a button`);
    }
    return element;
  }

  private wire(button: HTMLButtonElement, listener: () => void): void {
    button.addEventListener("pointerdown", (event) => event.stopPropagation());
    button.addEventListener("click", (event) => {
      event.stopPropagation();
      listener();
    });
  }

  private transition(event: ExpeditionUiEvent): void {
    this.state = reduceExpeditionUiState(this.state, event);
    this.render();
  }

  private render(): void {
    const briefingOpen = this.state === "briefing";
    const running = this.state === "running";
    this.briefing.dataset.active = String(briefingOpen);
    this.briefing.setAttribute("aria-hidden", String(!briefingOpen));
    this.missionCard.setAttribute("aria-expanded", String(briefingOpen));
    this.runStatus.dataset.active = String(running);
    document.documentElement.dataset["glowfinExpedition"] = this.state;
  }

  onMissionSelected(listener: () => void): void {
    this.wire(this.missionCard, () => {
      this.transition("open-briefing");
      listener();
    });
  }

  onStart(listener: () => void): void {
    this.wire(this.begin, () => {
      if (this.state !== "briefing") return;
      this.transition("start");
      listener();
    });
  }

  onBack(listener: () => void): void {
    this.wire(this.back, () => {
      this.transition("close-briefing");
      listener();
    });
  }

  reset(): void {
    this.state = "mission-card";
    this.resetLumenObjective();
    this.render();
  }

  beginRun(): void {
    this.state = "running";
    this.resetLumenObjective();
    this.render();
  }

  finishRun(): void {
    this.transition("finish");
  }

  updateLumenObjective(snapshot: LumenMoteSnapshot): void {
    this.runStatus.dataset["objectiveComplete"] = String(
      snapshot.objectiveComplete,
    );
    this.runStatus.dataset["chain"] = String(snapshot.currentChain);
    this.runStatus.dataset["bestChain"] = String(snapshot.bestChain);
    this.runStatus.dataset["collected"] = String(snapshot.collected);
    if (this.beat === "follow-light") {
      this.objective.textContent = snapshot.objectiveComplete
        ? "Objective complete · Neri found the relic current"
        : `Collect ${snapshot.objectiveTarget} Motes in one chain · ${snapshot.objectiveProgress}/${snapshot.objectiveTarget}`;
      this.objectiveFill.style.width = `${
        snapshot.objectiveProgress / Math.max(1, snapshot.objectiveTarget) * 100
      }%`;
    }
    this.chain.textContent = `Chain ${snapshot.currentChain} · Best ${snapshot.bestChain}`;
    this.moteScore.textContent = `Mote score ${snapshot.score.toLocaleString()}`;
  }

  updateEncounter(snapshot: Readonly<R3EncounterSnapshot>): void {
    this.beat = snapshot.beat;
    this.runStatus.dataset["beat"] = snapshot.beat;
    this.runStatus.dataset["relicFound"] = String(snapshot.relicFound);
    this.runStatus.dataset["rescueLights"] = String(snapshot.rescueLights);
    this.runStatus.dataset["miriRescued"] = String(snapshot.miriRescued);
    this.runStatus.dataset["raceGates"] = String(snapshot.raceGates);
    this.runStatus.dataset["r3Complete"] = String(snapshot.r3Complete);
    const direction = ExpeditionDirector.directionLabel(snapshot.direction);
    this.direction.textContent = direction;

    if (snapshot.beat === "follow-light") {
      this.beatTitle.textContent = "Follow the Light";
      this.character.textContent = "Neri · Moon-dolphin Scout";
      this.stageStats.textContent = "Follow the golden ribbon through cyan openings";
      return;
    }
    if (snapshot.beat === "relic-fork") {
      this.beatTitle.textContent = "Claim the Fragment";
      this.character.textContent = "Neri · Relic guide";
      this.objective.textContent = snapshot.relicResolved
        ? snapshot.relicFound
          ? "Moonseed Fragment found · keep Flow"
          : "Safe current chosen · Fragment remains hidden"
        : "Gold narrow route: Fragment · Cyan wide route: safe";
      this.objectiveFill.style.width = snapshot.relicResolved ? "100%" : "0%";
      this.stageStats.textContent = snapshot.relicFound
        ? "Fragment found ✓"
        : snapshot.relicResolved
          ? "Relic route missed · mission continues"
          : "Optional relic · no harsh penalty";
      return;
    }
    if (snapshot.beat === "rescue-miri") {
      this.beatTitle.textContent = "Rescue Miri";
      this.character.textContent = "Miri · Baby manta";
      this.objective.textContent = snapshot.miriRescued
        ? "Miri is free · stay with the current"
        : `Reach Rescue Light ${snapshot.rescueLights + 1}/3`;
      this.objectiveFill.style.width = `${snapshot.rescueLights / 3 * 100}%`;
      this.stageStats.textContent = snapshot.miriRescued
        ? "Miri rescued ✓"
        : `Rescue Lights ${snapshot.rescueLights}/3 · missed lights return`;
      return;
    }
    if (snapshot.beat === "race-neri") {
      this.beatTitle.textContent = "Race Neri";
      this.character.textContent = "Neri · First rival";
      const gap = Math.abs(snapshot.raceGap).toFixed(1);
      this.objective.textContent = snapshot.r3Complete
        ? "R3 route complete · the shadow current lies ahead"
        : snapshot.raceGates < 3
          ? `Hit Race Gate ${snapshot.raceGates + 1}/3`
          : snapshot.raceGap >= 0
            ? "Hold the lead until the race beat completes"
            : "Catch Neri · keep Flow";
      this.objectiveFill.style.width = `${snapshot.raceGates / 3 * 100}%`;
      this.stageStats.textContent = `${snapshot.raceGates}/3 gates · ${
        snapshot.raceGap >= 0 ? `Glowfin ahead ${gap}` : `Neri ahead ${gap}`
      }`;
      return;
    }

    this.beatTitle.textContent = "Current Secured";
    this.character.textContent = "Miri safe · Neri impressed";
    this.direction.textContent = "✓";
    this.objective.textContent = "Fragment resolved · Miri rescued · Neri raced";
    this.objectiveFill.style.width = "100%";
    this.stageStats.textContent = "R3 complete · Duskmaw chapter comes next";
  }

  updateCompletion(snapshot: Readonly<R5CompletionSnapshot>): void {
    this.beat = snapshot.beat;
    this.runStatus.dataset["beat"] = snapshot.beat;
    this.runStatus.dataset["currentBreaks"] = String(snapshot.currentBreaks);
    this.runStatus.dataset["currentBreakMisses"] = String(
      snapshot.currentBreakMisses,
    );
    this.runStatus.dataset["cleanChase"] = String(snapshot.cleanChase);
    this.runStatus.dataset["finishReached"] = String(snapshot.finishReached);
    this.runStatus.dataset["moonWellRestored"] = String(
      snapshot.moonWellRestored,
    );
    this.runStatus.dataset["r5Complete"] = String(snapshot.r5Complete);
    this.direction.textContent = ExpeditionDirector.directionLabel(
      snapshot.direction,
    );

    if (snapshot.beat === "duskmaw") {
      this.beatTitle.textContent = "Break the Shadow Current";
      this.character.textContent = "Duskmaw · Shadow of the Moonseed";
      this.objective.textContent = snapshot.chaseComplete
        ? "Duskmaw's current is broken · return to the Moon Well"
        : `Reach Current Break ${snapshot.currentBreaks + 1}/3`;
      this.objectiveFill.style.width = `${snapshot.currentBreaks / 3 * 100}%`;
      this.stageStats.textContent = snapshot.cleanChase
        ? `Current Breaks ${snapshot.currentBreaks}/3 · clean chase`
        : `Current Breaks ${snapshot.currentBreaks}/3 · missed breaks return`;
      return;
    }

    if (snapshot.beat === "return-moonwell") {
      this.beatTitle.textContent = "Restore the Moon Well";
      this.character.textContent = "Miri and Neri · guiding the Moonseed home";
      this.objective.textContent = snapshot.finishReached
        ? "Moonseed secured · hold the ceremonial current"
        : "Reach the golden Moon Well ring";
      this.objectiveFill.style.width = snapshot.finishReached ? "100%" : "0%";
      this.stageStats.textContent = snapshot.finishReached
        ? "Ceremonial finish reached ✓"
        : "The finish returns ahead if missed";
      return;
    }

    if (snapshot.beat === "r5-complete") {
      this.beatTitle.textContent = "Moon Well Restored";
      this.character.textContent = "Miri safe · Neri beside you · Duskmaw released";
      this.direction.textContent = "✓";
      this.objective.textContent = "The Missing Moonseed · Chapter 1 complete";
      this.objectiveFill.style.width = "100%";
      this.stageStats.textContent = snapshot.cleanChase
        ? "Primary objective · Hidden relic · Clean chase"
        : "Primary objective · Moon Well restored";
    }
  }

  showEncounterFeedback(message: string): void {
    this.showFeedback(message);
  }

  showLumenPickup(pickup: LumenMotePickup): void {
    this.showFeedback(`+${pickup.score} · Chain ${pickup.chain}`);
  }

  showChainBreak(previousChain: number): void {
    if (previousChain < 1) return;
    this.showFeedback(`Chain reset · Best ${Math.max(previousChain, Number(this.runStatus.dataset["bestChain"] ?? 0))}`);
  }

  showFullChain(): void {
    this.showFeedback("Full Lumen Chain · Trail awakened");
  }

  private showFeedback(message: string): void {
    this.feedback.textContent = message;
    this.feedback.dataset["active"] = "true";
    if (this.feedbackTimer !== null) window.clearTimeout(this.feedbackTimer);
    this.feedbackTimer = window.setTimeout(() => {
      this.feedback.dataset["active"] = "false";
      this.feedbackTimer = null;
    }, 950);
  }

  private resetLumenObjective(): void {
    if (this.feedbackTimer !== null) window.clearTimeout(this.feedbackTimer);
    this.feedbackTimer = null;
    this.beat = "follow-light";
    this.runStatus.dataset["objectiveComplete"] = "false";
    this.runStatus.dataset["chain"] = "0";
    this.runStatus.dataset["bestChain"] = "0";
    this.runStatus.dataset["collected"] = "0";
    this.runStatus.dataset["currentBreaks"] = "0";
    this.runStatus.dataset["currentBreakMisses"] = "0";
    this.runStatus.dataset["cleanChase"] = "true";
    this.runStatus.dataset["finishReached"] = "false";
    this.runStatus.dataset["moonWellRestored"] = "false";
    this.runStatus.dataset["r5Complete"] = "false";
    this.objective.textContent = "Collect 6 Motes in one chain · 0/6";
    this.objectiveFill.style.width = "0%";
    this.chain.textContent = "Chain 0 · Best 0";
    this.moteScore.textContent = "Mote score 0";
    this.beatTitle.textContent = "Follow the Light";
    this.direction.textContent = "FLOW ◆";
    this.character.textContent = "Neri · Moon-dolphin Scout";
    this.stageStats.textContent = "Follow the golden ribbon through cyan openings";
    this.feedback.dataset["active"] = "false";
  }

  private static directionLabel(direction: R3Direction | R5Direction): string {
    if (direction === "left") return "← LEFT";
    if (direction === "right") return "RIGHT →";
    if (direction === "center") return "CENTER ◆";
    if (direction === "complete") return "✓";
    return "FLOW ◆";
  }
}
