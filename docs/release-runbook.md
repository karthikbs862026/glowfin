# Release and Rollback Runbook

## Environment contract

| Environment | Purpose | Required identity |
|---|---|---|
| `local` | developer iteration | `V38 · LOCAL · local` |
| `staging` | owner-only certification checkpoint | exact Git commit SHA and artifact digest |
| `production` | promoted public release | exact `glowfin-v38` tagged commit and unchanged artifact digest |

Never promote an artifact by renaming its environment. Rebuild from the same
source SHA with the intended environment and repeat the release checks.

## Staging handoff

1. Merge only after the PR's Core CI, structural, phone-render, touch-audio and
   lifecycle gates are green, plus the Phase 5B fault/privacy/rollback gate and
   Version 37 onboarding/economy journey tests and Version 38 deterministic
   obstacle-variety tests.
2. Use the immutable staging artifact produced from `main`, or rebuild the exact
   SHA with `GLOWFIN_ENVIRONMENT=staging` and `GLOWFIN_COMMIT_SHA=<full-sha>`.
3. Deploy that unchanged artifact to the owner-only Glowfin checkpoint.
4. Run:

   ```bash
   npm run smoke:deployment -- --url <staging-url> --environment staging --commit <full-sha> --require-headers
   ```

5. Confirm the Settings diagnostic badge, `release.json`, response headers and PR head all
   name the same source, and that the manifest's artifact digest matches the
   staged bundle. A mismatch is a failed deployment even if the game appears to
   load.

## Promote criteria

- All automated rows in `docs/phase3-exit-report.md` and the current phase
  release report are green.
- All required real-device rows are signed off.
- No Core Design Principle regression or unresolved release-blocking issue.
- The previous known-good version remains available for rollback.
- The immutable release tag was created only after every main-branch render and
  soak gate completed.

## Rollback

1. Stop promotion and record the symptom, device/browser, source SHA and run
   seed when relevant.
2. Through the managed Sites deployment workflow, redeploy the immediately
   previous version already marked known-good. Do not rebuild or edit it.
3. Run the post-deploy smoke command against the previous version's expected
   source SHA.
4. Confirm the Settings diagnostic badge and response header changed back to that SHA.
5. Confirm the rollback manifest is the saved Version 37 artifact, not a rebuild.
6. Open a regression issue before resuming promotion.

The rollback target is intentionally selected from immutable hosted version
history instead of hardcoding an opaque deployment ID in the repository.
