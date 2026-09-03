# ADR 0006 — Repo layout and the engine boundary

- **Status:** Accepted, 2026-09-03
- **Deciders:** Stephen
- **Related:** ADR 0005 (framework and rendering approach), STE-24, STE-30

## Context

ADR 0005 listed repo layout and the engine package boundary as deliberately undecided. The walking
skeleton is where they get settled, because a scaffold cannot avoid choosing them.

CLAUDE.md carries the **rule**, because it is loaded every session and that is where enforcement happens.
This ADR carries the **reasoning**, because "why pnpm" is exactly the question a future session
re-litigates from scratch if the answer exists only in a diff. It is scoped to layout and the boundary,
with the four scaffold decisions as consequences. It is not a second architecture essay.

## Decision

**pnpm workspaces, three packages: `packages/engine`, `apps/client`, `apps/server`.** The engine is
consumed as TypeScript source by both apps.

### Why the boundary needs two levers, not one

CLAUDE.md's existing invariant says the engine is headless and framework-free. That was a convention.
Two mechanisms make it a property of the build, and neither is sufficient alone:

**Lever 1 — the engine is granted neither runtime's type surface.** `"lib": ["ES2022"]` with `"types":
[]`. `window`, `document`, `process` and `fs` are compile errors inside `packages/engine`. `types: []`
matters as much as `lib`: without it, `@types/node` present anywhere in the workspace re-admits the Node
globals through ambient types.

**Lever 2 — the engine declares no dependencies of any kind, and pnpm makes that binding.** Lever 1 stops
the engine reaching a *runtime*; it does not stop `import React from 'react'`, which needs no global and
would typecheck happily. Lever 2 covers that case. It only works under pnpm: npm's flat `node_modules`
would let an undeclared import resolve from the hoisted root, leaving the declaration advisory. pnpm's
non-flat layout makes it unresolvable. **This is the whole reason for the extra tool** — it converts a
declaration into a mechanism.

Both levers are asserted in `tests/engine-package-boundary.test.ts`, in the idiom CLAUDE.md already
mandates for row-level security: asserted rather than trusted. The test lives at the workspace root rather
than inside the engine, because reading a manifest needs `node:fs` and the engine has no Node types — the
test that enforces a constraint cannot live inside it.

## Consequences

- **The engine is consumed as source**, not as a build artifact (`exports` points at `./src/index.ts`;
  the server bundles it via tsup). There is no intermediate build to go stale between the engine and its
  two consumers — a bug class where tests pass against one version and the app runs another, with nothing
  visibly wrong. We will never publish it, so the usual reason to build it does not apply.
- **The engine needs no devDependencies either**, because Vitest runs from the workspace root. That makes
  the assertion in lever 2 total rather than qualified.
- **ESM everywhere** — `"type": "module"` in all four manifests. ADR 0005 named ESM/CJS mismatches as
  where its wiring estimate would overrun; one module system, chosen once, is the mitigation.
- **The client calls same-origin `/api/*` everywhere**, made true in development by Vite's proxy rather
  than by a base-URL variable. No build carries an API origin and CORS never arises. See the amendment
  below for what this costs.
- **pnpm is pinned via `packageManager`** and run through Corepack. `pnpm.onlyBuiltDependencies` lists
  esbuild, because pnpm 10 blocks lifecycle scripts by default and esbuild needs its postinstall to fetch
  a platform binary — checked in rather than approved interactively, so a fresh clone and CI behave alike.

## Amendment to ADR 0005

ADR 0005's "cheap to reverse" list says serving static assets from the app container rather than a CDN is
cheap to reverse. **Same-origin `/api/*` makes that less cheap**: moving the client to a separate origin
now means introducing an API base URL and CORS, not just changing where files are served from.

The trade is accepted rather than overlooked. NFR Scalability states there is no load, concurrency or
growth target and that serving more people would be a rewrite — so the CDN is never coming, and paying a
permanent configuration cost to keep a door open onto a room we will not enter is the worse deal. ADR 0005
has been amended in place to say so, rather than left to contradict the code.
