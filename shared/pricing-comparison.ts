import { getPlanEntitlements } from '../server/utils/billing-entitlements'

// Reviewed comparison copy, not Stripe's paid marketing_features. IDs map to the
// feature evidence library; source ownership and unresolved policies are recorded
// in docs/design/pricing/implementation-plan.md. Keep provider bullets untouched.
export interface PricingComparisonRow {
  id: string
  label: string
  detail: string
  included?: string
  entitlement?: string
  free?: string
  growth?: string
}

export const PRICING_COMPARISON: ReadonlyArray<{ title: string; rows: readonly PricingComparisonRow[] }> = [
  { title: 'Your website', rows: [
    { id: 'site.management', label: 'Business website', detail: 'Restaurant, experience or professional-service site.', included: 'Included' },
    { id: 'themes.public', label: 'Saya and Blawby themes', detail: 'The theme follows your business type.', included: 'Included' },
    { id: 'site.management', label: 'Krabiclaw subdomain', detail: 'A hosted address for your site.', included: 'Included' },
    { id: 'site.seo', label: 'Structured search metadata', detail: 'Business-type metadata supports search discovery; search ranking or indexing is not guaranteed.', included: 'Included' },
    { id: 'domains.custom', label: 'Your own domain', detail: 'Connect an owned domain after completing DNS setup.', entitlement: 'custom_domains' },
    { id: 'content.custom-pages', label: 'Custom pages', detail: 'Create and edit additional page documents.', entitlement: 'custom_pages' },
  ] },
  { title: 'Manage your business', rows: [
    { id: 'content.standard', label: 'Dashboard and ChatGPT tools', detail: 'Edit supported resources with authorized tools. Access varies by operation.', included: 'Included' },
    { id: 'catalog.products', label: 'Menus, offerings and photos', detail: 'Manage products and media for your business type.', included: 'Included' },
    { id: 'media.management', label: 'Image and video library', detail: 'Upload and place supported media on your site; videos need a poster image.', included: 'Included' },
    { id: 'analytics.reports', label: 'Website analytics', detail: 'Read available organization-scoped reports. Connected Google reports require provider setup.', included: 'Included' },
    { id: 'locations.management', label: 'Locations and calendar', detail: 'Manage location details and available dates.', included: 'Included' },
    { id: 'posts.website', label: 'Website posts', detail: 'Create and publish posts on your website.', included: 'Included' },
    { id: 'social.external-channels', label: 'Facebook and Instagram publishing', detail: 'Explicit publishing to connected channels requires provider permissions and valid media.', entitlement: 'managed_service' },
  ] },
  { title: 'Guests and bookings', rows: [
    { id: 'bookings.requests', label: 'Bookings and consultation requests', detail: 'Availability depends on your business type and configured offerings.', included: 'Included' },
    { id: 'catalog.products', label: 'Ticketed experiences', detail: 'For configured experience products. Payment processing terms apply.', included: 'Included' },
    { id: 'notifications.email-dashboard', label: 'Booking email notifications', detail: 'Automatic booking email is separate from an explicit review request.', included: 'Included' },
    { id: 'inbox.submissions', label: 'Guest inquiries', detail: 'Read contact and reservation inquiries for your organization.', included: 'Included' },
    { id: 'reviews.read', label: 'Review records', detail: 'Read available imported and guest reviews. Display and provenance depend on the review source.', included: 'Included' },
    { id: 'notifications.whatsapp', label: 'WhatsApp business notifications', detail: 'Requires a verified recipient phone, notification preferences and the paid messaging capability. Authentication codes are separate.', entitlement: 'messaging' },
    { id: 'reviews.requests', label: 'Review-request emails', detail: 'Explicit requests require the paid review-request capability; ordinary booking email is separate.', entitlement: 'review_requests' },
  ] },
  { title: 'Presence and languages', rows: [
    { id: 'places.onboarding', label: 'Initial Google Places import', detail: 'Import a selected business snapshot during onboarding.', included: 'Included' },
    { id: 'places.refresh', label: 'Google Places re-import', detail: 'Connect a selected Place and explicitly refresh its details.', entitlement: 'google_places' },
    { id: 'places.refresh', label: 'Weekly Google review refresh', detail: 'Scheduled review and rating refresh for connected Places; not continuous synchronization of all business details.', entitlement: 'google_places' },
    { id: 'content.locales', label: 'English source website', detail: 'Source content remains available while additional languages are authored.', included: 'Included' },
    { id: 'content.additional-locales', label: 'Additional website languages', detail: 'Manually author and publish Japanese and Thai; up to two secondary languages. No automatic translation.', free: 'English only', growth: 'Up to 2 additional languages' },
  ] },
  { title: 'Help', rows: [
    { id: 'support.docs-help', label: 'Documentation and help form', detail: 'Browse the docs or contact us through the platform help form.', included: 'Included' },
  ] },
]

export function comparisonValue(row: { included?: string; entitlement?: string; free?: string; growth?: string }, planId: string): string {
  if (row.included) return row.included
  if (row.entitlement) {
    const value = getPlanEntitlements(planId)[row.entitlement]
    if (typeof value !== 'boolean') throw new Error(`Unknown capability ${row.entitlement}`)
    return value ? 'Included with setup' : 'Not included'
  }
  if (planId === 'free' && row.free) return row.free
  if (planId === 'growth' && row.growth) return row.growth
  throw new Error(`No comparison value for plan ${planId}`)
}
