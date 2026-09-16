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
import { jsonObject as body } from '../json-body.js'
import type { AuthenticatedUser } from '../auth/session.js'
import { type EntryPayload, type LinkedTeam, toLinkedTeam } from '../fpl/entry.js'

export type TeamLinkDeps = {
  /** FPL's public entry endpoint. Null when there is no such team. */
  fetchEntry: (fplTeamId: number) => Promise<EntryPayload | null>
  /** The signed-in user, or null. */
  authenticate: (cookie: string | undefined) => Promise<AuthenticatedUser | null>
  /** Writes the accepted link, as the user, so the row policies apply. */
  saveLink: (user: AuthenticatedUser, team: LinkedTeam) => Promise<void>
  /** The opaque token resolve hands back, which confirm then requires (F7-AC-14). */
  mintConfirmation: (user: AuthenticatedUser, fplTeamId: number) => string
  /** True only for a token this server minted, for this user and this team, unexpired. */
  confirmationIsValid: (user: AuthenticatedUser, fplTeamId: number, token: unknown) => boolean
}

export function teamLinkRoutes(deps: TeamLinkDeps) {
  const app = new Hono()

  app.post('/api/team-link/resolve', async (c) => {
    const found = await lookUp(c.req.raw, c.req.header('Cookie'))
    if ('failure' in found) return c.json({ error: found.failure }, found.status)

    return c.json({
      team: found.team,
      // The half of F7-AC-14 that was missing until slice 10. Minted for the
      // identifier actually shown back, so a confirm can be checked against a
      // resolve that happened rather than against a screen order nobody can see.
      confirmation: deps.mintConfirmation(found.session, found.team.fplTeamId),
    })
  })

  app.post('/api/team-link/confirm', async (c) => {
    const session = await deps.authenticate(c.req.header('Cookie'))
    if (!session) return c.json({ error: 'not_signed_in' }, 401)

    const payload = await body(c.req.raw)
    const fplTeamId = readTeamId(payload)
    if (fplTeamId === null) return c.json({ error: 'invalid_team_id' }, 400)

    /**
     * **Checked before the FPL read, deliberately.** A confirm that was never
     * resolved must cost no upstream request, and its failure must not be
     * describable as "FPL is down" — a linking step that fails for two reasons
     * with one message is how a missing mechanism hides.
     *
     * This is written out rather than folded into `lookUp` with a flag, because
     * the order of these four checks is the criterion and burying it would hide
     * exactly the thing the criterion is about.
     */
    if (!deps.confirmationIsValid(session, fplTeamId, payload['confirmation'])) {
      return c.json({ error: 'not_confirmed' }, 400)
    }

    const entry = await deps.fetchEntry(fplTeamId)
    if (!entry) return c.json({ error: 'team_not_found' }, 404)

    // Still re-read from FPL rather than trusting the posted team. The token
    // binds *which identifier* was shown back, never what it was called — see
    // lookUp's note, which this route no longer shares but still obeys.
    await deps.saveLink(session, toLinkedTeam(entry))
    return c.json({ status: 'linked' })
  })

  /**
   * Resolve's three steps. Confirm had the same three until slice 10, and now
   * has four in a different order — the confirmation check has to come before
   * the FPL read, which a shared helper could only express as a flag.
   *
   * The rule both routes still obey: the team is read from FPL by identifier,
   * never taken from the request. What the browser posts is a request to link
   * *that id*, never an assertion about whose team it is — storing the posted
   * name would let a crafted request write any label it liked against a real
   * identifier, and the screen would agree with it.
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
