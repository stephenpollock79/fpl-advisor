# Architecture and data model

- **Status:** Accepted, 2026-09-08 (STE-24)
- **Supersedes nothing.** Extends ADRs 0004–0010, which hold the reasoning for each decision it uses.

## What this document is

The build-ready translation of the PRD into a shape code can be written against. It answers four
questions and no others:

1. What runs where, and what is allowed to talk to what.
2. What is stored, in what unit, and who can read it.
3. What the server exposes.
4. What is still open, and what would settle it.

**It does not restate acceptance criteria.** Those live in `docs/criteria/`, are extracted verbatim
from the PRD, and are the authority wherever this document and one of them disagree. Where a design
here exists *because* of a criterion, that criterion is cited by identifier — the citation resolves
to a file in this repo, which is the whole of the citation rule (CLAUDE.md, *Where truth lives*).

**No architecture diagram, deliberately.** The system is one service, three packages and about a
dozen routes. A diagram here would be presentation polish, not a decision aid.

---

## 1 · System shape

One Railway service runs one Node process. That process is the Hono server (`apps/server`). It
serves the built client bundle as static files, answers `/api/*`, and is the only thing in the
system that holds a secret. The client (`apps/client`) is a React single-page app, client-rendered,
built by Vite. The engine (`packages/engine`) is a dependency-free TypeScript package that both
import as source. ADR 0005 decides the first; ADR 0006 decides the second.

```
browser ──── same-origin ────▶ Hono server ─────▶ Supabase (Postgres + Auth), eu-west-2
   │          /api/*              │
   │                              ├──▶ FPL public API          — fixtures, players, gameweeks
   │                              ├──▶ Fantasy Football IQ     — projected points
   │                              └──▶ Anthropic (Agent SDK)   — candidates, reasoning
   └── engine (imported as source, runs in both) ──┘
```

**Four boundaries, and what each one is for.**

| Boundary | What it stops |
| --- | --- |
| Two builds, no import path from server to client | A key reaching the browser. The NFR Security requirement no screen or flow expresses (ADR 0005). |
| The engine declares no dependencies and gets no runtime types | The engine acquiring a framework, a fetch, or a clock (ADR 0006). |
| All data fetching behind `apps/client/src/api.ts` | The one-way door in ADR 0005 becoming a rewrite of every data path. |
| Row-level security, with user data read as the user | One account's data reaching another — and, at one user, a forgotten filter reaching a table it should not (F7-AC-11). |

The fourth is the one that changed today. See §3.

**Region.** Supabase is West Europe (London) `eu-west-2` for both projects; Railway is Amsterdam
`europe-west4`, its only EU region. Matching regions was never available; London is the closest
Supabase region to Amsterdam (~8 ms against ~22 ms for Ireland), and that hop is on every request
inside NFR Performance's 200 ms budget. Supabase regions cannot be changed after creation, so this
is settled rather than provisional (STE-29).

---

## 2 · The two feeds, and what each one owns

CLAUDE.md's *Data rules* section is the authority and is not restated. What the schema adds:

- **Fixtures and gameweeks come from the FPL feed and are stored normalised**, so "how many fixtures
  does this club have in gameweek *n*" is a `count(*)`, never an inference from a projection's size
  or presence.
- **Projections come from Fantasy Football IQ, one row per player per gameweek**, and that one figure
  already covers however many matches that gameweek holds. The table has no per-fixture dimension,
  which is what makes rule 2 — nothing is summed across fixture entries — structurally true rather
  than a convention someone has to remember.
- **Attribution is a licence condition.** A visible link to fantasyfootballiq.app ships with the
  squad screen (STE-53, slice 3).

**A third source, for one field only.** F1-AC-10 asks each player slot to show a shirt
number and neither feed has one — FPL carries `squad_number` and it is null for all 654 players,
and FFIQ has no number-shaped field at all (STE-112). The Premier League public API does carry
them, and the join is exact: FPL ships `opta_code` on every element and the Premier League ships
the same identifier as `altIds.opta`. Measured 2026-09-09, 530 of 654 matched and **253 of the
254 players with ninety minutes or more**.

**It is not a feed and must not become one.** A shirt number changes about once a season, so
`ensureShirtNumbers` fetches only when the numbers are largely missing: it runs once and then
stops. No schedule, no manual step, and no twenty-one extra requests on every open. It also fails
soft — a blank kit is a cosmetic loss, and an unreachable third source must never take down a read
of the world.

**Two FFIQ fields that look more informative than they are.** Both established by STE-54, settled
2026-09-08, and recorded here because the failure mode in each is silence.

- **`predicted_starter` is a hard-constrained XI — exactly eleven per club, for all twenty clubs,
  always.** It knows nothing about fixtures, so **a club that blanks still carries eleven predicted
  starters.** It must never be read as "will play this gameweek", only "is in the notional XI". Same
  shape as the fixture-count rule above, and it needs the same defensive test against fabricated
  fixture data. It is also binary with no confidence attached — a nailed-on starter and a
  coin-flip both read `true` — so it is shown on the card as a fact and never enters the
  arithmetic. Rotation needs no input of ours at all: the feed's projection already prices
  expected starting (STE-60, 2026-09-10; STE-118).
- **`xi_known` is inert.** `true` for all 654 rows on the day it was checked. It reads exactly like
  the confidence flag that would have made the rotation decision go the other way, and it is not
  one. Do not build on it without first re-checking that it ever goes false.

**What the projected number already contains — measured 2026-09-09, and it changes the arithmetic
above it.** The figure is not a raw expectation waiting for our adjustments; **it already prices
whether the player is expected to play.**

- **A player known to be out projects zero, across every gameweek he misses.** Saliba, a starting
  defender with an open-ended back injury, reads `0` in all six gameweeks against 4.0 for fit
  players of the same position and price.
- **It tracks return dates rather than flagging a status.** Doku, expected back 13 September, reads
  `0, 0.9, 0.9, 1.2, 0.9, 0.9`; Mateta, expected back 11 October, reads `0, 0, 0, 1.1, 1.6, 1.1`.
  Zero for the weeks missed, switched on for the weeks after.
- **It prices rotation too.** Bruno Guimarães is fully fit and unflagged by FPL, and projects 0.7
  because he is not expected to start.

**So an availability or rotation multiplier applied on top is a second discount, not a first.** The
two feeds are independent estimates of the same quantity, and multiplying them compounds: fourteen
players in GW4 would have landed between 3% and 29% of what a fit player of their price projects.
It bites hardest on returning players, who are exactly the transfer candidates. Ruled 2026-09-10
(STE-60): **the feed's number is taken whole and never scaled.**

**The one thing the feed is not, is fresh on fitness.** Thirteen players FPL flagged as injured were
projected at full strength — Gakpo at 6.0 with a thigh injury, his highest of six gameweeks. The
file is generated at a moment; team news lands until the deadline. **FPL is authoritative on whether
a player is available; FFIQ is authoritative on what he is worth if he plays.** Where they
contradict each other the player is excluded from being recommended, never re-scored — the same
shape as the fixture-count rule above, and for the same reason: a precedence rule needs no knowledge
of what the other source's number contains, and an arithmetic one does.

**And that is why no adjustment is possible even in principle.** To apply our own availability
factor we would first have to remove theirs, and removing theirs means knowing what it is —
reverse-engineering a bought-in projection, which §12 puts out of scope.

`predicted_starter = false` on an otherwise available player is used as **a fact shown on the card
and passed to the reasoning call**, never as an input to the arithmetic. That was already true when
there were four judgement inputs and it survives their removal below: it is disclosure, not a term.

---

## 3 · Access and session

Decided in **ADR 0007**. The shape, and the one rule the rest of the build depends on:

The browser holds one opaque `httpOnly` cookie our server issued and never a Supabase token. Every
read goes through the API. The thirty-day sliding window (F7-AC-10) is ours, so it survives the
$300 credit lapsing and the projects dropping to the Free plan.

> **User data is read with the signed-in user's access token. Reference data is read with the service
> key. Never the other way round.**

The service key bypasses row-level security entirely. A server that reads user data with it passes
every test asserting the policies exist while providing none of the isolation those policies are
for. Nothing on screen would look wrong. That is why this sentence is here, in ADR 0007, and in the
integration test for STE-58 — it is in the silent-failure class (G7), and repetition is the cheapest
mitigation available.

**Rate limiting** (F7-AC-06, F7-AC-07) is ours, not the provider's: at most one code per address per
sixty seconds, an hourly ceiling per address, a matching ceiling per source address, and a throttled
request must return exactly what an accepted one returns. It is stored in `auth_throttle`, which is
written before anyone is authenticated and is therefore service-role only.

---

## 4 · The data model

**Units, stated once.** Money is stored as an integer in **tenths of £1m**, matching FPL's own
`now_cost` (`55` is £5.5m). No float ever holds money. Projected points are `numeric(5,2)`.
Multipliers and convictions are computed by the engine and stored as computed, never re-derived on
read (F1-AC-22, F9-AC-18 and the engine's single-source-of-truth rule all say the same thing from
three directions).

**Two families.** *User data* is owned by a person and carries a row-level policy keyed to
`auth.uid()`. *Reference data* is the world — it belongs to nobody, is read by the server with the
service key, and has RLS enabled with **no policy**, which under Supabase's automatic-RLS trigger
means it is unreachable as `anon` or `authenticated`. That is correct and deliberate; it becomes a
bug the moment something tries to read it from the browser, which under ADR 0007 nothing does.

| Table | Family | Holds |
| --- | --- | --- |
| `manager` | user | The person's FPL team link and confirmed identity |
| `app_session` | service | The opaque session, its sliding expiry, and the provider refresh token |
| `auth_throttle` | service | Code-request attempts, per address and per source address |
| `gameweek` | reference | Gameweeks, deadlines, and the `is_next` / `data_checked` flags |
| `club` | reference | The twenty clubs, for names, kits and the three-per-club rule |
| `player` | reference | Identity only — name, club, position, shirt number |
| `feed_read` | reference | One row per successful fetch of a feed. The "last read" F6-UP-02 works from |
| `player_state` | reference | The diffable per-player record, one set per `feed_read` |
| `fixture` | reference | Fixtures per gameweek, with difficulty and venue |
| `projection` | reference | One projected figure per player per gameweek, from FFIQ |
| `squad_snapshot` | user | The fifteen as at a moment, and where they came from |
| `squad_player` | user | The fifteen rows of one snapshot |
| `run` | user | One advice generation, its outcome, and what it cost |
| `player_judgement` | user | **Superseded** — the four judgement inputs are gone (STE-60). Never created; see below. |
| `call` | user | One produced call, as generated by one run |
| `decision` | user | The manager's answer, which outlives the run that prompted it |
| `chip_plan` | user | The season chip plan (F5, below the cut line) |

### 4.1 User data

**`manager`** — one row per account.

| Column | Type | Notes |
| --- | --- | --- |
| `user_id` | `uuid` PK | References `auth.users`. The RLS key for every table below. |
| `fpl_team_id` | `int` | Linked once, by identifier (F7-AC-13). |
| `team_name`, `manager_name`, `overall_rank` | `text`, `text`, `int` | Resolved against the public FPL API and **shown back for acceptance before anything is stored** (F7-AC-14). Stored because the account sheet displays them (F7-AC-21). |
| `linked_at` | `timestamptz` | |

No FPL credentials, ever — not requested, not transmitted, not stored. There is no column for one
and there never will be.

**`squad_snapshot`** — the fifteen as at a moment.

| Column | Type | Notes |
| --- | --- | --- |
| `id` | `uuid` PK | |
| `user_id` | `uuid` | |
| `gameweek` | `int` | The gameweek this squad is *for* — always `is_next`, never `is_current`. |
| `source` | `text` | `fpl_deadline` or `screenshot`. **This column is what F8-AC-04's disclosure line reads**, and that line is what makes the freshness differentiator true. |
| `captured_at` | `timestamptz` | For the screenshot case, the upload time the line quotes ("uploaded at 18:12"). |
| `bank_tenths` | `int` | The Balance. |
| `free_transfers` | `int` | |
| `chips_remaining` | `jsonb` | Four chips, each available or spent (F1-AC-08). |
| `superseded_at` | `timestamptz` null | A correction replaces wholesale (F2-AC-04); the old row is kept rather than deleted, so a disclosure line can never point at a squad that no longer exists. |

**`squad_player`** — fifteen rows per snapshot.

| Column | Type | Notes |
| --- | --- | --- |
| `snapshot_id` | `uuid` | |
| `user_id` | `uuid` | **Denormalised from the snapshot, and unable to disagree with it.** Added 2026-09-09 (STE-99). The isolation suite reads every user-posture table generically and expects a `user_id`; an exception here would need a special case in the one mechanism that catches a future table forgetting its policy. The duplication is safe because the foreign key is on the *pair* — `(snapshot_id, user_id)` references `squad_snapshot (id, user_id)` — so a row naming the wrong owner cannot be written at all. |
| `player_id` | `int` | FPL's own player id. |
| `is_starter` | `bool` | Eleven true, four false (F1-AC-01, F1-AC-02). |
| `bench_order` | `int` null | 0 for the substitute goalkeeper, 1–3 for the outfield bench. |
| `is_captain`, `is_vice` | `bool` | Never both on one row, never both false across the fifteen. |
| `purchase_price_tenths` | `int` null | Recovered as §8.1 records (STE-87). Null only where it cannot be recovered — and then that player is not offered for sale, rather than sold at a guessed price. F3-AC-26 requires it; the selling price in F3-AC-25 is derived from it, never stored. |

Formation is derived from the starting eleven and never stored (F1-AC-03). Squad and bench
projected-points totals are summed from the players shown and never stored (F1-AC-22).

**`run`** — one advice generation.

| Column | Type | Notes |
| --- | --- | --- |
| `id`, `user_id`, `gameweek` | | |
| `scope` | `text` | `all`, `transfer`, `substitution`, `captaincy`, `chips` (F6-AC-07). |
| `trigger` | `text` | `first_open`, `refresh`, `screenshot_correction`, `gameweek_rollover`. |
| `status` | `text` | `running`, `succeeded`, `failed`, `cancelled`. |
| `started_at`, `finished_at` | `timestamptz` | |
| `feed_read_id`, `squad_snapshot_id` | `uuid` | What this run saw. Makes a call reproducible without re-fetching. |
| `model_calls` | `jsonb` | One record per model call: step, the pinned identifier, **the identifier the SDK reports it ran**, tokens, cost, and whether it succeeded (ADR 0008, 0009). The reported identifier is the one figure that can prove the evals describe what shipped; the pin is only what was asked for. |
| `input_tokens`, `output_tokens`, `cost_usd` | | Totals across `model_calls`, from the first commit. |

**The last-run time is `max(finished_at) where status = 'succeeded'`.** Not `max(started_at)`, not
the last row. F6-AC-14 and F6-UP-01 both turn on this: a failed run must never age the advice, and a
cancelled run is treated exactly as one that never started (F6-AC-20).

**`player_judgement`** — **superseded 2026-09-10 (STE-60), and not yet replaced.**

This table held the model's four judgement inputs. **All four are gone.** Two were the
multipliers removed above. *Projection reliability* was dropped as the same double-count a third
time — regressing thin samples is something a projection model already does. *News freshness* was
dropped because its cases do not survive inspection: lineups are published an hour before kickoff
against a deadline ninety minutes before the first match, so "lineups unannounced" is true at every
deadline of the season and carries no information; price changes belong to money, which is excluded
from the score by design; a press conference not yet held resolves itself when FPL's availability
field moves. Stale data is handled mechanically in F6 (STE-65), not by judgement.

So **conviction is now `100 × net ÷ (net + k)` and nothing else** — no trust haircut. The two
factors were never marginal: two *unresolved* took 40 points off, which on the engine's own worked
example equals the net falling from +5.5 to +1.0, an uncalibrated model opinion moving the figure
further than quintupling the real edge would.

**The principle, which outlives the mechanism: disclose uncertainty, do not price it.** What is
thin is shown as a fact on the card, not converted into arithmetic that cannot be justified.

**Nothing is specified here yet, deliberately.** Two questions have to be answered by the engine
slice before a table shape follows from them, and guessing at columns now would fix the answer:

- **Does this table survive at all?** The model still proposes candidates, still quotes evidence
  and still writes the reasoning. What it no longer does is emit anything that enters a number. If
  the quoted evidence is still carried forward between runs, something stores it — F6-RS-01 and
  F6-RS-08 depend on exactly that, and *carrying the stored evidence forward* is how the refresh
  diff avoids re-spending a model call.
- **Does the availability override survive?** Availability is now an exclusion gate read from FPL.
  The criteria allowed the model to override it with cited evidence when a press conference had
  outrun the feed. That is a freshness argument and it is still sound, but it puts model judgement
  back inside a gate — which is a functionality decision, not a schema one.

**Nothing needs migrating.** This table was deliberately left for the slice that uses it (§9), so
it has never been created.

This table is what F6-RS-01 and F6-RS-08 mean by carrying the prior run forward: if the evidence
diff finds nothing, these rows are reused and no model call is made. The conviction figure is
byte-identical either way, since it is arithmetic over published inputs that have not moved.

**`call`** — one call, as produced by one run.

| Column | Type | Notes |
| --- | --- | --- |
| `id`, `user_id`, `run_id`, `gameweek` | | |
| `call_key` | `text` | **The stable identity across runs. See §5 — this is the load-bearing column.** |
| `category` | `text` | `transfer`, `substitution`, `captaincy` (F8-AC-27's three groups). |
| `shape` | `text` | `transfer`, `forced_swap`, `doubt_swap`, `upgrade_swap`, `bench_order`, `captain`, `vice` (F3-AC-03). `upgrade_swap` is a fit starter for a better bench player — ruled 2026-09-11, and the criterion's wording is STE-116. |
| `out_player_id`, `in_player_id` | `int` | For a bench-order call these are the two bench players whose order changes (F3-AC-04). |
| `net` | `numeric(6,2)` | Signed, and **non-negative by construction** — the winning side is the recommendation. |
| `conviction` | `int` | 5–95, clamped. |
| `band` | `text` | `certain` / `strong` / `lean` / `thin`. |
| `k_used` | `numeric` | 0.5 for a substitution, bench order, captain and vice; 2.0 for a transfer (tuned 2026-09-10, STE-60). Shown in the breakdown (F3-AC-30, F4-AC-11). |
| `cost_tenths` | `int` | Transfers only; £0.00 for substitutions and captaincy (F3-AC-28). |
| `is_forced` | `bool` | **A property of the call, never derived from conviction** (F3-AC-17, F8-AC-03). |
| `watch_flag` | `bool` | Set by code, never by the model, and never from conviction (F3-AC-17, F3-AC-18). On a transfer only, when FPL's own forecast in `bootstrap-static` rates either player's price change tonight at its strongest likelihood (±5) and the price is not locked (STE-117). The press-conference trigger has no source. **Shown only while the forecast is tonight's:** the card hides it once FPL's 01:30 UK overnight update has passed since the read behind it (`GET /api/world` carries that read's time as `priceForecastReadAt`), and hides a stored flag outright when a newer read exists than the run that set it. |
| `watch_reason` | `text` null | Why WATCH is set, shown one tap away on the card (F3-AC-18). Null when it is not set. |
| `is_reading` | `bool` | A keep reading — no change, nothing to do. Excluded from every tally (F4-AC-02, F4-AC-03). |
| `reasoning` | `text` | Four lines maximum, from the constrained call (F3-AC-22). |
| `breakdown` | `jsonb` | Every value already computed in the pipeline. **Nothing is calculated when this is displayed** (F3-AC-31). |
| `diff_tag`, `previous_conviction`, `viewed_at` | | `NEW` / `UPDATED` / `RETURNED` / `RESURFACED` / band move (F6-AC-13). The tag is transient until viewed, which is what `viewed_at` is for. |

**`decision`** — the manager's answer.

| Column | Type | Notes |
| --- | --- | --- |
| `user_id`, `gameweek`, `call_key` | composite PK | Keyed to the call's *identity*, not to a `call` row. |
| `state` | `text` | `selected` or `rejected`. Pending is the absence of a row (F3-AC-01's third state needs no storage). |
| `decided_at` | `timestamptz` | |
| `broken_by_snapshot_id` | `uuid` null | Set when a squad correction contradicts a selected call and the lock is broken (F2-AC-07, F6-RS-07). Kept rather than deleted, because the manager has to be told why. |

**`chip_plan`** (F5, below the cut line) — one row per chip per generation: `verdict`
(`play` / `target` / `hold` / `spent`), `target_gameweek`, a six-cell `timeline`, and an editorial
line. Nothing here enters the shortlist or the NBal (F5-AC-02).

**F9 stores nothing.** A chip proposal's locks and swaps live in component state and are discarded
on leaving — F9-AC-20 says so outright, and F9-UP-02 makes the discard the default case. There is
no table, and adding one would be building a feature the criteria reject.

### 4.2 Reference data

**`gameweek`** — `id`, `name`, `deadline_time`, `is_next`, `is_current`, `finished`, `data_checked`.
All four flags are stored because all four are read for different things, and two of them are
foot-guns:

- **Advise on `is_next`.** The feed marks a gameweek *current* until the following one locks, so
  while a deadline is unpassed `is_current` is a week already played. Keying off it produces
  confident advice about the wrong week, every week, with nothing visibly broken.
- **Read last gameweek's points from `data_checked`, not `finished`.** `finished` flips when the last
  match ends; bonus points and corrections land afterwards.

Both are in the G7 silent-failure class and both are asserted by unit test in slice 3.

**`fixture`** — `id`, `gameweek`, `home_club`, `away_club`, `kickoff`, `home_difficulty`,
`away_difficulty`, `finished`. **This table is the only source of a fixture count.** A club with no
row in a gameweek blanks; two rows is a double; the projection is never consulted for the count, and
on conflict the count wins. Any gameweek where a club has other than one fixture is **logged** —
blanks and doubles cannot be observed live early in a season, so the first real one has to announce
itself rather than pass silently.

**`projection`** — `gameweek`, `player_id`, `projected_points`, `feed_read_id`. One row per player
per gameweek. There is no fixture dimension, by design.

**`feed_read`** — `id`, `source` (`fpl_bootstrap` / `fpl_fixtures` / `ffiq`), `fetched_at`,
`succeeded`, `raw` (`jsonb`). The raw payload is kept because F6-UP-02 works from the last read and
has to state how old it is. **`raw` is storage, never prompt input** — sending `bootstrap-static` to
a model costs about $2 against a ~$0.07 budget (ADR 0009).

**`player_state`** — `feed_read_id`, `player_id`, `status`, `news`, `news_added`,
`chance_of_playing_next_round`, `now_cost_tenths`. One set per read, **for every player FPL tracks —
not only the players already inside a call**. F6-RS-02 requires the diff to run across the whole
record, and F6-RS-05 requires a player who was never proposed to be able to surface as a brand-new
candidate. Storing only squad players would make that impossible while looking like it worked.

The diff is mechanical, free, and runs before any model call. Its count is what the news-alert token
displays (F8-AC-13), and its result is what decides whether a model is called at all (F6-RS-08).

---

## 5 · Call identity, and how decisions survive a refresh

This is the single most consequential piece of design in the schema, and getting it wrong produces a
build that demonstrates correctly and loses decisions in use.

F6 says three things at once. **Selected calls survive a refresh and become constraints**
(F6-AC-01). **Rejected calls are suppressed for the rest of the gameweek** and return only if the
premise has materially changed (F6-AC-03). **Pending calls are discarded and rewritten freely**
(F6-AC-04).

So a decision cannot belong to a `call` row, because the `call` row is thrown away and rewritten by
the next run. It has to belong to something that outlives the run. That something is `call_key` — a
deterministic string built from what makes a call *the same call*:

```
transfer:out=<player>:in=<player>
substitution:forced|doubt|upgrade:out=<player>:in=<player>
substitution:bench_order:slots=<a>,<b>
captaincy:captain:from=<player>:to=<player>
captaincy:vice:from=<player>:to=<player>
```

Computed by the engine, so both consumers produce the same string from the same call. With that:

- **Selected** — the key is looked up before generation and its players and money are treated as
  committed (F6-AC-01). It reads *selected · locked* (F6-AC-02).
- **Rejected** — the key is suppressed for the gameweek (F6-AC-03), *unless* the regenerated call
  crosses a conviction band boundary or can no longer be executed, which is the whole of the
  definition of materially changed (F6-AC-06), *or* the call is forced, which ignores suppression
  outright (F6-AC-05).
- **Pending** — no row, nothing to preserve.
- **A gameweek rollover keeps nothing.** `decision` is keyed by gameweek, so a new gameweek is a
  clean slate by construction rather than by a delete anyone has to remember (F6-UP-03).

Two constraints ride alongside it. **No two calls in one run may touch the same player** — prevented
at generation, not detected in the interface (F3-UP-04), and re-checked on every refresh, which is
what stops scenario totals double-counting. And **conviction is never recomputed on read**: the
stored figure is what every surface displays, so no two surfaces can disagree.

---

## 6 · The API surface

Every route that touches a secret, a feed or the model is here. The boundary can be read off this
list rather than inferred from a module graph — that is the point of it (ADR 0005).

| Route | Purpose |
| --- | --- |
| `GET /api/health` | Liveness, the deployed commit, the port it bound, the Node major it is running on (§10.1) and which declared variables are present. Already built (STE-30). |
| `POST /api/auth/request-code` | Sends a code, or does not. **Returns the same response either way** — for an unknown address (F7-AC-02, F7-UP-01) and for a throttled one (F7-AC-07, F7-UP-03). |
| `POST /api/auth/verify` | Verifies the code, creates the `app_session` row, sets the cookie. Dies after five wrong attempts (F7-AC-09). |
| `POST /api/auth/logout` | Revokes the session row (F7-AC-24, F7-AC-25). |
| `GET /api/me` | The manager, the linked team, and whether a team link is still needed. |
| `POST /api/team-link/resolve` | Resolves an FPL team id and returns the team for confirmation. **Stores nothing** (F7-AC-14). |
| `POST /api/team-link/confirm` | Stores the accepted link. |
| `GET /api/world` | The gameweek, the squad snapshot, fixtures, projections, calls and decisions — everything a screen re-derives from. One call, because the client holds the world. |
| `POST /api/runs` | Starts a run. **Plain JSON since slice 5**; F6 makes it a hand-written SSE endpoint that streams progress — no framework supplies this (ADR 0005) — with `AbortController` plus request-close as the cancellation (F6-AC-19, F6-AC-20). |
| `GET /api/runs/:id/diff` | The post-run diff (F6-AC-11). |
| `POST /api/decisions` | Records a selection or rejection against a `call_key`; `pending` deletes the row, since pending is its absence (F3-AC-01, F3-AC-14). |
| `POST /api/squad/screenshots` | The two-image parse. All-or-nothing across both (F2-UP-01), then straight into a run (F2-AC-05, F2-AC-06). |

Everything else under `/api/*` is a JSON 404 — already true, and deliberate: without it the SPA
fallback answers a mistyped fetch with `index.html` and the caller fails parsing HTML somewhere far
from the cause.

---

## 7 · The advice pipeline

Four steps, from the engine criteria, preceded by the fetch and diff this document adds. What it
adds beyond the criteria is where each step runs and what it costs.

| # | Step | Where | Model |
| --- | --- | --- | --- |
| 0 | Fetch feeds, write `feed_read` and `player_state`, **diff the evidence** | server | none |
| 1 | Propose the week's candidate calls | server, via ADR 0008 | Haiku |
| 2 | **Compute** effective points, net, conviction, band, cost | `packages/engine` | none |
| 3 | Write the reasoning, from the card's own field values only | server | Sonnet |
| 4 | **Assign** the band and decide what is shown | `packages/engine` | none |

**There is no judgement step, and its absence is the design** (STE-60, 2026-09-10). The model is on
either side of the arithmetic and never inside it.

Step 0 is the gate: **if it finds nothing, steps 1 and 3 do not run at all** and the stored calls and
the evidence behind them are reused (F6-RS-08). Most refreshes should therefore cost nothing.

Steps 2 and 4 are the engine, and the engine is called by both F3 and F4 — one function producing
net, conviction and band, never a variation implemented twice. If a feature needs a difference, it
is a parameter.

Step 3's input is **only the field values shown on that card's evaluation table** — not the evidence,
news or opinion context the model drew on in step 1. That is the enforcement, not an instruction:
referencing anything else becomes a hallucination from nothing rather than a citation of real but
hidden data. A deterministic keyword check against excluded-field vocabulary is the second-line
catch, and a flagged line falls back to a templated sentence rather than a retry.

**The model never emits a conviction percentage, and supplies nothing that enters one.** Every figure
shown is arithmetic over published data, so the same inputs produce the same figure on every run —
a figure that moves without an input moving is a defect. What is *not* reproducible is which
candidates step 1 proposes and how step 3 words a call. No code comment or user-facing string should
blur the two, in either direction.

---

## 8 · Open, with the check that would settle each

Named rather than folded in. Each carries a deadline, because a deferral without one is a decision
made by default.

### 8.1 Where purchase prices come from — **closed 2026-09-10 (STE-87), built in slice 5**

`picks/` carries neither purchase nor selling price. What does, exactly: **`entry/{id}/transfers/`'s
`element_in_cost`** — the price actually paid, per transfer, with its gameweek — falling back to
**`now_cost − cost_change_start`** for a player held since gameweek 1. The latest purchase of a
player wins; **Free Hit gameweeks are skipped**, because the squad reverts and those transfers were
never really made; Wildcard transfers are real and count. `player_state` stores
`cost_change_start_tenths` so the fallback has its input.

Recovered at capture (`squad/store.ts`), and backfilled before every run for a squad captured without
it. **Where a price still cannot be recovered it stays null and that player is not offered for
sale** — the quiet fallback this section used to warn about, selling at today's price, is not built.

### 8.2 Two probabilities the criteria used but never defined — **closed 2026-09-10 (STE-88)**

**Neither exists, and neither is replaced by an estimate.** Where the arithmetic names a probability
no source publishes, the multiplier is dropped: a vice call's net and a bench-order call's net are
each the **plain difference** (F3-AC-04, ENGINE *Vice armband*). FPL's chance-of-playing figure is not
used as a substitute, because the projection already prices it and the availability gate already acts
on it — multiplying by it would re-create the double-count that removed the availability multiplier.
The captain is the highest eligible projection, the vice the second-highest, and the outfield bench is
ordered by the same figure with excluded players last (`ENGINE-AC-06`).

### 8.3 The engine has no acceptance criteria — **before Thursday, already flagged in the Build Plan**

`ENGINE.criteria.md` carries zero `AC-` identifiers, so nothing in the engine is trackable by ADR
0010's mechanism. Either identifiers are added to PRD 3.2 and the criteria regenerated, or it is
recorded that the worked example plus the unit tests are the standard. Not settleable here — the
criteria files are derived and this repo must not edit them.

---

### 8.4 Free transfers remaining are derived, not read — **STE-110, before the MVP cut, 15 September**

F1-AC-07 puts the free-transfer count in the header. The Balance beside it is read straight
from `entry_history.bank`, already in tenths. **The transfer balance is in no public endpoint.**

**The discriminating check, already run on 2026-09-09:** both
`entry/{id}/event/{gw}/picks/` and `entry/{id}/history/` carry `event_transfers` — transfers
*made* per gameweek — and neither carries the balance remaining. The authenticated `my-team`
endpoint does report it, and this project does not use it (F7-AC-13).

So slice 3 reconstructs it: one earned per gameweek after the first, minus those used, carried
over, floored at zero, capped at five, with wildcard and free-hit gameweeks exempt because they
grant unlimited transfers. The arithmetic is unit-tested and correct for the rules as they stand.

**The quiet failure is the cap.** It was two until 2024/25 and is five now. A rule change makes
the header confidently wrong with nothing on screen to say so — and every test still passes,
because the tests assert the reconstruction rather than the truth. The fix that removes the
guesswork is reading the count from the F2 screenshot, which displays it and which the app
already parses (slice 9). Until then the derivation stands and must not be mistaken for a feed
value.

---

## 9 · Migrations, and what every one of them must say

The rules are ADR 0004's and STE-29's; what is new is the second bullet.

- **Additive, checked in, dev first, never through the Supabase console.**
- **Every migration states its table's security posture explicitly**, with `ENABLE ROW LEVEL
  SECURITY` written out even though Supabase's automatic-RLS trigger has already done it. The
  trigger is a fail-closed backstop, never the mechanism: F7-AC-11 says the migration owns this, and
  a migration that does not state a table's posture is not self-describing.
- **A user-data table ships its policy in the same migration that creates it.** No table ships
  without one, and this is asserted by a test (STE-58), not trusted.
- **A reference table gets no policy and needs none**, because nothing reads it as `anon` or
  `authenticated`. If that ever changes, the `select` policy is decided in the migration, per table,
  not on discovery.
- **Every migration states its grants too, per table, per role.** "Automatically expose new tables"
  is off (STE-29), so Supabase's default privileges never reach a new table and no role can read it
  until the migration says so. This is not a formality: **Postgres checks grants before policies**,
  so a table with policies and no grant is security that never runs, and a suite that exercises only
  policies reports it as working. Found on 2026-09-08 by applying the first migration to dev and
  asking the Data API for a row — every role was denied, `service_role` included.
- **User tables grant nothing to `service_role`.** That is what makes ADR 0007's rule a mechanism
  rather than a convention. A 403 from the service key on a user table is correct; adding a grant to
  make it go away is the wrong fix.

**One symptom worth knowing before it happens:** the dashboard's Table Editor and SQL Editor run
privileged, so a table blocked by RLS in the app shows its rows normally there. An empty result in
the app that looks fine in the dashboard is this, first guess.

---

## 10 · Environments and configuration

Two Supabase projects, `fpl-advisor-dev` and `fpl-advisor-prod`. One Railway service, deploying on
merge to `main`. No staging (ADR 0004).

Every value below comes from the environment. Never a literal, never a committed `.env`. All of them
are read in `apps/server` only — the client is given none of them, and there is no import path by
which it could reach one.

| Variable | Used for |
| --- | --- |
| `SUPABASE_URL`, `SUPABASE_ANON_KEY` | Auth: sending and verifying codes. |
| `SUPABASE_SERVICE_KEY` | Reference-table reads and the service tables. **Never user data** (§3). |
| `ANTHROPIC_API_KEY` | The production reasoning path (ADR 0008). Absent locally, where the Claude Code session authenticates instead. |
| `ANTHROPIC_MODEL_FILTER`, `ANTHROPIC_MODEL_REASON` | Overrides for the pinned identifiers, which are otherwise set in code. Recorded per call, beside the identifier the provider reports it ran. |
| `MODEL_MODE` | `mock` forces the no-spend route. Otherwise a present `ANTHROPIC_API_KEY` means the direct Messages API, and its absence means the Claude Code session (ADR 0008, amended 2026-09-11). |
| `SESSION_COOKIE_SECRET` | Signing the session cookie. |
| `POSTHOG_KEY` | Analytics. |
| `PORT`, `RAILWAY_GIT_COMMIT_SHA` | Injected by Railway. |

**The Fantasy Football IQ feed is not in that table, and that is not an omission.** It is
unauthenticated public HTTPS — two static files, no key, no token, no account, no developer portal
and no `/api` path:

```
https://fantasyfootballiq.app/data/ffiq-projections-latest.json
https://fantasyfootballiq.app/data/ffiq-fixture-ease-latest.json
```

Confirmed by live fetch on 2026-09-09: a bare `GET` with no headers returns `200` and 654 players
across `gw_from` 4 to `gw_to` 9. The payload carries its own grant — *"Free to use in articles,
videos, tools and research — attribution required: link to https://fantasyfootballiq.app"* — which
is the licence STE-53's attribution link answers, and the reason attribution is a condition rather
than a courtesy. **The absence of an API is the design, not an outage.** A search for a "Fantasy
Football IQ API" returns nothing relevant; that is not evidence the feed has gone, and the check
that settles it is fetching the URL, never searching for docs.

### 10.1 The Node version, and the one place it is pinned that this repo cannot hold

Three files name a Node version, and they are three different statements — none of them redundant
(STE-75):

| Where | Value | What it says |
| --- | --- | --- |
| `engines.node` in the root `package.json` | `>=22` | **A floor, not a pin.** What the code requires. Correct as a range; do not narrow it. |
| `node-version` in `.github/workflows/ci.yml` | `22` | **What CI actually exercises.** It duplicates the floor deliberately. Collapsing them with `node-version-file: package.json` would make `setup-node` resolve the *range*, so CI's Node would float to whatever is newest and the pin would be lost. |
| `.nvmrc` | `22` | **What a developer's shell picks up** under nvm, fnm or asdf. |

**Railway's pin is not in this repo.** It is a service variable in the Railway dashboard:
`NIXPACKS_NODE_VERSION=22`. It has to be, and that is not a preference. Nixpacks resolves in the
order `NIXPACKS_NODE_VERSION` → `engines.node` → `.nvmrc` → `.node-version`, and it treats
`engines.node` as a *range*, walking the LTS majors downward and taking the newest that satisfies
it. So `>=22` selects the highest LTS Nixpacks knows about — today 24, tomorrow whatever ships next
— and `.nvmrc` never gets consulted, because `engines.node` outranks it. The only lever above
`engines.node` is the environment variable, and Railway service variables live in Railway.

That leaves the gap this section exists to close: **the pin can be changed, or lost, with no trace
in a checkout.** So `GET /api/health` reports `node`, read from `process.version` — the running
interpreter rather than anything that claims to configure it. To check the deploy is on the major
CI tested, read that field. If it does not start with `v22`, the service variable is missing or has
been changed.


---

## 11 · The client decisions ADR 0005 deferred

Settled here, briefly, because they are library choices on a settled stack rather than decisions with
consequences worth an ADR each.

- **Router: React Router 7 in declarative mode.** Library mode, not framework mode — framework mode
  is the option ADR 0005 shortlisted and rejected, and adopting it by the back door would undo that
  decision without recording it. Largest corpus of any router, which is ADR 0005's own third reason.
- **No server-state library.** The app makes about six requests, holds the world in one context, and
  recomputes locally by design. TanStack Query would add a second cache to reason about and bundle
  weight to the one path on every cold open, in exchange for machinery this shape does not use.
- **No client-state library.** One context holding the world, one reducer holding the week's
  decisions. Recomputation is a pure function of the two and belongs to the engine.
- **Styling: plain CSS with custom properties, CSS Modules per component.** The design system is a
  fixed set of token values (`docs/design/TOKENS.md`); a utility framework would mean re-expressing
  them in a config and maintaining two copies of the palette.
- **Not a PWA.** No criterion asks for installation or an offline shell, and one would need a cache
  invalidation story that the deploy-on-merge workflow does not have.

Data fetching stays behind `apps/client/src/api.ts` regardless of any of the above. That module is
the mitigation for ADR 0005's one-way door, and none of these four choices touches it.

---

## 12 · Deliberately not built

Named so that none of it arrives by implication.

- **No per-user spend ceiling in application code.** The cap is the £50 prepaid balance and nothing
  else (NFR Cost control, ADR 0009). Its verification is opening the Anthropic console and reading
  the balance — there is nothing in this repo to test, and writing a test would be inventing the
  mechanism the requirements rejected.
- **No scheduled job.** Feeds are fetched on open; refresh is manual and diff-gated. Nothing ever
  refreshes on its own (F6-AC-15).
- **No projection model, no price-prediction model, no fitted weights.** And **no model-supplied
  term inside any figure shown** — this used to read "no fifth judgement factor", which stopped
  meaning anything on 2026-09-10 when the four were removed (STE-60). The rule it was reaching for
  is the durable one: the model proposes candidates and writes the reasoning; every number on a
  card is computed by code from the bought-in projection. Reverse-engineering that projection so as
  to adjust it is the same prohibition seen from the other side (§2).
- **No client bundle budget.** Unmeasured and unenforced, deliberately: a threshold invented before
  any measurement is a number with no evidence behind it. `vite build` prints gzipped chunk sizes on
  every build, so the figure is never invisible. A budget follows the first measurement.
- **No staging environment, no release branches, no manual gate before merge** (ADR 0004).
- **No storage for chip proposals** (F9), and no confirm, apply or play action anywhere near a chip.
- **The app never writes to FPL, under any circumstance**, and never reads the manager's FPL account.
  Public endpoints only, by team id.
