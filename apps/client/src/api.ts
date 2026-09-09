// Data fetching lives here, never in a component (CLAUDE.md, Architecture
// invariants). This module is the single place a move off client rendering
// would have to happen — see ADR 0005's reversal cost.
//
// Every call is same-origin /api/*. In development Vite proxies that to the
// server, so no build carries an API origin and CORS never enters the picture.

/** The four fields shown back before anything is stored (F7-AC-14). */
export type LinkedTeam = {
  fplTeamId: number
  teamName: string
  managerName: string
  /** Null until the manager's first gameweek scores. */
  overallRank: number | null
}

export type Me = {
  manager: {
    user_id: string
    fpl_team_id: number | null
    team_name: string | null
    manager_name: string | null
    overall_rank: number | null
  } | null
  needsTeamLink: boolean
}

/**
 * A failure the screen has to describe differently.
 *
 * `team_not_found` is the ordinary result of a mistyped identifier and gets the
 * inline red card. Anything else is ours, not the manager's, and must not be
 * worded as though they typed something wrong.
 */
export class ApiError extends Error {
  constructor(readonly code: string) {
    super(code)
    this.name = 'ApiError'
  }
}

async function post<T>(path: string, body: unknown): Promise<T> {
  const response = await fetch(path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  const payload = (await response.json().catch(() => ({}))) as Record<string, unknown>
  if (!response.ok) throw new ApiError(String(payload['error'] ?? `http_${response.status}`))
  return payload as T
}

/** The signed-in manager, or null when nobody is signed in. */
export async function fetchMe(signal?: AbortSignal): Promise<Me | null> {
  const response = await fetch('/api/me', { signal })
  if (response.status === 401) return null
  if (!response.ok) throw new ApiError(`http_${response.status}`)
  return (await response.json()) as Me
}

/** Looks the identifier up and hands back the team. Stores nothing (F7-AC-14). */
export async function resolveTeam(fplTeamId: number): Promise<LinkedTeam> {
  const { team } = await post<{ team: LinkedTeam }>('/api/team-link/resolve', { fplTeamId })
  return team
}

/** Stores the team the manager accepted (F7-AC-13). */
export async function confirmTeam(fplTeamId: number): Promise<void> {
  await post('/api/team-link/confirm', { fplTeamId })
}

/** One fixture for one player in one gameweek. */
export type WorldFixture = {
  opponentClubId: number
  opponentShortName: string
  isHome: boolean
  difficulty: number
}

export type WorldPlayer = {
  playerId: number
  surname: string
  shirtNumber: number | null
  clubId: number
  clubShortName: string
  position: "GKP" | "DEF" | "MID" | "FWD"
  isStarter: boolean
  benchOrder: 0 | 1 | 2 | 3 | null
  isCaptain: boolean
  isVice: boolean
  status: string
  chanceOfPlayingNextRound: number | null
  nowCostTenths: number
  form: number | null
  selectedByPercent: number | null
  seasonPoints: number | null
  transfersIn: number | null
  transfersOut: number | null
  /** One figure for the gameweek, already covering however many matches it holds. */
  projectedPoints: number
  /** None for a blank, one normally, two for a double. */
  fixtures: WorldFixture[]
  /** This gameweek and the two after. Null is a blank; an array is a double. */
  nextThree: (number | number[] | null)[]
}

export type World = {
  gameweek: { id: number; name: string; deadlineTime: string }
  lastScoredGameweek: number | null
  snapshot: {
    id: string
    source: string
    capturedAt: string
    bankTenths: number
    freeTransfers: number
    chipsRemaining: Record<string, string>
  }
  players: WorldPlayer[]
  blanks: number
  doubles: number
  attribution: { name: string; href: string }
}

/**
 * The single read every screen re-derives from.
 *
 * One call, because the client holds the world and recomputes locally. On a first
 * open the server fetches both feeds before answering, so this can take a few
 * seconds — that is the Thinking state F6 and F8 build, and until then the screen
 * simply says it is loading.
 */
export async function fetchWorld(signal?: AbortSignal): Promise<World> {
  const response = await fetch("/api/world", { signal })
  if (!response.ok) {
    const payload = (await response.json().catch(() => ({}))) as Record<string, unknown>
    throw new ApiError(String(payload["error"] ?? `http_${response.status}`))
  }
  return (await response.json()) as World
}
