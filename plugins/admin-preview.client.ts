export default defineNuxtPlugin(() => {
  if (import.meta.server) return

  // Only run if we are inside the admin iframe
  if (window.top === window.self) return

  const runtimeConfig = useRuntimeConfig()
  const trustedOrigins = new Set<string>([window.location.origin])
  const trustedOriginSources = [runtimeConfig.public.platformDomain, runtimeConfig.public.siteUrl]
  for (const source of trustedOriginSources) {
    if (typeof source !== 'string' || !source.trim()) continue
    try {
      const normalized = source.includes('://') ? source : `https://${source}`
      trustedOrigins.add(new URL(normalized).origin)
    } catch {
      // Ignore malformed configured origins.
    }
  }

  let highlightEl: HTMLDivElement | null = null

  window.addEventListener('message', (event) => {
    if (event.data?.type !== 'admin:focus') return
    if (!trustedOrigins.has(event.origin)) {
      console.warn('admin_preview_untrusted_origin', { origin: event.origin })
      return
    }

    const field = typeof event.data?.field === 'string' ? event.data.field.trim() : ''
    const group = typeof event.data?.group === 'string' ? event.data.group.trim() : ''
    if (!field || !group) {
      console.warn('admin_preview_invalid_focus_payload', {
        fieldType: typeof event.data?.field,
        groupType: typeof event.data?.group,
      })
      return
    }

    // Field-specific target first, then section-level, then group-level fallbacks
    let target: Element | null =
      document.querySelector(`[data-field="${field}"]`) ||
      document.getElementById(`section-${group}`) ||
      document.getElementById(group)

    if (!target && group === 'cta') target = document.querySelector('.cta-section')

    if (!target) return

    // Scroll to it
    target.scrollIntoView({ behavior: 'smooth', block: 'center' })

    // Highlight it
    if (!highlightEl) {
      highlightEl = document.createElement('div')
      highlightEl.style.position = 'absolute'
      highlightEl.style.border = '3px solid #3b82f6' // blue-500
      highlightEl.style.backgroundColor = 'rgba(59, 130, 246, 0.1)'
      highlightEl.style.pointerEvents = 'none'
      highlightEl.style.zIndex = '999999'
      highlightEl.style.transition = 'all 0.3s ease'
      highlightEl.style.borderRadius = '16px'
      document.body.appendChild(highlightEl)
    }

    const rect = target.getBoundingClientRect()
    highlightEl.style.top = `${window.scrollY + rect.top - 8}px`
    highlightEl.style.left = `${window.scrollX + rect.left - 8}px`
    highlightEl.style.width = `${rect.width + 16}px`
    highlightEl.style.height = `${rect.height + 16}px`
    highlightEl.style.opacity = '1'

    // clear after 2 seconds
    setTimeout(() => {
      if (highlightEl) highlightEl.style.opacity = '0'
    }, 2000)
  })
})
