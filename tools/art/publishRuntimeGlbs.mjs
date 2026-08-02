import { copyFile, mkdir } from "node:fs/promises";
import { resolve } from "node:path";

const generatedDirectory = resolve(
  process.argv[2] ?? "build/runtime-glbs"
);
const publishedDirectory = resolve(
  process.argv[3] ?? "public/art/moon-garden/models"
);
const files = ["moon-gate-v1.glb", "reef-kit-v1.glb", "manifest.json"];

await mkdir(publishedDirectory, { recursive: true });
await Promise.all(files.map((file) => copyFile(
  resolve(generatedDirectory, file),
  resolve(publishedDirectory, file)
)));

console.log(
  `Published ${files.length} generated runtime assets to ${publishedDirectory}`
);
