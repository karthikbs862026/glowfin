# Glowfin Version 39 data-safety answers

## Default state

The game is playable with telemetry denied. Local progress, tutorial state,
accessibility preferences and haptic preference remain on the device. Version
39 contains no third-party advertising or analytics SDK.

## Optional network activity

When the player explicitly grants telemetry consent, Glowfin may send bounded
gameplay funnel and runtime-health events. Payloads exclude name, email, raw IP,
advertising ID, precise location, contacts, photos, user-agent string, raw GPU
name, pointer coordinates and persistent device fingerprint. Device-health
segments are coarse buckets for screen class, memory, cores, quality tier and
frame-time bands.

Cloud progress, verified leaderboards and Moonflash challenge publication use
the authenticated first-party host when available. Shared Moonflash records
contain a deterministic replay, score, multiplier, accessibility division and
expiry; they do not contain touch paths or a personal profile.

## Retention and control

- Telemetry: 90 days
- Daily leaderboard: 90 days
- Global leaderboard: 365 days
- Shared Moonflash challenge: 30 days
- Rate-limit records: 1 day

Telemetry can be disabled from Settings. Store privacy forms must be reconciled
against the exact production host and any future SDK immediately before
submission; adding a vendor invalidates this declaration until reviewed.
