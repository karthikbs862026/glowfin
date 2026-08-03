import { defineConfig, type Plugin } from "vite";
import releaseConfig from "./config/release.json";

type ProcessEnvironment = Record<string, string | undefined>;

function environmentVariables(): ProcessEnvironment {
  return (globalThis as typeof globalThis & {
    process?: { env?: ProcessEnvironment };
  }).process?.env ?? {};
}

function releaseMetadataPlugin(metadata: Record<string, unknown>): Plugin {
  return {
    name: "glowfin-release-metadata",
    generateBundle() {
      this.emitFile({
        type: "asset",
        fileName: "release.json",
        source: `${JSON.stringify(metadata, null, 2)}\n`
      });
    }
  };
}

// Part 4.4 — asset pipeline hooks (Draco/KTX2, atlasing, Brotli) get added
// here as plugins in Phase 0/1. Kept minimal until there's real content to
// pipe through it — an empty pipeline config would just be decoration.
export default defineConfig(({ command }) => {
  const environment = environmentVariables();
  const releaseEnvironment = environment["GLOWFIN_ENVIRONMENT"] ??
    (command === "serve" ? "local" : "staging");
  if (!["local", "staging", "production"].includes(releaseEnvironment)) {
    throw new Error(
      `GLOWFIN_ENVIRONMENT must be local, staging, or production; received ${releaseEnvironment}.`
    );
  }

  const sourceCommit = environment["GLOWFIN_COMMIT_SHA"]?.trim() || "local";
  if (sourceCommit !== "local" && !/^[0-9a-f]{7,40}$/.test(sourceCommit)) {
    throw new Error(
      "GLOWFIN_COMMIT_SHA must be 'local' or a 7-40 character lowercase Git SHA."
    );
  }

  const releaseMetadata = {
    ...releaseConfig,
    environment: releaseEnvironment,
    sourceCommit
  };

  return {
    // Keep the production bundle mount-safe. The same immutable build runs at
    // repository root locally and under /game in the hosted playtest shell.
    base: "./",
    plugins: [releaseMetadataPlugin(releaseMetadata)],
    define: {
      __GLOWFIN_RELEASE__: JSON.stringify(releaseMetadata)
    },
    build: {
      target: "es2020",
      sourcemap: true
    }
  };
});
