# Version 39 — Guided Onboarding & Store-Ready Mobile Experience

Status: **in development** from merged Version 38 commit `8f529b9`.

## Slice A — discoverable guided tutorial

Version 37 contained a bounded in-run overlay, but returning Version 36 saves
were migrated with `tutorialCompleted: true`. Those players never saw it, and
there was no permanent replay entry point. Version 39 treats that as an
onboarding defect rather than evidence that the tutorial was complete.

This slice adds:

- a first-hub tutorial invitation keyed to a new Version 39 device-local stamp;
- permanent tutorial entries on the Moon Well home view and in Settings;
- explicit start, `Skip for now`, in-run exit and replay paths;
- six action-focused lessons: automatic forward movement, drag left, drag
  right, cyan safe openings, near-miss/Moonflash reward and collision recovery;
- per-step fallbacks that complete the sequence in about 30 seconds even when
  an action is difficult or no matching obstacle event occurs;
- consent-gated start, step, skip/replay and completion telemetry; and
- tests for action progression, fallbacks, copy/cues, persistence and tutorial
  discoverability in the phone shell.

The stamp is intentionally separate from score, economy and cloud progress. It
contains only tutorial version `39`, cannot duplicate rewards and cannot make an
existing Version 38 save invalid.

## Remaining Version 39 work

- Capacitor Android/iOS wrappers and store-submission project configuration
- safe areas, orientation and native navigation lifecycle
- native haptics and physical audio/background/resume certification
- startup/loading and offline recovery polish
- rendered Moonflash media and `Beat My Current` deep links
- front-facing Glowfin reward/recovery presentation polish
- privacy, age, accessibility and store-metadata sign-off
- crash-free, thermal and segmented device-performance evidence
- Samsung S22 Ultra, Oppo Reno3 Pro and at least two iPhone acceptance runs

Version 39 must not be tagged as complete until those remaining gates pass.
