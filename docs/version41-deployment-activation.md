# Version 41 Post-Merge Release Activation

Version 41 — Living Current Vertical Slice was merged into `main` as commit `c14c7b74ba4b00e574b6e4a99b8ed345225e265b` after all mandatory pull-request gates passed.

The original playable checkpoint remained on its earlier release because the connector-generated squash merge did not produce the expected immutable `glowfin-v41` tag. This owner-authored pull request creates a normal protected-branch merge event so the repository's `main` push pipeline and connected hosted deployment can process Version 41.

Release acceptance remains fail-closed:

- all `main` CI, production-readiness, wrapper, art, audio, recovery, exact Version 41 mobile-journey and renderer-soak jobs must pass;
- an immutable staging artifact must be produced;
- `glowfin-v41` must point at the resulting `main` commit;
- the authenticated hosted checkpoint must expose the **The Missing Moonseed** Moon Well entry and direct Expedition route.

No gameplay, economy, progression, art, accessibility or competitive behavior is changed by this activation record.
