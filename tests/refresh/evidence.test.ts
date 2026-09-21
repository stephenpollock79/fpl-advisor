/**
 * What counts as the world having moved (F6-RS-02, F6-RS-04, F6-RS-05).
 *
 * Every case here is fabricated, and that is the point: blanks, doubles,
 * suspensions and returns cannot be observed in one week of a season, so a diff
 * that could only be exercised against a live feed would never be exercised.
 */

import { describe, expect, it } from 'vitest'
import { type EvidenceRow, diffEvidence } from '../../apps/server/src/refresh/evidence.js'

const row = (playerId: number, extra: Partial<EvidenceRow> = {}): EvidenceRow => ({
  playerId,
  status: 'a',
  news: null,
  newsAdded: null,
  chanceOfPlayingNextRound: null,
  nowCostTenths: 50,
  ...extra,
})

describe('F6-RS-02, F6-RS-04 · what counts as new evidence', () => {
  it('F6-RS-04: nothing moving is a legitimate nothing-changed outcome, not a failure', () => {
    const world = [row(1), row(2), row(3)]
    const evidence = diffEvidence(world, world)

    expect(evidence.anyChange).toBe(false)
    expect(evidence.worthPaying).toBe(false)
    expect(evidence.changed).toHaveLength(0)
  })

  /**
   * **This is also the whole of `F6-RS-03`'s testable claim** (named here
   * 2026-09-21, STE-192). That criterion says team news reaches the app through
   * FPL's own published fields — the status code, the news line and its
   * timestamp, and the chance-of-playing figure — diffed since the last
   * successful run like any other input. Rows 1, 2 and 3 below are exactly
   * those three, each moved on its own. Its other two sentences are not
   * testable: *"the sites are not read"* is a negative, and nothing can test
   * the absence of a fetch that was never written.
   *
   * **Counting is not the same as paying, and conflating them is the trap.**
   * A first attempt at covering `F6-RS-03` asserted that a news line moving
   * makes a run *spend* — which the product deliberately does not do, and which
   * `tests/runs/routes.test.ts` asserts the opposite of: churn below the
   * availability gate is counted and not paid for (`F6-RS-08`, `F6-AC-11`).
   * Only a change crossing that gate is worth a model call, and `F6-RS-11`
   * covers that. **`F6-RS-03` is about the diff, and the diff is here.**
   */
  it('F6-RS-02, F6-RS-03: each of the four fields counts on its own', () => {
    const before = [row(1), row(2), row(3), row(4)]
    const after = [
      row(1, { status: 'i' }),
      row(2, { news: 'Knock — assessed', newsAdded: '2026-09-14T09:00:00Z' }),
      row(3, { chanceOfPlayingNextRound: 75 }),
      row(4, { nowCostTenths: 51 }),
    ]
    const evidence = diffEvidence(before, after)

    expect(evidence.changed.map((c) => c.fields.join())).toEqual(['status', 'news', 'chance', 'price'])
  })

  it('F6-RS-04: any change counts, with no magnitude threshold', () => {
    const evidence = diffEvidence([row(1)], [row(1, { nowCostTenths: 51 })])
    expect(evidence.anyChange).toBe(true)
  })

  it('F6-RS-05: a player who was never in a call is diffed like any other, and can surface', () => {
    // Out for months, so no call has ever named him. His suspension ending is
    // the more important change precisely because nothing mentions him.
    const before = [row(9, { status: 's' })]
    const after = [row(9, { status: 'a' })]
    const evidence = diffEvidence(before, after)

    expect(evidence.changed[0]?.playerId).toBe(9)
    expect(evidence.changed[0]?.crossedGate).toBe(true)
    expect(evidence.worthPaying).toBe(true)
  })

  it('F6-RS-05: a player FPL has only just started tracking is new evidence, not a crash', () => {
    const evidence = diffEvidence([], [row(77)])
    expect(evidence.changed[0]?.playerId).toBe(77)
    expect(evidence.changed[0]?.crossedGate).toBe(true)
  })

  it('the result is the same on every run, whatever order the feed lists players in', () => {
    const before = [row(1), row(2)]
    const a = diffEvidence(before, [row(2, { status: 'i' }), row(1, { status: 'i' })])
    const b = diffEvidence(before, [row(1, { status: 'i' }), row(2, { status: 'i' })])

    expect(a.changed.map((c) => c.playerId)).toEqual(b.changed.map((c) => c.playerId))
  })
})

describe('F6-RS-02, F6-RS-04 · what the diff counts, and what it calls decision-changing', () => {
  it('F6-RS-04: ordinary churn in the news field is counted, but does not cross the availability gate', () => {
    // FPL edits this text constantly; percentages move 75 to 100 and return
    // dates shift by a day. A prompt that fires on everything is dismissed on
    // everything, and takes the prompt that matters with it.
    const before = [row(1, { status: 'd', chanceOfPlayingNextRound: 75, news: 'Knock' })]
    const after = [row(1, { status: 'd', chanceOfPlayingNextRound: 100, news: 'Knock — expected to feature' })]
    const evidence = diffEvidence(before, after)

    expect(evidence.anyChange).toBe(true)
    expect(evidence.worthPaying).toBe(false)
  })

  it('F6-RS-11: dropping out of availability is worth paying for, whatever anyone would have concluded', () => {
    const evidence = diffEvidence([row(1)], [row(1, { status: 'i' })])
    expect(evidence.worthPaying).toBe(true)
  })

  it('F6-RS-04: a price move alone does not cross the availability gate, and is still recorded', () => {
    const evidence = diffEvidence([row(1)], [row(1, { nowCostTenths: 55 })])
    expect(evidence.worthPaying).toBe(false)
    expect(evidence.changed[0]?.fields).toEqual(['price'])
  })

  it("F6-RS-02: FPL's daily price forecast is not evidence at all — it is not a field this reads", () => {
    // Ruled 2026-09-14. The forecast changes every day and enters no figure on
    // any card, so counting it would put a spend prompt on nearly every open.
    // Proven by construction: there is nowhere to put one.
    const keys = Object.keys(row(1))
    expect(keys).not.toContain('priceChangeLikelihoodTonight')
    expect(keys.some((k) => /forecast|likelihood/i.test(k))).toBe(false)
  })
})
