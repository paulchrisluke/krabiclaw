// Shared clipboard copy composable for copying text to clipboard
// with automatic state reset after 2 seconds
export function useCopyToClipboard() {
  const copied = ref<string | null>(null)

  async function copy(text: string) {
    try {
      await navigator.clipboard.writeText(text)
      copied.value = text
      setTimeout(() => { copied.value = null }, 2000)
    } catch (err) {
      console.error('Failed to copy text: ', err)
    }
  }

  return { copied, copy }
}
