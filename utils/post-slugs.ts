import slugify from 'slugify'

/** Shared slugify options for titles across posts, blog posts, and docs. */
export function slugifyTitle(value: string): string {
  return slugify(value, { lower: true, strict: true, trim: true })
}

export function normalizePostSlug(value: string | null | undefined) {
  const slug = slugifyTitle(String(value ?? ''))
    .replace(/^-+|-+$/g, '')
    .slice(0, 80)
  return slug || 'post'
}

export function postPublicPath(slugOrId: string) {
  return `/posts/${encodeURIComponent(slugOrId)}`
}
