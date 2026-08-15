export const CHAPTER_ONE_FIXED_SEED = 0x4d4f4f4e;

export type ExpeditionExperience =
  | "classic"
  | "chapter-one-r5"
  | "living-tide-season-one"
  | "eclipse-court-pack-one";
export type ExpeditionUiState = "mission-card" | "briefing" | "running";
export type ExpeditionUiEvent = "open-briefing" | "close-briefing" | "start" | "finish";

export interface ChapterOneMission {
  id: "the-missing-moonseed";
  chapter: 1;
  revision: "r6";
  title: "The Missing Moonseed";
  objective: "Find · Rescue · Race · Break Duskmaw · Restore";
  seed: number;
}

export const CHAPTER_ONE_MISSION: Readonly<ChapterOneMission> = Object.freeze({
  id: "the-missing-moonseed",
  chapter: 1,
  revision: "r6",
  title: "The Missing Moonseed",
  objective: "Find · Rescue · Race · Break Duskmaw · Restore",
  seed: CHAPTER_ONE_FIXED_SEED,
});

export function reduceExpeditionUiState(
  state: ExpeditionUiState,
  event: ExpeditionUiEvent,
): ExpeditionUiState {
  if (event === "start") return state === "briefing" ? "running" : state;
  if (event === "open-briefing") return state === "mission-card" ? "briefing" : state;
  if (event === "close-briefing" || event === "finish") return "mission-card";
  return state;
}
