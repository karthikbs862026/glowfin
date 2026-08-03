import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

const generatedDirectory = resolve(
  process.argv[2] ?? "build/runtime-glbs"
);
const publishedDirectory = resolve(
  process.argv[3] ?? "public/art/moon-garden/models"
);
const files = [
  "glowfin-v2.glb",
  "moon-gate-v1.glb",
  "reef-kit-v1.glb",
  "manifest.json"
];

for (const file of files) {
  const [generated, published] = await Promise.all([
    readFile(resolve(generatedDirectory, file)),
    readFile(resolve(publishedDirectory, file))
  ]);
  if (!generated.equals(published)) {
    throw new Error(
      `Published runtime asset ${file} differs from the deterministic export.`
    );
  }
  if (file.endsWith(".glb") && published.subarray(0, 4).toString("ascii") !== "glTF") {
    throw new Error(`${file} is not resolved binary glTF content.`);
  }
}

console.log("Published Version 30 runtime GLBs match the deterministic export.");
