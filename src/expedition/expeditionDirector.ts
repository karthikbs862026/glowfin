import {
  reduceExpeditionUiState,
  type ExpeditionUiEvent,
  type ExpeditionUiState,
} from "./chapterOne";

export class ExpeditionDirector {
  private readonly missionCard: HTMLButtonElement;
  private readonly briefing: HTMLElement;
  private readonly begin: HTMLButtonElement;
  private readonly back: HTMLButtonElement;
  private readonly runStatus: HTMLElement;
  private state: ExpeditionUiState = "mission-card";

  constructor(root: Document = document) {
    this.missionCard = ExpeditionDirector.requireButton(root, "expedition-mission-card");
    this.briefing = ExpeditionDirector.require(root, "expedition-briefing");
    this.begin = ExpeditionDirector.requireButton(root, "expedition-begin");
    this.back = ExpeditionDirector.requireButton(root, "expedition-back");
    this.runStatus = ExpeditionDirector.require(root, "expedition-run-status");
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
    this.render();
  }

  beginRun(): void {
    this.state = "running";
    this.render();
  }

  finishRun(): void {
    this.transition("finish");
  }
}
