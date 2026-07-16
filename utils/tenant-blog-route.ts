export type TenantBlogTemplate = {
  theme?: string | null
  theme_id?: string | null
  themeId?: string | null
}

export function isBlawbyBlogTemplate(site: TenantBlogTemplate | null | undefined) {
  const theme = site?.theme?.trim().toLowerCase()
  const themeId = (site?.theme_id ?? site?.themeId)?.trim().toLowerCase()
  return theme === 'blawby' || themeId === 'blawby-theme-v1' || themeId?.startsWith('blawby-') === true
}

export function tenantBlogPostPath(site: TenantBlogTemplate | null | undefined, slug: string) {
  const encodedSlug = encodeURIComponent(slug)
  return `${isBlawbyBlogTemplate(site) ? '/article' : '/blog'}/${encodedSlug}`
}
