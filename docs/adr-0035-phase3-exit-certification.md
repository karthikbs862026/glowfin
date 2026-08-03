# ADR-0035: Phase 3 exit certification boundary

**Status:** Implemented as the Version 31 certification candidate  
**Date:** 2026-08-03

## Context

Version 30 is owner-approved and merged. Continuing to change character or
world art during certification would invalidate the evidence already gathered
and make release readiness impossible to measure. The master prompt also
forbids declaring a phase complete when real-device requirements were skipped.

The repository previously had strong game-specific render gates but no single
release identity tying a hosted build to its source, no machine-readable
certificate payload, no post-deploy fingerprint check, and stale documentation
that still called approved work a candidate.

## Decision

- Freeze gameplay, input, camera, collision, scoring, generation, tuning, art,
  animation and audio at the Version 30 merge tree
  `4e797b44053bca96fd9dfb1bbb637dbe88653219`.
- Identify every build with Version, environment and source commit in both a
  small in-game badge and deterministic `release.json`.
- Allow only `local`, `staging` and `production` environment identities. A
  staging or production artifact with an ambiguous source fingerprint fails
  certification.
- Make the normal build validate release metadata, mount safety, bundle size
  and debug stripping. Keep the structural, full phone matrix, touch-audio and
  5,400-frame lifecycle gates as independent release evidence.
- On `main`, repeat the full render and soak gates and emit an immutable staging
  artifact. The external owner-only Sites checkpoint consumes the same exact
  source fingerprint and is verified with the repository's post-deploy smoke
  command.
- Preserve the previous known-good hosted checkpoint until the new deployment
  fingerprint and smoke test pass. Production promotion is separate from this
  internal staging checkpoint.
- Classify the automated certificate as **conditional-device-signoff** until
  the two Android real-time thermal/audio/interruption rows and one real iPhone
  Safari row pass. Desktop emulation cannot waive this boundary.

## Consequences

Version 31 can prove what code and asset baseline is running and can reject a
stale or mislabelled deployment without touching the game itself. The extra
badge is DOM-only and adds no WebGL draws, triangles, textures or collision
work.

Automatic deployment from GitHub Actions into the owner-only Sites project is
not available without crossing the platform credential boundary. The workflow
therefore produces the immutable staging artifact automatically; the managed
checkpoint performs deployment and the same repository smoke contract verifies
it. This limitation remains explicit rather than storing deployment credentials
in GitHub.

Phase 3 may be called **automated-certification green** after all repository and
hosted smoke gates pass. It may not be called **unconditionally complete** until
the real-device rows in `docs/device-matrix.md` are signed off.
