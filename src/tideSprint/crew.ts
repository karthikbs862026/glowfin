export const TIDE_SPRINT_CREW_IDS = ["glowfin", "neri", "coralyn"] as const;
export type TideSprintCrewId = typeof TIDE_SPRINT_CREW_IDS[number];
export const TIDE_SPRINT_CHARACTER_IDS = [
  ...TIDE_SPRINT_CREW_IDS,
  "miri",
] as const;
export type TideSprintCharacterId = typeof TIDE_SPRINT_CHARACTER_IDS[number];

export interface TideSprintCrewDefinition {
  id: TideSprintCharacterId;
  name: string;
  title: string;
  colour: string;
  accent: string;
}

export const TIDE_SPRINT_CREW: readonly TideSprintCrewDefinition[] = Object.freeze([
  {
    id: "glowfin",
    name: "Glowfin",
    title: "The Lightbearer",
    colour: "#37dffc",
    accent: "#ff82ca",
  },
  {
    id: "neri",
    name: "Neri",
    title: "The Indigo Scout",
    colour: "#596ee8",
    accent: "#91fff2",
  },
  {
    id: "coralyn",
    name: "Coralyn",
    title: "The Reef Protector",
    colour: "#ff719f",
    accent: "#ffd987",
  },
]);

export const TIDE_SPRINT_MIRI: Readonly<TideSprintCrewDefinition> = Object.freeze({
  id: "miri",
  name: "Miri",
  title: "The Moon Manta",
  colour: "#38d9dc",
  accent: "#ff9fd0",
});

export const TIDE_SPRINT_CHARACTERS: readonly TideSprintCrewDefinition[] =
  Object.freeze([...TIDE_SPRINT_CREW, TIDE_SPRINT_MIRI]);

export interface TideSprintCrewProgress {
  schemaVersion: 1;
  selected: TideSprintCrewId;
  bonds: Record<TideSprintCrewId, number>;
}

export const LEGACY_TIDE_SPRINT_CREW_KEY = "glowfin.v42.clean-tide-sprint-crew";

function freshProgress(): TideSprintCrewProgress {
  return {
    schemaVersion: 1,
    selected: "glowfin",
    bonds: { glowfin: 0, neri: 0, coralyn: 0 },
  };
}

function boundedBond(value: unknown): number {
  const number = Number(value);
  if (!Number.isFinite(number)) return 0;
  return Math.max(0, Math.min(999, Math.floor(number)));
}

export class TideSprintCrewStore {
  constructor(private readonly storage: Pick<Storage, "getItem" | "setItem">) {}

  load(): TideSprintCrewProgress {
    try {
      const parsed = JSON.parse(this.storage.getItem(LEGACY_TIDE_SPRINT_CREW_KEY) ?? "null") as
        Partial<TideSprintCrewProgress> | null;
      if (
        !parsed ||
        parsed.schemaVersion !== 1 ||
        !TIDE_SPRINT_CREW_IDS.includes(parsed.selected as TideSprintCrewId)
      ) {
        return freshProgress();
      }
      return {
        schemaVersion: 1,
        selected: parsed.selected as TideSprintCrewId,
        bonds: Object.fromEntries(TIDE_SPRINT_CREW_IDS.map((id) => [
          id,
          boundedBond(parsed.bonds?.[id]),
        ])) as Record<TideSprintCrewId, number>,
      };
    } catch {
      return freshProgress();
    }
  }

  select(progress: TideSprintCrewProgress, selected: TideSprintCrewId): TideSprintCrewProgress {
    return this.save({ ...progress, selected });
  }

  addBond(
    progress: TideSprintCrewProgress,
    id: TideSprintCrewId,
    amount: number,
  ): TideSprintCrewProgress {
    return this.save({
      ...progress,
      bonds: {
        ...progress.bonds,
        [id]: boundedBond(progress.bonds[id] + Math.max(0, Math.floor(amount))),
      },
    });
  }

  private save(progress: TideSprintCrewProgress): TideSprintCrewProgress {
    try {
      this.storage.setItem(LEGACY_TIDE_SPRINT_CREW_KEY, JSON.stringify(progress));
    } catch {
      // A privacy-restricted browser still keeps the current session playable.
    }
    return progress;
  }
}

export function tideSprintCrewMember(id: TideSprintCharacterId): TideSprintCrewDefinition {
  return TIDE_SPRINT_CHARACTERS.find((member) => member.id === id) ??
    TIDE_SPRINT_CREW[0]!;
}
