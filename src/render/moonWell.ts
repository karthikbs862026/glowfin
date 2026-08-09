import type { HudMetaPresentation, HudObjectivePresentation } from "./hud";
import type {
  CosmeticAvailability,
  CosmeticCategory,
  CosmeticDefinition
} from "../meta/progression";
import type { TutorialPresentation } from "../meta/onboarding";
import type { ExpeditionProgressV1 } from "../expedition/progress";

export type MoonWellPanel = "home" | "wardrobe" | "objectives" | "leaderboard" | "settings";

export interface WardrobeItemPresentation {
  cosmetic: CosmeticDefinition;
  availability: CosmeticAvailability;
}

export class MoonWell {
  private readonly root: HTMLElement;
  private readonly home: HTMLElement;
  private readonly panels = new Map<MoonWellPanel, HTMLElement>();
  private readonly dive: HTMLButtonElement;
  private readonly daily: HTMLButtonElement;
  private readonly challenge: HTMLButtonElement;
  private readonly meta: HTMLElement;
  private readonly wardrobeGrid: HTMLElement;
  private readonly wardrobeFeedback: HTMLElement;
  private readonly objectiveList: HTMLElement;
  private readonly tutorialIntro: HTMLElement;
  private readonly tutorial: HTMLElement;
  private readonly tutorialEyebrow: HTMLElement;
  private readonly tutorialIcon: HTMLElement;
  private readonly tutorialTitle: HTMLElement;
  private readonly tutorialDetail: HTMLElement;
  private readonly tutorialFill: HTMLElement;
  private readonly expeditionRestoration: HTMLElement;
  private readonly expeditionRestorationTitle: HTMLElement;
  private readonly expeditionRestorationDetail: HTMLElement;

  constructor(root: Document = document) {
    this.root = MoonWell.require(root, "moonwell-hub");
    this.home = MoonWell.require(root, "moonwell-home");
    this.dive = MoonWell.requireButton(root, "moonwell-dive");
    this.daily = MoonWell.requireButton(root, "hud-daily-trial");
    this.challenge = MoonWell.requireButton(root, "moonwell-challenge");
    this.meta = MoonWell.require(root, "moonwell-meta");
    this.wardrobeGrid = MoonWell.require(root, "moonwell-wardrobe-grid");
    this.wardrobeFeedback = MoonWell.require(root, "moonwell-wardrobe-feedback");
    this.objectiveList = MoonWell.require(root, "moonwell-objectives-list");
    this.tutorialIntro = MoonWell.require(root, "tutorial-intro");
    this.tutorial = MoonWell.require(root, "tutorial-overlay");
    this.tutorialEyebrow = MoonWell.require(root, "tutorial-eyebrow");
    this.tutorialIcon = MoonWell.require(root, "tutorial-icon");
    this.tutorialTitle = MoonWell.require(root, "tutorial-title");
    this.tutorialDetail = MoonWell.require(root, "tutorial-detail");
    this.tutorialFill = MoonWell.require(root, "tutorial-progress-fill");
    this.expeditionRestoration = root.createElement("section");
    this.expeditionRestoration.className = "moonwell-restoration";
    this.expeditionRestoration.setAttribute("aria-label", "Moon Garden restoration");
    this.expeditionRestorationTitle = root.createElement("strong");
    this.expeditionRestorationDetail = root.createElement("span");
    this.expeditionRestoration.append(
      this.expeditionRestorationTitle,
      this.expeditionRestorationDetail,
    );
    this.home.querySelector(".moonwell-invitation")?.after(
      this.expeditionRestoration,
    );
    for (const panel of ["wardrobe", "objectives", "leaderboard", "settings"] as const) {
      this.panels.set(panel, MoonWell.require(root, `moonwell-panel-${panel}`));
    }
  }

  private static require(root: Document, id: string): HTMLElement {
    const element = root.getElementById(id);
    if (!element) throw new Error(`MoonWell: missing required element #${id}`);
    return element;
  }

  private static requireButton(root: Document, id: string): HTMLButtonElement {
    const element = MoonWell.require(root, id);
    if (!(element instanceof HTMLButtonElement)) {
      throw new Error(`MoonWell: #${id} must be a button`);
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

  onDive(listener: () => void): void {
    this.wire(this.dive, listener);
  }

  onChallenge(listener: () => void): void {
    this.wire(this.challenge, listener);
  }

  onOpenPanel(listener: (panel: MoonWellPanel) => void): void {
    this.root.querySelectorAll<HTMLButtonElement>("[data-moonwell-panel]").forEach((button) => {
      this.wire(button, () => listener(button.dataset.moonwellPanel as MoonWellPanel));
    });
  }

  onBack(listener: () => void): void {
    this.root.querySelectorAll<HTMLButtonElement>("[data-moonwell-back]").forEach((button) => {
      this.wire(button, listener);
    });
  }

  onTutorialStart(listener: () => void): void {
    this.root.querySelectorAll<HTMLButtonElement>("[data-guided-tutorial]").forEach((button) => {
      this.wire(button, listener);
    });
  }

  onTutorialSkip(listener: () => void): void {
    this.root.ownerDocument
      .querySelectorAll<HTMLButtonElement>("[data-tutorial-skip]")
      .forEach((button) => this.wire(button, listener));
  }

  onWardrobePreview(listener: (cosmeticId: string) => void): void {
    this.wardrobeGrid.addEventListener("click", (event) => {
      const button = event.target instanceof Element
        ? event.target.closest<HTMLButtonElement>("[data-wardrobe-preview]")
        : null;
      if (!button) return;
      event.stopPropagation();
      listener(button.dataset.wardrobePreview ?? "");
    });
  }

  onWardrobeAction(listener: (cosmeticId: string) => void): void {
    this.wardrobeGrid.addEventListener("click", (event) => {
      const button = event.target instanceof Element
        ? event.target.closest<HTMLButtonElement>("[data-wardrobe-action]")
        : null;
      if (!button) return;
      event.stopPropagation();
      listener(button.dataset.wardrobeAction ?? "");
    });
  }

  show(meta: HudMetaPresentation): void {
    this.setMeta(meta);
    this.showPanel("home");
    this.root.dataset.active = "true";
  }

  hide(): void {
    this.root.dataset.active = "false";
  }

  get isOpen(): boolean {
    return this.root.dataset.active === "true";
  }

  showPanel(panel: MoonWellPanel): void {
    this.home.hidden = panel !== "home";
    for (const [name, element] of this.panels) element.hidden = name !== panel;
    this.root.dataset.panel = panel;
  }

  setMeta(meta: HudMetaPresentation): void {
    this.meta.textContent = `Tide ${meta.tideLevel} · ${meta.lumenPearls.toLocaleString()} Lumen Pearls`;
  }

  setDailyLabel(dayId: string, completed: boolean): void {
    this.daily.textContent = completed
      ? `Replay Daily Tide · ${dayId}`
      : `Daily Tide · ${dayId}`;
  }

  setChallenge(caption: string | null, state: "ready" | "failed" | "loading" = "ready"): void {
    this.challenge.hidden = !caption && state !== "loading";
    this.challenge.disabled = state !== "ready";
    const title = this.challenge.querySelector("strong");
    const detail = this.challenge.querySelector("span");
    if (title) title.textContent = state === "failed" ? "Challenge unavailable" : "Beat My Current";
    if (detail) {
      detail.textContent = state === "loading"
        ? "Loading verified Moonflash challenge…"
        : state === "failed"
          ? "This link expired or could not be verified."
          : caption ?? "Race the shared same-seed ghost.";
    }
  }

  setTutorialStatus(completed: boolean): void {
    this.root.querySelectorAll<HTMLElement>("[data-tutorial-entry-title]").forEach((element) => {
      element.textContent = completed ? "Replay guided tutorial" : "Start guided tutorial";
    });
    this.root.querySelectorAll<HTMLElement>("[data-tutorial-entry-detail]").forEach((element) => {
      element.textContent = completed
        ? "Six clear steps · about 30 seconds"
        : "New in Version 39 · six clear steps";
    });
  }

  showTutorialIntro(visible: boolean): void {
    this.tutorialIntro.dataset.active = String(visible);
    this.tutorialIntro.setAttribute("aria-hidden", String(!visible));
  }

  renderObjectives(objectives: readonly HudObjectivePresentation[]): void {
    this.objectiveList.replaceChildren(...objectives.map((objective) => {
      const row = document.createElement("div");
      row.className = "moonwell-objective";
      row.dataset.complete = String(objective.completed);
      const copy = document.createElement("span");
      copy.textContent = objective.label;
      const value = document.createElement("strong");
      value.textContent = objective.completed
        ? "Complete"
        : `${Math.floor(objective.progress).toLocaleString()}/${Math.floor(objective.target).toLocaleString()}`;
      row.append(copy, value);
      return row;
    }));
  }

  setExpeditionState(
    progress: Pick<
      ExpeditionProgressV1,
      "moonWellRestored" | "discoveredRelics" | "completionMarks"
    >,
  ): void {
    const relicCount = progress.discoveredRelics.length;
    this.expeditionRestoration.dataset["restored"] = String(
      progress.moonWellRestored,
    );
    this.expeditionRestoration.dataset["relics"] = String(relicCount);
    this.expeditionRestorationTitle.textContent = progress.moonWellRestored
      ? "Moon Well restored"
      : "Moon Well restoration";
    const marks = [
      progress.completionMarks.primaryObjective ? "Primary" : null,
      progress.completionMarks.hiddenRelic ? "Hidden relic" : null,
      progress.completionMarks.cleanPerformance ? "Clean chase" : null,
    ].filter((mark): mark is string => Boolean(mark));
    this.expeditionRestorationDetail.textContent =
      `Relic Atlas ${relicCount}/6${marks.length > 0 ? ` · ${marks.join(" · ")}` : " · Chapter 1 awaits"}`;
  }

  renderWardrobe(items: readonly WardrobeItemPresentation[], pearls: number): void {
    const categoryLabels: Record<CosmeticCategory, string> = {
      glow: "Glow",
      fin: "Fins",
      trail: "Trail",
      aura: "Aura"
    };
    this.wardrobeGrid.replaceChildren(...items.map(({ cosmetic, availability }) => {
      const card = document.createElement("article");
      card.className = "wardrobe-card";
      card.dataset.state = availability;
      const swatch = document.createElement("div");
      swatch.className = "wardrobe-swatch";
      swatch.style.setProperty("--swatch-primary", `#${cosmetic.primaryColor.toString(16).padStart(6, "0")}`);
      swatch.style.setProperty("--swatch-secondary", `#${cosmetic.secondaryColor.toString(16).padStart(6, "0")}`);
      const copy = document.createElement("div");
      copy.className = "wardrobe-copy";
      const title = document.createElement("strong");
      title.textContent = cosmetic.name;
      const detail = document.createElement("span");
      detail.textContent = availability === "locked"
        ? `${categoryLabels[cosmetic.category]} · Tide ${cosmetic.unlockLevel}`
        : availability === "available"
          ? `${categoryLabels[cosmetic.category]} · ◇ ${cosmetic.pricePearls}`
          : `${categoryLabels[cosmetic.category]} · ${availability === "equipped" ? "Equipped" : "Owned"}`;
      copy.append(title, detail);
      const actions = document.createElement("div");
      actions.className = "wardrobe-actions";
      const preview = document.createElement("button");
      preview.type = "button";
      preview.dataset.wardrobePreview = cosmetic.id;
      preview.dataset.hudAction = "";
      preview.textContent = "Preview";
      preview.disabled = availability === "locked";
      const action = document.createElement("button");
      action.type = "button";
      action.dataset.wardrobeAction = cosmetic.id;
      action.dataset.hudAction = "";
      action.textContent = availability === "locked"
        ? `Tide ${cosmetic.unlockLevel}`
        : availability === "available"
          ? pearls >= cosmetic.pricePearls ? `Buy ◇ ${cosmetic.pricePearls}` : `Need ◇ ${cosmetic.pricePearls}`
          : availability === "equipped" ? "Equipped" : "Equip";
      action.disabled = availability === "locked" || availability === "equipped";
      actions.append(preview, action);
      card.append(swatch, copy, actions);
      return card;
    }));
  }

  setWardrobeFeedback(message: string): void {
    this.wardrobeFeedback.textContent = message;
    this.wardrobeFeedback.dataset.visible = message ? "true" : "false";
  }

  showTutorial(presentation: TutorialPresentation | null): void {
    if (!presentation) {
      this.tutorial.dataset.active = "false";
      return;
    }
    this.tutorialEyebrow.textContent = presentation.eyebrow;
    this.tutorialIcon.textContent = presentation.icon;
    this.tutorialTitle.textContent = presentation.title;
    this.tutorialDetail.textContent = presentation.detail;
    this.tutorialFill.style.width = `${Math.round(presentation.progress * 100)}%`;
    this.tutorial.dataset.active = "true";
    this.tutorial.dataset.step = presentation.step;
  }
}
