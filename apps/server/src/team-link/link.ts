/**
 * Storing the accepted link.
 *
 * Written with the signed-in user's own token, never the service key (ADR 0007).
 * The service key bypasses row-level security entirely, so a write that used it
 * would pass every test asserting the policies exist while providing none of the
 * isolation those policies are for.
 *
 * The row already exists — it is created at first sign-in — so this fills in the
 * five columns slice 1 deliberately left nullable.
 */

import type { AuthenticatedUser } from '../auth/session.js'
import type { LinkedTeam } from '../fpl/entry.js'
import { userClient } from '../supabase.js'

export async function saveLink(user: AuthenticatedUser, team: LinkedTeam): Promise<void> {
  const { error } = await userClient(user.accessToken)
    .from('manager')
    .update({
      fpl_team_id: team.fplTeamId,
      team_name: team.teamName,
      manager_name: team.managerName,
      overall_rank: team.overallRank,
      linked_at: new Date().toISOString(),
    })
    .eq('user_id', user.userId)

  if (error) throw new Error(`could not link the FPL team: ${error.message}`)
}
