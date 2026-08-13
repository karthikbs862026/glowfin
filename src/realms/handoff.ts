import type { RealmId } from "./definition";

export interface RealmHandoffState {
  crystalTrenchUnlocked: boolean;
  leviathanGraveyardUnlocked: boolean;
  crystalTrenchRaceWon: boolean;
}

export function isVersion44ReviewPath(pathname: string): boolean {
  return /(?:^|\/)game-v44-r1(?:\/|$)/.test(pathname);
}

/**
 * Realm 3 persistence belongs to the release identity, not the public URL.
 * The promoted build is served at `/`, `/game`, and `/game/` without a browser
 * redirect, while historical review routes keep their own embedded versions.
 */
export function isIntegratedRealmThreeExperience(
  releaseVersion: number,
  pathname: string,
): boolean {
  return releaseVersion >= 45 && !isVersion44ReviewPath(pathname);
}

/** Return the primary post-run destination without bypassing a realm victory. */
export function realmHandoffDestination(
  activeRealmId: RealmId,
  state: Readonly<RealmHandoffState>,
): RealmId {
  if (activeRealmId === "kelp-cathedral" && state.crystalTrenchUnlocked) {
    return "crystal-trench";
  }
  if (
    activeRealmId === "crystal-trench" &&
    state.crystalTrenchRaceWon &&
    state.leviathanGraveyardUnlocked
  ) {
    return "leviathan-graveyard";
  }
  return activeRealmId;
}
