/**
 * An element FPL lists that is not a player is skipped, not fatal.
 *
 * The 2024/25 season added managers to `elements` — element type 5, "AM", for
 * the Assistant Manager chip. This season's feed has none, but the code threw on
 * any type outside the four, and a throw here fails the whole read for all 667
 * players. A manager can never be one of the fifteen, so there is nothing to
 * advise on and nothing lost by leaving it out (STE-198, the 2026-10-17 lesson:
 * one row the app does not understand must not take the feed down with it).
 */

import { describe, expect, it } from 'vitest'
import { toPlayerRows, toPlayerStateRows } from '../../apps/server/src/ingest/players.js'

const element = (id: number, elementType: number) => ({
  id,
  team: 1,
  element_type: elementType,
  first_name: 'A',
  second_name: `Player${id}`,
  web_name: `P${id}`,
  squad_number: null,
  status: 'a',
  news: '',
  news_added: null,
  chance_of_playing_next_round: null,
  now_cost: 50,
  form: '0.0',
  selected_by_percent: '0.0',
  total_points: 0,
  transfers_in: 0,
  transfers_out: 0,
})

const bootstrap = {
  teams: [],
  events: [],
  element_types: [
    { id: 1, singular_name_short: 'GKP' },
    { id: 2, singular_name_short: 'DEF' },
    { id: 3, singular_name_short: 'MID' },
    { id: 4, singular_name_short: 'FWD' },
    { id: 5, singular_name_short: 'AM' },
  ],
  elements: [element(1, 1), element(2, 3), element(900, 5)],
} as unknown as Parameters<typeof toPlayerRows>[0]

describe('STE-198 · an element that is not a player is left out, not fatal', () => {
  it('a manager in the feed is skipped and every player is still read', () => {
    expect(toPlayerRows(bootstrap).map((p) => p.id)).toEqual([1, 2])
  })

  it('its state row is skipped too, so nothing points at a player that was never stored', () => {
    expect(toPlayerStateRows(bootstrap, 'read-1').map((s) => s.playerId)).toEqual([1, 2])
  })
})
