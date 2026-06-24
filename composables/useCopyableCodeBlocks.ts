import type { Ref } from 'vue'

const COPY_ICON = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" class="h-4 w-4"><path stroke-linecap="round" stroke-linejoin="round" d="M15.75 17.25v3a2.25 2.25 0 0 1-2.25 2.25h-7.5A2.25 2.25 0 0 1 3.75 20.25v-13.5A2.25 2.25 0 0 1 6 4.5h3.75m6 13.5h3.75a2.25 2.25 0 0 0 2.25-2.25V8.25l-6-6H9.75A2.25 2.25 0 0 0 7.5 4.5v.75m6 13.5h-7.5a2.25 2.25 0 0 1-2.25-2.25v-8.25" /></svg>'
const CHECK_ICON = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" class="h-4 w-4"><path stroke-linecap="round" stroke-linejoin="round" d="M4.5 12.75l6 6 9-13.5" /></svg>'

// Markdown bodies are rendered server-side via v-html, so code blocks aren't
// real Vue components — copy buttons have to be injected into the live DOM
// after each render rather than declared in the template.
export function useCopyableCodeBlocks(containerRef: Ref<HTMLElement | null | undefined>, trigger: Ref<unknown>) {
  function enhance() {
    if (!import.meta.client) return
    const container = containerRef.value
    if (!container) return

    container.querySelectorAll('pre').forEach((pre) => {
      if (pre.querySelector('.kc-copy-btn')) return

      pre.classList.add('group', 'relative')

      const button = document.createElement('button')
      button.type = 'button'
      button.className = 'kc-copy-btn absolute right-2 top-2 rounded-md border border-default/40 bg-elevated/80 p-1.5 text-dimmed opacity-0 transition-opacity group-hover:opacity-100 hover:text-default focus-visible:opacity-100'
      button.setAttribute('aria-label', 'Copy code')
      button.innerHTML = COPY_ICON

      button.addEventListener('click', async () => {
        const code = pre.querySelector('code')?.textContent ?? pre.textContent ?? ''
        try {
          await navigator.clipboard.writeText(code)
          button.innerHTML = CHECK_ICON
          setTimeout(() => { button.innerHTML = COPY_ICON }, 1500)
        } catch {
          // Clipboard access denied/unavailable — leave the button as-is.
        }
      })

      pre.appendChild(button)
    })
  }

  onMounted(() => nextTick(enhance))
  watch(trigger, () => nextTick(enhance))
}
