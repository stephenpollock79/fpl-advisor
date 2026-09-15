/**
 * `POST /api/squad/screenshots` — the two-image parse (F2).
 *
 * **All-or-nothing across both** (`F2-UP-01`): either a whole squad is written
 * or nothing is, and the failure names which picture fell short. A half-applied
 * squad would be worse than no upload, because it would look complete.
 *
 * **The correction then runs through F6's regeneration, never a path of its
 * own** (`F2-AC-06`, `F6-RS-06`). This route writes the snapshot and returns;
 * the client starts the existing streamed run, so selected calls survive and
 * rejected ones stay suppressed because it is the same locks code. The one
 * thing only a correction can do — break a lock outright (`F2-AC-07`,
 * `F6-RS-07`) — happens here, before the run, because the run has to plan
 * around a lock that is already gone.
 *
 * **No image is stored.** Both reach the model and are discarded.
 */

import { Hono } from 'hono'
import type { AuthenticatedUser } from '../auth/session.js'
import type { ModelCallRecord, ModelPort } from '../model/client.js'
import { COMMON_CAUSES, type ParseFailure, type ParsedSquad, parseSquad } from './parse.js'

/** Each image, before base64. Two untouched phone screenshots would be ~5.5 MB of body. */
const MAX_IMAGE_BYTES = 4 * 1024 * 1024

/** Base64 is four characters per three bytes, so the encoded cap is larger. */
const MAX_ENCODED = Math.ceil((MAX_IMAGE_BYTES * 4) / 3)

export type ScreenshotDeps = {
  authenticate: (cookie: string | undefined) => Promise<AuthenticatedUser | null>
  model: () => ModelPort
  /** The gameweek being advised on — `is_next`, never `is_current`. */
  advisedGameweek: () => Promise<number>
  /**
   * Every player FPL tracks, for the model to choose from. **A screenshot shows
   * a name and never an id**, so the match is made against a named list rather
   * than asked for outright.
   */
  trackedPlayers: () => Promise<{ id: number; name: string; club: string; position: string }[]>
  /** Writes the snapshot and supersedes the one it replaces. Returns its id. */
  storeCorrectedSquad: (
    user: AuthenticatedUser,
    gameweek: number,
    squad: ParsedSquad,
  ) => Promise<string>
  /**
   * Breaks any selected call the new squad contradicts (F2-AC-07), and reports
   * how many, so the diff can say so.
   */
  breakContradictedLocks: (user: AuthenticatedUser, gameweek: number, snapshotId: string) => Promise<number>
  /** The run's own record of what the parse cost. */
  recordParse?: (user: AuthenticatedUser, record: ModelCallRecord) => Promise<void>
}

export type UploadFailed = {
  error: 'upload_failed'
  screen: ParseFailure['screen']
  because: string
  causes: readonly string[]
}

export function screenshotRoutes(deps: ScreenshotDeps) {
  const app = new Hono()

  app.post('/api/squad/screenshots', async (c) => {
    const user = await deps.authenticate(c.req.header('Cookie'))
    if (!user) return c.json({ error: 'not_signed_in' }, 401)

    const body = (await c.req.json().catch(() => ({}))) as { team?: unknown; transfers?: unknown }
    const team = typeof body.team === 'string' ? body.team : null
    const transfers = typeof body.transfers === 'string' ? body.transfers : null

    // **Both, or neither.** One picture cannot produce a squad: no FPL screen
    // carries everything the parse needs, which is why there are two.
    if (!team || !transfers) return c.json({ error: 'both_required' }, 400)

    for (const [screen, image] of [
      ['team', team],
      ['transfers', transfers],
    ] as const) {
      if (image.length > MAX_ENCODED) {
        return c.json(
          {
            error: 'upload_failed',
            screen,
            because: `the ${screen === 'team' ? 'Team' : 'Transfers'} screenshot is larger than 4 MB`,
            causes: COMMON_CAUSES,
          } satisfies UploadFailed,
          413,
        )
      }
    }

    const players = await deps.trackedPlayers()

    /**
     * **"No players legible" and "the read never came back" are different
     * failures, and they were reported as the same one** (found live
     * 2026-09-15). A model call that throws, is refused, or answers with
     * something that is not JSON reached `parseSquad` as an empty object and
     * came out as "only 0 of 15 players legible on the Team screenshot" —
     * which sent the manager back to a camera roll holding a perfectly good
     * picture, twice.
     *
     * A failure the manager cannot act on has to say so, or it is worse than
     * no message at all.
     */
    if (players.length === 0) {
      console.error('[screenshots] no players are on file to match a screenshot against')
      return c.json(
        {
          error: 'upload_failed',
          screen: 'team',
          because: 'the app has no player list to match your squad against, which is our fault and not your picture',
          causes: [],
        } satisfies UploadFailed,
        503,
      )
    }

    const { raw, record, because } = await deps.model().readSquadScreenshots({ team, transfers, players })
    if (deps.recordParse) await deps.recordParse(user, record)

    if (raw === null || raw === undefined) {
      console.error(`[screenshots] the read came back empty — ok=${String(record.ok)} via=${record.via} model=${record.modelId} because=${because ?? 'unknown'}`)
      return c.json(
        {
          error: 'upload_failed',
          screen: 'team',
          // **The reason is on the screen, not only in a log.** Two uploads
          // failed with nothing to act on, and the cause was a deploy log away.
          because: because
            ? `the reader did not answer — ${because}`
            : 'the reader did not answer, which is our fault and not your picture',
          causes: [],
        } satisfies UploadFailed,
        502,
      )
    }

    // **The same list the read chose from**, so the composition check and the
    // name fallback both cost nothing: the positions catch a wrong match, and
    // the names catch an id the read copied wrongly.
    const result = parseSquad(raw as Parameters<typeof parseSquad>[0], players)
    if (!result.ok) {
      // **Nothing is applied and the existing squad is untouched** (F2-UP-01).
      return c.json(
        {
          error: 'upload_failed',
          screen: result.failure.screen,
          because: result.failure.because,
          causes: COMMON_CAUSES,
        } satisfies UploadFailed,
        422,
      )
    }

    const gameweek = await deps.advisedGameweek()
    const snapshotId = await deps.storeCorrectedSquad(user, gameweek, result.squad)
    const locksBroken = await deps.breakContradictedLocks(user, gameweek, snapshotId)

    return c.json({ snapshotId, locksBroken })
  })

  return app
}
