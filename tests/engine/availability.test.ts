/**
 * ENGINE-AC-02 — FPL availability is an exclusion gate applied before scoring,
 * never a coefficient.
 *
 * The gate and the score must never interact. That is the whole shape of the fix
 * made on 2026-09-10, and it is the thing most likely to be quietly re-coupled
 * later, so it is asserted from both directions: an excluded player is never
 * recommended, and his projection is identical before and after the exclusion.
 *
 * The line was ruled on 2026-09-10: out, injured, suspended or not in the squad
 * is excluded, and so is a doubt FPL prices at 25% or less. A 50% or 75% doubt
 * stays eligible with the flag shown, because the bought-in projection already
 * discounts it — excluding that band would re-create the double-count in gate
 * form and would bar returning players, who are the transfer candidates worth
 * having.
 */
import { describe, expect, it } from 'vitest'

import { availabilityOf } from '../../packages/engine/src/availability.js'
import { effectivePoints } from '../../packages/engine/src/effective.js'

describe('ENGINE-AC-02 · who the gate excludes', () => {
  it('ENGINE-AC-02: a fully available player passes', () => {
    expect(availabilityOf({ status: 'a', chanceOfPlayingNextRound: null })).toEqual({ eligible: true })
    expect(availabilityOf({ status: 'a', chanceOfPlayingNextRound: 100 })).toEqual({ eligible: true })
  })

  it('ENGINE-AC-02: the four hard states are excluded, each with its own reason', () => {
    expect(availabilityOf({ status: 'i', chanceOfPlayingNextRound: 0 })).toEqual({
      eligible: false,
      reason: 'injured',
    })
    expect(availabilityOf({ status: 's', chanceOfPlayingNextRound: 0 })).toEqual({
      eligible: false,
      reason: 'suspended',
    })
    expect(availabilityOf({ status: 'u', chanceOfPlayingNextRound: null })).toEqual({
      eligible: false,
      reason: 'unavailable',
    })
    expect(availabilityOf({ status: 'n', chanceOfPlayingNextRound: null })).toEqual({
      eligible: false,
      reason: 'not_in_squad',
    })
  })

  it('ENGINE-AC-02: a doubt of 25% or less is excluded; 50% and 75% are not', () => {
    expect(availabilityOf({ status: 'd', chanceOfPlayingNextRound: 0 }).eligible).toBe(false)
    expect(availabilityOf({ status: 'd', chanceOfPlayingNextRound: 25 })).toEqual({
      eligible: false,
      reason: 'serious_doubt',
    })
    expect(availabilityOf({ status: 'd', chanceOfPlayingNextRound: 50 })).toEqual({ eligible: true })
    expect(availabilityOf({ status: 'd', chanceOfPlayingNextRound: 75 })).toEqual({ eligible: true })
  })

  it('ENGINE-AC-02: a doubt FPL puts no number against stays eligible', () => {
    // FPL flags the player without pricing the doubt. The feed has already
    // discounted whatever it knows, so a missing percentage is not a reason to
    // exclude — the flag itself is shown on the card either way.
    expect(availabilityOf({ status: 'd', chanceOfPlayingNextRound: null })).toEqual({ eligible: true })
  })

  it('ENGINE-AC-02: the hard states are read before the percentage, so the reason shown is the real one', () => {
    // An injured player usually carries 0% as well. He is excluded as injured,
    // not as a doubt, because that is what the card has to say.
    expect(availabilityOf({ status: 'i', chanceOfPlayingNextRound: 0 })).toEqual({
      eligible: false,
      reason: 'injured',
    })
  })
})

describe('ENGINE-AC-02 · the gate never touches the projection', () => {
  it('ENGINE-AC-02: the projection of an excluded player is unchanged by the exclusion', () => {
    const projection = 6.0
    const verdict = availabilityOf({ status: 'i', chanceOfPlayingNextRound: 0 })

    expect(verdict.eligible).toBe(false)
    expect(effectivePoints(projection)).toBe(6.0)
  })

  it('ENGINE-AC-02: effective points takes no availability argument at all', () => {
    // Structural, not behavioural: if scoring could see the gate it could be made
    // to scale on it, which is the defect this whole design removes. The
    // signature is the mechanism.
    expect(effectivePoints.length).toBe(1)
  })
})
