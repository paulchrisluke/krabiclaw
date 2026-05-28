<template>
  <NuxtLayout name="saya">

    <!-- Loading -->
    <div v-if="pending" class="mx-auto max-w-7xl px-4 py-16 sm:px-6 lg:px-8">
      <div class="grid gap-10 lg:grid-cols-[1fr_400px] lg:items-start">
        <USkeleton class="aspect-4/3 rounded-xl" />
        <div class="space-y-4">
          <USkeleton class="h-6 w-24" />
          <USkeleton class="h-10 w-full" />
          <USkeleton class="h-24 w-full" />
          <USkeleton class="h-12 w-full rounded-full" />
        </div>
      </div>
    </div>

    <!-- Not found -->
    <div v-else-if="!experience" class="mx-auto max-w-7xl px-4 py-32 text-center">
      <h1 class="text-2xl font-semibold text-default">Experience not found</h1>
      <p class="mt-3 text-muted">This experience may no longer be available.</p>
      <UButton to="/experiences" class="mt-6" variant="soft">View all experiences</UButton>
    </div>

    <div v-else>
      <!-- ── Hero ─────────────────────────────────────────────── -->
      <section class="mx-auto max-w-7xl px-4 py-10 sm:px-6 lg:px-8">
        <nav class="mb-8 flex items-center gap-2 text-xs text-muted">
          <NuxtLink to="/" class="hover:text-default transition-colors">Home</NuxtLink>
          <UIcon name="i-heroicons-chevron-right" class="size-3.5" />
          <NuxtLink to="/experiences" class="hover:text-default transition-colors">Experiences</NuxtLink>
          <UIcon name="i-heroicons-chevron-right" class="size-3.5" />
          <span class="text-default">{{ experience.title }}</span>
        </nav>

        <div class="grid gap-10 lg:grid-cols-[1fr_400px] lg:items-start">
          <!-- Image -->
          <div class="aspect-4/3 overflow-hidden rounded-xl bg-muted lg:h-120 lg:aspect-auto">
            <img
              v-if="experience.image_url"
              :src="experience.image_url"
              :alt="experience.title"
              class="h-full w-full object-cover"
            />
            <div v-else class="flex h-full items-center justify-center">
              <UIcon name="i-heroicons-sparkles" class="size-16 text-dimmed" />
            </div>
          </div>

          <!-- Summary card -->
          <div class="lg:sticky lg:top-8 rounded-xl border border-default bg-elevated p-7 shadow-sm space-y-5">
            <div>
              <p class="saya-kicker mb-2">Experience</p>
              <h1 class="text-3xl font-bold leading-tight text-default">{{ experience.title }}</h1>
              <p v-if="experience.tagline" class="mt-2 text-muted">{{ experience.tagline }}</p>
            </div>

            <!-- Meta grid -->
            <div class="grid grid-cols-2 divide-x divide-y divide-default border border-default rounded-lg overflow-hidden text-sm">
              <div v-if="experience.duration_minutes" class="px-4 py-3">
                <p class="text-xs text-muted mb-0.5">Duration</p>
                <p class="font-medium text-default">{{ formatDuration(experience.duration_minutes) }}</p>
              </div>
              <div v-if="experience.available_note" class="px-4 py-3">
                <p class="text-xs text-muted mb-0.5">Availability</p>
                <p class="font-medium text-default">{{ experience.available_note }}</p>
              </div>
              <div v-if="experience.price" class="px-4 py-3">
                <p class="text-xs text-muted mb-0.5">Price</p>
                <p class="font-medium text-default">{{ experience.price }}</p>
              </div>
              <div v-if="experience.max_capacity" class="px-4 py-3">
                <p class="text-xs text-muted mb-0.5">Capacity</p>
                <p class="font-medium text-default">{{ experience.max_capacity }} guests max</p>
              </div>
            </div>

            <div v-if="experience.status === 'sold_out'" class="rounded-lg bg-red-50 dark:bg-red-950/30 px-4 py-3 text-sm font-medium text-red-600 dark:text-red-400 text-center">
              This experience is currently sold out.
            </div>

            <UButton
              v-else
              block
              color="primary"
              size="xl"
              class="rounded-full"
              @click="scrollToBooking"
            >
              Reserve Now
            </UButton>
          </div>
        </div>
      </section>

      <!-- ── Body content ────────────────────────────────────── -->
      <section v-if="experience.body" class="mx-auto max-w-3xl px-4 py-10 sm:px-6 lg:px-8">
        <h2 class="text-xl font-semibold text-default mb-6">About Experience</h2>
        <!-- eslint-disable vue/no-v-html -->
        <div class="prose prose-lg max-w-none text-default" v-html="sanitizedBody" />
        <!-- eslint-enable vue/no-v-html -->
      </section>

      <!-- ── Booking form ────────────────────────────────────── -->
      <section
        v-if="experience.status !== 'sold_out'"
        id="booking"
        class="mx-auto max-w-3xl px-4 py-12 sm:px-6 lg:px-8"
      >
        <h2 class="text-xl font-semibold text-default mb-8">Reservation</h2>

        <div v-if="bookingSuccess" class="rounded-xl border border-green-200 dark:border-green-800 bg-green-50 dark:bg-green-950/30 px-6 py-8 text-center space-y-3">
          <UIcon name="i-heroicons-check-circle" class="size-10 text-green-500 mx-auto" />
          <p class="font-semibold text-default text-lg">You're booked!</p>
          <p class="text-muted text-sm">{{ bookingMessage }}</p>
        </div>

        <form v-else class="space-y-6" @submit.prevent="submitBooking">
          <div class="grid gap-5 sm:grid-cols-2">
            <UFormField label="Your Name" required>
              <UInput v-model="form.guest_name" placeholder="Full name" size="lg" :disabled="submitting" />
            </UFormField>
            <UFormField label="Email Address" required>
              <UInput v-model="form.guest_email" type="email" placeholder="you@email.com" size="lg" :disabled="submitting" />
            </UFormField>
          </div>

          <div class="grid gap-5 sm:grid-cols-2">
            <UFormField label="Phone (optional)">
              <UInput v-model="form.guest_phone" type="tel" placeholder="+66 81 234 5678" size="lg" :disabled="submitting" />
            </UFormField>
            <UFormField label="Party Size" required>
              <USelect
                v-model="form.party_size"
                :items="partySizeOptions"
                size="lg"
                :disabled="submitting"
              />
            </UFormField>
          </div>

          <UFormField label="Date" required>
            <UInput v-model="form.booking_date" type="date" :min="minDate" size="lg" :disabled="submitting" />
          </UFormField>

          <UFormField v-if="experience.time_slots?.length" label="Choose an available time slot" required>
            <div class="flex flex-wrap gap-2">
              <button
                v-for="slot in experience.time_slots"
                :key="slot"
                type="button"
                :class="[
                  'rounded-lg border px-5 py-2.5 text-sm font-medium transition-colors',
                  form.time_slot === slot
                    ? 'border-primary bg-primary text-white'
                    : 'border-default bg-default text-default hover:border-primary hover:text-primary'
                ]"
                :disabled="submitting"
                @click="form.time_slot = slot"
              >
                {{ slot }}
              </button>
            </div>
          </UFormField>
          <UFormField v-else label="Preferred Time" required>
            <UInput v-model="form.time_slot" placeholder="e.g. 19:00" size="lg" :disabled="submitting" />
          </UFormField>

          <UFormField label="Special requests (optional)">
            <UTextarea v-model="form.notes" placeholder="Dietary requirements, celebrations, anything we should know…" :rows="3" :disabled="submitting" />
          </UFormField>

          <UAlert v-if="bookingError" color="error" variant="soft" :description="bookingError" />

          <UButton
            type="submit"
            color="primary"
            size="xl"
            class="w-full rounded-full"
            :loading="submitting"
            :disabled="!canSubmit"
          >
            Reserve Now
          </UButton>
        </form>
      </section>
    </div>

  </NuxtLayout>
</template>

<script setup lang="ts">

const DOMPurify = import.meta.client ? (await import('isomorphic-dompurify')).default : { sanitize: (s: string) => s }

const route = useRoute()
const slug = route.params.slug as string
const { siteId, site } = useTenantSite()
const siteName = computed(() => (site as ApiValue)?.name || 'KrabiClaw')
const config = useRuntimeConfig()
const siteUrl = config.public.siteUrl

const { experienceDetail: experience, data: bootstrapData } = useBootstrap()
const pending = computed(() => !bootstrapData.value)
const currentPageUrl = useSeoUrl(() => `/experiences/${slug}`)
const ogImage = useSharedOgImage(() => experience.value?.image_url)

const sanitizedBody = computed(() => {
  const raw = experience.value?.body
  if (!raw) return ''
  return DOMPurify.sanitize(raw)
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

// ── Booking form ──────────────────────────────────────────────────────────────

const minDate = computed(() => new Date().toISOString().split('T')[0])

const maxCap = computed(() => experience.value?.max_capacity ?? 20)
const partySizeOptions = computed(() =>
  Array.from({ length: maxCap.value }, (_, i) => ({ label: `${i + 1} guest${i > 0 ? 's' : ''}`, value: String(i + 1) })),
)

const form = reactive({
  guest_name: '',
  guest_email: '',
  guest_phone: '',
  party_size: '1',
  booking_date: '',
  time_slot: experience.value?.time_slots?.[0] ?? '',
  notes: '',
})

watch(experience, (newExp) => {
  if (newExp?.time_slots?.length && !form.time_slot) {
    form.time_slot = newExp.time_slots[0] || ''
  }
}, { immediate: true })

const submitting = ref(false)
const bookingSuccess = ref(false)
const bookingError = ref<string | null>(null)
const bookingMessage = ref('')

const canSubmit = computed(() =>
  form.guest_name.trim() &&
  form.guest_email.trim() &&
  form.booking_date &&
  form.time_slot,
)

async function submitBooking() {
  if (!canSubmit.value || !siteId) return
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
    bookingMessage.value = res.message
    bookingSuccess.value = true
  } catch (err: unknown) {
    const errorData = err && typeof err === 'object' && 'data' in err ? (err as Record<string, { error?: string }>).data : null
    bookingError.value = typeof errorData?.error === 'string' ? errorData.error : 'Something went wrong. Please try again.'
  } finally {
    submitting.value = false
  }
}

// SEO + structured data: make it reactive so it handles async fetch correctly!
useBreadcrumbSchema(computed(() => [
  { name: 'Home', url: `${siteUrl}/` },
  { name: 'Experiences', url: `${siteUrl}/experiences` },
  { name: experience.value?.title ?? slug, url: `${siteUrl}/experiences/${slug}` },
]))

useSeoMeta({
  title: computed(() => experience.value?.seo_title ?? (experience.value ? `${experience.value.title} | Experiences` : 'Experience')),
  description: computed(() => experience.value?.seo_description ?? experience.value?.tagline ?? `Book the ${experience.value?.title} experience.`),
  ogUrl: currentPageUrl,
  ogType: 'website',
  ogImage,
})

// JSON-LD — Event schema (best match for a bookable dining experience)
useHead({
  script: [
    {
      type: 'application/ld+json',
      innerHTML: () => {
        const val = experience.value
        if (!val) return '{}'
        return JSON.stringify({
          '@context': 'https://schema.org',
          '@type': 'Event',
          name: val.title,
          description: val.seo_description ?? val.tagline ?? undefined,
          image: val.image_url ?? undefined,
          url: `${siteUrl}/experiences/${val.slug}`,
          eventStatus: val.status === 'sold_out'
            ? 'https://schema.org/EventSoldOut'
            : 'https://schema.org/EventScheduled',
          eventAttendanceMode: 'https://schema.org/OfflineEventAttendanceMode',
          location: {
            '@type': 'Place',
            name: siteName.value,
            url: siteUrl,
          },
          organizer: {
            '@type': 'Restaurant',
            name: siteName.value,
            url: siteUrl,
          },
          offers: val.price
            ? {
                '@type': 'Offer',
                name: val.title,
                description: val.price,
                availability: val.status === 'sold_out'
                  ? 'https://schema.org/SoldOut'
                  : 'https://schema.org/InStock',
                url: `${siteUrl}/experiences/${val.slug}`,
              }
            : undefined,
        })
      }
    },
  ],
})
</script>
