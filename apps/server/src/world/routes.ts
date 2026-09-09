/**
 * `GET /api/world` — the single read every screen re-derives from.
 *
 * **Feeds are fetched on open, never on a schedule** (CLAUDE.md, *Do not*). So a
 * first open with an empty database ingests both feeds and captures the squad,
 * then answers. A later open reads what is already there.
 *
 * The collaborators are injected so the route can be exercised without a network
 * or a database — the same reason the team-link routes are shaped this way.
 */

import { Hono } from 'hono'
import type { AuthenticatedUser } from '../auth/session.js'
import { type World, assembleWorld } from './assemble.js'
import type { WorldParts } from './assemble.js'

export type WorldDeps = {
  authenticate: (cookie: string | undefined) => Promise<AuthenticatedUser | null>
  /** The manager's linked FPL team id, or null when the team link is not done. */
  linkedTeamId: (user: AuthenticatedUser) => Promise<number | null>
  /** Fetch both feeds and write the reference tables. Returns the gameweek advised on. */
  ingest: () => Promise<{ gameweek: number }>
  /** The last gameweek FPL will disclose a squad for. */
  lastCompletedGameweek: () => Promise<number>
  captureSquad: (user: AuthenticatedUser, fplTeamId: number, gameweek: number, picksFrom: number) => Promise<string>
  loadParts: (user: AuthenticatedUser) => Promise<WorldParts | null>
}

export function worldRoutes(deps: WorldDeps) {
  const app = new Hono()

  app.get('/api/world', async (c) => {
    const user = await deps.authenticate(c.req.header('Cookie'))
    if (!user) return c.json({ error: 'not_signed_in' }, 401)

    const fplTeamId = await deps.linkedTeamId(user)
    // Not an error. The team link is a step the manager has not taken yet, and
    // the client already knows what to do with it.
    if (fplTeamId === null) return c.json({ error: 'no_team_linked' }, 409)

    let parts = await deps.loadParts(user)

    if (!parts) {
      // First open of the gameweek. Fetch the world, then the squad — in that
      // order, because the squad's rows point at players and gameweeks.
      const { gameweek } = await deps.ingest()
      await deps.captureSquad(user, fplTeamId, gameweek, await deps.lastCompletedGameweek())
      parts = await deps.loadParts(user)
    }

    if (!parts) {
      throw new Error('The world is still empty after ingesting it. Refusing to answer with nothing.')
    }

    return c.json(assembleWorld(parts) satisfies World)
  })

  return app
}
