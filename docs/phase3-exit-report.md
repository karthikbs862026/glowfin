# Phase 3 Exit Report — Version 31

**Certificate state:** Conditional — automated certification green; real-device sign-off pending  
**Frozen gameplay/art baseline:** Version 30 / `4e797b44053bca96fd9dfb1bbb637dbe88653219`  
**Initial immutable evidence head:** `e29bba44b5cba05a532b1e4e934ec2afc45a4d3c`  
**Tracking:** GitHub issue #14 and draft PR #15

## Scope

Version 31 is a certification and release-control build. It must not change
gameplay, controls, camera, collision, scoring, procedural generation, tuning,
world art, Glowfin geometry/animation or audio. A diff in any of those areas is
a release blocker and requires a separate owner-reviewed build.

## Automated certificate

| Gate | Requirement | Candidate state |
|---|---|---|
| Source identity | Visible V31 environment + exact source SHA | Green — badge, document data and compiled metadata agree |
| Release manifest | Deterministic `release.json`, frozen V30 baseline | Green — exact environment, source and baseline validated |
| Core CI | lint, types, all tests, production build | Green — 269 tests plus lint, types and production build |
| Release guards | mounted paths, bundle ceiling, debug stripped | Green — 1.82 MB production package |
| Clean artifact | exactly one main and one contrast hashed bundle | Green — stale-output regression guard passed |
| Asset contract | deterministic export/pack/publish verification | Green — 878,100-byte runtime GLB package |
| Structural art | all semantic assets, colliders and budgets | Green — 47 adversarial checks, zero blockers |
| Phone rendering | complete 36-state 390×844 matrix | Green — 72 peak draws, 130,089 peak triangles, 10.3 MB textures |
| Touch/audio | gesture activation, signal, mute/reload | Green — button, reload and real-touch canvas paths passed |
| Lifecycle | 5,400 frames, bounded heap/resources, zero context loss | Green — 0.46 MB heap growth, fixed 103/18 GPU resources, zero losses |
| Hosted smoke | document, release manifest, source headers, no-store | Required deployment evidence; recorded on PR #15 and issue #14 |

The lifecycle runner covered 30.00 simulated minutes and 5,400 real WebGL
renders. Its peak scene reached 80 draws and 141,235 triangles with 14 live
gates, still inside the hard ceilings. Baseline, peak and end resources remained
identical at 103 geometries and 18 textures. The full phone matrix separately
owns 390×844 visual truth; the soak uses a reduced portrait raster to isolate
renderer lifecycle behavior.

## Frozen Version 30 evidence

The owner approved the final Android image after the corrected forward-crown,
obstacle-facing eye placement. The exact approved PR head passed 266 tests, 47
adversarial art checks, both phone-render paths, touch audio and the fixed
5,400-frame lifecycle soak before squash merge.

The last measured render envelope was 72 peak draws, 131,265 peak triangles,
10.3 MB decoded textures, a 2.0-second maximum-momentum reaction window, 0.5 MB
heap growth and zero context losses. Version 31 adds no WebGL work; its DOM
release badge and JSON manifest must preserve those ceilings in the fresh run.

## Manual device certificate

| Device | Current-scene visual/gameplay | 30-minute real-time thermal/perf | speaker/headphone mix | interruptions/background | Result |
|---|---|---|---|---|---|
| Samsung Galaxy S22 Ultra | Owner-approved | Not run | Not run | Not run | Pending |
| OPPO Reno3 Pro | Owner-approved | Not run | Not run | Not run | Pending |
| Real iPhone Safari | Not run | Not run | Not run | Not run | Blocking |

Emulated Chromium evidence is valuable but does not replace these rows. Until
they pass, the correct wording is **Version 31 automated certification green,
real-device certification pending**.

## Phase decision

- Phase 3 art/game baseline: frozen and owner-approved.
- Automated release certificate: green on the recorded evidence head; every
  final PR head must repeat the same workflows before deployment.
- Cross-platform Phase 3 exit: blocked by the real-device rows above.
- Phase 4 feature work may be planned, but release promotion must retain this
  device risk explicitly and must not relabel it as completed evidence.
