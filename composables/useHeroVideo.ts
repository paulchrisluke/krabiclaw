/**
 * Loads a hero background video ~3s after mount so it never
 * competes with the LCP image or any other critical resource.
 *
 * The <video> is rendered without `src` or `autoplay`. After the 3s delay,
 * `src` and `autoplay` are set programmatically — the browser only starts
 * downloading the video at that point. This pattern ensures the LCP image
 * (poster or hero image) remains the primary resource during SSR and initial
 * paint. Ensure components using this composable supply a `poster` image
 * during SSR to avoid layout shifts and degraded LCP.
 *
 * Note: `video.play()` may be blocked by browser autoplay policies; we set
 * `autoplay = true` and attempt `play()` but gracefully ignore failures —
 * the page will continue to work and the video will play on user interaction.
 */
export function useHeroVideo(srcFn: () => string | null | undefined) {
  const showVideo = ref(false)
  const videoEl = ref<HTMLVideoElement | null>(null)

  onMounted(async () => {
    // Fixed 3s delay from mount, safely post-LCP without depending on window.load
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
