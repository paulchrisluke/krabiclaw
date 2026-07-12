// Groups an already-fetched list of tenant blog posts into category sections,
// mirroring composables/useBlogNav.ts's grouped-anchor-section pattern for the
// platform blog. Deliberately doesn't reuse useBlogNav directly: that
// composable is built around BLOG_CATEGORY_SLUGS, a fixed platform marketing
// taxonomy (Marketing/Technology/Design/...) that doesn't fit tenant
// categories (e.g. "Family Law", "Employment Law"), and it does its own fetch
// against /api/public/blog rather than accepting posts a caller already has.
import type { Ref, ComputedRef } from 'vue'

export interface TenantBlogNavPost {
  id: string
  slug: string
  title: string
  category?: string | null
  excerpt?: string | null
  published_at?: string | null
}

export interface TenantBlogNavGroup<T extends TenantBlogNavPost> {
  category: string
  categorySlug: string
  posts: T[]
}

function slugifyCategory(value: string) {
  const slug = value.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '')
  return slug || 'uncategorized'
}

export function useTenantBlogNav<T extends TenantBlogNavPost>(posts: Ref<T[]> | ComputedRef<T[]>) {
  const categories = computed<TenantBlogNavGroup<T>[]>(() => {
    const groups = new Map<string, TenantBlogNavGroup<T>>()
    for (const post of posts.value) {
      const category = post.category?.trim() || 'Uncategorized'
      const categorySlug = slugifyCategory(category)
      const group = groups.get(categorySlug) ?? { category, categorySlug, posts: [] }
      group.posts.push(post)
      groups.set(categorySlug, group)
    }
    return [...groups.values()].sort((a, b) => a.category.localeCompare(b.category))
  })

  return { categories }
}
