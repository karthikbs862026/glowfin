import { createHash } from "node:crypto";
import { readdir, readFile, writeFile } from "node:fs/promises";

const root = new URL("../", import.meta.url);
const dist = new URL("dist/", root);
const releaseUrl = new URL("release.json", dist);

async function filesBelow(directory, prefix = "") {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = [];
  for (const entry of entries.sort((a, b) => a.name.localeCompare(b.name))) {
    const path = `${prefix}${entry.name}`;
    if (entry.isDirectory()) {
      files.push(...await filesBelow(new URL(`${entry.name}/`, directory), `${path}/`));
    } else if (entry.isFile() && path !== "release.json") {
      files.push(path);
    }
  }
  return files;
}

const base = JSON.parse(await readFile(releaseUrl, "utf8"));
const files = await filesBelow(dist);
const hash = createHash("sha256");
for (const path of files) {
  hash.update(path, "utf8");
  hash.update("\0");
  hash.update(await readFile(new URL(path, dist)));
  hash.update("\0");
}
const manifest = {
  ...base,
  sealSchemaVersion: 1,
  artifactDigest: hash.digest("hex"),
  artifactFileCount: files.length
};
await writeFile(releaseUrl, `${JSON.stringify(manifest, null, 2)}\n`);
console.log(
  `Sealed Glowfin V${manifest.version} manifest: ${manifest.artifactDigest.slice(0, 12)} (${files.length} files).`
);
