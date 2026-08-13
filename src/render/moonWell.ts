import type { HudMetaPresentation, HudObjectivePresentation } from "./hud";
import type {
  CosmeticAvailability,
  CosmeticCategory,
  CosmeticDefinition
} from "../meta/progression";
import type { TutorialPresentation } from "../meta/onboarding";
import type { ExpeditionProgressV1 } from "../expedition/progress";
import {
  TIDE_SPRINT_OBJECTIVES,
  type TideSprintProgressV1,
} from "../tideSprint/progress";
import type {
  CrystalTrenchProgressV1,
  KelpCathedralProgressV1,
  LeviathanGraveyardProgressV1,
} from "../realms/progress";

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
  private readonly tideSprint: HTMLButtonElement;
  private readonly tideSprintDetail: HTMLElement;
  private readonly kelpCathedral: HTMLButtonElement;
  private readonly kelpCathedralDetail: HTMLElement;
  private readonly crystalTrench: HTMLButtonElement;
  private readonly crystalTrenchDetail: HTMLElement;
  private readonly duskmaw: HTMLButtonElement;
  private readonly duskmawDetail: HTMLElement;
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
    this.tideSprint = MoonWell.requireButton(root, "moonwell-tide-sprint");
    this.tideSprintDetail = MoonWell.require(root, "moonwell-tide-sprint-detail");
    this.kelpCathedral = MoonWell.requireButton(root, "moonwell-kelp-cathedral");
    this.kelpCathedralDetail = MoonWell.require(root, "moonwell-kelp-cathedral-detail");
    this.crystalTrench = MoonWell.requireButton(root, "moonwell-crystal-trench");
    this.crystalTrenchDetail = MoonWell.require(root, "moonwell-crystal-trench-detail");
    this.duskmaw = MoonWell.requireButton(root, "moonwell-duskmaw");
    this.duskmawDetail = MoonWell.require(root, "moonwell-duskmaw-detail");
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

  onTideSprint(listener: () => void): void {
    this.wire(this.tideSprint, listener);
  }

  onKelpCathedral(listener: () => void): void {
    this.wire(this.kelpCathedral, listener);
  }

  onCrystalTrench(listener: () => void): void {
    this.wire(this.crystalTrench, listener);
  }

  onDuskmaw(listener: () => void): void {
    this.wire(this.duskmaw, listener);
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

  setTideSprintState(
    progress: Pick<
      TideSprintProgressV1,
      "bestFinishSec" | "bestGhost" | "totals" | "completedObjectives"
    >,
    ghostEnabled: boolean,
  ): void {
    const best = progress.bestFinishSec === null
      ? "No finish yet"
      : `Best ${progress.bestFinishSec.toFixed(2)}s · ${progress.totals.wins} win${progress.totals.wins === 1 ? "" : "s"}`;
    const ghost = ghostEnabled && progress.bestGhost
      ? "Best Echo ready"
      : ghostEnabled
        ? "your Best Echo awaits"
        : "personal ghost off";
    const goals = `${progress.completedObjectives.length}/${TIDE_SPRINT_OBJECTIVES.length} race goals`;
    this.tideSprintDetail.textContent = `${best} · ${ghost} · ${goals} · shared rewards`;
    this.tideSprint.dataset["ghost"] = ghostEnabled && progress.bestGhost
      ? "ready"
      : ghostEnabled ? "preset" : "off";
  }

  setKelpCathedralState(progress: Readonly<KelpCathedralProgressV1>): void {
    const rescue = progress.rescues > 0
      ? `${progress.rescues} rescue${progress.rescues === 1 ? "" : "s"}`
      : "Baby manta awaits";
    const best = progress.bestRescueSec === null
      ? "no rescue time"
      : `best ${progress.bestRescueSec.toFixed(1)}s`;
    const relic = progress.relicPages.includes("kelp-cathedral-page-1")
      ? "Relic Page found"
      : "1 hidden Relic Page";
    this.kelpCathedralDetail.textContent =
      `${rescue} · ${best} · ${relic} · ${progress.masteredVerbs.length}/4 realm verbs`;
    this.kelpCathedral.dataset["rescued"] = String(progress.rescues > 0);
    this.kelpCathedral.dataset["relic"] = String(
      progress.relicPages.includes("kelp-cathedral-page-1"),
    );
  }

  setCrystalTrenchState(
    progress: Readonly<CrystalTrenchProgressV1>,
    unlocked = true,
  ): void {
    this.crystalTrench.disabled = !unlocked;
    this.crystalTrench.dataset["locked"] = String(!unlocked);
    this.crystalTrench.setAttribute(
      "aria-label",
      unlocked
        ? "Enter Realm 2, Crystal Trench"
        : "Crystal Trench locked; rescue the baby manta in Realm 1",
    );
    if (!unlocked) {
      this.crystalTrenchDetail.textContent =
        "Locked · rescue the baby manta in Kelp Cathedral to open Realm 2";
      this.crystalTrench.dataset["completed"] = "false";
      this.crystalTrench.dataset["clean"] = "false";
      return;
    }
    const completion = progress.completions > 0
      ? `${progress.completions} Mirror Current win${progress.completions === 1 ? "" : "s"}`
      : "Neri awaits in the Mirror Current";
    const best = progress.bestTimeSec === null
      ? "no clear time"
      : `best ${progress.bestTimeSec.toFixed(1)}s`;
    const clean = progress.cleanCompletions > 0
      ? `${progress.cleanCompletions} clean`
      : "clean mark open";
    this.crystalTrenchDetail.textContent =
      `${completion} · ${best} · ${clean} · ${progress.masteredVerbs.length}/4 realm verbs`;
    this.crystalTrench.dataset["completed"] = String(progress.completions > 0);
    this.crystalTrench.dataset["clean"] = String(progress.cleanCompletions > 0);
  }

  setDuskmawState(
    progress: Readonly<LeviathanGraveyardProgressV1>,
    unlocked: boolean,
    reviewRoute = false,
    integratedRoute = false,
  ): void {
    const available = unlocked || reviewRoute;
    this.duskmaw.disabled = !available;
    this.duskmaw.dataset["locked"] = String(!available);
    this.duskmaw.setAttribute(
      "aria-label",
      available
        ? integratedRoute
          ? "Enter Realm 3, Leviathan Graveyard Heartlight War"
          : "Enter the Version 44 R1 Heartlight War"
        : "Duskmaw pursuit locked; win the Crystal Trench Mirror Current",
    );
    if (!available) {
      this.duskmawDetail.textContent =
        "Locked · win the Crystal Trench Mirror Current to reveal Realm 3";
      this.duskmaw.dataset["completed"] = "false";
      this.duskmaw.dataset["clean"] = "false";
      return;
    }
    if (reviewRoute && !integratedRoute) {
      this.duskmawDetail.textContent =
        "Encounter review · defeat the three brood ranks · free Auralis · seal Duskmaw";
      return;
    }
    const victory = progress.victories > 0
      ? `${progress.victories} Heartlight victor${progress.victories === 1 ? "y" : "ies"}`
      : "Auralis remains imprisoned";
    const best = progress.bestVictorySec === null
      ? "no victory time"
      : `best ${progress.bestVictorySec.toFixed(1)}s`;
    const covenant = progress.mooncrestCovenant
      ? "Mooncrest Covenant active"
      : "Mooncrest Covenant unclaimed";
    this.duskmawDetail.textContent =
      `${victory} · ${best} · ${covenant} · ${progress.masteredVerbs.length}/9 realm verbs`;
    this.duskmaw.dataset["completed"] = String(progress.victories > 0);
    this.duskmaw.dataset["clean"] = String(progress.cleanVictories > 0);
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
