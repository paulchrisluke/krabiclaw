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

const open = ref(false)
const rootRef = ref<HTMLElement | null>(null)
const triggerEl = ref<HTMLElement | null>(null)
let itemEls: HTMLButtonElement[] = []

function setItemRef(el: unknown, index: number) {
  itemEls[index] = el as HTMLButtonElement
}

function toggle() {
  if (open.value) {
    close()
    return
  }
  // Remember whatever had focus when the menu opened (the caller's trigger
  // element) so close() can restore focus to it — the trigger is rendered by
  // the caller via scoped slot, so this is the only handle we have on it.
  triggerEl.value = document.activeElement as HTMLElement | null
  open.value = true
  nextTick(() => itemEls[0]?.focus())
}

// restoreFocus is true for Escape and non-navigating selection (matches
// UDropdownMenu). It's left false for outside-click and tab-away closes,
// where focus has already deliberately moved elsewhere and yanking it back
// to the trigger would fight the browser's natural tab order.
function close(options: { restoreFocus?: boolean } = {}) {
  open.value = false
  if (options.restoreFocus) triggerEl.value?.focus()
}

function select(item: SayaDropdownItem) {
  item.onSelect?.()
  if (item.to) {
    close()
    navigateTo(item.to)
  } else {
    close({ restoreFocus: true })
  }
}

// Bind to the caller's trigger element via the `trigger-keydown` scoped-slot prop
// so ArrowDown opens the menu and moves focus to the first item, matching the
// keyboard behavior UDropdownMenu previously gave for free.
function onTriggerKeydown(event: KeyboardEvent) {
  if (event.key !== 'ArrowDown') return
  event.preventDefault()
  if (!open.value) {
    triggerEl.value = document.activeElement as HTMLElement | null
    open.value = true
  }
  nextTick(() => itemEls[0]?.focus())
}

function onPanelKeydown(event: KeyboardEvent) {
  const currentIndex = itemEls.findIndex((el) => el === document.activeElement)
  if (event.key === 'ArrowDown') {
    event.preventDefault()
    if (currentIndex === -1) {
      itemEls[0]?.focus()
    } else {
      itemEls[(currentIndex + 1) % itemEls.length]?.focus()
    }
  } else if (event.key === 'ArrowUp') {
    event.preventDefault()
    if (currentIndex === -1) {
      itemEls[itemEls.length - 1]?.focus()
    } else {
      itemEls[(currentIndex - 1 + itemEls.length) % itemEls.length]?.focus()
    }
  } else if (event.key === 'Home') {
    event.preventDefault()
    itemEls[0]?.focus()
  } else if (event.key === 'End') {
    event.preventDefault()
    itemEls[itemEls.length - 1]?.focus()
  } else if (event.key === 'Escape') {
    event.preventDefault()
    close({ restoreFocus: true })
  }
}

// Closes the menu when keyboard focus leaves it entirely (e.g. Tab past the
// last item), matching UDropdownMenu. Deferred one tick because a click on an
// item fires focusout (mousedown blur) before the item's own click handler —
// checking document.activeElement after the tick avoids racing that and
// double-closing/fighting select()'s own close() call.
function onPanelFocusOut() {
  if (!open.value) return
  setTimeout(() => {
    if (!rootRef.value) return
    if (rootRef.value.contains(document.activeElement)) return
    close()
  }, 0)
}

function onDocumentClick(event: MouseEvent) {
  if (!open.value) return
  if (rootRef.value && !rootRef.value.contains(event.target as Node)) close()
}

function onDocumentKeydown(event: KeyboardEvent) {
  if (!open.value) return
  if (event.key === 'Escape') close({ restoreFocus: true })
}

onMounted(() => {
  document.addEventListener('click', onDocumentClick)
  document.addEventListener('keydown', onDocumentKeydown)
})

onUnmounted(() => {
  document.removeEventListener('click', onDocumentClick)
  document.removeEventListener('keydown', onDocumentKeydown)
  itemEls = []
})

defineExpose({ close })
</script>
