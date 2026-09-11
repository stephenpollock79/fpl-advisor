# ADR 0001 — Data source ownership: FPL owns fixtures, Fantasy Football IQ owns the number

- **Status:** Accepted, 2026-09-03. Written as an ADR 2026-09-11 (STE-89).
- **Deciders:** Stephen
- **Related:** Decision Log #68 (the argument), ADR 0006 (the engine that consumes both), STE-53, STE-98

## Context

The PRD once asked for each of a gameweek's fixtures to carry its own projected points, summed for a
double and zero for a blank. Reading the projection feed's schema settled it the other way: Fantasy
Football IQ publishes **one figure per player per gameweek**, with no fixture identity at all — no
opponent, no venue, no count, no per-match rows. Per-fixture projections are not an undocumented edge
case; they do not exist in any source this project has.

## Decision

**Two feeds, two owners, no overlap.**

- **The official FPL feed owns fixtures:** count (zero, one or two), opponent, venue and difficulty.
- **Fantasy Football IQ owns the projected number:** one figure per player per gameweek, already
  covering however many matches the gameweek holds. It is taken whole — nothing in this build
  multiplies it.

Splitting one figure across a double's two fixtures was rejected: that is a projection model, and
building one is out of scope (`CLAUDE.md`, *Do not*).

## Consequences for the build

These are the four data rules in `CLAUDE.md`, and this ADR is their source:

1. **Fixture count never comes from a projection** — not from its size, not from its presence.
2. **Nothing is summed across fixture entries.** A double's projection is one figure.
3. **On conflict, the fixture count wins.** A player whose club has no fixture projects zero, whatever
   the feed carries. `effectiveProjection` (`apps/server/src/ingest/projections.ts`) applies it;
   both the world loader and the run loader call it with the count from FPL's fixtures.
4. **Log any club with other than one fixture in a gameweek**, because blanks and doubles cannot be
   observed early in a season; the first real one must announce itself. Blank and double handling is
   tested now against fabricated fixtures rather than waited for.

**Attribution is a licence condition.** The feed is free to use on condition of a visible link to
fantasyfootballiq.app (STE-53). It needs no credential (STE-98).

**What is lost:** per-fixture attribution inside a double. No screen displays it.
