import { describe, expect, it } from "vitest";
import html from "../index.html?raw";
import chapterOne from "../src/expedition/chapterOne.ts?raw";
import expeditionDirector from "../src/expedition/expeditionDirector.ts?raw";
import main from "../src/main.ts?raw";

describe("Version 41-R1 integration seam", () => {
  it("ships a same-document mission card and briefing", () => {
    expect(html).toContain('id="expedition-mission-card"');
    expect(html).toContain('id="expedition-briefing"');
    expect(html).toContain('id="expedition-begin"');
    expect(html).toContain("The Missing Moonseed");
    expect(html).toContain("Objective · Follow the Light");
  });

  it("enters the certified renderer through an explicit synchronous seam", () => {
    expect(main).toContain("function startExpedition(): void");
    expect(main).toContain("seedOverride: CHAPTER_ONE_MISSION.seed");
    expect(main).toContain('experience: "chapter-one-r1"');
    expect(main).toContain("const SERVICE_WORKER_CACHING_CERTIFIED = false");
  });

  it("contains no sidecar injection, synthetic clicks, or polling", () => {
    const expedition = [chapterOne, expeditionDirector].join("\n");
    expect(expedition).not.toMatch(/import\s*\(/);
    expect(expedition).not.toMatch(/\.click\s*\(/);
    expect(expedition).not.toMatch(/setInterval\s*\(/);
    expect(expedition).not.toMatch(/prototype/);
  });
});
