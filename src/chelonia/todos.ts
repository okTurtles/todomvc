import sbp from '@sbp/sbp'
import { CHELONIA_KV_VALIDATION_ERROR } from '@chelonia/lib/events'
import { KV_NOOP } from '@chelonia/lib/kv-constants'
import type { ChelContractState, KvMirrorEntry } from '@chelonia/lib/types'
import { LIST_CONTRACT_NAME } from './config.ts'
import { connection } from './connection.ts'
import { currentLists } from './lists.ts'
import { forgetWrites, pendingWrites, queuedWrites, queueWrite } from './offline.ts'
import { state } from './state.ts'
import { applyWrites, storedWrite, todosSchema } from './todos-model.ts'
import type { ContractID, Todos } from '../types.ts'

const TODOS_KEY = 'todos'
const NO_TODOS: Todos = Object.freeze({})
const QUEUED_WRITE = 'todomvc/todos/write'

// One declaration covers the first fetch, the pubsub subscription, the local
// mirror, schema validation and the conflict retries.
export function defineTodosSlot (): void {
  sbp('chelonia/kv/defineSlot', {
    contractType: LIST_CONTRACT_NAME,
    key: TODOS_KEY,
    defaultValue: {},
    schema: todosSchema,
    // Attaches to every list this account is in, but only once we hold that
    // list's keys. Between accepting an invite and the owner answering it there
    // is nothing here we could read or write: /kv/:contractID/:key is
    // authorized with the contract's own #sak.
    //
    // Nothing re-runs this by hand when the keys finally arrive. Chelonia marks
    // the contract dirty on OP_KEY_SHARE and resyncs it, and a resync drops and
    // re-adds the subscription, which is what reconciles the slots again.
    match: (contractID: ContractID, contractState: ChelContractState) =>
      currentLists().includes(contractID) &&
      !!sbp('chelonia/contract/currentKeyIdByName', contractState, '#sak', true)
  })

  sbp('sbp/selectors/register', {
    // Each queued write is stored as a call to this, but whichever one runs
    // sends every write still waiting for that list. See sendQueued.
    [QUEUED_WRITE]: (contractID: ContractID) => sendQueued(contractID)
  })

  // A value that fails the schema never reaches the app: the mirror keeps the
  // last good one and the slot goes to 'error'. The UI reads that status; this
  // is here so the reason is visible while developing.
  sbp('okTurtles.events/on', CHELONIA_KV_VALIDATION_ERROR,
    ({ key, reason, error }: { key: string, reason: string, error: unknown }) => {
      if (key !== TODOS_KEY) return
      console.error(`[todomvc] rejected a ${reason} value for '${key}'`, error)
    })
}

// Reading `entry.value` is what makes a Vue computed re-run when Chelonia
// updates the mirror. The value itself comes from the selector, which
// substitutes the declared default. See "Consumer caveats" in docs/kv.md.
//
// Writes still waiting for the server are applied on top, in the order they
// were made, so the list looks the same offline as it will once they land.
export function currentTodos (contractID: ContractID | null): Todos {
  const entry = mirrorEntry(contractID)
  if (!entry) return NO_TODOS
  const saved = (entry.value ?? sbp('chelonia/kv/read', contractID, TODOS_KEY)) as Todos
  const next = applyWrites(saved, pendingWrites().filter((w) => w.contractID === contractID))
  return next === KV_NOOP ? saved : next
}

// 'non-init' | 'loading' | 'loaded' | 'error'
export function todosStatus (contractID: ContractID | null): KvMirrorEntry['status'] | 'non-init' {
  return mirrorEntry(contractID)?.status ?? 'non-init'
}

export const pendingCount = (contractID: ContractID | null): number =>
  pendingWrites().filter((w) => w.contractID === contractID).length

const mirrorEntry = (contractID: ContractID | null): KvMirrorEntry | undefined =>
  contractID ? state._kv?.[contractID]?.[TODOS_KEY] : undefined

// Goes straight to the server when it is there. Otherwise, or when the request
// fails before an answer, the write is queued and sent later. It also queues
// behind writes still waiting for the same list, since on its own it would be
// applied to a value that doesn't have them yet.
async function write (contractID: ContractID, op: string, ...args: unknown[]): Promise<void> {
  const invocation = [QUEUED_WRITE, contractID, op, ...args]
  const queued = { contractID, op, args }
  if (!connection.online || pendingCount(contractID) > 0) return queueWrite(invocation, queued)
  const updater = storedWrite(op, args)
  if (!updater) throw new Error(`Invalid todo write: ${op}`)
  try {
    await sbp('chelonia/kv/update', { contractID, key: TODOS_KEY, updater })
  } catch (e) {
    // fetch rejects with a TypeError when the server never answered.
    if (!(e instanceof TypeError)) throw e
    queueWrite(invocation, queued)
  }
}

// Sends every write waiting for a list as one update, in the order they were
// made, so each one is applied after the ones before it. The queue tries each
// write on its own (right away, on a timer, and all at once when the
// connection is back), so sends are kept one at a time per list: a try that
// starts while another is out then finds the writes already sent.
//
// A TypeError (no answer) keeps the writes queued. Anything else is the
// server refusing them, and the queue's failure handler drops the write it
// was trying.
const sending = new Map<ContractID, Promise<void>>()

function sendQueued (contractID: ContractID): Promise<void> {
  const send = async () => {
    const writes = queuedWrites(contractID)
    if (writes.length === 0) return
    await sbp('chelonia/kv/update', {
      contractID,
      key: TODOS_KEY,
      updater: (todos: Todos) => applyWrites(todos, writes)
    })
    await forgetWrites(writes.map((w) => w.id))
  }
  const run = (sending.get(contractID) ?? Promise.resolve()).catch(() => {}).then(send)
  sending.set(contractID, run)
  return run
}

// Not crypto.randomUUID: that needs a secure context, and opening the demo
// from another machine on http://192.168.x.x is not one.
const newId = (): string =>
  Array.from(crypto.getRandomValues(new Uint8Array(16)), (b) =>
    b.toString(16).padStart(2, '0')).join('')

export const createTodo = (contractID: ContractID, title: string): Promise<void> =>
  write(contractID, 'addTodo', {
    id: newId(),
    // Server time, so a tab with a wrong clock sorts the same as everyone else.
    createdDate: new Date(sbp('chelonia/time')).toISOString(),
    title
  })

export const setTodoCompleted = (contractID: ContractID, id: string, completed: boolean): Promise<void> =>
  write(contractID, 'setCompleted', id, completed)
export const renameTodo = (contractID: ContractID, id: string, title: string): Promise<void> =>
  write(contractID, 'setTitle', id, title)
export const destroyTodo = (contractID: ContractID, id: string): Promise<void> =>
  write(contractID, 'removeTodo', id)
export const completeAllTodos = (contractID: ContractID, completed: boolean): Promise<void> =>
  write(contractID, 'setAllCompleted', completed)
export const clearCompletedTodos = (contractID: ContractID): Promise<void> =>
  write(contractID, 'removeCompleted')
