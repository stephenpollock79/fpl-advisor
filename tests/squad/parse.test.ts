/**
 * Reading two screenshots (F2-AC-01 – F2-AC-04, F2-UP-01).
 *
 * **Every failure here is fabricated, and that is the point** — four of fifteen
 * legible, a missing bank, the wrong screen entirely. None can be produced on
 * demand from a real phone, so a parse that could only be exercised against a
 * real upload would never be exercised at all.
 *
 * **Each test causes its own trigger** (P16): a partial read is a genuinely
 * partial input, not a flag handed in.
 */

import { describe, expect, it } from 'vitest'
import { type RawParse, parseSquad } from '../../apps/server/src/squad/parse'

const player = (id: number, extra: Record<string, unknown> = {}) => ({
  playerId: id,
  // **The name is what identifies a player now**, and the id only breaks a tie
  // between two who share one. A fixture that carried ids alone was testing the
  // design that shipped wrong players on 2026-09-15.
  name: `Player${String(id)}`,
  isStarter: true,
  benchOrder: null,
  isCaptain: false,
  isVice: false,
  ...extra,
})

/** Eleven starting, four on the bench, one captain, one vice — a legal read. */
const fifteen = () => [
  ...Array.from({ length: 11 }, (_, i) => player(i + 1, i === 0 ? { isCaptain: true } : i === 1 ? { isVice: true } : {})),
  player(12, { isStarter: false, benchOrder: 0 }),
  player(13, { isStarter: false, benchOrder: 1 }),
  player(14, { isStarter: false, benchOrder: 2 }),
  player(15, { isStarter: false, benchOrder: 3 }),
]

const raw = (extra: Partial<RawParse> = {}): RawParse => ({
  team: { players: fifteen(), chips: [{ chip: 'wildcard', state: 'available' }, { chip: 'bboost', state: 'spent' }] },
  transfers: { bankTenths: 28, freeTransfers: 2 },
  ...extra,
})

describe('F2-AC-01, F2-AC-02 · what each picture owes', () => {
  it('F2-AC-01, F2-AC-02: a clean read of both gives the fifteen, the armbands, the chips, the bank and the free transfers', () => {
    const result = parseSquad(raw())

    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.squad.players).toHaveLength(15)
    expect(result.squad.players.filter((p) => p.isStarter)).toHaveLength(11)
    expect(result.squad.players.find((p) => p.isCaptain)?.playerId).toBe(1)
    expect(result.squad.players.find((p) => p.isVice)?.playerId).toBe(2)
    expect(result.squad.chipsRemaining).toEqual({ wildcard: 'available', bboost: 'spent' })
    expect(result.squad.bankTenths).toBe(28)
    expect(result.squad.freeTransfers).toBe(2)
  })

  it('F2-AC-02: money arrives as whole tenths, so nothing downstream ever holds a float', () => {
    const result = parseSquad(raw({ transfers: { bankTenths: 2.8, freeTransfers: 1 } }))

    // £2.8m is 28, not 2.8. A fractional read is a failed read, not a rounding job.
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.failure.screen).toBe('transfers')
  })
})

describe('F2-UP-01 · a wrong match is caught by the shape of the squad', () => {
  /** 2 GKP, 5 DEF, 5 MID, 3 FWD — what every legal FPL squad holds. */
  const positions: Record<number, string> = {
    1: 'GKP', 12: 'GKP',
    2: 'DEF', 3: 'DEF', 4: 'DEF', 13: 'DEF', 14: 'DEF',
    5: 'MID', 6: 'MID', 7: 'MID', 8: 'MID', 15: 'MID',
    9: 'FWD', 10: 'FWD', 11: 'FWD',
  }
  const known = (override: Record<number, string> = {}) =>
    Object.entries({ ...positions, ...override }).map(([id, position]) => ({
      id: Number(id),
      name: `Player${id}`,
      position,
    }))
  const legal = known()

  it('F2-UP-01: a legal fifteen passes the composition check', () => {
    expect(parseSquad(raw(), legal).ok).toBe(true)
  })

  it('F2-UP-01: a forward matched to a midfielder is refused, not shown as a 3-5-2', () => {
    // **The defect this exists for.** On 2026-09-15 João Pedro was matched to a
    // midfielder, landed in midfield, and the formation quietly read 3-5-2 for
    // a 3-4-3 side. Nothing looked broken — which is why a name check alone is
    // not enough and the squad's own shape has to be the guard.
    const result = parseSquad(raw(), known({ 9: 'MID' }))

    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.failure.because).toMatch(/matched to the wrong name/)
    expect(result.failure.because).toMatch(/6 MID where a squad has 5/)
    // **And it names who it put where.** A count alone says something is wrong
    // and nothing about what, which is the fault every message in this path
    // had on 2026-09-15 — the player in the wrong line is the misread one.
    expect(result.failure.because).toMatch(/MID: .*Player9/)
    expect(result.failure.because).toMatch(/FWD: /)
  })

  it('F2-UP-01: an id the read copied wrongly is resolved from the name it saw', () => {
    // **Reading the name is the model's job; resolving it is code's.** A
    // three-digit id copied fifteen times is where a slip happens, and one slip
    // failed a whole upload under the all-or-nothing rule (2026-09-15). The
    // trigger is exactly that: an id that is not a player, beside a name that
    // is.
    const players = fifteen()
    const slipped = players[6] as Record<string, unknown> | undefined
    if (slipped) {
      slipped['playerId'] = 9999
      slipped['name'] = 'Player7'
    }

    const result = parseSquad(raw({ team: { players, chips: [{ chip: 'wildcard', state: 'available' }] } }), legal)

    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.squad.players.map((p) => p.playerId)).toContain(7)
    expect(result.squad.players.map((p) => p.playerId)).not.toContain(9999)
  })

  it('F2-UP-01: a name that is in no list is named in the failure, not counted', () => {
    // "One of fifteen" sends the manager back to his camera roll. Naming the
    // player is something anyone can act on, and says at once whether it is a
    // reading problem or a gap in our own list.
    const players = fifteen()
    const stranger = players[6] as Record<string, unknown> | undefined
    if (stranger) {
      stranger['playerId'] = 9999
      stranger['name'] = 'Ajayi'
    }

    const result = parseSquad(raw({ team: { players, chips: [{ chip: 'wildcard', state: 'available' }] } }), legal)

    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.failure.because).toContain('Ajayi')
  })

  it('F2-UP-01: a valid id belonging to the wrong player loses to the name on the shirt', () => {
    // **The failure this design replaces.** The read returned ids that were
    // perfectly valid and belonged to the wrong players — Szoboszlai matched to
    // Curtis Jones, van Hecke to Igor, both right club and wrong man. A
    // fallback that fires only on an *invalid* id never fires on those.
    const players = fifteen()
    const wrongMan = players[6] as Record<string, unknown> | undefined
    if (wrongMan) {
      wrongMan['playerId'] = 3 // a real player, and not this one
      wrongMan['name'] = 'Player7'
    }

    const result = parseSquad(raw({ team: { players, chips: [{ chip: 'wildcard', state: 'available' }] } }), legal)

    expect(result.ok).toBe(true)
    if (!result.ok) return
    // The name won. Player 3 is not in twice, and player 7 is present.
    expect(result.squad.players.map((p) => p.playerId)).toContain(7)
    expect(result.squad.players.filter((p) => p.playerId === 3)).toHaveLength(1)
  })

  it('F2-UP-01: a shirt read as "Gross" matches the player FPL calls "Groß"', () => {
    // **Every other accent survives the strip; ß does not.** Kinský decomposes
    // to kinsky and João to joao, but ß is removed outright — leaving Groß as
    // "gro" while a reader writing "Gross" gives "gross". He is one of the
    // fifteen this was built for, so the case is real rather than theoretical.
    const players = fifteen()
    const german = players[6] as Record<string, unknown> | undefined
    if (german) german['name'] = 'Gross'

    const withGross = legal.map((p) => (p.id === 7 ? { ...p, name: 'Groß' } : p))
    const result = parseSquad(raw({ team: { players, chips: [{ chip: 'wildcard', state: 'available' }] } }), withGross)

    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.squad.players.map((p) => p.playerId)).toContain(7)
  })

  it('F2-UP-01: where two players share a name, the id is what settles it', () => {
    // The one case a name genuinely cannot decide — and the only case the id is
    // still trusted for. Player 7 and player 900 both read as "Silva"; the read
    // names Silva and gives 7, which is one of the two.
    const players = fifteen()
    const shared = players[6] as Record<string, unknown> | undefined
    if (shared) shared['name'] = 'Silva'

    const twoSilvas = [
      ...legal.map((p) => (p.id === 7 ? { ...p, name: 'Silva' } : p)),
      { id: 900, name: 'Silva', position: 'MID' },
    ]

    const result = parseSquad(raw({ team: { players, chips: [{ chip: 'wildcard', state: 'available' }] } }), twoSilvas)

    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.squad.players.map((p) => p.playerId)).toContain(7)
  })

  it('F2-UP-01: a name two players share, with an id belonging to neither, resolves to nobody', () => {
    // The fallback must not become a guess. Two players called the same thing
    // is a real case, and picking the last one would be a coin toss wearing a
    // match's clothes.
    const players = fifteen()
    const slipped = players[6] as Record<string, unknown> | undefined
    if (slipped) {
      slipped['playerId'] = 9999
      slipped['name'] = 'Silva'
    }

    const twoSilvas = [...legal, { id: 900, name: 'Silva', position: 'MID' }].map((p) =>
      p.id === 7 ? { ...p, name: 'Silva' } : p,
    )
    const result = parseSquad(raw({ team: { players, chips: [{ chip: 'wildcard', state: 'available' }] } }), twoSilvas)

    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.failure.because).toContain('Silva')
  })

  it('F2-UP-01: a player the list does not hold is refused rather than dropped', () => {
    const result = parseSquad(raw(), legal.filter((p) => p.id !== 7))

    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.failure.because).toMatch(/could not be matched to a known player/)
  })
})

describe('F2-UP-01 · all-or-nothing, and which picture fell short', () => {
  it('F2-UP-01: four of fifteen legible applies nothing, and the failure names the Team screenshot', () => {
    // The trigger is a genuinely partial Team read — the case the criterion
    // quotes word for word.
    const result = parseSquad(raw({ team: { players: fifteen().slice(0, 4), chips: [{ chip: 'wildcard', state: 'available' }] } }))

    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.failure.screen).toBe('team')
    expect(result.failure.because).toBe('only 4 of 15 players legible on the Team screenshot')
  })

  it('F2-UP-01: fifteen shirts read but one unmatched says so, rather than blaming the picture', () => {
    // **Two faults wore one message.** Fifteen read with one unmatched is our
    // list being short, and retaking the photo cannot fix it; fewer than
    // fifteen read is the picture. Telling them apart is the difference
    // between a useful instruction and a wasted evening (2026-09-15).
    const players = fifteen()
    const last = players[14] as Record<string, unknown> | undefined
    if (last) last.playerId = 'not-a-player'

    const result = parseSquad(raw({ team: { players, chips: [{ chip: 'wildcard', state: 'available' }] } }))

    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.failure.because).toMatch(/could not be matched to a known player/)
    expect(result.failure.because).toMatch(/our end, not your picture/)
  })

  it('F2-UP-01: a missing bank applies nothing, and the failure names the Transfers screenshot', () => {
    const result = parseSquad(raw({ transfers: { freeTransfers: 1 } }))

    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.failure.screen).toBe('transfers')
    expect(result.failure.because).toMatch(/bank/)
  })

  it('F2-UP-01: a missing free-transfer figure applies nothing, even with a perfect Team read', () => {
    // **The half that would otherwise slip through.** Fifteen players read
    // cleanly is the expensive part; it is not the whole read.
    const result = parseSquad(raw({ transfers: { bankTenths: 5 } }))

    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.failure.screen).toBe('transfers')
    expect(result.failure.because).toMatch(/free transfers/)
  })

  it('F2-UP-01: a Team screenshot with no chip row fails, rather than reading as no chips left', () => {
    // Every FPL team has a chip row, so its absence means the wrong picture —
    // and an empty row would quietly tell the manager he has none remaining.
    const result = parseSquad(raw({ team: { players: fifteen(), chips: [] } }))

    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.failure.because).toMatch(/chips row/)
  })

  it('F2-UP-01: twelve read as starting fails, because a team starts eleven', () => {
    const players = fifteen()
    const twelfth = players[11]
    if (twelfth) twelfth.isStarter = true
    const result = parseSquad(raw({ team: { players, chips: [{ chip: 'wildcard', state: 'available' }] } }))

    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.failure.because).toMatch(/starts eleven/)
  })

  it('F2-UP-01: a bench whose order is not legible fails rather than guessing it', () => {
    const players = fifteen()
    const last = players[14] as { benchOrder: number | null } | undefined
    // Two bench players claiming slot 1: an order that was not actually read.
    if (last) last.benchOrder = 1
    const result = parseSquad(raw({ team: { players, chips: [{ chip: 'wildcard', state: 'available' }] } }))

    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.failure.because).toMatch(/bench order/)
  })

  it('F2-UP-01: two captains fails, because the armband was not actually read', () => {
    const players = fifteen()
    const second = players[1]
    if (second) second.isCaptain = true
    const result = parseSquad(raw({ team: { players, chips: [{ chip: 'wildcard', state: 'available' }] } }))

    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.failure.because).toMatch(/captain/)
  })

  it('F2-UP-01: the wrong screen entirely fails on the Team read first', () => {
    // Nothing legible at all — the third of the three causes the failure screen
    // names, and the one a manager is most likely to hit.
    const result = parseSquad({})

    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.failure.screen).toBe('team')
    expect(result.failure.because).toBe('only 0 of 15 players legible on the Team screenshot')
  })
})
