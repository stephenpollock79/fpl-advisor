/**
 * The real collaborators behind `POST /api/squad/screenshots`.
 *
 * Kept apart from the route so the route stays testable with stubs, and so the
 * one rule that matters is visible in one place: **the manager's squad, calls
 * and decisions are read and written with the manager's token.** The gameweek
 * is reference data and read with the service key.
 */

import type { AuthenticatedUser } from '../auth/session.js'
import { modelFromEnv } from '../model/client.js'
import { referenceClient, userClient } from '../supabase.js'
import { latestReadId } from '../world/reads.js'
import { storeCorrectedSquad } from './store.js'
import type { ScreenshotDeps } from './screenshots.js'

export function screenshotDeps(authenticate: ScreenshotDeps['authenticate']): ScreenshotDeps {
  return {
    authenticate,
    model: modelFromEnv,

    /**
     * **`is_next`, never `is_current`.** The feed marks a gameweek current until
     * the following one locks, so keying off it would file a correction against
     * a week already played — confidently, with nothing on screen to say so.
     */
    async advisedGameweek() {
      const { data } = await referenceClient().from('gameweek').select('id').eq('is_next', true).limit(1)
      const next = (data as { id: number }[] | null)?.[0]?.id
      if (next === undefined) throw new Error('no gameweek is marked next, so there is nothing to correct against')
      return next
    },

    /**
     * Reference data, so the service key — these are the same rows every screen
     * already reads, and they belong to nobody.
     */
    async trackedPlayers() {
      const reference = referenceClient()
      // **Two reads and a join in code, rather than an embedded select.** An
      // embedded join that does not resolve comes back as null rather than an
      // error, which would quietly strip the club from every line and leave the
      // model choosing between two players of the same name on nothing.
      // **The price comes from the latest read, not from any read.** The table
      // holds one set of rows per feed read, so an unfiltered select would let
      // a stale price win — and a stale price would refuse a correct name
      // (world/reads.ts).
      const readId = await latestReadId('fpl_bootstrap')
      const [{ data: players }, { data: clubs }, { data: states }] = await Promise.all([
        reference.from('player').select('id, surname, shirt_name, position, club_id'),
        reference.from('club').select('id, short_name'),
        readId === null
          ? Promise.resolve({ data: [] as Record<string, unknown>[] })
          : reference.from('player_state').select('player_id, now_cost_tenths').eq('feed_read_id', readId),
      ])

      const priceOf = new Map(
        ((states ?? []) as { player_id: number; now_cost_tenths: number }[]).map((r) => [r.player_id, r.now_cost_tenths]),
      )

      const clubName = new Map(
        ((clubs ?? []) as { id: number; short_name: string }[]).map((c) => [c.id, c.short_name]),
      )

      return ((players ?? []) as Record<string, unknown>[]).map((p) => ({
        id: p['id'] as number,
        // **The shirt name, because that is what the screenshot shows.**
        // Matching on the surname put two strangers in a corrected squad on
        // 2026-09-15: Calafiori's surname is his full family name and João
        // Pedro's is "Junqueira de Jesus", so the model chose the nearest row
        // it could see. Falls back for rows written before the column existed.
        name: (p['shirt_name'] as string | null) ?? (p['surname'] as string),
        club: clubName.get(p['club_id'] as number) ?? '',
        position: p['position'] as string,
        // **What the card says he costs.** Undefined where the feed has not
        // been read yet, and an absent price simply skips the check rather
        // than refusing every name.
        priceTenths: priceOf.get(p['id'] as number),
      }))
    },

    /**
     * Every fixture in the gameweek, named by the three letters the card
     * prints. Reference data, so the service key — and **fixtures come from the
     * FPL feed and nowhere else** (CLAUDE.md, *Data rules* 1).
     */
    async gameweekFixtures(gameweek: number) {
      const reference = referenceClient()
      const [{ data: fixtures }, { data: clubs }] = await Promise.all([
        reference.from('fixture').select('home_club, away_club').eq('gameweek', gameweek),
        reference.from('club').select('id, short_name'),
      ])

      const shortName = new Map(((clubs ?? []) as { id: number; short_name: string }[]).map((c) => [c.id, c.short_name]))

      // Each fixture is two rows here, one from each club's point of view, so a
      // lookup by club never has to care which side of it a player is on.
      return ((fixtures ?? []) as { home_club: number; away_club: number }[]).flatMap((f) => {
        const home = shortName.get(f.home_club)
        const away = shortName.get(f.away_club)
        if (home === undefined || away === undefined) return []
        return [
          { club: home, opponent: away, isHome: true },
          { club: away, opponent: home, isHome: false },
        ]
      })
    },

    storeCorrectedSquad,

    /**
     * **An upload clears the board** (ruled 2026-09-16, STE-139).
     *
     * Until tonight a correction tried to reconcile the new squad against the
     * decisions already made, breaking only the locks it could prove were
     * contradicted. That mechanism knew two shapes — a player coming in who is
     * not there, a player going out who still is — and a squad can disagree
     * with a selected call in more ways than that. **Three holes were named in
     * one evening**: the bank moves with an upload and nothing checked
     * affordability, the free-transfer count moves and nothing checked that
     * either, and a captaincy or substitution call was excluded from
     * contradiction altogether, so one naming a player the upload removed
     * passed straight through.
     *
     * **Each hole produces confident wrong advice, which is worse than a
     * cleared board.** And the decisions being preserved were taken about a
     * different squad — keeping them is not preserving the manager's work, it
     * is preserving an opinion about a world that has since changed.
     *
     * So the uploaded squad is the current state and every decision for the
     * gameweek goes with the old one, **rejections included**, because a
     * rejection was about the old squad too. The cost is real and was accepted:
     * a correction made late in the week brings back every call already
     * dismissed.
     *
     * The manager's own token, never the service key (ADR 0007).
     */
    async clearDecisions(user: AuthenticatedUser, gameweek: number) {
      const db = userClient(user.accessToken)
      const { data, error } = await db.from('decision').delete().eq('gameweek', gameweek).select('call_key')
      if (error) throw new Error(`could not clear the previous decisions: ${error.message}`)
      return (data ?? []).length
    },
  }
}
