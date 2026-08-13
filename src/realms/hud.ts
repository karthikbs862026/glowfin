import type {
  CrystalTrenchRunStatus,
  DuskmawRunStatus,
  KelpCathedralRunStatus,
  RealmRunEvent,
} from "../sim/run";
import {
  CRYSTAL_PLATES_TO_RACE,
  DUSKMAW_MOONLINK_STRIKES,
  DUSKMAW_VAULT_HOLD_SEC,
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
  private readonly progress: HTMLElement;
  private readonly progressSteps: readonly HTMLElement[];

  constructor(root: Document = document) {
    this.root = requireElement(root, "realm-run-status");
    this.title = requireElement(root, "realm-title");
    this.objective = requireElement(root, "realm-objective");
    this.detail = requireElement(root, "realm-feature-detail");
    this.feedback = requireElement(root, "realm-feedback");
    this.progress = requireElement(root, "realm-progress");
    this.progressSteps = [
      requireElement(root, "realm-progress-break-1"),
      requireElement(root, "realm-progress-break-2"),
      requireElement(root, "realm-progress-break-3"),
      requireElement(root, "realm-progress-seal"),
    ];
  }

  setActive(active: boolean): void {
    this.root.dataset["active"] = String(active);
    this.root.setAttribute("aria-hidden", String(!active));
    if (!active) {
      this.feedback.dataset["active"] = "false";
      this.progress.dataset["active"] = "false";
    }
  }

  updateKelp(
    status: Readonly<KelpCathedralRunStatus>,
    _nextPlan: RealmGatePlan | null,
  ): void {
    void _nextPlan;
    this.progress.dataset["active"] = "false";
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
    this.progress.dataset["active"] = "false";
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

  updateDuskmaw(
    status: Readonly<DuskmawRunStatus>,
    nextPlan: RealmGatePlan | null = null,
  ): void {
    this.root.dataset["phase"] = status.phase;
    this.title.textContent = "Heartlight War · Save Auralis";
    this.progress.dataset["active"] = "true";
    this.progress.setAttribute(
      "aria-label",
      `${status.minionsDefeated} of ${status.minionTarget} minions defeated; ${status.preVaultStrikes} of 4 Heartlight strikes; Auralis ${status.auralisFreed ? "freed" : "imprisoned"}; ${status.phase.startsWith("minion-wave") || status.phase === "approach" ? "Duskmaw has not entered the arena" : `Duskmaw health ${status.bossHealth} of ${status.bossMaxHealth}`}`,
    );
    const stepStates = [
      status.minionsDefeated >= status.minionTarget,
      status.heartlightRecovered,
      status.auralisFreed,
      status.completed,
    ];
    const currentStep = stepStates.findIndex((complete) => !complete);
    for (let index = 0; index < this.progressSteps.length; index += 1) {
      const step = this.progressSteps[index];
      if (!step) continue;
      step.dataset["state"] = stepStates[index]
        ? "complete"
        : index === currentStep
          ? "current"
          : "pending";
    }
    const minionHealth = Math.max(0, status.activeMinionRequiredHits - status.activeMinionHits);
    const activeMinionName = status.activeMinionTier === 1
      ? "L1 RIFT DART"
      : status.activeMinionTier === 2
        ? "L2 GRAVE WARDEN"
        : status.activeMinionTier === 3
          ? "L3 MAW SENTINEL"
          : "SHADOW BROOD";
    const nextStrike = Math.min(status.currentBreakTarget, status.currentBreaks + 1);
    this.objective.textContent = status.completed
      ? "VICTORY · AURALIS RESTORES THE MOON CURRENT · MOONCREST COVENANT FORGED"
      : status.phase === "vault-rescue"
        ? "HOLD POSITION · RETURN THE HEARTLIGHT · BREAK THE VAULT"
        : status.phase === "auralis-catchup"
          ? "AURALIS IS FREE · HOLD CYAN WHILE SHE CATCHES GLOWFIN"
          : status.phase === "moonlink-battle"
            ? status.bossHealth > 0
              ? `COORDINATED ASSAULT ${status.joinedStrikes + 1}/${DUSKMAW_MOONLINK_STRIKES} · DODGE DUSKMAW · ENTER CYAN`
              : "DUSKMAW CORE EXPOSED · ENTER THE FINAL MOON SEAL"
            : status.phase === "heartlight-run"
              ? "HEARTLIGHT SECURED · CARRY THE GOLDEN CORE TO THE FIXED VAULT"
      : status.phase === "duskmaw-assault" && status.phaseElapsedSec < 3.4
        ? "L3 SENTINEL DESTROYED · DUSKMAW ENTERS THE ARENA"
      : nextPlan?.verb === "minion-assault"
        ? `${activeMinionName} · DODGE ORANGE · AUTO-FIRE IN CYAN · ${minionHealth || 1} HIT${minionHealth === 1 ? "" : "S"} LEFT`
        : nextPlan?.verb === "lumen-bloom"
          ? "LUMEN BLOOM AHEAD · COLLECT IT TO RESTORE GLOWFIN ONLY"
        : nextPlan?.verb === "current-break"
        ? `ENTER CYAN MOON CHARGE · FIRE STRIKE ${nextStrike}/${status.currentBreakTarget}`
        : nextPlan?.verb === "shadow-sweep"
          ? "DUSKMAW LOCKS ON · LEAVE THE ORANGE TARGET"
          : nextPlan?.verb === "vacuum-wake"
            ? "TRACKING MOUTH ROAR · HOLD THE CYAN SAFE LANE"
            : nextPlan?.verb === "ruins-collapse"
              ? "RUINBREAKER · ESCAPE THE FALLING DEBRIS"
              : nextPlan?.verb === "moonbone-vault"
                ? "VAULT AHEAD · CARRY THE HEARTLIGHT INTO THE ANCHOR"
              : nextPlan?.verb === "moon-seal"
                ? "FINAL · GLOWFIN + AURALIS · DESTROY DUSKMAW'S CORE"
                : status.phase === "approach"
                  ? "DUSKMAW STOLE AURALIS' HEARTLIGHT · ITS SHADOW BROOD GUARDS HER VAULT"
                  : status.phase.startsWith("minion-wave")
                    ? "DEFEAT THE SHADOW BROOD · CYAN OPENS THEIR WEAK POINTS"
                    : "FOLLOW CYAN · DODGE THE MOUTH ATTACK · FIRE BACK";
    this.detail.textContent = status.completed
      ? "Auralis destroys the Void Heart, offers Glowfin the sculpted Mooncrest Covenant and opens the Guardian route toward Realm 3"
      : status.phase === "vault-rescue"
        ? `Rescue blast charging · ${Math.max(0, DUSKMAW_VAULT_HOLD_SEC - status.phaseElapsedSec).toFixed(0)}s · the gate remains fixed`
        : status.phase === "auralis-catchup"
          ? "Auralis leaves the shattered cell, accelerates beside Glowfin and disables Duskmaw's regeneration"
          : status.phase === "moonlink-battle"
            ? `Auralis intercepts only after Glowfin lands a Moonbolt · joined strikes ${status.joinedStrikes}/${DUSKMAW_MOONLINK_STRIKES} · failed charges reform farther ahead`
        : status.phase === "heartlight-run"
              ? "The bright Heartlight is tethered above Glowfin until it reaches Auralis"
      : status.phase === "duskmaw-assault" && status.phaseElapsedSec < 3.4
        ? "The brood is gone · abyssal silt parts as the true leviathan rises into the chase"
      : nextPlan?.verb === "ruins-collapse"
        ? "MOUTH STRIKE → ARCH EXPLODES → REAL DEBRIS FALLS INTO THE DANGER LANE"
        : nextPlan?.verb === "minion-assault"
          ? `${activeMinionName} · ${status.activeMinionRequiredHits || 1} Moonbolt${status.activeMinionRequiredHits === 1 ? "" : "s"} to defeat · the visible projectile is the only hit lane`
        : nextPlan?.verb === "lumen-bloom"
          ? `Glowfin recovery only · blooms collected ${status.recoveryItemsCollected} · enemies cannot use them`
        : nextPlan?.verb === "current-break"
          ? `Enter the cyan charge to fire · a miss reforms farther ahead · Duskmaw hits cost Light · Void Heart regenerations ${status.bossRegenerations}/2`
        : nextPlan?.verb === "shadow-sweep" || nextPlan?.verb === "vacuum-wake"
          ? "MOUTH CHARGE → DODGE THE VISIBLE PROJECTILE → ENTER CYAN TO FIRE BACK"
          : status.phase.startsWith("minion-wave") || status.phase === "approach"
            ? `Brood ${status.minionsDefeated}/${status.minionTarget} · defeat L3 to draw Duskmaw into the arena · Glowfin recoveries ${status.recoveryItemsCollected}`
            : `Brood cleared · Duskmaw ${status.bossHealth}/${status.bossMaxHealth} · regenerated ${status.bossRegenerations}/2 · Glowfin recoveries ${status.recoveryItemsCollected}`;
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
                          : event.kind === "mirror-race-loss"
                            ? "Neri wins by a fin · race repeats ahead"
                            : event.kind === "minion-hit"
                              ? "MOONBOLT HIT · armour cracked · it is still fighting"
                              : event.kind === "minion-defeated"
                                ? "SHADOW BROOD DEFEATED · route opening"
                                : event.kind === "minion-shot-missed"
                                  ? "MINION HIT GLOWFIN · it retreats and attacks again"
                                  : event.kind === "lumen-bloom"
                                    ? "LUMEN BLOOM · GLOWFIN LIGHT RESTORED"
                                    : event.kind === "lumen-bloom-missed"
                                      ? "Recovery missed · another bloom lies ahead"
                            : event.kind === "shadow-sweep"
                              ? event.success
                                ? "DODGED ✓ · Mouthfire passed Glowfin"
                                : "HIT · Light recovered · keep following cyan"
                              : event.kind === "vacuum-wake-enter"
                                ? `TRACKING ROAR · pull ${event.direction === -1 ? "left" : "right"} · reach cyan`
                                : event.kind === "ruins-collapse"
                                  ? event.success
                                    ? "DODGED ✓ · Falling arch cleared"
                                    : "DEBRIS HIT · move into cyan"
                                  : event.kind === "current-break"
                                    ? "MOONBOLT HIT ✓ · Duskmaw armour ruptured"
                                    : event.kind === "current-break-missed"
                                      ? "MOON CHARGE MISSED · it reforms ahead"
                                      : event.kind === "moonbone-vault"
                                        ? "GLOWFIN STOPS · HEARTLIGHT RETURNED · VAULT BREAKING"
                                        : event.kind === "moonbone-vault-locked"
                                          ? "VAULT LOCKED · defeat the brood and recover the Heartlight"
                                      : event.kind === "moon-seal"
                                        ? "GRAND MOONLINK BLAST · DUSKMAW DESTROYED"
                                        : "DUSKMAW CORE RECOVERED · strike again";
    this.feedback.dataset["active"] = "true";
  }

  hideFeedback(): void {
    this.feedback.dataset["active"] = "false";
  }
}
