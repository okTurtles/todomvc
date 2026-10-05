<script setup lang="ts">
import { computed, nextTick, ref } from 'vue'
import type { PropType } from 'vue'
import { createList, inviteToList, listTitle, renameList } from '../chelonia/lists.ts'
import { connection } from '../chelonia/connection.ts'
import { MAX_TITLE_LENGTH } from '../chelonia/todos-model.ts'
import type { ContractID, Lists } from '../types.ts'

const props = defineProps({
  lists: { type: Array as PropType<Lists>, required: true },
  modelValue: { type: String as PropType<ContractID | null>, default: null },
  // Owned by App, which also renders the waiting message.
  pending: { type: Boolean, default: false }
})
const emit = defineEmits(['update:modelValue'])

const newTitle = ref('')
const editing = ref(false)
const editTitle = ref('')
const editInput = ref<HTMLInputElement | null>(null)
const link = ref('')
const busy = ref(false)
const error = ref('')

const readOnly = computed(() => !connection.online || busy.value)
const titleOf = (contractID: ContractID): string => listTitle(contractID) ?? 'Waiting for keys'

async function run <T>(write: () => Promise<T>): Promise<T | undefined> {
  error.value = ''
  busy.value = true
  try {
    return await write()
  } catch (e) {
    error.value = 'That did not work. Check the console.'
    console.error('[todomvc] list action failed', e)
  } finally {
    busy.value = false
  }
}

async function add (): Promise<void> {
  const title = newTitle.value.trim()
  if (!title || readOnly.value) return
  newTitle.value = ''
  const contractID = await run(() => createList(title))
  if (contractID) emit('update:modelValue', contractID)
}

// Sharing and renaming only happen on the selected list, so modelValue is
// always set below. A list that is not pending has a title.

async function share (): Promise<void> {
  link.value = ''
  const url = await run(() => inviteToList(props.modelValue!))
  if (url) link.value = url
}

function startEditing (): void {
  if (readOnly.value || props.pending) return
  editing.value = true
  editTitle.value = listTitle(props.modelValue!)!
  nextTick(() => editInput.value?.select())
}

function finishEditing (): void {
  const title = editTitle.value.trim()
  if (!editing.value || readOnly.value) return
  editing.value = false
  if (title && title !== listTitle(props.modelValue!)) {
    run(() => renameList(props.modelValue!, title))
  }
}
</script>

<template>
  <section class="lists">
    <nav class="list-tabs">
      <button
        v-for="contractID in lists"
        :key="contractID"
        type="button"
        :class="{ selected: contractID === modelValue }"
        @click="emit('update:modelValue', contractID)"
        @dblclick="contractID === modelValue && startEditing()"
      >
        {{ titleOf(contractID) }}
      </button>
    </nav>

    <input
      v-if="editing"
      ref="editInput"
      v-model="editTitle"
      class="list-rename"
      :maxlength="MAX_TITLE_LENGTH"
      @blur="finishEditing"
      @keyup.enter="finishEditing"
      @keyup.escape="editing = false"
    >

    <form class="list-new" @submit.prevent="add">
      <input
        v-model="newTitle"
        type="text"
        placeholder="New list"
        aria-label="New list"
        :maxlength="MAX_TITLE_LENGTH"
        :disabled="readOnly"
      >
      <button type="submit" :disabled="readOnly">Add list</button>
      <button
        v-if="modelValue"
        type="button"
        class="link share"
        :disabled="readOnly || pending"
        @click="share"
      >
        Share
      </button>
    </form>

    <div v-if="link" class="list-invite">
      <label>
        Invite link
        <input
          class="invite-link"
          :value="link"
          readonly
          @focus="($event.target as HTMLInputElement).select()"
        >
      </label>
      <p>
        Anyone with this link can join, once. Keep this page open until they do:
        their browser asks yours for the keys, and only yours can hand them over.
      </p>
    </div>

    <p v-if="!connection.online" class="list-note">
      Lists can only be made, renamed or shared while connected. Todos can be
      changed either way.
    </p>
    <p v-if="error" class="list-error">{{ error }}</p>
  </section>
</template>
