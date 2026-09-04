# Design tokens — measured contrast

Derived from `handoff/README.md`, which is the authority for token **values**. This file adds one
thing that document does not carry: **measured** WCAG contrast, each figure taken against a named
surface.

**The palette is fixed as designed.** No replacement tokens are proposed here and none should be
invented from these tables. They exist so that a choice of ink against a surface is an informed one
rather than a guess.

**The rule this file follows, and that any future contrast statement in this project must follow:
name the surface, and confirm that surface is still in the palette.** A ratio with no named surface
is not a measurement. See *Palette drift* below for what happens when that rule is not kept.

The seven opaque surfaces are `#FAF8F3` screen, `#FFFFFF` card, the four warm surfaces `#F7F4EE`,
`#F3F0E9`, `#EDEAE1`, `#EFEBE3`, and `#EBF4EE` alternating table row.

## A. Neutral text tokens

Ink and muted greys carry ordinary text and are used across all seven surfaces, so measuring them
against all seven is the right treatment.

| Token | Role | Lowest | Highest | Against 4.5:1 |
| --- | --- | --- | --- | --- |
| `#23211D` | Ink | 13.36 | 16.07 | clears on all 7 |
| `#3A3630` | Ink | 9.97 | 12.00 | clears on all 7 |
| `#46433D` | Ink | 8.19 | 9.86 | clears on all 7 |
| `#4A453D` | Ink | 7.90 | 9.50 | clears on all 7 |
| `#6A655C` | Muted | 4.81 | 5.79 | clears on all 7 |
| `#7A756B` | Muted | 3.81 | 4.58 | clears on 1 of 7 (white only) |
| `#847F74` | Muted | 3.31 | 3.99 | clears on none |
| `#918C83` | Muted | 2.78 | 3.34 | clears on none |

## B. Signal colours, on the surface each is actually used on

Green, amber and red are **not** used on the plain surfaces. In the bundle they sit on translucent
tints of themselves — `#0E8A4E` on `rgba(16,152,90,.12)`, `#8A6A28` on `rgba(194,130,15,.12)`,
`#D33A4E` on `rgba(224,58,78,.10)` — or inside a dedicated card. Measuring them against the seven
generic surfaces yields a number that never occurs on screen, and in every case it **flatters**
them, because the tint darkens the ground the ink is already close to.

Tint ranges below are the composite of the stated `rgba` over each of the seven surfaces it can
sit on, worst to best.

| Ink | Ground, as used | Ratio | Against 4.5:1 |
| --- | --- | --- | --- |
| `#A32C3C` red text | `#FDF3F4` error card | 6.47 | clears |
| `#0A6E3D` green dark | `rgba(16,152,90,.14)` green tint | 4.55 – 5.39 | clears |
| `#0E8A4E` green text-on-light | `#F7F4EE` warm surface | 4.02 | fails |
| `#0E8A4E` green text-on-light | `rgba(16,152,90,.12)` green tint | 3.22 – 3.83 | fails |
| `#8A6A28` amber text | `rgba(194,130,15,.12)` amber tint | 3.77 – 4.45 | fails |
| `#8A6A28` amber text | `rgba(194,130,15,.14)` amber tint | 3.67 – 4.36 | fails |
| `#D33A4E` red | `rgba(224,58,78,.10)` red tint | 3.42 – 4.07 | fails |
| `#D33A4E` red | `rgba(224,58,78,.14)` red tint | 3.24 – 3.84 | fails |
| `#10985A` green primary | `#FFFFFF` card | 3.71 | fails |
| `#FFFFFF` | `#E03A4E` alert disc | 4.30 | fails |

The last row is the `!` glyph in the error card's disc — 10px at weight 800, so normal-size text by
the WCAG threshold, and the only white-on-colour pairing in the bundle.

`#0E8A4E` is labelled *text-on-light* in the handoff and clears 4.5:1 on **no** surface in the
system, white included (4.41 there, its best case anywhere). Its own green tint takes it to 3.22.

## C. Conviction band figures

The band colours carry mono figures at 11–14px — normal-size text, so 4.5:1 applies. Measured
across the seven surfaces.

| Band | Range | Token | Lowest | Highest | Against 4.5:1 |
| --- | --- | --- | --- | --- | --- |
| Certain | ≥ 90% | `#0A6E3D` | 5.27 | 6.34 | clears on all 7 |
| Strong | 80–90% | `#10985A` | 3.08 | 3.71 | clears on none |
| Lean | 60–80% | `#86BE9F` border | 1.77 | 2.13 | border, answers to 3:1 — fails that too |
| Thin | < 60% | `#7A756B` | 3.81 | 4.58 | clears on 1 of 7 |

One of the four conviction bands renders its figure at a passing ratio. This matters more than a
single token does, because the band is the app's central number and the ramp is deliberately one
hue at four weights — so the fix cannot come from hue and has to come from weight.

## What clears 4.5:1 everywhere

**Seven tokens clear 4.5:1 against all seven surfaces:** the four inks `#23211D`, `#3A3630`,
`#46433D`, `#4A453D`; the muted `#6A655C`; and two signal colours, `#0A6E3D` and `#A32C3C`.

The two signal colours come with a caveat the inks do not. Both are safe on the grounds they are
actually used on — `#0A6E3D` at 4.55 worst-case on its own green tint, `#A32C3C` at 6.47 on the
error card — but they are signal colours, and reaching for one as a general-purpose ink borrows a
meaning along with the contrast. For neutral text below the large-text threshold, `#6A655C` and the
inks are the unconditional choices.

`#A32C3C` in particular is the designed accessible red and is easy to miss, because the three red
tokens that fail (`#E03A4E`, `#D33A4E`, and white on `#E03A4E`) are the conspicuous ones.

## Palette drift — the Accessibility NFR measures material that has moved

The Accessibility NFR names three measured failures: `#847F74` on `#EDE8DE` at 3.26:1, `#8A857B` on
white at 3.67:1, and `#10985A` on `#EDE8DE` at 3.04:1. **All three recompute exactly**, so the
method was sound. But the inputs are gone:

- **`#EDE8DE` is not a surface in this handoff.** The nearest current surface is `#EDEAE1`.
- **`#8A857B` is not a token in this handoff at all.** There is no current equivalent; the nearest
  muted token is `#847F74`.

Re-measured against the current palette the verdicts hold and barely move — `#847F74` goes 3.26 →
3.31 on `#EDEAE1`, `#10985A` goes 3.04 → 3.08, both still failing. So nothing about the NFR's
conclusion is wrong. What is wrong is that anyone acting on it will search this bundle for
`#8A857B`, not find it, and have no way to tell whether the token was renamed, removed, or never
existed.

This is the case for the rule at the top of this file. **STE-79 now carries this as well as the
threshold conflict.**

## What these tables are not

**Not a compliance verdict.** The threshold depends on usage: 4.5:1 applies to normal-size text,
3:1 to large text and to non-text UI components. An amber or red used as a chip border or fill
answers to 3:1, so a low number here is not automatically a defect. Table B measures each colour as
ink because that is how the bundle uses it; the same hex as a border is a different question.

**Not a substitute for looking.** The Build Plan puts visual criteria under *human checklist* for a
reason — a ratio says nothing about whether a pill reads as green or whether a figure is findable.

## Related

- `handoff/README.md` — token values, type scale, radii, shadows, spacing. The authority.
- The Accessibility NFR states a 4.5:1 requirement for all small text. Where that requirement and
  these tables disagree, the disagreement is recorded in Linear as **STE-79** and is not resolved
  here.
