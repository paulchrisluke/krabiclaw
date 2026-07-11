// Shared boolean toggle for a header's mobile nav panel: open on button
// click, closed on nav-link click or explicit close. Both SayaHeader.vue and
// BlawbyHeader.vue had their own near-identical `ref(false)` for this.
export function useMobileNavToggle() {
  const isOpen = ref(false)

  function toggle() {
    isOpen.value = !isOpen.value
  }

  function close() {
    isOpen.value = false
  }

  return { isOpen, toggle, close }
}
