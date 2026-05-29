/**
 * Loads a hero background video only after window.load + 1.5s so it never
 * competes with the LCP image or any other critical resource.
 *
 * The <video> is rendered without src and without autoplay. After the delay,
 * src and autoplay are set programmatically — the browser only starts
 * downloading the video at that point.
 */
export function useHeroVideo(srcFn: () => string | null | undefined) {
  const showVideo = ref(false)
  const videoEl = ref<HTMLVideoElement | null>(null)

  onMounted(async () => {
    // Fixed delay from mount (~1.5s after nav) = ~4.5s from navigation start.
    // LCP is ~3.7s so this is safely post-LCP without depending on window.load
    // (window.load waits for lazy images and fires unpredictably late on Slow 4G).
    await new Promise(resolve => setTimeout(resolve, 3000))

    const src = srcFn()
    if (!src) return

    showVideo.value = true
    await nextTick()

    const video = videoEl.value
    if (!video) return

    video.src = src
    video.autoplay = true
    try { await video.play() } catch { /* autoplay blocked — browser will play on interaction */ }
  })

  return { showVideo, videoEl }
}
