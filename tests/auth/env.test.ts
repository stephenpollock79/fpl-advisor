/**
 * Boot-time environment validation (STE-51).
 *
 * No criterion identifier on these: refusing to boot without a required variable
 * is a decision made in this slice, not an acceptance criterion from the PRD.
 * Naming a criterion here would inflate the coverage figure with something the
 * PRD never asked for.
 */

import { describe, expect, it } from 'vitest'
import { loadEnv } from '../../apps/server/src/env.js'

const complete = {
  SUPABASE_URL: 'https://example.supabase.co',
  SUPABASE_ANON_KEY: 'anon',
  SUPABASE_SERVICE_KEY: 'service',
  SESSION_COOKIE_SECRET: 'secret',
}

describe('the server refuses to start without what it needs', () => {
  it('loads when every required variable is present', () => {
    const env = loadEnv(complete)
    expect(env.supabaseUrl).toBe('https://example.supabase.co')
    expect(env.port).toBe(8787)
  })

  it('throws when a required variable is missing, and names it', () => {
    const { SUPABASE_SERVICE_KEY: _omitted, ...missing } = complete
    expect(() => loadEnv(missing)).toThrow(/SUPABASE_SERVICE_KEY/)
  })

  it('treats whitespace as absent, because Railway variables are pasted by hand', () => {
    expect(() => loadEnv({ ...complete, SUPABASE_ANON_KEY: '   ' })).toThrow(/SUPABASE_ANON_KEY/)
  })

  it('does not require variables for slices that are not built yet', () => {
    // Demanding a key nothing reads would block boot for no reason and teach
    // everyone to route around this check.
    expect(() => loadEnv(complete)).not.toThrow()
  })

  it('names the Railway rollback case, since that is what the check exists for', () => {
    const { SESSION_COOKIE_SECRET: _omitted, ...missing } = complete
    expect(() => loadEnv(missing)).toThrow(/rollback/)
  })
})
