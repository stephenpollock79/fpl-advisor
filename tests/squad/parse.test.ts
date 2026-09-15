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

  it('F2-UP-01: two substitutes claiming one slot are ranked by the order they were read', () => {
    // **The bench order is a ranking, and it is derived rather than demanded.**
    // Requiring four distinct integers made this the one thing standing between
    // a correct fifteen and a refused upload on 2026-09-15 — every name matched
    // and it failed on "the bench order was not legible". Reading who is on the
    // bench is the job; not repeating a number is bookkeeping, and that is ours.
    const players = fifteen()
    const last = players[14] as { benchOrder: number | null } | undefined
    if (last) last.benchOrder = 1

    const result = parseSquad(raw({ team: { players, chips: [{ chip: 'wildcard', state: 'available' }] } }))

    expect(result.ok).toBe(true)
    if (!result.ok) return
    // Still four, still 0 to 3, and in the order they were listed.
    expect(result.squad.players.filter((p) => !p.isStarter).map((p) => p.benchOrder).sort()).toEqual([0, 1, 2, 3])
  })

  it('F2-UP-01: three substitutes is a failed read of the eleven, and says so', () => {
    const players = fifteen()
    const twelfth = players[11] as { isStarter: boolean } | undefined
    if (twelfth) twelfth.isStarter = true

    const result = parseSquad(raw({ team: { players, chips: [{ chip: 'wildcard', state: 'available' }] } }))

    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.failure.because).toMatch(/starts eleven|substitutes/)
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

describe('F2-AC-01, F2-UP-01 · the second picture is read for the fifteen too', () => {
  /**
   * **Both screenshots show all fifteen names, and the read is not
   * deterministic** — the same two pictures gave fifteen one attempt and
   * fourteen the next (2026-09-15). The Transfers screen lays the squad out by
   * position rather than by selection, so it is useless for who starts and a
   * genuinely independent second look at who is *in*.
   *
   * **Each test causes its own trigger** (P16): a Team list that is actually
   * short, beside a Transfers list that actually holds the missing name.
   */
  const alsoOnTransfers = (ids: number[]) =>
    ids.map((id) => ({ playerId: id, name: `Player${String(id)}` }))

  it('F2-UP-01: a substitute the Team read dropped is recovered from the Transfers screen, and lands last on the bench', () => {
    // Fourteen shirts read, the fourth substitute lost. The other picture has him.
    const result = parseSquad({
      team: { players: fifteen().slice(0, 14), chips: [{ chip: 'wildcard', state: 'available' }] },
      transfers: { bankTenths: 28, freeTransfers: 2, players: alsoOnTransfers([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15]) },
    })

    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.squad.players).toHaveLength(15)
    // **His place is worked out, not guessed.** Eleven already read as starting
    // means the missing man is a substitute, and the bench place nobody claimed
    // is the one he stood in.
    const recovered = result.squad.players.find((p) => p.playerId === 15)
    expect(recovered?.isStarter).toBe(false)
    expect(recovered?.benchOrder).toBe(3)
  })

  it('F2-UP-01: a starter the Team read dropped is recovered, and starts, because only ten were read as starting', () => {
    const short = fifteen().filter((p) => p.playerId !== 6)

    const result = parseSquad({
      team: { players: short, chips: [{ chip: 'wildcard', state: 'available' }] },
      transfers: { bankTenths: 28, freeTransfers: 2, players: alsoOnTransfers([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15]) },
    })

    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.squad.players.filter((p) => p.isStarter)).toHaveLength(11)
    expect(result.squad.players.find((p) => p.playerId === 6)?.isStarter).toBe(true)
  })

  it('F2-UP-01: a shirt whose name was unreadable keeps the armband the Team read did see', () => {
    // **The armband was legible and the name was not** — a slot the Team read
    // described fully and could not put a player in. The recovered name goes
    // into that slot rather than into a derived one, so the captaincy survives.
    const players = fifteen()
    const captain = players[0] as Record<string, unknown> | undefined
    if (captain) captain['playerId'] = 'smudged'

    const result = parseSquad({
      team: { players, chips: [{ chip: 'wildcard', state: 'available' }] },
      transfers: { bankTenths: 28, freeTransfers: 2, players: alsoOnTransfers([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15]) },
    })

    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.squad.players.find((p) => p.isCaptain)?.playerId).toBe(1)
  })

  it('F2-UP-01: two players missing is refused rather than arranged, and the failure says the second picture did not close it', () => {
    // **One gap and one spare name has a single answer; two of each is a
    // choice.** A coin toss dressed as a match is what all-or-nothing exists to
    // stop, so this still applies nothing.
    const result = parseSquad({
      team: { players: fifteen().slice(0, 13), chips: [{ chip: 'wildcard', state: 'available' }] },
      transfers: { bankTenths: 28, freeTransfers: 2, players: alsoOnTransfers([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15]) },
    })

    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.failure.because).toMatch(/did not make up the difference/)
  })

  it('F2-UP-01: a complete Team read is not second-guessed by a Transfers read that saw fewer', () => {
    // **It recovers, it never rejects.** A name the other picture missed is not
    // evidence against a name this one read — treating it as such would be a
    // new way for a good upload to fail.
    const result = parseSquad({
      team: { players: fifteen(), chips: [{ chip: 'wildcard', state: 'available' }] },
      transfers: { bankTenths: 28, freeTransfers: 2, players: alsoOnTransfers([1, 2, 3, 99]) },
    })

    expect(result.ok).toBe(true)
  })
})

describe('F2-UP-01 · a name the card ran out of room for', () => {
  /**
   * **FPL truncates a long shirt name on the pitch card** — "Calvert-Le…" is
   * what is printed, and the picture holds nothing else. An honest read reports
   * it as printed, it matches no player, and the whole upload fails (found live
   * 2026-09-15 on Calvert-Lewin).
   *
   * **The trigger is the truncation**, so every test here supplies a genuinely
   * cut-off name rather than a flag saying one was cut off (P16).
   */
  const positions: Record<number, string> = {
    1: 'GKP', 12: 'GKP',
    2: 'DEF', 3: 'DEF', 4: 'DEF', 13: 'DEF', 14: 'DEF',
    5: 'MID', 6: 'MID', 7: 'MID', 8: 'MID', 15: 'MID',
    9: 'FWD', 10: 'FWD', 11: 'FWD',
  }
  const known = (names: Record<number, string> = {}) =>
    Object.entries(positions).map(([id, position]) => ({
      id: Number(id),
      name: names[Number(id)] ?? `Player${id}`,
      position,
    }))

  const teamReading = (override: Record<number, unknown> = {}) =>
    fifteen().map((p) =>
      Object.hasOwn(override, p.playerId) ? { ...p, ...(override[p.playerId] as object) } : p,
    )

  it('F2-UP-01: a shirt name the app cut short resolves to the one player it can be, and a correct id does not rescue it on its own', () => {
    // The id beside it is right. It changes nothing — the name decides, and a
    // name no player answers to resolves to nobody. Only the expansion saves it.
    const result = parseSquad(
      {
        team: { players: teamReading({ 9: { name: 'Calvert-Le…' } }), chips: [{ chip: 'wildcard', state: 'available' }] },
        transfers: { bankTenths: 28, freeTransfers: 2 },
      },
      known({ 9: 'Calvert-Lewin' }),
    )

    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.squad.players.map((p) => p.playerId)).toContain(9)
  })

  it('F2-UP-01: a cut-off name two players could both begin with resolves to neither', () => {
    // **Two candidates is a coin toss.** The all-or-nothing rule exists so a
    // doubtful read fails loudly rather than shipping a plausible wrong squad.
    const result = parseSquad(
      {
        team: { players: teamReading({ 9: { name: 'Wilson-Ca…' } }), chips: [{ chip: 'wildcard', state: 'available' }] },
        transfers: { bankTenths: 28, freeTransfers: 2 },
      },
      known({ 9: 'Wilson-Carter', 10: 'Wilson-Cavendish' }),
    )

    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.failure.because).toMatch(/could not be matched to a known player/)
  })

  it('F2-UP-01: a name a player answers to whole is never re-read as the start of a longer one', () => {
    // A real surname that happens to begin another is matched exactly, because
    // the expansion runs only once an exact match has already failed.
    const result = parseSquad(
      {
        team: {
          players: teamReading({ 9: { name: 'Ward' }, 10: { name: 'Ward-Prowse' } }),
          chips: [{ chip: 'wildcard', state: 'available' }],
        },
        transfers: { bankTenths: 28, freeTransfers: 2 },
      },
      known({ 9: 'Ward', 10: 'Ward-Prowse' }),
    )

    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.squad.players.map((p) => p.playerId)).toContain(9)
  })

  it('F2-UP-01, F2-AC-01: a cut-off name and a slot the read could not name, together, still make fifteen', () => {
    // **The upload that failed on 2026-09-15, end to end.** One shirt the app
    // cut short, and one slot the read reported without being able to name it
    // at all — the picture was perfectly legible, the read simply came back
    // short, as it does. The expansion places the first, the other picture
    // places the second.
    const result = parseSquad(
      {
        team: {
          players: teamReading({ 9: { name: 'Calvert-Le…' }, 15: { name: '', playerId: 0 } }),
          chips: [{ chip: 'wildcard', state: 'available' }],
        },
        transfers: {
          bankTenths: 28,
          freeTransfers: 2,
          players: Array.from({ length: 15 }, (_, i) => ({ playerId: i + 1, name: `Player${String(i + 1)}` })),
        },
      },
      known({ 9: 'Calvert-Lewin' }),
    )

    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.squad.players).toHaveLength(15)
    expect(result.squad.players.filter((p) => p.isStarter)).toHaveLength(11)
    expect(result.squad.players.find((p) => p.playerId === 15)?.isStarter).toBe(false)
  })
})

describe('F2-UP-01 · the armbands are two different shirts', () => {
  it('F2-UP-01: one shirt read as both captain and vice is refused, though each count is still one', () => {
    // **The hole the two counts leave.** One captain and one vice both pass
    // when a single player carries both letters — which is what a read that
    // found one armband and reported it twice looks like. The squad would then
    // fall back from an unavailable captain to himself.
    const players = fifteen()
    const first = players[0] as Record<string, unknown> | undefined
    const second = players[1] as Record<string, unknown> | undefined
    if (first) first['isVice'] = true
    if (second) second['isVice'] = false

    const result = parseSquad({
      team: { players, chips: [{ chip: 'wildcard', state: 'available' }] },
      transfers: { bankTenths: 28, freeTransfers: 2 },
    })

    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.failure.because).toMatch(/both captain and vice-captain/)
  })
})

describe('F2-UP-01 · the card carries more than a name', () => {
  /**
   * **Every guard before these was about the shape of the squad**, and a wrong
   * player in the right position satisfies all of them. On 2026-09-15 one slot
   * came back as three different Chelsea defenders across three uploads while
   * the pitch drew an ordinary 3-4-3 each time, and a budget printed £0.2m was
   * stored as £20.2m.
   *
   * Both facts the checks use are printed on the card beside the name — the
   * fixture and the price — and neither is derived from the name, so neither
   * agrees with a misread one by accident.
   */
  const positions: Record<number, string> = {
    1: 'GKP', 12: 'GKP',
    2: 'DEF', 3: 'DEF', 4: 'DEF', 13: 'DEF', 14: 'DEF',
    5: 'MID', 6: 'MID', 7: 'MID', 8: 'MID', 15: 'MID',
    9: 'FWD', 10: 'FWD', 11: 'FWD',
  }

  /** The squad is all Arsenal, who are away at Brighton. Badiashile is not. */
  const pool = (over: Record<number, Partial<{ name: string; club: string; priceTenths: number }>> = {}) => [
    ...Object.entries(positions).map(([id, position]) => ({
      id: Number(id),
      name: over[Number(id)]?.name ?? (Number(id) === 3 ? 'Calafiori' : `Player${id}`),
      position,
      club: over[Number(id)]?.club ?? 'ARS',
      priceTenths: over[Number(id)]?.priceTenths ?? 66,
    })),
    { id: 99, name: 'Badiashile', position: 'DEF', club: 'CHE', priceTenths: 66 },
  ]

  const FIXTURES = [
    { club: 'ARS', opponent: 'BHA', isHome: false },
    { club: 'BHA', opponent: 'ARS', isHome: true },
    { club: 'CHE', opponent: 'LIV', isHome: true },
  ]

  /** Fifteen Arsenal cards, each printing "BHA (A)" under the name. */
  const cards = (over: Record<number, Record<string, unknown>> = {}) =>
    fifteen().map((p) => ({
      ...p,
      name: p.playerId === 3 ? 'Calafiori' : p.name,
      opponent: 'BHA',
      isHome: false,
      ...(over[p.playerId] ?? {}),
    }))

  const read = (over: Record<number, Record<string, unknown>> = {}, bank = 28): RawParse => ({
    team: { players: cards(over), chips: [{ chip: 'wildcard', state: 'available' }] },
    transfers: { bankTenths: bank, freeTransfers: 2 },
  })

  it('F2-UP-01: a defender read as another club’s defender is refused, because his club does not play that opponent', () => {
    // **The live defect.** The card says Calafiori, BHA (A) — Arsenal away at
    // Brighton. The read says Badiashile, who is Chelsea. He is a defender, so
    // the squad is still 2/5/5/3 and nothing about its shape objects.
    const wrong = { 3: { name: 'Badiashile', playerId: 99 } }

    // Without the fixture list there is nothing to catch it, and this is
    // exactly the squad that reached the pitch.
    expect(parseSquad(read(wrong), pool()).ok).toBe(true)

    const result = parseSquad(read(wrong), pool(), FIXTURES)

    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.failure.screen).toBe('team')
  })

  it('F2-UP-01: the venue is checked too, so the right opponent on the wrong side of the tie is refused', () => {
    // Arsenal are away at Brighton. A card read as BHA (H) is not this fixture,
    // and reading the wrong column is how a hard match renders as an easy one.
    const result = parseSquad(read({ 3: { isHome: true } }), pool(), FIXTURES)

    expect(result.ok).toBe(false)
  })

  it('F2-UP-01: a club with no fixture this week prints none, and nothing is refused for its absence', () => {
    // **A fact the card does not carry cannot disagree.** A blanking club's
    // card is empty where the fixture goes, and refusing on that would fail
    // every upload in a blank gameweek.
    const result = parseSquad(
      read({ 3: { opponent: '', isHome: false } }),
      pool({ 3: { club: 'NFO' } }),
      FIXTURES,
    )

    expect(result.ok).toBe(true)
  })

  it('F2-UP-01: a doubling club plays twice, and either match agreeing is agreement', () => {
    // Nothing is summed and nothing is chosen between — the second fixture is
    // as much this club's week as the first.
    const result = parseSquad(read({ 3: { opponent: 'LIV', isHome: true } }), pool(), [
      ...FIXTURES,
      { club: 'ARS', opponent: 'LIV', isHome: true },
    ])

    expect(result.ok).toBe(true)
  })

  it('F2-UP-01: the second picture can no longer fill a gap with a name its own price contradicts', () => {
    // **The hole the recovery opened, closed.** A slot the Team read could not
    // place used to be filled from the other picture with nothing to check the
    // filled name against — turning a refused upload into a silently wrong
    // player. The price printed beside it is that check: the card says £6.6m
    // and this player is £4.9m, so he is not the man on the card.
    const short = cards().filter((p) => p.playerId !== 3)

    const result = parseSquad(
      {
        team: { players: short, chips: [{ chip: 'wildcard', state: 'available' }] },
        transfers: {
          bankTenths: 28,
          freeTransfers: 2,
          players: [{ playerId: 99, name: 'Badiashile', opponent: 'LIV', isHome: true, priceTenths: 49 }],
        },
      },
      pool(),
      FIXTURES,
    )

    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.failure.because).toMatch(/did not make up the difference/)
  })

  it('F2-UP-01: a bank read an order of magnitude high is refused, and the failure names both figures', () => {
    // **£0.2m read as £20.2m**, because the pound sign in front of it was taken
    // for a 2. Fifteen at £6.6m is £99.0m, which with £20.2m in the bank comes
    // to £119.2m — more than any squad has ever been worth.
    const result = parseSquad(read({}, 202), pool(), FIXTURES)

    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.failure.screen).toBe('transfers')
    expect(result.failure.because).toMatch(/£20\.2m/)
    expect(result.failure.because).toMatch(/£99\.0m/)
  })

  it('F2-UP-01: the same bank passes where the squad it sits beside is cheap enough to allow it', () => {
    // The ceiling catches a misread digit, not a rich team. Fifteen at £4.0m
    // leaves room for a bank that would be absurd beside an expensive squad.
    const cheap = Object.fromEntries(Object.keys(positions).map((id) => [Number(id), { priceTenths: 40 }]))
    const result = parseSquad(read({}, 202), pool(cheap), FIXTURES)

    expect(result.ok).toBe(true)
  })
})

describe('F2-UP-01 · the badge is a letter, not a verdict', () => {
  /**
   * **Asked outright who the vice-captain was, the read twice gave it to a
   * shirt carrying a star for bonus points** (2026-09-15, either side of a
   * prompt that spelled out what an armband looks like). Four other shirts on
   * that screenshot carried a badge, all in the same corner.
   *
   * So the read now reports the character in the badge and code decides what it
   * means. **Each test supplies real badges rather than the flags they imply**
   * (P16).
   */
  const badged = (badges: Record<number, string>) =>
    fifteen().map((p) => {
      const { isCaptain: _c, isVice: _v, ...rest } = p
      return { ...rest, badge: badges[p.playerId] ?? '' }
    })

  const read = (badges: Record<number, string>): RawParse => ({
    team: { players: badged(badges), chips: [{ chip: 'wildcard', state: 'available' }] },
    transfers: { bankTenths: 28, freeTransfers: 2 },
  })

  it('F2-UP-01: a C and a V make the captain and the vice, off the letters alone', () => {
    const result = parseSquad(read({ 1: 'C', 2: 'V' }))

    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.squad.players.find((p) => p.isCaptain)?.playerId).toBe(1)
    expect(result.squad.players.find((p) => p.isVice)?.playerId).toBe(2)
  })

  it('F2-UP-01: a star beside the real V leaves the armband where it belongs', () => {
    // **The live defect.** The star is on João Pedro for bonus points and the
    // V is on Calvert-Lewin, and the two used to come back the wrong way round.
    // A badge that is not a letter now makes nobody anything.
    const result = parseSquad(read({ 1: 'C', 2: '★', 3: 'V' }))

    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.squad.players.find((p) => p.isVice)?.playerId).toBe(3)
  })

  it('F2-UP-01: a screen where no badge holds a V is refused rather than given to the nearest star', () => {
    // **Loud, not plausible.** A vice-captain who is not the vice-captain shows
    // nothing wrong on screen, and the advice is built on him.
    const result = parseSquad(read({ 1: 'C', 2: '★' }))

    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.failure.because).toMatch(/vice-captain/)
  })
})
