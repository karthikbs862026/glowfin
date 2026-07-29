# ADR-0005: Solvable-by-construction generation, independently proven

**Context:** Part 2.5 requires every generated segment be *provably* passable at
the momentum at which it appears, and calls an unsolvable segment the most
direct Core Design Principle violation possible.

## Decision

Two independent mechanisms, deliberately not one:

1. **Solvable by construction.** When placing a gate, the generator computes the
   lateral travel budget available from the previous gate at the momentum the
   player will actually have there, then clamps the gate's centre into the
   reachable window. Rejected the alternative of generate-then-retry: retry
   loops make generation time seed-dependent and can in principle not terminate.

2. **Independently proven.** `checkSolvability` re-derives passability from the
   finished gate list without trusting the generator, and is run over a seed
   sweep in CI. "The generator is careful" and "no unsolvable segment exists"
   are different claims; only the second one is the requirement.

## Why this is a proof rather than an estimate

The check is closed-form. For each consecutive gate pair it computes worst-case
required lateral travel — the distance from the least favourable position the
player could occupy in the previous gap to the nearest valid position in the
next — and compares it against travel available at that momentum. No simulation,
no sampling, no pass rate. This is only possible because ADR-0002 chose a
deterministic movement model; with a physics solver the same claim would have
had to be statistical.

The clean-run momentum is used because it is the worst case: collisions slow the
player down, which *increases* the time available to cross.

## Measured result

5,000 seeds x 8,000 units = 1,212,390 gates. Zero unsolvable. Tightest
transition anywhere in that set demanded 64.3% of physically achievable lateral
travel, leaving 35.7% headroom.

## Consequences

- Adding a chunk template to `config/chunks.json` needs no code change, but the
  sweep must be re-run — a template can be authored to be unreachable and the
  clamp will silently flatten it toward the previous gate's centre, which is
  safe but not what the designer intended. The sweep catches the former; the
  latter needs eyes on the generated output.
- `worstRawMarginFraction` is reported against raw physical capability, not
  against the generation budget. Margin against the budget reads 0% whenever the
  generator uses its full allowance, which sounds alarming while being fine.
