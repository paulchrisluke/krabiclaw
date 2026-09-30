import type { Ref } from 'vue'

// Only Markdown code blocks need enhancement. Structured AI prompts own their
// action in ContentAiAssistanceSection and must not receive a second button.
export function useCopyableCodeBlocks(containerRef: Ref<Element | null | undefined>, trigger: Ref<unknown>) {
  function enhance() {
    if (!import.meta.client) return
    const container = containerRef.value
    if (!container) return

    container.querySelectorAll('pre > code').forEach((code) => {
      const pre = code.parentElement!
      if (pre.querySelector('.kc-copy-btn')) return
      pre.classList.add('relative', 'pt-16')
      const button = document.createElement('button')
      button.type = 'button'
      button.className = 'kc-copy-btn absolute right-2 top-2 inline-flex min-h-11 items-center rounded-md border border-default bg-elevated px-3 text-sm font-sans text-default hover:bg-accented focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary'
      button.textContent = 'Copy code'
      const status = document.createElement('span')
      status.className = 'sr-only'
      status.setAttribute('role', 'status')
      status.setAttribute('aria-live', 'polite')
      let resetTimer: ReturnType<typeof setTimeout> | undefined
      button.addEventListener('click', async () => {
        clearTimeout(resetTimer)
        status.textContent = ''
        try {
          await navigator.clipboard.writeText(code.textContent ?? '')
          button.textContent = 'Copied'
          status.textContent = 'Code copied to clipboard.'
        } catch {
          button.textContent = 'Copy failed'
          status.textContent = 'Could not copy. Select the code and copy it manually.'
        }
        resetTimer = setTimeout(() => { button.textContent = 'Copy code' }, 2500)
      })
      pre.appendChild(button)
      pre.appendChild(status)
    })
  }

  onMounted(() => nextTick(enhance))
  watch(trigger, () => nextTick(enhance))
}
