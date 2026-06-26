// Mirrors the CHECK constraint on platform_docs.category (migrations/0001_initial.sql).
// Single source of truth for category <-> slug conversion across docs routing,
// the sidebar, and the sitemap.
export const CATEGORY_SLUGS: Record<string, string> = {
  'Getting Started': 'getting-started',
  'Menu Management': 'menu-management',
  'Theme Customization': 'theme-customization',
  'SEO & Marketing': 'seo-marketing',
  Integrations: 'integrations',
  Advanced: 'advanced',
}

const SLUG_TO_CATEGORY: Record<string, string> = Object.fromEntries(
  Object.entries(CATEGORY_SLUGS).map(([category, slug]) => [slug, category]),
)

export function categoryToSlug(category: string | null | undefined): string | null {
  if (!category) return null
  return CATEGORY_SLUGS[category] ?? null
}

export function slugToCategory(categorySlug: string | null | undefined): string | null {
  if (!categorySlug) return null
  return SLUG_TO_CATEGORY[categorySlug] ?? null
}
