/**
 * The call card's evaluation table, and the sentence built from it.
 *
 * One master row list, identical on every call (F3-AC-16), with a winner per row
 * (F3-AC-19) and a tie that is legitimately neither (F3-AC-20). It lives in the
 * engine for the same reason net does: the server builds the fallback reasoning
 * from it and the client recomputes it when a candidate is swapped (F3-AC-24),
 * and two implementations of "who wins this row" are how a card's highlights and
 * its sentence come to disagree.
 */

import { describe, expect, it } from 'vitest'
import { type CardPlayer, evaluationRows, formatRowValue, templateReasoning } from '../../packages/engine/src/index.js'

const tzolis: CardPlayer = {
  availability: { eligible: true },
  chanceOfPlayingNextRound: null,
  form: 2.1,
  projection: 2.4,
  fixtures: [{ opponent: 'BOU', isHome: true, difficulty: 3 }],
  priceTenths: 64,
  selectedByPercent: 4.2,
  seasonPoints: 11,
  transfersIn: 1200,
  transfersOut: 30000,
}

const rogers: CardPlayer = {
  availability: { eligible: true },
  chanceOfPlayingNextRound: null,
  form: 6.3,
  projection: 7.0,
  fixtures: [{ opponent: 'BUR', isHome: true, difficulty: 2 }],
  priceTenths: 76,
  selectedByPercent: 21.5,
  seasonPoints: 29,
  transfersIn: 90000,
  transfersOut: 4000,
}

describe('F3-AC-16 · one master row list', () => {
  it('F3-AC-16: the nine rows, in order, on an ordinary week', () => {
    expect(evaluationRows(tzolis, rogers).map((r) => r.key)).toEqual([
      'availability',
      'form',
      'xpts',
      'fixtures',
      'price',
      'selected_by',
      'season_points',
      'transfers_in',
      'transfers_out',
    ])
  })

  it('F3-AC-16: a games-this-gameweek row leads in a blank or double week', () => {
    const blank = { ...tzolis, fixtures: [], projection: 0 }
    const rows = evaluationRows(blank, rogers)
    expect(rows[0]?.key).toBe('games')
    expect(rows[0]?.winner).toBe('in')
    expect(rows).toHaveLength(10)
  })
})

describe('F3-AC-19, F3-AC-20 · a winner per row, and honest ties', () => {
  it('F3-AC-19: each row names the side that wins it', () => {
    const winners = Object.fromEntries(evaluationRows(tzolis, rogers).map((r) => [r.key, r.winner]))
    expect(winners).toEqual({
      availability: 'tie',
      form: 'in',
      xpts: 'in',
      fixtures: 'in',
      // Cheaper is better on the price row — Tzolis is 6.4, Rogers 7.6.
      price: 'out',
      selected_by: 'tie',
      season_points: 'in',
      transfers_in: 'in',
      transfers_out: 'in',
    })
  })

  it('F3-AC-20: selected-by never has a winner — ownership is not better or worse', () => {
    const rows = evaluationRows(tzolis, { ...rogers, selectedByPercent: 60 })
    expect(rows.find((r) => r.key === 'selected_by')?.winner).toBe('tie')
  })

  it('F3-AC-20: equal values tie, and a missing value never wins', () => {
    const rows = evaluationRows({ ...tzolis, form: 3 }, { ...rogers, form: 3, seasonPoints: null })
    expect(rows.find((r) => r.key === 'form')?.winner).toBe('tie')
    expect(rows.find((r) => r.key === 'season_points')?.winner).toBe('out')
  })

  it('F3-AC-19: a player the gate excludes loses availability to one it lets through', () => {
    const hurt = { ...tzolis, availability: { eligible: false, reason: 'injured' } as const, chanceOfPlayingNextRound: 0 }
    expect(evaluationRows(hurt, rogers).find((r) => r.key === 'availability')?.winner).toBe('in')
  })
})

describe('F3-AC-16 · how a row reads', () => {
  it('F3-AC-16: a price reads in pounds, never in the tenths it is stored in', () => {
    expect(formatRowValue('price', 76)).toBe('£7.6m')
    expect(formatRowValue('availability', 75)).toBe('75%')
    expect(formatRowValue('transfers_in', 90000)).toBe('90k')
    expect(formatRowValue('form', null)).toBe('—')
  })
})

describe('F3-AC-22 · the templated sentence', () => {
  it('F3-AC-22: names the recommended player and only dimensions the table shows', () => {
    const line = templateReasoning(evaluationRows(tzolis, rogers), 'Tzolis', 'Rogers')

    expect(line).toMatch(/^Rogers/)
    expect(line).toContain('7.0')
    // Nothing that is not a row on the card.
    expect(line).not.toMatch(/news|injur|press|rotation|minutes|goal|assist|clean sheet|odds|chance|likel|probab/i)
    // Four lines on a 390-wide card is roughly 180 characters.
    expect(line.length).toBeLessThanOrEqual(180)
  })

  it('F3-AC-22: says so plainly when the incoming player wins nothing but the headline', () => {
    const line = templateReasoning(evaluationRows({ ...rogers, projection: 2 }, { ...rogers, projection: 3 }), 'A', 'B')
    expect(line).toMatch(/^B/)
    expect(line).toContain('3.0')
  })
})
