/**
 * The news token's count (F8-AC-13, F8-AC-17, F8-AC-18, F8-AC-19).
 *
 * **Every test here causes the token's own trigger** (P16): a feed read that
 * differs from the one the last successful run saw. A test that handed the
 * component a count would prove the badge draws and nothing about the rule —
 * and the rule is the whole feature, because the token is the only thing in the
 * product that says the world has moved.
 */

import { describe, expect, it } from 'vitest'
import type { EvidenceRow } from '../../apps/server/src/refresh/evidence.js'
import { squadNews } from '../../apps/server/src/world/news.js'

const row = (playerId: number, extra: Partial<EvidenceRow> = {}): EvidenceRow => ({
  playerId,
  status: 'a',
  news: null,
  newsAdded: null,
  chanceOfPlayingNextRound: null,
  nowCostTenths: 50,
  ...extra,
})

/** Fifteen squad players, and one outside it FPL also tracks. */
const SQUAD = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15]
const baseline = [...SQUAD, 200].map((id) => row(id))
const RUN_AT = '2026-09-15T19:41:00Z'

describe('F8-AC-13 · the token counts squad players whose evidence has moved', () => {
  it('F8-AC-13: a feed read differing from the run baseline raises the token, naming the fields that moved', () => {
    // The trigger: a *second* read, taken after the run, in which news landed.
    const after = baseline.map((r) =>
      r.playerId === 7
        ? row(7, { status: 'd', chanceOfPlayingNextRound: 50, news: 'Knock', newsAdded: '2026-09-15T20:10:00Z' })
        : r,
    )

    const news = squadNews({ before: baseline, after, squad: SQUAD, since: RUN_AT })

    expect(news.flagged).toHaveLength(1)
    expect(news.flagged[0]?.playerId).toBe(7)
    expect(news.flagged[0]?.fields).toEqual(['status', 'news', 'chance'])
    expect(news.since).toBe(RUN_AT)
  })

  it('F8-AC-13: a player outside the squad moving raises nothing, however far he moves', () => {
    // The same trigger, aimed at the one player the criterion excludes. Without
    // this the token would fire on ordinary churn across all 650 tracked players
    // and be dismissed within a week.
    const after = baseline.map((r) => (r.playerId === 200 ? row(200, { status: 'u', news: 'Left the league' }) : r))

    expect(squadNews({ before: baseline, after, squad: SQUAD, since: RUN_AT }).flagged).toEqual([])
  })

  it('F8-AC-13: a squad player crossing out of the availability gate is marked as excluded now', () => {
    const after = baseline.map((r) => (r.playerId === 3 ? row(3, { status: 'i', chanceOfPlayingNextRound: 0 }) : r))

    const news = squadNews({ before: baseline, after, squad: SQUAD, since: RUN_AT })

    expect(news.flagged[0]).toMatchObject({ playerId: 3, nowExcluded: true })
  })

  it('F8-AC-17: a run consuming the news clears the token, because the run moves the baseline', () => {
    const moved = baseline.map((r) => (r.playerId === 7 ? row(7, { status: 'd' }) : r))

    // Before the run: the read differs from what the run saw, so the token shows.
    expect(squadNews({ before: baseline, after: moved, squad: SQUAD, since: RUN_AT }).flagged).toHaveLength(1)

    // The run happens. Its baseline is now the read that carried the news, and
    // nothing else has moved since. Same function, same inputs but the new
    // baseline — and the token is gone without anything having cleared a flag.
    const afterRun = squadNews({ before: moved, after: moved, squad: SQUAD, since: '2026-09-15T20:15:00Z' })
    expect(afterRun.flagged).toEqual([])
    expect(afterRun.since).toBe('2026-09-15T20:15:00Z')
  })

  it('F8-AC-18: the token reports how many players are flagged since the last run, not how many fields moved', () => {
    const after = baseline.map((r) => {
      if (r.playerId === 4) return row(4, { status: 'i', news: 'Out', chanceOfPlayingNextRound: 0, nowCostTenths: 49 })
      if (r.playerId === 9) return row(9, { nowCostTenths: 51 })
      return r
    })

    const news = squadNews({ before: baseline, after, squad: SQUAD, since: RUN_AT })

    expect(news.flagged).toHaveLength(2)
    expect(news.flagged.flatMap((f) => f.fields).length).toBeGreaterThan(2)
  })

  it('F8-AC-19: the first open has no baseline, so nothing is claimed to have moved', () => {
    // Not an edge case — it is every manager's first open. With no successful
    // run there is no "since", and treating every player as new would put a
    // red count on the entry screen before the app has ever advised anything.
    expect(squadNews({ before: null, after: baseline, squad: SQUAD, since: null })).toEqual({
      flagged: [],
      since: null,
    })
  })
})
