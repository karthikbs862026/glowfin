# ADR-0006: Score as an integral, light as the run-end resource

## Decision 1 — score is accumulated, not a final multiplication

Part 2.3 states `score = distance x multiplier`. Read literally that means total
distance times whatever multiplier is held when the run ends, which would let a
single late lapse erase the whole run and would make the decay curve almost
meaningless mid-run.

Implemented as the integral instead: every step banks
`distanceTravelled x currentMultiplier`. Still distance times multiplier, but
accumulated. This makes "hold a high multiplier through this stretch" the actual
skill expression, which is what Part 2.3's safety-vs-spectacle trade describes.
Flagged rather than assumed, per Part 10.

## Decision 2 — run ends when light is depleted

Part 2.4 asks for a stated run-end condition. Chosen: the creature's light is a
resource, drained by collisions and regenerating during clean play. The run ends
when it reaches zero and the creature goes dark.

Preferred over a hard strike counter because it expresses "N collisions within a
time window" continuously, is diegetic for a bioluminescent creature, and keeps
the cute framing intact while still having real stakes.

**Open conflict (flagged, not resolved):** Part 2.2 says momentum drives creature
glow; light also wants to drive glow. Two systems on one visual channel is a
readability problem. Current proposal is to split them — light drives *body*
glow (dimming = danger), momentum drives *trail, eye hue, and bloom* (speed) —
but Part 3.1 explicitly warns against assuming this kind of thing is legible.
Needs real validation in Phase 2/3, not assertion here.

## Decision 3 — slow-mo is a time scale, never a variable sim step

The near-miss slow-mo beat is applied by scaling wall-clock frame time *before*
it enters the fixed-timestep accumulator. The simulation itself always steps at
a fixed dt. Slow-mo just means fewer steps are earned per real second, so
determinism and the Part 6.4 guarantees are untouched.

---

# Tuning findings

Tuning was validated by headless playthroughs across four synthetic skill
profiles rather than by assertion (Part 2.3 and Part 6.6 both require this).
Four real problems surfaced, and one of them was in the test harness rather than
the game.

### 1. My first player model was superhuman

The initial synthetic players had mean aim errors of 0.03-0.20 units on a
12-unit lane — 0.3% to 1.6% precision. No thumb is that accurate. All four
"skill levels" cleared everything, which made the game look far too easy and
nearly led to retuning gaps down to near-impossible widths to compensate.

Recalibrated to 0.25 / 0.45 / 0.70 / 1.10 units (2-9% of lane). The original gap
widths then turned out to be roughly right. **The most valuable output of this
exercise was catching a bad measurement before it corrupted the design.**

Also fixed: the first model applied fresh random error every frame, which the
input smoothing averaged away. Real hand error is correlated over time, so it is
now a mean-reverting random walk.

### 2. Difficulty plateaued, so runs never ended

The original curve reached max tier at 2,000 units — about 52 seconds — and then
stayed flat forever. Since momentum also plateaus by design (Part 4.5, to protect
lead time), the game reached a steady state no competent player could lose.

Difficulty now keeps climbing: `maxTier` 5 -> 14, `distancePerTier` 400 -> 300,
and gate spacing tightens toward 0.85x at high tier so decision rate rises as
well as precision demand.

### 3. Near-miss threshold covered 90% of the available room

`nearMissClearanceUnits` was 0.9 against a wiggle room of 2.0-2.6 units, so
almost any clean pass counted and the multiplier capped within seconds.
Now 0.4, with cooldown 0.4s -> 0.8s and gain 0.5 -> 0.7.

### 4. Collisions could never accumulate

Light regen of 6/s meant a full heal in 7.7 seconds, so any two collisions more
than 8 seconds apart were irrelevant. Now 2.2/s (full heal ~17.5s), which makes
a bad patch genuinely dangerous.

### Measured result after tuning

| profile | median run | in 45-90s band | near-miss gap | score/sec |
|---|---|---|---|---|
| expert (greedy) | 45s | 49% | 6.0s | 65.4 |
| good | 61s | 79% | 7.4s | 63.1 |
| average | 52s | 70% | 7.0s | 55.3 |
| weak | 34s | 24% | 6.8s | 45.2 |

Near-miss cadence sits inside Part 2.3's 4-8 second target for every profile.
Score per second orders correctly by skill, and the greedy profile out-earns the
safe one *per second* while dying sooner — which is the safety-vs-spectacle
trade working as specified.

Solvability re-proven after the difficulty changes: 1,212,500 gates across 5,000
seeds, zero unsolvable, worst-case headroom 35.7%.

### 5. And then I made the same mistake again, in the test file

The first integration-test pilot aimed at gap centre with no error term at all.
It never collided, never near-missed, and never ended a run — so five tests
failed confusingly rather than testing anything. Same root cause as finding 1,
one file over. The pilot now carries a deterministic correlated wobble, and the
greedy-vs-cautious assertion compares near-miss *rate* rather than totals, since
a greedy pilot dies sooner and would otherwise lose on volume while winning on
what the test actually cares about.

### What this is not

A synthetic player is a sanity check, not playtesting. These numbers say the
tuning is not obviously broken; they do not say it feels good. Part 6.9 telemetry
and Phase 6 live tuning remain the real validation, and the near-miss cadence in
particular should be re-derived from session data rather than trusted from here.
