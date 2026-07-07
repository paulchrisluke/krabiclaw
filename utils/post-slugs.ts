import slugify from 'slugify'

export function normalizePostSlug(value: string | null | undefined) {
  const slug = slugify(String(value ?? ''), { lower: true, strict: true, trim: true })
    .replace(/^-+|-+$/g, '')
    .slice(0, 80)
  return slug || 'post'
}

export function postPublicPath(slugOrId: string) {
  return `/posts/${encodeURIComponent(slugOrId)}`
}
