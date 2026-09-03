# ADR 0005 — Framework and rendering approach

- **Status:** Accepted, 2026-09-03
- **Deciders:** Stephen
- **Related:** ADR 0002 (deploy target), ADR 0004 (development and deploy workflow), STE-24, STE-30

## Context

CLAUDE.md's Stack section reads "Framework, rendering approach and data model: **TBD — STE-24**". STE-24
lands tomorrow. STE-30 — a live URL serving a skeleton, deployed from a merge to main — is today's work
and cannot scaffold without a framework.

**So this ADR decides the framework and the rendering approach, and nothing else.** It is one item lifted
out of STE-24 because one ticket is blocked on it, recorded in the Build Plan as the single sequencing
change. The data model, build sequencing and F7-core's rules stay in STE-24. What this ADR deliberately
does not decide is listed at the end, so that nothing arrives by implication.

### What the app is, because it decides the answer

Not a site. A single-user, invite-only, always-signed-in mobile app at one viewport, whose screens are
card stacks the manager swipes through (F3-AC-07), whose stat table freezes a column and sticks a header
row (F1-AC-16, F1-AC-17), and whose band filters recompute an entire After-squad and its totals in place
(F8-AC-25). The world — squad, calls, candidates, the week's shortlist — is held and re-derived while the
manager works, and NFR Performance requires that re-derivation be "local and immediate", with any non-AI
interaction inside 200 ms.

Against that, the things a server-rendering framework is for do not apply. There is no SEO surface: one
public screen, the Landing card (F7-AC-16), with no scroll and nothing to index. There is no concurrency
or growth target — NFR Scalability says so explicitly. There is no device matrix: portrait phone at
390×844. Every other screen is behind an auth gate that a stranger cannot pass and a sliding thirty-day
session (F7-AC-10) that means the manager is, in practice, always signed in.

### The requirements that actually bear on the choice

- **Keys are server-side only** — "never present in anything the browser downloads … not in a bundle, not
  in an environment variable exposed to the client, not in a network response" (NFR Security). The NFR
  itself notes this is the one security requirement no screen or flow expresses, so nothing else in the
  document can catch it being broken. It wants a structural guarantee, not a test.
- **Cold open to a responsive screen in ≤3 s**, "in practice the Thinking state"; **≤60 s p95** for a full
  advice generation, narrated with real progress and **cancellable throughout** (NFR Performance,
  F6-AC-17, F6-AC-18, F6-AC-19).
- **Client-held, instantly recomputed state**, per F3 and F8 above.
- **Railway runs a long-lived container** (ADR 0002), so there is no function timeout to design around and
  a 60-second streamed response is ordinary rather than exotic.
- **Seven days, most code agent-generated, loop speed the largest throughput determinant** (ADR 0004).

## Options

Three were taken seriously. Not shortlisted, each for one reason: **SvelteKit or SolidStart** — a far
smaller corpus for an agent to generate from, which is the opposite of what a seven-day agent-written
build wants; **Astro** — islands optimise a content site with sprinkles of interactivity, and this is an
app with one static card; **server-rendered templates with htmx** — every interaction becomes a server
round-trip, which the 200 ms local-recompute requirement forbids outright.

### A — Next.js App Router, self-hosted on Railway

The default, and the largest ecosystem. Server Components render the shell, route handlers carry the API,
`@supabase/ssr` is documented against it first.

Against it, specifically here: the App Router's grain is server-first data fetching with cached
revalidation, and this app's grain is a client that holds the world and recomputes it without asking. The
honest end state is `"use client"` on nearly every component that matters, which is Next.js paying its
costs — two rendering models, caching semantics, the server/client module boundary — while returning
almost none of its benefits. Its training corpus is also the most version-ambiguous in existence (Pages
vs App Router, three distinct caching regimes), which is a real defect generator when an agent writes the
code.

### B — Vite + React SPA, served by a small Hono API server, one Railway service

Client-rendered app; a separate Node process serves the built static assets and owns every route that
touches a secret, the model, or a feed. Two build outputs, one process, one service, one deploy.

The server/client boundary is a network boundary and two separate builds, so server code cannot reach the
browser bundle by accident. Client state is plain React with no framework grain to fight. The concept
surface an agent must get right is React plus HTTP.

Against it: the cold open is its weakest point — the browser downloads and boots a bundle before anything
data-shaped happens, where A and C could stream markup sooner. The public Landing card pays this too. And
it hand-rolls what a framework would supply: routing, the build wiring that serves static assets from the
API process, and the data-fetching layer.

### C — React Router 7 in framework mode (Remix's successor), SSR on Railway

One mental model — loaders and actions — with no RSC and no aggressive caching layer, and a long-lived
Node server is its native deployment rather than an adaptation.

Its loader/action grain is a server round-trip per navigation and per mutation. That is a good fit for a
document-shaped app and a poor one for swipe-decide-recompute, so much of the app opts out of the grain,
which is A's problem in a milder form. The Remix v2 → RR7 rebrand also leaves the corpus mixing two idiom
sets under one name — the same version-ambiguity risk as A, from a different cause.

### Where the three do not differ, which matters as much

Naming these stops a false argument being made later for any of them:

- **The Thinking state's streamed progress.** None of the three carries arbitrary progress events through
  its own streaming primitive. RSC streaming and loader streaming both stream *the framework's* payload;
  F6-AC-18's pipeline of steps with elapsed times is a hand-written SSE endpoint in all three.
- **Cancellation** (F6-AC-19, F6-AC-20). `AbortController` on the client, request-close on the server,
  identical everywhere.
- **Row-level security** (F7-AC-11). A database property. No framework enforces or weakens it.
- **Deployment to Railway**, TypeScript throughout, and Playwright for flows. Identical.

## Decision

**A client-rendered React single-page app built with Vite, served by a Hono API server running as one
Railway service — option B.**

Four reasons, in the order they carry weight:

1. **The secrets NFR gets a structural guarantee instead of a discipline.** With two builds, a key cannot
   reach the browser by an import mistake, because there is no import path from server to client. In A and
   C server and client code interleave in one module graph, and a leaked server import into client code is
   a documented enough failure that Next ships a `server-only` package to catch it. The NFR says nothing
   else in the document can catch this being broken; the architecture should therefore be what catches it.
2. **The app's state model is the client's.** F3's swipe decisions, F8's band filters recomputing After-
   squad totals, F3-UP-03's scenario validation over the accepted set — all of it must land inside 200 ms
   with no server in the path. B is the only option where that is the default rather than an opt-out.
3. **The concept surface is the smallest, and the corpus the least ambiguous.** With most code agent-
   generated over seven days, "plain React plus fetch" generates fewer defects than a framework whose
   idioms changed twice in its own training data. ADR 0004 already names loop speed as the largest
   determinant of throughput.
4. **SSR's benefits are inapplicable here** — no SEO, one public card, one user, everything else behind a
   gate. Paying SSR's complexity for them would be paying for nothing.

### On the cold open, which is the honest cost

A client-rendered app is slowest exactly where the 3 s budget is measured. Three things make it
acceptable rather than dismissed: the budget is to "a responsive screen", which NFR Performance itself
says is "in practice the Thinking state"; the app shell can paint before any data resolves; and the one
route where markup-first would genuinely help — the public Landing card — has no data to fetch at all. If
measurement says otherwise, the fix is the shell and the bundle, not the rendering model.

### Where the server sits

One Hono process serves the built assets and owns every route that touches something the browser must
never hold: the AI calls, the Fantasy Football IQ feed, the FPL feed reads, F7-AC-06's rate limiting
(which needs the source address), and F2's screenshot parse. The engine stays a framework-free TypeScript
module that this server imports and the client may also import — preserving CLAUDE.md's invariant that it
is headless and unit-tested before any UI exists.

## Consequences

- One Railway service, one deploy, one rollback — ADR 0004's "rollback is redeploying Railway's previous
  deployment" stays literally true.
- Every route that touches a secret is a visible HTTP endpoint, so the NFR's boundary can be read off the
  route list rather than inferred from a module graph.
- Routing, the data-fetching layer and the static-serving wiring are ours to write: **roughly 1.5–2 hours
  of day-one time, net.** Gross is 2–3 hours against `create-next-app` — the router, Hono's static serving
  and SPA fallback, the two-output build wiring, and a dev proxy so Vite reaches the API process. The
  data-fetching module is not in that figure, because the invariant above requires it under every option,
  Next included. It is quoted net rather than gross because self-hosting Next on Railway is not free
  either — standalone output and server/client boundary hygiene carry their own setup. **This is an
  estimate from the shape of the work, not a measurement**, and it is the one cost this ADR names and
  cannot evidence. If it overruns it will be on the build wiring and the dev proxy, since ESM/CJS
  mismatches and path aliases are where agent-generated code actually goes wrong.
- The client bundle is on the critical path of every cold open. **It is unmeasured and unenforced, and
  there is deliberately no budget** — a threshold invented before any measurement would be a number with
  no evidence behind it, which is a criterion without a mechanism and worse than saying nothing. What is
  true today: `vite build` prints gzipped chunk sizes on every build, so the figure is never invisible,
  and nothing fails on it. The first measurement is the STE-30 skeleton — the cheapest cold open the app
  will ever have, and therefore the right place to take a baseline against the 3 s budget. A number, and
  any check that enforces one, follows that measurement rather than preceding it.
- The server renders no user content, so it is never the place a session is read for rendering. What
  follows from that for session storage is **not settled here** — see below.

## What is expensive to reverse

1. **Client-rendered → server-rendered is a rewrite of every data path**, not a configuration change. This
   is the real weight of the decision. Partial mitigation: keep data fetching behind a thin module rather
   than calling `fetch` from components, so the swap has one place to happen.
2. **React is effectively permanent** once screens exist. Accepted: no shortlisted alternative had a
   better case, and the corpus argument runs the same way.
3. **The engine must stay framework-free** for the reversal in (1) to be survivable at all. It is already
   a CLAUDE.md invariant; this ADR raises the cost of breaking it.

Cheap to reverse, and therefore not laboured: serving static assets from the app container rather than a
CDN, and the choice of Hono over another minimal Node server.

## Deliberately not decided here

Named so that none of it arrives by implication. All of it is STE-24's unless stated:

- The data model, and the first migration's shape.
- **Session transport** — whether the browser holds a Supabase session directly, or talks only to our own
  API behind an httpOnly cookie. Client rendering permits both, so it is not forced by this decision and
  is not folded into it. **Decided at STE-24; required before slice 1.** It does not block STE-30, whose
  done-when is a live URL serving a skeleton — but it does block STE-51 (F7-core), which cannot be built
  without it. The deferral therefore carries a deadline, not just an owner.
- Client state and data-fetching libraries; the router.
- Styling. The Design System is colour tokens, a type scale, button rules, radii, shadows and widget
  anatomy for one device, and it is framework-agnostic — nothing in it picks or excludes any option above.
  Its handling is STE-74.
- Whether the app is installed to the home screen as a PWA, and any offline shell that would imply.
- Repository layout and the package boundary around the engine.
