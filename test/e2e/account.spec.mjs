// Changing the password and deleting the account. Both begin by showing the
// server we know the current password, and both touch keys that only a real
// round trip can prove are still usable afterwards.

import { expect, test } from '@playwright/test'
import {
  PASSWORD,
  addTodo,
  changePassword,
  deleteAccount,
  login,
  loginForm,
  openAccount,
  signup,
  titles
} from './helpers.mjs'

const NEW_PASSWORD = 'todomvc-e2e-new-password'

test('the new password works on the next login and the old one stops working', async ({ page }) => {
  const username = await signup(page)
  await addTodo(page, 'kept across a password change')

  await openAccount(page)
  await changePassword(page, PASSWORD, NEW_PASSWORD)
  await expect(page.locator('.account-message')).toContainText('Password changed')

  await page.getByRole('button', { name: 'log out' }).click()
  await login(page, username, PASSWORD)
  await expect(page.locator('.auth-error')).toHaveText('Incorrect username or password.')

  await page.reload()
  await login(page, username, NEW_PASSWORD)
  await expect(page.locator('.session')).toContainText(username)
  // CSK, CEK and SAK were kept and only re-encrypted, so everything written
  // before the change is still readable.
  await expect(titles(page)).toHaveText(['kept across a password change'])
})

test('a wrong current password leaves the password alone', async ({ page }) => {
  const username = await signup(page)

  await openAccount(page)
  await changePassword(page, 'not-the-right-password', NEW_PASSWORD)
  await expect(page.locator('.auth-error')).toHaveText('Incorrect password.')

  await page.getByRole('button', { name: 'log out' }).click()
  await login(page, username, PASSWORD)
  await expect(page.locator('.session')).toContainText(username)
})

// The deletion token is encrypted with a password-derived key, so a password
// change has to publish it again under the new one. Without that step the
// token cannot be read and this fails.
test('the account can still be deleted after a password change', async ({ page }) => {
  await signup(page)

  await openAccount(page)
  await changePassword(page, PASSWORD, NEW_PASSWORD)
  await expect(page.locator('.account-message')).toContainText('Password changed')

  await deleteAccount(page, NEW_PASSWORD)
  await expect(loginForm(page)).toBeVisible()
  await expect(page.locator('.session')).toBeHidden()
})

test('deleting the account ends the session and the login stops working', async ({ page }) => {
  const username = await signup(page)
  await addTodo(page, 'goes with the account')

  await openAccount(page)
  await deleteAccount(page, PASSWORD)

  // Deleting logs out, so the login form is back and nothing local is left.
  await expect(loginForm(page)).toBeVisible()
  await expect(page.locator('.session')).toBeHidden()
  const saved = await page.evaluate(() => localStorage.getItem('todomvc/chelonia-state'))
  expect(saved).toBeNull()

  await login(page, username, PASSWORD)
  await expect(page.locator('.auth-error')).toBeVisible()
})

test('a wrong password does not delete the account', async ({ page }) => {
  const username = await signup(page)
  await addTodo(page, 'still here')

  await openAccount(page)
  await deleteAccount(page, 'not-the-right-password')
  await expect(page.locator('.auth-error')).toHaveText('Incorrect password.')

  await expect(page.locator('.session')).toContainText(username)
  await page.getByRole('button', { name: 'log out' }).click()
  await login(page, username)
  await expect(titles(page)).toHaveText(['still here'])
})
