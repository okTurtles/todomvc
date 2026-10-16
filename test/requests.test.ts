import assert from 'node:assert/strict'
import { test } from 'node:test'
import { appearsIn, requestMark, requestsSince, sendRequest } from '../src/chelonia/requests.ts'
import type { SentRequest } from '../src/chelonia/requests.ts'

const request = (over: Partial<SentRequest> = {}): SentRequest =>
  ({ method: 'POST', url: 'http://localhost/kv/z1/todos', body: '', answered: true, ...over })

test('appearsIn finds text sent as is, in a URL, in a form or in JSON', () => {
  const secret = 'pass word+/="1'
  assert.equal(appearsIn([request({ body: `x${secret}x` })], secret), true)
  assert.equal(appearsIn([request({ url: `http://localhost/?p=${encodeURIComponent(secret)}` })], secret), true)
  assert.equal(appearsIn([request({ body: new URLSearchParams({ p: secret }).toString() })], secret), true)
  assert.equal(appearsIn([request({ body: JSON.stringify({ p: secret }) })], secret), true)
})

test('appearsIn says no when the text went out in none of them', () => {
  assert.equal(appearsIn([request({ body: 'encrypted' }), request()], 'buy milk'), false)
  assert.equal(appearsIn([], 'buy milk'), false)
  // An empty string is in everything, so it never counts as found
  assert.equal(appearsIn([request({ body: 'anything' })], ''), false)
})

test('requestsSince returns what was sent after the mark', async (t) => {
  t.mock.method(globalThis, 'fetch', async () => new Response('ok'))
  await sendRequest('http://localhost/before')
  const mark = requestMark()
  await sendRequest('http://localhost/kv/z1/todos', { method: 'post', body: 'cipher' })
  await sendRequest('http://localhost/form', { method: 'POST', body: new URLSearchParams({ a: 'b' }) })
  assert.deepEqual(requestsSince(mark), [
    { method: 'POST', url: 'http://localhost/kv/z1/todos', body: 'cipher', answered: true },
    { method: 'POST', url: 'http://localhost/form', body: 'a=b', answered: true }
  ])
})

test('a request that never got an answer is kept, but not as answered', async (t) => {
  t.mock.method(globalThis, 'fetch', async () => { throw new TypeError('Failed to fetch') })
  const mark = requestMark()
  await assert.rejects(sendRequest('http://localhost/kv/z1/todos', { method: 'POST', body: 'cipher' }))
  assert.deepEqual(requestsSince(mark), [
    { method: 'POST', url: 'http://localhost/kv/z1/todos', body: 'cipher', answered: false }
  ])
})
