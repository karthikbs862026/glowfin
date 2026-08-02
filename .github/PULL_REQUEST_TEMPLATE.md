## What changed

<!-- Summarize the change. Link the tracking issue. -->

## Core Design Principle risk check

<!-- Part 1.3: input latency, collision determinism/frame-rate independence,
     obstacle lead-time, visual-effect-vs-readability tradeoffs.
     If none apply, say so explicitly rather than leaving this blank. -->

- [ ] No change to input handling, collision, movement, or camera lead-time
- [ ] Change touches one of the above — explain the risk and how it was mitigated:

## Performance budget impact (Part 4.6)

<!-- Draw calls, triangles, texture memory, particle/trail pool sizes,
     bundle size, input-to-visible-response latency. "No impact" is a valid
     answer but must be stated, not assumed. -->

## Tests added / updated

- [ ] Unit
- [ ] Integration
- [ ] Movement/control (Part 6.4 — determinism, frame-rate independence, latency)
- [ ] Visual regression (Part 6.5)
- [ ] Headless simulation / solvability (Part 6.6)
- [ ] N/A — explain why:

## Manual test steps

<!-- What did you actually click/swipe/run to verify this, and on what device? -->

## Merfolk visual acceptance (required when character or environment staging changes)

- [ ] Tidekeeper is identifiable at normal speed in the 390×844 cast atlas
- [ ] Coral Warden is identifiable by sea-fan regalia, not only colour
- [ ] Astral Oracle is identifiable by armillary/star regalia, not only colour
- [ ] Reef citizens have visible faces
- [ ] Current swimmers read as lateral swimmers
- [ ] Both conch heralds and their conches are visible
- [ ] Guardian is in front of architecture, unclipped and outside the lane
- [ ] Owner phone review attached; a green CI mask is not semantic approval

## Audio acceptance (required when sound or event routing changes)

- [ ] Page remains silent and AudioContext stays locked before the first real gesture
- [ ] First canvas touch unlocks sound without delaying steering or showing startup error
- [ ] Low/mid/max momentum audibly add layers from the same simulation value
- [ ] Near-miss, multiplier, collision and recovery cues are distinct at phone-speaker volume
- [ ] Mute is keyboard/touch accessible, persists across reload and suspends background work
- [ ] Android/iOS device evidence attached, or explicitly listed as still outstanding

## Self-review checklist (required for solo merges — Part 5.2)

- [ ] Read the diff top to bottom as if reviewing someone else's code
- [ ] No hardcoded tuning values that belong in config (Part 2 preamble)
- [ ] No new `console.log`/debug scaffolding left in
- [ ] Docs updated if behavior or setup changed (Part 5.4)
