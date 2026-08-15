import {
  CLEAN_TIDE_SPRINT_FINISH_UNITS,
  CLEAN_TIDE_SPRINT_PLAN_HASH,
  CleanTideSprintDirector,
  tideSprintDragDeltaToTarget,
  tideSprintThrottleMode,
  tideSprintVerticalDragToThrottle,
  TIDE_SPRINT_DEFAULT_THROTTLE,
  TIDE_SPRINT_SPEED_PROFILES,
  type CleanTideSprintResult,
  type CleanTideSprintSnapshot,
} from "./director";
import {
  TIDE_SPRINT_CREW,
  TIDE_SPRINT_CREW_IDS,
  TideSprintCrewStore,
  tideSprintCrewMember,
  type TideSprintCrewId,
} from "./crew";
import {
  TIDE_SPRINT_CURRENT_RINGS,
  TIDE_SPRINT_LANE_HALF_WIDTH,
  tideSprintSectionLabel,
} from "./course";
import type { CleanTideSprintView } from "./view";
import {
  TideSprintGhostPlayback,
  TideSprintGhostRecorder,
} from "./ghost";
import {
  TIDE_SPRINT_OBJECTIVES,
  type TideSprintProgressV1,
} from "./progress";
import {
  ProgressRepository,
  type GlowfinProgressV2,
} from "../persistence/progress";
import { tideProgressForXp } from "../meta/progression";
import {
  createRunId,
  HostedTelemetryTransport,
  TelemetryClient,
} from "../telemetry/telemetry";

const FIXED_DT_SEC = 1 / 120;
const COUNTDOWN_SEC = 3;
const moduleStartedAtMs = performance.now();

type TideSprintViewConstructor = new (
  canvas: HTMLCanvasElement,
) => CleanTideSprintView;

function required<T extends HTMLElement>(id: string): T {
  const element = document.getElementById(id);
  if (!element) throw new Error(`Missing Tide Sprint element #${id}.`);
  return element as T;
}

const canvas = required<HTMLCanvasElement>("race-canvas");
const lobby = required<HTMLElement>("race-lobby");
const raceHud = required<HTMLElement>("race-hud");
const resultPanel = required<HTMLElement>("race-result");
const startButton = required<HTMLButtonElement>("race-start");
const practiceButton = required<HTMLButtonElement>("race-practice");
const rematchButton = required<HTMLButtonElement>("race-rematch");
const changeCrewButton = required<HTMLButtonElement>("race-change-crew");
const progressFill = required<HTMLElement>("race-progress-fill");
const progressLabel = required<HTMLElement>("race-progress-label");
const rankLabel = required<HTMLElement>("race-rank");
const timeLabel = required<HTMLElement>("race-time");
const sectionLabel = required<HTMLElement>("race-section");
const speedLabel = required<HTMLElement>("race-speed");
const boostCount = required<HTMLElement>("race-boost-count");
const touchControl = required<HTMLElement>("race-touch-control");
const touchThumb = required<HTMLElement>("race-touch-thumb");
const controlCoach = required<HTMLElement>("race-control-coach");
const controlCoachStep = required<HTMLElement>("race-control-coach-step");
const controlCoachTitle = required<HTMLElement>("race-control-coach-title");
const controlCoachDetail = required<HTMLElement>("race-control-coach-detail");
const feedback = required<HTMLElement>("race-feedback");
const boostFlash = required<HTMLElement>("race-boost-flash");
const countdown = required<HTMLElement>("race-countdown");
const resultTitle = required<HTMLElement>("race-result-title");
const resultDetail = required<HTMLElement>("race-result-detail");
const podium = required<HTMLElement>("race-podium");
const bondLabel = required<HTMLElement>("race-bond");
const runtime = required<HTMLElement>("race-runtime");
const runtimeTitle = required<HTMLElement>("race-runtime-title");
const runtimeDetail = required<HTMLElement>("race-runtime-detail");
const runtimeReload = required<HTMLButtonElement>("race-runtime-reload");
const walletLabel = required<HTMLElement>("race-wallet");
const bestLabel = required<HTMLElement>("race-best");
const ghostLabel = required<HTMLElement>("race-ghost-status");
const objectiveList = required<HTMLElement>("race-objectives");
const mainRewardLabel = required<HTMLElement>("race-main-reward");

function storage(): Pick<Storage, "getItem" | "setItem"> {
  try {
    return window.localStorage;
  } catch {
    const memory = new Map<string, string>();
    return {
      getItem: (key) => memory.get(key) ?? null,
      setItem: (key, value) => { memory.set(key, value); },
    };
  }
}

const CONTROL_TUTORIAL_KEY = "glowfin.tide-sprint.controls.r8";
const deviceStorage = storage();
const progressRepository = new ProgressRepository(deviceStorage);
const progressLoad = progressRepository.load();
let glowfinProgress: GlowfinProgressV2 = progressLoad.progress;
const legacyCrewProgress = new TideSprintCrewStore(deviceStorage).load();
glowfinProgress = progressRepository.importLegacyTideSprintCrew(
  legacyCrewProgress.selected,
  legacyCrewProgress.bonds,
);
let crewProgress: TideSprintProgressV1 = glowfinProgress.tideSprint;
let selected: TideSprintCrewId = crewProgress.selected;
const telemetry = new TelemetryClient(
  glowfinProgress.telemetryConsent,
  new HostedTelemetryTransport(),
);
if (progressLoad.recoveryReason) {
  telemetry.track("save_recovered", {
    domain: "shared-progress",
    recoveredFrom: progressLoad.recoveredFrom,
    reason: progressLoad.recoveryReason,
  });
}
telemetry.track("tide_sprint_entry", {
  planHash: CLEAN_TIDE_SPRINT_PLAN_HASH,
  integrated: true,
});
let director = new CleanTideSprintDirector();
let view: CleanTideSprintView | null = null;
let viewConstructor: TideSprintViewConstructor | null = null;
let viewLoadPromise: Promise<TideSprintViewConstructor> | null = null;
let ghostRecorder: TideSprintGhostRecorder | null = null;
let activeRunId: string | null = null;
let running = false;
let starting = false;
let lobbyReadyAtMs = 0;
let raceEngineReadyAtMs: number | null = null;
let animationFrame = 0;
let lastFrameMs = 0;
let accumulatorSec = 0;
let steeringTarget = 0;
let throttleTarget = TIDE_SPRINT_DEFAULT_THROTTLE;
let keyboardDirection = 0;
let keyboardThrottleDirection: -1 | 0 | 1 = 0;
let countdownRemaining = 0;
let goSignalRemaining = 0;
let feedbackUntilSec = 0;
let boostFlashUntilSec = 0;
let activePointerId: number | null = null;
let pointerStartX = 0;
let pointerStartY = 0;
let pointerStartTarget = 0;
let controlTutorialStage: "surge" | "brake" | "steer" | null = null;
let lifecyclePaused = false;
let contextLost = false;
let contextLosses = 0;
let successfulRecoveries = 0;
let lifecycleInterruptions = 0;

function publishRuntimeState(state: string): void {
  document.documentElement.dataset["tideSprintRuntime"] = state;
  canvas.dataset["runtime"] = state;
  canvas.dataset["contextLosses"] = String(contextLosses);
  canvas.dataset["contextRecoveries"] = String(successfulRecoveries);
  canvas.dataset["interruptions"] = String(lifecycleInterruptions);
}

function loadRaceEngine(): Promise<TideSprintViewConstructor> {
  if (viewConstructor) return Promise.resolve(viewConstructor);
  if (!viewLoadPromise) {
    viewLoadPromise = import("./view").then((module) => {
      const View = module.CleanTideSprintView;
      viewConstructor = View;
      raceEngineReadyAtMs = performance.now();
      document.documentElement.dataset["raceEngine"] = "ready";
      return View;
    }).catch((error: unknown) => {
      viewLoadPromise = null;
      document.documentElement.dataset["raceEngine"] = "failed";
      throw error;
    });
  }
  return viewLoadPromise;
}

function ordinal(value: number): string {
  return value === 1 ? "1st" : value === 2 ? "2nd" : value === 3 ? "3rd" : `${value}th`;
}

function controlTutorialCompleted(): boolean {
  return deviceStorage.getItem(CONTROL_TUTORIAL_KEY) === "complete";
}

function rememberControlTutorial(): void {
  try {
    deviceStorage.setItem(CONTROL_TUTORIAL_KEY, "complete");
  } catch {
    // The practice can still finish when private browsing blocks persistence.
  }
}

function syncThrottleVisual(throttle: number): void {
  const mode = tideSprintThrottleMode(throttle);
  const cruise = TIDE_SPRINT_DEFAULT_THROTTLE;
  const slow = TIDE_SPRINT_SPEED_PROFILES.slow.throttle;
  const sprint = TIDE_SPRINT_SPEED_PROFILES.sprint.throttle;
  const displacement = throttle >= cruise
    ? -(throttle - cruise) / Math.max(0.001, sprint - cruise) * 48
    : (cruise - throttle) / Math.max(0.001, cruise - slow) * 48;
  touchControl.dataset["mode"] = mode;
  touchThumb.style.setProperty("--touch-thumb-y", `${displacement.toFixed(1)}px`);
}

function showTouchControl(clientX: number, clientY: number): void {
  const halfWidth = 48;
  const halfHeight = 90;
  const x = Math.max(halfWidth, Math.min(window.innerWidth - halfWidth, clientX));
  const y = Math.max(halfHeight + 82, Math.min(window.innerHeight - halfHeight - 20, clientY));
  touchControl.style.setProperty("--touch-x", `${x}px`);
  touchControl.style.setProperty("--touch-y", `${y}px`);
  touchControl.dataset["active"] = "true";
  syncThrottleVisual(throttleTarget);
}

function hideTouchControl(): void {
  touchControl.dataset["active"] = "false";
}

function updateControlCoach(): void {
  controlCoach.dataset["stage"] = controlTutorialStage ?? "none";
  if (controlTutorialStage === null) {
    controlCoach.dataset["active"] = "false";
    return;
  }
  controlCoach.dataset["active"] = "true";
  if (controlTutorialStage === "surge") {
    controlCoachStep.textContent = "1 / 3";
    controlCoachTitle.textContent = "↑";
    controlCoachDetail.textContent = "SURGE";
    controlCoach.setAttribute("aria-label", "Step 1 of 3. Touch the water, slide upward, and hold to surge.");
    return;
  }
  if (controlTutorialStage === "brake") {
    controlCoachStep.textContent = "2 / 3";
    controlCoachTitle.textContent = "↓";
    controlCoachDetail.textContent = "BRAKE";
    controlCoach.setAttribute("aria-label", "Step 2 of 3. Touch the water, slide downward, and hold to brake.");
    return;
  }
  controlCoachStep.textContent = "3 / 3";
  controlCoachTitle.textContent = "↔";
  controlCoachDetail.textContent = "STEER";
  controlCoach.setAttribute("aria-label", "Step 3 of 3. Touch the water and drag left or right to steer.");
}

function beginControlTutorial(): void {
  throttleTarget = TIDE_SPRINT_DEFAULT_THROTTLE;
  syncThrottleVisual(throttleTarget);
  controlTutorialStage = "surge";
  countdownRemaining = 0;
  goSignalRemaining = 0;
  updateControlCoach();
}

function completeControlTutorial(): void {
  rememberControlTutorial();
  practiceButton.textContent = "Review swim controls";
  controlTutorialStage = null;
  steeringTarget = 0;
  throttleTarget = TIDE_SPRINT_DEFAULT_THROTTLE;
  syncThrottleVisual(throttleTarget);
  hideTouchControl();
  updateControlCoach();
  countdownRemaining = COUNTDOWN_SEC;
  showFeedback("READY", "speed");
}

function renderModeMeta(): void {
  const tide = tideProgressForXp(glowfinProgress.progression.tideXp);
  walletLabel.textContent = `Tide ${tide.level} · ${glowfinProgress.progression.lumenPearls.toLocaleString()} Lumen Pearls`;
  bestLabel.textContent = crewProgress.bestFinishSec === null
    ? "No finish yet"
    : `Best ${crewProgress.bestFinishSec.toFixed(2)}s · ${crewProgress.totals.wins} win${crewProgress.totals.wins === 1 ? "" : "s"}`;
  const compatibleGhost = crewProgress.bestGhost?.planHash ===
    CLEAN_TIDE_SPRINT_PLAN_HASH;
  ghostLabel.textContent = !glowfinProgress.ghostEnabled
    ? "Personal Best Echo off in Moon Well settings"
    : compatibleGhost
      ? `Best Echo ready · ${crewProgress.bestGhost!.finishSec.toFixed(2)}s`
      : "Preset Tide Echo · your best finish will replace it";
  const completed = new Set(crewProgress.completedObjectives);
  objectiveList.replaceChildren(...TIDE_SPRINT_OBJECTIVES.map((objective) => {
    const row = document.createElement("li");
    row.dataset["complete"] = String(completed.has(objective.id));
    const copy = document.createElement("span");
    copy.textContent = objective.label;
    const reward = document.createElement("strong");
    reward.textContent = completed.has(objective.id)
      ? "Complete"
      : `+${objective.rewardPearls} Pearls · +${objective.rewardXp} XP`;
    row.append(copy, reward);
    return row;
  }));
}

function renderCrew(): void {
  for (const button of Array.from(
    document.querySelectorAll<HTMLButtonElement>("[data-character]"),
  )) {
    const id = button.dataset["character"] as TideSprintCrewId | undefined;
    if (!id || !TIDE_SPRINT_CREW_IDS.includes(id)) continue;
    const member = tideSprintCrewMember(id);
    button.dataset["selected"] = String(id === selected);
    button.setAttribute("aria-pressed", String(id === selected));
    const bond = button.querySelector<HTMLElement>("[data-bond]");
    if (bond) bond.textContent = `Bond ${crewProgress.bonds[id]}`;
    button.style.setProperty("--crew-colour", member.colour);
    button.style.setProperty("--crew-accent", member.accent);
  }
  const member = tideSprintCrewMember(selected);
  if (!starting) {
    startButton.innerHTML = `<strong>Race as ${member.name}</strong><span>Enter the Moon Current</span>`;
  }
  renderModeMeta();
}

for (const button of Array.from(
  document.querySelectorAll<HTMLButtonElement>("[data-character]"),
)) {
  button.addEventListener("click", () => {
    const id = button.dataset["character"] as TideSprintCrewId | undefined;
    if (!id || !TIDE_SPRINT_CREW_IDS.includes(id) || running) return;
    selected = id;
    glowfinProgress = progressRepository.selectTideSprintCrew(selected);
    crewProgress = glowfinProgress.tideSprint;
    renderCrew();
  });
}

function publishHud(snapshot: CleanTideSprintSnapshot): void {
  const percent = Math.round(snapshot.progress * 100);
  progressFill.style.width = `${percent}%`;
  progressLabel.textContent = `${percent}% · ${Math.round(
    snapshot.progress * CLEAN_TIDE_SPRINT_FINISH_UNITS,
  )}/${CLEAN_TIDE_SPRINT_FINISH_UNITS}`;
  rankLabel.textContent = `${ordinal(snapshot.rank)} / 4`;
  timeLabel.textContent = `${snapshot.elapsedSec.toFixed(1)}s`;
  sectionLabel.textContent = tideSprintSectionLabel(snapshot.section);
  const mode = tideSprintThrottleMode(snapshot.player.throttle);
  speedLabel.dataset["mode"] = mode;
  speedLabel.textContent = snapshot.player.speed.toFixed(1);
  speedLabel.setAttribute(
    "aria-label",
    `${tideSprintCrewMember(snapshot.selected).name} speed ${snapshot.player.speed.toFixed(1)}, ${mode}`,
  );
  boostCount.textContent = `◎ ${snapshot.player.boosts}/${TIDE_SPRINT_CURRENT_RINGS.length}`;
  boostCount.dataset["active"] = String(snapshot.player.boost > 0);
  boostCount.setAttribute(
    "aria-label",
    `${snapshot.player.boosts} of ${TIDE_SPRINT_CURRENT_RINGS.length} Current Rings captured${snapshot.player.boost > 0 ? ", boost active" : ""}`,
  );
  if (snapshot.elapsedSec >= feedbackUntilSec) feedback.dataset["active"] = "false";
  if (snapshot.elapsedSec >= boostFlashUntilSec) boostFlash.dataset["active"] = "false";
}

function showFeedback(message: string, kind: "boost" | "collision" | "rank" | "speed"): void {
  feedback.textContent = message;
  feedback.dataset["kind"] = kind;
  feedback.dataset["active"] = "true";
  feedbackUntilSec = director.snapshot().elapsedSec + 1.35;
  if (kind === "boost") {
    boostFlash.dataset["active"] = "false";
    void boostFlash.offsetWidth;
    boostFlash.dataset["active"] = "true";
    boostFlashUntilSec = director.snapshot().elapsedSec + 0.58;
  }
}

function showRuntimeFailure(stage: string, error: unknown): void {
  const detail = error instanceof Error ? `${error.name}: ${error.message}` : String(error);
  runtime.dataset["active"] = "true";
  runtimeTitle.textContent = "Tide Sprint could not start";
  runtimeDetail.textContent = `${stage} · ${detail.slice(0, 180)}`;
  startButton.disabled = false;
  publishRuntimeState("failed");
  telemetry.track("startup_failure", {
    mode: "tide-sprint",
    stage,
    detail: detail.slice(0, 96),
  }, activeRunId);
}

function renderResult(result: CleanTideSprintResult): void {
  const member = tideSprintCrewMember(result.selected);
  const runId = activeRunId ?? createRunId();
  const ghost = ghostRecorder?.finish(result.elapsedSec) ?? null;
  const recorded = progressRepository.recordTideSprintRace({
    runId,
    selected: result.selected,
    placement: result.placement,
    elapsedSec: result.elapsedSec,
    boostsCollected: result.boostsCollected,
    collisions: result.collisions,
    ghost,
  });
  glowfinProgress = recorded.progress;
  crewProgress = glowfinProgress.tideSprint;
  const playerStanding = result.standings.find((standing) => standing.player);
  const winner = result.standings[0];
  const runnerUp = result.standings[1];
  const finishGap = result.placement === 1
    ? Math.max(0, (runnerUp?.finishSec ?? result.elapsedSec) - result.elapsedSec)
    : Math.max(0, (playerStanding?.finishSec ?? result.elapsedSec) - (winner?.finishSec ?? result.elapsedSec));
  const finishCopy = result.placement === 1
    ? `Won by ${finishGap.toFixed(2)}s`
    : `${finishGap.toFixed(2)}s behind`;
  resultTitle.textContent = `${finishGap <= 0.8 ? "Photo finish · " : ""}${ordinal(result.placement)} place`;
  resultDetail.textContent = `${finishCopy} · ${result.elapsedSec.toFixed(2)}s · ${result.boostsCollected}/${TIDE_SPRINT_CURRENT_RINGS.length} Current Rings · ${result.collisions} collisions · +${recorded.award.bond} cosmetic Bond`;
  const objectiveCopy = recorded.award.newlyCompletedObjectives.length > 0
    ? ` · ${recorded.award.newlyCompletedObjectives.map((objective) => objective.label).join(" · ")}`
    : "";
  mainRewardLabel.textContent = recorded.duplicateRewardPrevented
    ? "Reward already claimed for this race."
    : `+${recorded.award.pearls} Lumen Pearls · +${recorded.award.xp} Tide XP${recorded.newBest ? " · New best" : ""}${recorded.ghostSaved ? " · Best Echo saved" : ""}${objectiveCopy}`;
  bondLabel.textContent = `${member.name} Bond ${crewProgress.bonds[result.selected]}`;
  podium.replaceChildren(...result.standings.map((standing, index) => {
    const row = document.createElement("li");
    const racer = tideSprintCrewMember(standing.character);
    row.dataset["player"] = String(standing.player);
    row.style.setProperty("--podium-colour", racer.colour);
    row.innerHTML = `<b>${index + 1}</b><span><strong>${standing.player ? "You" : standing.label}</strong><small>${racer.name}${standing.ghost ? " · verified echo" : ""}</small></span><em>${standing.finishSec.toFixed(2)}s</em>`;
    return row;
  }));
  resultPanel.dataset["active"] = "true";
  raceHud.dataset["active"] = "false";
  telemetry.track("tide_sprint_complete", {
    planHash: CLEAN_TIDE_SPRINT_PLAN_HASH,
    placement: result.placement,
    elapsedSec: result.elapsedSec,
    finishGap,
    boosts: result.boostsCollected,
    collisions: result.collisions,
  }, runId);
  if (recorded.award.pearls > 0 || recorded.award.xp > 0) {
    telemetry.track("reward_granted", {
      mode: "tide-sprint",
      pearls: recorded.award.pearls,
      xp: recorded.award.xp,
    }, runId);
  }
  for (const objective of recorded.award.newlyCompletedObjectives) {
    telemetry.track("objective_complete", {
      mode: "tide-sprint",
      objectiveId: objective.id,
    }, runId);
  }
  if (recorded.ghostSaved) {
    telemetry.track("tide_sprint_ghost_saved", {
      planHash: CLEAN_TIDE_SPRINT_PLAN_HASH,
      finishSec: result.elapsedSec,
      frames: ghost?.frameCount ?? 0,
    }, runId);
  }
  activeRunId = null;
  ghostRecorder = null;
  void telemetry.flush();
  renderCrew();
}

function fixedStep(): void {
  if (keyboardDirection !== 0) {
    steeringTarget = Math.max(
      -TIDE_SPRINT_LANE_HALF_WIDTH,
      Math.min(
        TIDE_SPRINT_LANE_HALF_WIDTH,
        steeringTarget + keyboardDirection * 5.8 * FIXED_DT_SEC,
      ),
    );
  }
  if (keyboardThrottleDirection !== 0) {
    throttleTarget = keyboardThrottleDirection > 0
      ? TIDE_SPRINT_SPEED_PROFILES.sprint.throttle
      : TIDE_SPRINT_SPEED_PROFILES.slow.throttle;
    syncThrottleVisual(throttleTarget);
  }
  const control = {
    targetLateral: steeringTarget,
    throttle: throttleTarget,
  };
  ghostRecorder?.record(control);
  const events = director.step(FIXED_DT_SEC, control);
  const snapshot = director.snapshot();
  if (events.boosted) showFeedback(`MOONFLASH ×${snapshot.player.chain}`, "boost");
  if (events.collision) showFeedback("Reef impact · recover the current", "collision");
  if (events.rankChanged && events.rankChanged < 4) {
    showFeedback(`${ordinal(events.rankChanged)} place`, "rank");
  }
  if (events.finished) {
    running = false;
    const result = director.result();
    if (result) renderResult(result);
  }
}

function frame(nowMs: number): void {
  if (!view || lifecyclePaused || contextLost) return;
  const frameSec = lastFrameMs === 0
    ? 0
    : Math.min(0.1, Math.max(0, (nowMs - lastFrameMs) / 1000));
  lastFrameMs = nowMs;

  if (running && controlTutorialStage !== null) {
    countdown.dataset["active"] = "false";
  } else if (running && countdownRemaining > 0) {
    countdownRemaining = Math.max(0, countdownRemaining - frameSec);
    countdown.dataset["active"] = "true";
    countdown.textContent = String(Math.max(1, Math.ceil(countdownRemaining)));
    if (countdownRemaining === 0) {
      countdown.textContent = "GO!";
      goSignalRemaining = 0.65;
    }
  } else if (running && goSignalRemaining > 0) {
    goSignalRemaining = Math.max(0, goSignalRemaining - frameSec);
    countdown.dataset["active"] = String(goSignalRemaining > 0);
  } else if (running) {
    countdown.dataset["active"] = "false";
    accumulatorSec = Math.min(0.2, accumulatorSec + frameSec);
    while (running && accumulatorSec >= FIXED_DT_SEC) {
      fixedStep();
      accumulatorSec -= FIXED_DT_SEC;
    }
  }

  const snapshot = director.snapshot();
  publishHud(snapshot);
  view.update(snapshot, frameSec);
  view.render();
  if (running && !lifecyclePaused && !contextLost) {
    animationFrame = requestAnimationFrame(frame);
  }
}

async function beginRace(forceControlTutorial = false): Promise<void> {
  if (running || starting) return;
  starting = true;
  runtime.dataset["active"] = "false";
  resultPanel.dataset["active"] = "false";
  startButton.disabled = true;
  practiceButton.disabled = true;
  startButton.innerHTML = "<strong>Opening the Moon Current…</strong><span>Calling the four racers</span>";
  publishRuntimeState("loading-race-engine");
  try {
    const View = await loadRaceEngine();
    view?.dispose();
    view = new View(canvas);
  } catch (error) {
    view = null;
    starting = false;
    practiceButton.disabled = false;
    renderCrew();
    showRuntimeFailure("renderer-construction", error);
    return;
  }
  director = new CleanTideSprintDirector();
  glowfinProgress = progressRepository.snapshot();
  crewProgress = glowfinProgress.tideSprint;
  const ghostPlayback = glowfinProgress.ghostEnabled
    ? TideSprintGhostPlayback.tryCreate(crewProgress.bestGhost)
    : null;
  director.start(selected, ghostPlayback);
  ghostRecorder = new TideSprintGhostRecorder(selected);
  activeRunId = createRunId();
  const snapshot = director.snapshot();
  view.setRoster(snapshot);
  steeringTarget = snapshot.player.lateral;
  throttleTarget = TIDE_SPRINT_DEFAULT_THROTTLE;
  syncThrottleVisual(throttleTarget);
  hideTouchControl();
  keyboardDirection = 0;
  keyboardThrottleDirection = 0;
  accumulatorSec = 0;
  lastFrameMs = 0;
  countdownRemaining = 0;
  goSignalRemaining = 0;
  feedbackUntilSec = 0;
  boostFlashUntilSec = 0;
  boostFlash.dataset["active"] = "false";
  mainRewardLabel.textContent = "";
  lifecyclePaused = false;
  contextLost = false;
  running = true;
  publishRuntimeState("running");
  lobby.dataset["active"] = "false";
  raceHud.dataset["active"] = "true";
  canvas.dataset["active"] = "true";
  starting = false;
  startButton.disabled = false;
  practiceButton.disabled = false;
  cancelAnimationFrame(animationFrame);
  if (forceControlTutorial || !controlTutorialCompleted()) {
    beginControlTutorial();
  } else {
    controlTutorialStage = null;
    updateControlCoach();
    countdownRemaining = COUNTDOWN_SEC;
  }
  telemetry.track("tide_sprint_start", {
    planHash: CLEAN_TIDE_SPRINT_PLAN_HASH,
    selected,
    bestEcho: Boolean(ghostPlayback),
    practice: forceControlTutorial,
  }, activeRunId);
  animationFrame = requestAnimationFrame(frame);
}

function abandonActiveRun(source: string): void {
  if (!activeRunId) return;
  const snapshot = director.snapshot();
  telemetry.track("tide_sprint_abandon", {
    planHash: CLEAN_TIDE_SPRINT_PLAN_HASH,
    source,
    elapsedSec: snapshot.elapsedSec,
    progress: snapshot.progress,
  }, activeRunId);
  activeRunId = null;
  ghostRecorder = null;
  void telemetry.flush();
}

function returnToCrew(): void {
  abandonActiveRun("change-crew");
  running = false;
  controlTutorialStage = null;
  activePointerId = null;
  throttleTarget = TIDE_SPRINT_DEFAULT_THROTTLE;
  hideTouchControl();
  updateControlCoach();
  cancelAnimationFrame(animationFrame);
  view?.dispose();
  view = null;
  resultPanel.dataset["active"] = "false";
  raceHud.dataset["active"] = "false";
  canvas.dataset["active"] = "false";
  lobby.dataset["active"] = "true";
  publishRuntimeState("lobby");
  renderCrew();
}

startButton.addEventListener("click", () => { void beginRace(false); });
practiceButton.addEventListener("click", () => { void beginRace(true); });
rematchButton.addEventListener("click", () => { void beginRace(false); });
changeCrewButton.addEventListener("click", returnToCrew);
runtimeReload.addEventListener("click", () => window.location.reload());

function recenterPointer(event: PointerEvent): void {
  pointerStartX = event.clientX;
  pointerStartY = event.clientY;
  pointerStartTarget = steeringTarget;
  throttleTarget = TIDE_SPRINT_DEFAULT_THROTTLE;
  showTouchControl(event.clientX, event.clientY);
}

function releasePointer(pointerId: number): void {
  if (canvas.hasPointerCapture(pointerId)) canvas.releasePointerCapture(pointerId);
  activePointerId = null;
  throttleTarget = TIDE_SPRINT_DEFAULT_THROTTLE;
  syncThrottleVisual(throttleTarget);
  hideTouchControl();
}

canvas.addEventListener("pointerdown", (event) => {
  if (!running || lifecyclePaused || contextLost || activePointerId !== null) return;
  event.preventDefault();
  activePointerId = event.pointerId;
  recenterPointer(event);
  canvas.setPointerCapture(event.pointerId);
});
canvas.addEventListener("pointermove", (event) => {
  if (event.pointerId !== activePointerId) return;
  event.preventDefault();
  const bounds = canvas.getBoundingClientRect();
  const deltaX = event.clientX - pointerStartX;
  const deltaY = event.clientY - pointerStartY;
  steeringTarget = tideSprintDragDeltaToTarget(
    pointerStartTarget,
    deltaX,
    bounds.width,
  );
  throttleTarget = tideSprintVerticalDragToThrottle(deltaY, bounds.height);
  syncThrottleVisual(throttleTarget);

  if (controlTutorialStage === "surge" && throttleTarget >= 0.9) {
    controlTutorialStage = "brake";
    recenterPointer(event);
    updateControlCoach();
    return;
  }
  if (controlTutorialStage === "brake" && throttleTarget <= 0.24) {
    controlTutorialStage = "steer";
    recenterPointer(event);
    updateControlCoach();
    return;
  }
  if (controlTutorialStage === "steer" && Math.abs(deltaX) >= 52) {
    completeControlTutorial();
    releasePointer(event.pointerId);
  }
});
canvas.addEventListener("pointerup", (event) => {
  if (event.pointerId !== activePointerId) return;
  releasePointer(event.pointerId);
});
canvas.addEventListener("pointercancel", (event) => {
  if (event.pointerId === activePointerId) releasePointer(event.pointerId);
});

window.addEventListener("keydown", (event) => {
  const key = event.key.toLowerCase();
  if (event.key === "ArrowLeft" || key === "a") keyboardDirection = -1;
  if (event.key === "ArrowRight" || key === "d") keyboardDirection = 1;
  if (running && (event.key === "ArrowUp" || key === "w")) {
    keyboardThrottleDirection = 1;
    throttleTarget = TIDE_SPRINT_SPEED_PROFILES.sprint.throttle;
    syncThrottleVisual(throttleTarget);
  }
  if (running && (event.key === "ArrowDown" || key === "s")) {
    keyboardThrottleDirection = -1;
    throttleTarget = TIDE_SPRINT_SPEED_PROFILES.slow.throttle;
    syncThrottleVisual(throttleTarget);
  }
  if (running && ["arrowleft", "arrowright", "arrowup", "arrowdown"].includes(key)) {
    event.preventDefault();
  }
});
window.addEventListener("keyup", (event) => {
  const key = event.key.toLowerCase();
  if (["arrowleft", "arrowright", "a", "d"].includes(key)) keyboardDirection = 0;
  if (["arrowup", "arrowdown", "w", "s"].includes(key)) {
    keyboardThrottleDirection = 0;
    throttleTarget = TIDE_SPRINT_DEFAULT_THROTTLE;
    syncThrottleVisual(throttleTarget);
  }
});

function pauseForLifecycle(source: string): void {
  if (!running || lifecyclePaused) return;
  lifecyclePaused = true;
  lifecycleInterruptions += 1;
  cancelAnimationFrame(animationFrame);
  lastFrameMs = 0;
  accumulatorSec = 0;
  if (activePointerId !== null) releasePointer(activePointerId);
  publishRuntimeState(contextLost ? "context-lost" : "paused");
  telemetry.track("runtime_pause", {
    mode: "tide-sprint",
    source,
    elapsedSec: director.snapshot().elapsedSec,
  }, activeRunId);
}

function resumeFromLifecycle(source: string): void {
  if (!running || !lifecyclePaused || contextLost) return;
  lifecyclePaused = false;
  lastFrameMs = 0;
  accumulatorSec = 0;
  publishRuntimeState("running");
  telemetry.track("runtime_resume", {
    mode: "tide-sprint",
    source,
    elapsedSec: director.snapshot().elapsedSec,
  }, activeRunId);
  cancelAnimationFrame(animationFrame);
  animationFrame = requestAnimationFrame(frame);
}

document.addEventListener("visibilitychange", () => {
  if (document.visibilityState === "hidden") {
    pauseForLifecycle("visibility");
  } else {
    resumeFromLifecycle("visibility");
  }
});

canvas.addEventListener("webglcontextlost", (event) => {
  event.preventDefault();
  contextLost = true;
  contextLosses += 1;
  pauseForLifecycle("webgl-context-lost");
  runtime.dataset["active"] = "true";
  runtimeTitle.textContent = "The current paused safely";
  runtimeDetail.textContent = "Restoring Tide Sprint without advancing the race…";
  publishRuntimeState("context-lost");
  telemetry.track("webgl_context_lost", {
    mode: "tide-sprint",
    losses: contextLosses,
  }, activeRunId);
});

canvas.addEventListener("webglcontextrestored", async () => {
  if (!contextLost) return;
  try {
    const View = await loadRaceEngine();
    view?.dispose();
    view = new View(canvas);
    view.setRoster(director.snapshot());
    contextLost = false;
    successfulRecoveries += 1;
    runtime.dataset["active"] = "false";
    publishRuntimeState(lifecyclePaused ? "paused" : "running");
    telemetry.track("webgl_context_restored", {
      mode: "tide-sprint",
      recoveries: successfulRecoveries,
    }, activeRunId);
    resumeFromLifecycle("webgl-context-restored");
  } catch (error) {
    contextLost = false;
    running = false;
    showRuntimeFailure("context-restoration", error);
    telemetry.track("webgl_context_recovery_failed", {
      mode: "tide-sprint",
      losses: contextLosses,
    }, activeRunId);
  }
});

window.addEventListener("pagehide", (event) => {
  if (event.persisted) {
    pauseForLifecycle("page-cache");
    return;
  }
  abandonActiveRun("pagehide");
  running = false;
  cancelAnimationFrame(animationFrame);
  view?.dispose();
  view = null;
  void telemetry.flush();
});

window.addEventListener("pageshow", (event) => {
  if (event.persisted) resumeFromLifecycle("page-cache");
});

document.documentElement.dataset["racePlan"] = CLEAN_TIDE_SPRINT_PLAN_HASH;
document.documentElement.dataset["raceStartupOwner"] = "integrated-tide-sprint";
document.documentElement.dataset["raceLobby"] = "ready";
publishRuntimeState("lobby");
lobbyReadyAtMs = performance.now();
const runtimeWindow = window as typeof window & {
  __GLOWFIN_TIDE_SPRINT_RUNTIME__?: {
    snapshot: () => unknown;
  };
};
runtimeWindow.__GLOWFIN_TIDE_SPRINT_RUNTIME__ = {
  snapshot: () => ({
    state: document.documentElement.dataset["tideSprintRuntime"] ?? "unknown",
    running,
    lifecyclePaused,
    contextLost,
    contextLosses,
    successfulRecoveries,
    lifecycleInterruptions,
    starting,
    planHash: CLEAN_TIDE_SPRINT_PLAN_HASH,
    timing: {
      lobbyReadyMs: Math.max(0, lobbyReadyAtMs - moduleStartedAtMs),
      raceEngineReadyMs: raceEngineReadyAtMs === null
        ? null
        : Math.max(0, raceEngineReadyAtMs - moduleStartedAtMs),
    },
    race: (() => {
      try {
        return director.snapshot();
      } catch {
        return null;
      }
    })(),
    renderer: view?.stats() ?? null,
  }),
};
for (const member of TIDE_SPRINT_CREW) {
  const button = document.querySelector<HTMLButtonElement>(`[data-character="${member.id}"]`);
  if (button) button.setAttribute("aria-label", `${member.name}, ${member.title}`);
}
syncThrottleVisual(throttleTarget);
updateControlCoach();
practiceButton.textContent = controlTutorialCompleted()
  ? "Review swim controls"
  : "Learn swim controls";
renderCrew();

// Wire the lobby first, then warm the expensive Three.js renderer only when
// the browser is idle. On slow phones the page is immediately interactive;
// on faster devices the race engine is ready before the player chooses a crew.
const warmRaceEngine = () => { void loadRaceEngine().catch(() => undefined); };
if ("requestIdleCallback" in window) {
  window.requestIdleCallback(warmRaceEngine, { timeout: 1_500 });
} else {
  window.setTimeout(warmRaceEngine, 350);
}
