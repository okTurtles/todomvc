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
import { state } from './state.ts'
import type { ContractID, PendingWrite } from '../types.ts'

const QUEUE_KEY = 'todomvc/pending-writes'
const NO_WRITES: readonly PendingWrite[] = Object.freeze([])

// What `chelonia.persistentActions/status` gives back, narrowed to the parts
// this app reads.
type QueuedAction = {
  id: string
  invocation: [selector: string, contractID: ContractID, op: string, ...args: unknown[]]
}

export const pendingWrites = (): readonly PendingWrite[] => state.pendingWrites ?? NO_WRITES
export const rejectedWriteMessage = (): string => state.rejectedWrite ?? ''

// Set when a session opens. `load` retries every stored write before we get a
// chance to filter them, so the failure handler needs this to tell one of ours
// from one left behind by whoever used this browser before.
let isOurWrite: (contractID: ContractID) => boolean = () => false

const queuedActions = (): QueuedAction[] => sbp('chelonia.persistentActions/status')

export function setupOfflineQueue (): void {
  keepQueueInLocalStorage()
  sbp('chelonia.persistentActions/configure', {
    databaseKey: QUEUE_KEY,
    // maxAttempts has to be a real number rather than Infinity. The queue is
    // stored as JSON, where Infinity turns into null, and an action read back
    // with a null limit is thrown away the first time it fails.
    options: { retrySeconds: 15, maxAttempts: Number.MAX_SAFE_INTEGER }
  })
  const forget = ({ id }: { id: string }) => {
    state.pendingWrites = pendingWrites().filter((w) => w.id !== id)
  }
  sbp('okTurtles.events/on', PERSISTENT_ACTION_SUCCESS, forget)
  sbp('okTurtles.events/on', PERSISTENT_ACTION_FAILURE, ({ id, error }: { id: string, error: unknown }) => {
    // fetch rejects with a TypeError when the server never answered, which is
    // what the queue is for. Anything else means it answered and will not take
    // this write, so retrying forever would only hide it.
    if (error instanceof TypeError) return
    const action = queuedActions().find((a) => a.id === id)
    // A write for a list this account is not in belongs to whoever used this
    // browser before. Dropped without a word, since it is not ours to report.
    if (action && isOurWrite(action.invocation[1])) {
      console.error('[todomvc] the server refused a queued write', error)
      state.rejectedWrite = 'A change made offline was refused by the server.'
    }
    sbp('chelonia.persistentActions/cancel', id)
    forget({ id })
  })
}

// chelonia.db is an in-memory map in this app, and the queue has to outlive a
// reload, so this one key goes to localStorage instead.
//
// sessionStorage would fit the rest of the database better, since that is
// thrown away too, and it would give each window its own queue. It loses more
// than it gains though: a change queued while the server was away is sent on
// the next visit with localStorage, and with sessionStorage it is gone as soon
// as the tab closes, without anything being said.
function keepQueueInLocalStorage (): void {
  const get = sbp('sbp/selectors/fn', 'chelonia.db/get') as (key: string) => Promise<unknown>
  const set = sbp('sbp/selectors/fn', 'chelonia.db/set') as (key: string, value: string) => Promise<unknown>
  // Both return a promise, as the originals do and as their callers expect.
  sbp('sbp/selectors/overwrite', {
    'chelonia.db/get': async (key: string) =>
      key === QUEUE_KEY ? localStorage.getItem(QUEUE_KEY) : get(key),
    'chelonia.db/set': async (key: string, value: string) =>
      key === QUEUE_KEY ? localStorage.setItem(QUEUE_KEY, value) : set(key, value)
  })
  sbp('sbp/selectors/lock', ['chelonia.db/get', 'chelonia.db/set'])
}

// Called once a session is open. Writes for lists this account is not in
// (another account used this browser and never logged out) are dropped.
// The overlay is rebuilt from the queue rather than from the saved state, so
// what is shown cannot drift from what will actually be sent.
export async function loadOfflineQueue (isOurs: (contractID: ContractID) => boolean): Promise<void> {
  isOurWrite = isOurs
  // Both are saved with the rest of the state. The overlay is rebuilt below,
  // and the notice is about a write that is already gone, so neither should
  // survive into this session.
  state.pendingWrites = []
  delete state.rejectedWrite
  await sbp('chelonia.persistentActions/load')
  for (const action of queuedActions()) {
    if (!isOurs(action.invocation[1])) await sbp('chelonia.persistentActions/cancel', action.id)
  }
  state.pendingWrites = queuedActions().map(
    ({ id, invocation: [, contractID, op, ...args] }) => ({ id, contractID, op, args })
  )
}

export function queueWrite (invocation: unknown[], write: Omit<PendingWrite, 'id'>): void {
  delete state.rejectedWrite
  const [id] = sbp('chelonia.persistentActions/enqueue', invocation) as string[]
  state.pendingWrites = [...pendingWrites(), { id: id!, ...write }]
}

export const retryPendingWrites = (): Promise<unknown> =>
  sbp('chelonia.persistentActions/retryAll')

export async function dropPendingWrites (): Promise<void> {
  isOurWrite = () => false
  for (const { id } of queuedActions()) {
    await sbp('chelonia.persistentActions/cancel', id)
  }
  state.pendingWrites = []
  delete state.rejectedWrite
}
