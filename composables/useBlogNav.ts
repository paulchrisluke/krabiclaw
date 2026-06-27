import { BLOG_CATEGORY_SLUGS, blogCategoryToSlug } from '~/utils/blog-categories'

interface PublicBlogPost {
  id: string
  slug: string
  title: string
  category?: string | null
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
  posts: PublicBlogPost[]
}

export function useBlogNav() {
  const { data } = useFetch<{ posts: PublicBlogPost[] }>('/api/public/blog', {
    default: () => ({ posts: [] }),
  })

  const posts = computed(() => data.value?.posts || [])

  const categories = computed<BlogNavCategory[]>(() => {
    const byCategory = new Map<string, PublicBlogPost[]>()
    for (const post of posts.value) {
      if (!post.category) continue
      const list = byCategory.get(post.category) ?? []
      list.push(post)
      byCategory.set(post.category, list)
    }

    return Object.keys(BLOG_CATEGORY_SLUGS)
      .filter(category => byCategory.has(category))
      .map(category => ({
        category,
        categorySlug: blogCategoryToSlug(category)!,
        posts: byCategory.get(category)!,
      }))
  })

  return { posts, categories }
}
