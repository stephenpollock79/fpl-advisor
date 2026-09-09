/**
 * Resolving an FPL team identifier to the team it belongs to (STE-55).
 *
 * The payload shape below was taken from a live fetch of
 * `https://fantasy.premierleague.com/api/entry/<id>/` on 2026-09-09, so the keys
 * and their types are the real ones — including the two dozen the mapper must
 * ignore. **The values are invented.** A real entry belongs to a real person and
 * their name does not need to live in this repo to prove a mapping works.
 *
 * Public endpoints only, by team id (F7-AC-13). No FPL credentials exist
 * anywhere in this file or the module it tests, and nothing here writes to FPL.
 */

import { describe, expect, it } from 'vitest'
import { toLinkedTeam } from '../../apps/server/src/fpl/entry.js'

/** One entry, with every key the live endpoint returns. */
const entry = {
  id: 314159,
  joined_time: '2026-07-14T09:12:03.117Z',
  started_event: 1,
  favourite_team: 14,
  player_first_name: 'Ada',
  player_last_name: 'Lovelace',
  player_region_id: 241,
  player_region_name: 'England',
  player_region_iso_code_short: 'EN',
  player_region_iso_code_long: 'ENG',
  years_active: 4,
  summary_overall_points: 198,
  summary_overall_rank: 2_523_055,
  summary_event_points: 61,
  summary_event_rank: 412_004,
  current_event: 4,
  leagues: { classic: [], h2h: [], cup: {}, cup_matches: [] },
  name: 'Kloppers United',
  name_change_blocked: false,
  entered_events: [1, 2, 3, 4],
  kit: null,
  last_deadline_bank: 12,
  last_deadline_value: 1003,
  last_deadline_total_transfers: 6,
  club_badge_src: '',
}

describe('resolving an FPL team identifier', () => {
  it('F7-AC-14: maps an entry to team name, manager name and overall rank', () => {
    expect(toLinkedTeam(entry)).toEqual({
      fplTeamId: 314159,
      teamName: 'Kloppers United',
      managerName: 'Ada Lovelace',
      overallRank: 2_523_055,
    })
  })

  it('F7-AC-14: a team with no rank yet shows as unranked, never as rank zero', () => {
    // summary_overall_rank is null before a manager's first gameweek scores.
    // Zero is a *better* rank than any real one, so coercing it would show a new
    // manager the best rank in the game and store it as fact.
    expect(toLinkedTeam({ ...entry, summary_overall_rank: null }).overallRank).toBeNull()
  })
})
