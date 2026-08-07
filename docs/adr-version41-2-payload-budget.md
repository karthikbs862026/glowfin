# ADR: Version 41.2 additive payload budget

- Status: Accepted
- Date: 2026-08-06
- Scope: Version 41.2 Living Current plan-compliance rebuild

## Context

Glowfin's existing build check used a 2 MiB placeholder for the whole sealed
distribution. The original Version 41 build was already at that boundary. Its
`version41Micro` production chunk was 24.44 kB raw / 8.80 kB gzip.

The objective-gated Version 41.2 runtime adds the missing encounter state,
recovery, persistent guidance, character identification and completion logic.
After replacing the initial Base64 portraits with compact vector portraits and
keeping the plan module out of the initial chunk, the new chunk is 45.30 kB raw
/ 14.67 kB gzip. The functional delta is therefore 20.86 kB raw / 5.87 kB
gzip. The complete sealed distribution measures 2.02 MiB.

## Decision

Keep the original 2 MiB baseline unchanged and add a separate 32 KiB hard
allowance for the Version 41.2 engagement rebuild. The resulting enforced cap
is 2,129,920 bytes (2.03125 MiB).

This allowance covers code and compact vector portraits only. It does not
relax the existing 90 draw-call, 150,000-triangle, 48 MB texture, 12-material,
700 ms reaction or 30 fps floors. The six objective gates, deterministic seed,
recovery behavior and completion marks remain covered by the automated plan
contract.

## Consequences

- The audited Version 41.2 behavior can ship without hiding growth inside the
  baseline or weakening a runtime-quality gate.
- Future builds do not inherit open-ended headroom; exceeding 2.03125 MiB must
  be fixed or justified by a new measured decision.
- Portraits remain crisp at their 50–125 px HUD sizes without an additional
  raster download.
