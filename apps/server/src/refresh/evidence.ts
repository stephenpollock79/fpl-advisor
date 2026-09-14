/**
 * What moved since the last successful run (F6-RS-02).
 *
 * **Pure, and deliberately so.** Two records in, a verdict out — no clock, no
 * network, no database. None of the cases this has to get right can be observed
 * in a single week of a season, so every one of them is fabricated in the tests;
 * a seam that needed a live feed to exercise would be a seam that is never
 * exercised.
 *
 * **The diff runs over every player FPL tracks, not only those already in a
 * call** (F6-RS-05). A player whose injury kept him off the table has no call to
 * diff against, and the absence of a call is precisely the problem: if his
 * status improves he has to be able to surface as a brand-new candidate.
 */

import { type AvailabilityVerdict, availabilityOf } from '@fpl/engine'
import type { FplStatus } from '@fpl/engine'

/** One player's FPL record, as at one feed read. The fields F6-RS-02 names. */
export type EvidenceRow = {
  playerId: number
  status: FplStatus
  news: string | null
  newsAdded: string | null
  chanceOfPlayingNextRound: number | null
  nowCostTenths: number
}

export type PlayerChange = {
  playerId: number
  /** The fields that differ, for the diff sheet to name. */
  fields: readonly ('status' | 'news' | 'chance' | 'price')[]
  before: AvailabilityVerdict
  after: AvailabilityVerdict
  /**
   * He crossed into or out of the availability gate. **This is the only thing
   * that opens the offer gate** — see `worthPaying` below.
   */
  crossedGate: boolean
}

export type Evidence = {
  changed: readonly PlayerChange[]
  /** Any change at all, however small (F6-RS-04). */
  anyChange: boolean
  /**
   * A change that could alter a decision.
   *
   * **This no longer gates the run** (STE-128, 2026-09-14). It once did, and the
   * gate was unsound: this diff sees FPL's player records only, and a call also
   * rests on the projections, for which no previous value is stored. `false`
   * here means *nothing FPL publishes about a player moved* — never *nothing
   * behind the advice moved*. Kept because it is the honest name for what the
   * diff can actually tell, and it is what a per-run projection baseline would
   * plug into.
   */
  worthPaying: boolean
}

const gateOf = (row: EvidenceRow): AvailabilityVerdict =>
  availabilityOf({ status: row.status, chanceOfPlayingNextRound: row.chanceOfPlayingNextRound })

/**
 * **FPL's daily price-change forecast is not in `EvidenceRow` at all, and that
 * is the ruling rather than an omission** (2026-09-14, STE-65).
 *
 * The forecast moves every single day. It enters no figure on any card — it only
 * decides whether a small WATCH label shows (F3-AC-18) — so it cannot change what
 * the advice *is*. Counted as evidence it would offer a paid regeneration on
 * nearly every open, and a prompt that fires every time is dismissed every time,
 * taking the prompt that matters with it. The price itself is still here, because
 * a price move can make a plan unaffordable.
 */
export function diffEvidence(
  before: readonly EvidenceRow[],
  after: readonly EvidenceRow[],
): Evidence {
  const was = new Map(before.map((r) => [r.playerId, r]))
  const changed: PlayerChange[] = []

  for (const now of after) {
    const then = was.get(now.playerId)
    // A player FPL has only just started tracking is new evidence about a player
    // who could not previously be recommended at all.
    const fields: PlayerChange['fields'][number][] = []
    if (!then) {
      fields.push('status')
    } else {
      if (then.status !== now.status) fields.push('status')
      if (then.news !== now.news || then.newsAdded !== now.newsAdded) fields.push('news')
      if (then.chanceOfPlayingNextRound !== now.chanceOfPlayingNextRound) fields.push('chance')
      if (then.nowCostTenths !== now.nowCostTenths) fields.push('price')
    }
    if (fields.length === 0) continue

    const beforeGate: AvailabilityVerdict = then ? gateOf(then) : { eligible: false, reason: 'not_in_squad' }
    const afterGate = gateOf(now)
    changed.push({
      playerId: now.playerId,
      fields,
      before: beforeGate,
      after: afterGate,
      crossedGate: beforeGate.eligible !== afterGate.eligible,
    })
  }

  changed.sort((a, b) => a.playerId - b.playerId)

  return {
    changed,
    anyChange: changed.length > 0,
    // Materiality for the *offer*, ruled 2026-09-10: a player moving into or out
    // of exclusion. FPL's news field churns — percentages move 75 to 100, return
    // dates shift a day — and firing on that trains dismissal within a week.
    worthPaying: changed.some((c) => c.crossedGate),
  }
}
