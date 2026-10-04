import { computed, toValue, type MaybeRefOrGetter } from 'vue'
import type { ProfessionalServiceOrgIdentity } from '~/utils/professional-service-schema'
import type { PublicBlawbyIdentity, PublicCompliance } from '~/types/blawby'

/**
 * Maps the canonical Blawby shell data (site identity + tenant_compliance)
 * into the org identity shape the schema graph builder expects. Every Blawby
 * page/component should build its `org` input through this helper so the
 * organization node never drifts between routes.
 */
export function useBlawbyOrgIdentity(
  identity: MaybeRefOrGetter<PublicBlawbyIdentity | null | undefined>,
  compliance: MaybeRefOrGetter<PublicCompliance | null | undefined>,
) {
  return computed<ProfessionalServiceOrgIdentity>(() => {
    const id = toValue(identity)
    const comp = toValue(compliance)
    return {
      name: id?.name || comp?.entity_name || null,
      description: id?.brand_description || null,
      logoUrl: id?.media.find(item => item.slot === 'logo')?.public_url || null,
      entityType: comp?.entity_type || null,
      nonprofitStatus: comp?.nonprofit_status || null,
      serviceArea: comp?.service_area || null,
      serviceAreaType: comp?.service_area_type || null,
      sameAs: comp?.same_as || null,
      founderName: comp?.founder_name || null,
      foundingDate: comp?.founding_date || null,
      contactPoints: comp?.contact_points || null,
      addressVisible: comp?.address_visibility === 'visible',
    }
  })
}
