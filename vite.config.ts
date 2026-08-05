import { defineConfig, type Plugin } from "vite";
import releaseConfig from "./config/release.json";

type ProcessEnvironment = Record<string, string | undefined>;

interface ReleaseMetadata extends Record<string, unknown> {
  version: number;
  environment: string;
  sourceCommit: string;
}

function environmentVariables(): ProcessEnvironment {
  return (globalThis as typeof globalThis & {
    process?: { env?: ProcessEnvironment };
  }).process?.env ?? {};
}

function releaseLabel(metadata: ReleaseMetadata): string {
  const commit = metadata.sourceCommit === "local"
    ? "local"
    : metadata.sourceCommit.slice(0, 7);
  return `V${metadata.version} · ${metadata.environment.toUpperCase()} · ${commit}`;
}

function releaseMetadataPlugin(metadata: ReleaseMetadata): Plugin {
  const label = releaseLabel(metadata);
  return {
    name: "glowfin-release-metadata",
    transformIndexHtml(html) {
      return html
        .replace(/Glowfin — Version \d+/, `Glowfin — Version ${metadata.version}`)
        .replace(/V\d+ · LOCAL · local/, label);
    },
    generateBundle() {
      this.emitFile({
        type: "asset",
        fileName: "release.json",
        source: `${JSON.stringify(metadata, null, 2)}\n`
      });
    }
  };
}

function compactCss(source: string): string {
  let compact = "";
  let quote: "\"" | "'" | null = null;
  let escaped = false;
  let pendingSpace = false;
  for (let index = 0; index < source.length; index++) {
    const character = source[index] ?? "";
    const next = source[index + 1] ?? "";
    if (quote) {
      compact += character;
      if (escaped) escaped = false;
      else if (character === "\\") escaped = true;
      else if (character === quote) quote = null;
      continue;
    }
    if (character === "\"" || character === "'") {
      if (pendingSpace && compact && !"{}:;,".includes(compact.at(-1) ?? "")) {
        compact += " ";
      }
      pendingSpace = false;
      quote = character;
      compact += character;
      continue;
    }
    if (character === "/" && next === "*") {
      const end = source.indexOf("*/", index + 2);
      index = end < 0 ? source.length : end + 1;
      continue;
    }
    if (/\s/.test(character)) {
      pendingSpace = true;
      continue;
    }
    if ("{}:;,".includes(character)) {
      compact = compact.replace(/ $/, "");
      compact += character;
      pendingSpace = false;
      continue;
    }
    if (pendingSpace && compact && !"{}:;,(".includes(compact.at(-1) ?? "")) {
      compact += " ";
    }
    pendingSpace = false;
    compact += character;
  }
  return compact.trim().replace(/;}+/g, "}");
}

function shippedHtmlBudgetPlugin(): Plugin {
  return {
    name: "glowfin-shipped-html-budget",
    apply: "build",
    enforce: "post",
    transformIndexHtml(html) {
      return html
        .replace(/<!--(?!\[if)[\s\S]*?-->/g, "")
        .replace(/<style([^>]*)>([\s\S]*?)<\/style>/gi, (_match, attributes: string, css: string) => (
          `<style${attributes}>${compactCss(css)}</style>`
        ))
        .replace(/>\s+</g, "><")
        .trim();
    }
  };
}

// Part 4.4 — asset pipeline hooks (Draco/KTX2, atlasing, Brotli) get added
// here as plugins in Phase 0/1. Kept minimal until there's real content to
// pipe through it — an empty pipeline config would just be decoration.
export default defineConfig(({ command }) => {
  const environment = environmentVariables();
  const sourceCommit = environment["GLOWFIN_COMMIT_SHA"]?.trim() || "local";
  const releaseEnvironment = environment["GLOWFIN_ENVIRONMENT"] ??
    (command === "serve" || sourceCommit === "local" ? "local" : "staging");
  if (!["local", "staging", "production"].includes(releaseEnvironment)) {
    throw new Error(
      `GLOWFIN_ENVIRONMENT must be local, staging, or production; received ${releaseEnvironment}.`
    );
  }

  if (
    (sourceCommit !== "local" && !/^[0-9a-f]{40}$/.test(sourceCommit)) ||
    (releaseEnvironment !== "local" && sourceCommit === "local")
  ) {
    throw new Error(
      "A staged or production Glowfin build requires a full 40-character lowercase Git SHA."
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
    plugins: [
      releaseMetadataPlugin(releaseMetadata),
      shippedHtmlBudgetPlugin()
    ],
    define: {
      __GLOWFIN_RELEASE__: JSON.stringify(releaseMetadata)
    },
    build: {
      target: "es2020",
      sourcemap: true
    }
  };
});
