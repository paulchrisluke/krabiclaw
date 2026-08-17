import { resolvePublicTemplate } from '~/utils/template-registry'

export function publicSurfaceStylesheetForRequest(input: {
  pathname: string
  tenantType?: string | null
  themeId?: string | null
  vertical?: string | null
}): string | null {
  if (input.tenantType === 'platform') {
    return '/_nuxt/surfaces/platform.css'
  }
  if (input.tenantType !== 'tenant') return null

  const template = resolvePublicTemplate({
    themeId: input.themeId,
    vertical: input.vertical,
  })
  if (template.slug === 'blawby') {
    return '/_nuxt/surfaces/blawby.css'
  }
  if (template.slug === 'saya') {
    return '/_nuxt/surfaces/saya.css'
  }
  throw new Error(`Unsupported public template "${template.slug}".`)
}
