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

/** Which picture fell short, and why, in the failure screen's own words (F2-UP-01). */
export type UploadFailure = {
  screen: 'team' | 'transfers'
  because: string
  causes: string[]
}

/**
 * The two screenshots (F2). **All-or-nothing across both** — either a whole
 * squad is written or nothing is, and a failure names which picture and why.
 *
 * Still `api.ts` and nowhere else: an upload is a write, and the moment a
 * component opens its own request the single data path stops being single
 * (ADR 0005).
 */
export async function uploadScreenshots(
  team: string,
  transfers: string,
): Promise<{ ok: true; snapshotId: string; decisionsCleared: number } | { ok: false; failure: UploadFailure }> {
  const response = await fetch('/api/squad/screenshots', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ team, transfers }),
  })
  const payload = (await response.json().catch(() => ({}))) as Record<string, unknown>

  if (response.ok) {
    return {
      ok: true,
      snapshotId: String(payload['snapshotId'] ?? ''),
      decisionsCleared: Number(payload['decisionsCleared'] ?? 0),
    }
  }

  if (payload['error'] === 'upload_failed') {
    return {
      ok: false,
      failure: {
        screen: payload['screen'] === 'transfers' ? 'transfers' : 'team',
        because: String(payload['because'] ?? 'the screenshots could not be read'),
        causes: (payload['causes'] as string[] | undefined) ?? [],
      },
    }
  }

  throw new ApiError(String(payload['error'] ?? `http_${response.status}`))
}

/**
 * Ends the session (F7-AC-24, F7-AC-25). The server revokes the row and clears
 * the cookie; there is no client-side session to forget.
 */
export async function logout(): Promise<void> {
  await post('/api/auth/logout', {})
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
  /** What FPL prints on the shirt — what every screen shows. */
  name: string
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
  /** This gameweek and the two after, zero where the club blanks. */
  projections: number[]
  /** None for a blank, one normally, two for a double. */
  fixtures: WorldFixture[]
  /** This gameweek and the two after. Null is a blank; an array is a double. */
  nextThree: (number | number[] | null)[]
  /** What the manager paid. Null outside the squad, or where it could not be recovered. */
  purchasePriceTenths: number | null
  /** FPL's selling price, computed by the server's engine call. Never computed here. */
  sellingPriceTenths: number | null
  /** FPL's likelihood of a price change tonight, −5 to +5. */
  priceLikelihoodTonight: number | null
  /** When FPL's lock on this player's price lifts. */
  priceLockedUntil: string | null
}

/** Each value the *How this was calculated* panel shows (F3-AC-30). Nothing in it is computed on display. */
export type Breakdown = {
  weights: number[]
  out: { playerId: number; projections: number[]; gate: { eligible: boolean; reason?: string }; total: number }
  in: { playerId: number; projections: number[]; gate: { eligible: boolean; reason?: string }; total: number }
  net: number
  pointsHit: number
  k: number
  /** Which category's k that is, in words — 0.5 alone does not say (F4-AC-11). */
  kLabel: string
  /** The captaincy ceiling tie-break chose this challenger over the plain highest projection (F4-AC-12). */
  byCeiling: boolean
}

/** One call, with the engine's figures exactly as the run stored them (ENGINE-AC-04). */
export type WorldCall = {
  key: string
  category: 'transfer' | 'substitution' | 'captaincy'
  shape: 'transfer' | 'forced_swap' | 'doubt_swap' | 'upgrade_swap' | 'bench_order' | 'captain' | 'vice'
  outPlayerId: number
  inPlayerId: number
  net: number
  /**
   * The app's answer is *nothing to do* (F4-AC-01, F4-AC-02). It carries no
   * conviction and no band — null rather than zero, so no surface can render a
   * keep as a weak change — and it is excluded from every tally (F4-AC-03).
   */
  isReading: boolean
  readingReason: 'incumbent_wins' | 'below_floor' | 'unexecutable' | null
  conviction: number | null
  band: 'certain' | 'strong' | 'lean' | 'thin' | null
  k: number
  pointsHit: number
  costTenths: number
  isForced: boolean
  watch: boolean
  /** Why WATCH is set, one tap away (F3-AC-18). Null when it is not. */
  watchReason: string | null
  reasoning: string
  reasoningSource: 'model' | 'template'
  breakdown: Breakdown
  alternatives: { out: number[]; in: number[] } | null
  position: number
  /**
   * What the last refresh or recomputation did to this call, until the card has
   * been seen (F6-AC-13). Transient by design: a tag that never clears stops
   * meaning anything, which is why the server holds when it was viewed.
   */
  diffTag: 'new' | 'updated' | 'returned' | 'resurfaced' | 'band_move' | null
  /** What the band moved from — "was 84%, now 71%" (F6-AC-11). */
  previousConviction: number | null
}

export type DecisionState = 'selected' | 'rejected'

export type World = {
  gameweek: { id: number; name: string; deadlineTime: string }
  lastScoredGameweek: number | null
  snapshot: {
    id: string
    /** `fpl_deadline` or, from slice 9, `screenshots`. What the editorial names (F8-AC-04). */
    source: string
    capturedAt: string
    bankTenths: number
    freeTransfers: number
    chipsRemaining: Record<string, string>
    /** The gameweek whose picks this holds — not the one being advised on. */
    picksFrom: number | null
  }
  players: WorldPlayer[]
  /** Players outside the squad a call or a picker names. */
  candidates: WorldPlayer[]
  /** The latest succeeded run's calls, in the plan's order. */
  calls: WorldCall[]
  /** This gameweek's decisions by call key. Pending is no entry (F3-AC-01). */
  decisions: Record<string, DecisionState>
  lastRunAt: string | null
  /** The week in one read, as the last successful run wrote it (F8-AC-08). */
  editorial: string | null
  /** When the FPL read behind the players' figures was taken. */
  priceForecastReadAt: string | null
  blanks: number
  doubles: number
  /**
   * The feeds answered on this open (F6-UP-02). False means the source is gone,
   * not that anything broke: the squad, the prices and every decision are on file
   * and still true. Only what needs a fresh read is frozen.
   */
  /**
   * **The week on screen has already been played** (F6-UP-03). Not staleness,
   * and never a prompt: a refresh can be declined, this cannot, because there is
   * nothing to weigh. Absent when the week is fine.
   */
  gameweekStop?: { reason: 'deadline_passed' | 'projections_disagree'; gameweek: number; deadline: string }
  feedsReachable?: boolean
  /** When the data on screen was read. What the amber strip timestamps. */
  dataReadAt?: string | null
  /**
   * Squad players whose evidence has moved since the last successful run
   * (F8-AC-13). Derived on every read, so the token clears when a run moves the
   * baseline rather than when something remembers to clear a flag (F8-AC-17).
   */
  news?: {
    flagged: { playerId: number; fields: ('status' | 'news' | 'chance' | 'price')[]; nowExcluded: boolean }[]
    since: string | null
  }
  attribution: { name: string; href: string }
}

/** One step of a run, as the server reports it (F6-AC-17, F6-AC-18). */
export type RunStep = {
  id: 'read' | 'diff' | 'propose' | 'score' | 'explain'
  label: string
  /** Real figures, where the step has them to state. */
  scale?: { players: number; squad: number }
  calls?: number
}

export type RunEvent =
  | { kind: 'step'; step: RunStep }
  | { kind: 'done'; runId: string; calls: WorldCall[]; reused: boolean; changed?: number }
  | { kind: 'error'; reason: string }

/**
 * The streamed run behind the Thinking state (F6-AC-16 to F6-AC-20).
 *
 * **Cancellation is the request closing**, which is why the signal is the only
 * control this takes: aborting it closes the connection, the server marks the
 * run cancelled, and nothing it had produced is written. A cancelled run is
 * treated exactly as one that never started, so the last-run time does not move.
 *
 * Still `api.ts` and nowhere else — a streamed read is a read, and the moment a
 * component opens its own connection the single data path stops being single
 * (ADR 0005).
 */
export async function* streamRun(signal: AbortSignal): AsyncGenerator<RunEvent> {
  const res = await fetch('/api/runs/stream', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: '{}',
    credentials: 'same-origin',
    signal,
  })
  if (!res.ok || !res.body) throw new Error(`run failed: ${String(res.status)}`)

  const reader = res.body.getReader()
  const decoder = new TextDecoder()
  let buffer = ''

  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    buffer += decoder.decode(value, { stream: true })

    // Server-sent events are separated by a blank line. A partial frame stays in
    // the buffer rather than being parsed early and thrown away.
    let split = buffer.indexOf('\n\n')
    while (split !== -1) {
      const frame = buffer.slice(0, split)
      buffer = buffer.slice(split + 2)
      split = buffer.indexOf('\n\n')

      const event = /event:\s*(\S+)/.exec(frame)?.[1]
      const raw = /data:\s*(.*)/.exec(frame)?.[1]
      if (!event || raw === undefined) continue
      const data = JSON.parse(raw) as Record<string, unknown>

      if (event === 'step') yield { kind: 'step', step: data as unknown as RunStep }
      else if (event === 'done')
        yield {
          kind: 'done',
          runId: data['runId'] as string,
          calls: (data['calls'] as WorldCall[]) ?? [],
          reused: data['reused'] === true,
          changed: data['changed'] as number | undefined,
        }
      else if (event === 'error') yield { kind: 'error', reason: (data['reason'] as string) ?? 'run_failed' }
    }
  }
}

/**
 * Record a decision on one call. `pending` removes the decision rather than
 * storing a third state (F3-AC-01, F3-AC-14).
 */
export async function decide(callKey: string, state: DecisionState | 'pending'): Promise<void> {
  await post('/api/decisions', { callKey, state })
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

/**
 * Ask for a six-digit code.
 *
 * **The response is identical whether or not the address has access** (F7-AC-02,
 * F7-AC-05, F7-UP-01) — the server returns the same body either way and this
 * cannot tell the difference, which is the point.
 */
export async function requestCode(email: string): Promise<void> {
  await post("/api/auth/request-code", { email })
}

/** Exchange the code for a session. The cookie is set by the server. */
export async function verifyCode(email: string, code: string): Promise<void> {
  await post("/api/auth/verify", { email, code })
}
