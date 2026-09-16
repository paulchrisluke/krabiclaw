import { localDateAt } from '~/utils/timezone'
import { resolveBookingPresentation } from '~/utils/booking-presentation'
import type { DashboardBookingDetails, DashboardBookingType } from '~/server/utils/dashboard-booking-details'

/**
 * One booking record, loaded once per route.
 *
 * The record is drawn in two places — its own screen under Today, and the
 * detail column of the guest thread it belongs to — and the screen that draws
 * the chrome needs the same title the body does. Both call this; the shared
 * `useAsyncData` key means that is one request, not two.
 */
export function isBookingDetailsResponse(value: unknown): value is { booking: DashboardBookingDetails } {
  return isRecord(value)
    && isRecord(value.booking)
    && typeof value.booking.id === 'string'
    && typeof value.booking.siteId === 'string'
    && typeof value.booking.guestName === 'string'
    && Array.isArray(value.booking.notes)
    && isRecord(value.booking.policy)
}

export async function useBookingDetails(bookingType: DashboardBookingType, bookingId: string) {
  const route = useRoute()
  const dashboardApi = useDashboardApi()
  const requestEvent = useRequestEvent()
  const orgSlug = computed(() => String(route.params.orgSlug || ''))

  const key = computed(() => `dashboard-booking:${orgSlug.value}:${bookingType}:${bookingId}`)
  const { data: resource, pending, error } = await useAsyncData<{ booking: DashboardBookingDetails }>(key, async () => {
    if (import.meta.server) {
      if (!requestEvent) throw createError({ statusCode: 500, statusMessage: 'Dashboard request context unavailable' })
      const { loadDashboardBookingDetails } = await import('~/server/utils/dashboard-booking-details')
      return { booking: await loadDashboardBookingDetails(requestEvent, {
        type: bookingType,
        bookingId,
        organizationSlug: orgSlug.value,
      }) }
    }
    return await dashboardApi(`/api/dashboard/bookings/${bookingType}/${encodeURIComponent(bookingId)}`, {
      validate: isBookingDetailsResponse,
    })
  },
  // Awaiting this on the client blocks the navigation into the booking, and
  // every surface that reads it already renders `pending`. On the server it
  // stays immediate, so the booking is in the SSR payload.
  { lazy: import.meta.client },
  )

  const booking = computed(() => resource.value?.booking ?? null)

  // The one vocabulary. `resolveBookingPresentation` refuses a missing vertical
  // rather than guessing, so it is only asked once the booking has loaded.
  const presentation = computed(() => booking.value
    ? resolveBookingPresentation(booking.value.type, booking.value.vertical)
    : null)
  const noun = computed(() => presentation.value?.noun ?? '')

  const referenceDay = computed(() => booking.value ? localDateAt(new Date(), booking.value.timeZone) : '')
  const pageTitle = computed(() => {
    if (!booking.value) return 'Booking details'
    if (booking.value.status === 'cancelled') return 'Cancelled'
    if (booking.value.bookingDate === referenceDay.value) return 'Currently hosting'
    if (booking.value.bookingDate > referenceDay.value) return 'Coming up'
    return `Past ${noun.value}`
  })

  async function refresh() {
    resource.value = await dashboardApi<{ booking: DashboardBookingDetails }>(
      `/api/dashboard/bookings/${bookingType}/${encodeURIComponent(bookingId)}`,
      { validate: isBookingDetailsResponse },
    )
  }

  return { resource, booking, pending, error, presentation, noun, pageTitle, orgSlug, refresh }
}
