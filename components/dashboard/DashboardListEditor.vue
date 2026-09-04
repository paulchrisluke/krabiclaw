<template>
  <section class="space-y-6">
    <!--
      The heading and its controls live in the body, not the navbar. The navbar
      carries the way out of the level; this row carries what you can do to the
      list. Keeping them apart is what lets one component own every list without
      each page wiring its own header.
    -->
    <header>
      <!--
        The controls sit against the heading, not against the whole text block.
        Pairing them with the description too let a long sentence push them onto
        a line of their own on a phone.
      -->
      <div class="flex items-center justify-between gap-4">
        <h1 class="min-w-0 truncate text-2xl font-semibold text-highlighted">{{ title }}</h1>

        <div class="flex shrink-0 items-center gap-2">
          <slot name="actions" />
          <slot v-if="editing && selected.length" name="selection-actions" :selected="selected" />
          <UButton
            v-if="items.length"
            :label="editing ? 'Done' : 'Edit'"
            color="neutral"
            :variant="editing ? 'solid' : 'soft'"
            data-testid="list-editor-toggle"
            @click="editing = !editing"
          />
          <UButton
            icon="i-lucide-plus"
            :aria-label="addLabel"
            color="neutral"
            variant="soft"
            square
            data-testid="list-editor-add"
            @click="$emit('add')"
          />
        </div>
      </div>

      <!--
        In the edit state the description gives way to the selection count, so
        the row that told you what the list is tells you what you are acting on.
      -->
      <p v-if="editing && selectable" class="mt-2 text-sm text-muted" data-testid="list-editor-selection-count">
        {{ selected.length ? `${selected.length} selected` : 'Select items to move them' }}
      </p>
      <p v-else-if="description" class="mt-2 text-sm text-muted">{{ description }}</p>
    </header>

    <UAlert
      v-if="error"
      color="error"
      variant="soft"
      :title="`${title} could not be loaded`"
      :description="error"
    />

    <div v-else-if="pending" class="space-y-3">
      <USkeleton v-for="i in 3" :key="i" class="h-20 rounded-lg" />
    </div>

    <div
      v-else-if="!items.length"
      class="rounded-xl border border-dashed border-default px-6 py-12 text-center"
      data-testid="list-editor-empty"
    >
      <UIcon :name="emptyIcon" class="mx-auto size-9 text-muted" />
      <p class="mt-3 text-sm font-medium text-highlighted">{{ emptyTitle }}</p>
    </div>

    <ul v-else class="divide-y divide-default border-y border-default">
      <li v-for="(item, index) in items" :key="item.id" class="flex items-center gap-3 py-4">
        <!--
          Edit is a state of this list, not a place you go: the row keeps its
          position and grows controls. Nothing navigates, so there is no way to
          strand a half-edited list behind a back button.
        -->
        <UCheckbox
          v-if="editing && selectable"
          :model-value="selected.includes(item.id)"
          :aria-label="`Select ${item.title}`"
          :data-testid="`list-editor-select-${item.id}`"
          @update:model-value="toggleSelected(item.id)"
        />

        <UButton
          v-if="editing && !selectable"
          icon="i-lucide-circle-minus"
          :aria-label="`Remove ${item.title}`"
          color="neutral"
          variant="ghost"
          size="sm"
          square
          :loading="removingId === item.id"
          @click="$emit('remove', item)"
        />

        <div class="min-w-0 flex-1">
          <slot name="item" :item="item">
            <p class="truncate text-sm font-medium text-highlighted">{{ item.title }}</p>
            <p v-if="item.summary" class="mt-1 line-clamp-2 text-sm text-muted">{{ item.summary }}</p>
          </slot>
        </div>

        <div v-if="editing" class="flex shrink-0 items-center gap-1">
          <template v-if="reorderable">
            <UButton
              icon="i-lucide-arrow-up"
              :aria-label="`Move ${item.title} up`"
              color="neutral"
              variant="ghost"
              size="sm"
              square
              :disabled="index === 0"
              @click="$emit('move', item, -1)"
            />
            <UButton
              icon="i-lucide-arrow-down"
              :aria-label="`Move ${item.title} down`"
              color="neutral"
              variant="ghost"
              size="sm"
              square
              :disabled="index === items.length - 1"
              @click="$emit('move', item, 1)"
            />
          </template>
          <UButton
            icon="i-lucide-pencil"
            :aria-label="`Edit ${item.title}`"
            color="neutral"
            variant="ghost"
            size="sm"
            square
            @click="$emit('open', item)"
          />
        </div>
      </li>
    </ul>
  </section>
</template>

<script setup lang="ts" generic="T extends ListEditorItem">
// Generic so a caller can hang its own row on the item and read it straight off
// the `#item` slot. Without it every custom row had to look its record back up
// by id for each field it rendered, which is both noisy and quadratic.
defineProps<{
  items: T[]
  title: string
  description?: string
  emptyTitle: string
  emptyIcon: string
  /** Names the add control for screen readers, e.g. "Add a question". */
  addLabel: string
  pending?: boolean
  error?: string | null
  /** Lists with a persisted order gain move controls in the edit state. */
  reorderable?: boolean
  /** Marks the row whose removal is in flight. */
  removingId?: string | null
  /** Swaps the per-row remove control for a checkbox so several rows act at once. */
  selectable?: boolean
}>()

defineEmits<{
  add: []
  open: [item: T]
  remove: [item: T]
  move: [item: T, direction: -1 | 1]
}>()

const editing = defineModel<boolean>('editing', { default: false })
const selected = defineModel<string[]>('selected', { default: () => [] })

function toggleSelected(id: string) {
  selected.value = selected.value.includes(id)
    ? selected.value.filter(candidate => candidate !== id)
    : [...selected.value, id]
}

// Leaving the edit state drops the selection: the controls that act on it are
// gone, so a selection surviving out of sight could be acted on by surprise.
watch(editing, (value) => {
  if (!value) selected.value = []
})
</script>

<script lang="ts">
// Declared in a plain block so the `generic` attribute above can constrain to it:
// a type used by `<script setup generic>` has to exist before that block is
// compiled.
export interface ListEditorItem {
  id: string
  /** Names the row in the remove, reorder and open controls' labels. */
  title: string
  summary?: string | null
}
</script>
