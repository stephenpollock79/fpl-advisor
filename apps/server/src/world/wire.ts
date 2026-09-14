/**
 * The real collaborators behind GET /api/world.
 *
 * Kept apart from the route so the route stays testable with stubs, and so the
 * one rule that matters here is visible in one place: **the manager's own row is
 * read with the manager's token; the world is read with the service key.**
 */

import type { AuthenticatedUser } from '../auth/session.js'
import { lastCompletedDeadline } from '../ingest/gameweeks.js'
import { ingestWorld } from '../ingest/run.js'
import { captureSquad } from '../squad/store.js'
import { referenceClient, userClient } from '../supabase.js'
import { loadWorldParts } from './load.js'
import type { WorldDeps } from './routes.js'

export function worldDeps(
  authenticate: WorldDeps['authenticate'],
): WorldDeps {
  return {
    authenticate,

    async linkedTeamId(user: AuthenticatedUser) {
      const { data } = await userClient(user.accessToken)
        .from('manager')
        .select('fpl_team_id')
        .maybeSingle()
      return ((data as { fpl_team_id: number | null } | null)?.fpl_team_id) ?? null
    },

    /**
     * When the newest feed read was taken — the figure `feed_read.fetched_at`
     * has recorded since slice 3 and nothing has ever read. It is what stops a
     * burst of world reads re-fetching both feeds every time.
     */
    async newestFeedReadAt() {
      const { data } = await referenceClient()
        .from('feed_read')
        .select('fetched_at')
        .order('fetched_at', { ascending: false })
        .limit(1)
      return ((data as { fetched_at: string }[] | null)?.[0]?.fetched_at) ?? null
    },

    async ingest() {
      const result = await ingestWorld()
      return { gameweek: result.gameweek }
    },

    /**
     * The most recent gameweek FPL will disclose a squad for.
     *
     * `data_checked`, not `finished` — bonus points and corrections land after the
     * last whistle, and a squad read against an unsettled gameweek is read against
     * a moving target.
     */
    /**
     * Which gameweek's picks the squad is read from.
     *
     * **The last completed *deadline*, not the last *settled* gameweek** — F1's
     * happy path says so, and the two are different questions with different
     * answers for two days of every week. Picks lock when the deadline passes;
     * points settle hours after the last whistle. Reading picks on the points
     * rule shows a squad one gameweek stale, under a correct deadline, with
     * nothing on screen to say so (found live 2026-09-14).
     */
    async lastCompletedGameweek() {
      const { data } = await referenceClient()
        .from('gameweek')
        .select('id, name, deadline_time, is_next, is_current, finished, data_checked')
      const rows = ((data ?? []) as Record<string, unknown>[]).map((g) => ({
        id: g['id'] as number,
        name: g['name'] as string,
        deadlineTime: g['deadline_time'] as string,
        isNext: g['is_next'] as boolean,
        isCurrent: g['is_current'] as boolean,
        finished: g['finished'] as boolean,
        dataChecked: g['data_checked'] as boolean,
      }))

      const latest = lastCompletedDeadline(rows, Date.now())
      if (!latest) {
        throw new Error('No deadline has passed yet, so there is no squad to read.')
      }
      return latest.id
    },

    captureSquad,
    loadParts: loadWorldParts,
  }
}
