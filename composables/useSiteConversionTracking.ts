import type { PublicConsultationSettings } from '~/types/blawby'
import type { SiteConversionEventName } from '~/utils/site-conversion-events'
import type { MaybeRefOrGetter } from 'vue'
import { $fetch } from 'ofetch'

interface ConversionPayload {
  event_name: SiteConversionEventName
  stage: string
  page_type?: string | null
  page_path?: string | null
  page_id?: string | null
  location_id?: string | null
  product_id?: string | null
  link_item_id?: string | null
  tenant_page_id?: string | null
  tier_label?: string | null
  tier_amount?: number | null
}

function nativeConversion(siteId: string, payload: ConversionPayload) {
  if (!import.meta.client) return
  void $fetch(`/api/public/sites/${siteId}/conversion-events`, { method: 'POST', body: payload, retry: 0 }).catch(() => {})
}

function mirrorConversion(payload: ConversionPayload) {
  if (!import.meta.client) return
  const params = {
    stage: payload.stage,
    ...(payload.page_type ? { page_type: payload.page_type } : {}),
    ...(payload.page_path ? { page_path: payload.page_path } : {}),
    ...(payload.location_id ? { location_id: payload.location_id } : {}),
  }
  window.zaraz?.track(payload.event_name, params)
}

export function useSiteConversionTracking(_consultationSource?: MaybeRefOrGetter<PublicConsultationSettings>) {
  const { siteId } = useTenantSite()

  function track(payload: ConversionPayload, native = true) {
    if (!siteId) return
    if (native) nativeConversion(siteId, payload)
    mirrorConversion(payload)
  }

  function trackConsultationClick(pageType: string, pagePath: string, destination?: string | null, pageId?: string | null) {
    const external = /^https?:\/\//i.test(destination || '')
      || /^\/api\/public\/sites\/[^/]+\/consultation-handoff(?:\?|$)/.test(destination || '')
    track({
      event_name: 'consultation_cta_click',
      stage: external ? 'external_booking_handoff' : 'schedule_navigation',
      page_type: pageType,
      page_path: pagePath,
      page_id: pageId,
    }, !external)
  }

  function mirrorSubmission(eventName: 'contact_submit' | 'reservation_submit' | 'experience_booking_submit', locationId?: string | null) {
    mirrorConversion({ event_name: eventName, stage: 'submitted', location_id: locationId })
  }

  function trackDonationClick(tenantPageId: string, pagePath: string, tierLabel: string, tierAmount: number | null) {
    track({ event_name: 'donation_click', stage: 'external_handoff', tenant_page_id: tenantPageId, page_path: pagePath, page_type: 'donate', tier_label: tierLabel, tier_amount: tierAmount })
  }

  function trackLinkClick(linkItemId: string) {
    track({ event_name: 'link_click', stage: 'external_handoff', link_item_id: linkItemId, page_type: 'links', page_path: '/links' })
  }

  function trackProductOrder(locationId: string, productId: string, pagePath?: string) {
    track({ event_name: 'product_order_external_click', stage: 'external_handoff', location_id: locationId, product_id: productId, page_type: 'product', page_path: pagePath })
  }

  return { track, trackConsultationClick, mirrorSubmission, trackDonationClick, trackLinkClick, trackProductOrder }
}
