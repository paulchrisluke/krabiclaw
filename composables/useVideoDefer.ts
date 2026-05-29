/**
 * Defers video loading until 2.5s after mount so background videos never
 * compete with the LCP image for bandwidth or main-thread time.
 *
 * PerformanceObserver was tried but caused element render delay by triggering
 * a Vue reactive update + layout pass at the exact moment the browser was
 * about to commit the LCP paint.
 */
export function useVideoDefer() {
  const ready = ref(false)
  let timerId: ReturnType<typeof setTimeout> | null = null

  onMounted(() => {
    timerId = setTimeout(() => { ready.value = true }, 2500)
  })

  onUnmounted(() => {
    if (timerId) clearTimeout(timerId)
  })

  return ready
}
