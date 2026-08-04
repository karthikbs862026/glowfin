# Phase 5B Release Report — Version 36

## Candidate identity

| Field | Value |
|---|---|
| Release | Version 36 · Phase 5B |
| Baseline | Version 35 merge `2fca087dbec1b24b48c8398c7c24f0abea5c0454` |
| Certification | `production-readiness-candidate` |
| Production policy | Version 1 |
| Frozen truth | Gameplay tuning, controls, camera, collision, scoring, replay validation, art and audio |

## Code-owned acceptance

| Gate | Evidence contract |
|---|---|
| Network failure | One bounded retry for transient reads; no automatic replay of writes; optional services never stop the run |
| Health monitoring | Consent-gated runtime signals plus identity-free hosted request counters and versioned alert thresholds |
| Retention funnel | Aggregate first-run → run → reward → unlock/equip → Daily Tide → next-day-return counts; no raw identities in responses |
| Abuse controls | Authenticated fixed-window limits for save, telemetry, leaderboard, sharing, rewards and operations reads |
| Reward authority | Signed opaque receipt, one claim per run, bounded Lumen-only grant; competitive recovery disabled |
| Data lifecycle | Enforced expiry for telemetry, Daily/global boards, shared clips, reward claims and rate-limit buckets |
| Release identity | Source-pinned sealed manifest with deterministic SHA-256 artifact digest and file count |
| Rollback | Version 35 is a verified ancestor and the only immediate previous-version target |
| Regression | Complete CI, production gate, structural art, phone-render, touch/audio, context recovery and 5,400-frame soak remain mandatory |

## Automated evidence

The final merge requires the local certificate and all GitHub checks to be
green. The authoritative counts, source SHA, artifact digest, Sites integration
result and merged commit are recorded in the pull request and release handoff.

## Conditional physical evidence

Version 36 does not claim a public cross-platform launch certificate until:

- Samsung Galaxy S22 Ultra and OPPO Reno3 Pro each complete a real-time
  30-minute sound-on thermal, battery, interruption and context-recovery run;
- one real iPhone Safari device completes rendering, audio unlock, background,
  memory-pressure recovery, accessibility and 30-minute review; and
- the first-run-to-simulated-next-UTC-day journey is recorded once with consent
  granted and once with consent denied.

The owner-only checkpoint may be merged and deployed while these rows remain
clearly conditional. Public promotion may not silently waive them.
