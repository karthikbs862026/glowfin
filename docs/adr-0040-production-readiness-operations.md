# ADR-0040 — Production readiness and release operations

**Status:** Accepted for Version 36 Phase 5B  
**Date:** 2026-08-04

## Context

Version 35 can recover from browser and graphics interruptions, but a resilient
client is not by itself an operable release. Glowfin still needs bounded network
failure behavior, privacy-safe production health, abuse controls, enforceable
data expiry, immutable artifact identity and a rehearsed rollback decision.
None of those concerns may change deterministic run truth or silently turn
diagnostic collection on for a player who denied telemetry consent.

## Decision

1. Hosted reads use one bounded retry for transient failures. Writes never
   retry automatically because the server may have accepted the first request.
2. Runtime and retention diagnostics remain zero-collection until explicit
   consent. The hosted authority may keep identity-free daily operational
   counters for request outcomes, rate limiting and service availability.
3. Telemetry, Daily leaderboards, global leaderboards, Moonflash descriptors,
   rewarded claims and rate-limit buckets receive explicit expiry policies.
4. Authenticated write routes use user-keyed fixed-window limits. No IP address,
   device fingerprint, pointer path or raw account identifier is stored.
5. Rewarded completion is not sufficient to mutate Lumen Pearls. A same-origin
   authority must verify an opaque provider receipt, enforce one claim per run
   and bound the cosmetic-only grant. Competitive recovery remains disabled.
6. Every build emits a sealed `release.json` containing its exact source,
   baseline, policy version, artifact count and SHA-256 digest. The artifact is
   never promoted by relabelling it.
7. Pull requests must pass the deterministic fault/privacy/rollback gate. A
   main-branch release tag is created only after the structural, render,
   touch/audio, recovery and 5,400-frame soak jobs all pass.
8. Production-health alert thresholds and funnel steps are versioned code, not
   mutable dashboard folklore. Dashboards expose aggregates only.

## Consequences

- Optional hosted services fail without stopping the deterministic local run.
- Rate limits and expired data are enforced by the hosted authority rather
  than relying on clients to behave.
- A Version 36 candidate can be traced to one source and artifact digest and
  can select Version 35 as its previous known-good rollback target.
- Real Android thermal/audio/interruption evidence and real iPhone Safari
  evidence remain physical gates. Automation and a successful merge cannot
  truthfully replace them, so public production promotion stays conditional.
