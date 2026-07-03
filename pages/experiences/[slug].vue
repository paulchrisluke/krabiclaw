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
        <SayaButton class="shrink-0" @click="scrollToBooking">
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

            <!-- Gallery -->
            <div class="rounded-xl bg-muted overflow-hidden">
              <div v-if="mediaItems.length > 1" class="relative lg:h-120">
                <div
                  ref="carouselTrack"
                  class="saya-carousel-track flex h-full snap-x snap-mandatory overflow-x-auto scroll-smooth"
                  @scroll="onCarouselScroll"
                >
                  <div
                    v-for="(item, index) in mediaItems"
                    :key="item.url"
                    class="relative aspect-4/3 lg:aspect-auto lg:h-120 w-full shrink-0 snap-center overflow-hidden cursor-zoom-in"
                    @click="item.kind === 'image' && openLightbox(index)"
                  >
                    <video
                      v-if="item.kind === 'video'"
                      :src="item.url"
                      autoplay
                      muted
                      loop
                      playsinline
                      class="h-full w-full object-contain"
                    />
                    <img
                      v-else
                      :src="item.url"
                      :alt="experience.title"
                      class="h-full w-full object-contain"
                    />
                  </div>
                </div>
                <button
                  type="button"
                  class="absolute left-2 top-1/2 flex size-9 -translate-y-1/2 items-center justify-center rounded-full bg-default/80 text-default shadow backdrop-blur-sm transition hover:bg-default disabled:opacity-40"
                  aria-label="Previous slide"
                  :disabled="carouselIndex === 0"
                  @click="scrollCarousel(-1)"
                >
                  <SayaIcon name="chevron-left" class="size-5" />
                </button>
                <button
                  type="button"
                  class="absolute right-2 top-1/2 flex size-9 -translate-y-1/2 items-center justify-center rounded-full bg-default/80 text-default shadow backdrop-blur-sm transition hover:bg-default disabled:opacity-40"
                  aria-label="Next slide"
                  :disabled="carouselIndex === mediaItems.length - 1"
                  @click="scrollCarousel(1)"
                >
                  <SayaIcon name="chevron-right" class="size-5" />
                </button>
                <div class="absolute bottom-3 left-1/2 flex -translate-x-1/2 gap-1.5">
                  <button
                    v-for="(item, index) in mediaItems"
                    :key="`dot-${item.url}`"
                    type="button"
                    class="size-1.5 rounded-full transition"
                    :class="carouselIndex === index ? 'bg-default' : 'bg-default/40'"
                    :aria-label="`Go to slide ${index + 1}`"
                    @click="scrollToSlide(index)"
                  />
                </div>
              </div>
              <div
                v-else-if="mediaItems.length === 1"
                class="relative aspect-4/3 lg:aspect-auto lg:h-120 overflow-hidden"
                :class="mediaItems[0]?.kind === 'image' ? 'cursor-zoom-in' : ''"
                @click="mediaItems[0]?.kind === 'image' && openLightbox(0)"
              >
                <video
                  v-if="mediaItems[0]?.kind === 'video'"
                  :src="mediaItems[0]?.url"
                  autoplay
                  muted
                  loop
                  playsinline
                  class="h-full w-full object-contain"
                />
                <img
                  v-else
                  :src="mediaItems[0]?.url"
                  :alt="experience.title"
                  class="h-full w-full object-contain"
                />
              </div>
              <div v-else class="flex aspect-4/3 lg:h-120 items-center justify-center">
                <SayaIcon name="sparkles" class="size-16 text-dimmed" />
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

              <!-- Booking form -->
              <div v-else id="booking" class="space-y-4">
                <form class="space-y-4" @submit.prevent="submitBooking">
                  <!-- Date + party size row -->
                  <div class="grid grid-cols-2 gap-3">
                    <SayaFormField v-slot="{ id }" label="Date" name="booking_date" required>
                      <input :id="id" v-model="form.booking_date" type="date" :min="minDate" :disabled="submitting" :class="inputClass" />
                    </SayaFormField>
                    <SayaFormField v-slot="{ id }" label="Guests" name="party_size" required>
                      <select :id="id" v-model="form.party_size" :disabled="submitting" :class="inputClass">
                        <option v-for="opt in partySizeOptions" :key="opt.value" :value="opt.value">{{ opt.label }}</option>
                      </select>
                    </SayaFormField>
                  </div>

                  <!-- Time slots -->
                  <SayaFormField v-if="hasAnySlots" label="Choose a time slot" name="time_slot" required>
                    <div v-if="!availabilityInitialized || availabilityLoading" class="flex flex-wrap gap-2">
                      <div class="h-10 w-20 animate-pulse rounded-lg bg-elevated" />
                      <div class="h-10 w-20 animate-pulse rounded-lg bg-elevated" />
                    </div>
                    <p v-else-if="slotAvailability.length === 0" class="text-sm text-muted">
                      No availability on this day — try another date.
                    </p>
                    <div v-else class="flex flex-wrap gap-2">
                      <button
                        v-for="slot in slotAvailability"
                        :key="slot.time_slot"
                        type="button"
                        :class="[
                          'rounded-lg border px-4 py-2 text-sm font-medium transition-colors',
                          form.time_slot === slot.time_slot
                            ? 'border-primary bg-primary text-white'
                            : slot.is_closed || slot.is_full || (slot.remaining !== null && slot.remaining < Number(form.party_size))
                              ? 'border-default bg-muted text-dimmed cursor-not-allowed opacity-60'
                              : 'border-default bg-default text-default hover:border-primary hover:text-primary'
                        ]"
                        :disabled="submitting || slot.is_closed || slot.is_full || (slot.remaining !== null && slot.remaining < Number(form.party_size))"
                        @click="form.time_slot = slot.time_slot"
                      >
                        {{ slot.time_slot }}
                        <span v-if="!slot.is_closed && slot.remaining !== null && slot.remaining <= 3 && slot.remaining > 0" class="ml-1 text-xs opacity-80">
                          ({{ slot.remaining }} left)
                        </span>
                      </button>
                    </div>
                    <p v-if="availabilityTimezone" class="mt-2 text-xs text-muted">Times shown in {{ availabilityTimezone }}.</p>
                  </SayaFormField>
                  <SayaFormField v-else v-slot="{ id }" label="Preferred Time" name="time_slot" required>
                    <input :id="id" v-model="form.time_slot" placeholder="e.g. 10:00" :disabled="submitting" :class="inputClass" />
                  </SayaFormField>

                  <!-- Name + email -->
                  <SayaFormField v-slot="{ id }" label="Your Name" name="guest_name" required>
                    <input :id="id" v-model="form.guest_name" placeholder="Full name" :disabled="submitting" :class="inputClass" />
                  </SayaFormField>
                  <SayaFormField v-slot="{ id }" label="Email Address" name="guest_email" required>
                    <input :id="id" v-model="form.guest_email" type="email" placeholder="you@email.com" :disabled="submitting" :class="inputClass" />
                  </SayaFormField>
                  <SayaFormField v-slot="{ id }" label="Phone (optional)" name="guest_phone">
                    <input :id="id" v-model="form.guest_phone" type="tel" placeholder="+66 81 234 5678" :disabled="submitting" :class="inputClass" />
                  </SayaFormField>
                  <SayaFormField v-slot="{ id }" label="Special requests (optional)" name="notes">
                    <textarea :id="id" v-model="form.notes" placeholder="Dietary requirements, celebrations, anything we should know…" rows="2" :disabled="submitting" :class="inputClass" />
                  </SayaFormField>

                  <div v-if="bookingError" role="alert" class="rounded-lg border border-red-500/30 bg-red-500/5 px-4 py-3 text-sm text-red-500">
                    {{ bookingError }}
                  </div>

                  <SayaButton type="submit" block :disabled="!canSubmit" :loading="submitting">
                    Reserve Now
                  </SayaButton>
                </form>
              </div>

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

function scrollToBooking() {
  document.getElementById('booking')?.scrollIntoView({ behavior: 'smooth', block: 'start' })
}

// Plain-Tailwind form styling — replaces UInput/UTextarea/USelect's default
// look now that this page no longer depends on Nuxt UI (see SayaFormField.vue).
const inputClass = 'block w-full rounded-lg border border-default bg-default px-3.5 py-2 text-sm text-default placeholder:text-muted focus:border-inverted focus:outline-none focus:ring-1 focus:ring-inverted disabled:opacity-60'

// ── Gallery carousel ────────────────────────────────────────────────────────
// Native scroll-snap replaces UCarousel/embla — mobile swipe works for free,
// arrows/dots just scroll the track programmatically.
const carouselTrack = ref<HTMLElement | null>(null)
const carouselIndex = ref(0)

function scrollToSlide(index: number) {
  const track = carouselTrack.value
  if (!track) return
  track.scrollTo({ left: track.clientWidth * index, behavior: 'smooth' })
}

function scrollCarousel(delta: number) {
  const next = Math.min(Math.max(carouselIndex.value + delta, 0), mediaItems.value.length - 1)
  scrollToSlide(next)
}

function onCarouselScroll() {
  const track = carouselTrack.value
  if (!track || !track.clientWidth) return
  carouselIndex.value = Math.round(track.scrollLeft / track.clientWidth)
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
  party_size: '1',
  booking_date: minDate.value,
  time_slot: '',
  notes: '',
})

// Sync booking_date with minDate to prevent stale dates across midnight
watch(minDate, (newDate) => {
  if (!form.booking_date || form.booking_date < newDate) {
    form.booking_date = newDate
  }
})
onMounted(() => {
  clockTimer = setInterval(() => {
    clockNow.value = Date.now()
  }, 30_000)

  if (!form.booking_date && minDate.value) {
    form.booking_date = minDate.value
  }
})
onUnmounted(() => {
  if (clockTimer) {
    clearInterval(clockTimer)
    clockTimer = null
  }
})

function slotCanAccommodateParty(slot: SlotAvailabilityItem): boolean {
  return !(slot.remaining !== null && slot.remaining < Number(form.party_size))
}

function slotCanBeSelected(slot: SlotAvailabilityItem): boolean {
  return !slot.is_closed && !slot.is_full && slotCanAccommodateParty(slot)
}

async function loadSlotAvailability() {
  if (!siteId || !experience.value || !form.booking_date || !hasAnySlots.value) {
    slotAvailability.value = []
    availabilityInitialized.value = true
    return
  }
  availabilityLoading.value = true
  try {
    const res = await $fetch<{ timezone: string; dates: Array<{ date: string; slots: SlotAvailabilityItem[] }> }>(
      `/api/public/sites/${siteId}/experiences/${slug}/availability`,
      { query: { date: form.booking_date } },
    )
    availabilityTimezone.value = res.timezone
    slotAvailability.value = res.dates[0]?.slots ?? []
    const currentValid = slotAvailability.value.find((s) => s.time_slot === form.time_slot && slotCanBeSelected(s))
    if (!currentValid) {
      const firstAvailable = slotAvailability.value.find((s) => slotCanBeSelected(s))
      form.time_slot = firstAvailable?.time_slot ?? ''
    }
  } catch {
    slotAvailability.value = []
  } finally {
    availabilityLoading.value = false
    availabilityInitialized.value = true
  }
}

watch(() => form.booking_date, loadSlotAvailability)
watch(experience, () => loadSlotAvailability())
onMounted(loadSlotAvailability)

const submitting = ref(false)
const bookingError = ref<string | null>(null)

const canSubmit = computed(() =>
  form.guest_name.trim() &&
  form.guest_email.trim() &&
  form.booking_date &&
  form.time_slot,
)

async function submitBooking() {
  if (!canSubmit.value || !siteId) return

  if (hasAnySlots.value) {
    const selectedSlot = slotAvailability.value.find((slot) => slot.time_slot === form.time_slot)
    if (!selectedSlot || !slotCanBeSelected(selectedSlot)) {
      bookingError.value = 'Selected time slot is no longer available for this party size. Please choose another slot.'
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
          party_size: Number(form.party_size),
          booking_date: form.booking_date,
          time_slot: form.time_slot,
          notes: form.notes.trim() || undefined,
        },
      },
    )
    setBookingConfirmation({
      type: 'experience',
      siteId,
      siteName: siteName.value,
      guestName: form.guest_name.trim(),
      title: experience.value?.title,
      date: form.booking_date,
      time: form.time_slot,
      guests: form.party_size,
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
