import type { Ref } from 'vue'

/**
 * Preload the hero image that paints above the fold on a Saya route.
 *
 * Without the hint the browser discovers it only after parsing the card that
 * contains it, so anything the document requests earlier — a stylesheet-driven
 * webfont, for instance — is fetched ahead of the element that decides LCP.
 * Measured on /th/reservations at 1.6 Mbps: 1700ms without, 1408ms with.
 *
 * This is the first hero in document order, which is the one above the fold. It
 * is not a chosen row, and later heroes are deliberately left to normal
 * discovery: preloading them would compete with this one.
 */
export function useHeroLcpPreload(href: Ref<string | null>) {
  useHead(() => ({
    link: href.value
      ? [{ key: 'saya-lcp-hero', rel: 'preload', as: 'image', href: href.value, fetchpriority: 'high' }]
      : [],
  }))
}
