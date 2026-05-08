<script setup lang="ts">
import { getFieldDef } from '~/config/content-registry'
import type { FieldType } from '~/config/content-registry'
import { computed } from 'vue'
import { useEditMode } from '@/composables/useEditMode'
import { navigateTo } from '#app'

interface Props {
  /** Page slug e.g. "home", "about", "contact" */
  page: string
  /** Field key matching the registry e.g. "hero.title", "intro.body" */
  field: string
  /** The current value to display/edit */
  modelValue?: string
  /** Override the tag used to render the value */
  tag?: string
  /** Force a source override (use when you know it's google-managed but no registry entry) */
  isGoogleManaged?: boolean
  /** Where the Google Business settings link points */
  googleSyncPath?: string
  /** Extra CSS classes forwarded to the element */
  class?: string
}

const props = withDefaults(defineProps<Props>(), {
  tag: 'span',
  isGoogleManaged: false,
  googleSyncPath: '/dashboard/connection'
})

const emit = defineEmits<{
  'update:modelValue': [value: string]
}>()

const { editMode, queueChange } = useEditMode()

// Resolve from registry (if available)
const fieldDef = computed(() => getFieldDef(props.page, props.field))

const source = computed(() => {
  if (props.isGoogleManaged) return 'google'
  return 'manual'
})

const fieldType = computed<FieldType>(() => fieldDef.value?.type ?? 'text')

const isEditable = computed(() => editMode.value && source.value === 'manual')
const isGoogle = computed(() => editMode.value && source.value === 'google')

// The namespaced change key sent to the composable
const changeKey = computed(() => `${props.page}.${props.field}`)

const handleInput = (event: Event) => {
  const el = event.target as HTMLElement
  const value = el.innerHTML
  emit('update:modelValue', value)
  queueChange(changeKey.value, value)
}

const goToSync = () => navigateTo(props.googleSyncPath)

// Empty-state placeholder text
const placeholder = computed(
  () => fieldDef.value?.placeholder || fieldDef.value?.label
    ? `Click to edit: ${fieldDef.value?.label ?? props.field}`
    : `Click to edit…`
)
</script>

<template>
  <!-- ─── EDIT MODE: Google-managed overlay ─────────────────────────── -->
  <div v-if="isGoogle" class="relative inline-block w-full group">
    <component :is="tag" v-html="modelValue" />
    <button
      type="button"
      class="absolute inset-0 z-20 flex items-center justify-center bg-blue-500/10 border-2 border-blue-500/40 border-dashed rounded-md opacity-0 group-hover:opacity-100 transition-opacity cursor-pointer"
      :aria-label="`${field} is managed via Google Business`"
      @click="goToSync"
    >
      <span class="inline-flex items-center gap-1.5 bg-blue-600 text-white text-[10px] font-bold uppercase tracking-widest px-3 py-1 rounded-full shadow-lg pointer-events-none">
        <span class="w-1.5 h-1.5 bg-white rounded-full animate-pulse" />
        Google Business · Manage Sync
      </span>
    </button>
  </div>

  <!-- ─── EDIT MODE: Inline editable (richtext / text) ─────────────── -->
  <component
    :is="tag"
    v-else-if="isEditable"
    contenteditable="true"
    :class="[
      'outline outline-2 outline-offset-2 outline-amber-400/50 hover:outline-amber-500',
      'focus:outline-amber-600 focus:bg-amber-50/30 rounded transition-all',
      'min-h-[1em] cursor-text',
      props.class
    ]"
    :data-placeholder="placeholder"
    @blur="handleInput"
    v-html="modelValue || ''"
  />

  <!-- ─── NORMAL VIEW (non-edit mode) ──────────────────────────────── -->
  <component
    :is="tag"
    v-else-if="modelValue"
    :class="props.class"
    v-html="modelValue"
  />

  <!-- ─── NORMAL VIEW: empty value in non-edit mode → render nothing ── -->
  <!-- Nothing rendered intentionally when modelValue is empty and not in edit mode -->
</template>

<style scoped>
[contenteditable]:focus {
  outline: none;
}
[contenteditable]:empty::before {
  content: attr(data-placeholder);
  color: #a8a29e;
  font-style: italic;
  pointer-events: none;
}
</style>
