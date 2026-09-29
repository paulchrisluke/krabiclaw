import type { PublicConsultationSettings } from '~/types/blawby'
import { projectConversionToGa4 } from '~/utils/ga4-projection'
import type { ConversionValue, OrganizationConversionEventName } from '~/utils/organization-conversion-events'
import type { MaybeRefOrGetter } from 'vue'
import { toValue } from 'vue'

interface ConversionPayload {
  event_name: OrganizationConversionEventName
  stage: string
  page_type?: string | null
  page_path?: string | null
  page_id?: string | null
  location_id?: string | null
  product_id?: string | null
  link_item_id?: string | null
  document_id?: string | null
  tier_label?: string | null
  tier_amount?: number | null
}

function nativeConversion(organizationId: string, payload: ConversionPayload) {
  if (!import.meta.client) return
  void fetch(`/api/public/conversion-events`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(payload),
    keepalive: true,
  }).catch(() => {})
}

// The browser owns what the visitor does on the page. The name, dimensions and
// value come from the shared projection, so the same fact reads the same in
// every sender. `value` is what the server resolved for a submission it
// already committed; the browser never computes or asserts an amount.
function mirrorConversion(payload: ConversionPayload, value?: ConversionValue | null) {
  if (!import.meta.client) return
  const projection = projectConversionToGa4({
    eventName: payload.event_name,
    value,
    params: {
      stage: payload.stage,
      ...(payload.page_type ? { page_type: payload.page_type } : {}),
      ...(payload.page_path ? { page_path: payload.page_path } : {}),
      ...(payload.location_id ? { location_id: payload.location_id } : {}),
    },
  })
  window.zaraz?.track(projection.name, projection.params)
}

// view_item and begin_checkout at the real boundaries of a product page, sent
// through Zaraz's ecommerce API (which the zone enables and the GA4 tool maps).
function trackEcommerce(name: 'Product Viewed' | 'Checkout Started', params: Record<string, unknown>) {
  if (!import.meta.client) return
  window.zaraz?.ecommerce?.(name, params)
}

export function useOrganizationConversionTracking(consultationSource?: MaybeRefOrGetter<PublicConsultationSettings>) {
  const { organizationId } = useTenantOrganization()

  function track(payload: ConversionPayload) {
    if (!organizationId) return
    nativeConversion(organizationId, payload)
    mirrorConversion(payload)
  }

  function trackConsultationClick(pageType: string, pagePath: string, destination?: string | null, pageId?: string | null) {
    if (toValue(consultationSource)?.tracking_enabled === false) return
    const external = /^https?:\/\//i.test(destination || '')
    track({
      event_name: 'consultation_cta_click',
      stage: external ? 'external_booking_handoff' : 'schedule_navigation',
      page_type: pageType,
      page_path: pagePath,
      page_id: pageId,
    })
  }

  function mirrorSubmission(eventName: 'contact_submit' | 'reservation_submit' | 'booking_submit', locationId?: string | null, value?: ConversionValue | null) {
    mirrorConversion({ event_name: eventName, stage: 'submitted', location_id: locationId }, value)
  }

  function trackDonationClick(documentId: string, pagePath: string, tierLabel: string, tierAmount: number | null) {
    track({ event_name: 'donation_click', stage: 'external_handoff', document_id: documentId, page_path: pagePath, page_type: 'donate', tier_label: tierLabel, tier_amount: tierAmount })
  }

  function trackLinkClick(linkItemId: string) {
    track({ event_name: 'link_click', stage: 'external_handoff', link_item_id: linkItemId, page_type: 'links', page_path: '/links' })
  }

  function trackProductOrder(locationId: string, productId: string, pagePath?: string) {
    track({ event_name: 'product_order_external_click', stage: 'external_handoff', location_id: locationId, product_id: productId, page_type: 'product', page_path: pagePath })
  }

  return { track, trackEcommerce, trackConsultationClick, mirrorSubmission, trackDonationClick, trackLinkClick, trackProductOrder }
}
