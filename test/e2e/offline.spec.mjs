// Writes made while the server is unreachable: what is shown, what is kept,
// what is sent later and what is thrown away.

import { expect, test } from '@playwright/test'
import { addTodo, login, loginForm, signup, titles } from './helpers.mjs'

test('a change made while the server is unreachable is sent once it is back', async ({ page, context }) => {
  await signup(page)
  await addTodo(page, 'written while connected')

  await context.setOffline(true)
  await expect(page.locator('.todo-notice')).toContainText('Not connected')

  // Still editable. The change shows at once and waits in the queue.
  await addTodo(page, 'written while offline')
  await expect(titles(page)).toHaveText(['written while connected', 'written while offline'])
  await expect(page.locator('.todo-notice')).toContainText('1 waiting')

  await context.setOffline(false)
  await expect(page.locator('.todo-notice')).toBeHidden()
  await expect(page.locator('.todo-status')).toBeHidden()

  // Nothing is queued any more, so this is what the server has.
  await page.reload()
  await expect(titles(page)).toHaveText(['written while connected', 'written while offline'])
})

test('several queued writes all land, in the order they were made', async ({ page, context }) => {
  await signup(page)
  await addTodo(page, 'landed before going offline')
  await expect(page.locator('.todo-status')).toBeHidden()

  await context.setOffline(true)
  await expect(page.locator('.todo-notice')).toContainText('Not connected')

  await addTodo(page, 'first')
  await addTodo(page, 'second')
  // A todo the server already has, so this is a change queued behind two
  // others that has to be applied after them.
  await page.locator('.todo-list li').first().locator('.toggle').click()
  await expect(page.locator('.todo-notice')).toContainText('3 waiting')
  await expect(page.locator('.todo-list li').first()).toHaveClass(/completed/)

  await context.setOffline(false)
  await expect(page.locator('.todo-notice')).toBeHidden()
  await expect(page.locator('.todo-status')).toBeHidden()

  await page.reload()
  await expect(titles(page)).toHaveText(['landed before going offline', 'first', 'second'])
  await expect(page.locator('.todo-list li').first()).toHaveClass(/completed/)
})

// Known gap, see docs/data.md. A todo made offline is not on the server yet,
// so ticking it runs the reducer against a value that does not have it. That
// comes out as a no-op, the queue counts it as done, and the tick is lost
// without anything being said. Renaming or deleting one goes the same way.
test.fixme('a todo made offline can be ticked off before it lands', async ({ page, context }) => {
  await signup(page)
  await context.setOffline(true)
  await expect(page.locator('.todo-notice')).toContainText('Not connected')

  await addTodo(page, 'made and ticked while offline')
  await page.locator('.todo-list li').first().locator('.toggle').click()
  await expect(page.locator('.todo-notice')).toContainText('2 waiting')
  await expect(page.locator('.todo-list li').first()).toHaveClass(/completed/)

  await context.setOffline(false)
  await expect(page.locator('.todo-notice')).toBeHidden()
  await page.reload()
  await expect(page.locator('.todo-list li').first()).toHaveClass(/completed/)
})

// The saved state would otherwise render the last known todos as though they
// were live.
test('a reload with the server unreachable says so instead of showing old todos', async ({ page }) => {
  await signup(page)
  await addTodo(page, 'saved before the reload')

  // Going offline for real would stop the page itself loading, so only the
  // server's own routes are cut off and the app's files are left alone.
  await page.route('**/*', (route) => {
    const { pathname } = new URL(route.request().url())
    return pathname.startsWith('/app/') || pathname.startsWith('/assets/')
      ? route.continue()
      : route.abort('connectionfailed')
  })

  await page.reload()

  await expect(page.locator('.boot-error')).toContainText('Could not reach the server')
  await expect(titles(page)).toHaveText([])
})

test('a queued write survives a reload and is sent when the server is back', async ({ page }) => {
  await signup(page)

  // Only the todo write is cut off, so the page still loads and the session
  // still restores. The request fails without an answer, which is what sends
  // the write to the queue.
  let refuse = true
  await page.route('**/kv/**', (route) => refuse && route.request().method() === 'POST'
    ? route.abort('connectionfailed')
    : route.continue())

  await addTodo(page, 'queued across a reload')
  await expect(page.locator('.todo-status')).toContainText('Sending 1 change')

  // Chelonia's own db is an in-memory map here, so the queue is kept in
  // localStorage or it would not outlive the page.
  const queued = await page.evaluate(() => localStorage.getItem('todomvc/pending-writes'))
  expect(queued).toContain('addTodo')

  await page.reload()
  await expect(titles(page)).toHaveText(['queued across a reload'])
  await expect(page.locator('.todo-status')).toContainText('Sending 1 change')

  // Retried on a timer, so this waits longer than the rest.
  refuse = false
  await expect(page.locator('.todo-status')).toBeHidden({ timeout: 45_000 })

  // Sent, not just shown on top of what the server has.
  await page.reload()
  await expect(titles(page)).toHaveText(['queued across a reload'])
})

// A write the server answers with an error gets the same answer next time, so
// it is dropped rather than retried forever.
test('a queued write the server refuses is dropped and reported', async ({ page, context }) => {
  await signup(page)

  await context.setOffline(true)
  await expect(page.locator('.todo-notice')).toContainText('Not connected')
  await addTodo(page, 'the server will say no to this')
  await expect(page.locator('.todo-notice')).toContainText('1 waiting')

  await page.route('**/kv/**', (route) => route.request().method() === 'POST'
    ? route.fulfill({ status: 400, contentType: 'text/plain', body: 'no' })
    : route.continue())

  await context.setOffline(false)
  await expect(page.locator('.todo-error')).toContainText('refused by the server')
  // Off the list as well as out of the queue, so nothing is waiting.
  await expect(titles(page)).toHaveText([])
  await expect(page.locator('.todo-status')).toBeHidden()
  await expect(page.locator('.todo-notice')).toBeHidden()
})

test('logging out with writes still queued warns, and drops them once confirmed', async ({ page, context }) => {
  const username = await signup(page)
  await addTodo(page, 'written while connected')

  await context.setOffline(true)
  await expect(page.locator('.todo-notice')).toContainText('Not connected')
  await addTodo(page, 'never sent')
  await expect(page.locator('.todo-notice')).toContainText('1 waiting')

  // Dismissed, so the session stays and so does the queued write.
  let asked = ''
  page.once('dialog', (dialog) => { asked = dialog.message(); dialog.dismiss() })
  await page.getByRole('button', { name: 'log out' }).click()
  await expect.poll(() => asked).toContain('1 change made offline will be lost')
  await expect(page.locator('.session')).toContainText(username)
  await expect(page.locator('.todo-notice')).toContainText('1 waiting')

  page.once('dialog', (dialog) => dialog.accept())
  await page.getByRole('button', { name: 'log out' }).click()
  await expect(loginForm(page)).toBeVisible()

  // The keys that would have signed it went with the session, so it was never
  // going to be sent.
  await context.setOffline(false)
  await login(page, username)
  await expect(titles(page)).toHaveText(['written while connected'])
})

test('list controls are disabled while the server is unreachable', async ({ page, context }) => {
  await signup(page)

  await context.setOffline(true)
  await expect(page.locator('.list-note')).toContainText('only be made, renamed or shared')
  await expect(page.getByRole('button', { name: 'Add list' })).toBeDisabled()
  await expect(page.getByRole('button', { name: 'Share' })).toBeDisabled()
  await expect(page.getByLabel('New list')).toBeDisabled()

  // Todos are not, which is the whole point of the queue.
  await addTodo(page, 'still editable')
  await expect(titles(page)).toHaveText(['still editable'])

  await context.setOffline(false)
  await expect(page.locator('.list-note')).toBeHidden()
  await expect(page.getByRole('button', { name: 'Add list' })).toBeEnabled()
})
