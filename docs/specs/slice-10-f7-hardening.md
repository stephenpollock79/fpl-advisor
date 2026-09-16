# Slice 10 — F7 hardening pass

Build **STE-68** · tests in STE-68 · **Wednesday 16 September** · reads `docs/criteria/F7.criteria.md`
and `docs/criteria/NFR.criteria.md`.

## Seams

**One seam, and it already exists:** the Hono app driven by `app.request(Request)` with dependencies
injected — the shape `team-link/routes.ts` has used since slice 2. `authRoutes` is the last route
factory without it; it reaches for Supabase directly and so cannot be driven from a test at all. It
gets the same shape. No new seam, one fewer exception.

**A second, lower seam for the counter:** real Postgres in process, through `freshDb()` in
`tests/rls/harness.ts`. The decide-and-record logic is a SQL function rather than TypeScript, so the
test exercises the function the server calls, against the table the migration creates, under the
grants it sets. In TypeScript it could only be tested as a re-implementation, and the concurrency case
not at all.

**Blocking edges: none.** Slice 9 is merged and deployed; the derived build plan was regenerated this
morning and both extractor checks pass.

**Three things that look like ask gates and are not**, checked against the list rather than by feel.
The table's *existence* is `architecture.md` §3 and §4's call — G17 applies; its *shape* is P13's. It
carries **no row-level policy**, which applies ADR 0007 rather than departing from it: every row is
written before anyone is signed in, so there is no `auth.uid()` to key one to. And
`apps/client/src/api.ts` changes, but the slice goes *through* the single data path, not around it.

**One decision that is Stephen's, and it is not in this slice's criteria.** `run.scope` is a label with
no mechanism behind it, logged onto STE-68 during slice 8. It is an F6 criterion and a functionality
call. Recommended as its own ticket rather than joining this slice; raised separately in the session.

## Modules

**Created** — `supabase/migrations/20260916120000_f7_auth_throttle.sql` (table, posture, grants,
decide-and-record function); `apps/server/src/auth/limits.ts` (every threshold, one place);
`auth/subject.ts` (normalisation, digests, source address); `auth/throttle.ts` (contract) and
`auth/throttle.pg.ts` (the store); `auth/wire.ts`, matching `world/wire.ts`;
`team-link/confirmation.ts`; and `tests/auth/{request-code,verify,throttle.pg,confirmation}.test.ts`.

**Changed** — `auth/routes.ts` (injected dependencies, the send no longer awaited, both limits);
`team-link/routes.ts`; `supabase.ts` (a fourth named client); `env.ts` (`SESSION_COOKIE_SECRET`'s
stated reason, which is false today); `index.ts`; `apps/client/src/api.ts`, `LinkTeam.tsx`,
`Landing.tsx`; `scripts/live-rls-check.mjs`; `docs/specs/architecture.md`; `docs/coverage-gaps.md`;
and `tests/team-link/routes.test.ts` and `tests/e2e/landing.spec.ts`, which both break on the new
contract.

## Interfaces

**`POST /api/auth/request-code`** — body `{ email }`, response `{ status: "code_requested" }`, HTTP
200, **on every path**: sent, unknown address, throttled, provider failure, store failure. No
`Retry-After`, no `X-RateLimit-*`, no varying status. The provider send is **started and not awaited**,
so no path's duration depends on whether the address has an account.

Three limits, in **one** database call so accepted and throttled do identical work: **1 per address per
60 seconds**, **5 per address per hour**, **5 per source address per hour**. The address is trimmed and
lower-cased before hashing; the source is the **last** entry of `X-Forwarded-For`, the only element a
caller cannot author. A denied take does not advance the counter, so a flood cannot extend its own
lockout. If the store throws, the send is **denied** and the same body returned.

A request that **actually sends** clears the verify-attempt counter. A **throttled** one does not —
nothing was sent, so the live code is still live.

**`POST /api/auth/verify`** — attempts counted per address, window **3600 seconds**, **for every
address including ones the provider has never heard of**. At **5** failures the sixth returns
`{ error: "code_spent" }` **without reaching Supabase**. Wrong, expired and already-used stay
indistinguishable as `invalid_code`; only exhaustion is distinguished, because only exhaustion changes
what the manager should do next (F7-UP-02). A successful verify clears the counter.

**`POST /api/team-link/resolve`** — response gains `confirmation`: `<unix-expiry>.<HMAC-SHA256>` over
the signed-in user, the team identifier and that expiry, keyed by `SESSION_COOKIE_SECRET`, living
**600 seconds**. It carries no identity — both values are recomputed at verify time.

**`POST /api/team-link/confirm`** — body gains `confirmation`, checked **before** the FPL read, so a
forged confirm costs no upstream request. Missing, expired, tampered, for another team or another user
each return `{ error: "not_confirmed" }`, 400. Confirm still re-reads FPL rather than trusting the
posted team: the token binds *which identifier* was shown back, not what it was called.

**`auth_throttle`** — `kind` (`address_minute` | `address_hour` | `source_hour` | `verify_attempt`),
`subject_hash`, `window_start`, `hits`, `updated_at`; primary key `(kind, subject_hash)`.
`posture:service`; RLS on and forced, **no policy**, revoked from `anon` and `authenticated`, granted
to `service_role`. The function is revoked from `public` as well as both roles — Postgres grants
`EXECUTE` to `PUBLIC` on every new function, and STE-29's "expose new tables = OFF" covers tables, not
functions.

**Landing screen** — a distinct inline message for `code_spent`, stating the code is used up and
another is needed. Inline in the red card, never a toast (F7-AC-20). The 60-second cooldown is
unchanged.

**What this change breaks elsewhere, named rather than discovered.** A manager mid-sign-in when the
deploy lands keeps a valid code: the counter starts empty, so nothing in flight is invalidated. The one
new lockout is exhausting five attempts *and* five requests inside one hour — up to an hour's wait,
accepted, because it is the shape F7-AC-09 asks for.

**NFR.** This *improves* the 200-millisecond budget rather than spending against it: `request-code`
goes from 3.46 seconds on a real send to one database round trip.

## Criteria in scope

**Thirteen.** `F7-AC-01`, `F7-AC-02`, `F7-AC-03`, `F7-AC-05`, `F7-AC-06`, `F7-AC-07`, `F7-AC-09`,
`F7-AC-14`, `F7-UP-01`, `F7-UP-02`, `F7-UP-03`, `F7-UP-04`, `F7-UP-05`.

Three already read green and should not: `F7-AC-14` is covered by a test proving a different half,
`F7-UP-02`'s spent-code wording is currently the opposite of what the criterion asks, and `F7-UP-04`'s
account-creation half has never been asserted. All three are in `docs/coverage-gaps.md`.

**Nothing is left for a later slice.** F7's remaining identifiers belong to slices already closed.
Three stay open elsewhere for reasons this slice does not change: `F7-AC-16`'s fifth Landing claim
with F5 (STE-70); `F7-AC-10`'s sliding-window half and `F7-AC-11`'s deployed-project half as standing
hand-run checks; and `F7-AC-12`'s spend cap, which `NFR.criteria.md` deliberately keeps outside the
application (P7).

## Verification

**Automated.** Each name carries the circumstance as well as the claim (P16).

- `F7-AC-02, F7-AC-05, F7-UP-01: the response is returned before the provider send settles` — a send
  that never resolves. Restoring the `await` fails this by timeout.
- `F7-AC-02, F7-AC-05, F7-UP-01: an unknown address and a known one return the same bytes` — status,
  raw body and sorted header names, not parsed JSON.
- `F7-AC-06: a second request inside sixty seconds sends nothing`
- `F7-AC-06: a sixth request in an hour sends nothing, at five per address`
- `F7-AC-06: a sixth request from one source across six addresses sends nothing`
- `F7-AC-06: a caller cannot choose its own bucket by prepending to X-Forwarded-For`
- `F7-AC-06: A@X.com and a@x.com share one bucket`
- `F7-AC-06: the stored subject is a digest, never the address`
- `F7-AC-07, F7-UP-03: a throttled request returns the same bytes as an accepted one`
- Against the real migration through `freshDb()`: `F7-AC-06: a denied take does not advance the
  counter`; `…two concurrent takes at a limit of one allow exactly one`; `…the throttle function is
  not executable as anon or authenticated`.
- `F7-AC-09, F7-UP-02: five wrong attempts spend the code and the sixth never reaches the provider`
- `F7-AC-09, F7-UP-02: the sixth attempt is a distinct error, so the screen can say the code is spent`
- `F7-AC-09: a code that is actually sent clears the count` · `…a throttled request does not`
- `F7-AC-09: the count is kept for an address the provider does not know`
- `F7-AC-14: a confirm with no prior resolve neither stores nor reads FPL`
- `F7-AC-14: the token a resolve hands back confirms that identifier and no other`
- `F7-AC-14: a token minted for another user, or expired, is refused`
- `F7-UP-04: there is no route that creates an account`

**Manual.** Three, none of which a test can reach.

1. **`F7-AC-01`, `F7-AC-03`, `F7-UP-05` — the provider's own behaviour.** `pnpm check:rls-live`
   against dev and prod, extended: a signup attempt must be refused, and a password sign-in against a
   throwaway account must be refused. Live facts about Supabase, not facts about this repo.
2. **`F7-AC-06` — which end of `X-Forwarded-For` Railway writes.** Send the deployed app a request
   with the header set by hand and read what arrived. If Railway replaces rather than appends, both
   ends are the same value and nothing changes; the check is to know which.
3. **`F7-AC-07` — the limit is invisible on a real phone.** Request six codes in an hour. The sixth
   screen must be indistinguishable from the first, and no email arrives.

Nothing enters `docs/manual-coverage.md` until a check has run.

**Silent-failure items touching this slice (P7):** row-level security, through a new table and its
grants — closed by item 1 and by `tests/rls/isolation.test.ts`, which discovers the table from its
posture comment and fails if any of it is missing. The other four do not touch this slice.
