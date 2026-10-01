import type { MaybeRefOrGetter } from 'vue'
import type { Product } from '~/server/types/products'
import type { PublicProductLocationPayload, PublicProductSession } from '~/server/utils/public-products'
import type { CurrencyCode } from '~/shared/currencies'
import { selectPrice } from '~/shared/prices'
import { formatProductMoney } from '~/utils/product-money'
import { localDateAt, localPartsAt } from '~/utils/timezone'
import { getErrorMessage } from '~/utils/errors'
import { isRecord, publicApiRequest, publicApiMutation } from '~/utils/api-clients'
import { setBookingConfirmation } from '~/composables/useBookingHandoff'
import type { SubmissionMeasurement } from '~/composables/useOrganizationConversionTracking'
import type { ConversionValue } from '~/utils/organization-conversion-events'
import type { ContactFormState } from '~/components/booking/BookingContactForm.vue'
import type { RawDateAvailability, TimeSlotSelection } from '~/components/booking/BookingTimeStep.vue'

export interface SessionBookingContext {
  organizationId: string
  organizationName: string
  product: Product
  currency: CurrencyCode
  location: PublicProductLocationPayload | null
  sessions: PublicProductSession[]
}

/** The public Product booking flow, shared by location pages and online consultations. */
export function useSessionBooking(input: MaybeRefOrGetter<SessionBookingContext>) {
  const context = computed(() => toValue(input))
  const { locale, t } = useI18n()
  const { trackCheckoutStart, mirrorSubmission, pageEventId } = useOrganizationConversionTracking()
  const sellableVariants = computed(() => context.value.product.variants.filter(variant => variant.active))
  const bookingOpen = ref(false)
  const bookingStep = ref(1)
  const partySize = ref(1)
  /** The options a customer can actually choose — what is priced, and what is booked. */
  const selectedVariantId = ref<string | null>(sellableVariants.value.length === 1 ? sellableVariants.value[0]!.id : null)
  function variantPriceLabel(variant: Product['variants'][number]) {
    return formatProductMoney(selectPrice(variant.prices, { currency: context.value.currency, location_id: context.value.location?.id ?? null, at: new Date().toISOString() }))
  }
  const timeSelection = ref<TimeSlotSelection | null>(null)
  const submitting = ref(false)
  const bookingError = ref('')
  /**
   * The occurrences, as the page was served with them.
   *
   * They arrive from the payload rather than from a fetch after hydration, so
   * the dates are in the HTML. The client refresh below replaces them; it does
   * not supply them, because the first reader may be a crawler that runs nothing.
   */
  const sessions = ref<PublicProductSession[]>([...context.value.sessions])
  const sessionsPending = ref(false)
  const referenceDate = computed(() => sessions.value[0] ? localDateAt(new Date(), sessions.value[0].timezone) : undefined)

  function localDateOf(session: PublicProductSession) {
    const parts = localPartsAt(new Date(session.starts_at), session.timezone)
    return `${String(parts.year).padStart(4, '0')}-${String(parts.month).padStart(2, '0')}-${String(parts.day).padStart(2, '0')}`
  }
  function localTimeOf(session: PublicProductSession) {
    const parts = localPartsAt(new Date(session.starts_at), session.timezone)
    return `${String(parts.hour).padStart(2, '0')}:${String(parts.minute).padStart(2, '0')}`
  }

  // The calendar speaks in the session's own zone, so a 10:00 class is 10:00 for
  // every guest reading the page from anywhere.
  const availabilityDates = computed<RawDateAvailability[]>(() => {
    const byDate = new Map<string, RawDateAvailability>()
    for (const session of sessions.value) {
      const date = localDateOf(session)
      const entry = byDate.get(date) ?? { date, slots: [] }
      entry.slots.push({
        time_slot: localTimeOf(session),
        capacity: session.remaining === null ? null : session.remaining,
        booked: 0,
        remaining: session.remaining,
        is_closed: false,
        is_full: session.is_full,
      })
      byDate.set(date, entry)
    }
    return [...byDate.values()].sort((left, right) => left.date.localeCompare(right.date))
  })

  /**
   * The largest party the calendar can take.
   *
   * Seats live on the session, not on the product: `default_capacity` is what
   * generating an occurrence starts from, and the sessions already on the
   * calendar keep whatever capacity they were given. Reading the product default
   * here capped a twelve-seat session at four, and a product with no default at
   * an unrelated eight.
   *
   * Once a time is chosen it is that session's remaining seats; before then it is
   * the most any session on the calendar has left. A session with no capacity at
   * all takes any party the endpoint accepts.
   */
  const MAX_PARTY_SIZE = 99
  const guestsMax = computed(() => {
    const pool = selectedSession.value ? [selectedSession.value] : sessions.value
    if (!pool.length) return 1
    if (pool.some(session => session.remaining === null)) return MAX_PARTY_SIZE
    return Math.max(1, ...pool.map(session => session.remaining ?? 0))
  })

  const selectedSession = computed<PublicProductSession | null>(() => {
    const selection = timeSelection.value
    if (!selection) return null
    return sessions.value.find(session => localDateOf(session) === selection.day && localTimeOf(session) === selection.time) ?? null
  })

  /**
   * Load what the form needs. Opening is the checkbox's job.
   *
   * The control is a label for the modal's checkbox, so pressing it toggles that
   * checkbox and the modal reports the new state back through v-model. Setting
   * `bookingOpen` here as well raced the label's own activation: the state said
   * open, the checkbox had been flipped back, and the dialog stayed hidden with
   * its sessions loaded behind it.
   */
  /**
   * Re-read the occurrences, for a reader who has been on the page a while.
   *
   * This refreshes what the page was served with; it is not the only source of
   * it. A failure leaves the rendered sessions standing and says the load
   * failed — it does not claim there is nothing to book, which is a different
   * fact and the one this page used to state wrongly.
   */
  async function loadSessions() {
    if (sessionsPending.value) return
    sessionsPending.value = true
    try {
      const response = await publicApiRequest<{ success: true; sessions: PublicProductSession[] }>(
        // This page is one branch's page, so it asks for that branch's
        // occurrences. Two branches running the same class at the same hour
        // would otherwise be indistinguishable by date and time alone.
        `/api/public/products/${encodeURIComponent(context.value.product.slug)}/sessions?location_id=${encodeURIComponent(context.value.location?.id ?? 'online')}`,
        {
          validate: (value): value is { success: true; sessions: PublicProductSession[] } =>
            isRecord(value) && value.success === true && Array.isArray(value.sessions),
        },
      )
      sessions.value = response.sessions.filter(session => !session.is_full)
    } catch (error) {
      bookingError.value = getErrorMessage(error, t('saya.experience_detail.booking_failed'))
    } finally {
      sessionsPending.value = false
    }
  }

  async function openBooking() {
    bookingStep.value = 1
    bookingError.value = ''
    await loadSessions()
  }

  watch(bookingOpen, (open) => {
    // Observe the modal's canonical state, including an opening before hydration.
    // The option and its price are not chosen yet, so none is claimed here.
    if (open) trackCheckoutStart(context.value.product.id, context.value.location?.id ?? null, { products: [{ product_id: context.value.product.id, name: context.value.product.name, quantity: 1 }] }, selectedVariantId.value)
  })

  /** A guest pressing a time on the page arrives in the form with it chosen. */
  async function openBookingAt(session: PublicProductSession) {
    timeSelection.value = { day: localDateOf(session), time: localTimeOf(session), label: `${sessionDayLabel(session)} · ${sessionTimeLabel(session)}` }
    await openBooking()
  }

  const upcomingSessions = computed(() => {
    const now = Date.now()
    return sessions.value
      .filter(session => Date.parse(session.starts_at) > now)
      .sort((left, right) => left.starts_at.localeCompare(right.starts_at))
      .slice(0, 4)
  })
  const nextSession = computed(() => upcomingSessions.value[0] ?? null)

  function sessionDayLabel(session: PublicProductSession): string {
    return new Intl.DateTimeFormat(locale.value, { weekday: 'short', day: 'numeric', month: 'short', timeZone: session.timezone }).format(new Date(session.starts_at))
  }
  function sessionTimeLabel(session: PublicProductSession): string {
    const format = new Intl.DateTimeFormat(locale.value, { hour: 'numeric', minute: '2-digit', timeZone: session.timezone })
    return `${format.format(new Date(session.starts_at))} – ${format.format(new Date(session.ends_at))}`
  }


  async function submitBooking(contact: ContactFormState) {
    const session = selectedSession.value
    if (submitting.value) return
    if (!session) {
      bookingError.value = t('saya.experience_detail.choose_time')
      bookingStep.value = 1
      return
    }
    if (!selectedVariantId.value) {
      bookingError.value = t('saya.product_detail.choose_option')
      bookingStep.value = 1
      return
    }
    submitting.value = true
    bookingError.value = ''
    try {
      const response = await publicApiMutation<{ success: true; status: 'pending' | 'confirmed'; operational_booking_id: string; request_id: string; booking_id: string; cancellation_token: string; message: string; quoted_value?: ConversionValue | null; measurement?: SubmissionMeasurement; policy_summary?: ApiRecord | null }>(
        `/api/public/products/${encodeURIComponent(context.value.product.slug)}/book`,
        {
          method: 'POST',
          body: {
            session_id: session.id,
            variant_id: selectedVariantId.value,
            party_size: partySize.value,
            guest_name: contact.name,
            guest_email: contact.email,
            guest_phone: contact.phone || null,
            notes: contact.notes || null,
            locale: locale.value,
            page_event_id: await pageEventId(),
          },
          validate: (value): value is { success: true; status: 'pending' | 'confirmed'; operational_booking_id: string; request_id: string; booking_id: string; cancellation_token: string; message: string; quoted_value?: ConversionValue | null; measurement?: SubmissionMeasurement } =>
            isRecord(value) && value.success === true && typeof value.booking_id === 'string' && typeof value.cancellation_token === 'string' && typeof value.operational_booking_id === 'string' && typeof value.request_id === 'string' && (value.status === 'pending' || value.status === 'confirmed'),
        },
      )
      mirrorSubmission('booking_submit', response.measurement, context.value.location?.id ?? null, response.quoted_value)
      setBookingConfirmation({
        type: 'booking', status: response.status, operationalBookingId: response.operational_booking_id, requestId: response.request_id,
        organizationId: context.value.organizationId,
        organizationName: context.value.location?.title ?? context.value.organizationName,
        guestName: contact.name,
        startsAt: session.starts_at,
        timezone: session.timezone,
        guests: partySize.value,
        productId: context.value.product.id,
        title: context.value.product.name,
        requests: contact.notes || null,
        message: response.message,
        cancelUrl: `/bookings/cancel?id=${response.booking_id}#${response.cancellation_token}`,
        policySummary: response.policy_summary ?? null,
        locationId: context.value.location?.id ?? null,
        locationName: context.value.location?.title ?? context.value.organizationName,
        locationSlug: context.value.location?.slug ?? null,
      })
      bookingOpen.value = false
      await navigateTo('/bookings/confirmed')
    } catch (error) {
      bookingError.value = getErrorMessage(error, 'That booking could not be completed. Please try again.')
    } finally {
      submitting.value = false
    }
  }

    return { bookingOpen, bookingStep, partySize, selectedVariantId, sellableVariants, variantPriceLabel,
      timeSelection, submitting, bookingError, sessions, sessionsPending, availabilityDates, referenceDate, guestsMax,
      selectedSession, loadSessions, openBooking, openBookingAt, upcomingSessions, nextSession,
      sessionDayLabel, sessionTimeLabel, submitBooking }
}
export type SessionBookingController = ReturnType<typeof useSessionBooking>
