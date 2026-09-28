import { computed, toValue, type MaybeRefOrGetter } from 'vue'

/**
 * The blog index narrowed to one tag, named by `?tag=` — the address an
 * article's tag pill links to on every template.
 */
export function useBlogTagFilter<T extends { tags?: string[] | null }>(posts: MaybeRefOrGetter<T[]>) {
  const route = useRoute()
  const activeTag = computed(() => typeof route.query.tag === 'string' && route.query.tag.trim() ? route.query.tag.trim() : null)
  const taggedPosts = computed(() => {
    const tag = activeTag.value
    const all = toValue(posts)
    return tag ? all.filter(post => post.tags?.includes(tag)) : all
  })
  return { activeTag, taggedPosts }
}
