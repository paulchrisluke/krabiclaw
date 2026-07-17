import { createError } from 'h3'
import { resolveCmsCapabilities } from '~/config/cms-registry'
import { publicTemplateRegistry, type PublicTemplateSlug } from '~/utils/template-registry'
import { ALL_VERTICALS, normalizeVertical, type SiteVertical } from '~/utils/vertical-copy'

export function resolveSiteCmsCapabilities(verticalValue: string, themeId: string) {
  const normalizedVertical = normalizeVertical(verticalValue)
  if (!ALL_VERTICALS.includes(normalizedVertical as SiteVertical)) {
    throw createError({ statusCode: 422, statusMessage: `Unsupported site vertical: ${verticalValue}` })
  }
  const template = Object.values(publicTemplateRegistry).find(definition => definition.themeId === themeId)?.slug
  if (!template) {
    throw createError({ statusCode: 422, statusMessage: `Unsupported public template: ${themeId}` })
  }
  const vertical = normalizedVertical as SiteVertical
  try {
    return { vertical, template: template as PublicTemplateSlug, capabilities: resolveCmsCapabilities(vertical, template) }
  } catch {
    throw createError({ statusCode: 422, statusMessage: `Unsupported CMS capability combination: ${vertical}/${template}` })
  }
}
