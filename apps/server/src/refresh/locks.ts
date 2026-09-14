/**
 * What a refresh keeps, what it suppresses, and what it throws away.
 *
 * The governing principle, from F6's happy path: **his decisions are locks;
 * everything unlocked is regenerated.**
 *
 * - Selected becomes a *constraint*, not a suggestion (F6-AC-01). Its cash and
 *   its free transfer are already spent and its player is part of the squad.
 * - Rejected stays out until its own figures move materially, and returns
 *   labelled when they do (F6-AC-03, F6-AC-06).
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
 * **Only a selected call is a lock. A rejected one stays out until the thing he
 * rejected is no longer the thing in front of him** (ruled 2026-09-14, STE-130).
 * Then it returns, labelled.
 *
 * *Materially changed* is not a fresh judgement — F6-AC-06 already defines it
 * for the diff report, and this uses the same definition and the same code: the
 * call's conviction band crosses a boundary, or the call can no longer be
 * executed. `movedKeys` is that verdict, from `refresh/recompute.ts`.
 *
 * **The baseline is the call's own stored band, which is why this works at all.**
 * Two earlier versions of this rule failed on the same missing data. The first
 * asked whether the evidence diff had touched a player the call names — and that
 * diff reads FPL's player records, never the projections, so it answered "no" in
 * exactly the weeks the numbers had moved most. The second gave up and let
 * everything return, which nags until the reject action means nothing. Neither
 * needed a projection history: every stored call already carries the figure it
 * was rejected at.
 *
 * A returning call is tagged *RESURFACED* on its own card (F6-AC-13), so it
 * always says why it is back.
 */
export function suppressed(
  calls: readonly LockableCall[],
  decisions: Readonly<Record<string, DecisionState>>,
  movedKeys: ReadonlySet<string>,
): { keys: Set<string>; returning: Set<string> } {
  const keys = new Set<string>()
  const returning = new Set<string>()

  for (const call of calls) {
    if (decisions[call.key] !== 'rejected') continue
    if (movedKeys.has(call.key)) returning.add(call.key)
    else keys.add(call.key)
  }

  return { keys, returning }
}

/**
 * F6-AC-05. Applied after suppression, never folded into it — a forced call and
 * a suppressed one are different states, and a build that merged them would
 * silently lose the exception the first time both were true.
 */
export const surfacesAnyway = (isForced: boolean): boolean => isForced
