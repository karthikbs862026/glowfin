# Version 41 live deployment correction

## Root cause

The existing playable site was still sourced from `main`, whose latest product release was Version 39. Version 41 remained in PR #25 and therefore could not appear in the hosted build.

## Runtime corrections before release

- Quarantine The Missing Moonseed from standard Endless Dive rewards, counters, replay, leaderboard and post-run state.
- Give the Expedition an independent three-minute clock that survives guardian recovery.
- Recover an exhausted underlying current without ending the Expedition or mutating standard progress.
- Stop the underlying run when the Expedition completes.
- Preserve the Version 40 economy, privacy, accessibility and competitive-integrity surfaces.

## Verification corrections

- Exercise guardian recovery in the unattended mobile journey.
- Compare standard primary and backup progress before and after the Expedition.
- Fail if the standard post-run screen appears during the Expedition.
- Validate manual card entry and the `?expedition=missing-moonseed` deep link.
- Use bounded `domcontentloaded` navigation and release completed browser contexts before the accessibility pass.

No failed gate is waived. This record exists to trigger and identify the owner-authored final verification head before merge and deployment.
