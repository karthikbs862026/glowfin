# Phase 3 Exit Report — Version 31

**Certificate state:** Conditional — automated candidate  
**Frozen gameplay/art baseline:** Version 30 / `4e797b44053bca96fd9dfb1bbb637dbe88653219`  
**Tracking:** GitHub issue #14

## Scope

Version 31 is a certification and release-control build. It must not change
gameplay, controls, camera, collision, scoring, procedural generation, tuning,
world art, Glowfin geometry/animation or audio. A diff in any of those areas is
a release blocker and requires a separate owner-reviewed build.

## Automated certificate

| Gate | Requirement | Candidate state |
|---|---|---|
| Source identity | Visible V31 environment + exact source SHA | Implemented; remote evidence pending |
| Release manifest | Deterministic `release.json`, frozen V30 baseline | Implemented; remote evidence pending |
| Core CI | lint, types, all tests, production build | Pending PR run |
| Release guards | mounted paths, bundle ceiling, debug stripped | Pending PR run |
| Clean artifact | exactly one main and one contrast hashed bundle | Pending PR run |
| Asset contract | deterministic export/pack/publish verification | Pending PR run |
| Structural art | all semantic assets, colliders and budgets | Pending PR run |
| Phone rendering | complete 36-state 390×844 matrix | Pending PR run |
| Touch/audio | gesture activation, signal, mute/reload | Pending PR run |
| Lifecycle | 5,400 frames, bounded heap/resources, zero context loss | Pending PR run |
| Hosted smoke | document, release manifest, source headers, no-store | Pending checkpoint |

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
- Automated release certificate: pending this PR and hosted checkpoint.
- Cross-platform Phase 3 exit: blocked by the real-device rows above.
- Phase 4 feature work may be planned, but release promotion must retain this
  device risk explicitly and must not relabel it as completed evidence.
