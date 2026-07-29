# ADR-0010: Trail visibility, and a deliberate budget revision

## The trail was invisible, and the taper was the reason

Shipped, tested, on screen, and completely unseeable. The geometry explains it:

- The ribbon extended ~58 world units behind the creature at maximum momentum.
- The chase camera sits only 9-13.5 units behind. **Everything past that is
  literally behind the viewer.**
- Of the ~13 visible units, the head is directly beneath the creature's own
  bloom halo and lost in it.
- The remaining stretch was the *tail*, which the conventional taper reduces to
  zero width and zero alpha.

So the one section actually on screen was the one deliberately faded out. The
standard trail taper is correct for a side-on or free camera and wrong for a
chase camera, where near and far are inverted relative to age.

Fixed by shortening the ribbon to roughly the visible window (26 segments,
~23 units at speed) and flooring both taper curves — width bottoms out at 40%
and alpha at 30% rather than reaching zero.

**Worth noting the tests did not catch this.** `trail.test.ts` asserts the
ribbon widens and brightens with momentum, samples densely enough to look
continuous, and holds enough history to be visible at speed — and every one of
those passed on a ribbon nobody could see. They check the ribbon's own
properties and never relate it to the camera. A "trail length vs camera
distance" assertion would have caught it, and is worth adding.

## Draw call budget: 60 -> 90

Measured 48 on an Adreno 730 with primitives and bloom. The original 60 was set
before bloom existed, and `UnrealBloomPass` alone costs ~14 draws across its mip
chain.

Raising a budget immediately after exceeding it is the exact failure mode Part
4.6 warns about — "budgets that are advisory get ignored". So the reasoning is
recorded in `budgets.json` itself rather than applied quietly: this is a
re-derivation from new information (bloom's real cost), not an accommodation of
an overrun. 90 stays conservative for mobile, and Phase 3 art needs the headroom.

The frame-time budget is untouched, and remains the one that actually matters.

## Still unmeasured

The S22 Ultra reports a flat 60fps / 16.7ms — that is vsync, not headroom. It
tells us the frame fits in 16.7ms and nothing more. Only the Reno3 Pro can say
whether the mid-range floor holds, and it has been intermittently unreachable
over the network. Until it reports, every runtime budget here remains provisional.
