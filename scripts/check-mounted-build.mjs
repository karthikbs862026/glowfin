import { readdir, readFile, stat } from "node:fs/promises";

const root = new URL("../dist/", import.meta.url);
const index = await readFile(new URL("index.html", root), "utf8");

if (/\b(?:src|href)=["']\/assets\//.test(index)) {
  throw new Error(
    "Production HTML contains a site-root asset URL and cannot mount under /game."
  );
}
if (!index.includes('id="startup-error" role="alert"')) {
  throw new Error("Production HTML omits the visible startup recovery state.");
}
if (!index.includes('id="runtime-status"')) {
  throw new Error("Production HTML omits the runtime recovery state.");
}
if (!index.includes('id="hud-build"')) {
  throw new Error("Production HTML omits the Settings diagnostic release identity.");
}
for (const id of [
  "moonwell-hub",
  "moonwell-dive",
  "moonwell-wardrobe-grid",
  "tutorial-overlay",
  "hud-dive-again",
  "hud-open-hub"
]) {
  if (!index.includes(`id="${id}"`)) {
    throw new Error(`Production HTML omits Version 37 player surface #${id}.`);
  }
}

const release = JSON.parse(await readFile(new URL("release.json", root), "utf8"));
const expectedRelease = JSON.parse(
  await readFile(new URL("../config/release.json", import.meta.url), "utf8")
);
if (
  release.version !== expectedRelease.version ||
  release.phase !== expectedRelease.phase
) {
  throw new Error(
    `Production release metadata does not identify Version ${expectedRelease.version}.`
  );
}

const assetsUrl = new URL("assets/", root);
const files = await readdir(assetsUrl);
const mainBundles = files.filter((file) => /^index-[^.]+\.js$/.test(file));
const contrastBundles = files.filter((file) => /^contrastProbe-[^.]+\.js$/.test(file));
if (mainBundles.length !== 1 || contrastBundles.length !== 1) {
  throw new Error(
    `Production assets contain stale hashed bundles: ${mainBundles.length} main, ${contrastBundles.length} contrast.`
  );
}
const bundles = await Promise.all(
  files
    .filter((file) => file.endsWith(".js"))
    .map((file) => readFile(new URL(file, assetsUrl), "utf8"))
);
const source = bundles.join("\n");
for (const texture of [
  "moonstone-seabed.webp",
  "moonstone-surface.webp",
  "living-reef-surface.webp",
  "glowfin-surface.webp"
]) {
  const relativePath = `art/moon-garden/${texture}`;
  if (!source.includes(relativePath)) {
    throw new Error(`Production bundle omits ${relativePath}.`);
  }
  if (source.includes(`\"/${relativePath}`)) {
    throw new Error(`${relativePath} is incorrectly pinned to the site root.`);
  }
  const texturePath = new URL(relativePath, root);
  const info = await stat(texturePath);
  if (!info.isFile() || info.size === 0) {
    throw new Error(`${relativePath} is missing or empty.`);
  }
}

for (const model of [
  "glowfin-v2.glb",
  "moon-gate-v1.glb",
  "reef-kit-v1.glb",
  "manifest.json"
]) {
  const relativePath = `art/moon-garden/models/${model}`;
  if (model.endsWith(".glb") && !source.includes(relativePath)) {
    throw new Error(`Production bundle omits ${relativePath}.`);
  }
  if (source.includes(`\"/${relativePath}`)) {
    throw new Error(`${relativePath} is incorrectly pinned to the site root.`);
  }
  const modelPath = new URL(relativePath, root);
  const info = await stat(modelPath);
  if (!info.isFile() || info.size === 0) {
    throw new Error(`${relativePath} is missing or empty.`);
  }
}

console.log("Mounted production build paths are valid.");
