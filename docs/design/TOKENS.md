# Design tokens — measured contrast

Derived from `handoff/README.md`, which is the authority for token **values**. This file adds one
thing that document does not carry: **measured** WCAG contrast for every text token against every
surface in the same handoff.

**The palette is fixed as designed.** No replacement tokens are proposed here and none should be
invented from this table. It exists so that a choice of ink against a surface is an informed one
rather than a guess.

## Every text token, against every surface

Ratios are WCAG 2.x, computed over the seven surfaces in the handoff: `#FAF8F3` screen, `#FFFFFF`
card, the four warm surfaces, and `#EBF4EE` alternating table row.

| Token | Role | Lowest | Highest | Against 4.5:1 |
| --- | --- | --- | --- | --- |
| `#6A655C` | Muted | 4.81 | 5.79 | clears 4.5:1 everywhere |
| `#7A756B` | Muted | 3.81 | 4.58 | below 4.5:1 on 6 of 7 surfaces |
| `#847F74` | Muted | 3.31 | 3.99 | below 4.5:1 on 7 of 7 surfaces |
| `#918C83` | Muted | 2.78 | 3.34 | below 4.5:1 on 7 of 7 surfaces |
| `#10985A` | Green | 3.08 | 3.71 | below 4.5:1 on 7 of 7 surfaces |
| `#0E8A4E` | Green text-on-light | 3.66 | 4.41 | below 4.5:1 on 7 of 7 surfaces |
| `#0A6E3D` | Green dark | 5.27 | 6.34 | clears 4.5:1 everywhere |
| `#C2820F` | Amber | 2.69 | 3.23 | below 4.5:1 on 7 of 7 surfaces |
| `#B4791A` | Amber | 3.07 | 3.69 | below 4.5:1 on 7 of 7 surfaces |
| `#E03A4E` | Red | 3.57 | 4.30 | below 4.5:1 on 7 of 7 surfaces |
| `#D33A4E` | Red | 3.89 | 4.68 | below 4.5:1 on 6 of 7 surfaces |

**Two tokens clear 4.5:1 on every surface: `#6A655C` and `#0A6E3D`.** Where small text must meet
that bar, those are the two that do it unconditionally.

`#0E8A4E` is labelled *text-on-light* in the handoff and does not reach 4.5:1 on any surface in the
system, white included. That is worth knowing before using it for small text specifically.

## What this table is not

**Not a compliance verdict.** Usage is inferred from token names, and the threshold depends on
usage: 4.5:1 applies to normal-size text, 3:1 to large text and to non-text UI components. An amber
or red used as a chip border or fill answers to 3:1, so a low number in this table is not
automatically a defect.

**Not a substitute for looking.** The Build Plan puts visual criteria under *human checklist* for a
reason — a ratio says nothing about whether a pill reads as green or whether a figure is findable.

## Related

- `handoff/README.md` — token values, type scale, radii, shadows, spacing. The authority.
- The Accessibility NFR states a 4.5:1 requirement for all small text. Where that requirement and
  this table disagree, the disagreement is recorded in Linear as **STE-79** and is not resolved
  here.
