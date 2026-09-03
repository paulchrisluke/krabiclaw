export type TenantBlogTemplate = {
  theme?: string | null
  theme_id?: string | null
  themeId?: string | null
  vertical?: string | null
}

export function isBlawbyBlogTemplate(site: TenantBlogTemplate | null | undefined) {
  const theme = site?.theme?.trim().toLowerCase()
  const themeId = (site?.theme_id ?? site?.themeId)?.trim().toLowerCase()
  const vertical = site?.vertical?.trim().toLowerCase()
  return theme === 'blawby'
    || themeId === 'blawby-theme-v1'
    || themeId?.startsWith('blawby-') === true
    || vertical === 'professional_service'
    || vertical === 'service'
}

export function tenantBlogPostPath(site: TenantBlogTemplate | null | undefined, slug: string) {
  const encodedSlug = encodeURIComponent(slug)
  return `${isBlawbyBlogTemplate(site) ? '/article' : '/blog'}/${encodedSlug}`
}
