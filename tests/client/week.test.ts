/**
 * The editorial's figures (F8-AC-01 – F8-AC-07, F4-AC-03, F3-UP-05).
 *
 * **Each test causes the circumstance its criterion is about** (P16). The
 * blank-week test gives the world a blank; the quiet-week test gives it a run
 * that produced nothing; the tally tests give it calls that actually carry the
 * properties being counted. Handing `weekOf` a pre-built tally and checking it
 * came back would prove the function returns its argument.
 */

import { readFileSync, readdirSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import type { DecisionState, World, WorldCall, WorldPlayer } from '../../apps/client/src/api'
import { weekOf } from '../../apps/client/src/calls/week'

/**
 * **Taken from the migration, never typed here.** `squad_snapshot.source` has
 * allowed `screenshot` since slice 3 and the client compared against
 * `screenshots` for the whole of 2026-09-15 — a branch that could never fire,
 * green the entire time because the fixture typed the plural by hand. A test
 * that invents the value it is checking decides its own result (P16).
 */
const SCREENSHOT_SOURCE = (() => {
  const dir = fileURLToPath(new URL('../../supabase/migrations', import.meta.url))
  const sql = readdirSync(dir)
    .map((f) => readFileSync(`${dir}/${f}`, 'utf8'))
    .join('\n')
  const match = /squad_snapshot[\s\S]*?source\s+text not null check \(source in \(([^)]+)\)\)/.exec(sql)
  const values = (match?.[1] ?? '').split(',').map((v) => v.trim().replace(/'/g, ''))
  const found = values.find((v) => v !== 'fpl_deadline')
  if (!found) throw new Error('no screenshot source found in the migrations')
  return found
})()

const player = (id: number, name: string, extra: Partial<WorldPlayer> = {}): WorldPlayer => ({
  playerId: id,
  name,
  shirtNumber: null,
  clubId: id,
  clubShortName: 'XXX',
  position: 'MID',
  isStarter: true,
  benchOrder: null,
  isCaptain: false,
  isVice: false,
  status: 'a',
  chanceOfPlayingNextRound: null,
  nowCostTenths: 56,
  form: 3,
  selectedByPercent: 10,
  seasonPoints: 20,
  transfersIn: 0,
  transfersOut: 0,
  projectedPoints: 4,
  projections: [4, 4, 4],
  fixtures: [{ opponentClubId: 99, opponentShortName: 'BUR', isHome: true, difficulty: 2 }],
  nextThree: [2, 2, 2],
  purchasePriceTenths: null,
  sellingPriceTenths: null,
  priceLikelihoodTonight: null,
  priceLockedUntil: null,
  ...extra,
})

const call = (key: string, extra: Partial<WorldCall> = {}): WorldCall => ({
  key,
  category: 'transfer',
  shape: 'transfer',
  outPlayerId: 1,
  inPlayerId: 2,
  net: 2,
  isReading: false,
  readingReason: null,
  conviction: 67,
  band: 'lean',
  k: 2,
  pointsHit: 0,
  costTenths: 0,
  isForced: false,
  watch: false,
  watchReason: null,
  reasoning: 'x',
  reasoningSource: 'template',
  breakdown: { weights: [1], out: { playerId: 1, projections: [1], gate: { eligible: true }, total: 1 }, in: { playerId: 2, projections: [2], gate: { eligible: true }, total: 2 }, net: 1, pointsHit: 0, k: 0.5, kLabel: 'transfer', byCeiling: false },
  alternatives: null,
  position: 0,
  diffTag: null,
  previousConviction: null,
  ...extra,
})

const world = (extra: Partial<World> = {}): World => ({
  gameweek: { id: 5, name: 'Gameweek 5', deadlineTime: '2026-09-18T17:30:00Z' },
  lastScoredGameweek: 4,
  snapshot: {
    id: 's1',
    source: 'fpl_deadline',
    capturedAt: '2026-09-12T11:30:00Z',
    bankTenths: 10,
    freeTransfers: 1,
    chipsRemaining: {},
    picksFrom: 4,
  },
  players: [player(1, 'Muñoz'), player(2, 'Semenyo'), player(3, 'Isak')],
  candidates: [],
  calls: [],
  decisions: {},
  lastRunAt: '2026-09-15T19:41:00Z',
  editorial: 'One forced change and a captaincy worth switching.',
  priceForecastReadAt: null,
  blanks: 0,
  doubles: 0,
  attribution: { name: 'Fantasy Football IQ', href: 'https://fantasyfootballiq.app' },
  ...extra,
})

const none: Record<string, DecisionState> = {}

describe('F8-AC-02, F8-AC-06 · the count and the tally come off one list', () => {
  it('F8-AC-02, F8-AC-06: deciding one of three calls moves the count, and the tally still sums to the same three', () => {
    const calls = [call('a'), call('b', { isForced: true }), call('c', { conviction: 91, band: 'certain' })]
    const w = world({ calls })

    const before = weekOf(w, none)
    expect(before.decidedLine).toBe('0 of 3 calls decided')

    // The trigger: an actual decision, not a different number handed in.
    const after = weekOf(w, { a: 'selected' })
    expect(after.decidedLine).toBe('1 of 3 calls decided')

    // F8-AC-06's real content: no two of these can disagree, because the tally
    // partitions the same list the count is taken from.
    const tallied = after.tally.forced + after.tally.bands.reduce((n, b) => n + b.count, 0)
    expect(tallied).toBe(after.live.length)
  })

  it('F8-AC-03: a forced call at 59% counts as forced, so the tally reads isForced and not the band', () => {
    // The trigger is a forced call whose conviction is *below* every threshold a
    // reader might mistake for the rule. If forced were derived from conviction
    // this call would land in `lean` instead.
    const w = world({ calls: [call('a', { isForced: true, conviction: 59, band: 'thin' })] })

    const { tally } = weekOf(w, none)
    expect(tally.forced).toBe(1)
    expect(tally.bands).toEqual([])
  })

  it('F8-AC-03: the bands come back in ramp order with empty ones omitted', () => {
    const w = world({
      calls: [
        call('a', { conviction: 91, band: 'certain' }),
        call('b', { conviction: 40, band: 'thin' }),
        call('c', { conviction: 85, band: 'strong' }),
      ],
    })

    expect(weekOf(w, none).tally.bands.map((b) => b.band)).toEqual(['certain', 'strong', 'thin'])
  })

  it('F4-AC-03: a keep reading is in the world but in no tally and no count', () => {
    // The trigger is a run that produced a keep — the app answering "nothing to
    // do" — alongside one real call.
    const w = world({
      calls: [call('a'), call('keep', { isReading: true, readingReason: 'incumbent_wins', conviction: null, band: null })],
    })

    const week = weekOf(w, none)
    expect(week.live).toHaveLength(1)
    expect(week.decidedLine).toBe('0 of 1 call decided')
  })
})

describe('F8-AC-04 · where the week was built from', () => {
  it('F8-AC-04: a snapshot carrying no gameweek says so in words, never "GW undefined"', () => {
    // Every row written before slice 7 is this case, and it reached the live
    // entry screen on 2026-09-15 reading "GWundefined".
    const w = world()
    const snapshot = { ...w.snapshot } as Record<string, unknown>
    delete snapshot['picksFrom']
    expect(weekOf({ ...w, snapshot: snapshot as World['snapshot'] }, none).squadStateLine).toBe(
      'built from your squad as at the last deadline',
    )
  })

  it('F8-AC-04: a squad read at the deadline names the gameweek it was read from, not the one being advised on', () => {
    // GW5 is being advised; the picks are GW4's. Naming the advised week would
    // be wrong in exactly the way nobody would notice.
    expect(weekOf(world(), none).squadStateLine).toBe('built from your squad as at the GW4 deadline')
  })

  it('F8-AC-04: the client compares against the value the migration actually allows', () => {
    // The whole of the defect: the strings simply never matched.
    expect(SCREENSHOT_SOURCE).toBe('screenshot')
  })

  it('F8-AC-04: a squad corrected from screenshots states the upload time instead', () => {
    // The trigger is the snapshot F2 writes, which is the only thing that
    // distinguishes the two readings.
    const w = world({
      snapshot: { ...world().snapshot, source: SCREENSHOT_SOURCE, capturedAt: '2026-09-15T18:12:00' },
    })
    expect(weekOf(w, none).squadStateLine).toBe('built from the squad screenshots you uploaded at 18:12')
  })
})

describe('F8-AC-05 · the flagged summary', () => {
  it('F8-AC-05: three squad players with moved evidence give one line naming each, in FPL’s own terms', () => {
    // The trigger is the news payload the world derives (F8-AC-13), not a
    // hand-written list of names.
    const w = world({
      players: [
        player(1, 'Muñoz', { status: 'i', chanceOfPlayingNextRound: 0 }),
        player(2, 'Semenyo', { status: 'd', chanceOfPlayingNextRound: 50 }),
        player(3, 'Isak', { status: 'd', chanceOfPlayingNextRound: 75 }),
      ],
      news: {
        since: '2026-09-15T19:41:00Z',
        flagged: [
          { playerId: 1, fields: ['status'], nowExcluded: true },
          { playerId: 2, fields: ['chance'], nowExcluded: false },
          { playerId: 3, fields: ['chance'], nowExcluded: false },
        ],
      },
    })

    const week = weekOf(w, none)
    expect(week.flaggedLine).toBe('3 · flagged: Muñoz out, Semenyo 50%, Isak 75%')
    expect(week.flagged[2]?.verdict).toBe('Isak — expected to start at 75%, keep him in the team')
  })

  it('F8-AC-05: no news means no line at all, rather than a line saying none', () => {
    expect(weekOf(world(), none).flaggedLine).toBeNull()
  })
})

describe('F8-AC-07 · a blank or a double leads', () => {
  it('F8-AC-07, F3-AC-06: a blank gameweek makes the editorial lead with the bench-order consequence', () => {
    // The trigger is a world carrying a blank. This is the case a season may not
    // produce for weeks, and the one the editorial most has to get right.
    const lead = weekOf(world({ blanks: 1 }), none).exceptionLead
    expect(lead).toMatch(/no fixture/)
    expect(lead).toMatch(/bench order is now the most important substitution/)
  })

  it('F8-AC-07: a double gameweek leads with the chip consequence instead', () => {
    const lead = weekOf(world({ doubles: 2 }), none).exceptionLead
    expect(lead).toMatch(/plays twice|play twice/)
    expect(lead).toMatch(/chip plan/)
  })

  it('F8-AC-07: an ordinary week leads with nothing, so the lead means something when it appears', () => {
    expect(weekOf(world(), none).exceptionLead).toBeNull()
  })
})

describe('F3-UP-05 · a quiet week is an answer', () => {
  it('F3-UP-05, F8-AC-01: a run producing no calls reads as none with an empty tally', () => {
    // The trigger is a run that genuinely found nothing — `calls: []` from the
    // world, not a filtered-down list.
    const week = weekOf(world({ calls: [] }), none)

    expect(week.decidedLine).toBe('no calls this week')
    expect(week.tally).toEqual({ forced: 0, bands: [] })
    expect(week.live).toEqual([])
  })
})
