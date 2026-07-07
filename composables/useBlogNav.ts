import { BLOG_CATEGORY_SLUGS, blogCategoryToSlug } from '~/utils/blog-categories'
import { groupItemsByNavSection } from '~/utils/platform-content-nav'

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
    const eligible = posts.value
      .filter(post => post.category && blogCategoryToSlug(post.category))
      .map(post => ({ ...post, _categorySlug: blogCategoryToSlug(post.category!)! }))

    const groups = groupItemsByNavSection(
      eligible,
      (post) => post.nav_section?.trim() || post.category!,
      Object.keys(BLOG_CATEGORY_SLUGS),
    )

    return groups.map(group => ({
      category: group.category,
      categorySlug: group.items[0]?._categorySlug ?? '',
      posts: group.items,
    }))
  })

  return { posts, categories, pending, error }
}
