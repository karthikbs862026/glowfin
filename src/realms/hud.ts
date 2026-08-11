import type {
  CrystalTrenchRunStatus,
  KelpCathedralRunStatus,
  RealmRunEvent,
} from "../sim/run";
import {
  CRYSTAL_PLATES_TO_RACE,
  type RealmGatePlan,
} from "./mechanics";

function requireElement(root: Document, id: string): HTMLElement {
  const element = root.getElementById(id);
  if (!element) throw new Error(`RealmHud: missing #${id}`);
  return element;
}

export class RealmHud {
  private readonly root: HTMLElement;
  private readonly title: HTMLElement;
  private readonly objective: HTMLElement;
  private readonly detail: HTMLElement;
  private readonly feedback: HTMLElement;

  constructor(root: Document = document) {
    this.root = requireElement(root, "realm-run-status");
    this.title = requireElement(root, "realm-title");
    this.objective = requireElement(root, "realm-objective");
    this.detail = requireElement(root, "realm-feature-detail");
    this.feedback = requireElement(root, "realm-feedback");
  }

  setActive(active: boolean): void {
    this.root.dataset["active"] = String(active);
    this.root.setAttribute("aria-hidden", String(!active));
    if (!active) this.feedback.dataset["active"] = "false";
  }

  updateKelp(
    status: Readonly<KelpCathedralRunStatus>,
    _nextPlan: RealmGatePlan | null,
  ): void {
    void _nextPlan;
    this.title.textContent = "Kelp Cathedral · Realm 1";
    this.objective.textContent = status.rescuedManta
      ? "Manta rescued · follow the gold current home"
      : "Rescue current · baby manta ahead";
    this.detail.textContent = [
      `Fronds ${status.frondWindowsCleared}`,
      `Tunnels ${status.currentTunnelsEntered}`,
      status.relicPageFound ? "Relic found" : "Relic hidden",
    ].join(" · ");
  }

  updateCrystal(
    status: Readonly<CrystalTrenchRunStatus>,
    _nextPlan: RealmGatePlan | null,
  ): void {
    void _nextPlan;
    this.title.textContent = "Crystal Trench · Mirror Current";
    this.objective.textContent = status.raceWon
      ? "Mirror Current won · Neri guides the return current"
      : status.raceActive
        ? `Race Neri · ${status.raceGap === null ? "hold the cyan line" : status.raceGap >= 0 ? `${status.raceGap.toFixed(0)}m ahead` : `${Math.abs(status.raceGap).toFixed(0)}m behind`}`
        : !status.thresholdCrossed
          ? "Read the Prism Pulse · seal the buried Trench Gate"
          : status.platesCleared < CRYSTAL_PLATES_TO_RACE
            ? `Sliding Crystal Plates · ${status.platesCleared}/${CRYSTAL_PLATES_TO_RACE} clean reads`
            : status.raceLosses > 0
              ? "Neri circles back · the mirror current reforms ahead"
              : "Mirror Current opening · Neri is ready";
    this.detail.textContent = [
      `Prism routes ${status.prismPulsesCleared}`,
      status.thresholdCrossed
        ? status.thresholdRetries > 0 ? `Gate sealed after ${status.thresholdRetries + 1} reads` : "Gate sealed clean"
        : status.thresholdRetries > 0 ? `Gate retries ${status.thresholdRetries}` : "Gate ahead",
      `Plates ${status.platesCleared}/${CRYSTAL_PLATES_TO_RACE}`,
      status.raceAttempts > 0 ? `Neri race ${status.raceAttempts}` : "Neri ahead",
    ].join(" · ");
  }

  showEvent(event: Readonly<RealmRunEvent>): void {
    this.feedback.textContent = event.kind === "frond-window"
      ? event.success ? "Frond rhythm cleared" : "Fronds brushed your Light"
      : event.kind === "current-tunnel-enter"
        ? `Current tunnel · pushes ${event.direction === -1 ? "left" : "right"}`
        : event.kind === "current-tunnel-reverse"
          ? `Current reversed · now ${event.direction === -1 ? "left" : "right"}`
          : event.kind === "relic-page"
            ? "Relic Page found · The Song Beneath the Fronds"
            : event.kind === "manta-rescue"
              ? "Baby manta freed · chamber opening"
              : event.kind === "manta-rescue-missed"
                ? "The chamber reforms farther ahead"
                : event.kind === "prism-route"
                  ? event.success
                    ? "True cyan reflection read"
                    : "False reflection brushed your Light"
                  : event.kind === "crystal-plate"
                    ? "Sliding plate sequence read clean"
                    : event.kind === "crystal-plate-missed"
                      ? "Plate cadence repeats farther ahead"
                  : event.kind === "trench-threshold"
                    ? "Trench Gate sealed · plates waking beyond"
                    : event.kind === "trench-threshold-missed"
                      ? "The ruined threshold reforms farther ahead"
                      : event.kind === "mirror-race-start"
                        ? "Neri joins · race the cyan mirror current"
                        : event.kind === "mirror-race-win"
                          ? "Mirror Current won · Neri bows"
                          : "Neri wins by a fin · race repeats ahead";
    this.feedback.dataset["active"] = "true";
  }

  hideFeedback(): void {
    this.feedback.dataset["active"] = "false";
  }
}
