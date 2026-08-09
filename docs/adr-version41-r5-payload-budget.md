# ADR: Version 41-R5 executable and sealed-payload budgets

- Status: Accepted
- Date: 2026-08-09
- Scope: clean Version 41-R5 Expedition completion

## Context

The legacy bundle check treated every production file as executable code and
used a provisional 2 MiB ceiling. The sealed package now contains three
deterministically generated runtime GLBs, four authored textures, HTML and the
application JavaScript. Those art assets are required by the already-certified
production renderer and should not silently consume the code-growth ceiling.

The R5 build measures approximately 1.00 MiB of JavaScript and 2.06 MiB for the
complete non-map sealed payload. R5 adds deterministic objective directors,
bounded renderer pools and checksummed Expedition progress; it adds no new
texture and reuses the existing living-world and inlay materials.

## Decision

Enforce two independent raw-byte ceilings:

- 2 MiB for all production JavaScript combined.
- 3 MiB for the complete sealed non-map payload, including runtime GLBs and
  textures.

The check reads both values from `config/budgets.json` and fails either ceiling
independently. Existing draw-call, triangle, texture-memory, material, frame-rate
and lifecycle limits remain unchanged.

## Consequences

- Executable growth remains bounded independently of immutable production art.
- The full download retains almost 1 MiB of explicit headroom for release
  metadata variation without weakening runtime performance gates.
- Version 42 must keep Tide Sprint lazy and certify its mode payload separately;
  the 3 MiB ceiling is not permission to preload that mode into Classic Dive.
