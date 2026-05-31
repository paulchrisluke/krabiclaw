// Dev-only LCP observer. Call once in a layout or page to see LCP candidates
// in the browser console as Chrome records them.
//
// Usage: useDebugLCP() in layouts/saya.vue onMounted, wrapped in import.meta.dev
//
// Logs each LCP candidate entry — element, area, url, and renderTime —
// so you can see whether the poster <img> or the <video> is being selected
// and at exactly what timestamp Chrome records each.

export function useDebugLCP() {
  if (!import.meta.dev || !import.meta.client) return

  onMounted(() => {
    if (!('PerformanceObserver' in window)) {
      console.warn('[LCP debug] PerformanceObserver not supported')
      return
    }

    let count = 0
    const obs = new PerformanceObserver((list) => {
      for (const entry of list.getEntries()) {
        count++
        const e = entry as PerformanceEntry & {
          element?: Element | null
          url?: string
          size?: number
          renderTime?: number
          loadTime?: number
        }
        const el = e.element
        const tag = el?.tagName?.toLowerCase() ?? 'none'
        const id = el?.id ? `#${el.id}` : ''
        const cls = el instanceof HTMLElement
          ? `.${[...el.classList].slice(0, 3).join('.')}`
          : ''
        const src = (el as HTMLImageElement | HTMLVideoElement)?.src
          || (el as HTMLVideoElement)?.poster
          || (el as HTMLImageElement)?.currentSrc
          || e.url
          || ''

        const t = (e.renderTime || e.loadTime || 0).toFixed(0)
        console.log(`[LCP #${count}] t=${t}ms | ${tag}${id}${cls} | ${e.size}px² | ${src?.slice(0, 100) || '—'}`)
        if (el?.outerHTML) console.log(`[LCP #${count}] html: ${el.outerHTML.slice(0, 250)}`)
      }
    })

    obs.observe({ type: 'largest-contentful-paint', buffered: true })

    // Disconnect after first user interaction (LCP stops updating then)
    const disconnect = () => { obs.disconnect(); console.log('[LCP debug] finalized after interaction') }
    window.addEventListener('keydown', disconnect, { once: true })
    window.addEventListener('click', disconnect, { once: true })
    window.addEventListener('scroll', disconnect, { once: true })
  })
}
