/**
 * Why a run failed, in words the manager can act on (STE-187).
 *
 * **The evening this exists to prevent.** Three refreshes failed and the app
 * said "The run did not finish, and nothing has changed. Try again." The cause
 * — the database refusing the new call shape after a migration went to the
 * wrong project — sat in a server log nobody was looking at. *Try again* was
 * the worst possible advice for a fault that failed identically every time,
 * and it was taken three times.
 */

import { describe, expect, it } from 'vitest'
import { describeFailure } from '../../apps/server/src/runs/failure.js'

describe('STE-187 · a failed run names its cause', () => {
  it('STE-187: the database refusing the advice says retrying will not help', () => {
    // **The one that cost the evening.** The app and the database are at
    // different versions, so the same run fails the same way every time.
    const failure = describeFailure(new Error('could not store the calls: violates check constraint'), 'explain')

    expect(failure.retryable).toBe(false)
    expect(failure.message).toContain('will not help')
    expect(failure.message).not.toContain('constraint')
  })

  it('STE-187: the stage is the signal, so no exception text has to be matched', () => {
    // An error nobody anticipated, thrown while reading the feeds. Nothing
    // about its message is recognised, and the stage still describes it.
    const failure = describeFailure(new Error('ECONNRESET'), 'read')

    expect(failure.reason).toBe('feeds_unreachable')
    expect(failure.retryable).toBe(true)
    expect(failure.message).toContain('feeds')
  })

  it('STE-187: proposing and scoring are one stage to the manager, because the difference is ours', () => {
    const propose = describeFailure(new Error('model unreachable'), 'propose')
    const score = describeFailure(new Error('model unreachable'), 'score')

    expect(propose.reason).toBe(score.reason)
    expect(propose.message).toBe(score.message)
  })

  it('STE-187: a cause nobody anticipated keeps the old wording rather than inventing one', () => {
    // Failing before the first step is sent: there is no stage and no
    // recognised prefix. A confident sentence here would be a lie, and "try
    // again" is honest when there is no reason to think otherwise.
    const failure = describeFailure(new Error('something new'), null)

    expect(failure.reason).toBe('run_failed')
    expect(failure.retryable).toBe(true)
    expect(failure.message).toContain('Try again')
  })

  it('STE-187: no failure leaks the exception or the stack at the manager', () => {
    const leaky = new Error('could not store the calls: relation "call" violates check constraint "call_shape_check"')
    for (const stage of ['read', 'diff', 'propose', 'score', 'explain', null] as const) {
      const { message } = describeFailure(leaky, stage)
      expect(message).not.toContain('relation')
      expect(message).not.toContain('call_shape_check')
      // A sentence, not a dump.
      expect(message.length).toBeLessThan(220)
    }
  })

  it('STE-187: a thrown string is described rather than crashing the description', () => {
    expect(describeFailure('could not start the run: no session', 'diff').reason).toBe('run_not_started')
    expect(describeFailure(undefined, 'read').reason).toBe('feeds_unreachable')
  })
})
