import { KV_NOOP } from '@chelonia/lib/kv-constants'
import type { Reducer, SortedTodo, Todo, Todos } from '../types.ts'

export const MAX_TITLE_LENGTH = 512

// A slot schema is any object with a synchronous `parse(value)`; Zod also fits.
// Chelonia runs it on our writes, on values pushed by other clients and on
// load, so a buggy client cannot break the others.
//
// `null` and `undefined` are rejected anywhere in the value. Chelonia writes
// `null` on the wire to clear a key and uses `undefined` for "not loaded", so
// optional fields have to be modelled by leaving them out.
export const todosSchema = {
  parse (value: unknown): Todos {
    if (typeof value !== 'object' || value === null || Array.isArray(value)) {
      throw new TypeError('todos must be an object keyed by id')
    }
    const parsed: Todos = {}
    for (const [id, todo] of Object.entries(value)) {
      if (typeof todo !== 'object' || todo === null || Array.isArray(todo)) {
        throw new TypeError(`todo ${id} must be an object`)
      }
      const { title, completed, createdDate } = todo as Partial<Todo>
      if (typeof title !== 'string' || title.length === 0 || title.length > MAX_TITLE_LENGTH) {
        throw new TypeError(`todo ${id} has an invalid title`)
      }
      if (typeof completed !== 'boolean') {
        throw new TypeError(`todo ${id} has an invalid completed flag`)
      }
      if (typeof createdDate !== 'string' || Number.isNaN(Date.parse(createdDate))) {
        throw new TypeError(`todo ${id} has an invalid createdDate`)
      }
      parsed[id] = { title, completed, createdDate }
    }
    return parsed
  }
}

// Every write is one of these. Chelonia re-runs them against the server's copy
// when someone else wrote first, so two tabs converge without any conflict
// handling here. KV_NOOP cancels the write.

export const addTodo = (
  { id, title, createdDate }: SortedTodo | { id: string, title: string, createdDate: string }
): Reducer<Todos> => (prev) => ({
  ...prev,
  [id]: { title, completed: false, createdDate }
})

export const setCompleted = (id: string, completed: boolean): Reducer<Todos> => (prev) => {
  const todo = prev[id]
  if (!todo || todo.completed === completed) return KV_NOOP
  return { ...prev, [id]: { ...todo, completed } }
}

export const setTitle = (id: string, title: string): Reducer<Todos> => (prev) => {
  const todo = prev[id]
  if (!todo || todo.title === title) return KV_NOOP
  return { ...prev, [id]: { ...todo, title } }
}

export const removeTodo = (id: string): Reducer<Todos> => (prev) => {
  if (!prev[id]) return KV_NOOP
  const { [id]: _removed, ...rest } = prev
  return rest
}

export const setAllCompleted = (completed: boolean): Reducer<Todos> => (prev) => {
  const changing = Object.entries(prev).filter(([, todo]) => todo.completed !== completed)
  if (changing.length === 0) return KV_NOOP
  const next = { ...prev }
  for (const [id, todo] of changing) next[id] = { ...todo, completed }
  return next
}

export const removeCompleted = (): Reducer<Todos> => (prev) => {
  const entries = Object.entries(prev).filter(([, todo]) => !todo.completed)
  if (entries.length === Object.keys(prev).length) return KV_NOOP
  return Object.fromEntries(entries)
}

// The slot value is a plain object, so order is not something to rely on.
export const sortedTodos = (todos: Todos): SortedTodo[] =>
  Object.entries(todos)
    .map(([id, todo]) => ({ id, ...todo }))
    .sort((a, b) => a.createdDate.localeCompare(b.createdDate) || a.id.localeCompare(b.id))
