import { FIXED_DT_SEC } from "../core/timestep";
import type { MoonflashClipV1 } from "./clips";

export const MOONFLASH_MEDIA_DURATION_SEC = 6;

export interface MoonflashMediaPlan {
  durationSec: typeof MOONFLASH_MEDIA_DURATION_SEC;
  momentFraction: number;
  score: number;
  multiplier: number;
  caption: string;
  seed: number;
}

function hashText(value: string): number {
  let hash = 0x811c9dc5;
  for (let index = 0; index < value.length; index++) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash >>> 0;
}

export function moonflashMediaPlan(clip: MoonflashClipV1): MoonflashMediaPlan {
  const totalSteps = Math.max(1, clip.endStep - clip.startStep);
  return {
    durationSec: MOONFLASH_MEDIA_DURATION_SEC,
    momentFraction: Math.max(0.08, Math.min(0.92, (clip.momentStep - clip.startStep) / totalSteps)),
    score: Math.max(0, Math.floor(clip.replay.summary.score)),
    multiplier: Math.max(1, clip.moment.multiplier),
    caption: clip.caption.slice(0, 96),
    seed: hashText(`${clip.checksum}:${clip.replay.seed}:${clip.momentStep}:${FIXED_DT_SEC}`)
  };
}

function random(seed: number, index: number): number {
  let value = (seed + Math.imul(index + 1, 0x9e3779b1)) >>> 0;
  value ^= value >>> 16;
  value = Math.imul(value, 0x7feb352d) >>> 0;
  value ^= value >>> 15;
  return (value >>> 0) / 0x1_0000_0000;
}

function drawFrame(
  context: CanvasRenderingContext2D,
  plan: MoonflashMediaPlan,
  progress: number
): void {
  const width = context.canvas.width;
  const height = context.canvas.height;
  const gradient = context.createLinearGradient(0, 0, 0, height);
  gradient.addColorStop(0, "#03071a");
  gradient.addColorStop(0.52, "#062d51");
  gradient.addColorStop(1, "#071527");
  context.fillStyle = gradient;
  context.fillRect(0, 0, width, height);

  const pulse = Math.max(0, 1 - Math.abs(progress - plan.momentFraction) * 7.5);
  context.globalCompositeOperation = "screen";
  for (let index = 0; index < 32; index++) {
    const x = random(plan.seed, index) * width;
    const y = (random(plan.seed, index + 37) * height + progress * (80 + index * 3)) % height;
    const radius = 1 + random(plan.seed, index + 73) * 2.8;
    context.fillStyle = index % 3 === 0 ? "rgba(177,111,255,.48)" : "rgba(93,231,255,.42)";
    context.beginPath();
    context.arc(x, y, radius, 0, Math.PI * 2);
    context.fill();
  }

  const gateScale = 0.38 + progress * 1.15;
  const opening = width * (0.29 - progress * 0.035);
  const gateY = height * (0.28 + progress * 0.24);
  context.lineCap = "round";
  context.shadowBlur = 20 + pulse * 28;
  context.shadowColor = pulse > 0.1 ? "#ff74e8" : "#67eaff";
  context.strokeStyle = pulse > 0.1 ? "#ff79e8" : "#75efff";
  context.lineWidth = 8 * gateScale;
  context.beginPath();
  context.moveTo(width / 2 - opening * gateScale, gateY - height * 0.2 * gateScale);
  context.lineTo(width / 2 - opening * gateScale, gateY + height * 0.22 * gateScale);
  context.moveTo(width / 2 + opening * gateScale, gateY - height * 0.2 * gateScale);
  context.lineTo(width / 2 + opening * gateScale, gateY + height * 0.22 * gateScale);
  context.stroke();

  const swim = Math.sin(progress * Math.PI * 8) * width * 0.025;
  const dodge = Math.sin(Math.min(1, progress / Math.max(0.1, plan.momentFraction)) * Math.PI) * width * 0.16;
  const glowfinX = width / 2 + swim + dodge * (progress < plan.momentFraction ? 1 : -0.28);
  const glowfinY = height * 0.71;
  context.shadowBlur = 30 + pulse * 34;
  context.shadowColor = "#5feaff";
  context.fillStyle = "#38c9ed";
  context.beginPath();
  context.ellipse(glowfinX, glowfinY, width * 0.075, height * 0.044, 0, 0, Math.PI * 2);
  context.fill();
  context.fillStyle = "#7ddff5";
  context.beginPath();
  context.moveTo(glowfinX - width * 0.05, glowfinY + 4);
  context.lineTo(glowfinX - width * 0.17, glowfinY + height * 0.055);
  context.lineTo(glowfinX - width * 0.045, glowfinY + height * 0.02);
  context.moveTo(glowfinX + width * 0.05, glowfinY + 4);
  context.lineTo(glowfinX + width * 0.17, glowfinY + height * 0.055);
  context.lineTo(glowfinX + width * 0.045, glowfinY + height * 0.02);
  context.fill();
  context.strokeStyle = "#ba79ff";
  context.lineWidth = 4;
  for (const side of [-1, 1]) {
    for (let leaf = 0; leaf < 3; leaf++) {
      context.beginPath();
      context.moveTo(glowfinX + side * width * 0.06, glowfinY - 3 + leaf * 5);
      context.lineTo(glowfinX + side * width * (0.095 + leaf * 0.008), glowfinY - 10 + leaf * 5);
      context.stroke();
    }
  }

  context.globalCompositeOperation = "source-over";
  context.shadowBlur = 0;
  context.fillStyle = "rgba(3, 10, 27, .72)";
  context.fillRect(0, 0, width, 92);
  context.fillStyle = "#9bf4ff";
  context.font = "700 18px system-ui, sans-serif";
  context.fillText("GLOWFIN · MOONFLASH", 20, 31);
  context.fillStyle = "#ffffff";
  context.font = "800 28px system-ui, sans-serif";
  context.fillText(`×${plan.multiplier.toFixed(1)} · ${plan.score.toLocaleString()}`, 20, 68);
  context.fillStyle = "rgba(3, 10, 27, .78)";
  context.fillRect(0, height - 70, width, 70);
  context.fillStyle = "#ffe8a5";
  context.font = "800 20px system-ui, sans-serif";
  context.textAlign = "center";
  context.fillText(progress < 0.82 ? "THREAD THE CURRENT" : "BEAT MY CURRENT", width / 2, height - 29);
  context.textAlign = "start";
}

function supportedMimeType(): string | null {
  if (typeof MediaRecorder === "undefined") return null;
  return [
    "video/webm;codecs=vp9",
    "video/webm;codecs=vp8",
    "video/webm",
    "video/mp4"
  ].find((type) => MediaRecorder.isTypeSupported(type)) ?? null;
}

/**
 * Produce one bounded, deterministic six-second share file. Unsupported or
 * constrained browsers return null and the verified challenge link remains
 * the fallback; recording can never block a run result or reward.
 */
export async function renderMoonflashMedia(clip: MoonflashClipV1): Promise<File | null> {
  const mimeType = supportedMimeType();
  if (!mimeType || typeof document === "undefined") return null;
  const canvas = document.createElement("canvas");
  canvas.width = 360;
  canvas.height = 640;
  const context = canvas.getContext("2d", { alpha: false });
  const capture = canvas.captureStream?.bind(canvas);
  if (!context || !capture) return null;
  const plan = moonflashMediaPlan(clip);
  const stream = capture(24);
  const chunks: Blob[] = [];
  let recorder: MediaRecorder;
  try {
    recorder = new MediaRecorder(stream, { mimeType, videoBitsPerSecond: 720_000 });
  } catch {
    stream.getTracks().forEach((track) => track.stop());
    return null;
  }

  const completed = new Promise<Blob>((resolve) => {
    recorder.addEventListener("dataavailable", (event) => {
      if (event.data.size > 0) chunks.push(event.data);
    });
    recorder.addEventListener("stop", () => resolve(new Blob(chunks, { type: mimeType })), { once: true });
  });
  const startedAt = performance.now();
  drawFrame(context, plan, 0);
  recorder.start(500);
  await new Promise<void>((resolve) => {
    const render = (now: number) => {
      const progress = Math.min(1, (now - startedAt) / (plan.durationSec * 1000));
      drawFrame(context, plan, progress);
      if (progress >= 1) resolve();
      else requestAnimationFrame(render);
    };
    requestAnimationFrame(render);
  });
  recorder.stop();
  const blob = await completed;
  stream.getTracks().forEach((track) => track.stop());
  if (blob.size < 1) return null;
  const extension = mimeType.includes("mp4") ? "mp4" : "webm";
  return new File([blob], `glowfin-moonflash.${extension}`, { type: mimeType });
}
