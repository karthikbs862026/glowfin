from pathlib import Path

runtime = Path("src/engagement/version41Micro.ts")
text = runtime.read_text(encoding="utf-8")
old = '''    this.expeditionElapsed += Math.max(0, Math.min(frame, .1)) * qaScale();
    const elapsed = this.expeditionElapsed;
    const segment = segmentAt(elapsed);
'''
new = '''    const previousElapsed = this.expeditionElapsed;
    // Advance from active render time rather than rendered-frame count. The core
    // lifecycle resets frame delta after backgrounding/context recovery, so a
    // slow but active device must not turn this three-minute Expedition into a
    // much longer session. A bounded 1.25-second step still rejects extreme
    // debugger/OS stalls while allowing the 30 fps floor and software-rendered
    // CI to measure real elapsed play time correctly.
    this.expeditionElapsed += Math.max(0, Math.min(frame, 1.25)) * qaScale();
    const elapsed = this.expeditionElapsed;
    for (const crossed of S) {
      if (crossed.startSec > previousElapsed && crossed.startSec <= elapsed) {
        showSegment(crossed.kind, Math.min(crossed.startSec, C.durationSec));
      }
    }
    const segment = segmentAt(elapsed);
'''
if text.count(old) != 1:
    raise SystemExit(f"Expected one active-clock block, found {text.count(old)}")
text = text.replace(old, new, 1)
runtime.write_text(text, encoding="utf-8")

for name in [
    ".github/workflows/version41-clock-fix.yml",
    "scripts/fix-v41-active-clock.py",
]:
    path = Path(name)
    if path.exists():
        path.unlink()

print("Version 41 active-clock correction applied.")
