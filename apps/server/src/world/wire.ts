/**
 * The real collaborators behind GET /api/world.
 *
 * Kept apart from the route so the route stays testable with stubs, and so the
 * one rule that matters here is visible in one place: **the manager's own row is
 * read with the manager's token; the world is read with the service key.**
 */

import type { AuthenticatedUser } from '../auth/session.js'
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
    async lastCompletedGameweek() {
      const { data } = await referenceClient()
        .from('gameweek')
        .select('id')
        .eq('data_checked', true)
        .order('id', { ascending: false })
        .limit(1)
      const latest = (data as { id: number }[] | null)?.[0]?.id
      if (latest === undefined) {
        throw new Error('No gameweek has settled yet, so there is no squad to read.')
      }
      return latest
    },

    captureSquad,
    loadParts: loadWorldParts,
  }
}
