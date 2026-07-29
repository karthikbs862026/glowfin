Add this one script to package.json (inside "scripts"):

    "sweep": "cross-env-less: see below"

On Windows PowerShell, run the wide nightly sweep with:

    $env:GLOWFIN_SWEEP_SEEDS=2000; $env:GLOWFIN_SWEEP_DISTANCE=8000; npx vitest run tests/solvability.test.ts

On macOS/Linux or in CI:

    GLOWFIN_SWEEP_SEEDS=2000 GLOWFIN_SWEEP_DISTANCE=8000 npx vitest run tests/solvability.test.ts
