import type { KvNoop } from '@chelonia/lib/kv-constants'

// The shapes the app passes around. Chelonia's own types come from
// @chelonia/lib; these are the ones this app defines.

// A Chelonia contract ID. A plain string, since a branded type would need a
// cast everywhere one comes off the wire.
export type ContractID = string

export type Todo = {
  title: string
  completed: boolean
  createdDate: string
}

// The `todos` slot value: todos keyed by id.
export type Todos = Record<string, Todo>

// A todo with its key folded in, which is what the list renders.
export type SortedTodo = Todo & { id: string }

// The `lists` slot value on the identity contract. Readonly because callers
// only ever read it; the reducer builds a new array.
export type Lists = readonly ContractID[]

// What a KV reducer returns: the next value, or KV_NOOP to cancel the write.
export type Reducer<T> = (prev: T) => T | KvNoop

// A write waiting for the server, mirrored from Chelonia's persistent action
// queue so the UI can show it on top of the last value the server sent.
export type PendingWrite = {
  id: string
  contractID: ContractID
  op: string
  args: unknown[]
}

// An invite read out of the URL fragment.
export type Invite = {
  contractID: ContractID
  secret: string
}

// Who is logged in, kept on Chelonia's root state as `loggedIn`.
export type LoggedIn = { identityContractID: ContractID }
