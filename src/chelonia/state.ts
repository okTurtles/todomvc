import sbp from '@sbp/sbp'
import { reactive, watch } from 'vue'
import type { ChelRootState } from '@chelonia/lib/types'
import type { LoggedIn, PendingWrite } from '../types.ts'

const STORAGE_KEY = 'todomvc/chelonia-state'

// Chelonia's root state plus the three fields this app adds. All optional:
// each one is deleted or absent until something sets it.
export type TodomvcState = ChelRootState & {
  loggedIn?: LoggedIn
  // Writes still waiting for the server, shown on top of the last value it
  // sent, and the notice about one it refused. See offline.ts.
  pendingWrites?: readonly PendingWrite[]
  rejectedWrite?: string
}

function loadSaved (): TodomvcState | null {
  try {
    const saved = localStorage.getItem(STORAGE_KEY)
    return saved ? JSON.parse(saved) as TodomvcState : null
  } catch (e) {
    console.warn('[todomvc] ignoring unreadable saved state', e)
    return null
  }
}

// Chelonia's root state: contract states, secret keys, the KV mirror at `_kv`,
// and one field of our own, `loggedIn`.
//
// Vue 3 tracks a `reactive()` object through a Proxy, so the default
// reactiveSet and reactiveDel in chelonia/configure are correct. Chelonia
// writes the KV mirror into this object, which is what lets the UI update from
// a computed instead of a subscription.
// Chelonia fills in the rest, `secretKeys` included, when it is configured.
export const state: TodomvcState = reactive(loadSaved() ?? { contracts: {} } as TodomvcState)

sbp('sbp/selectors/register', {
  'todomvc/state': () => state
})

let stopWatching: (() => void) | null = null

// Saving the whole state on every change is fine at this size. An app with
// large contracts would debounce this or use IndexedDB.
//
// Note this writes `secretKeys` in the clear. Fine for a demo, not for a real
// app: Group Income keeps the same state in an encrypted database.
export function persistState (): void {
  stopWatching?.()
  stopWatching = watch(state, () => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state))
    } catch (e) {
      console.error('[todomvc] could not save state', e)
    }
  }, { deep: true, flush: 'post' })
}

// Stops saving as well as clearing. The watcher runs after the current render,
// so leaving it on would write the state straight back.
export function clearSavedState (): void {
  stopWatching?.()
  stopWatching = null
  localStorage.removeItem(STORAGE_KEY)
}

// Another tab logged out. This one still has the session and its watcher, so
// its next save would put the keys back. Drop the session here too.
window.addEventListener('storage', (e) => {
  if (e.key !== STORAGE_KEY || e.newValue !== null) return
  stopWatching?.()
  stopWatching = null
  delete state.loggedIn
})
