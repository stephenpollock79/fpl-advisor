/**
 * `GET /api/world` — the single read every screen re-derives from.
 *
 * **Feeds are fetched on open, never on a schedule** (CLAUDE.md, *Do not*).
 *
 * **Until slice 7 only the first half of that was true.** Ingestion ran when the
 * world loaded empty and never again, so outside a run the app re-read nothing
 * and the figures on screen were as old as the last advice run. Every open now
 * re-reads, which is what makes recomputation worth anything: a figure that
 * follows the data is no use if the data never moves.
 *
 * **Coalesced, not scheduled.** A burst of reads — the reload after a decision,
 * a double-tap — does not re-fetch, because the read is skipped while the newest
 * one is younger than `COALESCE_MS`. Nothing fires without the manager opening
 * the app, so ADR 0003 is untouched: this bounds how often a user-initiated read
 * hits the feeds, it does not start anything on a timer.
 *
 * The collaborators are injected so the route can be exercised without a network
 * or a database — the same reason the team-link routes are shaped this way.
 */

import { Hono } from 'hono'
import type { AuthenticatedUser } from '../auth/session.js'
import { type World, assembleWorld } from './assemble.js'
import type { WorldParts } from './assemble.js'

/** Long enough to absorb a screen's worth of reads, short enough to feel live. */
const COALESCE_MS = 2 * 60 * 1000

export type WorldDeps = {
  authenticate: (cookie: string | undefined) => Promise<AuthenticatedUser | null>
  /** When the newest feed read was taken, or null when there has never been one. */
  newestFeedReadAt: () => Promise<string | null>
  now?: () => number
  /** The manager's linked FPL team id, or null when the team link is not done. */
  linkedTeamId: (user: AuthenticatedUser) => Promise<number | null>
  /** Fetch both feeds and write the reference tables. Returns the gameweek advised on. */
  ingest: () => Promise<{ gameweek: number }>
  /** The last gameweek FPL will disclose a squad for. */
  lastCompletedGameweek: () => Promise<number>
  captureSquad: (user: AuthenticatedUser, fplTeamId: number, gameweek: number, picksFrom: number) => Promise<string>
  loadParts: (user: AuthenticatedUser) => Promise<WorldParts | null>
  /** Retire a snapshot the gameweek has moved past, so the next read captures again. */
  supersedeSnapshot: (user: AuthenticatedUser, snapshotId: string) => Promise<void>
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

    // Re-read on open, before anything is loaded, so what the world is assembled
    // from is what was just fetched rather than the previous read.
    const now = (deps.now ?? Date.now)()
    const newest = await deps.newestFeedReadAt()
    const fresh = newest !== null && now - Date.parse(newest) < COALESCE_MS

    // **A feed that cannot be reached is not a failure of this request** (F6-UP-02).
    // The squad, the prices and the manager's own decisions are all on file and
    // still true; what is frozen is anything that needs a new read. So the world
    // is answered from what is stored, with the fact carried on it — the screen
    // can then say what is frozen and how old it is, rather than the app looking
    // broken or, worse, looking fine.
    let feedsReachable = true
    if (!fresh) {
      try {
        await deps.ingest()
      } catch (cause) {
        console.error('[world] the feeds could not be read; answering from what is on file', cause)
        feedsReachable = false
      }
    }

    let parts = await deps.loadParts(user)

    /**
     * **A snapshot the gameweek has moved past is retired, not reused**
     * (F6-UP-03: a rollover regenerates from the squad FPL reports *at that
     * point*).
     *
     * Without this the world finds a snapshot for the gameweek it wants and
     * never captures again — so a squad read from too early a gameweek stays on
     * screen for the rest of the week, with a correct deadline above it. That is
     * what happened on 2026-09-14, and fixing the rule that chose the wrong
     * gameweek could not fix the row already stored.
     *
     * `null` is read as stale rather than as fine: a snapshot written before this
     * column existed cannot say where it came from, and guessing in the generous
     * direction is how the stale one survives.
     */
    const completed = await deps.lastCompletedGameweek()
    if (parts && (parts.picksFrom ?? -1) < completed) {
      await deps.supersedeSnapshot(user, parts.snapshot.id)
      parts = null
    }

    if (!parts) {
      // First open of the gameweek, or the squad has moved on. Fetch the world,
      // then the squad — in that order, because the squad's rows point at
      // players and gameweeks.
      const { gameweek } = await deps.ingest()
      await deps.captureSquad(user, fplTeamId, gameweek, completed)
      parts = await deps.loadParts(user)
    }

    if (!parts) {
      throw new Error('The world is still empty after ingesting it. Refusing to answer with nothing.')
    }

    return c.json({
      ...(assembleWorld(parts) satisfies World),
      feedsReachable,
      // What the screen timestamps itself with. Null only before the first read
      // ever, which cannot reach here.
      dataReadAt: await deps.newestFeedReadAt(),
    })
  })

  return app
}
