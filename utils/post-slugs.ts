import slugify from 'slugify'

/** Shared slugify options for titles across posts, blog posts, and docs. */
export function slugifyTitle(value: string): string {
  return slugify(value, { lower: true, strict: true, trim: true })
}

/**
 * A post's route segment from its words, or '' when they hold nothing usable
 * — the caller then allocates `update-<id>`, never a shared placeholder.
 */
export function normalizePostSlug(value: string | null | undefined) {
  return slugifyTitle(String(value ?? ''))
    .slice(0, 80)
    .replace(/^-+|-+$/g, '')
}

export function postPublicPath(slugOrId: string) {
  return `/posts/${encodeURIComponent(slugOrId)}`
}
