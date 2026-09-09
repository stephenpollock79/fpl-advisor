/**
 * The four data rules, tested against fabricated feed payloads (STE-106).
 *
 * These are the rules CLAUDE.md opens with: get them wrong and the app looks like
 * it works. Blanks and doubles cannot be observed live this early in a season —
 * doubles come later — so both are stubbed here rather than waited for. PRD 3.5's
 * own warning is the reason: a wrong structure "will pass a normal week and fail
 * the first exceptional one".
 *
 * The payload shapes are the real ones, taken from live fetches on 2026-09-09:
 * `bootstrap-static`, `fixtures/`, and fantasyfootballiq.app's projections file.
 * Values are invented; keys and types are not.
 *
 * Some tests here name no criterion, deliberately. The gameweek flags and the
 * fixture-count rule are data rules from CLAUDE.md and PRD 3.5, not acceptance
 * criteria from the PRD's feature list — naming one would inflate the coverage
 * figure against something F1 never asked for. Same reasoning as
 * tests/auth/env.test.ts.
 */

import { describe, expect, it, vi } from 'vitest'
import { gameweekToAdviseOn, lastScoredGameweek, toGameweekRows } from '../../apps/server/src/ingest/gameweeks.js'
import { fixtureCountsByClub, reportFixtureAnomalies, toFixtureRows } from '../../apps/server/src/ingest/fixtures.js'
import { effectiveProjection, toProjectionRows } from '../../apps/server/src/ingest/projections.js'

// Named rather than indexed, so a test never reaches into an array position that
// the compiler cannot promise is there.
const gw3 = { id: 3, name: 'Gameweek 3', deadline_time: '2026-09-05T17:30:00Z', finished: true, data_checked: false, is_current: true, is_next: false }
const gw4 = { id: 4, name: 'Gameweek 4', deadline_time: '2026-09-12T17:30:00Z', finished: false, data_checked: false, is_current: false, is_next: true }
const events = [gw3, gw4]

describe('which gameweek the app advises on', () => {
  it('advises on is_next, never is_current', () => {
    // Not a hypothetical. Checked live on 2026-09-09: the feed reported
    // is_current = 3 and is_next = 4 simultaneously, because it keeps marking a
    // gameweek current until the following one locks. Keying off is_current
    // produces confident advice about a week already played, every week, with
    // nothing visibly broken. The fixture below is that exact state.
    const rows = toGameweekRows({ events })

    expect(gameweekToAdviseOn(rows).id).toBe(4)
  })

  it('reads last gameweek\'s points from data_checked, not finished', () => {
    // Gameweek 3 above is finished but not data_checked — the real window between
    // the last whistle and bonus points landing. Reading `finished` here would
    // show a total that changes under the manager a few hours later.
    expect(lastScoredGameweek(toGameweekRows({ events }))).toBeNull()

    const settled = toGameweekRows({
      events: [{ ...gw3, data_checked: true }, gw4],
    })
    expect(lastScoredGameweek(settled)?.id).toBe(3)
  })

  it('refuses to guess when the feed marks no gameweek next', () => {
    // End of season, or a feed hiccup. Advising on a guessed gameweek is worse
    // than not advising, so this throws rather than falling back to is_current.
    const noNext = toGameweekRows({ events: [{ ...gw4, is_next: false }] })
    expect(() => gameweekToAdviseOn(noNext)).toThrow(/is_next/)
  })
})

describe('F1-UP-01, F1-UP-02 · fixture count comes from fixtures and nothing else', () => {
  // Club 1 blanks in GW4 — no row at all. Club 2 doubles, playing 3 and then 4.
  // Clubs 3 and 4 play once each, so they are the control: a rule that logged
  // every club would pass the anomaly test without meaning anything.
  const fixtures = toFixtureRows([
    { id: 10, event: 4, team_h: 2, team_a: 3, kickoff_time: '2026-09-12T14:00:00Z', team_h_difficulty: 2, team_a_difficulty: 4, finished: false },
    { id: 11, event: 4, team_h: 2, team_a: 4, kickoff_time: '2026-09-13T14:00:00Z', team_h_difficulty: 3, team_a_difficulty: 3, finished: false },
    { id: 12, event: null, team_h: 1, team_a: 2, kickoff_time: null, team_h_difficulty: 3, team_a_difficulty: 3, finished: false },
  ])

  it('F1-UP-01, F1-UP-02: counts fixtures per club, and ignores fixtures with no gameweek', () => {
    const counts = fixtureCountsByClub(fixtures, 4)

    expect(counts.get(1) ?? 0, 'club 1 blanks').toBe(0)
    expect(counts.get(2), 'club 2 doubles').toBe(2)
    expect(counts.get(3), 'club 3 plays once').toBe(1)
    expect(counts.get(4), 'club 4 plays once').toBe(1)
    // Fixture 12 has event null — postponed, not yet rescheduled. It must not
    // count towards any gameweek, which is why it is filtered on the way in
    // rather than defaulted to one.
    expect(fixtures.every((f) => f.gameweek !== null)).toBe(true)
    expect(fixtures).toHaveLength(2)
  })

  it('F1-UP-01: a club with no fixture projects 0.0 whatever the feed carries', () => {
    // The projections feed is not wrong to carry a figure — it simply does not
    // know about the blank. On conflict the fixture count wins.
    expect(effectiveProjection({ projectedPoints: 6.4, fixtureCount: 0 })).toBe(0)
  })

  it('F1-UP-02: a double is one figure and is never summed', () => {
    // FFIQ supplies one figure per player per gameweek and it already covers
    // however many matches that gameweek holds. F1-UP-02's "sum of both fixtures"
    // describes that figure, not an operation performed here — there is nothing
    // to add, and the projection table has no fixture dimension to add across.
    expect(effectiveProjection({ projectedPoints: 9.2, fixtureCount: 2 })).toBe(9.2)
    expect(effectiveProjection({ projectedPoints: 9.2, fixtureCount: 1 })).toBe(9.2)
  })

  it('F1-UP-01, F1-UP-02: a club with other than one fixture is logged', () => {
    // Blanks and doubles cannot be observed live before the MVP, so the first
    // real one has to announce itself rather than pass silently.
    const log = vi.fn()
    reportFixtureAnomalies(fixtures, 4, [1, 2, 3, 4], log)

    const said = log.mock.calls.map((c) => String(c[0])).join('\n')
    expect(said, 'the blanking club was not named').toMatch(/\b1\b/)
    expect(said, 'the doubling club was not named').toMatch(/\b2\b/)
    expect(said, 'an ordinary club was logged').not.toMatch(/club id 3\b/)
    expect(said, 'an ordinary club was logged').not.toMatch(/club id 4\b/)
    expect(log).toHaveBeenCalledTimes(2)
  })
})

describe('projections come from FFIQ, and only the number', () => {
  // FFIQ carries its own opponent, venue and fixture-ease per gameweek. None of
  // it is read: the FPL feed owns fixtures, and taking them from here would put
  // two sources behind one fact — which would disagree in exactly the weeks that
  // matter. They are present in this fixture so that the test proves they are
  // ignored rather than merely absent.
  const saka = {
    fpl_id: 101 as number | null,
    web_name: 'Saka',
    club: 'ARS',
    pos: 'MID',
    gws: [
      { gw: 4, opp: 'SUN', venue: 'A', proj: 5.4, ease: 'very kind' },
      { gw: 5, opp: 'BHA', venue: 'H', proj: 4.1, ease: 'very tough' },
    ],
  }
  const ffiq = { players: [saka] }

  it('F1-UP-02: one row per player per gameweek, carrying the number and nothing else', () => {
    const rows = toProjectionRows(ffiq, 'feed-read-1')

    expect(rows).toEqual([
      { gameweek: 4, playerId: 101, projectedPoints: 5.4, feedReadId: 'feed-read-1' },
      { gameweek: 5, playerId: 101, projectedPoints: 4.1, feedReadId: 'feed-read-1' },
    ])
    // No opponent, no venue, no ease. If those ever appear on a projection row,
    // the fixture table has a competitor.
    for (const row of rows) {
      expect(Object.keys(row).sort()).toEqual(['feedReadId', 'gameweek', 'playerId', 'projectedPoints'])
    }
  })

  it('F1-UP-02: two entries for one gameweek are never summed', () => {
    // The model says one figure per player per gameweek, and the table's primary
    // key enforces it. If the feed ever emits two, summing them would double-count
    // a double gameweek — the precise failure the one-figure rule exists to
    // prevent. The first is taken.
    const doubled = {
      players: [
        {
          ...saka,
          gws: [
            { gw: 4, opp: 'SUN', venue: 'A', proj: 5.4, ease: 'kind' },
            { gw: 4, opp: 'BHA', venue: 'H', proj: 3.1, ease: 'tough' },
          ],
        },
      ],
    }

    const rows = toProjectionRows(doubled, 'feed-read-1')

    expect(rows).toHaveLength(1)
    expect(rows[0]?.projectedPoints, 'the two figures were summed').toBe(5.4)
  })

  it('skips a player the FPL feed does not know', () => {
    // fpl_id is the join. A projection for a player with no FPL id cannot be
    // attached to anything, and inventing a row would break the foreign key.
    expect(toProjectionRows({ players: [{ ...saka, fpl_id: null }] }, 'feed-read-1')).toEqual([])
  })
})
