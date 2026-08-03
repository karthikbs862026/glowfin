import { rm } from "node:fs/promises";

// dist is ignored, deterministic build output. Removing it before Vite runs is
// required because a stale hashed bundle can otherwise survive an incremental
// filesystem quirk, inflate the package and make rollback/cache evidence lie.
await rm(new URL("../dist/", import.meta.url), {
  recursive: true,
  force: true
});

console.log("Removed stale production output.");
