/**
 * The editorial's second line of defence, and the paragraph that stands in.
 *
 * **Neither had a test until 2026-09-16, and both were wrong.** The template was
 * writing the exact sentence Stephen complained about — *"1 of this week's 4
 * calls are forced, so start there"* — while STE-142's fix removed the count
 * from the *prompt* and never touched it. And the blocklist carried no fitness
 * vocabulary, so the instruction forbidding an invented injury (STE-146) was a
 * convention with nothing behind it.
 *
 * **A rule applied to the model and not to the code standing in for it is a rule
 * with a hole the shape of its fallback** (STE-148).
 */

import { describe, expect, it } from 'vitest'
import { editorialIsAcceptable, templateEditorial } from '../../apps/server/src/model/editorial.js'
import type { EditorialInput } from '../../apps/server/src/model/client.js'

const call = (title: string, kind: string, net: number, forced = false) => ({
  title,
  kind,
  net,
  band: 'strong' as const,
  forced,
})

const week = (calls: EditorialInput['calls']): EditorialInput => ({
  calls,
  exception: null,
  squadSource: 'screenshot',
})

describe('The stand-in paragraph obeys every rule the model obeys (STE-148)', () => {
  /**
   * The trigger is a week with several calls, one of them forced — which is
   * exactly the week that produced the complaint, and the only shape where the
   * old template reached for a count.
   */
  const mixed = week([
    call('Calafiori → De Cuyper', 'substitution', 4.1),
    call('Semenyo → Groß', 'substitution', 2.2),
    call('Haaland → Calvert-Lewin', 'captaincy change', 3.1),
    call('Tzolis → Rogers', 'substitution', 0, true),
  ])

  it('states no count, however many calls there are', () => {
    const text = templateEditorial(mixed)

    // The sentence that shipped, and the general rule behind it.
    expect(text).not.toContain("1 of this week's 4 calls")
    expect(text).not.toMatch(/\b\d+ (of this week's )?\d* ?calls?\b/i)
    expect(text).not.toMatch(/\b(one|two|three|four|five|six) calls?\b/i)
  })

  it('names what it points at, and what kind of move it is', () => {
    const text = templateEditorial(mixed)

    expect(text).toContain('Tzolis → Rogers')
    expect(text).toContain('substitution')
  })

  it('a quiet week is still stated rather than left blank (F8-AC-01)', () => {
    expect(templateEditorial(week([])).length).toBeGreaterThan(0)
  })
})

describe('A paragraph reaching for a cause it cannot know is refused (STE-146)', () => {
  /**
   * **The instruction is a convention; this is the mechanism.** The editorial is
   * given a title, a kind, a net, a band and sometimes a reason — never
   * availability, news or minutes. A paragraph claiming otherwise is replaced by
   * the template rather than shown.
   */
  it('rejects the sentence that actually shipped', () => {
    expect(
      editorialIsAcceptable(
        "Injury forces Calvert-Lewin out, so that swap into Rogers isn't optional.",
      ),
    ).toBe(false)
  })

  it('rejects every other way of saying it', () => {
    for (const text of [
      'He is doubtful for this one, so the armband moves.',
      'Rotation risk makes him the safer hold.',
      'He is unavailable this week.',
      'A knock keeps him out.',
      'His minutes are a concern.',
    ]) {
      expect(editorialIsAcceptable(text)).toBe(false)
    }
  })

  it('and still accepts a paragraph that stays inside what it was given', () => {
    expect(
      editorialIsAcceptable(
        'The captaincy is moving to Calvert-Lewin, which means Rogers must take the vice — a package deal, not a debate.',
      ),
    ).toBe(true)
  })
})
