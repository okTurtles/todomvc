// The "How it works" panel. Each step has to say what really happened, so
// these check its claims against the app doing the real thing.

import { expect, test } from '@playwright/test'
import type { Page } from '@playwright/test'
import { addTodo, inviteLink, login, signup } from './helpers.ts'

const card = (page: Page, kind: string) => page.locator(`.explainer-card.is-${kind}`)

test('signing up says the password went out in none of the requests', async ({ page }) => {
  await page.goto('/app/')
  await expect(card(page, 'welcome')).toBeVisible()
  await expect(page.locator('.auth-demo')).toContainText("don't use a password")

  await signup(page)
  await expect(card(page, 'keys')).toContainText('Your password stayed here')
  await expect(card(page, 'keys').locator('.evidence')).toContainText('Your password was in none of them.')
  await expect(card(page, 'keys').locator('.requests li').first()).toContainText('POST /zkpp/register/')

  // Each key says what it does when clicked
  const keys = card(page, 'keys')
  await expect(keys.locator('.chip.is-key')).toHaveText(['ipk', 'iek', 'csk', 'cek', '#sak'])
  await expect(keys.locator('.key-note')).toHaveText('Click a key to see what it does.')
  await keys.getByRole('button', { name: 'cek' }).click()
  await expect(keys.getByRole('button', { name: 'cek' })).toHaveAttribute('aria-pressed', 'true')
  await expect(keys.locator('.key-note')).toContainText('without being able to read it')
})

test('logging in shows only the keys a login uses', async ({ page }) => {
  const username = await signup(page)
  await page.getByRole('button', { name: 'log out' }).click()
  await login(page, username)

  const keys = card(page, 'keys')
  await expect(keys.locator('h2')).toHaveText('Logged in without sending your password')
  // The iek is worked out again and unlocks the other three. No ipk.
  await expect(keys.locator('.chip.is-key')).toHaveText(['iek', 'csk', 'cek', '#sak'])
  await expect(keys.locator('.evidence')).toContainText('Your password was in none of them.')
})

test('adding a todo shows what was sent, without the todo in it', async ({ page }) => {
  await signup(page)
  await addTodo(page, 'buy oat milk')
  const encrypted = card(page, 'encrypted')
  await expect(encrypted.locator('.evidence')).toHaveText('“buy oat milk” is not in what was sent.')
  await expect(encrypted.locator('.compare dd').last()).toContainText('POST /kv/')
  await expect(encrypted.locator('.compare dd').last()).not.toContainText('buy oat milk')
})

test('sharing splits the link at the #, and joining keeps the secret too', async ({ browser }) => {
  const ownerContext = await browser.newContext()
  const guestContext = await browser.newContext()
  const owner = await ownerContext.newPage()
  const guest = await guestContext.newPage()
  try {
    await signup(owner)
    const link = await inviteLink(owner)
    const share = card(owner, 'share')
    await expect(share.locator('.link-parts .link-sent')).toHaveText(link.slice(0, link.indexOf('#')))
    await expect(share.locator('.link-parts .link-kept')).toHaveText(link.slice(link.indexOf('#')))
    await expect(share.locator('.evidence')).toContainText('The secret was in none of them.')

    // Signed up first, as the join screen replaces the lists until it's answered
    await guest.goto('/app/')
    await signup(guest)
    await guest.goto(link)
    await guest.getByRole('button', { name: /join/i }).click()
    await expect(card(guest, 'join').locator('.evidence')).toContainText('The secret was in none of them.')
  } finally {
    await ownerContext.close()
    await guestContext.close()
  }
})

test('offline, the queue fills, and it says how many went out once back', async ({ page, context }) => {
  await signup(page)
  await addTodo(page, 'written while connected')

  await context.setOffline(true)
  await expect(card(page, 'offline')).toBeVisible()
  await addTodo(page, 'written while offline')
  await expect(card(page, 'offline').locator('.chip.is-queued')).toHaveText(['add'])
  await expect(card(page, 'offline').locator('.evidence')).toHaveText('1 change waiting.')

  await context.setOffline(false)
  await expect(card(page, 'synced').locator('.evidence')).toHaveText('The 1 waiting change went out.')
})

test('turned off, it stays off after a reload', async ({ page }) => {
  await page.goto('/app/')
  await page.getByRole('button', { name: 'turn off' }).click()
  await expect(page.locator('.explainer-card')).toBeHidden()

  await page.reload()
  await expect(page.getByRole('button', { name: 'turn on' })).toBeVisible()
  await signup(page)
  await expect(page.locator('.explainer-card')).toBeHidden()
})
