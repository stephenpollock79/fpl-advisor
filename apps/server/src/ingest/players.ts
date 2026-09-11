/**
 * Clubs, player identity, and the per-read record of everything about a player
 * that moves.
 *
 * The split is deliberate and it is what makes F6's refresh diff possible.
 * `player` holds identity, which almost never changes. `player_state` holds one
 * row per player **per feed read** — price, news, availability, form, ownership —
 * so two reads can be compared without a snapshot of the whole world.
 *
 * And it is written for **every player FPL tracks, not only the fifteen in the
 * squad**. F6-RS-05 requires a player who was never proposed to be able to
 * surface as a brand-new candidate; storing only squad players would make that
 * impossible while looking like it worked.
 */

export type ClubRow = { id: number; name: string; shortName: string }

export type PlayerRow = {
  id: number
  clubId: number
  position: 'GKP' | 'DEF' | 'MID' | 'FWD'
  firstName: string
  surname: string
  shirtNumber: number | null
}

export type PlayerStateRow = {
  feedReadId: string
  playerId: number
  status: string
  news: string | null
  newsAdded: string | null
  chanceOfPlayingNextRound: number | null
  nowCostTenths: number
  form: number | null
  selectedByPercent: number | null
  seasonPoints: number | null
  transfersIn: number | null
  transfersOut: number | null
  /**
   * Movement since gameweek 1, in tenths. `now − this` is the gameweek-1 price
   * (STE-87). Optional: rows read before slice 5 do not carry it.
   */
  costChangeStartTenths?: number | null
}

type BootstrapPayload = {
  teams: { id: number; name: string; short_name: string }[]
  element_types: { id: number; singular_name_short: string }[]
  elements: {
    id: number
    /** Opta identifier. The join to the Premier League squad feed for shirt numbers. */
    opta_code?: string | null
    team: number
    element_type: number
    first_name: string
    second_name: string
    squad_number: number | null
    status: string
    news: string | null
    news_added: string | null
    chance_of_playing_next_round: number | null
    now_cost: number
    form: string | null
    selected_by_percent: string | null
    total_points: number | null
    transfers_in: number | null
    transfers_out: number | null
    cost_change_start?: number | null
  }[]
}

export function toClubRows(bootstrap: BootstrapPayload): ClubRow[] {
  return bootstrap.teams.map((t) => ({ id: t.id, name: t.name, shortName: t.short_name }))
}

/**
 * Player identity.
 *
 * Position comes from the feed's own `element_types` lookup rather than a
 * hard-coded 1–4 map, because a map written here would be a second copy of
 * something the feed already states, and it would be wrong silently if the feed
 * ever renumbered.
 *
 * `surname` is stored untruncated. F1-UP-03's eleven-character cut is a display
 * rule applied at render — every lookup keys off the full name, so a shortened
 * form must never reach the database.
 */
export function toPlayerRows(bootstrap: BootstrapPayload): PlayerRow[] {
  const positions = new Map(bootstrap.element_types.map((t) => [t.id, t.singular_name_short]))

  return bootstrap.elements.map((e) => {
    const position = positions.get(e.element_type)
    if (position !== 'GKP' && position !== 'DEF' && position !== 'MID' && position !== 'FWD') {
      throw new Error(`Unknown element_type ${e.element_type} for player ${e.id}: got ${position}`)
    }
    return {
      id: e.id,
      clubId: e.team,
      position,
      firstName: e.first_name,
      surname: e.second_name,
      shirtNumber: e.squad_number,
    }
  })
}

/**
 * Everything about a player that moves, as at one read.
 *
 * FPL sends several of these as strings — `form`, `selected_by_percent` — and
 * they are parsed here rather than at the point of display, so a figure is a
 * number everywhere below this line.
 *
 * `now_cost` is already in tenths of £1m, which is the unit money is stored in
 * throughout. No conversion, and no float ever holds it.
 */
export function toPlayerStateRows(
  bootstrap: BootstrapPayload,
  feedReadId: string,
): PlayerStateRow[] {
  return bootstrap.elements.map((e) => ({
    feedReadId,
    playerId: e.id,
    status: e.status,
    news: e.news === '' ? null : e.news,
    newsAdded: e.news_added,
    chanceOfPlayingNextRound: e.chance_of_playing_next_round,
    nowCostTenths: e.now_cost,
    form: numberOrNull(e.form),
    selectedByPercent: numberOrNull(e.selected_by_percent),
    seasonPoints: e.total_points,
    transfersIn: e.transfers_in,
    transfersOut: e.transfers_out,
    costChangeStartTenths: e.cost_change_start ?? null,
  }))
}

/** Null rather than NaN or zero — an absent figure must not read as a real one. */
function numberOrNull(value: string | number | null | undefined): number | null {
  if (value === null || value === undefined || value === '') return null
  const parsed = typeof value === 'number' ? value : Number(value)
  return Number.isFinite(parsed) ? parsed : null
}
