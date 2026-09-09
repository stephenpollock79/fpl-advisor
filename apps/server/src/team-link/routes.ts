/**
 * Linking the manager's FPL team, in two steps that must stay two (F7-AC-14).
 *
 *   resolve  — look the identifier up, hand back the team, **store nothing**
 *   confirm  — store the team the manager accepted
 *
 * The split is the criterion, not a nicety. A mistyped identifier is usually
 * still a *valid* one belonging to a stranger; without the confirmation step it
 * would link silently and every call afterwards would be built on someone else's
 * squad, with nothing on screen to say so.
 *
 * Its three collaborators are injected rather than imported, so the routes can be
 * exercised without a network or a database, and so "resolve wrote nothing" is a
 * fact a test can observe instead of a claim a comment makes.
 */

import { Hono } from 'hono'
import type { AuthenticatedUser } from '../auth/session.js'
import { type EntryPayload, type LinkedTeam, toLinkedTeam } from '../fpl/entry.js'

export type TeamLinkDeps = {
  /** FPL's public entry endpoint. Null when there is no such team. */
  fetchEntry: (fplTeamId: number) => Promise<EntryPayload | null>
  /** The signed-in user, or null. */
  authenticate: (cookie: string | undefined) => Promise<AuthenticatedUser | null>
  /** Writes the accepted link, as the user, so the row policies apply. */
  saveLink: (user: AuthenticatedUser, team: LinkedTeam) => Promise<void>
}

export function teamLinkRoutes(deps: TeamLinkDeps) {
  const app = new Hono()

  app.post('/api/team-link/resolve', async (c) => {
    const found = await lookUp(c.req.raw, c.req.header('Cookie'))
    if ('failure' in found) return c.json({ error: found.failure }, found.status)

    return c.json({ team: found.team })
  })

  app.post('/api/team-link/confirm', async (c) => {
    const found = await lookUp(c.req.raw, c.req.header('Cookie'))
    if ('failure' in found) return c.json({ error: found.failure }, found.status)

    await deps.saveLink(found.session, found.team)
    return c.json({ status: 'linked' })
  })

  /**
   * Both routes do the same three things in the same order, and confirm does not
   * take the client's word for the team.
   *
   * It re-reads FPL from the identifier instead. What the browser posts is a
   * request to link *that id*, never an assertion about whose team it is — a
   * confirm that stored the posted name would let a crafted request write any
   * label it liked against a real identifier, and the screen would agree with it.
   */
  async function lookUp(request: Request, cookie: string | undefined) {
    const session = await deps.authenticate(cookie)
    if (!session) return { failure: 'not_signed_in' as const, status: 401 as const }

    const fplTeamId = readTeamId(await body(request))
    if (fplTeamId === null) return { failure: 'invalid_team_id' as const, status: 400 as const }

    const entry = await deps.fetchEntry(fplTeamId)
    if (!entry) return { failure: 'team_not_found' as const, status: 404 as const }

    return { session, team: toLinkedTeam(entry) }
  }

  return app
}

async function body(request: Request): Promise<Record<string, unknown>> {
  return (await request.json().catch(() => ({}))) as Record<string, unknown>
}

/**
 * A team identifier is a positive whole number and nothing else. Rejected here
 * rather than passed to FPL, so a junk value fails at our boundary with a reason
 * instead of as an upstream 404 that reads like "no such team".
 */
function readTeamId(payload: Record<string, unknown>): number | null {
  const raw = payload['fplTeamId']
  const value = typeof raw === 'string' ? Number(raw.trim()) : raw
  if (typeof value !== 'number' || !Number.isInteger(value) || value <= 0) return null
  return value
}
