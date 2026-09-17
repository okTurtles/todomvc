// Writes made while the server is unreachable.
//
// They go into Chelonia's persistent action queue, which retries them until
// the server takes them, and until then they are shown on top of the last
// value the server sent. The queue keeps `[selector, ...args]` as plain JSON,
// so a write is described by name and its reducer is looked up when it runs.

import sbp from '@sbp/sbp'
import {
  PERSISTENT_ACTION_FAILURE,
  PERSISTENT_ACTION_SUCCESS
} from '@chelonia/lib/events'
import { state } from './state.js'

const QUEUE_KEY = 'todomvc/pending-writes'
const NO_WRITES = Object.freeze([])

export const pendingWrites = () => state.pendingWrites ?? NO_WRITES
export const rejectedWrite = () => state.rejectedWrite ?? ''

export function setupOfflineQueue () {
  ensureRandomUUID()
  keepQueueInLocalStorage()
  sbp('chelonia.persistentActions/configure', {
    databaseKey: QUEUE_KEY,
    // maxAttempts has to be a real number rather than Infinity. The queue is
    // stored as JSON, where Infinity turns into null, and an action read back
    // with a null limit is thrown away the first time it fails.
    options: { retrySeconds: 15, maxAttempts: Number.MAX_SAFE_INTEGER }
  })
  const forget = ({ id }) => {
    state.pendingWrites = pendingWrites().filter((w) => w.id !== id)
  }
  sbp('okTurtles.events/on', PERSISTENT_ACTION_SUCCESS, forget)
  sbp('okTurtles.events/on', PERSISTENT_ACTION_FAILURE, ({ id, error }) => {
    // fetch rejects with a TypeError when the server never answered, which is
    // what the queue is for. Anything else means it answered and will not take
    // this write, so retrying forever would only hide it.
    if (error instanceof TypeError) return
    console.error('[todomvc] the server refused a queued write', error)
    state.rejectedWrite = 'A change made offline was refused by the server.'
    sbp('chelonia.persistentActions/cancel', id)
    forget({ id })
  })
}

// TODO: BEGIN REMOVEME (okTurtles/libcheloniajs#100)
// PersistentAction ids come from crypto.randomUUID, which browsers only
// provide on https and localhost, so the first queued write throws when the
// demo is opened over the LAN. The lib does this itself now, so this goes with
// the next release.
function ensureRandomUUID () {
  if (typeof crypto.randomUUID === 'function') return
  crypto.randomUUID = () => {
    const bytes = crypto.getRandomValues(new Uint8Array(16))
    bytes[6] = (bytes[6] & 0x0f) | 0x40
    bytes[8] = (bytes[8] & 0x3f) | 0x80
    const hex = Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('')
    return [hex.slice(0, 8), hex.slice(8, 12), hex.slice(12, 16), hex.slice(16, 20), hex.slice(20)]
      .join('-')
  }
}
// TODO: END REMOVEME (okTurtles/libcheloniajs#100)

// chelonia.db is an in-memory map in this app, and the queue has to outlive a
// reload, so this one key goes to localStorage instead.
function keepQueueInLocalStorage () {
  const get = sbp('sbp/selectors/fn', 'chelonia.db/get')
  const set = sbp('sbp/selectors/fn', 'chelonia.db/set')
  // Both return a promise, as the originals do and as their callers expect.
  sbp('sbp/selectors/overwrite', {
    'chelonia.db/get': async (key) =>
      key === QUEUE_KEY ? localStorage.getItem(QUEUE_KEY) : get(key),
    'chelonia.db/set': async (key, value) =>
      key === QUEUE_KEY ? localStorage.setItem(QUEUE_KEY, value) : set(key, value)
  })
  sbp('sbp/selectors/lock', ['chelonia.db/get', 'chelonia.db/set'])
}

// Called once a session is open. Writes for lists this account is not in
// (another account used this browser and never logged out) are dropped.
// The overlay is rebuilt from the queue rather than from the saved state, so
// what is shown cannot drift from what will actually be sent.
export async function loadOfflineQueue (isOurs) {
  await sbp('chelonia.persistentActions/load')
  for (const action of sbp('chelonia.persistentActions/status')) {
    if (!isOurs(action.invocation[1])) await sbp('chelonia.persistentActions/cancel', action.id)
  }
  state.pendingWrites = sbp('chelonia.persistentActions/status').map(
    ({ id, invocation: [, contractID, op, ...args] }) => ({ id, contractID, op, args })
  )
}

export function queueWrite (invocation, write) {
  delete state.rejectedWrite
  const [id] = sbp('chelonia.persistentActions/enqueue', invocation)
  state.pendingWrites = [...pendingWrites(), { id, ...write }]
}

export const retryPendingWrites = () => sbp('chelonia.persistentActions/retryAll')

export async function dropPendingWrites () {
  for (const { id } of sbp('chelonia.persistentActions/status')) {
    await sbp('chelonia.persistentActions/cancel', id)
  }
  state.pendingWrites = []
  delete state.rejectedWrite
}
