import { HTTPError } from 'nitro';
import { parseCmsFeatureOverrideDelta, resolveCmsCapabilities, type CmsCapabilityOverrides } from '~/config/cms-registry'
import { publicTemplateRegistry, type PublicTemplateSlug } from '~/utils/template-registry'
import { ALL_VERTICALS, normalizeVertical, type OrganizationVertical } from '~/utils/vertical-copy'

export interface OrganizationCmsCapabilityOverrideInput {
  organizationEnabledFeatures?: string | null
  locationEnabledFeatures?: string | null
}

export function resolveOrganizationCmsCapabilities(
  verticalValue: string,
  themeId: string,
  overrideInput: OrganizationCmsCapabilityOverrideInput = {},
) {
  const normalizedVertical = normalizeVertical(verticalValue)
  if (!ALL_VERTICALS.includes(normalizedVertical as OrganizationVertical)) {
    throw new HTTPError({ statusCode: 422, statusMessage: `Unsupported organization vertical: ${verticalValue}` })
  }
  const template = Object.values(publicTemplateRegistry).find(definition => definition.themeId === themeId)?.slug
  if (!template) {
    throw new HTTPError({ statusCode: 422, statusMessage: `Unsupported public template: ${themeId}` })
  }
  const vertical = normalizedVertical as OrganizationVertical
  const overrides: CmsCapabilityOverrides = {
    organization: parseCmsFeatureOverrideDelta(overrideInput.organizationEnabledFeatures),
    location: parseCmsFeatureOverrideDelta(overrideInput.locationEnabledFeatures),
  }
  try {
    return { vertical, template: template as PublicTemplateSlug, capabilities: resolveCmsCapabilities(vertical, template, overrides) }
  } catch (error) {
    // resolveCmsCapabilities throws two distinct cases (config/cms-registry.ts): an unsupported
    // vertical/template pair (a data/config problem — generic 422 is correct) and a location
    // override that isn't a subset of the site's effective features (a caller-correctable
    // validation error whose message names the specific unsupported feature(s)). Collapsing both
    // into the generic message here would hide which features actually failed.
    if (error instanceof Error && error.message.startsWith('Location capability override requires parent site support')) {
      throw new HTTPError({ statusCode: 400, statusMessage: error.message })
    }
    throw new HTTPError({ statusCode: 422, statusMessage: `Unsupported CMS capability combination: ${vertical}/${template}` })
  }
}
