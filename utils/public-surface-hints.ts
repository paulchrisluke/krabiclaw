import { resolvePublicTemplate } from '~/utils/template-registry'

export function publicSurfaceStylesheetForRequest(input: {
  pathname: string
  tenantType?: string | null
  themeId?: string | null
  vertical?: string | null
}): string | null {
  const isHome = input.pathname === '/'
  if (input.tenantType === 'platform') {
    return isHome ? '/_nuxt/surfaces/platform-home.css' : '/_nuxt/surfaces/platform.css'
  }
  if (input.tenantType !== 'tenant') return null

  const template = resolvePublicTemplate({
    themeId: input.themeId,
    vertical: input.vertical,
  })
  if (template.slug === 'blawby') {
    return isHome ? '/_nuxt/surfaces/blawby-home.css' : '/_nuxt/surfaces/blawby.css'
  }
  return isHome ? '/_nuxt/surfaces/saya-home.css' : '/_nuxt/surfaces/saya.css'
}
