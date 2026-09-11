# ADR 0003 — No scheduled refresh; the gameweek boundary is read from the feed

- **Status:** Accepted, 2026-09-03. Written as an ADR 2026-09-11 (STE-89).
- **Deciders:** Stephen
- **Related:** Decision Log #70 (the argument), ADR 0001 (the two feeds), STE-65 (F6 refresh),
  STE-90 (the deadline alert), STE-117 (WATCH)

## Context

A scheduled job was proposed to pull the feeds on a cadence. The app already fetches when it is
opened, both feeds are small and effectively free to pull, and the expensive step — the model call —
is already gated by F6's diff. A job would add a moving part for nothing, and would serve whatever it
happened to catch.

## Decision

**No scheduled job in the MVP.** Feeds are fetched on a gameweek's first open and on an explicit run
or refresh — never on a timer. Refresh is manual and diff-gated (F6).

**The one exception is the deadline alert**, whose purpose is to reach Stephen while the app is
closed. It cannot be pull-on-open, so if it ever ships it brings a scheduled job with it. It is
parked below the MVP cut (STE-90).

**The deadline is read, never predicted.** FPL publishes one record per gameweek with its deadline
and its previous / current / next, finished and checked flags. Every fetch reads them fresh; a moved
deadline is a non-event because it is never cached as a fact.

## Consequences for the build

Two correctness rules, because both leave the app looking as if it works:

1. **Advise on `is_next`, never `is_current`.** The feed marks a gameweek current until the following
   one locks, so while a deadline is unpassed, `is_current` is a gameweek already played.
2. **`data_checked`, not `finished`.** `finished` flips when the last match ends; bonus and corrections
   land later. Last gameweek's points read from `data_checked`.

And two that follow from having no schedule:

- **Nothing refreshes on its own** (F6-AC-15). "Nothing changed while time passed" is a legitimate
  outcome, not a fault.
- **Anything dated by a fetch must be judged against the fetch time.** Data is only as fresh as the
  last open or run. WATCH's "tonight" is the first case: it is hidden once FPL's overnight update has
  passed since the read behind it (STE-117). Any future signal that expires — a press conference, a
  price window — needs the same gate.
