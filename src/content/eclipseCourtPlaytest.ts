import type { ProgressStorage } from "../persistence/progress";

export const ECLIPSE_COURT_PLAYTEST_PARAMETER = "playtest";
export const ECLIPSE_COURT_PLAYTEST_VALUE = "eclipse-court";
export const ECLIPSE_COURT_PLAYTEST_STORAGE_PREFIX =
  "glowfin.playtest.eclipse-court.";

const ECLIPSE_COURT_REVIEW_PATHS = new Set([
  "/game-v48-r1",
  "/game-v48-r1/",
  "/game-v48-r1/index.html",
  "/game-v48-r2",
  "/game-v48-r2/",
  "/game-v48-r2/index.html",
]);

export interface EclipseCourtPlaytestLocation {
  releaseVersion: number;
  pathname: string;
  search: string;
}

/**
 * The bypass is intentionally unavailable from main and every earlier build.
 * It exists only on isolated V48 review routes with an explicit query.
 */
export function isEclipseCourtPlaytestMode(
  location: Readonly<EclipseCourtPlaytestLocation>,
): boolean {
  if (
    location.releaseVersion !== 48 ||
    !ECLIPSE_COURT_REVIEW_PATHS.has(location.pathname)
  ) return false;
  return new URLSearchParams(location.search).get(
    ECLIPSE_COURT_PLAYTEST_PARAMETER,
  ) === ECLIPSE_COURT_PLAYTEST_VALUE;
}

/**
 * Prefix every key inside sessionStorage so a playtest cannot read, overwrite,
 * migrate or delete a normal Glowfin save even within the same browser tab.
 */
export function eclipseCourtPlaytestStorage(
  storage: ProgressStorage,
  trial = "",
): ProgressStorage {
  const scope = trial ? `${trial}.` : "";
  const key = (name: string) =>
    `${ECLIPSE_COURT_PLAYTEST_STORAGE_PREFIX}${scope}${name}`;
  return {
    getItem(name) {
      return storage.getItem(key(name));
    },
    setItem(name, value) {
      storage.setItem(key(name), value);
    },
    removeItem(name) {
      storage.removeItem?.(key(name));
    },
  };
}
