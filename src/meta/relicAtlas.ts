import type { ExpeditionProgressV1 } from "../expedition/progress";
import type { RealmProgressV1 } from "../realms/progress";
import { leviathanGraveyardProgress } from "../realms/progress";

export const RELIC_ATLAS_IDS = [
  "moonseed-fragment",
  "manta-lullaby-shell",
  "cathedral-hymn-page",
  "prism-current-key",
  "mirror-current-crest",
  "auralis-mooncrest",
] as const;

export type RelicAtlasId = typeof RELIC_ATLAS_IDS[number];

export const RESTORATION_DISTRICT_IDS = [
  "moon-well",
  "kelp-conservatory",
  "prism-observatory",
  "guardian-sanctum",
] as const;

export type RestorationDistrictId = typeof RESTORATION_DISTRICT_IDS[number];
export type RelicAtlasDestination =
  | "expedition"
  | "kelp-cathedral"
  | "crystal-trench"
  | "leviathan-graveyard"
  | "living-tide-season";
export type RelicAtlasEntryState = "recovered" | "available" | "locked";

export interface RelicAtlasAction {
  destination: RelicAtlasDestination;
  label: string;
  guidance: string;
}

export interface RelicAtlasEntry {
  id: RelicAtlasId;
  districtId: RestorationDistrictId;
  name: string;
  mapLabel: string;
  sigil: string;
  realm: string;
  chapter: string;
  guide: string;
  lore: string;
  memoryLine: string;
  objective: string;
  collectionMethod: string;
  worldEffect: string;
  visualObjective: string;
  visualRoute: string;
  visualEffect: string;
  progressLabel: string;
  recovered: boolean;
  state: RelicAtlasEntryState;
  action: RelicAtlasAction;
}

export interface RestorationDistrict {
  id: RestorationDistrictId;
  name: string;
  chapter: string;
  guide: string;
  realm: string;
  detail: string;
  story: string;
  worldEffect: string;
  restored: boolean;
  recoveredRelics: number;
  totalRelics: number;
  action: RelicAtlasAction;
}

export interface RelicAtlasState {
  entries: RelicAtlasEntry[];
  districts: RestorationDistrict[];
  recoveredCount: number;
  restoredDistrictCount: number;
  restorationFraction: number;
  auralisGuardianActive: boolean;
  gameComplete: boolean;
  nextRelicId: RelicAtlasId | null;
}

export interface RelicAtlasUnlocks {
  kelpCathedral: boolean;
  crystalTrench: boolean;
  leviathanGraveyard: boolean;
}

function entryState(
  recovered: boolean,
  available: boolean,
): RelicAtlasEntryState {
  return recovered ? "recovered" : available ? "available" : "locked";
}

function action(
  destination: RelicAtlasDestination,
  label: string,
  guidance: string,
): RelicAtlasAction {
  return { destination, label, guidance };
}

export function expeditionMoonseedRecovered(
  expedition: Readonly<ExpeditionProgressV1>,
): boolean {
  return expedition.discoveredRelics.includes("moonseed-fragment") ||
    expedition.completionMarks.hiddenRelic ||
    expedition.completionMarks.primaryObjective ||
    expedition.moonWellRestored;
}

/** The one authoritative, story-complete route through all four districts. */
export function deriveRelicAtlasUnlocks(
  expedition: Readonly<ExpeditionProgressV1>,
  realms: Readonly<RealmProgressV1>,
): RelicAtlasUnlocks {
  const moonWellAwake = expeditionMoonseedRecovered(expedition) &&
    expedition.moonWellRestored;
  const kelpRestored = realms.kelpCathedral.rescues > 0 &&
    realms.kelpCathedral.relicPages.includes("kelp-cathedral-page-1");
  const prismRestored = realms.crystalTrench.completions > 0 &&
    realms.crystalTrench.cleanCompletions > 0;
  return {
    kelpCathedral: moonWellAwake,
    crystalTrench: moonWellAwake && kelpRestored,
    leviathanGraveyard: moonWellAwake && kelpRestored && prismRestored,
  };
}

/**
 * The Living Atlas is derived from authoritative completion records. Existing
 * saves therefore backfill without a second reward ledger, while every locked
 * memory still points at the exact playable action that advances its story.
 */
export function deriveRelicAtlasState(
  expedition: Readonly<ExpeditionProgressV1>,
  realms: Readonly<RealmProgressV1>,
): RelicAtlasState {
  const kelp = realms.kelpCathedral;
  const crystal = realms.crystalTrench;
  const graveyard = leviathanGraveyardProgress(realms);
  const moonseedRecovered = expeditionMoonseedRecovered(expedition);
  const unlocks = deriveRelicAtlasUnlocks(expedition, realms);
  const kelpAvailable = unlocks.kelpCathedral;
  const crystalAvailable = unlocks.crystalTrench;
  const graveyardAvailable = unlocks.leviathanGraveyard;
  const auralisGuardianActive = graveyard.mooncrestCovenant && graveyard.victories > 0;

  const entries: RelicAtlasEntry[] = [
    {
      id: "moonseed-fragment",
      districtId: "moon-well",
      name: "Moonseed Fragment",
      mapLabel: "Moonseed",
      sigil: "✦",
      realm: "Moon Garden Expedition",
      chapter: "Prologue · The Missing Moonseed",
      guide: "Neri · Moon-dolphin Scout",
      lore: "A living seed of moonlight that remembers the first current of the sleeping city.",
      memoryLine: "Neri: ‘The Moonseed did not vanish. It followed the creatures that still remembered the way home.’",
      objective: "Recover the Moonseed and carry its light back to the Moon Well.",
      collectionMethod: "Begin Chapter 1, follow the golden Mote chain and choose the narrow gold route when the current divides.",
      worldEffect: "Reawakens the Moon Well bloom, palace light and the road into the Lost Kingdom.",
      visualObjective: "Wake the Moon Well",
      visualRoute: "Follow gold motes · take the narrow current",
      visualEffect: "Moon Garden blooms",
      progressLabel: moonseedRecovered ? "Memory recovered" : "Moonseed route ready",
      recovered: moonseedRecovered,
      state: entryState(moonseedRecovered, true),
      action: action(
        "expedition",
        moonseedRecovered ? "Replay Chapter 1" : "Begin Chapter 1",
        "The golden current leads to the hidden Fragment.",
      ),
    },
    {
      id: "manta-lullaby-shell",
      districtId: "kelp-conservatory",
      name: "Manta Lullaby Shell",
      mapLabel: "Miri’s Shell",
      sigil: "◒",
      realm: "Realm 1 · Kelp Cathedral",
      chapter: "Chapter I · Miri’s Lost Song",
      guide: "Miri · Cyan Manta",
      lore: "A shell that carries the pulse Miri’s family used to guide young mantas through the canopy.",
      memoryLine: "Miri: ‘I heard the bells beneath Duskmaw’s current. I only needed someone brave enough to answer.’",
      objective: "Rescue baby manta Miri before the Cathedral current closes.",
      collectionMethod: kelpAvailable
        ? "Enter Kelp Cathedral, master its living frond currents and reach all Rescue Lights around Miri."
        : "Restore the Moon Well with the Moonseed first; its living current opens the Kelp Cathedral passage.",
      worldEffect: "Returns manta families, luminous spores and the first living song to the Kelp Conservatory.",
      visualObjective: "Rescue Miri",
      visualRoute: kelpAvailable ? "Follow every cyan Rescue Light" : "Restore the Moon Well first",
      visualEffect: "Manta families return",
      progressLabel: kelp.rescues > 0 ? `${kelp.rescues} rescue${kelp.rescues === 1 ? "" : "s"}` : kelpAvailable ? "Miri awaits rescue" : "Locked by Prologue",
      recovered: kelp.rescues > 0,
      state: entryState(kelp.rescues > 0, kelpAvailable),
      action: kelpAvailable
        ? action(
          "kelp-cathedral",
          kelp.rescues > 0 ? "Return to Kelp Cathedral" : "Rescue Miri",
          "Follow the Rescue Lights through the braided canopy.",
        )
        : action("expedition", "Restore the Moon Well First", "The Moonseed opens Realm 1."),
    },
    {
      id: "cathedral-hymn-page",
      districtId: "kelp-conservatory",
      name: "Cathedral Hymn Page",
      mapLabel: "Hymn Page",
      sigil: "≋",
      realm: "Realm 1 · Kelp Cathedral",
      chapter: "Chapter I · The Bells Remember",
      guide: "Miri · Keeper of the Canopy",
      lore: "A water-worn hymn once rung by shell bells when the Cathedral opened safe passage.",
      memoryLine: "Miri: ‘The page is not a song by itself. Bring it home, and the whole canopy will sing.’",
      objective: "Find the hidden Relic Page carried by the shell-bell echo.",
      collectionMethod: kelpAvailable
        ? "Re-enter Kelp Cathedral and follow the alternate shell-bell route instead of staying only on the safest current."
        : "Restore the Moon Well with the Moonseed first; the Kelp Cathedral remains beyond the sleeping current.",
      worldEffect: "Restores the Cathedral hymn, shell-bell procession and the Kelp Conservatory’s ceremonial arch.",
      visualObjective: "Find the lost hymn",
      visualRoute: kelpAvailable ? "Follow the ringing shell-bells" : "Restore the Moon Well first",
      visualEffect: "Kelp Cathedral sings",
      progressLabel: kelp.relicPages.includes("kelp-cathedral-page-1") ? "Hymn recovered" : kelpAvailable ? "Hidden route unread" : "Locked by Prologue",
      recovered: kelp.relicPages.includes("kelp-cathedral-page-1"),
      state: entryState(kelp.relicPages.includes("kelp-cathedral-page-1"), kelpAvailable),
      action: kelpAvailable
        ? action(
          "kelp-cathedral",
          kelp.relicPages.includes("kelp-cathedral-page-1") ? "Replay the Hymn Route" : "Seek the Hymn Page",
          "Listen for the shell bells beyond the safest lane.",
        )
        : action("expedition", "Restore the Moon Well First", "The Moonseed opens Realm 1."),
    },
    {
      id: "prism-current-key",
      districtId: "prism-observatory",
      name: "Prism Current Key",
      mapLabel: "Prism Key",
      sigil: "◇",
      realm: "Realm 2 · Crystal Trench",
      chapter: "Chapter II · Neri’s Mirror Current",
      guide: "Neri · Keeper of the Prism Route",
      lore: "A refracted route-memory shaped when Glowfin and Neri cross the Trench Gate together.",
      memoryLine: "Neri: ‘A current is not a line. It is a promise the ocean keeps when you learn how to read it.’",
      objective: "Seal the Trench Gate and defeat Neri in the Mirror Current.",
      collectionMethod: crystalAvailable
        ? "Enter Crystal Trench, read Prism Pulses, clear the shifting plates and win the final race."
        : "Restore the Kelp Conservatory first by rescuing Miri and recovering the Hymn Page.",
      worldEffect: "Re-lights the Prism Observatory lens and projects the first safe route beyond the Cathedral.",
      visualObjective: "Open the Trench Gate",
      visualRoute: crystalAvailable
        ? "Read each Prism Pulse"
        : "Rescue Miri · recover the hymn",
      visualEffect: "Observatory lens relights",
      progressLabel: crystal.completions > 0 ? `${crystal.completions} Mirror Current win${crystal.completions === 1 ? "" : "s"}` : crystalAvailable ? "Mirror Current open" : "Locked by Realm 1 restoration",
      recovered: crystal.completions > 0,
      state: entryState(crystal.completions > 0, crystalAvailable),
      action: crystalAvailable
        ? action("crystal-trench", crystal.completions > 0 ? "Race Neri Again" : "Enter Crystal Trench", "Read the Prism Pulse before every moving plate.")
        : action("kelp-cathedral", "Restore Kelp Cathedral First", "Rescue Miri and recover the Hymn Page."),
    },
    {
      id: "mirror-current-crest",
      districtId: "prism-observatory",
      name: "Mirror Current Crest",
      mapLabel: "Mirror Crest",
      sigil: "◈",
      realm: "Realm 2 · Crystal Trench",
      chapter: "Chapter II · The Current Reads You",
      guide: "Neri · Rival and Route-Reader",
      lore: "The crest appears only when speed, timing and restraint become one clean current.",
      memoryLine: "Neri: ‘You did not outrun the Trench. You listened—and the Trench finally answered.’",
      objective: "Win a clean Mirror Current run.",
      collectionMethod: crystalAvailable
        ? "Finish Crystal Trench without losing the clean-performance mark; failed plate rhythms reform ahead for another attempt."
        : "Restore Kelp Cathedral by rescuing Miri and recovering the Hymn Page.",
      worldEffect: "Completes the Prism Observatory, powers its moving constellations and reveals the Leviathan route.",
      visualObjective: "Win the Mirror Current",
      visualRoute: crystalAvailable
        ? "Finish clean · no collisions"
        : "Rescue Miri · recover the hymn",
      visualEffect: "A safe route appears",
      progressLabel: crystal.cleanCompletions > 0 ? `${crystal.cleanCompletions} clean win${crystal.cleanCompletions === 1 ? "" : "s"}` : crystalAvailable ? "Clean crest available" : "Locked by Realm 1 restoration",
      recovered: crystal.cleanCompletions > 0,
      state: entryState(crystal.cleanCompletions > 0, crystalAvailable),
      action: crystalAvailable
        ? action("crystal-trench", crystal.cleanCompletions > 0 ? "Defend the Clean Crest" : "Attempt a Clean Run", "Hold the rhythm through every plate and race gate.")
        : action("kelp-cathedral", "Restore Kelp Cathedral First", "Rescue Miri and recover the Hymn Page."),
    },
    {
      id: "auralis-mooncrest",
      districtId: "guardian-sanctum",
      name: "Auralis Mooncrest",
      mapLabel: "Mooncrest",
      sigil: "☾",
      realm: "Realm 3 · Leviathan Graveyard",
      chapter: "Chapter III · The Heartlight War",
      guide: "Auralis · Guardian of the Living Tide",
      lore: "The covenant of a freed guardian, forged when Heartlight reaches the buried Moon Seal.",
      memoryLine: "Auralis: ‘A kingdom is not restored by stone. It returns when every lost life can find its way home.’",
      objective: "Break Duskmaw’s three brood ranks, free Auralis and forge the Mooncrest Covenant.",
      collectionMethod: graveyardAvailable
        ? "Enter Leviathan Graveyard, defeat all three minion ranks, survive Duskmaw’s pursuit and complete the Moon Seal finale."
        : "Restore the Prism Observatory by winning the Mirror Current and earning its clean crest.",
      worldEffect: "Awakens the Guardian Sanctum and brings Auralis home to patrol every restored current.",
      visualObjective: "Free Auralis",
      visualRoute: graveyardAvailable
        ? "Defeat L1–L3 · then Duskmaw"
        : "Win Crystal Trench clean",
      visualEffect: "Guardian Sanctum awakens",
      progressLabel: auralisGuardianActive ? "Mooncrest Covenant active" : graveyardAvailable ? "Heartlight War open" : "Locked by Realm 2 restoration",
      recovered: auralisGuardianActive,
      state: entryState(auralisGuardianActive, graveyardAvailable),
      action: graveyardAvailable
        ? action("leviathan-graveyard", auralisGuardianActive ? "Return to Auralis" : "Begin the Heartlight War", "Break the brood ranks before facing Duskmaw.")
        : action("crystal-trench", "Restore the Prism Observatory First", "Win the Mirror Current and its clean crest."),
    },
  ];

  const countRecovered = (ids: readonly RelicAtlasId[]) =>
    ids.filter((id) => entries.find((entry) => entry.id === id)?.recovered).length;

  const districts: RestorationDistrict[] = [
    {
      id: "moon-well",
      name: "Moon Well",
      chapter: "Prologue",
      guide: "Neri",
      realm: "Moon Garden Expedition",
      detail: "Return the Moonseed through Chapter 1.",
      story: "The first living light returns to the sleeping city and remembers the road into the Lost Kingdom.",
      worldEffect: "Moon-bloom, palace windows and the central current awaken.",
      restored: expedition.moonWellRestored && moonseedRecovered,
      recoveredRelics: countRecovered(["moonseed-fragment"]),
      totalRelics: 1,
      action: action("expedition", expedition.moonWellRestored ? "Replay the Restoration" : "Restore the Moon Well", "Complete The Missing Moonseed."),
    },
    {
      id: "kelp-conservatory",
      name: "Kelp Conservatory",
      chapter: "Chapter I",
      guide: "Miri",
      realm: "Kelp Cathedral",
      detail: "Rescue Miri and recover the Cathedral hymn.",
      story: "Miri’s family returns, the shell bells sound again and the living canopy becomes a sanctuary.",
      worldEffect: "Manta patrols, braided frond light and shell-bell music return.",
      restored: kelp.rescues > 0 && kelp.relicPages.includes("kelp-cathedral-page-1"),
      recoveredRelics: countRecovered(["manta-lullaby-shell", "cathedral-hymn-page"]),
      totalRelics: 2,
      action: kelpAvailable
        ? action("kelp-cathedral", "Enter Kelp Cathedral", "Complete Miri’s rescue and seek the hidden hymn.")
        : action("expedition", "Restore the Moon Well First", "Return the Moonseed to open Realm 1."),
    },
    {
      id: "prism-observatory",
      name: "Prism Observatory",
      chapter: "Chapter II",
      guide: "Neri",
      realm: "Crystal Trench",
      detail: "Win the Mirror Current and earn its clean crest.",
      story: "Neri relights the Observatory, turning the Trench from a prison into a map of safe currents.",
      worldEffect: "Prism lenses, moving constellations and the Leviathan passage ignite.",
      restored: crystal.completions > 0 && crystal.cleanCompletions > 0,
      recoveredRelics: countRecovered(["prism-current-key", "mirror-current-crest"]),
      totalRelics: 2,
      action: crystalAvailable
        ? action("crystal-trench", "Enter Crystal Trench", "Win and preserve the clean-performance mark.")
        : action("kelp-cathedral", "Restore Kelp Cathedral First", "Rescue Miri and recover the Hymn Page."),
    },
    {
      id: "guardian-sanctum",
      name: "Guardian Sanctum",
      chapter: "Chapter III",
      guide: "Auralis",
      realm: "Leviathan Graveyard",
      detail: "Free Auralis and forge the Mooncrest Covenant.",
      story: "Auralis returns from the Graveyard and binds every restored district into one Living Tide.",
      worldEffect: "The Guardian patrol, Heartlight aurora and Mooncrest monument awaken.",
      restored: auralisGuardianActive,
      recoveredRelics: countRecovered(["auralis-mooncrest"]),
      totalRelics: 1,
      action: graveyardAvailable
        ? action("leviathan-graveyard", "Enter Leviathan Graveyard", "Finish the Heartlight War.")
        : action("crystal-trench", "Restore the Prism Observatory First", "Win the Mirror Current and its clean crest."),
    },
  ];

  const recoveredCount = entries.filter((entry) => entry.recovered).length;
  const restoredDistrictCount = districts.filter((district) => district.restored).length;
  const gameComplete = recoveredCount === RELIC_ATLAS_IDS.length &&
    restoredDistrictCount === RESTORATION_DISTRICT_IDS.length &&
    auralisGuardianActive;
  const nextEntry = entries.find((entry) => entry.state === "available") ??
    entries.find((entry) => entry.state === "locked") ?? null;
  return {
    entries,
    districts,
    recoveredCount,
    restoredDistrictCount,
    restorationFraction: restoredDistrictCount / RESTORATION_DISTRICT_IDS.length,
    auralisGuardianActive,
    gameComplete,
    nextRelicId: nextEntry?.id ?? null,
  };
}
