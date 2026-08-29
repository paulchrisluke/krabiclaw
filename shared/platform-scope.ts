export const PLATFORM_ORGANIZATION_ID = 'platform'
export const PLATFORM_SITE_ID = 'platform'

export function isPlatformSite(siteId: string | null | undefined): boolean {
  return siteId === PLATFORM_SITE_ID
}
