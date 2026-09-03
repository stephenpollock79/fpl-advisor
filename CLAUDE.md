<!-- Staged copy. Drop in at the repo root as CLAUDE.md (STE-28).
     Sections marked TBD are filled by the architecture spec, STE-24. -->

# The Gaffer — FPL Advisor

A personal, mobile-only decision-support app for Fantasy Premier League. Before each weekly deadline it
issues a short list of **calls** — transfers, substitutions, captain and vice — each with a conviction
percentage, the projected points it gains or costs, and the reasoning behind it.

**It is advice only.** The manager makes every move himself in the FPL app. This app never writes to FPL,
never asks for FPL credentials, and never stores them.

Single user. Invite-only. Portrait phone at 390×844 — no desktop layout, no tablet layout.

## Where truth lives

| Question | Answer |
| --- | --- |
| What are we building and why? | The PRD, in Stephen's vault. Not in this repo — deliberately. |
| What must this slice do? | `docs/criteria/F<n>.criteria.md` |
| How is it built? | `docs/specs/` and `docs/adr/` |
| Why was it decided that way? | The Decision Log, in the vault, cited by number (#68) |
| What is the state of the work? | Linear, project *FPL Advisor — v1*. Not this file, not the vault. |

**Load per slice, not per session.** Read the one criteria file for the slice you are on. For F3 and F4 also
read `ENGINE.criteria.md`. `NFR.criteria.md` applies to everything. Do not go looking for the PRD — the
criteria files are extracted from it verbatim and are the same words, 500–2,000 of them instead of 22,000.

**`docs/criteria/` is derived. Never edit those files.** They are regenerated from the PRD by a script in the
vault. If a criterion looks wrong, say so — do not fix it here, because the fix will be overwritten.

## The domain, in the terms this codebase uses

- **Gameweek** — one round of fixtures. A club plays once, twice (a *double*), or not at all (a *blank*).
- **Call** — one recommended change: a transfer, a substitution, or a captaincy assignment.
- **Conviction** — a percentage stating how strong a call is. **Not** a probability that it is right, and it
  must never be labelled as one — there is no calibration and no backtest.
- **Net** — the projected-points difference between the two sides of a call.
- **Balance** — the manager's bank. **NBal** — Balance minus the cost of the calls currently in scope.
- **Effective points** — availability multiplier × rotation multiplier × the feed's projection.
- **Chip** — a one-use special move. Four of them. The engine does not govern chip features.

## Data rules — get these wrong and the app looks like it works

Two feeds, and they own different things:

- **The official FPL feed owns fixtures.** Count (zero, one or two), opponent, venue, difficulty.
- **Fantasy Football IQ owns the projected number.** One figure per player per gameweek, which already
  covers however many matches that gameweek holds.

From that, four rules:

1. **Fixture count never comes from a projection.** Not from its size, not from its presence. Only from the
   FPL feed's fixture data.
2. **Nothing is summed across fixture entries.** A double gameweek's projection is one figure covering both
   matches. Per-fixture attribution does not exist in any source we have, and splitting one figure across two
   fixtures would be a projection model — explicitly out of scope.
3. **On conflict, the fixture count wins.** A player whose club has no fixture projects zero, whatever the
   feed carries.
4. **Log it when a club has other than one fixture in a gameweek.** Blanks and doubles cannot be observed
   live early in a season, so the first real one must announce itself rather than pass silently.

And two gameweek rules that are pure foot-guns:

- **Advise on `is_next`, not `is_current`.** The feed marks a gameweek *current* until the following one
  locks — so while a deadline is unpassed, `is_current` is a gameweek already played. Keying off it produces
  confident advice about the wrong week, every week, with nothing visibly broken.
- **`data_checked`, not `finished`.** `finished` flips when the last match ends; bonus points and
  corrections land afterwards. Last gameweek's points read from `data_checked`.

**Attribution is a licence condition**, not a nicety: a visible link to fantasyfootballiq.app must ship.

## Architecture invariants

**The model judges; code calculates.** The model proposes candidate calls and returns structured judgement
inputs with quoted evidence; **code** computes the edge and the conviction figure; the model writes the
reasoning; **code** assigns the band and decides what is shown. The model never emits a conviction
percentage. This does not make the output deterministic — the model supplies the inputs — and no code
comment or user-facing string should claim it does.

**One engine, two consumers.** One function produces net, conviction and band, and both F3 and F4 call it.
It is headless and unit-tested before any UI exists. Never compute conviction, net or a band inside a
component. If a feature needs a variation, it is a parameter to the engine, not a second implementation.

**Data fetching lives behind a thin module, never in a component.** No component calls `fetch`, and none
holds a feed or database client. This is the entire mitigation for the one-way door in ADR 0005: the app is
client-rendered, moving off client rendering would otherwise be a rewrite of every data path, and this layer
is the one place that rewrite would have to happen. It works with the engine invariant above rather than
beside it — the engine takes values and never fetches them — so between the two, no framework assumption
reaches the code that computes.

**Row-level security from the first migration.** Every table carrying user data gets a policy in the
migration that creates it. No table ships without one, and this is asserted by a test rather than trusted.

**Reasoning is constrained by construction.** The reasoning call receives only the values shown on that
card. Do not widen its input to improve the prose.

## Conventions

- Branch, PR, merge. No commits straight to main. `git-guardrails` hooks are installed — do not work around
  them. The hook lives globally at `~/.claude`, not in this repo, so it is not visible in a checkout:
  plain `git push` is deliberately left unblocked, because Railway deploys on merge and the workflow
  depends on pushing; `--force`, `reset --hard`, `clean`, `branch -D` and `checkout .` / `restore .` are
  blocked. The push allowance is a decision, not a misconfiguration — do not "tighten" it.
- Migrations are additive and checked in. Schema changes never happen through the Supabase console.
- Secrets come from the environment. Never a literal key, never a committed `.env`.
- Tests: unit for engine arithmetic and data rules, integration for RLS, rate limits and ingestion, Playwright
  for flows. Anything visual or tactile is a human checklist — write the checklist, do not fake it with a
  class-name assertion.
- **Skills from `mattpocock/skills`, and only those.** This bullet is not an inventory of what is on disk
  — other skills are installed from elsewhere, they are governed by nothing here, and their absence below
  says nothing about them. **Adopted and live:** `grill-with-docs`, `grilling`, `domain-modeling`, `tdd`,
  `code-review`, `implement`, `writing-for-agents`, `resolving-merge-conflicts`,
  `git-guardrails-claude-code`. **Installed as source material only — do NOT invoke:** `to-spec`,
  `to-tickets`. Both publish to a tracker layout this project does not use; Linear is the tracker and specs
  live in `docs/specs/`. Adapted versions are being written in Stephen's vault (STE-26). If a task seems to
  call for either, say so and stop rather than running them.
- Cost: the model call is the expensive step. Cache what is stable within a gameweek, and never put raw
  `bootstrap-static` into a prompt.

## Stack

- **Runtime:** Railway. **Database and auth:** Supabase. **Source and CI:** GitHub. **Analytics:** PostHog.
- Framework, rendering approach and data model: **TBD — STE-24.** Fill this in when the architecture spec
  lands, and delete this line.

## Do not

- Do not read or write anything on the manager's FPL account. Public endpoints only, by team ID.
- Do not build a projection model, a price-prediction model, or fitted weights. Projections are bought in.
- Do not manufacture advice to fill a screen. "Nothing worth changing" is a legitimate, designed answer.
- Do not add a scheduled job. Feeds are fetched on open; refresh is manual and diff-gated.
- Do not treat the design prototype export as a specification. It is a mid-design snapshot and is known
  stale on at least three points.
