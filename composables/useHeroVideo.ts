// Deferred hero background video loader.
//
// Loading strategy:
//   1. Do nothing until window.load fires (all resources done, LCP recorded)
//   2. Then requestIdleCallback (browser is truly idle) with a 5s timeout fallback
//   3. Set src + call load() — browser starts fetching the video
//   4. On canplay: fade the video in (opacity-0 → supplied fadeToClass)
//
// This guarantees the poster <img> is always the LCP candidate.
// The video element starts life at opacity-0 so Chrome ignores it for LCP.
// By the time the video is visible, LCP observation is long complete.
//
// Usage:
//   const { videoEl, showVideo } = useHeroVideo(() => hero.value?.video)
//   <video v-if="showVideo" ref="videoEl" ... class="... opacity-0 transition-opacity" />

export function useHeroVideo(getSrc: () => string | null | undefined) {
  const videoEl = ref<HTMLVideoElement | null>(null)
  const showVideo = ref(false)

  onMounted(() => {
    const schedule = () => {
      if (typeof requestIdleCallback !== 'undefined') {
        requestIdleCallback(activate, { timeout: 5000 })
      } else {
        setTimeout(activate, 3500)
      }
    }

    if (document.readyState === 'complete') {
      schedule()
    } else {
      window.addEventListener('load', schedule, { once: true })
    }
  })

  onUnmounted(() => {
    const v = videoEl.value
    if (v) { v.pause(); v.removeAttribute('src'); v.load() }
  })

  function activate() {
    const src = getSrc()
    if (!src) return
    showVideo.value = true
    nextTick(() => {
      const v = videoEl.value
      if (!v) return
      v.src = src
      v.load()
      v.addEventListener('canplay', () => {
        v.play().catch(() => {})  // muted inline video — catches autoplay policy blocks
        v.classList.remove('opacity-0')
        v.classList.add('opacity-100')
      }, { once: true })
    })
  }

  return { videoEl, showVideo }
}
