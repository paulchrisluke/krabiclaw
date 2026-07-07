import { BLOG_CATEGORY_SLUGS, blogCategoryToSlug } from '~/utils/blog-categories'
import { navSectionOrderFor, navTitleFor } from '~/utils/platform-content-nav'

interface PublicBlogPost {
  id: string
  slug: string
  title: string
  category?: string | null
  nav_section?: string | null
  nav_title?: string | null
  nav_order?: number | null
  nav_section_order?: number | null
  hide_from_nav?: boolean | number | null
  featured_order?: number | null
  excerpt?: string | null
  published_at?: string | null
  featured_image?: {
    asset_id: string | null
    public_url: string | null
    kind: string | null
    width: number | null
    height: number | null
  } | null
}

interface BlogNavCategory {
  category: string
  categorySlug: string
  posts: Array<PublicBlogPost & { label: string }>
}

export function useBlogNav() {
  const { data, pending, error } = useFetch<{ posts: PublicBlogPost[] }>('/api/public/blog')

  const posts = computed(() => data.value?.posts || [])

  const categories = computed<BlogNavCategory[]>(() => {
    const byCategory = new Map<string, {
      category: string
      categorySlug: string
      order: number
      posts: Array<PublicBlogPost & { label: string; order: number }>
    }>()
    for (const post of posts.value) {
      if (post.hide_from_nav) continue
      if (!post.category) continue
      const categorySlug = blogCategoryToSlug(post.category)
      if (!categorySlug) continue
      const section = post.nav_section?.trim() || post.category
      const group = byCategory.get(section) ?? {
        category: section,
        categorySlug,
        order: navSectionOrderFor(section, post.nav_section_order),
        posts: [],
      }
      group.order = Math.min(group.order, navSectionOrderFor(section, post.nav_section_order))
      group.posts.push({
        ...post,
        label: navTitleFor(post.title, post.nav_title),
        order: post.nav_order ?? 999999,
      })
      byCategory.set(section, group)
    }

    const legacyOrder = Object.keys(BLOG_CATEGORY_SLUGS)
    const legacyRank = (category: string) => {
      const index = legacyOrder.indexOf(category)
      return index === -1 ? 999 : index
    }
    return Array.from(byCategory.values())
      .sort((a, b) =>
        a.order - b.order
        || legacyRank(a.category) - legacyRank(b.category)
        || a.category.localeCompare(b.category)
      )
      .map(group => ({
        category: group.category,
        categorySlug: group.categorySlug,
        posts: group.posts.sort((a, b) => a.order - b.order || a.title.localeCompare(b.title)),
      }))
  })

  return { posts, categories, pending, error }
}
