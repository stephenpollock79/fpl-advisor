# Slice 6 — F4 Captain and vice-captain calls

Build **STE-64** · no test ticket, the manual checklist lives in the build ticket · Monday 14 September · reads `docs/criteria/F4.criteria.md` and `ENGINE.criteria.md`, with `NFR.criteria.md` throughout. Rulings of 14 September are on STE-64.

## Seams

**One seam, and it already exists.** Plan generation stays pure — world in, calls out, under `apps/server/src/calls/plan.ts`. The armband pair is built there, after the transfer and substitution search settles, and is tested where slice 5's traps are.

**The engine is not touched.** `chooseArmband`, the ceiling tie-break, `evaluateCall` at k = 0.5 and the card helpers are built and covered. No dependency, no widened `lib`, no `types` (ADR 0006).

**Two storage changes, both checked against the hard-to-undo gate.**

`call.is_reading` is **recorded, not new** — §4.1 of `docs/specs/architecture.md` specifies it. Storing a keep forces `conviction` and `band` nullable and conditions the `net >= 0` check: the ceiling tie-break can put up a challenger 0.125 points *below* the incumbent, and an incumbent inside that floor still keeps — with a negative net. **§4.1 calls `net` "non-negative by construction", and that becomes false.** It is corrected in the same change; a schema and a document disagreeing is the failure this repo designs against.

`player_state.penalties_order` is an additive nullable column on a reference table — no policy, posture or grant change.

**No other boundary is crossed.** `apps/client/src/api.ts` stays the client's only data path; user data is read as the signed-in user; the build split is unchanged.

**No blocking edges.** Slice 5 has landed; §8.1–§8.3 are closed, and §8.4 (STE-110) is the free-transfer count, which F4 does not read. Three decisions that were Stephen's were ruled before this spec was written: which call claims a contested player, what *takes penalties* means, and whether the armband pair is bound by F3-UP-04.

## Modules

- `supabase/migrations/<ts>_f4_captaincy.sql` — `call.is_reading`, `call.reading_reason`, nullable `conviction` and `band`; `player_state.penalties_order`.
- `docs/specs/architecture.md` §4.1 — the `net` invariant corrected, `reading_reason` added.
- `apps/server/src/ingest/players.ts` — `penalties_order` into `PlayerStateRow`.
- `apps/server/src/calls/plan.ts` — `SquadEntry.isCaptain` / `isVice`; the armband block.
- `apps/server/src/calls/keep-line.ts` — the keep reading's sentence.
- `apps/server/src/runs/load.ts` — select `is_captain`, `is_vice`, `penalties_order`.
- `apps/server/src/runs/generate.ts`, `wire.ts` — readings, and the breakdown's two new fields.
- `apps/server/src/world/assemble.ts`, `world/load.ts`, `apps/client/src/api.ts` — the widened call.
- `apps/client/src/calls/view.ts` — a stored reading; the two fixed sentences; F4-UP-02.
- `apps/client/src/screens/Assistant/` — third tab, two shapes, the inert panel, `Assistant.module.css`.
- `tests/calls/`, `tests/runs/`, `tests/world/`, `tests/client/`, `tests/e2e/assistant.spec.ts`.

## Interfaces

**The pair.** Candidates are the **current starting eleven**, minus gate exclusions and minus any player a transfer or substitution already claims — those settle first (ruled 14 September). **Within the pair, F3-UP-04 does not apply** (ruled 14 September): promoting the vice to captain and naming a new vice is one armband decision shown as two cards, with nothing to double-count. Fewer than two eligible candidates returns **no captaincy calls** rather than letting `chooseArmband` throw and cost the week its transfer advice.

**The challenger is never the incumbent.** Where `chooseArmband` returns the current holder, the card puts him against the **next-best eligible candidate** and reads as a keep. Otherwise the ordinary week renders a player against himself, tying every row.

**Forcing.** `incumbentUnplayable` comes from `isUnplayable` in `calls/legal-xi.ts`, the substitution path's own predicate (F4-AC-07, #85). Never forced while the holder can play (F4-AC-08). Both sides use the existing `side(p, 1)`, so a blanking club contributes zero (F4-UP-01).

**The tie-break's data source.** `takesPenalties` is FPL's `penalties_order === 1` — first-choice takers, roughly twenty players, not the sixty listed anywhere in the order (ruled 14 September). The window is the noise floor in points, `k ÷ 4` = **0.125**, derived by the engine and never quoted.

**On the wire.** `Call` gains `isReading` and `readingReason` (`incumbent_wins` / `below_floor` / null); `conviction` and `band` go nullable **on a reading and nowhere else**; `category` gains `captaincy`, `shape` gains `captain` and `vice`. `breakdown` gains `kLabel` (F4-AC-11) and `byCeiling` (F4-AC-12). A reading's `k` is resolved once, at generation.

**Reasoning.** A reading **never goes through the model**: it has no strength or band for the prompt, and the engine's template phrases every line as *"X over Y"*, which on a keep says the opposite of the advice. `keep-line.ts` writes it from the same rows and stores as `reasoning_source: 'template'`. A decidable armband call keeps the existing path (F3-AC-22).

**The two fixed sentences** — the vice premise (F4-AC-05) and the tie-break (F4-AC-12) — are **derived on the client** from `shape` and `breakdown.byCeiling` and rendered inside the reasoning block. No column and no model call: the blocklist bans `penalt`, `chance`, `likel` and `probab`, exactly what both need.

**Card.** Head to head unchanged, master rows unchanged (F4-AC-04), no picker (F4-AC-06), cost `£0.00` (F4-AC-09). **The Captain tab always shows both cards**, readings included — that is F4-AC-01. A reading is steppable but not decidable: the tiles become a non-interactive *no change · nothing to do* label **and the swipe handlers are suppressed**, since hiding only the tiles leaves a swipe that files a decision. Readings enter no tally, count or shortlist, and *Category cleared* does not replace them. Rejecting the captain call renders the vice call as a reading whose recommended vice is the kept captain, derived in `calls/` (F4-UP-02).

## Criteria in scope

**In scope — 12.** `F4-AC-01`, `F4-AC-02`, `F4-AC-04` – `F4-AC-12`, `F4-UP-01`, `F4-UP-02`. Engine: `ENGINE-AC-04` and `ENGINE-AC-05` on a third surface, and `ENGINE-AC-06`'s armband half reaching a caller at last.

**Partial — 1.** `F4-AC-03`. The tally half is here: a reading enters no count. The group meta — *"1 pick · 1 held"* — is `F8-AC-27`'s sentence for the Overview's Captain group; building it into a third of a 390px tab strip now would give one sentence two owners. It goes to slice 8 with the editorial half, on STE-66.

**Three are already counted covered, and false in the half that matters.** `F4-AC-01`, `F4-AC-02` and `F4-AC-03` are named by `tests/engine/armband.test.ts` and `floor.test.ts`, which prove the arithmetic. Each is a statement about a **card**, and no card exists. Surface tests naming all three are in scope; until they pass, the figure overstates F4 by three.

## Verification

**Automated**, named per ADR 0010:

```ts
it('F4-AC-01, F4-AC-10: two calls every week, keeps included, challenger never the incumbent', …)
it('F4-AC-07, F4-AC-08: forced when the holder cannot score, and never otherwise', …)
it('F3-UP-04: captaincy claims no player another call holds; the pair may share one', …)
it('F4-AC-12: penalties_order 1 is the signal, and only inside the floor', …)
it('F4-AC-02, F4-AC-03: a reading resists tile and swipe, and enters no tally', …)
it('F4-AC-05, F4-AC-11: the vice premise and the k label, without a model call', …)
it('F4-UP-01, F4-UP-02: a blank holder; the vice held when the captain is rejected', …)
```

**Five existing tests move with the design rather than being silenced.** `plan.test.ts`'s global F3-UP-04 assertion narrows; `runs/generate.test.ts` and `runs/routes.test.ts` assert model-written reasoning on every call, false once readings skip it; `world/calls.test.ts` and `client/calls.test.ts` build literals that stop compiling. `rls/isolation.test.ts` is unaffected. In `TABS`, captaincy sits **after** substitution or `F3-AC-07`'s e2e flow changes. **The new CHECK is mutually exclusive** — a reading may not carry a conviction, the state F4-AC-02 forbids.

**Manual checklist, 390×844** (on STE-64):

1. Read the keep card as a stranger would: does it say *nothing to do*, or look broken?
2. Swipe a keep reading all three ways. Nothing may happen — no assertion can check this, and it is the likeliest thing to be wrong.
3. The tie-break sentence appears only when the tie-break fired.
4. Strength never reads as a chance on a captaincy card (`ENGINE-AC-05`).

Nothing enters `docs/manual-coverage.md` until a check has run.

**Silent-failure items Stephen verifies (P7).** `is_next` — an armband decided against last week's fixtures looks entirely normal; a blanking holder is forced rather than re-scored, and the blank is logged; the **spend cap**, read off the Anthropic console. Row-level security is **not** on the list: both migrations only add columns, so no new policy exists to check and a live run would falsely read as verification.
