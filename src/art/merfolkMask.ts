/** Shared semantic colours for rendered merfolk QA. */

export const MERFOLK_MASK = {
  guardianBody: { id: 1, role: "guardian-body", colour: 0xff0000 },
  guardianIdentity: { id: 2, role: "guardian-regalia", colour: 0xffff00 },
  guardianFace: { id: 3, role: "guardian-face", colour: 0x00ffff },
  guardianEyes: { id: 4, role: "guardian-eyes", colour: 0xffffff },
  citizenBody: { id: 5, role: "reef-citizen", colour: 0x00ff00 },
  swimmerBody: { id: 6, role: "current-swimmer", colour: 0x0000ff },
  heraldBody: { id: 7, role: "conch-herald", colour: 0xff00ff },
  citizenFace: { id: 8, role: "reef-citizen-face", colour: 0xff8000 },
  citizenEyes: { id: 9, role: "reef-citizen-eyes", colour: 0x80ff00 },
  swimmerFace: { id: 10, role: "current-swimmer-face", colour: 0x0080ff },
  swimmerEyes: { id: 11, role: "current-swimmer-eyes", colour: 0x8000ff },
  heraldFace: { id: 12, role: "conch-herald-face", colour: 0xff4050 },
  heraldEyes: { id: 13, role: "conch-herald-eyes", colour: 0x00ff80 }
} as const;

export const MERFOLK_MASK_ENTRIES = Object.values(MERFOLK_MASK);

export const MERFOLK_MASK_MAX_ID = Math.max(
  ...MERFOLK_MASK_ENTRIES.map((entry) => entry.id)
);
