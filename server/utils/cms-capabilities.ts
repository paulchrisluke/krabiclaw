import { HTTPError } from 'nitro';
import { resolveCmsCapabilities } from '~/config/cms-registry'
import { publicTemplateRegistry, type PublicTemplateSlug } from '~/utils/template-registry'
import { ALL_VERTICALS, normalizeVertical, type OrganizationVertical } from '~/utils/vertical-copy'

export function resolveOrganizationCmsCapabilities(verticalValue: string, themeId: string) {
  const normalizedVertical = normalizeVertical(verticalValue)
  if (!ALL_VERTICALS.includes(normalizedVertical as OrganizationVertical)) {
    throw new HTTPError({ statusCode: 422, statusMessage: `Unsupported organization vertical: ${verticalValue}` })
  }
  const template = Object.values(publicTemplateRegistry).find(definition => definition.themeId === themeId)?.slug
  if (!template) {
    throw new HTTPError({ statusCode: 422, statusMessage: `Unsupported public template: ${themeId}` })
  }
  const vertical = normalizedVertical as OrganizationVertical
  try {
    return { vertical, template: template as PublicTemplateSlug, capabilities: resolveCmsCapabilities(vertical, template) }
  } catch {
    throw new HTTPError({ statusCode: 422, statusMessage: `Unsupported CMS capability combination: ${vertical}/${template}` })
  }
}
