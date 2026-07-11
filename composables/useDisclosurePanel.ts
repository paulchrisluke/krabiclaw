// Headless open/close state for a trigger + panel disclosure (dropdown menus,
// filter panels, etc.): outside-click and Escape close it, arrow keys/Home/End
// roving-focus across a caller-registered list of item elements, and focus is
// restored to the trigger on Escape/selection. Extracted from SayaDropdown.vue
// so non-menu panel shapes (e.g. a checkbox filter list) can share the same
// interaction primitive instead of re-implementing it without the a11y bits.
export function useDisclosurePanel() {
  const open = ref(false)
  const rootRef = ref<HTMLElement | null>(null)
  const triggerEl = ref<HTMLElement | null>(null)
  let itemEls: HTMLElement[] = []

  function registerItemRef(el: unknown, index: number) {
    itemEls[index] = el as HTMLElement
  }

  function focusFirstItem() {
    nextTick(() => itemEls[0]?.focus())
  }

  function toggle() {
    if (open.value) {
      close()
      return
    }
    // Remember whatever had focus when the panel opened (the caller's trigger
    // element) so close() can restore focus to it.
    triggerEl.value = document.activeElement as HTMLElement | null
    open.value = true
    focusFirstItem()
  }

  // restoreFocus is true for Escape and non-navigating selection. It's left
  // false for outside-click and tab-away closes, where focus has already
  // deliberately moved elsewhere and yanking it back would fight the
  // browser's natural tab order.
  function close(options: { restoreFocus?: boolean } = {}) {
    open.value = false
    if (options.restoreFocus) triggerEl.value?.focus()
  }

  // Bind to the caller's trigger element via its own keydown handler so
  // ArrowDown opens the panel and moves focus to the first item.
  function onTriggerKeydown(event: KeyboardEvent) {
    if (event.key !== 'ArrowDown') return
    event.preventDefault()
    if (!open.value) {
      triggerEl.value = document.activeElement as HTMLElement | null
      open.value = true
    }
    focusFirstItem()
  }

  function onPanelKeydown(event: KeyboardEvent) {
    const currentIndex = itemEls.findIndex(el => el === document.activeElement)
    if (event.key === 'ArrowDown') {
      event.preventDefault()
      if (currentIndex === -1) itemEls[0]?.focus()
      else itemEls[(currentIndex + 1) % itemEls.length]?.focus()
    } else if (event.key === 'ArrowUp') {
      event.preventDefault()
      if (currentIndex === -1) itemEls[itemEls.length - 1]?.focus()
      else itemEls[(currentIndex - 1 + itemEls.length) % itemEls.length]?.focus()
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

  // Closes the panel when keyboard focus leaves it entirely (e.g. Tab past
  // the last item). Deferred one tick because a click on an item fires
  // focusout (mousedown blur) before the item's own click handler — checking
  // document.activeElement after the tick avoids racing that.
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

  return {
    open,
    rootRef,
    registerItemRef,
    toggle,
    close,
    onTriggerKeydown,
    onPanelKeydown,
    onPanelFocusOut,
  }
}
