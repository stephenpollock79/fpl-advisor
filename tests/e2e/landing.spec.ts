/**
 * The Landing screen and the account sheet (F7-AC-16 to F7-AC-26, F7-UP-02,
 * F7-UP-04), in a real browser at 390×844.
 *
 * **The range deliberately starts at 16.** Writing it as `F7-AC-15 – F7-AC-26`
 * made `scripts/criteria-coverage.mjs` count `F7-AC-15` as covered off a comment
 * — the same half-truth `F6-AC-20` carries today. The script reads whole files,
 * not titles, so a range in a docblock is a coverage claim.
 *
 * **The sign-out test signs out.** `F7-AC-25` is about what happens after the
 * confirmation, and a test that checked the confirm page and stopped would
 * prove the button renders — which is the shape P16 exists to catch.
 */

import { type Route, expect, test } from '@playwright/test'
import { world } from './fixture'

/** A stranger: signed out, and nothing else stubbed. */
async function strangerOpens(page: Parameters<typeof test>[0] extends never ? never : import('@playwright/test').Page) {
  await page.route('**/api/me', (route: Route) => route.fulfill({ status: 401, json: { error: 'not_signed_in' } }))
  await page.goto('/')
}

test('F7-AC-16, F7-AC-17, F7-UP-04: a stranger lands on one card with an invite-only badge and no squad', async ({ page }) => {
  await strangerOpens(page)

  await expect(page.getByTestId('invite-only')).toBeVisible()
  await expect(page.getByRole('tab', { name: 'What he does' })).toHaveAttribute('aria-selected', 'true')
  // Nothing about any squad is shown before sign-in.
  await expect(page.getByText('Noggingham Forest')).toHaveCount(0)

  // **No scroll** — the criterion says so outright, and it was untrue until
  // 2026-09-15, when the claims ran off the bottom of the phone. Measured off
  // the screen's own box rather than `document`, which the test project has no
  // DOM types for.
  const box = await page.locator('main').boundingBox()
  const viewport = page.viewportSize()
  expect(box?.height ?? 0).toBeLessThanOrEqual(viewport?.height ?? 0)
})

test('F7-AC-18: there is no sign-up path, no password field and no forgotten-password line', async ({ page }) => {
  await strangerOpens(page)
  await page.getByTestId('tab-login').click()

  // Absence is the security model here, so it is asserted rather than assumed.
  await expect(page.locator('input[type="password"]')).toHaveCount(0)
  await expect(page.getByText(/forgot/i)).toHaveCount(0)
  await expect(page.getByText(/sign up|create an account|register/i)).toHaveCount(0)
})

test('F7-AC-19: the standing disclaimer and the attribution sit at the foot', async ({ page }) => {
  await strangerOpens(page)

  await expect(page.getByText(/Not affiliated with the Premier League/)).toBeVisible()
  await expect(page.getByText(/Advice only/)).toBeVisible()
  await expect(page.getByRole('link', { name: 'Fantasy Football IQ' })).toBeVisible()
})

test('F7-AC-20, F7-UP-02: a wrong code is stated inline in a red card, never as a toast', async ({ page }) => {
  await strangerOpens(page)
  await page.route('**/api/auth/request-code', (route: Route) => route.fulfill({ json: { status: 'code_requested' } }))
  await page.route('**/api/auth/verify', (route: Route) => route.fulfill({ status: 400, json: { error: 'invalid_code' } }))

  await page.getByTestId('tab-login').click()
  await page.getByLabel('Email').fill('someone@example.com')
  await page.getByRole('button', { name: 'Send me a code' }).click()

  // The trigger: a code that is actually rejected by the server.
  await page.getByLabel('Six-digit code').fill('000000')
  await page.getByRole('button', { name: 'Log in' }).click()

  const error = page.getByTestId('login-error')
  await expect(error).toBeVisible()
  // Inline means it stays. A toast would be gone by now.
  await page.waitForTimeout(1200)
  await expect(error).toBeVisible()
})

test('F7-AC-08: Send another code carries a visible cooldown once used', async ({ page }) => {
  await strangerOpens(page)
  await page.route('**/api/auth/request-code', (route: Route) => route.fulfill({ json: { status: 'code_requested' } }))

  await page.getByTestId('tab-login').click()
  await page.getByLabel('Email').fill('someone@example.com')
  // The trigger: the first send, which is what starts the cooldown.
  await page.getByRole('button', { name: 'Send me a code' }).click()

  const another = page.getByTestId('send-another')
  await expect(another).toBeDisabled()
  await expect(another).toContainText(/Send another code in \d+s/)
})

/** Signed in, with the fixture world behind it. */
async function signedIn(page: import('@playwright/test').Page) {
  await page.route('**/api/me', (route: Route) =>
    route.fulfill({
      json: {
        manager: { user_id: 'u', fpl_team_id: 6131656, team_name: 'Noggingham Forest', manager_name: 'Stephen', overall_rank: 1 },
        needsTeamLink: false,
      },
    }),
  )
  await page.route('**/api/world', (route: Route) => route.fulfill({ json: world }))
  await page.goto('/')
}

test('F7-AC-15: confirming the team ends onboarding in the Thinking state, not on a placeholder', async ({ page }) => {
  // The trigger is the confirmation itself. A test that opened the Assistant
  // and pressed the run button would prove the run works, not that onboarding
  // is one screen and one run.
  let linked = false
  await page.route('**/api/me', (route: Route) =>
    route.fulfill({
      json: {
        manager: { user_id: 'u', fpl_team_id: 6131656, team_name: 'Noggingham Forest', manager_name: 'Stephen', overall_rank: 1 },
        needsTeamLink: !linked,
      },
    }),
  )
  await page.route('**/api/team-link/resolve', (route: Route) =>
    route.fulfill({ json: { team: { fplTeamId: 6131656, teamName: 'Noggingham Forest', managerName: 'Stephen', overallRank: 12345 } } }),
  )
  await page.route('**/api/team-link/confirm', (route: Route) => {
    linked = true
    return route.fulfill({ json: { status: 'linked' } })
  })
  await page.route('**/api/world', (route: Route) => route.fulfill({ json: { ...world, calls: [], lastRunAt: null } }))
  // Held open, so the Thinking state is what is on screen when we look.
  await page.route('**/api/runs/stream', async (route: Route) => {
    await new Promise((resolve) => setTimeout(resolve, 4000))
    await route.fulfill({ headers: { 'content-type': 'text/event-stream' }, body: '' })
  })

  await page.goto('/')
  await page.getByLabel(/team ID/i).fill('6131656')
  await page.getByRole('button', { name: /Find my team/i }).click()
  await page.getByRole('button', { name: /Yes .+ my team/i }).click()

  // No tour, no settings pass, no placeholder: straight into the Thinking state,
  // which is where every route that re-reads the world passes through (F6-AC-16).
  await expect(page.getByTestId('thinking')).toBeVisible({ timeout: 10_000 })
})

test('F7-AC-21, F7-AC-23: the sheet opens from the avatar on both screens, and cancelling returns untouched', async ({ page }) => {
  await signedIn(page)

  // From the Squad screen.
  await page.getByTestId('account').click()
  await expect(page.getByTestId('account-sheet')).toContainText('Noggingham Forest')
  await page.getByRole('button', { name: 'Cancel' }).click()
  await expect(page.getByTestId('account-sheet')).toHaveCount(0)
  await expect(page.getByRole('tab', { name: 'Squad' })).toHaveAttribute('aria-selected', 'true')

  // And from the Assistant, which is a different screen with its own sheet.
  await page.getByRole('tab', { name: 'Assistant' }).click()
  await page.getByTestId('account').click()
  await expect(page.getByTestId('account-sheet')).toBeVisible()
  await page.getByRole('button', { name: 'Cancel' }).click()
  await expect(page.getByTestId('overview')).toBeVisible()
})

test('F7-AC-22, F7-AC-26: the sheet lists nothing that does not work, and no settings', async ({ page }) => {
  await signedIn(page)
  await page.getByTestId('account').click()

  const sheet = page.getByTestId('account-sheet')
  await expect(sheet.getByText(/settings/i)).toHaveCount(0)
  await expect(sheet.getByText(/coming (soon|later)/i)).toHaveCount(0)
  await expect(sheet.getByRole('button', { disabled: true })).toHaveCount(0)
})

test('F7-AC-24, F7-AC-25: log out confirms on a second page of the same sheet and lands on the Log in tab', async ({ page }) => {
  await signedIn(page)
  await page.getByTestId('account').click()

  await page.getByTestId('log-out').click()
  const confirm = page.getByTestId('log-out-confirm')
  // A second page of the same sheet, not a stacked overlay — one dialog only.
  await expect(page.getByRole('dialog')).toHaveCount(1)
  await expect(confirm).toContainText('kept')

  // The trigger for F7-AC-25 is confirming, so this confirms.
  await page.route('**/api/auth/logout', (route: Route) => route.fulfill({ json: { status: 'signed_out' } }))
  await page.getByTestId('log-out-confirmed').click()

  await expect(page.getByTestId('invite-only')).toBeVisible()
  await expect(page.getByRole('tab', { name: 'Log in' })).toHaveAttribute('aria-selected', 'true')
})
