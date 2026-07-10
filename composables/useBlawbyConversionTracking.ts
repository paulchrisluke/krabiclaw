import type { PublicConsultationSettings } from '~/types/blawby'
import type { MaybeRefOrGetter } from 'vue'
import { toValue } from 'vue'

declare global {
  interface Window {
    dataLayer?: unknown[]
    __blawbyGtmLoaded?: Record<string, boolean>
  }
}

type BlawbyConversionEvent = 'page_view' | 'book_consultation_click' | 'contact_submit'

interface BlawbyConversionPayload {
  event_name: BlawbyConversionEvent
  page_type?: string | null
  page_path?: string | null
  cta_destination?: string | null
  tenant?: string | null
  metadata?: ApiRecord | null
}

const DEFAULT_ALLOWED_PROPERTIES = ['event', 'page_type', 'page_path', 'cta_destination', 'tenant']
const GTM_ID_RE = /^GTM-[A-Z0-9]+$/

function asStringArray(value: unknown) {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string' && item.length > 0) : []
}

function sendNativeConversion(siteId: string, payload: BlawbyConversionPayload) {
  if (!import.meta.client) return
  const endpoint = `/api/public/sites/${siteId}/conversion-events`
  const body = JSON.stringify(payload)
  if (typeof navigator !== 'undefined' && 'sendBeacon' in navigator) {
    const blob = new Blob([body], { type: 'application/json' })
    if (navigator.sendBeacon(endpoint, blob)) return
  }
  void $fetch(endpoint, { method: 'POST', body: payload }).catch(() => {})
}

function loadGtmOnInteraction(containerId: string) {
  if (!import.meta.client || !GTM_ID_RE.test(containerId)) return
  window.__blawbyGtmLoaded = window.__blawbyGtmLoaded || {}
  if (window.__blawbyGtmLoaded[containerId]) return
  window.__blawbyGtmLoaded[containerId] = true
  window.dataLayer = window.dataLayer || []
  window.dataLayer.push({ 'gtm.start': Date.now(), event: 'gtm.js' })
  const script = document.createElement('script')
  script.async = true
  script.src = `https://www.googletagmanager.com/gtm.js?id=${encodeURIComponent(containerId)}`
  document.head.appendChild(script)
}

function pushAnalyticsBridge(consultation: PublicConsultationSettings, payload: BlawbyConversionPayload) {
  if (!import.meta.client) return
  const bridge = consultation.metadata?.analyticsBridge
  if (!bridge || typeof bridge !== 'object') return
  const record = bridge as ApiRecord
  const allowedEvents = new Set(asStringArray(record.allowed_events))
  if (!allowedEvents.has(payload.event_name)) return

  const allowedProperties = new Set(asStringArray(record.allowed_properties))
  if (!allowedProperties.size) {
    DEFAULT_ALLOWED_PROPERTIES.forEach(property => allowedProperties.add(property))
  }

  const bridged: Record<string, string> = { event: payload.event_name }
  for (const key of DEFAULT_ALLOWED_PROPERTIES) {
    if (key === 'event' || !allowedProperties.has(key)) continue
    const value = payload[key as keyof BlawbyConversionPayload]
    if (typeof value === 'string' && value) bridged[key] = value
  }

  if (record.provider === 'gtm' && typeof record.container_id === 'string') {
    loadGtmOnInteraction(record.container_id.trim().toUpperCase())
  }

  window.dataLayer = window.dataLayer || []
  window.dataLayer.push(bridged)
}

export function useBlawbyConversionTracking(consultationSource: MaybeRefOrGetter<PublicConsultationSettings>) {
  const { siteId, site } = useTenantSite()
  const consultation = computed(() => toValue(consultationSource))

  function track(payload: BlawbyConversionPayload) {
    if (!siteId || !consultation.value.tracking_enabled) return
    const normalized = {
      ...payload,
      tenant: payload.tenant ?? site?.brand_name ?? null,
    }
    pushAnalyticsBridge(consultation.value, normalized)
    sendNativeConversion(siteId, normalized)
  }

  function trackConsultationClick(pageType: string, pagePath: string, ctaDestination?: string | null) {
    track({
      event_name: 'book_consultation_click',
      page_type: pageType,
      page_path: pagePath,
      cta_destination: ctaDestination || consultation.value.external_url || consultation.value.schedule_path,
    })
  }

  function trackContactSubmit(pageType = 'contact', pagePath = '/contact') {
    track({
      event_name: 'contact_submit',
      page_type: pageType,
      page_path: pagePath,
    })
  }

  return {
    track,
    trackConsultationClick,
    trackContactSubmit,
  }
}
