import { computed, toValue, type MaybeRefOrGetter } from 'vue'
import { useSchemaOrg } from '~/composables/useSchemaOrg'
import {
  buildProfessionalServiceGraph,
  type ProfessionalServiceOrgIdentity,
  type ProfessionalServiceSchemaInput,
} from '~/utils/professional-service-schema'
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
      name: id?.brand_name || comp?.entity_name || null,
      description: id?.brand_description || null,
      logoUrl: id?.logo_url || null,
      entityType: comp?.entity_type || null,
      nonprofitStatus: comp?.nonprofit_status || null,
      serviceArea: comp?.service_area || null,
      serviceAreaType: comp?.service_area_type || null,
      sameAs: comp?.same_as || null,
      founderName: comp?.founder_name || null,
      foundingDate: comp?.founding_date || null,
      contactPoints: comp?.contact_points || null,
      address: null,
      addressVisible: comp?.address_visibility === 'visible',
    }
  })
}

export type ProfessionalServiceSchemaCallerInput = Omit<ProfessionalServiceSchemaInput, 'origin'>

/**
 * Canonical structured-data composable for professional-service (Blawby)
 * public pages. Every Blawby route component/page calls this instead of
 * hand-rolling JSON-LD — it's the single place that turns canonical
 * tenant_compliance/offerings/tenant_pages data into a linked schema.org
 * `@graph`, so dashboard/ChowBot/MCP/import-authored data and public
 * rendering can never drift from each other.
 *
 * The canonical origin is resolved here (matching useSeoUrl()'s tenant-first
 * precedence) — callers do not pass `origin`. `useRequestURL()` must be
 * captured at composable-call time (i.e. here, during the caller's setup()),
 * not inside the lazy `input` getter, or Nuxt throws "composable called
 * outside of a plugin/setup" once the getter re-runs during head resolution.
 */
export function useProfessionalServiceSchema(
  input: MaybeRefOrGetter<ProfessionalServiceSchemaCallerInput | null | undefined>,
) {
  const requestURL = useRequestURL()
  useSchemaOrg(computed(() => {
    const value = toValue(input)
    if (!value?.org?.name || !value.pageUrl || !value.pageTitle) return null
    return buildProfessionalServiceGraph({ ...value, origin: requestURL.origin }) as unknown as ApiRecord
  }))
}
