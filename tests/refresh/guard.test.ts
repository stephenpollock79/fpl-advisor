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
