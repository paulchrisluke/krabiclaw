<template>
  <UModal
    v-model:open="open"
    :close="false"
    :dismissible="false"
    :ui="{
      // Centred dialog at `sm` and up; a bottom sheet below it. One element, one
      // set of fields — the narrow and wide renderings cannot disagree about what
      // the form contains.
      //
      // Both axes of the default centring have to be undone, not just the
      // vertical one: Tailwind v4 composes these through the `translate`
      // property, so `-translate-x-1/2` survives an override that only touches
      // `transform`. The explicit width is needed too, because the default
      // `w-[calc(100vw-2rem)]` outranks `inset-x-0`.
      content: 'max-sm:inset-x-0 max-sm:bottom-0 max-sm:top-auto max-sm:w-full max-sm:max-w-none max-sm:translate-x-0 max-sm:translate-y-0 max-sm:rounded-b-none',
      footer: 'justify-between',
    }"
  >
    <template #header>
      <!--
        Close left, title centred, nothing on the right. This is the item-detail
        chrome: you opened one row to change it and you are leaving either way.
      -->
      <div class="grid w-full grid-cols-[auto_1fr_auto] items-center gap-2">
        <UButton
          icon="i-lucide-x"
          :aria-label="`Close ${title}`"
          color="neutral"
          variant="ghost"
          size="sm"
          square
          data-testid="list-item-dismiss"
          @click="open = false"
        />
        <h2 class="truncate text-center text-base font-semibold text-highlighted">{{ title }}</h2>
        <span class="size-8" />
      </div>
    </template>

    <template #body>
      <div class="space-y-5">
        <slot />
      </div>
    </template>

    <template #footer>
      <!--
        Remove sits opposite Save rather than among the row controls: deleting is
        a decision you make while looking at the item, not while scanning the list.
      -->
      <UButton
        v-if="removable"
        color="error"
        variant="ghost"
        label="Remove"
        :loading="removing"
        data-testid="list-item-remove"
        @click="$emit('remove')"
      />
      <span v-else />
      <UButton
        :label="saveLabel ?? 'Save'"
        :loading="saving"
        :disabled="saveDisabled"
        data-testid="list-item-save"
        @click="$emit('save')"
      />
    </template>
  </UModal>
</template>

<script setup lang="ts">
defineProps<{
  /** Centred in the bar. Names the row being edited, or the thing being added. */
  title: string
  /** Adding has nothing to remove yet, so the control is absent rather than inert. */
  removable?: boolean
  saving?: boolean
  removing?: boolean
  saveDisabled?: boolean
  /** Names the commit for a sheet that does something other than save an edit. */
  saveLabel?: string
}>()

defineEmits<{
  save: []
  remove: []
}>()

const open = defineModel<boolean>('open', { default: false })
</script>
