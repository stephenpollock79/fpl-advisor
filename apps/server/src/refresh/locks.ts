/**
 * What a refresh keeps, what it suppresses, and what it throws away.
 *
 * The governing principle, from F6's happy path: **his decisions are locks;
 * everything unlocked is regenerated.**
 *
 * - Selected becomes a *constraint*, not a suggestion (F6-AC-01). Its cash and
 *   its free transfer are already spent and its player is part of the squad.
 * - Rejected returns at the next refresh, labelled (F6-AC-03, as ruled
 *   2026-09-14 — see `suppressed` below).
 * - Pending is discarded and rewritten freely (F6-AC-04).
 * - **A forced call ignores suppression outright** (F6-AC-05). If a starter
 *   becomes unavailable that call must surface, whatever was said about it
 *   earlier — an injury is not a matter of opinion (F6-RS-11).
 */

import { callKey } from '@fpl/engine'

export type DecisionState = 'selected' | 'rejected'

/** A stored call, reduced to what resolving a lock needs. */
export type LockableCall = {
  key: string
  category: 'transfer' | 'substitution' | 'captaincy'
  outPlayerId: number
  inPlayerId: number
  costTenths: number
  alternatives: { out: number[]; in: number[] } | null
}

export type Committed = {
  key: string
  outPlayerId: number
  inPlayerId: number
  costTenths: number
  isTransfer: boolean
}

/**
 * The pair a decision actually committed to.
 *
 * On a transfer card the manager may swap in a different candidate, and his
 * decision is filed under *that* pair's key — a key no stored call carries
 * (F3-AC-24, slice 5's hand-forward). So the next run has to treat the swapped
 * pair as committed, not the pair originally proposed.
 *
 * **Keys are built here, never parsed.** The format lives in one place, in the
 * engine, and a parser here would be a second copy of it that goes wrong
 * silently the first time the format moves.
 */
export function committedPairs(
  calls: readonly LockableCall[],
  decisions: Readonly<Record<string, DecisionState>>,
  costOfSwap: (outId: number, inId: number) => number,
): Committed[] {
  const out: Committed[] = []

  for (const call of calls) {
    const isTransfer = call.category === 'transfer'

    if (decisions[call.key] === 'selected') {
      out.push({ key: call.key, outPlayerId: call.outPlayerId, inPlayerId: call.inPlayerId, costTenths: call.costTenths, isTransfer })
      continue
    }
    if (!isTransfer || !call.alternatives) continue

    for (const outId of [call.outPlayerId, ...call.alternatives.out]) {
      for (const inId of [call.inPlayerId, ...call.alternatives.in]) {
        const key = callKey({ type: 'transfer', outPlayerId: outId, inPlayerId: inId })
        if (key === call.key || decisions[key] !== 'selected') continue
        out.push({ key, outPlayerId: outId, inPlayerId: inId, costTenths: costOfSwap(outId, inId), isTransfer: true })
      }
    }
  }

  return out
}

/**
 * What a rejection does to the next refresh.
 *
 * **Only a selected call is a lock** (ruled 2026-09-14, STE-128). A rejected one
 * comes back at the next refresh, labelled, rather than being held out of it.
 *
 * It used to hold until the evidence diff touched a player the call names. That
 * test could not do its job: the diff reads FPL's player records, and a call's
 * premise is mostly the projections, for which no previous value is stored
 * (see `refresh/evidence.ts`). So `changedPlayers` was empty in exactly the weeks
 * the numbers had moved most, and a rejected call stayed rejected all gameweek
 * however far its premise had travelled. A substitution worth +0.8 sat behind a
 * "you have the strongest side" for a day.
 *
 * **The labelling is what makes this safe rather than noisy.** A returning call
 * is tagged *RESURFACED* on its own card (F6-AC-13), so it reads as something
 * being put back in front of him — never as the app quietly forgetting he said
 * no.
 *
 * `changedPlayers` is still taken, and still decides nothing here. It is what a
 * per-run projection baseline would restore the old rule on top of, and dropping
 * the parameter would hide that this rule is a consequence of missing data
 * rather than a preference.
 */
export function suppressed(
  calls: readonly LockableCall[],
  decisions: Readonly<Record<string, DecisionState>>,
  _changedPlayers: ReadonlySet<number>,
): { keys: Set<string>; returning: Set<string> } {
  const returning = new Set<string>()

  for (const call of calls) {
    if (decisions[call.key] === 'rejected') returning.add(call.key)
  }

  return { keys: new Set<string>(), returning }
}

/**
 * F6-AC-05. Applied after suppression, never folded into it — a forced call and
 * a suppressed one are different states, and a build that merged them would
 * silently lose the exception the first time both were true.
 */
export const surfacesAnyway = (isForced: boolean): boolean => isForced
