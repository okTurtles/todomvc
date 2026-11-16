// Every request the app sends to the server goes through here, Chelonia's
// included, so the explainer can show what actually left the browser. They
// are only collected while an action runs, in memory, and go nowhere else.

// `answered` turns true once the server replies, with any status. A request
// that fails before that never reached it.
export type SentRequest = { method: string, url: string, body: string, answered: boolean }

// One list per action running right now
const collecting = new Set<SentRequest[]>()

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
  // A Request carries its body inside, and reading it here would use it up.
  // Nothing in the app sends one, but if something does, say so instead of
  // checking an empty body.
  if (init?.body == null && request?.body != null) entry.body = '[request body]'
  for (const list of collecting) list.push(entry)
  const response = await fetch(input, init)
  entry.answered = true
  return response
}

// Runs an action and hands back its result with every request sent meanwhile.
export async function collectRequests <T> (action: () => Promise<T>): Promise<[T, SentRequest[]]> {
  const requests: SentRequest[] = []
  collecting.add(requests)
  try {
    return [await action(), requests]
  } finally {
    collecting.delete(requests)
  }
}

// Whether `text` went out in any of `requests`, as is or in any of the ways a
// URL, a form or JSON would encode it. Only the query of a URL is looked at:
// the rest is the server's address and the API path, where the only thing the
// user typed is the username, and a password like "localhost" would match it.
export function appearsIn (requests: SentRequest[], text: string): boolean {
  if (!text) return false
  const forms = new Set([
    text,
    encodeURIComponent(text),
    new URLSearchParams({ x: text }).toString().slice(2),
    JSON.stringify(text).slice(1, -1)
  ])
  const queryOf = (url: string): string => {
    const at = url.indexOf('?')
    return at === -1 ? '' : url.slice(at + 1)
  }
  return requests.some(({ url, body }) =>
    [...forms].some((form) => queryOf(url).includes(form) || body.includes(form)))
}
