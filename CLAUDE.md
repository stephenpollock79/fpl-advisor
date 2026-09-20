# The Gaffer — FPL Advisor

A personal, mobile-only decision-support app for Fantasy Premier League. Before each weekly deadline it
issues a short list of **calls** — transfers, substitutions, captain and vice — each with a conviction
percentage, the projected points it gains or costs, and the reasoning behind it.

**It is advice only.** The manager makes every move himself in the FPL app. This app never writes to FPL,
never asks for FPL credentials, and never stores them.

Single user. Invite-only. Portrait phone at 390×844 — no desktop layout, no tablet layout.

## How we work — two files, no overlap

**The general contract loads into every session automatically, through imports in
`~/.claude/CLAUDE.md`** — that file is three import lines and holds no rules of its own. The
contract holds who is reading you, the five reply types and the type-naming line, verification,
scope, the ask gates, and the repo boundary. Its rules are numbered `G0…`.

It is authored at `03 Resources/Context/Contract.md` in Stephen's vault. That path is where a
human goes to edit it, not somewhere you can open — the contract reaches you as loaded context,
and `/memory` is how you confirm it arrived.

**`docs/working-rules.md` holds only what is true of this project** — the Build Plan / Linear
split, the derived files and their extractors, this project's silent-failure list, the Cowork
handoff, the slice review, and the `G14` list for this project. Its rules are numbered `P1…`.
**Read it at the start of every session.** It is short.

Every rule lives in exactly one of those two files. Nothing is restated here, deliberately: a
third copy is how the contract drifts. If a rule is not in this repo, it is a `G` rule.

## Where truth lives

| Question | Answer |
| --- | --- |
| What are we building and why? | The PRD, in Stephen's vault. Not in this repo — deliberately. |
| What must this slice do? | `docs/criteria/F<n>.criteria.md` |
| How is it built? | `docs/specs/architecture.md` and `docs/adr/` |
| Why was it decided that way? | The Decision Log, in the vault, cited by number (#68). **Human-facing only** — see the citation rule below. |
| What do I build next, and when? | `docs/build-plan.md` — derived from the vault. Order and dates only. |
| What is the state of the work? | Linear, project *FPL Advisor — v1*. Not this file, not the vault. |

**Cite what an agent can open.** Anything an agent must act on is cited repo-side — an ADR, a
criteria file, a spec. The vault is cited only for reasoning a human goes looking for, because an
agent in a checkout or a worktree cannot open it. A vault-only citation on something actionable is
an instruction that cannot be followed.

Two consequences, because the rule is not only about the vault. **A repo-side citation must
resolve** — pointing at an ADR that has not been written is the same failure wearing the right
clothes, and it is the more dangerous one, because the pointer looks checkable. And **the Decision
Log is never where an agent goes for what to do.** If an ADR's decision or its consequences for the
build are only in the Decision Log, the ADR is incomplete; cite the log for the argument, never for
the instruction.

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
- **Effective points** — the feed's projection, taken whole. **Nothing this build multiplies it by.**
  The feed already prices availability and expected starting, so a second adjustment would be a discount
  on a discount — and could only be applied correctly by reverse-engineering theirs. Players FPL reports
  unavailable are excluded before scoring, never scaled.
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
- **`data_checked`, not `finished` — dormant, and deliberately still written down.** `finished`
  flips when the last match ends; bonus points and corrections land afterwards, so a settled
  points total reads from `data_checked`. **Nothing in the code reads it today** (STE-175,
  2026-09-20): the only consumer computed last gameweek's points, which no screen ever showed,
  and it was removed rather than left looking like a guarantee. The column is still ingested and
  the migration still carries the rule. **It becomes load-bearing again the moment anything
  displays a settled points figure** — which is the one circumstance this rule is about, and the
  reason it is stated here rather than deleted. Do not read it as a live safeguard: there is
  nothing to test until something reads it.

**Attribution is a licence condition**, not a nicety: a visible link to fantasyfootballiq.app must ship.

## Architecture invariants

**The model proposes and explains; code computes every figure shown.** The model proposes candidate calls
and writes the reasoning. **Code** computes the edge, the conviction figure and the band from published data
alone — the feed's projections, the fixture list and the squad. The model emits no conviction percentage and
no rating that enters the arithmetic.

**So the figure is reproducible by hand**: the same published inputs give the same number every run, and a
figure that moves without an input moving is a defect rather than a judgement that changed. **This reverses
what this file said until 2026-09-10**, when the engine still had four judgement inputs and the output was
explicitly not deterministic — older material will read the other way, and STE-60 carries why it changed.
What stays model-owned is which candidates to propose and how a call is explained; neither produces a number.

**One engine, two consumers.** One function produces net, conviction and band, and both F3 and F4 call it.
It is headless and unit-tested before any UI exists. Never compute conviction, net or a band inside a
component. If a feature needs a variation, it is a parameter to the engine, not a second implementation.

**The engine is a package, not a folder.** `packages/engine` declares no `dependencies`,
`devDependencies` or `peerDependencies`, and compiles with `"lib": ["ES2022"]` and `"types": []`. So
`window`, `document`, `process` and `fs` are compile errors inside it, and an undeclared import is
unresolvable under pnpm rather than quietly hoisted. Both apps import it from source. **Do not add a
dependency to it, widen its `lib`, or give it `types`** — those three edits are the only way through the
boundary, and each one silently converts a mechanism back into a convention. Asserted in
`tests/engine-package-boundary.test.ts`; reasoning in ADR 0006.

**Data fetching lives behind a thin module, never in a component.** No component calls `fetch`, and none
holds a feed or database client. This is the entire mitigation for the one-way door in ADR 0005: the app is
client-rendered, moving off client rendering would otherwise be a rewrite of every data path, and this layer
is the one place that rewrite would have to happen. It works with the engine invariant above rather than
beside it — the engine takes values and never fetches them — so between the two, no framework assumption
reaches the code that computes.

**Row-level security from the first migration.** Every table carrying user data gets a policy in the
migration that creates it. No table ships without one, and this is asserted by a test rather than trusted.
**And the server reads user data with the signed-in user's token, never the service key** — the service key
bypasses row-level security entirely, so a server that uses it for user data passes every test asserting the
policies exist while providing none of the isolation they are for. Reference tables — fixtures, projections,
the feed cache — are the service key's only business. ADR 0007.

**Reasoning is constrained by construction.** The reasoning call receives only the values shown on that
card. Do not widen its input to improve the prose.

**A model given a fact without its reason will invent one** — on 15–16 September that was an injury, about
a fit player it recommended for the captaincy two clauses later. So anything it is asked to explain arrives
**with why it is there**, or it is told to describe and stop. It has no fitness, availability, news or
minutes data: say so, name the words it may therefore never use, and **check the text that comes back** —
an instruction is a convention, and `reasoning.ts` and `editorial.ts` each refuse a line that reaches past
what was given and fall back to a templated one. **Where a comparison misleads, the sentence is code's**: a
keep, a forced call and a must-change call are written here and never asked for, keyed to the obligation
rather than to a flag. **And every template, default and fallback obeys the rule it stands in for** — the
editorial's stand-in wrote the count the prompt had been forbidden, for six hours, because the fix looked
only at the prompt. ADR 0012.

## Conventions

- Branch, PR, merge. **No commits straight to main, and that one is not on trust:** `main` carries a
  GitHub ruleset requiring a pull request, passing CI, no force-push and no deletion. A direct commit is
  refused at the push, whatever it touches — **so there is no derived-files exception and none should be
  written.** A rule permitting what the platform refuses is a rule nobody can follow (STE-80).
- `git-guardrails` hooks are installed. The hook lives globally at `~/.claude`, not in this repo, so it
  is not visible in a checkout: plain `git push` is deliberately left unblocked — it prompts, rather than
  being refused — because Railway deploys on merge and the workflow depends on pushing; `--force`,
  `reset --hard`, `clean`, force-deleting a branch and discarding the working tree are blocked. The push
  allowance is a decision, not a misconfiguration — do not "tighten" it into a block, and do not loosen
  it into an `allow` rule either.
- **A guardrail block is a stop, not a detour** (ruled 2026-09-16, STE-80). If the hook refuses a
  command, **reaching the same end state with a different tool is working around it.** Closing a pull
  request with its branch through `gh` destroys exactly what force-deleting that branch destroys, and
  the hook not seeing it changes nothing about what it does. Do not reach for the other tool, and do not
  treat a stated reason as a licence — a reason can be written for anything.

  **Say what happened instead, and ask.** Name what was refused, what it would have destroyed, and
  whether that thing exists anywhere else: *"this loses three commits that are on no other branch; they
  look like last night's abandoned attempt — do you want them gone?"* **The hook prompts nobody.** It
  refuses the agent and says the user forbade it, so the only way Stephen learns a guardrail fired is
  being told. Every blocked command destroys work that cannot be recovered, which is why the question is
  always *do you still want this?* and never *should I run this?*

  **The stop is about what a command does, not what it says.** The hook matches the whole command as
  text, so it fires on a command that merely *writes* the name of a blocked one — documentation, a
  comment, a commit message. Where that is what happened, say so and use the file-editing tools rather
  than the shell; where the command would actually run the blocked thing, stop and ask. The test is
  whether running it deletes or overwrites anything. **This clause exists because the rule above blocked
  its own first edit** — the paragraph naming the blocked commands contained them.

  *Why it is a stop at all.* On 2026-09-03 the hook refused a force-delete on an unmerged branch and the
  same outcome was reached thirty seconds later through `gh`. That outcome was correct and nothing was
  hidden — but a guardrail a tool swap defeats only ever stops the version of you that did not think of
  the swap, and that is not the version it was installed to protect against. It went in for 23:53 on the
  eighth task of the day.
- Migrations are additive and checked in. Schema changes never happen through the Supabase console.
- Secrets come from the environment. Never a literal key, never a committed `.env`. **And there is no
  local Anthropic API key — do not create one, in `.env`, `.env.local` or anywhere else.** Local and
  eval runs authenticate through the Claude Code session via the Agent SDK (ADR 0008). The failure
  this forbids is quiet and expensive: an agent finds no key locally, makes one to test with, and
  every local run then draws down the £50 prepaid balance that is F7-AC-12's entire protection.
  "Never a committed `.env`" alone reads as permission to create an uncommitted one; it is not.
- **The server refuses to boot without a required variable** (`apps/server/src/env.ts`). Add a new
  secret to that spec when the code that reads it lands, not before — marking something required
  that nothing reads blocks boot for no reason and teaches everyone to route around the check.
- Tests: unit for engine arithmetic and data rules, integration for RLS, rate limits and ingestion, Playwright
  for flows. Anything visual or tactile is a human checklist — write the checklist, do not fake it with a
  class-name assertion.
- **Skills from `mattpocock/skills`, and only those.** This bullet is not an inventory of what is on disk
  — other skills are installed from elsewhere, they are governed by nothing here, and their absence below
  says nothing about them. **Adopted and live:** `grill-with-docs`, `grilling`, `domain-modeling`, `tdd`,
  `code-review`, `implement`, `writing-for-agents`, `resolving-merge-conflicts`,
  `git-guardrails-claude-code`. **Installed as source material only — do NOT invoke:** `to-spec`,
  `to-tickets`. Both assume a greenfield: they run discovery, cut their own slices, and publish to a tracker
  layout this project does not use. Discovery was the PRD's, the twelve slices are `docs/build-plan.md`'s,
  Linear is the tracker and specs live in `docs/specs/`. If a task seems to call for either, say so and stop
  rather than running them.
- **The adapted versions live in this repo and are the ones to run** (STE-26): `slice-spec` writes one
  slice's spec into `docs/specs/`, and `slice-tickets` publishes that slice's tickets into Linear beneath
  the build ticket the plan already names. Both are in `.claude/skills/`, both are user-invoked only, and
  neither may re-slice, re-date, or create a top-level ticket for a slice.
- **`slice-review` is this repo's own, adapted from nothing.** It reviews a finished slice from cold — in a
  subagent, because the session that built the slice cannot review it — and posts what was built beyond the
  spec, what the spec asked for and is missing, and what the spec left open, to the slice's build ticket. Also
  in `.claude/skills/`, also user-invoked. It changes no files and gates nothing; the rules governing it are
  `P10`–`P12`.
- Cost: the model call is the expensive step. Cache what is stable within a gameweek, and never put raw
  `bootstrap-static` into a prompt.

## Stack

- **Runtime:** Railway. **Database and auth:** Supabase. **Source and CI:** GitHub. **Analytics:** PostHog.
- **Client:** React, client-rendered, built with Vite. **Server:** Hono on Node. One Railway service serves
  both — the server owns static serving, the SPA fallback and every route that touches a secret (ADR 0005).
- **Repo:** pnpm workspaces — `packages/engine`, `apps/client`, `apps/server` (ADR 0006). The client calls
  same-origin `/api/*` everywhere, in development through Vite's proxy, so no build carries an API origin.
- **Data model, API surface, pipeline and session transport: `docs/specs/architecture.md`** (STE-24).
  Money is stored as an integer in tenths of £1m throughout; no float ever holds money.

## Do not

- Do not read or write anything on the manager's FPL account. Public endpoints only, by team ID.
- Do not build a projection model, a price-prediction model, or fitted weights. Projections are bought in.
- Do not manufacture advice to fill a screen. "Nothing worth changing" is a legitimate, designed answer.
- Do not add a scheduled job. Feeds are fetched on open; refresh is manual and diff-gated.
- Do not treat the design handoff in `docs/design/` as a specification. **It is authoritative for HOW,
  never WHAT** — colour, type, spacing, radii, shadows, component anatomy, assets. Behaviour, thresholds
  and acceptance criteria come from `docs/criteria/`, and that holds **wherever a competing statement
  appears in the bundle**, not just in the sections whose titles announce it — `handoff/README.md` claims
  authority over behaviour in its *Overview* and *About the design files* sections too, both of which are
  read before any named section. Any statement anywhere in `handoff/` about behaviour, thresholds or
  rules yields to the criteria file. Where they disagree, the criteria file is right; say so rather than
  picking. The prototype's three known contradictions were corrected at source on 2026-09-03; its
  left-hand panel is a demo harness, not part of the product.
