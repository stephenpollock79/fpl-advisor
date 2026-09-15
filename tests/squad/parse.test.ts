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
