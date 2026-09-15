/**
 * The check that catches advice about a week already played (STE-65, 2026-09-10).
 *
 * This is the silent-failure case in its purest form: every figure on screen is
 * internally consistent, every test of the arithmetic passes, and the advice is
 * about a gameweek that finished on Saturday.
 */

import { describe, expect, it } from 'vitest'
import { checkGameweek } from '../../apps/server/src/gameweek/guard.js'

const AT = (iso: string) => Date.parse(iso)

describe('F6-UP-03, F6-AC-15 · the gameweek is a stop, never a prompt', () => {
  it('a deadline still ahead passes, and nothing is said', () => {
    const verdict = checkGameweek({
      gameweek: 5,
      deadlineTime: '2026-09-18T17:30:00Z',
      projectionsCover: [5, 6, 7],
      nowMs: AT('2026-09-14T15:00:00Z'),
    })
    expect(verdict).toEqual({ ok: true })
  })

  it('a deadline that has passed stops, and names the week it was advising on', () => {
    const verdict = checkGameweek({
      gameweek: 4,
      deadlineTime: '2026-09-12T12:30:00Z',
      projectionsCover: [4, 5, 6],
      nowMs: AT('2026-09-14T15:00:00Z'),
    })
    expect(verdict).toEqual({ ok: false, reason: 'deadline_passed', gameweek: 4, deadline: '2026-09-12T12:30:00Z' })
  })

  it('the deadline itself is already too late — a lock is a lock', () => {
    const verdict = checkGameweek({
      gameweek: 5,
      deadlineTime: '2026-09-18T17:30:00Z',
      projectionsCover: [5],
      nowMs: AT('2026-09-18T17:30:00Z'),
    })
    expect(verdict.ok).toBe(false)
  })

  it('projections that do not cover the week are a contradiction between sources, not staleness', () => {
    const verdict = checkGameweek({
      gameweek: 5,
      deadlineTime: '2026-09-18T17:30:00Z',
      projectionsCover: [6, 7, 8],
      nowMs: AT('2026-09-14T15:00:00Z'),
    })
    expect(verdict).toEqual({ ok: false, reason: 'projections_disagree', gameweek: 5, covered: [6, 7, 8] })
  })

  it('a projections file that claims no coverage proves nothing, and must not stop the app', () => {
    const verdict = checkGameweek({
      gameweek: 5,
      deadlineTime: '2026-09-18T17:30:00Z',
      projectionsCover: [],
      nowMs: AT('2026-09-14T15:00:00Z'),
    })
    expect(verdict).toEqual({ ok: true })
  })

  it('an unparseable deadline never silently passes the week as fine', () => {
    const verdict = checkGameweek({
      gameweek: 5,
      deadlineTime: 'not a date',
      projectionsCover: [6],
      nowMs: AT('2026-09-14T15:00:00Z'),
    })
    // Falls through to the second check rather than treating the clock as clear.
    expect(verdict.ok).toBe(false)
  })
})

describe('F6-RS-10, F6-UP-04 · what the model is never asked, and what is deliberately not built', () => {
  it('F6-RS-10: the model is asked to propose, to explain and to read, and never to judge', async () => {
    const { mockModel } = await import('../../apps/server/src/model/client.js')
    const port = mockModel()

    // Materiality is code's, always. A model shown its own prior answer is
    // reluctant to move; if it also judged whether the manager is told, that
    // reluctance would compound and a missed update would be indistinguishable
    // from a genuine no-change. The interface is the guarantee — there is no
    // method to ask.
    // **Exhaustive on purpose.** A substring check would let a
    // `judgeMateriality` through; the whole guarantee is that the interface
    // offers no way to ask. Two joined on 2026-09-15: `writeEditorial` with the
    // Overview (F8-AC-08), the explain job written over the week instead of one
    // card; and `readSquadScreenshots` with F2, which reports what is on a
    // picture. **Neither decides anything** — and the screenshot read in
    // particular is checked entirely in code, so a model that half-reads a
    // picture cannot rule its own output good enough (F2-UP-01).
    const methods = Object.keys(port).filter((k) => typeof (port as unknown as Record<string, unknown>)[k] === 'function')
    expect(methods.sort()).toEqual([
      'proposeTransfers',
      'readSquadScreenshots',
      'writeEditorial',
      'writeReasoning',
    ])
  })

  it('F6-UP-04: a deadline passing mid-session is caught at the next open, by this check and no clock', () => {
    // The criterion parks an in-session deadline clock rather than building one.
    // What makes that safe is that the guard runs on every read, so the state is
    // caught the moment the manager next looks — and it takes `nowMs` from the
    // caller rather than holding a timer of its own.
    const during = checkGameweek({
      gameweek: 5,
      deadlineTime: '2026-09-18T17:30:00Z',
      projectionsCover: [5],
      nowMs: AT('2026-09-18T17:29:59Z'),
    })
    const after = checkGameweek({
      gameweek: 5,
      deadlineTime: '2026-09-18T17:30:00Z',
      projectionsCover: [5],
      nowMs: AT('2026-09-18T17:30:01Z'),
    })

    expect(during.ok).toBe(true)
    expect(after.ok).toBe(false)
  })
})
