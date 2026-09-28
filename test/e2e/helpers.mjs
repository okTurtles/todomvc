import { expect } from '@playwright/test'

export const PASSWORD = 'todomvc-e2e-password'

let counter = 0

// chel's NAME_REGEX allows lowercase letters, digits, hyphen and underscore,
// and no repeated separator. Every test makes its own account so one test
// cannot see another's todos.
export const newUsername = () =>
  `e2e-${Date.now().toString(36)}-${(counter++).toString(36)}`

export async function signup (page, username = newUsername()) {
  if (!page.url().includes('/app/')) await page.goto('/app/')
  await page.getByRole('button', { name: 'Create an account' }).click()
  await page.getByLabel('Username').fill(username)
  await page.getByLabel('Password').fill(PASSWORD)
  await page.getByRole('button', { name: 'Create account' }).click()
  await expect(page.locator('.session')).toContainText(username)
  // Signup also creates the account's first list, and todos live on it.
  await expect(page.locator('.list-tabs button')).toHaveText(['My todos'])
  return username
}

export async function login (page, username, password = PASSWORD) {
  await page.getByLabel('Username').fill(username)
  await page.getByLabel('Password').fill(password)
  await page.getByRole('button', { name: 'Log in' }).click()
}

export async function addTodo (page, title) {
  const input = page.locator('.new-todo')
  await input.fill(title)
  await input.press('Enter')
}

export const titles = (page) => page.locator('.todo-list li label')
export const items = (page) => page.locator('.todo-list li')

// The owner mints an invite and reads the link out of the box it lands in.
export async function inviteLink (page) {
  await page.getByRole('button', { name: 'Share' }).click()
  const link = page.locator('.invite-link')
  await expect(link).toBeVisible()
  return link.inputValue()
}

// The account panel, opened from the footer.
export async function openAccount (page) {
  await page.getByRole('button', { name: 'account', exact: true }).click()
  await expect(page.getByRole('heading', { name: 'Change password' })).toBeVisible()
}

// Both forms in the panel have a field labelled 'Password', so each one is
// reached through its own form.
const accountForm = (page, heading) =>
  page.locator('form.auth', { has: page.getByRole('heading', { name: heading }) })

export async function changePassword (page, oldPassword, newPassword) {
  const form = accountForm(page, 'Change password')
  await form.getByLabel('Current password').fill(oldPassword)
  await form.getByLabel('New password').fill(newPassword)
  await form.getByRole('button', { name: 'Change password' }).click()
}

export async function deleteAccount (page, password) {
  const form = accountForm(page, 'Delete account')
  await form.getByLabel('Password').fill(password)
  await form.getByRole('button', { name: 'Delete my account' }).click()
}

// The panel's forms also use .auth, so the login view is told apart by its own
// button. Use this instead of .auth wherever the panel may have been open.
export const loginForm = (page) =>
  page.locator('form.auth', { has: page.getByRole('button', { name: 'Log in' }) })
