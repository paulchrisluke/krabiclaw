<template>
  <div ref="rootRef" class="relative inline-block">
    <slot :open="open" :toggle="toggle" :trigger-keydown="onTriggerKeydown" />

    <div
      v-if="open"
      role="menu"
      :class="[placement === 'top' ? 'absolute bottom-full mb-2' : 'absolute top-full mt-2', 'z-50 min-w-40 overflow-hidden rounded-xl border border-default bg-default py-1 shadow-lg', panelClass]"
      @keydown="onPanelKeydown"
      @focusout="onPanelFocusOut"
    >
      <button
        v-for="(item, index) in items"
        :key="item.to ? `${item.to}-${index}` : index"
        :ref="(el) => setItemRef(el, index)"
        type="button"
        role="menuitem"
        class="block w-full px-4 py-2 text-left text-sm text-default hover:bg-muted"
        @click="select(item)"
      >
        {{ item.label }}
      </button>
    </div>
  </div>
</template>

<script setup lang="ts">
export interface SayaDropdownItem {
  label: string
  to?: string
  onSelect?: () => void
}

withDefaults(defineProps<{
  items: SayaDropdownItem[]
  panelClass?: string
  placement?: 'top' | 'bottom'
}>(), {
  placement: 'bottom',
})

const { open, rootRef, registerItemRef, toggle, close, onTriggerKeydown, onPanelKeydown, onPanelFocusOut } = useDisclosurePanel()

function setItemRef(el: unknown, index: number) {
  registerItemRef(el, index)
}

// Menu-specific: selecting an item either navigates (closing without
// restoring focus, since the page is about to change) or just closes and
// restores focus to the trigger, matching UDropdownMenu's prior behavior.
function select(item: SayaDropdownItem) {
  item.onSelect?.()
  if (item.to) {
    close()
    navigateTo(item.to)
  } else {
    close({ restoreFocus: true })
  }
}

defineExpose({ close })
</script>
