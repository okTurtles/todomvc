// Every request the app sends to the server goes through here, Chelonia's
// included, so the explainer can show what actually left the browser. Only the
// last few are kept, in memory, and they go nowhere else.

// `answered` turns true once the server replies, with any status. A request
// that fails before that never reached it.
export type SentRequest = { method: string, url: string, body: string, answered: boolean }

const KEPT = 100
const sent: SentRequest[] = []
let total = 0

const bodyText = (body: BodyInit | null | undefined): string => {
  if (body == null) return ''
  if (typeof body === 'string') return body
  if (body instanceof URLSearchParams) return body.toString()
  if (body instanceof FormData) {
    return [...body.entries()]
      .map(([name, value]) => `${name}=${typeof value === 'string' ? value : '[file]'}`)
      .join('&')
  }
  return '[binary]'
}

export const sendRequest: typeof fetch = async (input, init) => {
  const request = input instanceof Request ? input : null
  const entry: SentRequest = {
    method: (init?.method ?? request?.method ?? 'GET').toUpperCase(),
    url: request?.url ?? String(input),
    body: bodyText(init?.body),
    answered: false
  }
  sent.push(entry)
  if (sent.length > KEPT) sent.shift()
  total++
  const response = await fetch(input, init)
  entry.answered = true
  return response
}

// Take a mark before an action, and get the requests it made afterwards.
export const requestMark = (): number => total
export const requestsSince = (mark: number): SentRequest[] =>
  sent.slice(Math.max(0, sent.length - (total - mark)))

// Whether `text` went out in any of `requests`, as is or in any of the ways a
// URL, a form or JSON would encode it.
export function appearsIn (requests: SentRequest[], text: string): boolean {
  if (!text) return false
  const forms = new Set([
    text,
    encodeURIComponent(text),
    new URLSearchParams({ x: text }).toString().slice(2),
    JSON.stringify(text).slice(1, -1)
  ])
  return requests.some(({ url, body }) =>
    [...forms].some((form) => url.includes(form) || body.includes(form)))
}
