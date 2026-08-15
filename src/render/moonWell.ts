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
import type {
  RelicAtlasDestination,
  RelicAtlasId,
  RelicAtlasState,
} from "../meta/relicAtlas";
import type { LivingAtlasHotspot } from "./livingAtlasField";
import {
  LIVING_TIDE_STAGE_DEFINITIONS,
  crownTierForTideblooms,
  type LivingTideSeasonProgressV1,
} from "../season/livingTide";
import {
  ECLIPSE_COURT_COLLECTION_IDS,
  ECLIPSE_COURT_STAGE_DEFINITIONS,
  type EclipseCourtProgressV1,
} from "../content/eclipseCourt";

export type MoonWellPanel = "home" | "atlas" | "season" | "vault" | "wardrobe" | "objectives" | "leaderboard" | "settings";

export interface WardrobeItemPresentation {
  cosmetic: CosmeticDefinition;
  availability: CosmeticAvailability;
}

const RELIC_SILHOUETTES: Record<
  RelicAtlasId,
  { body: string; detail?: string; evenOdd?: boolean }
> = {
  "moonseed-fragment": {
    body: "M32 3C18 14 12 29 18 44C22 54 28 60 32 61C36 60 42 54 46 44C52 29 46 14 32 3Z",
    detail: "M32 11C27 22 29 34 23 49M32 11C37 23 34 36 41 47",
  },
  "manta-lullaby-shell": {
    body: "M32 10C25 16 11 15 4 33C15 29 23 34 32 53C41 34 49 29 60 33C53 15 39 16 32 10Z",
    detail: "M14 29C24 22 40 22 50 29M20 34C27 29 37 29 44 34",
  },
  "cathedral-hymn-page": {
    body: "M13 6L49 9L47 23L51 31L48 57L37 54L29 58L20 54L12 57L15 38L11 26L15 17Z",
    detail: "M21 21H42M20 30H40M21 39H44M20 48H35",
  },
  "prism-current-key": {
    body: "M32 3L46 17L39 28L36 42L48 44V53H38L35 62H26L28 42L25 28L18 17L32 3Z",
    detail: "M24 17L32 10L40 17L32 26Z",
  },
  "mirror-current-crest": {
    body: "M32 5C22 12 10 10 8 27C10 46 22 55 32 61C42 55 54 46 56 27C54 10 42 12 32 5Z",
    detail: "M15 32C22 25 27 39 32 31C37 23 42 38 49 29M18 42C25 36 28 47 34 39C40 32 43 43 47 38",
  },
  "auralis-mooncrest": {
    body: "M42 4C20 4 7 18 7 34C7 51 21 62 37 60C25 53 21 42 24 31C27 20 36 13 48 14C47 10 45 7 42 4ZM48 43L53 49L61 50L55 55L57 63L49 59L42 63L44 55L38 50L46 49Z",
    evenOdd: true,
  },
};

const RELIC_ARTIFACT_PALETTES: Record<
  RelicAtlasId,
  { primary: string; secondary: string; detail: string }
> = {
  "moonseed-fragment": { primary: "#fff2a8", secondary: "#8b63ff", detail: "#ffffff" },
  "manta-lullaby-shell": { primary: "#6ff5e2", secondary: "#398de8", detail: "#dffffb" },
  "cathedral-hymn-page": { primary: "#ffe6a3", secondary: "#54c6b8", detail: "#fff7d8" },
  "prism-current-key": { primary: "#84f2ff", secondary: "#ad6cff", detail: "#ffffff" },
  "mirror-current-crest": { primary: "#ffdfa0", secondary: "#4bcde2", detail: "#fff9e9" },
  "auralis-mooncrest": { primary: "#fff1ad", secondary: "#d16dff", detail: "#ffffff" },
};

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
  private readonly expeditionRestoration: HTMLButtonElement;
  private readonly expeditionRestorationTitle: HTMLElement;
  private readonly expeditionRestorationDetail: HTMLElement;
  private readonly atlasGrid: HTMLElement;
  private readonly atlasDetail: HTMLElement;
  private readonly atlasProgressLabel: HTMLElement;
  private readonly atlasProgressFill: HTMLElement;
  private readonly seasonPanel: HTMLElement;
  private readonly seasonWeek: HTMLElement;
  private readonly seasonStatus: HTMLElement;
  private readonly seasonBlooms: HTMLElement;
  private readonly seasonCrown: HTMLElement;
  private readonly seasonStart: HTMLButtonElement;
  private readonly vaultPanel: HTMLElement;
  private readonly vaultCycle: HTMLElement;
  private readonly vaultStatus: HTMLElement;
  private readonly vaultCollection: HTMLElement;
  private readonly vaultStart: HTMLButtonElement;
  private atlasState: RelicAtlasState | null = null;
  private selectedRelicId: RelicAtlasId | null = null;
  private atlasSelectionListener: ((id: RelicAtlasId) => void) | null = null;

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
    this.expeditionRestoration = root.createElement("button");
    this.expeditionRestoration.type = "button";
    this.expeditionRestoration.className = "moonwell-restoration";
    this.expeditionRestoration.setAttribute("aria-label", "Moon Garden restoration");
    this.expeditionRestoration.dataset.moonwellPanel = "atlas";
    this.expeditionRestoration.dataset.hudAction = "";
    this.expeditionRestorationTitle = root.createElement("strong");
    this.expeditionRestorationDetail = root.createElement("span");
    this.expeditionRestoration.append(
      this.expeditionRestorationTitle,
      this.expeditionRestorationDetail,
    );
    this.home.querySelector(".moonwell-invitation")?.after(
      this.expeditionRestoration,
    );
    this.atlasGrid = MoonWell.require(root, "moonwell-atlas-grid");
    this.atlasDetail = MoonWell.require(root, "moonwell-atlas-detail");
    this.atlasProgressLabel = MoonWell.require(root, "atlas-progress-label");
    this.atlasProgressFill = MoonWell.require(root, "atlas-progress-fill");
    this.seasonPanel = MoonWell.require(root, "moonwell-panel-season");
    this.seasonWeek = MoonWell.require(root, "living-tide-week");
    this.seasonStatus = MoonWell.require(root, "living-tide-status");
    this.seasonBlooms = MoonWell.require(root, "living-tide-blooms");
    this.seasonCrown = MoonWell.require(root, "living-tide-crown");
    this.seasonStart = MoonWell.requireButton(root, "living-tide-start");
    this.vaultPanel = MoonWell.require(root, "moonwell-panel-vault");
    this.vaultCycle = MoonWell.require(root, "eclipse-court-cycle");
    this.vaultStatus = MoonWell.require(root, "eclipse-court-status");
    this.vaultCollection = MoonWell.require(root, "eclipse-court-collection-count");
    this.vaultStart = MoonWell.requireButton(root, "eclipse-court-start");
    this.atlasGrid.addEventListener("click", (event) => {
      const button = event.target instanceof Element
        ? event.target.closest<HTMLButtonElement>("[data-atlas-relic]")
        : null;
      if (!button) return;
      event.stopPropagation();
      this.selectRelic(button.dataset.atlasRelic as RelicAtlasId);
    });
    for (const panel of ["atlas", "season", "vault", "wardrobe", "objectives", "leaderboard", "settings"] as const) {
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

  onLivingTideSeason(listener: () => void): void {
    this.wire(this.seasonStart, listener);
  }

  onEclipseCourt(listener: () => void): void {
    this.wire(this.vaultStart, listener);
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

  onAtlasAction(
    listener: (destination: RelicAtlasDestination, sourceId: string) => void,
  ): void {
    const atlasPanel = this.panels.get("atlas");
    atlasPanel?.addEventListener("pointerdown", (event) => event.stopPropagation());
    atlasPanel?.addEventListener("click", (event) => {
      const button = event.target instanceof Element
        ? event.target.closest<HTMLButtonElement>("[data-atlas-destination]")
        : null;
      if (!button) return;
      event.stopPropagation();
      const destination = button.dataset.atlasDestination as RelicAtlasDestination;
      const sourceId = button.dataset.atlasSource ?? "living-atlas";
      listener(destination, sourceId);
    });
  }

  onAtlasSelection(listener: (id: RelicAtlasId) => void): void {
    this.atlasSelectionListener = listener;
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

  get isAtlasOpen(): boolean {
    return this.isOpen && this.root.dataset.panel === "atlas";
  }

  showPanel(panel: MoonWellPanel): void {
    this.home.hidden = panel !== "home";
    for (const [name, element] of this.panels) element.hidden = name !== panel;
    this.root.dataset.panel = panel;
    if (panel === "atlas" && this.atlasState) {
      const defaultEntry = this.atlasState.entries.find(
        (entry) => entry.id === this.atlasState?.nextRelicId,
      ) ?? this.atlasState.entries.find(
        (entry) => entry.id === this.selectedRelicId,
      ) ?? this.atlasState.entries[0];
      if (defaultEntry) this.selectRelic(defaultEntry.id);
    }
  }

  positionAtlasNodes(
    positions: Readonly<Partial<Record<RelicAtlasId, LivingAtlasHotspot>>>,
  ): void {
    this.atlasGrid
      .querySelectorAll<HTMLButtonElement>("[data-atlas-relic]")
      .forEach((button) => {
        const id = button.dataset.atlasRelic as RelicAtlasId;
        const position = positions[id];
        if (!position) return;
        button.style.setProperty("--atlas-node-x", `${position.xPercent.toFixed(2)}%`);
        button.style.setProperty("--atlas-node-y", `${position.yPercent.toFixed(2)}%`);
      });
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

  setKelpCathedralState(
    progress: Readonly<KelpCathedralProgressV1>,
    unlocked = true,
  ): void {
    this.kelpCathedral.disabled = !unlocked;
    this.kelpCathedral.dataset["locked"] = String(!unlocked);
    this.kelpCathedral.setAttribute(
      "aria-label",
      unlocked
        ? "Enter Realm 1, Kelp Cathedral"
        : "Kelp Cathedral locked; restore the Moon Well with the Moonseed",
    );
    if (!unlocked) {
      this.kelpCathedralDetail.textContent =
        "Locked · recover the Moonseed and restore the Moon Well to open Realm 1";
      this.kelpCathedral.dataset["rescued"] = "false";
      this.kelpCathedral.dataset["relic"] = "false";
      return;
    }
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
        : "Crystal Trench locked; restore both Kelp Cathedral relics",
    );
    if (!unlocked) {
      this.crystalTrenchDetail.textContent =
        "Locked · rescue Miri and recover the Hymn Page to open Realm 2";
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
          : "Enter the Heartlight War"
        : "Duskmaw pursuit locked; win the Crystal Trench Mirror Current",
    );
    if (!available) {
      this.duskmawDetail.textContent =
        "Locked · win Crystal Trench and earn its clean crest to reveal Realm 3";
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
        : "Six clear steps · about 30 seconds";
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
    const relicCount = progress.discoveredRelics.includes("moonseed-fragment") ||
        progress.completionMarks.hiddenRelic ||
        progress.completionMarks.primaryObjective ||
        progress.moonWellRestored
      ? 1
      : 0;
    this.expeditionRestoration.dataset["restored"] = String(
      progress.moonWellRestored,
    );
    this.expeditionRestoration.dataset["relics"] = String(relicCount);
    this.expeditionRestorationTitle.textContent = progress.moonWellRestored
      ? "Moon Well restored"
      : "Moon Well restoration";
    const marks = [
      progress.completionMarks.primaryObjective ? "Primary" : null,
      progress.completionMarks.hiddenRelic ? "Moonseed" : null,
      progress.completionMarks.cleanPerformance ? "Clean chase" : null,
    ].filter((mark): mark is string => Boolean(mark));
    this.expeditionRestorationDetail.textContent =
      `Relic Atlas ${relicCount}/6${marks.length > 0 ? ` · ${marks.join(" · ")}` : " · Chapter 1 awaits"}`;
  }

  setRelicAtlasState(state: Readonly<RelicAtlasState>): void {
    this.atlasState = state;
    const fullyRestored = state.gameComplete;
    this.expeditionRestoration.dataset["restored"] = String(fullyRestored);
    this.expeditionRestoration.dataset["relics"] = String(state.recoveredCount);
    this.expeditionRestorationTitle.textContent = fullyRestored
      ? "The Living Tide is restored"
      : `Living Atlas · ${state.recoveredCount}/${state.entries.length} relics`;
    const nextEntry = state.entries.find((entry) => entry.id === state.nextRelicId) ?? null;
    this.expeditionRestorationDetail.textContent =
      nextEntry
        ? `Next · ${nextEntry.mapLabel} · ${nextEntry.visualRoute}`
        : state.gameComplete
          ? "Game complete · all six relics and four sanctums restored"
          : "All relics found · awaken the remaining sanctum";

    this.atlasProgressLabel.textContent = state.gameComplete
      ? `${state.recoveredCount} / ${state.entries.length} FOUND · KINGDOM RESTORED`
      : `${state.recoveredCount} / ${state.entries.length} FOUND · ${state.restoredDistrictCount} / ${state.districts.length} AWAKE`;
    this.atlasProgressFill.style.width =
      `${Math.round((state.recoveredCount / state.entries.length) * 100)}%`;

    this.atlasGrid.replaceChildren(...state.entries.map((entry) => {
      const card = this.root.ownerDocument.createElement("button");
      card.type = "button";
      card.className = "atlas-relic-node";
      card.dataset.atlasRelic = entry.id;
      card.dataset.district = entry.districtId;
      card.dataset.state = entry.state;
      card.dataset.next = String(entry.id === state.nextRelicId);
      card.dataset.selected = String(entry.id === this.selectedRelicId);
      card.setAttribute("aria-pressed", String(entry.id === this.selectedRelicId));
      card.setAttribute(
        "aria-label",
        `${entry.name}; ${entry.progressLabel}; ${entry.visualObjective}; ${entry.visualRoute}`,
      );
      const label = this.root.ownerDocument.createElement("strong");
      label.className = "atlas-node-label";
      label.textContent = entry.mapLabel;
      const stateMark = this.root.ownerDocument.createElement("i");
      stateMark.textContent = entry.state === "recovered"
        ? "FOUND"
        : entry.id === state.nextRelicId
          ? "NEXT"
          : entry.state === "available" ? "OPEN" : "LOCKED";
      stateMark.setAttribute("aria-hidden", "true");
      card.append(stateMark, label);
      return card;
    }));

    const selectedEntry = state.entries.find((entry) => entry.id === this.selectedRelicId) ??
      nextEntry ?? state.entries[0];
    if (selectedEntry) this.selectRelic(selectedEntry.id);
    if (state.gameComplete) this.renderGameCompleteDetail(state);
  }

  setLivingTideSeasonState(
    progress: Readonly<LivingTideSeasonProgressV1>,
    unlocked: boolean,
    weekId: string,
  ): void {
    const voyage = progress.activeVoyage;
    const complete = Boolean(voyage?.completedAt);
    const stageIndex = voyage && !complete ? voyage.currentStageIndex : 0;
    const currentStage = LIVING_TIDE_STAGE_DEFINITIONS[stageIndex] ??
      LIVING_TIDE_STAGE_DEFINITIONS[0];
    this.seasonPanel.dataset["unlocked"] = String(unlocked);
    this.seasonPanel.dataset["complete"] = String(complete);
    this.seasonPanel.style.setProperty(
      "--living-tide-stage-colour",
      currentStage?.colour ?? "#69f4c4",
    );
    this.seasonWeek.textContent = `WEEK OF ${weekId}`;
    this.seasonBlooms.textContent = `${progress.tideblooms} TIDEBLOOMS`;
    const crownTier = crownTierForTideblooms(progress.tideblooms);
    this.seasonCrown.dataset["tier"] = String(crownTier);
    this.seasonCrown.setAttribute(
      "aria-label",
      `Living Tide Crown tier ${crownTier} of 5`,
    );

    this.seasonPanel.querySelectorAll<HTMLElement>("[data-living-tide-stage]")
      .forEach((node, index) => {
        const completed = Boolean(voyage?.completedStages.includes(
          LIVING_TIDE_STAGE_DEFINITIONS[index]!.id,
        ));
        const perfect = Boolean(voyage?.perfectStages.includes(
          LIVING_TIDE_STAGE_DEFINITIONS[index]!.id,
        ));
        const state = completed
          ? perfect ? "perfect" : "complete"
          : !unlocked ? "locked" : index === stageIndex ? "current" : "waiting";
        node.dataset["state"] = state;
      });

    if (!unlocked) {
      this.seasonStatus.textContent = "Restore all 6 relics to awaken the voyage";
      this.seasonStart.textContent = "Complete the Living Atlas first";
      this.seasonStart.disabled = true;
      return;
    }
    this.seasonStart.disabled = false;
    if (!voyage) {
      this.seasonStatus.textContent = "Three living currents · one connected voyage";
      this.seasonStart.textContent = "Begin Living Tide Voyage";
    } else if (complete) {
      this.seasonStatus.textContent = voyage.perfectStages.length === 3
        ? "Perfect voyage · the Crown remembers"
        : `Voyage ${voyage.voyageNumber} complete · ${voyage.perfectStages.length}/3 radiant`;
      this.seasonStart.textContent = "Begin Another Voyage";
    } else {
      this.seasonStatus.textContent = `${stageIndex + 1}/3 · ${currentStage!.objective}`;
      this.seasonStart.textContent = `Enter ${currentStage!.title}`;
    }
  }

  setEclipseCourtState(
    progress: Readonly<EclipseCourtProgressV1>,
    unlocked: boolean,
    weekId: string,
    playtestMode = false,
  ): void {
    const activeRun = progress.activeRun;
    const complete = Boolean(activeRun?.completedAt);
    const stageIndex = activeRun && !complete ? activeRun.currentStageIndex : 0;
    const currentStage = ECLIPSE_COURT_STAGE_DEFINITIONS[stageIndex] ??
      ECLIPSE_COURT_STAGE_DEFINITIONS[0];
    this.vaultPanel.dataset["unlocked"] = String(unlocked);
    this.vaultPanel.dataset["complete"] = String(complete);
    this.vaultPanel.dataset["playtest"] = String(playtestMode);
    this.vaultPanel.style.setProperty(
      "--eclipse-court-accent",
      currentStage?.colour ?? "#ffd17d",
    );
    this.vaultCycle.textContent = playtestMode
      ? "REALM PACK 01 · ECLIPSE COURT"
      : `REALM PACK 01 · WEEK OF ${weekId}`;
    this.vaultCollection.textContent =
      `${progress.collectionIds.length}/${ECLIPSE_COURT_COLLECTION_IDS.length} COLLECTION`;

    this.vaultPanel.querySelectorAll<HTMLElement>("[data-eclipse-court-stage]")
      .forEach((node, index) => {
        const definition = ECLIPSE_COURT_STAGE_DEFINITIONS[index]!;
        const completed = Boolean(activeRun?.completedStages.includes(definition.id));
        const perfect = Boolean(activeRun?.perfectStages.includes(definition.id));
        node.dataset["state"] = completed
          ? perfect ? "perfect" : "complete"
          : !unlocked ? "locked" : index === stageIndex ? "current" : "waiting";
      });
    this.vaultPanel.querySelectorAll<HTMLElement>("[data-eclipse-court-collection]")
      .forEach((node) => {
        const id = node.dataset.eclipseCourtCollection ?? "";
        node.dataset["owned"] = String(
          progress.collectionIds.some((ownedId) => ownedId === id),
        );
      });

    if (!unlocked) {
      this.vaultStatus.textContent = "Restore all 6 relics to unseal the Court";
      this.vaultStart.textContent = "Complete the Living Atlas first";
      this.vaultStart.disabled = true;
      return;
    }
    this.vaultStart.disabled = false;
    if (!activeRun) {
      this.vaultStatus.textContent = playtestMode
        ? "Three living courts · one uninterrupted eclipse"
        : "Enter the First Moonseed · awaken its twelve-petalled living Court";
      this.vaultStart.textContent = playtestMode
        ? "Begin Full Eclipse Court"
        : "Unseal Eclipse Court";
    } else if (complete) {
      this.vaultStatus.textContent = playtestMode
        ? `Court restored · ${activeRun.perfectStages.length}/3 radiant`
        : activeRun.perfectStages.length === 3
          ? "Perfect Court · the full constellation burns"
          : `Court restored · ${activeRun.perfectStages.length}/3 radiant`;
      this.vaultStart.textContent = playtestMode
        ? "Replay Full Eclipse Court"
        : "Enter Another Eclipse";
    } else {
      this.vaultStatus.textContent =
        `${stageIndex + 1}/3 · ${currentStage!.objective}`;
      this.vaultStart.textContent = playtestMode
        ? `Enter ${currentStage!.title}`
        : `Enter ${currentStage!.title}`;
    }
  }

  private renderGameCompleteDetail(state: Readonly<RelicAtlasState>): void {
    const mooncrest = state.entries.find((entry) => entry.id === "auralis-mooncrest");
    if (!mooncrest) return;
    this.atlasDetail.dataset["kind"] = "completion";
    this.atlasDetail.dataset["state"] = "recovered";
    const artifact = this.createRelicArtifact(mooncrest);
    const copy = this.root.ownerDocument.createElement("div");
    copy.className = "atlas-target-copy";
    const eyebrow = this.root.ownerDocument.createElement("span");
    eyebrow.className = "atlas-detail-eyebrow";
    eyebrow.textContent = "GAME COMPLETE · 6/6 RELICS";
    const title = this.root.ownerDocument.createElement("h3");
    title.textContent = "The Living Tide Endures";
    const route = this.root.ownerDocument.createElement("p");
    route.className = "atlas-target-clue";
    route.textContent = "All four sanctums are awake";
    const effect = this.root.ownerDocument.createElement("span");
    effect.className = "atlas-target-effect";
    effect.textContent = "Auralis guards every restored current";
    copy.append(eyebrow, title, route, effect);
    const actionButton = this.createAtlasAction(
      "living-tide-season",
      "living-tide-complete",
      "Enter Living Tide Season One",
      "Begin the connected three-current voyage beyond the restored Atlas.",
    );
    this.atlasDetail.replaceChildren(artifact, copy, actionButton);
  }

  private selectRelic(id: RelicAtlasId): void {
    const entry = this.atlasState?.entries.find((candidate) => candidate.id === id);
    if (!entry) return;
    this.selectedRelicId = id;
    this.atlasGrid.querySelectorAll<HTMLButtonElement>("[data-atlas-relic]").forEach((button) => {
      const selected = button.dataset.atlasRelic === id;
      button.dataset.selected = String(selected);
      button.setAttribute("aria-pressed", String(selected));
    });
    this.renderRelicDetail(entry);
    this.atlasSelectionListener?.(id);
  }

  private createAtlasAction(
    destination: RelicAtlasDestination,
    sourceId: string,
    labelText: string,
    guidance: string,
  ): HTMLButtonElement {
    const button = this.root.ownerDocument.createElement("button");
    button.type = "button";
    button.className = "atlas-story-action";
    button.dataset.atlasDestination = destination;
    button.dataset.atlasSource = sourceId;
    button.setAttribute("aria-label", `${labelText}. ${guidance}`);
    const label = this.root.ownerDocument.createElement("strong");
    label.textContent = labelText;
    const arrow = this.root.ownerDocument.createElement("span");
    arrow.textContent = "→";
    arrow.setAttribute("aria-hidden", "true");
    button.append(label, arrow);
    return button;
  }

  private createRelicArtifact(
    entry: RelicAtlasState["entries"][number],
  ): HTMLElement {
    const wrap = this.root.ownerDocument.createElement("div");
    wrap.className = entry.state === "recovered"
      ? "atlas-target-artifact atlas-recovered-artifact"
      : "atlas-target-artifact atlas-relic-silhouette";
    wrap.dataset.relic = entry.id;
    wrap.dataset.state = entry.state;
    wrap.setAttribute("aria-hidden", "true");
    const svg = this.root.ownerDocument.createElementNS(
      "http://www.w3.org/2000/svg",
      "svg",
    );
    svg.setAttribute("viewBox", "0 0 64 64");
    svg.setAttribute("focusable", "false");
    const spec = RELIC_SILHOUETTES[entry.id];
    const palette = RELIC_ARTIFACT_PALETTES[entry.id];
    let recoveredFill: string | null = null;
    if (entry.state === "recovered") {
      const gradientId = `atlas-artifact-${entry.id}`;
      const defs = this.root.ownerDocument.createElementNS(
        "http://www.w3.org/2000/svg",
        "defs",
      );
      const gradient = this.root.ownerDocument.createElementNS(
        "http://www.w3.org/2000/svg",
        "linearGradient",
      );
      gradient.setAttribute("id", gradientId);
      gradient.setAttribute("x1", "0");
      gradient.setAttribute("y1", "0");
      gradient.setAttribute("x2", "1");
      gradient.setAttribute("y2", "1");
      for (const [offset, colour] of [["0%", palette.primary], ["100%", palette.secondary]] as const) {
        const stop = this.root.ownerDocument.createElementNS(
          "http://www.w3.org/2000/svg",
          "stop",
        );
        stop.setAttribute("offset", offset);
        stop.setAttribute("stop-color", colour);
        gradient.append(stop);
      }
      defs.append(gradient);
      svg.append(defs);
      recoveredFill = `url(#${gradientId})`;
    }
    const body = this.root.ownerDocument.createElementNS(
      "http://www.w3.org/2000/svg",
      "path",
    );
    body.setAttribute("d", spec.body);
    body.setAttribute("class", "atlas-artifact-body");
    if (recoveredFill) body.setAttribute("style", `fill:${recoveredFill}`);
    if (spec.evenOdd) body.setAttribute("fill-rule", "evenodd");
    svg.append(body);
    if (spec.detail) {
      const detail = this.root.ownerDocument.createElementNS(
        "http://www.w3.org/2000/svg",
        "path",
      );
      detail.setAttribute("d", spec.detail);
      detail.setAttribute("class", "atlas-artifact-detail");
      if (entry.state === "recovered") {
        detail.setAttribute("style", `stroke:${palette.detail}`);
      }
      svg.append(detail);
    }
    const caption = this.root.ownerDocument.createElement("span");
    caption.textContent = entry.state === "recovered"
      ? "OWNED"
      : entry.state === "locked" ? "LOCKED" : "FIND";
    wrap.append(svg, caption);
    return wrap;
  }

  private renderRelicDetail(entry: RelicAtlasState["entries"][number]): void {
    this.atlasDetail.dataset["kind"] = "memory";
    this.atlasDetail.dataset["state"] = entry.state;
    const artifact = this.createRelicArtifact(entry);
    const copy = this.root.ownerDocument.createElement("div");
    copy.className = "atlas-target-copy";
    const eyebrow = this.root.ownerDocument.createElement("span");
    eyebrow.className = "atlas-detail-eyebrow";
    const realmName = entry.realm.replace(/^Realm \d+ · /, "");
    eyebrow.textContent = `${realmName} · ${entry.state === "recovered" ? "RECOVERED" : entry.state === "locked" ? "LOCKED CLUE" : "NEXT RELIC"}`;
    const title = this.root.ownerDocument.createElement("h3");
    title.textContent = entry.state === "recovered"
      ? entry.name
      : `Find ${entry.name}`;
    const route = this.root.ownerDocument.createElement("p");
    route.className = "atlas-target-clue";
    route.textContent = entry.visualRoute;
    const effect = this.root.ownerDocument.createElement("span");
    effect.className = "atlas-target-effect";
    effect.textContent = entry.visualEffect;
    copy.append(eyebrow, title, route, effect);
    const actionButton = this.createAtlasAction(
      entry.action.destination,
      entry.id,
      entry.action.label,
      entry.action.guidance,
    );
    this.atlasDetail.replaceChildren(
      artifact,
      copy,
      actionButton,
    );
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
        ? cosmetic.source === "realm-pack"
          ? `${categoryLabels[cosmetic.category]} · ${cosmetic.sourceLabel ?? "Realm Pack reward"}`
          : `${categoryLabels[cosmetic.category]} · Tide ${cosmetic.unlockLevel}`
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
      preview.disabled = availability === "locked" && cosmetic.source !== "realm-pack";
      const action = document.createElement("button");
      action.type = "button";
      action.dataset.wardrobeAction = cosmetic.id;
      action.dataset.hudAction = "";
      action.textContent = availability === "locked"
        ? cosmetic.source === "realm-pack" ? "Realm Pack" : `Tide ${cosmetic.unlockLevel}`
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
