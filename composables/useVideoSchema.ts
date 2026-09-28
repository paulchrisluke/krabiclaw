import { computed, toValue, type MaybeRefOrGetter } from 'vue'
import { useSchemaOrg } from '~/composables/useSchemaOrg'
import { videoObjectNodes } from '~/shared/youtube-video'

/**
 * A page's videos, described to search engines — the same way on a tenant page,
 * an article and a doc, on every template. Each template states the page itself
 * in its own graph (or, on Saya pages, not at all), so the videos are their own.
 */
export function useVideoSchema(
  blocks: MaybeRefOrGetter<ReadonlyArray<{ type: string; data: Record<string, unknown> }> | null | undefined>,
  pageUrl: MaybeRefOrGetter<string | null | undefined>,
) {
  useSchemaOrg(computed(() => {
    const url = toValue(pageUrl)
    const nodes = url ? videoObjectNodes(toValue(blocks) ?? [], url) : []
    return nodes.length ? { '@context': 'https://schema.org', '@graph': nodes } : null
  }))
}
