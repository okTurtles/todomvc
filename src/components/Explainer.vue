<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { INVITE_LIFETIME } from '../chelonia/lists.ts'
import { pendingWrites } from '../chelonia/offline.ts'
import type { SentRequest } from '../chelonia/requests.ts'
import { closeStep, explainer, setExplainer } from '../explainer.ts'

const step = computed(() => explainer.step)
// Remounts the card on every step, so its animation plays again
const stepKey = computed(() => JSON.stringify(explainer.step))

// What each key does, in plain words. From docs/login.md and docs/sharing.md.
const KEY_NOTES: Record<string, string> = {
  ipk: 'Made from your password. It signed the message that created your account. Its secret half is never saved: your password makes it again when needed.',
  iek: 'Made from your password. It locks your other keys, so your account can keep them on the server and you can unlock them on any device. Its secret half is never saved.',
  csk: 'Made at random when the account was created. It signs what your account writes, so anyone can check it came from you.',
  cek: 'Made at random when the account was created. It encrypts what your account stores, so the server keeps it without being able to read it.',
  '#sak': 'Made at random when the account was created. It proves to the server which account a request comes from. The server checks it before it gives out or saves stored data.'
}
// Logging in only works out the iek again, and it unlocks the other three.
// The ipk isn't needed for that.
const keysFor = (signup: boolean): string[] =>
  signup ? ['ipk', 'iek', 'csk', 'cek', '#sak'] : ['iek', 'csk', 'cek', '#sak']
const pickedKey = ref<string | null>(null)
watch(stepKey, () => { pickedKey.value = null })
const pickKey = (key: string): void => {
  pickedKey.value = pickedKey.value === key ? null : key
}

const INVITE_DAYS = INVITE_LIFETIME / (24 * 60 * 60 * 1000)

const OP_LABELS: Record<string, string> = {
  addTodo: 'add',
  setCompleted: 'tick',
  setTitle: 'rename',
  removeTodo: 'delete',
  setAllCompleted: 'tick all',
  removeCompleted: 'clear'
}
const waiting = computed(() => pendingWrites().map((w) => OP_LABELS[w.op] ?? w.op))

// Contract IDs are long, so the middle of each one is left out
const shorten = (text: string): string =>
  text.replace(/z[1-9A-HJ-NP-Za-km-z]{30,}/g, (id) => `${id.slice(0, 6)}…`)
const describe = ({ method, url }: SentRequest): string =>
  `${method} ${shorten(new URL(url, window.location.origin).pathname)}`
const preview = (body: string): string => body.length > 140 ? `${body.slice(0, 140)}…` : body
// A piece of the actual ciphertext: the longest run of base64 in the body,
// since the shorter ones are key IDs
const cipherSample = (body: string): string => {
  const runs = body.match(/[A-Za-z0-9+/=]{24,}/g) ?? [body]
  return `${runs.reduce((a, b) => b.length > a.length ? b : a).slice(0, 12)}…`
}

const plural = (n: number, word: string): string => `${n} ${word}${n === 1 ? '' : 's'}`

const linkParts = (link: string): [string, string] => {
  const at = link.indexOf('#')
  return at === -1 ? [link, ''] : [link.slice(0, at), link.slice(at)]
}
</script>

<template>
  <aside class="explainer" aria-label="How it works">
    <div class="explainer-bar">
      <span>How it works</span>
      <button
        type="button"
        class="link"
        :aria-pressed="explainer.enabled"
        @click="setExplainer(!explainer.enabled)"
      >
        {{ explainer.enabled ? 'turn off' : 'turn on' }}
      </button>
    </div>

    <section
      v-if="explainer.enabled && step"
      :key="stepKey"
      class="explainer-card"
      :class="`is-${step.kind}`"
      aria-live="polite"
    >
      <button type="button" class="explainer-close" aria-label="Hide this explanation" @click="closeStep">
        ×
      </button>

      <template v-if="step.kind === 'welcome'">
        <h2>What happens when you use it</h2>
        <div class="diagram">
          <div class="node">this browser</div>
          <div class="wire">
            <span v-for="i in 3" :key="i" class="packet" :style="{ animationDelay: `${i * 0.5}s` }" />
          </div>
          <div class="node">server</div>
        </div>
        <p>
          This panel explains each step as you go: making an account or
          logging in, adding a todo, sharing or joining a list, and going
          offline. It uses the requests that really leave your browser.
        </p>
      </template>

      <template v-else-if="step.kind === 'keys'">
        <h2>{{ step.signup ? 'Your password stayed here' : 'Logged in without sending your password' }}</h2>
        <div class="diagram">
          <div class="node">
            this browser
            <span class="chip is-secret">your password</span>
            <span class="keys">
              <button
                v-for="(key, i) in keysFor(step.signup)"
                :key="key"
                type="button"
                class="chip is-key"
                :aria-pressed="pickedKey === key"
                :style="{ animationDelay: `${0.3 + i * 0.15}s` }"
                @click="pickKey(key)"
              >{{ key }}</button>
            </span>
          </div>
          <div class="wire">
            <span
              v-for="(r, i) in step.requests.slice(0, 6)"
              :key="i"
              class="packet"
              :style="{ animationDelay: `${1 + i * 0.3}s` }"
            />
          </div>
          <div class="node">
            server
            <span class="chip">salts and a hash</span>
          </div>
        </div>
        <p class="key-note" :class="{ 'is-hint': !pickedKey }">
          <template v-if="pickedKey"><strong>{{ pickedKey }}</strong>: {{ KEY_NOTES[pickedKey] }}</template>
          <template v-else>Click a key to see what it does.</template>
        </p>
        <p v-if="step.signup">
          Your keys were made in this browser: ipk and iek from your password,
          the other three at random. The server keeps two salts and a hash of
          the password, so you can log in again, but never the password itself.
        </p>
        <p v-else>
          Your browser proved it knows the password without sending it. Then it
          worked out the iek from the password here, and the iek unlocked your
          other keys, which your account keeps encrypted.
        </p>
        <p class="evidence" :class="{ 'is-bad': step.passwordSent }">
          {{ plural(step.requests.length, 'request') }} went to the server.
          {{ step.passwordSent ? 'Your password was in one of them.' : 'Your password was in none of them.' }}
        </p>
        <details>
          <summary>What was sent</summary>
          <ul class="requests">
            <li v-for="(r, i) in step.requests" :key="i">{{ describe(r) }}</li>
          </ul>
        </details>
      </template>

      <template v-else-if="step.kind === 'encrypted'">
        <h2>Encrypted before it left</h2>
        <div class="diagram">
          <div class="node">
            this browser
            <span class="morph">
              <span class="chip is-plain">{{ step.title }}</span>
              <span class="chip is-cipher">{{ cipherSample(step.request.body) }}</span>
            </span>
          </div>
          <div class="wire">
            <span class="packet" style="animation-delay: 1.4s" />
          </div>
          <div class="node">
            server
            <span class="chip is-stored">can't read it</span>
          </div>
        </div>
        <p>
          The list's key encrypted your todo in this browser. The server stores
          it, but can't read it.
        </p>
        <dl class="compare">
          <dt>You typed</dt>
          <dd>{{ step.title }}</dd>
          <dt>What was sent</dt>
          <dd><code>{{ describe(step.request) }}</code> {{ preview(step.request.body) }}</dd>
        </dl>
        <p class="evidence" :class="{ 'is-bad': step.titleSent }">
          {{ step.titleSent ? `“${step.title}” was in what was sent.` : `“${step.title}” is not in what was sent.` }}
        </p>
      </template>

      <template v-else-if="step.kind === 'share'">
        <h2>The secret stays after the #</h2>
        <p class="link-parts">
          <span class="link-sent">{{ linkParts(step.link)[0] }}</span><span class="link-kept">{{ linkParts(step.link)[1] }}</span>
        </p>
        <p class="link-legend">
          <span class="link-sent">sent when the link is opened</span>
          <span class="link-kept">never sent</span>
        </p>
        <p>
          This link lets one person join the list, and it stops working
          {{ plural(INVITE_DAYS, 'day') }} after it was made. The part after #
          holds the invite's secret, and browsers never send that part to a
          server.
        </p>
        <p class="evidence" :class="{ 'is-bad': step.secretSent }">
          <template v-if="step.requests.length === 0">
            This invite was made earlier, so nothing new was sent.
          </template>
          <template v-else>
            Making the invite sent {{ plural(step.requests.length, 'request') }}.
            {{ step.secretSent ? 'The secret was in one of them.' : 'The secret was in none of them.' }}
          </template>
        </p>
      </template>

      <template v-else-if="step.kind === 'join'">
        <h2>Asked to join without giving the secret away</h2>
        <div class="diagram">
          <div class="node">
            this browser
            <span class="chip is-secret">invite secret</span>
          </div>
          <div class="wire">
            <span class="packet" style="animation-delay: 0.6s" />
          </div>
          <div class="node">
            server
            <span class="chip">signed request</span>
          </div>
        </div>
        <p>
          Your browser used the secret from the link to sign a request to join.
          Someone who already has the list, like its owner, answers it from
          their browser with the list's keys, so one of them has to be online
          with the app open.
        </p>
        <p class="evidence" :class="{ 'is-bad': step.secretSent }">
          {{ plural(step.requests.length, 'request') }} went out.
          {{ step.secretSent ? 'The secret was in one of them.' : 'The secret was in none of them.' }}
        </p>
      </template>

      <template v-else-if="step.kind === 'offline'">
        <h2>Offline: changes wait here</h2>
        <div class="diagram">
          <div class="node">
            this browser
            <span class="queue">
              <span v-for="(label, i) in waiting" :key="i" class="chip is-queued">{{ label }}</span>
              <span v-if="waiting.length === 0" class="queue-empty">queue</span>
            </span>
          </div>
          <div class="wire is-cut" />
          <div class="node">server</div>
        </div>
        <p>
          The server can't be reached. Changes to your todos wait in this
          browser, even across a reload, and go out once it's back.
        </p>
        <p class="evidence">{{ plural(waiting.length, 'change') }} waiting.</p>
      </template>

      <template v-else-if="step.kind === 'synced'">
        <h2>Back online</h2>
        <div class="diagram">
          <div class="node">this browser</div>
          <div class="wire">
            <span
              v-for="i in Math.min(step.count, 6)"
              :key="i"
              class="packet"
              :style="{ animationDelay: `${i * 0.3}s` }"
            />
          </div>
          <div class="node">server</div>
        </div>
        <p class="evidence">
          {{ step.count > 0 ? `The ${plural(step.count, 'waiting change')} went out.` : 'Nothing was waiting.' }}
        </p>
      </template>
    </section>
  </aside>
</template>
