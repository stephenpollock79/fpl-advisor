/**
 * The upload route and what an uploaded squad survives (F2-AC-04 – F2-AC-07,
 * F2-UP-01, F6-RS-06, F6-RS-07).
 *
 * **The persistence tests open the world rather than inspecting a row** (P16).
 * The rule is *an uploaded squad is not thrown away on the next open*, and the
 * only way to show that is to open it.
 */

import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { contradictedBy } from '../../apps/server/src/refresh/contradicted.js'
import { type ParsedSquad, parseSquad } from '../../apps/server/src/squad/parse.js'
import { screenshotRoutes } from '../../apps/server/src/squad/screenshots.js'
import type { WorldParts } from '../../apps/server/src/world/assemble.js'
import { type WorldDeps, worldRoutes } from '../../apps/server/src/world/routes.js'

const IMAGE = `data:image/png;base64,${'a'.repeat(64)}`

const squad = (): ParsedSquad => ({
  players: Array.from({ length: 15 }, (_, i) => ({
    playerId: i + 1,
    isStarter: i < 11,
    benchOrder: i < 11 ? null : ((i - 11) as 0 | 1 | 2 | 3),
    isCaptain: i === 0,
    isVice: i === 1,
  })),
  chipsRemaining: { wildcard: 'available' },
  bankTenths: 28,
  freeTransfers: 2,
})

const harness = (overrides: Partial<Parameters<typeof screenshotRoutes>[0]> = {}) => {
  const stored: { gameweek: number; squad: ParsedSquad }[] = []
  const app = screenshotRoutes({
    authenticate: async (cookie) => (cookie ? ({ userId: 'u1', accessToken: 't1' } as never) : null),
    model: () => ({ async readSquadScreenshots() { return { raw: fromSquad(squad()), record: null as never } } }) as never,
    advisedGameweek: async () => 5,
    trackedPlayers: async () => [{ id: 1, name: 'Haaland', club: 'MCI', position: 'FWD' }],
    storeCorrectedSquad: async (_u, gameweek, parsed) => {
      stored.push({ gameweek, squad: parsed })
      return 'snap-new'
    },
    breakContradictedLocks: async () => 0,
    ...overrides,
  })
  const post = (body: unknown) =>
    app.request('/api/squad/screenshots', {
      method: 'POST',
      headers: { Cookie: 'session=x', 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
  return { post, stored }
}

/** What a clean model read looks like, built from the squad it should produce. */
const fromSquad = (s: ParsedSquad) => ({
  team: { players: s.players, chipsRemaining: s.chipsRemaining },
  transfers: { bankTenths: s.bankTenths, freeTransfers: s.freeTransfers },
})

describe('F2-AC-04, F2-UP-01 · the upload applies everything or nothing', () => {
  it('F2-AC-04: a clean read of both writes the squad against the gameweek being advised', async () => {
    const { post, stored } = harness()
    const response = await post({ team: IMAGE, transfers: IMAGE })

    expect(response.status).toBe(200)
    expect(stored).toHaveLength(1)
    expect(stored[0]?.gameweek).toBe(5)
    expect(stored[0]?.squad.freeTransfers).toBe(2)
  })

  it('F2-UP-01: a partial read stores nothing, and says which screenshot and why', async () => {
    // The trigger is a model read that is genuinely short — four players — not
    // a failure flag handed to the route.
    const { post, stored } = harness({
      model: () =>
        ({
          async readSquadScreenshots() {
            return { raw: { team: { players: [], chipsRemaining: {} }, transfers: {} }, record: null as never }
          },
        }) as never,
    })

    const response = await post({ team: IMAGE, transfers: IMAGE })
    const body = (await response.json()) as { screen: string; because: string; causes: string[] }

    expect(response.status).toBe(422)
    expect(stored).toEqual([])
    expect(body.screen).toBe('team')
    // The three common causes are offered, because any of them can produce this.
    expect(body.causes).toHaveLength(3)
  })

  it('F2-AC-04: the model is given the players to choose from, because a screenshot shows names and never ids', async () => {
    // **The defect this replaces.** The first build asked for the FPL player id
    // outright. A Team screenshot does not contain one, so every player was
    // correctly omitted and every upload came back "0 of 15 players legible"
    // (found live 2026-09-15). The guard is that the read is never asked to
    // recall an id — it is given a list and picks from it.
    let sawPlayers = 0
    const { post } = harness({
      model: () =>
        ({
          async readSquadScreenshots(input: { players: unknown[] }) {
            sawPlayers = input.players.length
            return { raw: fromSquad(squad()), record: null as never }
          },
        }) as never,
      trackedPlayers: async () => [
        { id: 1, name: 'Haaland', club: 'MCI', position: 'FWD' },
        { id: 2, name: 'Salah', club: 'LIV', position: 'MID' },
      ],
    })

    await post({ team: IMAGE, transfers: IMAGE })
    expect(sawPlayers).toBe(2)
  })

  it('F2-UP-01: one picture is not enough, because no FPL screen carries everything', async () => {
    const { post, stored } = harness()
    expect((await post({ team: IMAGE })).status).toBe(400)
    expect(stored).toEqual([])
  })

  it('F2-UP-01: an image past the cap is refused before the model is called', async () => {
    let called = false
    const { post } = harness({
      model: () =>
        ({
          async readSquadScreenshots() {
            called = true
            return { raw: null, record: null as never }
          },
        }) as never,
    })

    const huge = `data:image/png;base64,${'a'.repeat(6 * 1024 * 1024)}`
    expect((await post({ team: huge, transfers: IMAGE })).status).toBe(413)
    // **Refused before it spends.** Sending it and failing would cost money.
    expect(called).toBe(false)
  })

  it('an unauthenticated upload reads nothing and stores nothing', async () => {
    const { stored } = harness()
    const app = screenshotRoutes({
      authenticate: async () => null,
      model: () => ({ async readSquadScreenshots() { throw new Error('never') } }) as never,
      advisedGameweek: async () => 5,
      trackedPlayers: async () => [],
      storeCorrectedSquad: async () => 'x',
      breakContradictedLocks: async () => 0,
    })
    const response = await app.request('/api/squad/screenshots', { method: 'POST', body: '{}' })
    expect(response.status).toBe(401)
    expect(stored).toEqual([])
  })
})

describe('F2-AC-07, F6-RS-07 · only a correction can break a lock', () => {
  const call = (key: string, outPlayerId: number, inPlayerId: number, movesSquad = true) => ({
    key,
    outPlayerId,
    inPlayerId,
    movesSquad,
  })

  it('F2-AC-07, F6-RS-07: a squad without the incoming player breaks that lock', () => {
    // The trigger is the contradiction itself: the manager selected a transfer
    // bringing 200 in, and the picture does not show him.
    const broken = contradictedBy([1, 2, 3], [call('transfer:out=1:in=200', 1, 200)])
    expect(broken).toEqual(['transfer:out=1:in=200'])
  })

  it('F2-AC-07: a squad still holding the outgoing player breaks that lock too', () => {
    expect(contradictedBy([1, 2, 200], [call('transfer:out=1:in=200', 1, 200)])).toEqual(['transfer:out=1:in=200'])
  })

  it('F2-AC-07: a lock the squad agrees with survives, so a correction is not a reset', () => {
    expect(contradictedBy([2, 3, 200], [call('transfer:out=1:in=200', 1, 200)])).toEqual([])
  })

  it('F2-AC-07: a captaincy lock is never contradicted, because it moves nobody in or out', () => {
    // Both players are in the fifteen either way; an armband cannot disagree
    // with a squad list.
    expect(contradictedBy([1, 2], [call('captaincy:captain:from=1:to=2', 1, 2, false)])).toEqual([])
  })
})

describe('F2-AC-04 · an uploaded squad is not thrown away on the next open', () => {
  const parts = (source: string, picksFrom: number | null): WorldParts => ({
    picksFrom,
    gameweek: { id: 5, name: 'Gameweek 5', deadlineTime: '2026-09-18T17:30:00Z', isNext: true, isCurrent: false, finished: false, dataChecked: false },
    lastScored: null,
    snapshot: { id: 's1', source, capturedAt: new Date().toISOString(), bankTenths: 10, freeTransfers: 1, chipsRemaining: {} },
    squad: [],
    players: [],
    clubs: [],
    fixtures: [],
    projections: [],
    states: [],
  })

  const open = async (source: string, picksFrom: number | null) => {
    const superseded: string[] = []
    const deps: WorldDeps = {
      authenticate: async () => ({ userId: 'u1', accessToken: 't1' }) as never,
      linkedTeamId: async () => 6131656,
      newestFeedReadAt: async () => new Date().toISOString(),
      newsInputs: async () => ({ before: null, after: [], since: null }),
      ingest: async () => ({ gameweek: 5 }),
      // Gameweek 5's deadline has passed in FPL's eyes, so a deadline-read
      // squad from before it is stale. This is the circumstance the rule is about.
      lastCompletedGameweek: async () => 5,
      captureSquad: async () => 's2',
      supersedeSnapshot: async (_u, id) => {
        superseded.push(id)
      },
      loadParts: async () => parts(source, picksFrom),
    }
    await worldRoutes(deps).request('/api/world', { headers: { Cookie: 'session=x' } })
    return superseded
  }

  it('F2-AC-04: opening mid-gameweek keeps an uploaded squad, where a deadline-read one of the same age is retired', async () => {
    // **The same age, the same open, opposite outcomes** — which is the whole
    // rule. Testing only the uploaded case would pass with the guard removed.
    expect(await open('screenshot', null)).toEqual([])
    expect(await open('fpl_deadline', 4)).toEqual(['s1'])
  })
})

describe('F2-AC-02, F1-AC-07 · free transfers are read, not reconstructed', () => {
  it('F1-AC-07: the figure the Transfers screenshot states is the figure stored', () => {
    // The reconstruction caps at five and accrues one a week; a screenshot
    // saying five when the derivation would say two is the case that matters,
    // because it is the one a rule change produces.
    const result = parseSquad({
      team: {
        players: squad().players,
        chipsRemaining: { wildcard: 'available' },
      },
      transfers: { bankTenths: 0, freeTransfers: 5 },
    })

    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.squad.freeTransfers).toBe(5)
  })
})

describe('F2-UP-02, F2-UP-03 · the two the criteria deliberately do not build', () => {
  it('F2-UP-02: a clean read of someone else’s squad is applied, because nothing can tell whose it is', async () => {
    // **The trigger is a squad that is not the manager's**, and the criterion's
    // acceptance is that this is *not gated*: the app has no way to know whose
    // team a clean picture shows. So the check is that it goes through — a
    // rejection here would be the app pretending to knowledge it has not got.
    //
    // The cost is bounded by the rule ruled on 2026-09-15: a wrong upload is
    // replaced by the next one, and the gameweek rollover clears it either way.
    const strangers: ParsedSquad = { ...squad(), players: squad().players.map((p) => ({ ...p, playerId: p.playerId + 500 })) }
    const { post, stored } = harness({
      model: () => ({ async readSquadScreenshots() { return { raw: fromSquad(strangers), record: null as never } } }) as never,
    })

    expect((await post({ team: IMAGE, transfers: IMAGE })).status).toBe(200)
    expect(stored[0]?.squad.players[0]?.playerId).toBe(501)
  })

  it('F2-UP-03: no denied-photo-access state is built, and the upload sheet is where its absence is deliberate', () => {
    // The criterion parks a bespoke denied state: the operating system's own
    // prompt is the route back. What makes that safe is that nothing in the app
    // claims to handle it — a half-built one would be worse than none, because
    // it would look like the route back and not be.
    const sheet = readFileSync(
      fileURLToPath(new URL('../../apps/client/src/screens/Squad/UploadSheet.tsx', import.meta.url)),
      'utf8',
    )

    // The picker is a plain file input, which is what hands the question to the
    // operating system rather than to us.
    expect(sheet).toMatch(/type="file"/)

    // **Scanned on what the screen says, not on what the file says about
    // itself.** The docblock above this component explains why no denied state
    // exists, and scanning the comments would count that explanation as the
    // thing it is explaining — the same mistake as a criterion counted covered
    // off a comment saying it is not.
    const withoutComments = sheet.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '')
    expect(withoutComments).not.toMatch(/permission|denied|allow access/i)
  })
})
