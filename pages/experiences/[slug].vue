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
      <h1 class="text-2xl font-semibold text-default">Experience not found</h1>
      <p class="mt-3 text-muted">This experience may no longer be available.</p>
      <NuxtLink to="/experiences" class="mt-6 inline-flex items-center rounded-full bg-muted px-5 py-2.5 text-sm font-medium text-default no-underline transition hover:bg-elevated">View all experiences</NuxtLink>
    </div>

    <div v-else>

      <!-- ── Mobile sticky bottom CTA ───────────────────────── -->
      <div
        v-if="experience.status !== 'sold_out' && !experienceLocationClosureMessage && !noBookableSlotsMessage"
        class="lg:hidden fixed bottom-0 inset-x-0 z-30 flex items-center justify-between gap-4 border-t border-default bg-default/95 backdrop-blur-sm px-5 py-4 shadow-lg"
      >
        <div class="min-w-0">
          <p v-if="experienceIsOnSale" class="text-xs text-muted line-through">{{ experienceCompareAtPrice }}</p>
          <p v-if="experience.price" class="font-semibold text-default leading-tight">{{ experience.price }}</p>
          <p class="text-xs text-muted">per person</p>
        </div>
        <SayaButton class="shrink-0" @click="openBookingModal">
          Reserve Now
        </SayaButton>
      </div>

      <!-- ── Main layout ────────────────────────────────────── -->
      <section class="mx-auto max-w-7xl px-4 pt-10 pb-28 lg:pb-10 sm:px-6 lg:px-8">

        <!-- Breadcrumb -->
        <nav class="mb-8 flex items-center gap-2 text-xs text-muted">
          <NuxtLink to="/" class="hover:text-default transition-colors">Home</NuxtLink>
          <SayaIcon name="chevron-right" class="size-3.5" />
          <NuxtLink to="/experiences" class="hover:text-default transition-colors">Experiences</NuxtLink>
          <SayaIcon name="chevron-right" class="size-3.5" />
          <span class="text-default">{{ experience.title }}</span>
        </nav>

        <div class="grid gap-10 lg:grid-cols-[1fr_420px] lg:items-start">

          <!-- ── LEFT: Gallery + Content ───────────────────── -->
          <div class="min-w-0">

            <!-- Gallery: desktop grid (up to 4 items) / mobile hero + "show all" -->
            <div class="rounded-xl overflow-hidden">

              <!-- No media placeholder -->
              <div v-if="mediaItems.length === 0" class="flex aspect-4/3 items-center justify-center bg-muted">
                <SayaIcon name="sparkles" class="size-16 text-dimmed" />
              </div>

              <!-- Single image / video -->
              <div
                v-else-if="mediaItems.length === 1"
                class="relative aspect-4/3 lg:h-[520px] overflow-hidden"
                :class="mediaItems[0]?.kind === 'image' ? 'cursor-zoom-in' : ''"
                @click="mediaItems[0]?.kind === 'image' && openLightbox(0)"
              >
                <video
                  v-if="mediaItems[0]?.kind === 'video'"
                  :src="mediaItems[0]?.url"
                  autoplay muted loop playsinline
                  class="h-full w-full object-cover"
                />
                <img
                  v-else
                  :src="mediaItems[0]?.url"
                  :alt="experience.title"
                  class="h-full w-full object-cover"
                />
              </div>

              <!-- 2+ items — grid on all screen sizes -->
              <div v-else>
                <div
                  class="grid gap-1 h-[360px] sm:h-[440px] lg:h-[520px]"
                  :class="mediaItems.length === 2 ? 'grid-cols-2' : 'grid-cols-2 grid-rows-2'"
                >
                  <!-- Hero — spans 2 rows when 3+ items -->
                  <div
                    class="relative overflow-hidden"
                    :class="[
                      mediaItems.length >= 3 ? 'row-span-2' : '',
                      mediaItems[0]?.kind === 'image' ? 'cursor-zoom-in' : ''
                    ]"
                    @click="mediaItems[0]?.kind === 'image' && openLightbox(0)"
                  >
                    <video
                      v-if="mediaItems[0]?.kind === 'video'"
                      :src="mediaItems[0]?.url"
                      autoplay muted loop playsinline
                      class="h-full w-full object-cover"
                    />
                    <img
                      v-else
                      :src="mediaItems[0]?.url"
                      :alt="experience.title"
                      class="h-full w-full object-cover transition-transform duration-300 hover:scale-[1.02]"
                    />
                  </div>

                  <!-- Thumbnails 2–4 -->
                  <div
                    v-for="(item, i) in mediaItems.slice(1, 4)"
                    :key="item.url"
                    class="relative overflow-hidden"
                    :class="item.kind === 'image' ? 'cursor-zoom-in' : ''"
                    @click="item.kind === 'image' && openLightbox(i + 1)"
                  >
                    <video
                      v-if="item.kind === 'video'"
                      :src="item.url"
                      autoplay muted loop playsinline
                      class="h-full w-full object-cover"
                    />
                    <img
                      v-else
                      :src="item.url"
                      :alt="experience.title"
                      class="h-full w-full object-cover transition-transform duration-300 hover:scale-[1.02]"
                    />
                    <!-- "Show all" overlay only on last thumbnail when extras exist -->
                    <button
                      v-if="i === 2 && mediaItems.length > 4"
                      type="button"
                      class="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-black/50 text-white text-sm font-semibold backdrop-blur-[2px] hover:bg-black/60 transition-colors"
                      @click.stop="openLightbox(0)"
                    >
                      <SayaIcon name="squares-2x2" class="size-5" />
                      Show all {{ mediaItems.length }} photos
                    </button>
                  </div>
                </div>
              </div>

            </div>


            <!-- Lightbox -->
            <SayaLightbox v-model:open="lightboxOpen" v-model:index="lightboxIdx" :items="imageItems" :title="experience.title">
              <template v-if="experience.tagline" #caption>
                <p class="text-sm text-white/80">{{ experience.tagline }}</p>
              </template>
            </SayaLightbox>

            <!-- Mobile: title + key facts (hidden on desktop) -->
            <div class="mt-7 lg:hidden space-y-4">
              <div>
                <p class="saya-kicker mb-2">Experience</p>
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
                  Up to {{ experience.max_capacity }} guests
                </span>
                <span
                  v-if="experience.available_note"
                  class="inline-flex items-center gap-1.5 rounded-full border border-default bg-elevated px-3 py-1 text-xs font-medium text-muted"
                >
                  <SayaIcon name="calendar-days" class="size-3.5" />
                  {{ experience.available_note }}
                </span>
              </div>
            </div>

            <!-- What you'll do (body) -->
            <div v-if="experience.body" class="mt-10 border-t border-default pt-10">
              <h2 class="text-xl font-semibold text-default mb-6">What you'll do</h2>
              <!-- eslint-disable vue/no-v-html -->
              <div class="prose prose-lg max-w-none text-default" v-html="sanitizedBody" />
              <!-- eslint-enable vue/no-v-html -->
            </div>

            <div v-if="experience.highlights?.length" class="mt-10 border-t border-default pt-10">
              <h2 class="text-xl font-semibold text-default mb-6">Highlights</h2>
              <ul class="space-y-3 text-default">
                <li v-for="item in experience.highlights" :key="item" class="flex items-start gap-3">
                  <SayaIcon name="sparkles" class="mt-0.5 size-4 shrink-0 text-primary" />
                  <span>{{ item }}</span>
                </li>
              </ul>
            </div>

            <div v-if="experience.included_items?.length" class="mt-10 border-t border-default pt-10">
              <h2 class="text-xl font-semibold text-default mb-6">What's included</h2>
              <ul class="space-y-3 text-default">
                <li v-for="item in experience.included_items" :key="item" class="flex items-start gap-3">
                  <SayaIcon name="check-circle" class="mt-0.5 size-4 shrink-0 text-primary" />
                  <span>{{ item }}</span>
                </li>
              </ul>
            </div>

            <div v-if="experience.what_to_bring?.length" class="mt-10 border-t border-default pt-10">
              <h2 class="text-xl font-semibold text-default mb-6">What to bring</h2>
              <ul class="space-y-3 text-default">
                <li v-for="item in experience.what_to_bring" :key="item" class="flex items-start gap-3">
                  <SayaIcon name="briefcase" class="mt-0.5 size-4 shrink-0 text-primary" />
                  <span>{{ item }}</span>
                </li>
              </ul>
            </div>

            <div v-if="experience.meeting_point" class="mt-10 border-t border-default pt-10">
              <h2 class="text-xl font-semibold text-default mb-5">Meeting point</h2>
              <p class="whitespace-pre-line text-default leading-7">{{ experience.meeting_point }}</p>
            </div>

            <div v-if="experiencePolicySummary" class="mt-10 border-t border-default pt-10">
              <h2 class="text-xl font-semibold text-default mb-5">{{ experiencePolicySummary.heading }}</h2>
              <ol class="space-y-4">
                <li v-for="(item, index) in experiencePolicySummary.items" :key="item.id" class="flex gap-4 text-default">
                  <span class="flex size-7 shrink-0 items-center justify-center rounded-full border border-default bg-elevated text-sm">{{ index + 1 }}</span>
                  <span class="leading-7">{{ item.text }}</span>
                </li>
              </ol>
              <div v-if="experiencePolicySummary.additional_notes_html" class="mt-5 text-sm leading-7 text-muted">
                <!-- eslint-disable-next-line vue/no-v-html -->
                <div v-html="experiencePolicySummary.additional_notes_html" />
              </div>
            </div>

            <!-- Where you'll meet -->
            <div v-if="experienceLocation" class="mt-10 border-t border-default pt-10">
              <h2 class="text-xl font-semibold text-default mb-5">Where you'll meet</h2>
              <div class="rounded-xl border border-default bg-elevated overflow-hidden">
                <div class="p-6 flex items-start gap-4">
                  <SayaIcon name="map-pin" class="mt-0.5 size-5 shrink-0 text-primary" />
                  <div class="min-w-0">
                    <p class="font-semibold text-default">{{ (experienceLocation as ApiRecord).title }}</p>
                    <p v-if="locationAddress" class="mt-1 text-sm text-muted">{{ locationAddress }}</p>
                    <p v-if="(experienceLocation as ApiRecord).phone" class="mt-1 text-sm text-muted">
                      {{ (experienceLocation as ApiRecord).phone }}
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
                      Open in Maps
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
          <div class="lg:sticky lg:top-8">
            <div class="rounded-xl border border-default bg-elevated p-6 shadow-sm space-y-5">

              <!-- Title + tagline (desktop only) -->
              <div class="hidden lg:block">
                <p class="saya-kicker mb-2">Experience</p>
                <h1 class="text-2xl font-bold leading-tight text-default">{{ experience.title }}</h1>
                <p v-if="experience.tagline" class="mt-1.5 text-sm text-muted">{{ experience.tagline }}</p>
              </div>

              <!-- Price -->
              <div v-if="experience.price" class="hidden lg:flex items-baseline gap-1.5">
                <span v-if="experienceIsOnSale" class="text-lg text-muted line-through">{{ experienceCompareAtPrice }}</span>
                <span class="text-2xl font-bold text-default">{{ experience.price }}</span>
                <span class="text-sm text-muted">per person</span>
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
                  Up to {{ experience.max_capacity }} guests
                </span>
                <span
                  v-if="experience.available_note"
                  class="inline-flex items-center gap-1.5 rounded-full border border-default bg-default px-3 py-1 text-xs font-medium text-muted"
                >
                  <SayaIcon name="calendar-days" class="size-3.5" />
                  {{ experience.available_note }}
                </span>
              </div>

              <!-- Sold out -->
              <div
                v-if="experience.status === 'sold_out'"
                class="rounded-lg bg-red-50 dark:bg-red-950/30 px-4 py-3 text-sm font-medium text-red-600 dark:text-red-400 text-center"
              >
                This experience is currently sold out.
              </div>

              <!-- Location closed (e.g. renovations) -->
              <div
                v-else-if="experienceLocationClosureMessage"
                class="rounded-lg bg-amber-50 dark:bg-amber-950/30 px-4 py-3 text-sm font-medium text-amber-700 dark:text-amber-400 text-center"
              >
                {{ experienceLocationClosureMessage }}
              </div>

              <!-- Inquiry-only (no price and/or no schedule) — links to /contact
                   with the experience pre-filled, instead of a dead-end message. -->
              <div v-else-if="isInquiryOnly" class="pt-2">
                <SayaButton block :to="contactUrl">
                  Contact Us
                </SayaButton>
              </div>

              <!-- No bookable slots — never shows a misleading free-text time
                   field; only a clear "not currently bookable" message. -->
              <div
                v-else-if="noBookableSlotsMessage"
                class="rounded-lg bg-amber-50 dark:bg-amber-950/30 px-4 py-3 text-sm font-medium text-amber-700 dark:text-amber-400 text-center"
              >
                {{ noBookableSlotsMessage }}
              </div>

              <!-- Booking Button (Desktop) -->
              <div v-else class="pt-2">
                <SayaButton block @click="openBookingModal">
                  Reserve Now
                </SayaButton>
              </div>

              <!-- Booking Modal Flow -->
              <BookingModal
                v-model="isBookingModalOpen"
                :title="modalTitle"
                :can-go-back="bookingStep > 1 && !submitting"
                @back="prevStep"
              >
                <!-- STEP 1: TIME (party size + day-grouped availability, single scrollable surface) -->
                <div v-if="bookingStep === 1" class="flex flex-1 flex-col min-h-0">
                  <BookingTimeStep
                    v-model="timeSelection"
                    :dates="availabilityDates"
                    :loading="availabilityLoading"
                    :guests="form.party_size_num"
                    :guests-max="experience.max_capacity ?? 8"
                    guests-label="Guests"
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
                    :meta-line="`${form.party_size_num} ${form.party_size_num === 1 ? 'guest' : 'guests'}`"
                    @edit="bookingStep = 1"
                  />
                  <div v-if="bookingError" role="alert" class="mb-4 rounded-lg border border-red-500/30 bg-red-500/5 px-4 py-3 text-sm text-red-500">
                    {{ bookingError }}
                  </div>
                  <BookingContactForm
                    :initial-state="{ name: form.guest_name, email: form.guest_email, phone: form.guest_phone, notes: form.notes }"
                    :loading="submitting"
                    submit-text="Confirm booking"
                    @submit="handleContactSubmit"
                  />
                </div>
              </BookingModal>

            </div>
          </div>

        </div>
      </section>

    </div>

  </NuxtLayout>
</template>

<script setup lang="ts">
import { setBookingConfirmation } from '~/composables/useBookingHandoff'
import { getActiveSpecialClosure, formatClosureMessage } from '~/utils/formatters'
import { formatMoneyAmount, isSaleActive } from '~/shared/money'

definePageMeta({ key: (route) => route.fullPath })

const DOMPurify = import.meta.client ? (await import('isomorphic-dompurify')).default : { sanitize: (s: string) => s }

const route = useRoute()
const slug = route.params.slug as string
const { siteId, site } = useTenantSite()
const siteName = computed(() => (site as ApiValue)?.brand_name || (site as ApiValue)?.name || 'KrabiClaw')
const config = useRuntimeConfig()
const siteUrl = config.public.siteUrl

const { experienceDetail: experience, config: siteConfig, pending, locations, experiencePolicyById } = useBootstrap()

const experienceIsOnSale = computed(() => isSaleActive((experience.value as ApiValue) ?? {}))
const experienceCompareAtPrice = computed(() =>
  formatMoneyAmount((experience.value as ApiValue)?.compare_at_price_amount, siteConfig.value?.default_currency || 'THB')
)

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

// availability_state is derived server-side from real slots/bookings/overrides
// (see computeExperienceAvailabilitySummary) — 'full'/'no_slots'/'inquiry_only'
// mean there's nothing bookable right now, so the CTA/booking button is
// replaced with a clear message instead of opening a modal with no real slots.
const noBookableSlotsMessage = computed(() => {
  switch ((experience.value as ApiValue)?.availability_state) {
    case 'full': return 'Fully booked for the next few weeks. Please check back later.'
    case 'no_slots': return 'This experience has no scheduled times right now.'
    case 'inquiry_only': return 'Contact us to arrange a booking for this experience.'
    default: return null
  }
})

const isInquiryOnly = computed(() => (experience.value as ApiValue)?.availability_state === 'inquiry_only')

const contactUrl = computed(() => {
  const exp = experience.value as ApiValue
  if (!exp?.id) return '/contact'
  const params = new URLSearchParams({ experienceId: exp.id, experienceTitle: exp.title ?? '' })
  return `/contact?${params.toString()}`
})

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

// Media items for carousel - supports both images and videos
const mediaItems = computed(() => {
  const exp = experience.value
  if (!exp) return []

  const items: Array<{ url: string; kind: 'image' | 'video' }> = []

  // Add primary image/video
  if (exp.image_url) {
    items.push({ url: exp.image_url, kind: 'image' })
  }
  if (exp.video_url) {
    items.push({ url: exp.video_url, kind: 'video' })
  }

  // Add additional images/videos if they exist in the data
  if (exp.images && Array.isArray(exp.images)) {
    type ExperienceMedia = { url?: string; kind?: string }
    exp.images.forEach((img) => {
      const media = img as ExperienceMedia
      if (media.url && !items.find(i => i.url === media.url)) {
        items.push({ url: media.url, kind: media.kind === 'video' ? 'video' : 'image' })
      }
    })
  }

  return items
})

function formatDuration(minutes: number): string {
  if (minutes < 60) return `${minutes} min`
  const h = Math.floor(minutes / 60)
  const m = minutes % 60
  return m ? `${h} hr ${m} min` : `${h} hr`
}

import BookingModal from '@/components/booking/BookingModal.vue'
import BookingRecap from '@/components/booking/BookingRecap.vue'
import BookingTimeStep, { type RawDateAvailability, type TimeSlotSelection } from '@/components/booking/BookingTimeStep.vue'
import { fmt12Hour } from '~/shared/reservation-hours'
import BookingContactForm, { type ContactFormState } from '@/components/booking/BookingContactForm.vue'

const isBookingModalOpen = ref(false)
const bookingStep = ref(1)
const timeSelection = ref<TimeSlotSelection | null>(null)

function openBookingModal() {
  bookingStep.value = 1
  bookingError.value = null
  isBookingModalOpen.value = true
}

function nextStep() {
  if (bookingStep.value < 2) bookingStep.value++
}

function prevStep() {
  if (bookingStep.value > 1) bookingStep.value--
}

const modalTitle = computed(() => bookingStep.value === 1 ? 'Select a time' : 'Your details')

function handleContactSubmit(contactData: ContactFormState) {
  form.guest_name = contactData.name
  form.guest_email = contactData.email
  form.guest_phone = contactData.phone
  form.notes = contactData.notes
  submitBooking()
}

// ── Lightbox ──────────────────────────────────────────────────────────────────

const imageItems = computed(() => mediaItems.value.filter(i => i.kind === 'image'))
const lightboxOpen = ref(false)
const lightboxIdx = ref(0)

function openLightbox(mediaIdx: number) {
  const item = mediaItems.value[mediaIdx]
  if (!item) return
  const imgIdx = imageItems.value.findIndex(i => i.url === item.url)
  lightboxIdx.value = imgIdx >= 0 ? imgIdx : 0
  lightboxOpen.value = true
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
      sitePolicySummary: res.policy_summary ?? null,
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
    await navigateTo('/experiences/confirmed')
  } catch (err: unknown) {
    const errorData = err && typeof err === 'object' && 'data' in err ? (err as Record<string, { error?: string }>).data : null
    bookingError.value = typeof errorData?.error === 'string' ? errorData.error : 'Something went wrong. Please try again.'
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
const seoTitle = computed(() => experience.value?.seo_title ?? (experience.value ? `${experience.value.title} | Experiences` : 'Experience'))
const seoDescription = computed(() =>
  truncateForSeo(experience.value?.seo_description ?? experience.value?.tagline ?? `Book the ${experience.value?.title} experience.`, 160)
)

const { canonicalUrl } = useTenantSocialMetadata(() => {
  const heroImageUrl = experience.value?.og_image_public_url || experience.value?.image_url || null
  return {
    path: experience.value?.canonical_url || `/experiences/${slug}`,
    title: seoTitle.value,
    description: seoDescription.value,
    label: 'Experience',
    robots: experience.value?.robots || null,
    brand: {
      siteName: siteName.value,
      logoUrl: siteConfig.value?.logo_url || null,
      faviconUrl: siteConfig.value?.favicon_url || null,
      primaryColor: siteConfig.value?.brand_color || null,
    },
    heroImage: heroImageUrl ? { url: heroImageUrl } : null,
  }
})
const resolvedCanonicalUrl = computed(() => canonicalUrl.value || `${siteUrl}/experiences/${slug}`)

useBreadcrumbSchema([
  { name: 'Home', url: `${siteUrl}/` },
  { name: 'Experiences', url: `${siteUrl}/experiences` },
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
        const currency = siteConfig.value?.default_currency || 'THB'

        // Collect all image URLs in order: og override, then primary, then gallery images
        const images = [
          ...(val.og_image_public_url ? [val.og_image_public_url] : []),
          ...(val.image_url ? [val.image_url] : []),
          ...(Array.isArray(val.images)
            ? val.images.filter((i: { kind?: string }) => i.kind !== 'video').map((i: { url: string }) => i.url)
            : []),
        ]

        // Use price_amount (canonical numeric) directly; fall back to parsing price string for legacy rows
        const priceNum = val.price_amount != null
          ? val.price_amount
          : (() => {
              const raw = val.price ? parseFloat(val.price.replace(/[^0-9.]/g, '')) : NaN
              return Number.isFinite(raw) ? raw : null
            })()

        // ISO 8601 duration from duration_minutes (e.g. 90 → PT1H30M)
        const duration = val.duration_minutes != null
          ? `PT${Math.floor(val.duration_minutes / 60)}H${val.duration_minutes % 60 > 0 ? `${val.duration_minutes % 60}M` : ''}`
          : undefined

        const additionalProperty = [
          ...(duration ? [{ '@type': 'PropertyValue', name: 'Duration', value: duration }] : []),
          ...(val.max_capacity ? [{ '@type': 'PropertyValue', name: 'Capacity', value: `${val.max_capacity} guests max` }] : []),
        ]

        const offerNode = priceNum !== null
          ? {
              '@type': 'Offer',
              url: experienceUrl,
              price: priceNum,
              priceCurrency: currency,
              ...(isSaleActive(val) && val.sale_ends_at ? { priceValidUntil: val.sale_ends_at } : {}),
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
                  unitText: 'guests',
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
              inLanguage: 'en',
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
