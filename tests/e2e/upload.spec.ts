/**
 * Correcting the squad from two screenshots, in a real browser at 390×844 (F2).
 *
 * **The sheet is opened and driven, never asserted over a fixed screen** (P16).
 * The failure test uploads pictures the server rejects, because the criterion is
 * about what happens when a read falls short — over a successful upload it would
 * pass whether the rule were built or not.
 */

import { type Route, expect, test } from '@playwright/test'
import { open, world } from './fixture'

/** A one-pixel PNG. The parse is the server's; what is under test is the flow. */
const PIXEL =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg=='

async function openSheet(page: Parameters<typeof open>[0]) {
  await open(page, {}, world.calls, {}, null)
  await page.getByRole('tab', { name: 'Squad' }).click()
  await page.getByTestId('update').click()
}

/** Puts a file into the picker without a real camera roll. */
async function choose(page: Parameters<typeof open>[0], which: 'team' | 'transfers') {
  await page.getByTestId(`file-${which}`).setInputFiles({
    name: `${which}.png`,
    mimeType: 'image/png',
    buffer: Buffer.from(PIXEL.split(',')[1] ?? '', 'base64'),
  })
}

test('F2-AC-01, F2-AC-02: the sheet says what each picture is read for, before either is chosen', async ({ page }) => {
  await openSheet(page)

  // Stated up front — being asked for two pictures with no reason reads as a bug.
  await expect(page.getByTestId('reads-team')).toContainText('starting eleven')
  await expect(page.getByTestId('reads-team')).toContainText('chips')
  await expect(page.getByTestId('reads-transfers')).toContainText('bank')
  await expect(page.getByTestId('reads-transfers')).toContainText('free transfers')

  // And nothing can be sent until both are chosen: one picture cannot produce a squad.
  await expect(page.getByTestId('upload-go')).toBeDisabled()
})

test('F2-AC-03: each picture comes from the camera roll, and there is no in-app capture', async ({ page }) => {
  await openSheet(page)

  for (const which of ['team', 'transfers'] as const) {
    const input = page.getByTestId(`file-${which}`)
    await expect(input).toHaveAttribute('accept', 'image/*')
    // `capture` is what opens a camera. Its absence is the criterion.
    await expect(input).not.toHaveAttribute('capture', /.*/)
  }
})

test('F2-UP-01: a read that falls short applies nothing, and names the picture and the causes', async ({ page }) => {
  await openSheet(page)

  // The trigger: an upload the server genuinely rejects.
  await page.route('**/api/squad/screenshots', (route: Route) =>
    route.fulfill({
      status: 422,
      json: {
        error: 'upload_failed',
        screen: 'transfers',
        because: 'free transfers were not found on the Transfers screenshot',
        causes: ['the screenshot was cropped', 'it is a photo of a screen rather than a screenshot', 'it is the wrong screen'],
      },
    }),
  )

  await choose(page, 'team')
  await choose(page, 'transfers')
  await page.getByTestId('upload-go').click()

  const failed = page.getByTestId('upload-failed')
  await expect(failed).toContainText('Transfers screen')
  await expect(failed).toContainText('free transfers were not found')
  await expect(failed).toContainText('Nothing changed')
  // The three causes, and the same upload actions still there to try again.
  await expect(failed.getByRole('listitem')).toHaveCount(3)
  await expect(page.getByTestId('upload-go')).toBeEnabled()
})

test('F2-AC-05, F2-AC-06: a successful read returns through the Thinking state, not to the squad', async ({ page }) => {
  await openSheet(page)

  await page.route('**/api/squad/screenshots', (route: Route) =>
    route.fulfill({ json: { snapshotId: 'snap-new', locksBroken: 0 } }),
  )
  // Held open, so the Thinking state is what is on screen when we look.
  await page.route('**/api/runs/stream', async (route: Route) => {
    await new Promise((resolve) => setTimeout(resolve, 4000))
    await route.fulfill({ headers: { 'content-type': 'text/event-stream' }, body: '' })
  })

  await choose(page, 'team')
  await choose(page, 'transfers')
  await page.getByTestId('upload-go').click()

  // The same regeneration a refresh runs — not a path of its own.
  await expect(page.getByTestId('thinking')).toBeVisible({ timeout: 10_000 })
})

test('F2-AC-08: the Squad screen says nothing about where its squad came from', async ({ page }) => {
  await open(page, {}, world.calls, {}, null)
  await page.getByRole('tab', { name: 'Squad' }).click()

  // The manager knows whether he has just uploaded; the Assistant states it on
  // the editorial card instead, which is where the disclosure belongs.
  await expect(page.getByText(/screenshot/i)).toHaveCount(0)
  await expect(page.getByText(/as at the .* deadline/i)).toHaveCount(0)
})

test('an upload clears every decision, and the manager is told rather than left to notice', async ({ page }) => {
  await openSheet(page)

  /**
   * **Deliberately names no criterion, and does not spell one out either.**
   * Two of F2's acceptance criteria — the one saying selected calls survive a
   * correction, and the one describing the lock-breaking this replaces — were
   * overruled on 2026-09-16, and neither has caught up in the PRD yet
   * (STE-139). Naming either would report a criterion covered by a test
   * asserting the opposite of what it says: worse than uncovered, because the
   * number then stops anyone looking.
   *
   * **The identifiers are not written even in this comment.** The coverage
   * script reads whole files, so an explanation of why a criterion is not
   * covered is counted as covering it — which is exactly what happened on the
   * first draft of this block, and twice before it in this repo.
   * `docs/coverage-gaps.md` is where they are named.
   *
   * The trigger is an upload the server answers with decisions cleared, which
   * is the only circumstance this behaviour exists for.
   */
  await page.route('**/api/squad/screenshots', (route: Route) =>
    route.fulfill({ json: { snapshotId: 'snap-new', decisionsCleared: 2 } }),
  )
  await page.route('**/api/runs/stream', (route: Route) =>
    route.fulfill({ headers: { 'content-type': 'text/event-stream' }, body: '' }),
  )

  await choose(page, 'team')
  await choose(page, 'transfers')
  await page.getByTestId('upload-go').click()

  const told = page.getByTestId('dropped')
  await expect(told).toContainText('2 calls')
  await expect(told).toContainText('cleared')
  await expect(told).toContainText('for this squad')
})

test('F6-AC-15: an upload asks for one run, and walking away and back does not ask again', async ({ page }) => {
  await openSheet(page)

  /**
   * **The trigger is leaving the screen and coming back**, not a re-render
   * (P16). The guard against a second run was a ref inside the Assistant, and a
   * ref belongs to a mounted component — so the walk threw it away while the
   * flag asking for a run stayed set, and every return started another
   * (STE-137). A re-render test passes against that bug and proves nothing.
   */
  let runs = 0
  await page.route('**/api/runs/stream', (route: Route) => {
    runs += 1
    return route.fulfill({ headers: { 'content-type': 'text/event-stream' }, body: '' })
  })
  await page.route('**/api/squad/screenshots', (route: Route) =>
    route.fulfill({ json: { snapshotId: 'snap-new', locksBroken: 0 } }),
  )

  await choose(page, 'team')
  await choose(page, 'transfers')
  await page.getByTestId('upload-go').click()
  await expect.poll(() => runs).toBe(1)

  // Away and back, twice. Nothing here is the manager asking for advice.
  for (let i = 0; i < 2; i += 1) {
    await page.getByRole('tab', { name: 'Squad' }).click()
    await expect(page.getByTestId('update')).toBeVisible()
    await page.getByRole('tab', { name: 'Assistant' }).click()
  }

  await expect(page.getByRole('tab', { name: 'Assistant' })).toBeVisible()
  expect(runs).toBe(1)
})
