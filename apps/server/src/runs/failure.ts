/**
 * Why a run failed, in words the manager can act on.
 *
 * **Written after an evening lost to a screen that knew the answer and did not
 * say it** (2026-09-20, STE-187). Three refreshes in a row failed and the app
 * said *"The run did not finish, and nothing has changed. Try again."* — true,
 * and useless. The cause was in the server log the whole time: the database was
 * refusing the new call shape because a migration had gone to the wrong project.
 *
 * *Try again* was the worst possible advice for a fault that would fail
 * identically every time, and it was taken three times.
 *
 * **The stage is the signal, not the error text.** A run streams its steps, so
 * the last one sent says where it broke without matching on anyone's exception
 * message. Two prefixes sharpen it, and both are ours — thrown in `wire.ts`,
 * not by a library that can reword them in a patch release.
 *
 * `G5`'s shape throughout: what it looks like, whether anything is broken, and
 * whether trying again could help. Never the exception, and never the stack.
 */

import type { RunStepId } from './routes.js'

export type RunFailure = {
  reason: string
  /** What the manager is told. One or two sentences, no jargon. */
  message: string
  /** Whether repeating the same action could plausibly work. */
  retryable: boolean
}

const OURS = {
  store: 'could not store the calls',
  start: 'could not start the run',
} as const

const textOf = (cause: unknown): string =>
  cause instanceof Error ? cause.message : typeof cause === 'string' ? cause : ''

export function describeFailure(cause: unknown, step: RunStepId | null): RunFailure {
  const text = textOf(cause)

  /**
   * **The one that cost the evening, and the only one worth naming precisely.**
   * The advice was worked out and the database refused it, which means the app
   * and the database are at different versions. Retrying cannot help and saying
   * *try again* actively wastes the manager's time.
   */
  if (text.startsWith(OURS.store)) {
    return {
      reason: 'calls_rejected',
      message:
        'The advice was worked out but the database would not accept it. Trying again will not help — the app has been updated and the database has not.',
      retryable: false,
    }
  }

  if (text.startsWith(OURS.start)) {
    return {
      reason: 'run_not_started',
      message: 'The run could not be started, so nothing was spent and nothing has changed.',
      retryable: true,
    }
  }

  switch (step) {
    case 'read':
      return {
        reason: 'feeds_unreachable',
        message: 'The feeds could not be read, so nothing has changed. They are usually back within a few minutes.',
        retryable: true,
      }
    case 'diff':
      return {
        reason: 'compare_failed',
        message: 'Last week’s advice could not be compared with today’s data. Nothing has changed.',
        retryable: true,
      }
    case 'propose':
    case 'score':
      return {
        reason: 'advice_failed',
        message: 'The advice could not be worked out this time. Nothing has changed, and your calls still stand.',
        retryable: true,
      }
    case 'explain':
      return {
        reason: 'writing_failed',
        message: 'The advice was worked out but could not be written up. Nothing has changed.',
        retryable: true,
      }
    /**
     * **Unrecognised keeps the old sentence, deliberately.** A cause nobody
     * anticipated is exactly where a confident-sounding message would be a lie,
     * and *try again* is the honest advice when there is no reason to think
     * otherwise.
     */
    default:
      return {
        reason: 'run_failed',
        message: 'The run did not finish, and nothing has changed. Try again.',
        retryable: true,
      }
  }
}
