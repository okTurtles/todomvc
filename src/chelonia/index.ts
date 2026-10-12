import { configureChelonia } from './config.ts'
import { watchConnection } from './connection.ts'
import { persistState } from './state.ts'
import { restoreSession } from './auth.ts'
import { defineListsSlot } from './lists.ts'
import { setupOfflineQueue } from './offline.ts'
import { defineTodosSlot } from './todos.ts'
import type { ContractID } from '../types.ts'

export async function startChelonia (): Promise<ContractID | null> {
  watchConnection()
  await configureChelonia()
  setupOfflineQueue()
  defineListsSlot()
  defineTodosSlot()
  persistState()
  return restoreSession()
}

export {
  changePassword, currentUsername, deleteAccount, login, logout, signup
} from './auth.ts'
export { AuthError } from './errors.ts'
export { pendingWrites } from './offline.ts'
export { connection } from './connection.ts'
export { state } from './state.ts'
