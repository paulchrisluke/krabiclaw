// Mirrors the fixed category set for platform_blog_posts. Single source of
// truth for blog category <-> slug conversion across routing, nav, sitemap,
// and admin editing surfaces.
export const BLOG_CATEGORY_SLUGS: Record<string, string> = {
  Marketing: 'marketing',
  Technology: 'technology',
  Design: 'design',
  Business: 'business',
  SEO: 'seo',
  'Social Media': 'social-media',
}

export const BLOG_CATEGORY_LABELS = Object.keys(BLOG_CATEGORY_SLUGS)

export const BLOG_CATEGORY_CLASSES: Record<string, string> = {
  Marketing: 'bg-amber-100 text-amber-800',
  Technology: 'bg-emerald-100 text-emerald-800',
  Design: 'bg-indigo-100 text-indigo-800',
  Business: 'bg-rose-100 text-rose-800',
  SEO: 'bg-violet-100 text-violet-800',
  'Social Media': 'bg-sky-100 text-sky-800',
}

const SLUG_TO_CATEGORY: Record<string, string> = Object.fromEntries(
  Object.entries(BLOG_CATEGORY_SLUGS).map(([category, slug]) => [slug, category]),
)

export function blogCategoryToSlug(category: string | null | undefined): string | null {
  if (!category) return null
  return BLOG_CATEGORY_SLUGS[category] ?? null
}

export function slugToBlogCategory(categorySlug: string | null | undefined): string | null {
  if (!categorySlug) return null
  return SLUG_TO_CATEGORY[categorySlug] ?? null
}

export function blogCategoryClass(category: string | null | undefined): string {
  if (!category) return 'bg-stone-100 text-stone-800'
  return BLOG_CATEGORY_CLASSES[category] ?? 'bg-stone-100 text-stone-800'
}

export function getBlogPostPath(category: string | null | undefined, slug: string | null | undefined): string | null {
  const categorySlug = blogCategoryToSlug(category)
  if (!categorySlug || !slug) return null
  return `/blog/${categorySlug}/${slug}`
}
