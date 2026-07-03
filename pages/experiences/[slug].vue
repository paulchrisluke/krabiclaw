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
        v-if="experience.status !== 'sold_out'"
        class="lg:hidden fixed bottom-0 inset-x-0 z-30 flex items-center justify-between gap-4 border-t border-default bg-default/95 backdrop-blur-sm px-5 py-4 shadow-lg"
      >
        <div class="min-w-0">
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

            <div v-if="experience.cancellation_policy" class="mt-10 border-t border-default pt-10">
              <h2 class="text-xl font-semibold text-default mb-5">Cancellation policy</h2>
              <p class="whitespace-pre-line text-default leading-7">{{ experience.cancellation_policy }}</p>
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
                <!-- STEP 1: DATE -->
                <div v-if="bookingStep === 1">
                  <BookingDateSelector
                    v-model="form.booking_date_obj"
                  />
                  
                  <div v-if="bookingError" role="alert" class="mt-4 rounded-lg border border-red-500/30 bg-red-500/5 px-4 py-3 text-sm text-red-500">
                    {{ bookingError }}
                  </div>
                  
                  <div class="pt-6">
                    <button 
                      class="w-full py-3 px-4 rounded-xl text-white bg-black dark:bg-white dark:text-black font-semibold text-[15px] shadow-sm hover:opacity-90 transition-opacity disabled:opacity-50"
                      :disabled="!form.booking_date_obj"
                      @click="nextStep"
                    >
                      Next
                    </button>
                  </div>
                </div>

                <!-- STEP 2: TIME & GUESTS -->
                <div v-else-if="bookingStep === 2">
                  <BookingGuestCounter
                    v-model="form.party_size_num"
                    :max="experience.max_capacity ?? 20"
                    label="How many guests?"
                    class="mb-4"
                  />
                  
                  <div class="mb-4">
                    <h3 class="font-semibold text-default text-lg mb-2">Choose a time</h3>
                    
                    <div v-if="availabilityLoading" class="flex flex-col gap-2">
                      <div class="h-16 w-full animate-pulse rounded-xl bg-elevated" />
                      <div class="h-16 w-full animate-pulse rounded-xl bg-elevated" />
                    </div>
                    
                    <p v-else-if="slotAvailability.length === 0" class="text-sm text-muted">
                      No availability on this day — try another date.
                    </p>
                    
                    <BookingTimeList
                      v-else
                      v-model="form.time_slot"
                      :slots="formattedSlots"
                    />
                  </div>

                  <div class="pt-4">
                    <button 
                      class="w-full py-3 px-4 rounded-xl text-white bg-black dark:bg-white dark:text-black font-semibold text-[15px] shadow-sm hover:opacity-90 transition-opacity disabled:opacity-50"
                      :disabled="!form.time_slot || slotAvailability.length === 0"
                      @click="nextStep"
                    >
                      Next
                    </button>
                  </div>
                </div>

                <!-- STEP 3: CONTACT DETAILS -->
                <div v-else-if="bookingStep === 3">
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

definePageMeta({ key: (route) => route.fullPath })

const DOMPurify = import.meta.client ? (await import('isomorphic-dompurify')).default : { sanitize: (s: string) => s }

const route = useRoute()
const slug = route.params.slug as string
const { siteId, site } = useTenantSite()
const siteName = computed(() => (site as ApiValue)?.brand_name || (site as ApiValue)?.name || 'KrabiClaw')
const config = useRuntimeConfig()
const siteUrl = config.public.siteUrl

const { experienceDetail: experience, config: siteConfig, pending, locations } = useBootstrap()

const experienceLocation = computed(() => {
  const locId = (experience.value as ApiValue)?.location_id
  if (!locId) return null
  return (locations.value as ApiRecord[]).find((l: ApiRecord) => l.id === locId) ?? null
})

const locationAddress = computed(() => {
  const loc = experienceLocation.value as ApiRecord | null
  if (!loc?.address) return null
  if (typeof loc.address === 'string') return loc.address
  type Addr = { addressLines?: string[]; locality?: string; administrativeArea?: string }
  const addr = loc.address as Addr
  return [...(addr.addressLines ?? []), addr.locality, addr.administrativeArea].filter(Boolean).join(', ') || null
})
const currentPageUrl = useSeoUrl(() => `/experiences/${slug}`)
const ogImage = useSharedOgImage(() => experience.value?.image_url || (site as ApiValue)?.logo_url)

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
import BookingDateSelector from '@/components/booking/BookingDateSelector.vue'
import BookingGuestCounter from '@/components/booking/BookingGuestCounter.vue'
import BookingTimeList from '@/components/booking/BookingTimeList.vue'
import BookingContactForm, { type ContactFormState } from '@/components/booking/BookingContactForm.vue'

const isBookingModalOpen = ref(false)
const bookingStep = ref(1)

function openBookingModal() {
  bookingStep.value = 1
  bookingError.value = null
  isBookingModalOpen.value = true
}

function nextStep() {
  if (bookingStep.value < 3) bookingStep.value++
}

function prevStep() {
  if (bookingStep.value > 1) bookingStep.value--
}

const modalTitle = computed(() => {
  if (bookingStep.value === 1) return 'Select a date'
  if (bookingStep.value === 2) return 'Select a time'
  return 'Your details'
})

function handleContactSubmit(contactData: ContactFormState) {
  form.guest_name = contactData.name
  form.guest_email = contactData.email
  form.guest_phone = contactData.phone
  form.notes = contactData.notes
  submitBooking()
}

// Plain-Tailwind form styling — replaces UInput/UTextarea/USelect's default
// look now that this page no longer depends on Nuxt UI (see SayaFormField.vue).
const inputClass = 'block w-full rounded-lg border border-default bg-default px-3.5 py-2 text-sm text-default placeholder:text-muted focus:border-inverted focus:outline-none focus:ring-1 focus:ring-inverted disabled:opacity-60'


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

const clockNow = useState<number>(`experience-clock:${slug}`, () => Date.now())
let clockTimer: ReturnType<typeof setInterval> | null = null

function formatDateInTimeZone(date: Date, timeZone: string): string {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(date)

  const year = parts.find((part) => part.type === 'year')?.value
  const month = parts.find((part) => part.type === 'month')?.value
  const day = parts.find((part) => part.type === 'day')?.value

  if (!year || !month || !day) return date.toISOString().slice(0, 10)
  return `${year}-${month}-${day}`
}

interface SlotAvailabilityItem {
  time_slot: string
  capacity: number | null
  booked: number
  remaining: number | null
  is_closed: boolean
  is_full: boolean
}

const hasAnySlots = computed(() => Boolean(experience.value?.recurring_slots || experience.value?.time_slots?.length))
const availabilityInitialized = ref(false)
const slotAvailability = ref<SlotAvailabilityItem[]>([])
const availabilityTimezone = ref<string | null>(null)
const availabilityLoading = ref(false)

const bookingTimezone = computed(() =>
  availabilityTimezone.value ||
  siteConfig.value?.default_timezone ||
  'UTC',
)

const minDate = computed(() => {
  // Keep a reactive dependency so this recomputes while the page stays open.
  const now = new Date(clockNow.value)
  return formatDateInTimeZone(now, bookingTimezone.value)
})

const maxCap = computed(() => experience.value?.max_capacity ?? 20)
const partySizeOptions = computed(() =>
  Array.from({ length: maxCap.value }, (_, i) => ({ label: `${i + 1} guest${i > 0 ? 's' : ''}`, value: String(i + 1) })),
)

const form = reactive({
  guest_name: '',
  guest_email: '',
  guest_phone: '',
  party_size_num: 1, // Using number for the counter
  booking_date_obj: null as Date | null,
  time_slot: '',
  notes: '',
})

const formattedBookingDate = computed(() => {
  if (!form.booking_date_obj) return ''
  // Format as YYYY-MM-DD for the API
  const d = form.booking_date_obj
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const dStr = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${dStr}`
})

// Initialize booking_date_obj from minDate on first load and keep it from going stale across midnight
watch(minDate, (newDate) => {
  if (!form.booking_date_obj && newDate) {
    const p = newDate.split('-')
    if (p.length === 3) {
      form.booking_date_obj = new Date(parseInt(p[0] ?? '2000', 10), parseInt(p[1] ?? '1', 10) - 1, parseInt(p[2] ?? '1', 10))
    }
  }
}, { immediate: true })
onMounted(() => {
  clockTimer = setInterval(() => {
    clockNow.value = Date.now()
  }, 30_000)

  // booking_date_obj is initialized via the minDate watcher below — no extra init needed here
})
onUnmounted(() => {
  if (clockTimer) {
    clearInterval(clockTimer)
    clockTimer = null
  }
})

function slotCanAccommodateParty(slot: SlotAvailabilityItem): boolean {
  return !(slot.remaining !== null && slot.remaining < form.party_size_num)
}

function slotCanBeSelected(slot: SlotAvailabilityItem): boolean {
  return !slot.is_closed && !slot.is_full && slotCanAccommodateParty(slot)
}

const formattedSlots = computed(() => {
  return slotAvailability.value.map(s => {
    // Determine spots left string or number
    let spotsLeft = undefined
    if (s.is_closed || s.is_full) {
      spotsLeft = 0
    } else if (s.remaining !== null) {
      spotsLeft = s.remaining
    }
    
    // Check if it can accommodate the selected party size
    if (spotsLeft !== undefined && spotsLeft < form.party_size_num) {
      spotsLeft = 0 // Treat as sold out for this party size
    }

    return {
      id: s.time_slot,
      startTime: s.time_slot,
      durationMinutes: experience.value?.duration_minutes ?? null,
      priceStr: experience.value?.price ? `${experience.value.price} / guest` : undefined,
      spotsLeft
    }
  })
})

async function loadSlotAvailability() {
  const queryDate = formattedBookingDate.value
  if (!siteId || !experience.value || !queryDate || !hasAnySlots.value) {
    slotAvailability.value = []
    availabilityInitialized.value = true
    return
  }
  availabilityLoading.value = true
  try {
    const res = await $fetch<{ timezone: string; dates: Array<{ date: string; slots: SlotAvailabilityItem[] }> }>(
      `/api/public/sites/${siteId}/experiences/${slug}/availability`,
      { query: { date: queryDate } },
    )
    availabilityTimezone.value = res.timezone
    slotAvailability.value = res.dates[0]?.slots ?? []
    
    // Auto-select first available if current selection is invalid
    const currentValid = slotAvailability.value.find((s) => s.time_slot === form.time_slot && slotCanBeSelected(s))
    if (!currentValid) {
      form.time_slot = '' // Reset slot, forcing user to pick a new one
    }
  } catch {
    slotAvailability.value = []
  } finally {
    availabilityLoading.value = false
    availabilityInitialized.value = true
  }
}

watch(formattedBookingDate, loadSlotAvailability)
watch(experience, () => loadSlotAvailability())
onMounted(loadSlotAvailability)

const submitting = ref(false)
const bookingError = ref<string | null>(null)

const canSubmit = computed(() =>
  form.guest_name.trim() &&
  form.guest_email.trim() &&
  formattedBookingDate.value &&
  form.time_slot,
)

async function submitBooking() {
  if (!canSubmit.value || !siteId) return

  if (hasAnySlots.value) {
    const selectedSlot = slotAvailability.value.find((slot) => slot.time_slot === form.time_slot)
    if (!selectedSlot || !slotCanBeSelected(selectedSlot)) {
      bookingError.value = 'Selected time slot is no longer available for this party size. Please choose another slot.'
      bookingStep.value = 2 // Go back to time slot selection
      return
    }
  }

  submitting.value = true
  bookingError.value = null
  try {
    const res = await $fetch<{ success: boolean; message: string }>(
      `/api/public/sites/${siteId}/experiences/${slug}/book`,
      {
        method: 'POST',
        body: {
          guest_name: form.guest_name.trim(),
          guest_email: form.guest_email.trim(),
          guest_phone: form.guest_phone.trim() || undefined,
          party_size: form.party_size_num,
          booking_date: formattedBookingDate.value,
          time_slot: form.time_slot,
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
      title: experience.value?.title,
      date: formattedBookingDate.value,
      time: form.time_slot,
      guests: String(form.party_size_num),
      requests: form.notes.trim() || null,
      contactPhone: (experienceLocation.value as ApiRecord | null)?.phone ?? null,
      contactEmail: (experienceLocation.value as ApiRecord | null)?.email ?? null,
      message: res.message,
    })
    await navigateTo('/experiences/confirmed')
  } catch (err: unknown) {
    const errorData = err && typeof err === 'object' && 'data' in err ? (err as Record<string, { error?: string }>).data : null
    bookingError.value = typeof errorData?.error === 'string' ? errorData.error : 'Something went wrong. Please try again.'
  } finally {
    submitting.value = false
  }
}

// SEO + structured data
useBreadcrumbSchema([
  { name: 'Home', url: `${siteUrl}/` },
  { name: 'Experiences', url: `${siteUrl}/experiences` },
  { name: experience.value?.title ?? slug, url: `${siteUrl}/experiences/${slug}` },
])

const seoTitle = computed(() => experience.value?.seo_title ?? (experience.value ? `${experience.value.title} | Experiences` : 'Experience'))
const seoDescription = computed(() =>
  truncateForSeo(experience.value?.seo_description ?? experience.value?.tagline ?? `Book the ${experience.value?.title} experience.`, 160)
)

useSeoMeta({
  title: seoTitle,
  description: seoDescription,
  ogTitle: seoTitle,
  ogDescription: seoDescription,
  ogSiteName: () => siteName.value,
  twitterTitle: seoTitle,
  twitterDescription: seoDescription,
  ogUrl: currentPageUrl,
  ogType: 'website',
  ogImage,
})

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

        const experienceUrl = `${siteUrl}/experiences/${val.slug}`
        const orgId = `${siteUrl}/#organization`
        const experienceId = `${experienceUrl}#experience`
        const currency = siteConfig.value?.default_currency || 'THB'

        // Collect all image URLs in order: primary, then gallery images
        const images = [
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
              availability: val.status === 'sold_out'
                ? 'https://schema.org/SoldOut'
                : 'https://schema.org/InStock',
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
