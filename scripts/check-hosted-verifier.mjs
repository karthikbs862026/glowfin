import { stat } from "node:fs/promises";

const artifact = new URL("../build/hosted/glowfin-verifier.js", import.meta.url);
const info = await stat(artifact);
const MAX_HOSTED_VERIFIER_BYTES = 144 * 1024;
if (info.size < 10_000 || info.size > MAX_HOSTED_VERIFIER_BYTES) {
  throw new Error(`Hosted verifier bundle is outside its 10-144KB budget (${info.size} bytes).`);
}
const authority = await import(`${artifact.href}?check=${Date.now()}`);
if (authority.LEADERBOARD_VALIDATION_VERSION !== "v38-signature-v2") {
  throw new Error("Hosted verifier exported an unexpected validation version.");
}
if (typeof authority.verifyLeaderboardSubmission !== "function") {
  throw new Error("Hosted verifier omits leaderboard authority.");
}
if (typeof authority.verifyMoonflashClip !== "function") {
  throw new Error("Hosted verifier omits Moonflash authority.");
}
const invalid = authority.verifyLeaderboardSubmission(null);
if (invalid?.valid !== false || invalid?.reason !== "invalid-submission") {
  throw new Error("Hosted verifier invalid-submission self-check failed.");
}
console.log(`Hosted authority valid: ${authority.LEADERBOARD_VALIDATION_VERSION}, ${info.size} bytes.`);
