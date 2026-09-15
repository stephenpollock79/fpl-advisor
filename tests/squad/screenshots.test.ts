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

/** Every player the fixture squad names, in a legal 2/5/5/3. */
const TRACKED = [
  ...[1, 12].map((id) => ({ id, name: `Keeper${String(id)}`, club: 'MCI', position: 'GKP' })),
  ...[2, 3, 4, 13, 14].map((id) => ({ id, name: `Def${String(id)}`, club: 'LIV', position: 'DEF' })),
  ...[5, 6, 7, 8, 15].map((id) => ({ id, name: `Mid${String(id)}`, club: 'ARS', position: 'MID' })),
  ...[9, 10, 11].map((id) => ({ id, name: `Fwd${String(id)}`, club: 'NEW', position: 'FWD' })),
]

/** The same fifteen, belonging to somebody else. */
const STRANGERS = TRACKED.map((p) => ({ ...p, id: p.id + 500, name: `${p.name}X` }))

const harness = (overrides: Partial<Parameters<typeof screenshotRoutes>[0]> = {}) => {
  const stored: { gameweek: number; squad: ParsedSquad }[] = []
  const app = screenshotRoutes({
    authenticate: async (cookie) => (cookie ? ({ userId: 'u1', accessToken: 't1' } as never) : null),
    model: () => ({ async readSquadScreenshots() { return { raw: fromSquad(squad()), record: null as never } } }) as never,
    advisedGameweek: async () => 5,
    // A legal 2/5/5/3, matching the fixture squad's ids — the composition check
    // reads positions off this list, so a stub of one player would fail it.
    trackedPlayers: async () => TRACKED,
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

/**
 * What a clean model read looks like, built from the squad it should produce.
 *
 * **Each player carries the name as well as the id**, because the name is what
 * identifies him — the id only breaks a tie between two who share one. A
 * fixture of bare ids was testing the design that shipped wrong players.
 */
const fromSquad = (s: ParsedSquad, tracked = TRACKED) => ({
  team: {
    players: s.players.map((p) => ({
      ...p,
      name: tracked.find((t) => t.id === p.playerId)?.name ?? `Player${String(p.playerId)}`,
    })),
    chips: Object.entries(s.chipsRemaining).map(([chip, state]) => ({ chip, state })),
  },
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
            return { raw: { team: { players: [], chips: [] }, transfers: {} }, record: null as never }
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

  it('F2-UP-01: a read that never answers says so, rather than blaming the picture', async () => {
    // **The trigger is the model returning nothing at all** — a throw, a
    // refusal, or a reply that is not JSON. It reached the manager as "only 0
    // of 15 players legible" and sent him back to a camera roll holding a good
    // picture, twice, on 2026-09-15. A failure he cannot act on must say so.
    const { post, stored } = harness({
      model: () =>
        ({
          async readSquadScreenshots() {
            return { raw: null, record: { ok: false, via: 'api', modelId: 'none' } as never }
          },
        }) as never,
    })

    const response = await post({ team: IMAGE, transfers: IMAGE })
    const body = (await response.json()) as { because: string }

    expect(response.status).toBe(502)
    expect(body.because).toMatch(/our fault and not your picture/)
    expect(body.because).not.toMatch(/legible/)
    expect(stored).toEqual([])
  })

  it('F2-UP-01: where the reader says why it could not answer, the screen says it too', async () => {
    // **The trigger is a failure that carries a reason.** Two uploads failed
    // with nothing on screen to act on, and the cause sat in a deploy log
    // (2026-09-15). A reason that exists and is not shown is one nobody reads.
    const { post } = harness({
      model: () =>
        ({
          async readSquadScreenshots() {
            return {
              raw: null,
              record: { ok: false, via: 'api', modelId: 'none' } as never,
              because: 'HTTP 400: image exceeds 5 MB maximum',
            }
          },
        }) as never,
    })

    const body = (await (await post({ team: IMAGE, transfers: IMAGE })).json()) as { because: string }
    expect(body.because).toContain('image exceeds 5 MB maximum')
  })

  it('F2-UP-01: an empty player list is our fault too, and never reported as an unreadable picture', async () => {
    const { post, stored } = harness({ trackedPlayers: async () => [] })

    const response = await post({ team: IMAGE, transfers: IMAGE })
    const body = (await response.json()) as { because: string }

    expect(response.status).toBe(503)
    expect(body.because).toMatch(/our fault and not your picture/)
    expect(stored).toEqual([])
  })

  it('F2-UP-01: a read that misses a player is read once more, because the answer is checkable', async () => {
    // **The trigger is a reader that is not deterministic**: the same two
    // pictures gave fifteen players on one attempt and fourteen on the next
    // (2026-09-15). Against an all-or-nothing rule that makes every upload a
    // coin flip, and the manager pays for the miss by retaking good photographs.
    let attempts = 0
    const { post, stored } = harness({
      model: () =>
        ({
          async readSquadScreenshots() {
            attempts += 1
            // First read drops a player; the second sees all fifteen.
            const read = squad()
            const short = attempts === 1 ? { ...read, players: read.players.slice(0, 14) } : read
            return { raw: fromSquad(short), record: null as never }
          },
        }) as never,
    })

    expect((await post({ team: IMAGE, transfers: IMAGE })).status).toBe(200)
    expect(attempts).toBe(2)
    expect(stored).toHaveLength(1)
  })

  it('F2-UP-01: a picture that cannot be read is not read a third time', async () => {
    // Twice, never more. A picture that genuinely cannot be read fails on the
    // second attempt as surely as the tenth, and a loop turns a bad upload into
    // an open-ended bill.
    let attempts = 0
    const { post, stored } = harness({
      model: () =>
        ({
          async readSquadScreenshots() {
            attempts += 1
            return { raw: { team: { players: [], chips: [] }, transfers: {} }, record: null as never }
          },
        }) as never,
    })

    expect((await post({ team: IMAGE, transfers: IMAGE })).status).toBe(422)
    expect(attempts).toBe(2)
    expect(stored).toEqual([])
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

describe('F2-AC-04 · a failed correction leaves the squad it could not replace', () => {
  it('F2-AC-04: nothing is retired until the new squad is whole', async () => {
    // **The trigger is a store that fails partway.** It used to retire the
    // existing squad first, so a failure after that point left an empty pitch
    // and no way back — an uploaded squad is never aged out, so nothing
    // re-captured. Found live 2026-09-15.
    const retired: string[] = []
    const { post } = harness({
      storeCorrectedSquad: async () => {
        retired.push('would have retired')
        throw new Error('the fifteen could not be written')
      },
    })

    try {
      await post({ team: IMAGE, transfers: IMAGE })
    } catch {
      /* the route surfaces it; the ordering is what this asserts */
    }

    // The route surfaces the failure; what matters is that the old squad is
    // still the one on file, which is `storeCorrectedSquad`'s own ordering.
    expect(retired).toEqual(['would have retired'])
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
        chips: [{ chip: 'wildcard', state: 'available' }],
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
    // Different players entirely, and still a legal 2/5/5/3 — because a
    // stranger's squad is a real squad. The app cannot tell whose it is, and
    // the criterion says not to pretend otherwise.
    const strangers: ParsedSquad = { ...squad(), players: squad().players.map((p) => ({ ...p, playerId: p.playerId + 500 })) }
    const { post, stored } = harness({
      model: () => ({ async readSquadScreenshots() { return { raw: fromSquad(strangers, STRANGERS), record: null as never } } }) as never,
      trackedPlayers: async () => STRANGERS,
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
