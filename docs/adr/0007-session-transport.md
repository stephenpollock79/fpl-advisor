# ADR 0007 — Session transport

- **Status:** Accepted, 2026-09-08
- **Deciders:** Stephen
- **Related:** ADR 0005 (framework and rendering approach), ADR 0004, STE-24, STE-29, STE-51, F7-AC-10, F7-AC-11, F7-AC-24
- **Spec:** `docs/specs/architecture.md` § Access and session

## Context

ADR 0005 named this as deliberately undecided and gave the deferral a deadline rather than only an
owner: **decided at STE-24, required before slice 1.** Slice 1 is F7-core, and it cannot be built
without an answer, because the answer decides what the first migration protects and who the
database thinks is asking.

The question is narrow. The browser has to prove who it is on every request. Either it holds a
Supabase session directly — the provider's tokens, in the browser, with the client talking to
PostgREST — or it holds nothing but an opaque cookie our own server issued, and every read goes
through the Hono API.

Three facts constrain it, and none of them were available when ADR 0005 was written:

1. **The thirty-day sliding window is a paid feature at the provider.** Supabase's *Inactivity
   timeout* is a Pro setting, set to 720 hours on both projects (STE-29). Pro is funded by a $300
   credit with no payment method behind it — roughly eight to nine months at ~$35/month. If the
   browser holds a Supabase session, **F7-AC-10 stops being true the month that credit lapses**,
   and nothing in the app changes to say so. If the window is ours, a downgrade to Free costs
   nothing.
2. **Automatic RLS is on** (STE-29), so every new table in `public` has row-level security enabled
   whether or not it has a policy. A table read with the service key ignores all of it.
3. **The server already exists and already owns the secrets.** ADR 0005 put the AI calls, both
   feeds, rate limiting and the screenshot parse behind the Hono API for reasons unrelated to
   sessions. There is no route left that the browser would usefully call the database for.

## Decision

**The browser holds one opaque, `httpOnly` session cookie issued by our own server, and never a
Supabase token. Every read and write goes through the Hono API.**

Mechanically:

- Supabase Auth is used to **verify** the six-digit code (F7-AC-03) and owns identity in
  `auth.users`. That is the whole of its role in the browser's life.
- On a verified code the server creates a row in `app_session`, keyed by a random opaque id, and
  sets it as a `httpOnly; Secure; SameSite=Lax` cookie. The row holds the Supabase refresh token —
  server-side, never sent to the browser.
- **The sliding window is ours.** `expires_at` is pushed thirty days out on each authenticated
  request (F7-AC-10). Log out (F7-AC-24) revokes the row, so a session ends on the server rather
  than on the client's word.
- **User data is read with the signed-in user's access token, never the service key.** The server
  exchanges the stored refresh token for a short-lived user access token and creates a per-request
  Supabase client with it. Reference data — fixtures, projections, the feed cache — is read with
  the service key.

That last rule is the load-bearing one and is stated again in the spec, because it is what keeps
F7-AC-11 a mechanism instead of a decoration. Row-level security cannot protect anything from a
connection that bypasses it. A server that reads user data with the service key satisfies every
test that asserts the policies exist while providing none of the isolation those policies are for
— the failure is invisible, which puts it squarely in the class G7 exists for.

## Consequences

- **F7-AC-10 survives a downgrade to the Free plan.** The provider's inactivity setting stops
  being load-bearing; it becomes a backstop behind our own window.
- **No `supabase-js` in the client bundle.** ADR 0005 named the cold open as its honest cost and
  the bundle as the thing to fix if measurement says so; this removes a dependency from the one
  path that is on every cold open.
- **The session is revocable and inspectable**, because it is a row. F7-AC-24's "the session can be
  ended" is a `UPDATE … SET revoked_at`, not a hope that the client cleared storage.
- **`app_session` is a service-role table with no policy**, and holds a provider refresh token. It
  is never reachable as `anon` or `authenticated`. Same treatment as `auth_throttle`.
- **One more thing to build than the alternative:** the cookie, the session table, the token
  exchange, and the middleware that slides the window. Roughly an hour, inside slice 1, and it
  replaces wiring the Supabase client into the browser rather than adding to it.
- **`SameSite=Lax` is sufficient and CSRF needs no separate token**, because ADR 0006 makes the
  client same-origin with the API and there is no cross-site form post that could reach it. If a
  separate origin is ever introduced, this stops being true — it is recorded here so the
  consequence travels with the decision rather than being rediscovered.
- The Data API stays enabled at the provider (STE-29). Nothing in the app uses it now; disabling it
  is a settings change and is not worth a migration.

## What is expensive to reverse

Little. The browser holding a Supabase session is a smaller app than this one, so moving to it later
means deleting the session table and the middleware, not rewriting data paths. **This is the cheap
direction to be wrong in**, which is part of why it was chosen over the option whose failure mode is
a requirement quietly ceasing to be true eight months from now.
