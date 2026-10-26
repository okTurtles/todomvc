import { reactive, watch } from 'vue'
import { connection } from './chelonia/connection.ts'
import { readInvite } from './chelonia/lists.ts'
import { pendingWrites, rejectedWriteMessage } from './chelonia/offline.ts'
import { appearsIn, collectRequests } from './chelonia/requests.ts'
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

// `shown` counts the steps, so the card remounts and plays again even when a
// step is the same as the one before, like sharing the same invite twice.
export const explainer = reactive<{ enabled: boolean, step: Step | null, shown: number }>({
  enabled: readEnabled(),
  step: { kind: 'welcome' },
  shown: 0
})

export function setExplainer (enabled: boolean): void {
  explainer.enabled = enabled
  try {
    localStorage.setItem(STORAGE_KEY, enabled ? 'on' : 'off')
  } catch {
    // Private mode and the like: it just isn't remembered
  }
}

const show = (step: Step): void => {
  explainer.shown++
  explainer.step = step
}

// Closing the offline card keeps it closed until the server is back, rather
// than having it open again with the next change made offline.
let offlineClosed = false
export const closeStep = (): void => {
  if (explainer.step?.kind === 'offline') offlineClosed = true
  explainer.step = null
}
export const resetExplainer = (): void => show({ kind: 'welcome' })

export const tracked = collectRequests

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
    if (!offlineClosed && explainer.step?.kind !== 'offline') show({ kind: 'offline' })
    return
  }
  offlineClosed = false
  if (explainer.step?.kind === 'offline' && waiting === 0) {
    const sent = queued
    queued = 0
    // The queue also empties when the server refuses a write, which went
    // nowhere. The todo list says so already, so the card just closes.
    if (rejectedWriteMessage()) explainer.step = null
    else show({ kind: 'synced', count: sent })
  }
})
