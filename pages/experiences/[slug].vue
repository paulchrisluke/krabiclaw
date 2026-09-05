<template>
  <NuxtLayout name="saya">

    <!-- Loading -->
    <div v-if="pending" class="mx-auto max-w-7xl px-4 py-16 sm:px-6 lg:px-8">
      <div class="grid gap-10 lg:grid-cols-[1fr_420px] lg:items-start">
        <div class="aspect-4/3 animate-pulse rounded-xl bg-elevated" />
        <div class="space-y-4">
          <div class="h-6 w-24 animate-pulse rounded bg-elevated" />
          <div class="h-10 w-full animate-pulse rounded bg-elevated" />
          <div class="h-24 w-full animate-pulse rounded bg-elevated" />
          <div class="h-12 w-full animate-pulse rounded-full bg-elevated" />
        </div>
      </div>
    </div>

    <!-- Not found -->
    <div v-else-if="!experience" class="mx-auto max-w-7xl px-4 py-32 text-center">
      <h1 class="text-2xl font-semibold text-default">{{ t('saya.experience_detail.not_found') }}</h1>
      <p class="mt-3 text-muted">{{ t('saya.experience_detail.not_found_description') }}</p>
      <NuxtLink :to="localePath('/experiences')" class="mt-6 inline-flex items-center rounded-full bg-muted px-5 py-2.5 text-sm font-medium text-default no-underline transition hover:bg-elevated">{{ experienceCopy.viewExperienceCta }}</NuxtLink>
    </div>

    <div v-else>

      <!-- One responsive primary CTA: the mobile sticky row and desktop card
           resolve the same action, so the footer remains secondary navigation. -->
      <div
        v-if="experienceCta"
        data-experience-cta="mobile"
        class="lg:hidden fixed bottom-0 inset-x-0 z-30 flex items-center justify-between gap-4 border-t border-default bg-default/95 backdrop-blur-sm px-5 py-4 shadow-lg"
      >
        <div v-if="experienceCta.action === 'book' && experiencePrice" class="min-w-0">
          <p v-if="experienceIsOnSale" class="text-xs text-muted line-through">{{ experienceCompareAtPrice }}</p>
          <p class="font-semibold text-default leading-tight">{{ experiencePrice }}</p>
          <p class="text-xs text-muted">{{ t('saya.experience_detail.per_person') }}</p>
        </div>
        <SayaButton
          class="shrink-0"
          :control-id="experienceCta.action === 'book' ? 'experience-booking-toggle' : undefined"
          :to="experienceCta.to"
          @click="handleExperienceCtaClick"
        >
          {{ experienceCta.label }}
        </SayaButton>
      </div>

      <!-- ── Main layout ────────────────────────────────────── -->
      <section class="mx-auto max-w-7xl px-4 pt-10 pb-28 lg:pb-10 sm:px-6 lg:px-8">

        <!-- Breadcrumb -->
        <nav class="mb-8 flex items-center gap-2 text-xs text-muted">
          <NuxtLink :to="localePath('/')" class="hover:text-default transition-colors">{{ t('saya.experience_detail.home') }}</NuxtLink>
          <SayaIcon name="chevron-right" class="size-3.5" />
          <NuxtLink :to="localePath('/experiences')" class="hover:text-default transition-colors">{{ experienceCopy.experiencesPageTitle }}</NuxtLink>
          <SayaIcon name="chevron-right" class="size-3.5" />
          <span class="text-default">{{ experience.title }}</span>
        </nav>

        <div class="grid gap-10 lg:grid-cols-[1fr_420px] lg:items-start">

          <!-- ── LEFT: Gallery + Content ───────────────────── -->
          <div class="min-w-0">

            <SayaMediaGallery :items="mediaItems" :title="experience.title">
              <template v-if="experience.tagline" #caption>
                <p class="text-sm text-white/80">{{ experience.tagline }}</p>
              </template>
            </SayaMediaGallery>

            <!-- Mobile: title + key facts (hidden on desktop) -->
            <div class="mt-7 lg:hidden space-y-4">
              <div>
                <p class="saya-kicker mb-2">{{ t('saya.experience_detail.experience') }}</p>
                <h1 class="text-2xl font-bold leading-tight text-default">{{ experience.title }}</h1>
                <p v-if="experience.tagline" class="mt-2 text-muted">{{ experience.tagline }}</p>
              </div>
              <div class="flex flex-wrap gap-2">
                <span
                  v-if="experience.duration_minutes"
                  class="inline-flex items-center gap-1.5 rounded-full border border-default bg-elevated px-3 py-1 text-xs font-medium text-muted"
                >
                  <SayaIcon name="clock" class="size-3.5" />
                  {{ formatDuration(experience.duration_minutes) }}
                </span>
                <span
                  v-if="experience.max_capacity"
                  class="inline-flex items-center gap-1.5 rounded-full border border-default bg-elevated px-3 py-1 text-xs font-medium text-muted"
                >
                  <SayaIcon name="user-group" class="size-3.5" />
                  {{ t('saya.experience_detail.capacity', { count: experience.max_capacity }) }}
                </span>
              </div>
            </div>

            <!-- What you'll do (body) -->
            <div v-if="experience.body" class="mt-10 border-t border-default pt-10">
              <h2 class="text-xl font-semibold text-default mb-6">{{ t('saya.experience_detail.what_youll_do') }}</h2>
              <!-- eslint-disable vue/no-v-html -->
              <div class="prose prose-lg max-w-none text-default" v-html="sanitizedBody" />
              <!-- eslint-enable vue/no-v-html -->
            </div>

            <!--
              One block instead of four stacked sections. Included items, what
              to bring and the policy lines are all the same kind of thing —
              short practical facts — and giving each its own full-width heading
              made boilerplate look like the main event.
            -->
            <div v-if="thingsToKnow.length" class="mt-10 border-t border-default pt-10">
              <h2 class="text-xl font-semibold text-default mb-6">{{ t('saya.experience_detail.things_to_know') }}</h2>
              <div class="grid gap-x-10 gap-y-8 sm:grid-cols-2">
                <div v-for="group in thingsToKnow" :key="group.id">
                  <div class="flex items-center gap-2">
                    <SayaIcon :name="group.icon" class="size-4 shrink-0 text-primary" />
                    <h3 class="text-sm font-semibold text-default">{{ group.title }}</h3>
                  </div>
                  <ul class="mt-2 space-y-1.5">
                    <li v-for="line in group.lines" :key="line" class="text-sm leading-6 text-muted">{{ line }}</li>
                  </ul>
                </div>
              </div>
            </div>

            <!-- Where you'll meet -->
            <div v-if="experienceLocation" class="mt-10 border-t border-default pt-10">
              <h2 class="text-xl font-semibold text-default mb-5">{{ t('saya.experience_detail.where_youll_meet') }}</h2>
              <div class="rounded-xl border border-default bg-elevated overflow-hidden">
                <div class="p-6 flex items-start gap-4">
                  <SayaIcon name="map-pin" class="mt-0.5 size-5 shrink-0 text-primary" />
                  <div class="min-w-0">
                    <p class="font-semibold text-default">{{ (experienceLocation as ApiRecord).title }}</p>
                    <p v-if="locationAddress" class="mt-1 text-sm text-muted">{{ locationAddress }}</p>
                    <p v-if="(experienceLocation as ApiRecord).phone" class="mt-1 text-sm text-muted">
                      {{ (experienceLocation as ApiRecord).phone }}
                    </p>
                    <p v-if="experience.meeting_point" class="mt-3 whitespace-pre-line text-sm leading-6 text-default">
                      {{ experience.meeting_point }}
                    </p>
                    <p v-if="(experienceLocation as ApiRecord).email" class="mt-0.5 text-sm text-muted">
                      {{ (experienceLocation as ApiRecord).email }}
                    </p>
                    <a
                      v-if="(experienceLocation as ApiRecord).maps_url"
                      :href="(experienceLocation as ApiRecord).maps_url"
                      target="_blank"
                      rel="noopener noreferrer"
                      class="mt-2 inline-flex items-center gap-1 text-xs text-primary hover:underline"
                    >
                      {{ t('saya.experience_detail.open_in_maps') }}
                      <SayaIcon name="arrow-top-right-on-square" class="size-3" />
                    </a>
                  </div>
                </div>
                <div
                  v-if="(experienceLocation as ApiRecord).map_embed_url"
                  class="border-t border-default"
                >
                  <iframe
                    :src="(experienceLocation as ApiRecord).map_embed_url"
                    class="h-56 w-full"
                    style="border:0"
                    loading="lazy"
                    referrerpolicy="no-referrer-when-downgrade"
                    allowfullscreen
                  />
                </div>
              </div>
            </div>

          </div>

          <!-- ── RIGHT: Sticky booking card ───────────────── -->
          <div class="hidden lg:block lg:sticky lg:top-8">
            <div class="rounded-xl border border-default bg-elevated p-6 shadow-sm space-y-5">

              <!-- Title + tagline (desktop only) -->
              <div class="hidden lg:block">
                <p class="saya-kicker mb-2">{{ t('saya.experience_detail.experience') }}</p>
                <h1 class="text-2xl font-bold leading-tight text-default">{{ experience.title }}</h1>
                <p v-if="experience.tagline" class="mt-1.5 text-sm text-muted">{{ experience.tagline }}</p>
              </div>

              <!-- Price -->
              <div v-if="experiencePrice" class="hidden lg:flex items-baseline gap-1.5">
                <span v-if="experienceIsOnSale" class="text-lg text-muted line-through">{{ experienceCompareAtPrice }}</span>
                <span class="text-2xl font-bold text-default">{{ experiencePrice }}</span>
                <span class="text-sm text-muted">{{ t('saya.experience_detail.per_person') }}</span>
              </div>

              <!-- Key facts (desktop only) -->
              <div class="hidden lg:flex flex-wrap gap-2">
                <span
                  v-if="experience.duration_minutes"
                  class="inline-flex items-center gap-1.5 rounded-full border border-default bg-default px-3 py-1 text-xs font-medium text-muted"
                >
                  <SayaIcon name="clock" class="size-3.5" />
                  {{ formatDuration(experience.duration_minutes) }}
                </span>
                <span
                  v-if="experience.max_capacity"
                  class="inline-flex items-center gap-1.5 rounded-full border border-default bg-default px-3 py-1 text-xs font-medium text-muted"
                >
                  <SayaIcon name="user-group" class="size-3.5" />
                  {{ t('saya.experience_detail.capacity', { count: experience.max_capacity }) }}
                </span>
              </div>

              <!-- Sold out -->
              <div
                v-if="experience.status === 'sold_out'"
                class="rounded-lg bg-red-50 dark:bg-red-950/30 px-4 py-3 text-sm font-medium text-red-600 dark:text-red-400 text-center"
              >
                {{ experienceCopy.soldOutLabel }}
              </div>

              <!-- Location closed (e.g. renovations) -->
              <div
                v-else-if="experienceLocationClosureMessage"
                class="rounded-lg bg-amber-50 dark:bg-amber-950/30 px-4 py-3 text-sm font-medium text-amber-700 dark:text-amber-400 text-center"
              >
                {{ experienceLocationClosureMessage }}
              </div>

              <div v-else-if="experienceCta" data-experience-cta="desktop" class="pt-2">
                <SayaButton
                  block
                  :control-id="experienceCta.action === 'book' ? 'experience-booking-toggle' : undefined"
                  :to="experienceCta.to"
                  @click="handleExperienceCtaClick"
                >
                  {{ experienceCta.label }}
                </SayaButton>
              </div>

              <div
                v-else-if="noBookableSlotsMessage"
                class="rounded-lg bg-amber-50 dark:bg-amber-950/30 px-4 py-3 text-sm font-medium text-amber-700 dark:text-amber-400 text-center"
              >
                {{ noBookableSlotsMessage }}
              </div>

            </div>
          </div>

        </div>

        <!-- One shared booking modal is mounted outside responsive card visibility. -->
        <BookingModal
          v-model="isBookingModalOpen"
          target-id="experience-booking"
          :title="modalTitle"
          :can-go-back="bookingStep > 1 && !submitting"
          @back="prevStep"
        >
          <!-- STEP 1: TIME (party size + day-grouped availability, single scrollable surface) -->
          <div v-if="bookingStep === 1" class="flex flex-1 flex-col min-h-0">
            <BookingTimeStep
              v-model="timeSelection"
              :dates="availabilityDates"
              :loading="availabilityLoading || !isHydrated"
              :guests="form.party_size_num"
              :guests-max="experience.max_capacity ?? 8"
              :guests-label="t('saya.experience_detail.guests')"
              :guest-singular="t('saya.experience_detail.guest')"
              :guest-plural="t('saya.experience_detail.guests')"
              :continue-label="t('saya.experience_detail.continue')"
              :choose-seating-label="t('saya.experience_detail.choose_time')"
              @update:guests="form.party_size_num = $event"
              @next="nextStep"
            />
            <div v-if="bookingError" role="alert" class="mt-4 rounded-lg border border-red-500/30 bg-red-500/5 px-4 py-3 text-sm text-red-500">
              {{ bookingError }}
            </div>
          </div>

          <!-- STEP 2: CONTACT DETAILS -->
          <div v-else-if="bookingStep === 2" class="flex-1 overflow-y-auto">
            <BookingRecap
              v-if="timeSelection"
              :main-line="`${timeSelection.label.split(',')[0]} · ${fmt12Hour(timeSelection.time)}`"
              :meta-line="t('saya.experience_detail.guest_count', { count: form.party_size_num })"
              :edit-label="t('saya.experience_detail.change')"
              @edit="bookingStep = 1"
            />
            <div v-if="bookingError" role="alert" class="mb-4 rounded-lg border border-red-500/30 bg-red-500/5 px-4 py-3 text-sm text-red-500">
              {{ bookingError }}
            </div>
            <BookingContactForm
              :initial-state="{ name: form.guest_name, email: form.guest_email, phone: form.guest_phone, notes: form.notes }"
              :loading="submitting"
              :submit-text="t('saya.experience_detail.confirm_booking')"
              @submit="handleContactSubmit"
            />
          </div>
        </BookingModal>
      </section>

    </div>

  </NuxtLayout>
</template>

<script setup lang="ts">
import { $fetch } from 'ofetch'
import { setBookingConfirmation } from '~/composables/useBookingHandoff'
import { getActiveSpecialClosure, formatClosureMessage } from '~/utils/formatters'
import { formatMinorAmount, minorAmountToMajor } from '~/shared/prices'
import {
  buildExperienceContactUrl,
  resolveExperienceAvailabilityMessage,
  resolveExperienceDetailCta,
} from '~/utils/experience-cta'

definePageMeta({ key: (route) => route.fullPath })

const DOMPurify = useHtmlSanitizer()

const route = useRoute()
const slug = route.params.slug as string
const { siteId, site } = useTenantSite()
const siteName = computed(() => String((site as ApiValue)?.brand_name ?? '').trim())
const config = useRuntimeConfig()
const siteUrl = config.public.siteUrl
const { locale, localePath, t } = useI18n()
const experienceCopy = computed(() => getVerticalCopy((site as ApiValue)?.vertical, locale.value))

const { experienceDetail: experience, config: siteConfig, pending, locations, experiencePolicyById } = await usePublicPageData()

const experiencePrice = computed(() => experience.value?.price
  ? formatMinorAmount(experience.value.price.amount_minor, experience.value.price.currency, locale.value)
  : '')
const experienceIsOnSale = computed(() => experience.value?.price?.compare_at_amount_minor != null)
const experienceCompareAtPrice = computed(() => experience.value?.price?.compare_at_amount_minor != null
  ? formatMinorAmount(experience.value.price.compare_at_amount_minor, experience.value.price.currency, locale.value)
  : '')

const experienceLocation = computed(() => {
  const locId = (experience.value as ApiValue)?.location_id
  if (!locId) return null
  return (locations.value as ApiRecord[]).find((l: ApiRecord) => l.id === locId) ?? null
})

// A location-wide closure (special_hours, e.g. "closed for renovations")
// blocks booking for every experience at that location without touching the
// experience's own status — the closure is time-boxed and reopens automatically.
const experienceLocationClosureMessage = computed(() => {
  const loc = experienceLocation.value as ApiRecord | null
  if (!loc) return null
  return formatClosureMessage(getActiveSpecialClosure(loc.special_hours, loc.timezone))
})

const noBookableSlotsMessage = computed(() => {
  return resolveExperienceAvailabilityMessage(
    (experience.value as ApiValue)?.availability_state,
    {
      fullyBooked: experienceCopy.value.fullyBookedLabel,
      notScheduled: experienceCopy.value.notScheduledLabel,
      temporarilyUnavailable: experienceCopy.value.temporarilyUnavailableLabel,
    },
  )
})

const contactUrl = computed(() => {
  const exp = experience.value as ApiValue
  return localePath(buildExperienceContactUrl(exp?.id, exp?.title))
})

const experienceCta = computed(() => resolveExperienceDetailCta({
  status: (experience.value as ApiValue)?.status,
  availabilityState: (experience.value as ApiValue)?.availability_state,
  locationClosed: Boolean(experienceLocationClosureMessage.value),
  bookLabel: experienceCopy.value.reserveCta,
  contactLabel: t('saya.footer.contact_us'),
  contactUrl: contactUrl.value,
}))

const experiencePolicySummary = computed(() => {
  const experienceId = experience.value?.id
  if (!experienceId) return null
  return experiencePolicyById.value[experienceId] ?? null
})

const locationAddress = computed(() => {
  const loc = experienceLocation.value as ApiRecord | null
  if (!loc?.address) return null
  if (typeof loc.address === 'string') return loc.address
  type Addr = { addressLines?: string[]; locality?: string; administrativeArea?: string }
  const addr = loc.address as Addr
  return [...(addr.addressLines ?? []), addr.locality, addr.administrativeArea].filter(Boolean).join(', ') || null
})
const sanitizedBody = computed(() => {
  const raw = experience.value?.body
  if (!raw) return ''
  return DOMPurify.sanitize(raw)
})

/**
 * The practical facts, as one set of small groups rather than four stacked
 * sections. Empty groups are omitted — an experience that lists nothing to
 * bring says nothing about it, instead of showing an empty heading.
 */
const thingsToKnow = computed(() => {
  const exp = experience.value
  if (!exp) return []
  const groups: Array<{ id: string; title: string; icon: string; lines: string[] }> = []

  if (exp.included_items?.length) {
    groups.push({
      id: 'included',
      title: t('saya.experience_detail.included'),
      icon: 'check-circle',
      lines: [...exp.included_items],
    })
  }
  if (exp.what_to_bring?.length) {
    groups.push({
      id: 'bring',
      title: t('saya.experience_detail.what_to_bring'),
      icon: 'briefcase',
      lines: [...exp.what_to_bring],
    })
  }
  // The summary builder now emits only what a tenant can author, so there is
  // nothing left to filter out here.
  const policyLines = (experiencePolicySummary.value?.items ?? []).map(item => item.text)
  if (policyLines.length) {
    groups.push({
      id: 'policies',
      title: experiencePolicySummary.value?.heading ?? '',
      icon: 'clock',
      lines: policyLines,
    })
  }
  return groups
})

const mediaItems = computed(() => {
  const exp = experience.value
  if (!exp) return []

  if (Array.isArray(exp.media)) {
    return exp.media
      .map(item => ({
        url: item.kind === 'video' ? (item.public_url || '') : item.public_url,
        kind: item.kind,
        poster: item.kind === 'video' ? (item.thumbnail_url || undefined) : undefined,
        alt: item.alt_text || exp.title,
      }))
      .filter(item => item.url)
  }

  return []
})

function formatDuration(minutes: number): string {
  if (minutes < 60) return t('saya.experience_detail.minutes', { count: minutes })
  const h = Math.floor(minutes / 60)
  const m = minutes % 60
  return m
    ? t('saya.experience_detail.hours_minutes', { hours: h, minutes: m })
    : t('saya.experience_detail.hours', { count: h })
}

import BookingModal from '@/components/booking/BookingModal.vue'
import BookingRecap from '@/components/booking/BookingRecap.vue'
import BookingTimeStep, { type RawDateAvailability, type TimeSlotSelection } from '@/components/booking/BookingTimeStep.vue'
import { fmt12Hour } from '~/shared/reservation-hours'
import BookingContactForm, { type ContactFormState } from '@/components/booking/BookingContactForm.vue'

const isBookingModalOpen = ref(false)
const isHydrated = ref(false)
onMounted(() => { isHydrated.value = true })
const bookingStep = ref(1)
const timeSelection = ref<TimeSlotSelection | null>(null)

function openBookingModal() {
  bookingStep.value = 1
  bookingError.value = null
}

function handleExperienceCtaClick() {
  if (experienceCta.value?.action === 'book') openBookingModal()
}

function nextStep() {
  if (bookingStep.value < 2) bookingStep.value++
}

function prevStep() {
  if (bookingStep.value > 1) bookingStep.value--
}

const modalTitle = computed(() => bookingStep.value === 1 ? t('saya.experience_detail.select_time') : t('saya.experience_detail.your_details'))

function handleContactSubmit(contactData: ContactFormState) {
  form.guest_name = contactData.name
  form.guest_email = contactData.email
  form.guest_phone = contactData.phone
  form.notes = contactData.notes
  submitBooking()
}

// ── Booking form ──────────────────────────────────────────────────────────────

const hasAnySlots = computed(() => Boolean(experience.value?.recurring_slots || experience.value?.time_slots?.length))
const availabilityDates = ref<RawDateAvailability[]>([])
const availabilityLoading = ref(false)

const form = reactive({
  guest_name: '',
  guest_email: '',
  guest_phone: '',
  party_size_num: 1, // Using number for the counter
  notes: '',
})

async function loadAvailability() {
  if (!siteId || !experience.value || !hasAnySlots.value) {
    availabilityDates.value = []
    return
  }
  availabilityLoading.value = true
  try {
    const today = new Date()
    const dateStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`
    const res = await $fetch<{ timezone: string; dates: RawDateAvailability[] }>(
      `/api/public/sites/${siteId}/experiences/${slug}/availability`,
      { query: { date: dateStr, days: 14 } },
    )
    availabilityDates.value = res.dates ?? []
  } catch {
    availabilityDates.value = []
  } finally {
    availabilityLoading.value = false
  }
}

watch(experience, () => loadAvailability())
onMounted(loadAvailability)

const submitting = ref(false)
const { mirrorSubmission } = useSiteConversionTracking()
const bookingError = ref<string | null>(null)

const canSubmit = computed(() =>
  form.guest_name.trim() &&
  form.guest_email.trim() &&
  Boolean(timeSelection.value),
)

async function submitBooking() {
  if (!canSubmit.value || !siteId || !timeSelection.value) return

  submitting.value = true
  bookingError.value = null
  try {
    const res = await $fetch<{ success: boolean; message: string; booking_id: string; cancellation_token: string; policy_summary?: ApiRecord | null }>(
      `/api/public/sites/${siteId}/experiences/${slug}/book`,
      {
        method: 'POST',
        body: {
          guest_name: form.guest_name.trim(),
          guest_email: form.guest_email.trim(),
          guest_phone: form.guest_phone.trim() || undefined,
          party_size: form.party_size_num,
          booking_date: timeSelection.value.day,
          time_slot: timeSelection.value.time,
          notes: form.notes.trim() || undefined,
        },
      },
    )
    isBookingModalOpen.value = false // Close modal

    setBookingConfirmation({
      type: 'experience',
      siteId,
      siteName: siteName.value,
      guestName: form.guest_name.trim(),
      policySummary: res.policy_summary ?? null,
      experienceId: experience.value?.id ?? null,
      title: experience.value?.title,
      date: timeSelection.value.day,
      time: timeSelection.value.time,
      guests: String(form.party_size_num),
      requests: form.notes.trim() || null,
      cancelUrl: `/experiences/cancel?id=${res.booking_id}#${res.cancellation_token}`,
      contactPhone: (experienceLocation.value as ApiRecord | null)?.phone ?? null,
      contactEmail: (experienceLocation.value as ApiRecord | null)?.email ?? null,
      locationId: (experienceLocation.value as ApiRecord | null)?.id ? String((experienceLocation.value as ApiRecord | null)?.id) : null,
      locationName: (experienceLocation.value as ApiRecord | null)?.title ?? null,
      locationSlug: typeof (experienceLocation.value as ApiRecord | null)?.slug === 'string' ? String((experienceLocation.value as ApiRecord | null)?.slug) : null,
      message: res.message,
    })
    mirrorSubmission('experience_booking_submit', (experienceLocation.value as ApiRecord | null)?.id ? String((experienceLocation.value as ApiRecord).id) : null)
    await navigateTo(localePath('/experiences/confirmed'))
  } catch (err: unknown) {
    const errorData = err && typeof err === 'object' && 'data' in err ? (err as Record<string, { error?: string }>).data : null
    bookingError.value = typeof errorData?.error === 'string' ? errorData.error : t('saya.experience_detail.booking_failed')
    // Availability can go stale between load and submit (another guest books the
    // last spot) — send the guest back to the time step rather than leaving them
    // stuck on the contact form with no way to see the now-invalid slot.
    if (err && typeof err === 'object' && 'statusCode' in err && (err as { statusCode?: number }).statusCode === 409) {
      bookingStep.value = 1
      timeSelection.value = null
      loadAvailability()
    }
  } finally {
    submitting.value = false
  }
}

// SEO + structured data
const seoTitle = computed(() => experience.value?.seo_title ?? (experience.value ? `${experience.value.title} | ${experienceCopy.value.experiencesPageTitle}` : t('saya.experience_detail.experience')))
const seoDescription = computed(() =>
  truncateForSeo(experience.value?.seo_description ?? experience.value?.tagline ?? t('saya.experience_detail.meta_description', { title: experience.value?.title ?? '' }), 160)
)

const { canonicalUrl } = useSocialMetadata(() => {
  return {
    path: experience.value?.canonical_url || `/experiences/${slug}`,
    title: seoTitle.value,
    description: seoDescription.value,
    label: t('saya.experience_detail.experience'),
    robots: experience.value?.robots || null,
    brand: {
      siteName: siteName.value,
    },
    socialImage: experience.value?.social_image ?? null,
  }
})
const resolvedCanonicalUrl = computed(() => canonicalUrl.value || `${siteUrl}/experiences/${slug}`)

useBreadcrumbSchema([
  { name: t('saya.experience_detail.home'), url: `${siteUrl}/` },
  { name: experienceCopy.value.experiencesPageTitle, url: `${siteUrl}/experiences` },
  { name: experience.value?.title ?? slug, url: resolvedCanonicalUrl.value },
])

// JSON-LD — @graph with WebPage + Product/Service + Organization
// Event entities are omitted until the booking system exposes real dated sessions
// (Google requires startDate for Event rich results; time_slots are times-only strings)
useHead({
  script: [
    {
      type: 'application/ld+json',
      innerHTML: () => {
        const val = experience.value
        if (!val) return '{}'

        const experienceUrl = resolvedCanonicalUrl.value
        const orgId = `${siteUrl}/#organization`
        const experienceId = `${experienceUrl}#experience`
        const currency = val.price?.currency || siteConfig.value?.default_currency || 'USD'

        // Preserve the canonical media order used by the page.
        const images = [
          ...mediaItems.value
            .map(item => item.kind === 'video' ? item.poster : item.url)
            .filter((url): url is string => Boolean(url)),
        ]

        const priceNum = val.price?.amount_minor != null
          ? Number(minorAmountToMajor(val.price.amount_minor, val.price.currency))
          : null

        // ISO 8601 duration from duration_minutes (e.g. 90 → PT1H30M)
        const duration = val.duration_minutes != null
          ? `PT${Math.floor(val.duration_minutes / 60)}H${val.duration_minutes % 60 > 0 ? `${val.duration_minutes % 60}M` : ''}`
          : undefined

        const additionalProperty = [
          ...(duration ? [{ '@type': 'PropertyValue', name: t('saya.experience_detail.duration'), value: duration }] : []),
          ...(val.max_capacity ? [{ '@type': 'PropertyValue', name: t('saya.experience_detail.capacity_label'), value: t('saya.experience_detail.capacity_max', { count: val.max_capacity }) }] : []),
        ]

        const offerNode = priceNum !== null
          ? {
              '@type': 'Offer',
              url: experienceUrl,
              price: priceNum,
              priceCurrency: currency,
              ...(val.price?.valid_until ? { priceValidUntil: val.price.valid_until } : {}),
              // Matches the same availability_state canonical mapping used for
              // the card badge/booking UI — see computeExperienceAvailabilitySummary.
              availability: (() => {
                switch (val.availability_state) {
                  case 'sold_out': return 'https://schema.org/SoldOut'
                  case 'full':
                  case 'no_slots':
                  case 'temporarily_unavailable': return 'https://schema.org/OutOfStock'
                  case 'limited': return 'https://schema.org/LimitedAvailability'
                  default: return 'https://schema.org/InStock'
                }
              })(),
              seller: { '@id': orgId },
              ...(val.max_capacity ? {
                eligibleQuantity: {
                  '@type': 'QuantitativeValue',
                  maxValue: val.max_capacity,
                  unitText: t('saya.experience_detail.guests'),
                },
              } : {}),
            }
          : undefined

        return JSON.stringify({
          '@context': 'https://schema.org',
          '@graph': [
            {
              '@type': 'WebPage',
              '@id': `${experienceUrl}#webpage`,
              url: experienceUrl,
              name: val.seo_title ?? `${val.title} | ${siteName.value}`,
              description: val.seo_description ?? val.tagline ?? undefined,
              inLanguage: locale.value,
              mainEntity: { '@id': experienceId },
            },
            {
              '@type': ['Product', 'Service'],
              '@id': experienceId,
              name: val.title,
              description: val.seo_description ?? val.tagline ?? undefined,
              ...(images.length > 0 ? { image: images } : {}),
              url: experienceUrl,
              brand: { '@id': orgId },
              provider: { '@id': orgId },
              ...(offerNode ? { offers: offerNode } : {}),
              ...(additionalProperty.length > 0 ? { additionalProperty } : {}),
            },
            {
              '@type': 'Organization',
              '@id': orgId,
              name: siteName.value,
              url: siteUrl,
            },
          ],
        })
      }
    },
  ],
})
</script>

<style scoped>
/* Hide the native scrollbar on the gallery track — arrows/dots + touch swipe
   are the intended controls, matching the previous UCarousel's look. */
.saya-carousel-track {
  scrollbar-width: none;
  -ms-overflow-style: none;
}
.saya-carousel-track::-webkit-scrollbar {
  display: none;
}
</style>
