import { reactive, watch } from 'vue'
import { connection } from './chelonia/connection.ts'
import { readInvite } from './chelonia/lists.ts'
import { pendingWrites } from './chelonia/offline.ts'
import { appearsIn, requestMark, requestsSince } from './chelonia/requests.ts'
import type { SentRequest } from './chelonia/requests.ts'

// The "How it works" panel. Each step shows what Chelonia just did, using the
// requests that really left the browser rather than a canned animation.
// Turning it off leaves a plain TodoMVC, and the choice is kept in this browser.

export type Step =
  | { kind: 'welcome' }
  | { kind: 'keys', signup: boolean, requests: SentRequest[], passwordSent: boolean }
  | { kind: 'encrypted', title: string, request: SentRequest, titleSent: boolean }
  | { kind: 'share', link: string, requests: SentRequest[], secretSent: boolean }
  | { kind: 'join', requests: SentRequest[], secretSent: boolean }
  | { kind: 'offline' }
  | { kind: 'synced', count: number }

const STORAGE_KEY = 'todomvc.explainer'

const readEnabled = (): boolean => {
  try {
    return localStorage.getItem(STORAGE_KEY) !== 'off'
  } catch {
    return true
  }
}

export const explainer = reactive<{ enabled: boolean, step: Step | null }>({
  enabled: readEnabled(),
  step: { kind: 'welcome' }
})

export function setExplainer (enabled: boolean): void {
  explainer.enabled = enabled
  try {
    localStorage.setItem(STORAGE_KEY, enabled ? 'on' : 'off')
  } catch {
    // Private mode and the like: it just isn't remembered
  }
}

const show = (step: Step): void => { explainer.step = step }
export const closeStep = (): void => { explainer.step = null }
export const resetExplainer = (): void => show({ kind: 'welcome' })

// Runs an action and hands back its result with the requests sent meanwhile.
export async function tracked <T> (action: () => Promise<T>): Promise<[T, SentRequest[]]> {
  const mark = requestMark()
  const result = await action()
  return [result, requestsSince(mark)]
}

// A serialized key with its secret half, as invite links carry it, is
// `[algorithm, null, secret]`. The secret half is what must not go out.
const secretHalf = (serialized: string): string => {
  try {
    const half = JSON.parse(serialized)[2]
    return typeof half === 'string' ? half : serialized
  } catch {
    return serialized
  }
}

export function explainKeys (signup: boolean, requests: SentRequest[], password: string): void {
  show({ kind: 'keys', signup, requests, passwordSent: appearsIn(requests, password) })
}

export function explainTodo (title: string, requests: SentRequest[]): void {
  // The write that carried it. Offline it is queued instead, either right
  // away or after a request that never got an answer, and the queue explains
  // that.
  const request = [...requests].reverse()
    .find((r) => r.answered && r.method === 'POST' && r.url.includes('/kv/'))
  // Offline by the time it was saved, the queue card says more
  if (!request || !connection.online) return
  show({ kind: 'encrypted', title, request, titleSent: appearsIn(requests, title) })
}

export function explainShare (link: string, requests: SentRequest[]): void {
  const secret = readInvite(new URL(link).hash)?.secret ?? ''
  show({ kind: 'share', link, requests, secretSent: appearsIn(requests, secretHalf(secret)) })
}

export function explainJoin (secret: string, requests: SentRequest[]): void {
  show({ kind: 'join', requests, secretSent: appearsIn(requests, secretHalf(secret)) })
}

// Offline, the panel follows the queue as it fills. Once the server is back
// and the queue is empty, it says how many changes went out.
let queued = 0
watch(() => [connection.online, pendingWrites().length] as const, ([online, waiting]) => {
  if (!online) {
    queued = Math.max(queued, waiting)
    if (explainer.step?.kind !== 'offline') show({ kind: 'offline' })
    return
  }
  if (explainer.step?.kind === 'offline' && waiting === 0) {
    show({ kind: 'synced', count: queued })
    queued = 0
  }
})
