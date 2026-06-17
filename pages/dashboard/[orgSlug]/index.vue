<template>
  <UPage class="h-full">

    <!-- ── ONBOARDING EMPTY STATE ───────────────────────────────────────── -->
    <UPageBody v-if="showOnboarding">
      <div class="max-w-lg mx-auto py-10 space-y-8">

        <!-- Step indicator -->
        <div class="flex items-center gap-2">
          <template v-for="(label, i) in onboardStepLabels" :key="i">
            <div class="flex items-center gap-2">
              <div
                :class="[
                  'flex size-7 items-center justify-center rounded-full text-xs font-bold transition-colors',
                  onboardStep > i
                    ? 'bg-(--kc-teal) text-white'
                    : onboardStep === i
                      ? 'bg-primary text-inverted'
                      : 'bg-muted text-muted'
                ]"
              >
                <UIcon v-if="onboardStep > i" name="i-heroicons-check" class="size-3.5" />
                <span v-else>{{ i + 1 }}</span>
              </div>
              <span :class="['text-sm font-medium hidden sm:inline', onboardStep === i ? 'text-highlighted' : 'text-muted']">
                {{ label }}
              </span>
            </div>
            <div v-if="i < onboardStepLabels.length - 1" class="flex-1 h-px bg-default mx-1" />
          </template>
        </div>

        <!-- ── Step 0: Find your business ─────────────────────────────── -->
        <UCard v-if="onboardStep === 0">
          <div class="space-y-5">
            <div>
              <h2 class="text-lg font-semibold text-highlighted">Find your business on Google Maps</h2>
              <p class="text-sm text-muted mt-1">
                Paste your Google Maps link — we'll pull in your name, address, hours, and reviews automatically.
              </p>
            </div>

            <!-- Vertical picker — only shown when no site exists yet -->
            <div v-if="!hasExistingSite" class="flex gap-3">
              <button
                v-for="opt in verticalOptions"
                :key="opt.value"
                :class="[
                  'flex-1 flex items-center gap-2 rounded-xl border px-4 py-3 text-sm font-medium transition-colors',
                  vertical === opt.value
                    ? 'border-primary bg-primary/5 text-primary'
                    : 'border-default text-muted hover:border-primary/40',
                ]"
                @click="vertical = opt.value"
              >
                <UIcon :name="opt.icon" class="size-4 shrink-0" />
                {{ opt.label }}
              </button>
            </div>

            <UFormField label="Google Maps URL" :error="lookupError ?? undefined">
              <UInput
                v-model="mapsUrl"
                placeholder="https://www.google.com/maps/place/..."
                size="lg"
                class="w-full font-mono text-sm"
                :disabled="lookupLoading"
                @paste.prevent="onPaste"
                @keydown.enter="triggerLookup"
              />
            </UFormField>

            <div v-if="lookupLoading" class="flex items-center gap-2 text-sm text-muted">
              <UIcon name="i-heroicons-arrow-path" class="size-4 animate-spin" />
              Looking up your business…
            </div>

            <!-- Preview card -->
            <div v-if="placePreview && !lookupLoading" class="rounded-xl border border-default bg-elevated/50 p-5 space-y-4">
              <div class="flex items-start gap-3">
                <div class="size-10 rounded-xl bg-primary/10 flex items-center justify-center shrink-0">
                  <UIcon name="i-heroicons-map-pin" class="size-5 text-primary" />
                </div>
                <div class="min-w-0">
                  <p class="font-semibold text-highlighted">{{ placePreview.name }}</p>
                  <p class="text-sm text-muted">{{ placePreview.address }}</p>
                  <p v-if="placePreview.phone" class="text-sm text-muted">{{ placePreview.phone }}</p>
                </div>
              </div>

              <div v-if="placePreview.rating || placePreview.ratingCount" class="flex items-center gap-4 text-sm">
                <span v-if="placePreview.rating" class="flex items-center gap-1 text-highlighted font-medium">
                  <UIcon name="i-lucide-star" class="size-3.5 text-warning-400 fill-warning-400" />
                  {{ placePreview.rating }}
                </span>
                <span v-if="placePreview.ratingCount" class="text-muted">
                  {{ placePreview.ratingCount.toLocaleString() }} reviews
                </span>
              </div>

              <div v-if="placePreview.openingHours?.length" class="text-xs text-muted space-y-0.5">
                <p v-for="line in placePreview.openingHours.slice(0, 3)" :key="line">{{ line }}</p>
                <p v-if="placePreview.openingHours.length > 3" class="text-dimmed">
                  +{{ placePreview.openingHours.length - 3 }} more days
                </p>
              </div>

              <div v-if="placePreview.photos?.length" class="space-y-3">
                <div class="grid grid-cols-2 gap-3">
                  <div v-if="placePreview.photos[0]" class="overflow-hidden rounded-xl bg-muted aspect-[4/3]">
                    <img
                      :src="placePreview.photos[0].photoUri"
                      :alt="`${placePreview.name} photo 1`"
                      class="h-full w-full object-cover"
                      loading="lazy"
                    >
                  </div>
                  <div v-if="placePreview.photos[1]" class="overflow-hidden rounded-xl bg-muted aspect-[4/3]">
                    <img
                      :src="placePreview.photos[1].photoUri"
                      :alt="`${placePreview.name} photo 2`"
                      class="h-full w-full object-cover"
                      loading="lazy"
                    >
                  </div>
                </div>
                <div v-if="placePreview.photos.length > 2" class="flex gap-3 overflow-x-auto pb-1">
                  <div
                    v-for="(photo, index) in placePreview.photos.slice(2, 5)"
                    :key="photo.name"
                    class="min-w-28 flex-1 overflow-hidden rounded-xl bg-muted aspect-square"
                  >
                    <img
                      :src="photo.photoUri"
                      :alt="`${placePreview.name} photo ${index + 3}`"
                      class="h-full w-full object-cover"
                      loading="lazy"
                    >
                  </div>
                </div>
              </div>

              <p v-if="applyError" class="text-sm text-error">{{ applyError }}</p>
              <div class="flex items-center justify-between pt-1">
                <UButton variant="ghost" size="sm" class="text-muted" @click="placePreview = null; mapsUrl = ''">
                  Not my business
                </UButton>
                <UButton :loading="applyLoading" @click="applyPlace">
                  This is my business →
                </UButton>
              </div>
            </div>

            <div v-if="!placePreview && !lookupLoading" class="flex justify-end">
              <UButton variant="ghost" size="sm" @click="skipToConnect">
                Skip — I'll set this up later
              </UButton>
            </div>
          </div>
        </UCard>

        <!-- ── Step 1: Building ────────────────────────────────────────── -->
        <UCard v-if="onboardStep === 1">
          <div class="py-8 flex flex-col items-center gap-4 text-center">
            <div class="size-14 rounded-2xl bg-primary/10 flex items-center justify-center">
              <UIcon name="i-heroicons-cog-6-tooth" class="size-7 text-primary animate-spin" />
            </div>
            <div>
              <p class="font-semibold text-highlighted">Building your site…</p>
              <p class="text-sm text-muted mt-1">Importing your hours, address, and reviews.</p>
            </div>
          </div>
        </UCard>

        <!-- ── Step 2: Site preview ────────────────────────────────────── -->
        <UCard v-if="onboardStep === 2">
          <div class="space-y-5">
            <div>
              <p class="text-xs font-semibold uppercase tracking-wider text-primary mb-1">Your site is live</p>
              <h2 class="text-lg font-semibold text-highlighted">Here's what we built</h2>
            </div>

            <!-- Live URL -->
            <a
              :href="liveSiteUrl"
              target="_blank"
              rel="noopener"
              class="flex items-center gap-3 rounded-xl border border-default bg-elevated/50 px-4 py-3 hover:border-primary/40 transition-colors no-underline group"
            >
              <div class="size-8 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
                <UIcon name="i-heroicons-globe-alt" class="size-4 text-primary" />
              </div>
              <span class="text-sm font-mono text-highlighted truncate flex-1">{{ liveSiteUrl }}</span>
              <UIcon name="i-heroicons-arrow-top-right-on-square" class="size-4 text-muted group-hover:text-primary transition-colors shrink-0" />
            </a>

            <div v-if="heroImageUrl || locationHeroImageUrl || galleryPhotos.length" class="space-y-3">
              <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div v-if="heroImageUrl" class="overflow-hidden rounded-xl bg-muted aspect-[4/3]">
                  <img
                    :src="heroImageUrl"
                    alt="Hero image"
                    class="h-full w-full object-cover"
                    loading="lazy"
                  >
                </div>
                <div v-if="locationHeroImageUrl" class="overflow-hidden rounded-xl bg-muted aspect-[4/3]">
                  <img
                    :src="locationHeroImageUrl"
                    alt="Location hero image"
                    class="h-full w-full object-cover"
                    loading="lazy"
                  >
                </div>
              </div>
              <div v-if="galleryPhotos.length" class="flex gap-3 overflow-x-auto pb-1">
                <div
                  v-for="photo in galleryPhotos"
                  :key="photo.name"
                  class="min-w-32 flex-1 overflow-hidden rounded-xl bg-muted aspect-square"
                >
                  <img
                    :src="photo.photoUri"
                    :alt="`${placePreview?.name ?? 'Business'} gallery photo`"
                    class="h-full w-full object-cover"
                    loading="lazy"
                  >
                </div>
              </div>
            </div>

            <!-- What was imported -->
            <div class="space-y-2">
              <p class="text-xs font-medium text-muted uppercase tracking-wide">Imported from Google Maps</p>
              <ul class="space-y-2">
                <li v-for="fact in importedFacts" :key="fact" class="flex items-center gap-2 text-sm text-muted">
                  <UIcon name="i-heroicons-check-circle" class="size-4 text-(--kc-teal) shrink-0" />
                  {{ fact }}
                </li>
                <li class="flex items-center gap-2 text-sm text-dimmed">
                  <UIcon name="i-heroicons-photo" class="size-4 text-primary shrink-0" />
                  The first 2 photos are saved as hero images
                </li>
              </ul>
            </div>

            <UButton class="w-full justify-center" @click="onboardStep = 3">
              Continue →
            </UButton>
          </div>
        </UCard>

        <!-- ── Step 3: Notifications ───────────────────────────────────── -->
        <UCard v-if="onboardStep === 3">
          <div class="space-y-5">
            <div>
              <p class="text-xs font-semibold uppercase tracking-wider text-primary mb-1">Stay in the loop</p>
              <h2 class="text-lg font-semibold text-highlighted">How should we notify you?</h2>
              <p class="text-sm text-muted mt-1">
                Get alerts when new reservations, reviews, or contact messages come in.
              </p>
            </div>

            <div class="grid grid-cols-2 gap-3">
              <!-- Email option -->
              <button
                :class="[
                  'flex flex-col items-start gap-2 rounded-xl border p-4 text-left transition-colors',
                  notifChannel === 'email'
                    ? 'border-primary bg-primary/5'
                    : 'border-default hover:border-primary/40',
                ]"
                @click="notifChannel = 'email'"
              >
                <div class="size-8 rounded-lg bg-primary/10 flex items-center justify-center">
                  <UIcon name="i-heroicons-envelope" class="size-4 text-primary" />
                </div>
                <div>
                  <p class="text-sm font-semibold text-highlighted">Email</p>
                  <p class="text-xs text-muted mt-0.5 truncate max-w-30">{{ authUser?.email ?? 'Your email' }}</p>
                </div>
              </button>

              <!-- WhatsApp option -->
              <button
                :class="[
                  'flex flex-col items-start gap-2 rounded-xl border p-4 text-left transition-colors',
                  notifChannel === 'whatsapp'
                    ? 'border-primary bg-primary/5'
                    : 'border-default hover:border-primary/40',
                ]"
                @click="notifChannel = 'whatsapp'"
              >
                <div class="size-8 rounded-lg bg-primary/10 flex items-center justify-center">
                  <UIcon name="i-simple-icons-whatsapp" class="size-4 text-primary" />
                </div>
                <div>
                  <p class="text-sm font-semibold text-highlighted">WhatsApp</p>
                  <p class="text-xs text-muted mt-0.5">Add a number</p>
                </div>
              </button>
            </div>

            <!-- WhatsApp phone input -->
            <div v-if="notifChannel === 'whatsapp'">
              <UFormField label="WhatsApp number" :error="notifError ?? undefined">
                <UInput
                  v-model="whatsappPhone"
                  placeholder="+66 81 234 5678"
                  size="lg"
                  class="w-full"
                  type="tel"
                />
              </UFormField>
            </div>

            <div class="flex flex-col gap-2">
              <UButton class="w-full justify-center" :loading="notifSaving" @click="saveNotifications">
                Continue to ChatGPT setup →
              </UButton>
              <UButton variant="ghost" color="neutral" size="sm" class="w-full justify-center" @click="onboardStep = 4">
                Skip for now
              </UButton>
            </div>
          </div>
        </UCard>

        <!-- ── Step 4: Manage with ChatGPT ────────────────────────────── -->
        <UCard v-if="onboardStep === 4">
          <div class="space-y-6">
            <div>
              <p class="text-xs font-semibold uppercase tracking-wider text-primary mb-2">Your site is ready</p>
              <h2 class="text-lg font-semibold text-highlighted">Now manage it through ChatGPT</h2>
              <p class="text-sm text-muted mt-1">
                Add KrabiClaw to ChatGPT and start editing your menus, content, and photos through conversation.
              </p>
            </div>

            <!-- Screenshot -->
            <img
              src="/install-krabiclaw-chatgpt-plugin.png"
              alt="How to install KrabiClaw in ChatGPT"
              class="w-full rounded-xl border border-default shadow-sm"
            />

            <!-- MCP URL copy row -->
            <div>
              <p class="text-xs text-muted mb-2 font-medium">Paste this URL in ChatGPT → Settings → Connectors</p>
              <div class="flex items-center gap-2 bg-elevated border border-default rounded-xl px-4 py-3 font-mono text-sm text-highlighted">
                <UIcon name="i-heroicons-link" class="size-4 shrink-0 text-muted" />
                <span class="truncate flex-1">https://krabiclaw.com/api/mcp</span>
                <button
                  class="shrink-0 text-muted hover:text-highlighted transition-colors cursor-pointer"
                  aria-label="Copy MCP URL"
                  @click="copyMcpUrl"
                >
                  <UIcon :name="mcpCopied ? 'i-heroicons-check' : 'i-heroicons-clipboard'" class="size-4" />
                </button>
              </div>
            </div>

            <div class="flex flex-col sm:flex-row items-stretch sm:items-center gap-3">
              <UButton
                as="a"
                href="https://chatgpt.com"
                target="_blank"
                rel="noopener"
                class="flex-1 justify-center"
              >
                <UIcon name="i-heroicons-arrow-top-right-on-square" class="size-4" />
                Open ChatGPT
              </UButton>
              <UButton variant="outline" color="neutral" class="flex-1 justify-center" :loading="completeLoading" @click="completeOnboarding">
                Go to dashboard →
              </UButton>
            </div>
            <p class="text-xs text-center text-dimmed">
              Your dashboard shows a checklist of what's left — you can come back anytime.
            </p>
          </div>
        </UCard>

      </div>
    </UPageBody>

    <!-- ── NORMAL DASHBOARD ──────────────────────────────────────────────── -->
    <UPageBody v-else>
      <div v-if="loading" class="space-y-6">
        <div class="grid grid-cols-2 sm:grid-cols-4 gap-4">
          <USkeleton v-for="i in 4" :key="i" class="h-20 rounded-xl" />
        </div>
        <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          <USkeleton v-for="i in 3" :key="i" class="h-56 rounded-xl" />
        </div>
      </div>

      <div v-else class="space-y-6">
        <!-- Onboarding checklist (shown until dismissed or all items complete) -->
        <DashboardOnboardingChecklist :org-slug="String(route.params.orgSlug)" />

        <!-- Usage strip -->
        <div v-if="credits" class="grid grid-cols-2 sm:grid-cols-4 gap-4">
          <UCard>
            <p class="text-xs text-muted">AI Credits</p>
            <p class="mt-1 text-2xl font-semibold text-highlighted tabular-nums">{{ credits.balance.toLocaleString() }}</p>
            <UProgress :model-value="credits.balance" :max="credits.balance + credits.lifetime_used"
              :color="credits.balance < 100 ? 'error' : credits.balance < 500 ? 'warning' : 'primary'" size="xs" class="mt-2" />
          </UCard>
          <UCard>
            <p class="text-xs text-muted">Locations</p>
            <p class="mt-1 text-2xl font-semibold text-highlighted">{{ locations.length }}</p>
          </UCard>
          <UCard>
            <p class="text-xs text-muted">Reviews</p>
            <p class="mt-1 text-2xl font-semibold text-highlighted">
              {{ locations.reduce((s, l) => s + (l.review_count ?? 0), 0).toLocaleString() }}
            </p>
          </UCard>
          <UCard>
            <p class="text-xs text-muted">Avg Rating</p>
            <p class="mt-1 text-2xl font-semibold text-highlighted">{{ avgRating ?? '—' }}</p>
          </UCard>
        </div>

        <div v-if="locations.length === 0" class="py-16 text-center">
          <p class="text-sm text-muted">No locations yet.</p>
        </div>

        <div v-else class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          <NuxtLink
            v-for="location in locations"
            :key="location.id"
            :to="`/dashboard/${route.params.orgSlug}/${location.slug}`"
            class="group block"
          >
            <UCard class="h-full transition-shadow group-hover:shadow-md cursor-pointer" :ui="{ body: 'p-0 sm:p-0' }">
              <div class="aspect-video w-full overflow-hidden rounded-t-xl bg-muted">
                <img
                  v-if="location.hero_url"
                  :src="location.thumbnail_url ?? location.hero_url"
                  :alt="location.title"
                  class="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105"
                  loading="lazy"
                />
                <div v-else class="flex h-full items-center justify-center">
                  <UIcon name="i-lucide-map-pin" class="size-8 text-muted" />
                </div>
              </div>
              <div class="p-4 space-y-2">
                <div class="flex items-start justify-between gap-2">
                  <div class="min-w-0">
                    <p class="text-sm font-semibold text-highlighted truncate">{{ location.title }}</p>
                    <p v-if="location.city" class="text-xs text-muted">{{ location.city }}</p>
                  </div>
                  <UBadge v-if="location.is_primary" color="primary" variant="soft" size="xs">Primary</UBadge>
                </div>
                <div v-if="location.rating || location.review_count" class="flex items-center gap-3 text-xs text-muted">
                  <span v-if="location.rating" class="flex items-center gap-1">
                    <UIcon name="i-lucide-star" class="size-3 text-warning-400 fill-warning-400" />
                    {{ location.rating.toFixed(1) }}
                  </span>
                  <span v-if="location.review_count">{{ location.review_count.toLocaleString() }} reviews</span>
                </div>
                <p class="text-xs text-muted">Updated {{ timeAgo(location.updated_at) }}</p>
              </div>
            </UCard>
          </NuxtLink>
        </div>

        <UCard v-if="events.length > 0" title="Recent Activity">
          <ul class="-mx-4 -mb-4">
            <li v-for="ev in events" :key="ev.id" class="flex items-start gap-3 px-4 py-3 border-b border-default last:border-0">
              <UAvatar :src="ev.actor_image ?? undefined" :alt="ev.actor_name ?? 'System'" size="2xs" class="mt-0.5 shrink-0" />
              <div class="min-w-0 flex-1">
                <p class="text-xs text-highlighted leading-snug">
                  {{ eventLabel(ev.event_type) }}
                  <span v-if="ev.location_title" class="text-muted"> · {{ ev.location_title }}</span>
                </p>
                <p class="text-xs text-muted mt-0.5">{{ timeAgo(ev.created_at) }}</p>
              </div>
            </li>
          </ul>
        </UCard>
      </div>
    </UPageBody>

  </UPage>
</template>

<script setup lang="ts">
definePageMeta({ layout: 'dashboard', ssr: false })
useSeoMeta({ title: 'Dashboard | KrabiClaw', robots: 'noindex, nofollow' })

const route = useRoute()
const router = useRouter()
const dashboardState = useDashboardRestaurant()

// ── Onboarding state ──────────────────────────────────────────────────────────

const onboardStepLabels = ['Find your business', 'Your site is live', 'Notifications', 'Connect to ChatGPT']
const onboardStep = ref(0)

const { user: authUser } = useAuth()

const mapsUrl = ref('')
const lookupLoading = ref(false)
const lookupError = ref<string | null>(null)
const placePreview = ref<{
  placeId: string
  name: string
  address: string
  phone: string | null
  rating: number | null
  ratingCount: number | null
  openingHours: string[] | null
  photos: Array<{
    name: string
    widthPx: number
    heightPx: number
    photoUri: string
  }>
} | null>(null)

const applyLoading = ref(false)
const applyError = ref<string | null>(null)
const completeLoading = ref(false)
const mcpCopied = ref(false)

// Notifications step
const notifChannel = ref<'email' | 'whatsapp'>('email')
const whatsappPhone = ref('')
const notifSaving = ref(false)
const notifError = ref<string | null>(null)

async function saveNotifications() {
  if (notifChannel.value === 'whatsapp') {
    const phone = whatsappPhone.value.trim()
    const siteId = dashboardState.restaurant.value?.id
    if (phone && siteId) {
      notifSaving.value = true
      notifError.value = null
      try {
        await $fetch(`/api/editor/sites/${siteId}/notifications`, {
          method: 'PATCH',
          body: { whatsapp_phone: phone },
        })
      } catch {
        notifError.value = 'Could not save your number. You can update this in settings later.'
      } finally {
        notifSaving.value = false
      }
    }
  }
  onboardStep.value = 4
}

const hasExistingSite = computed(() => Boolean(dashboardState.restaurant.value))
const showOnboarding = computed(() =>
  !dashboardState.restaurant.value ||
  dashboardState.restaurant.value.onboarding_status !== 'completed'
)

const vertical = ref<'restaurant' | 'experience'>('restaurant')
const verticalOptions = [
  { value: 'restaurant', label: 'Restaurant', icon: 'i-heroicons-cake' },
  { value: 'experience', label: 'Experience', icon: 'i-heroicons-sparkles' },
] as const satisfies ReadonlyArray<{
  value: 'restaurant' | 'experience'
  label: string
  icon: string
}>

async function triggerLookup() {
  const url = mapsUrl.value.trim()
  if (!url) return
  lookupError.value = null
  placePreview.value = null
  lookupLoading.value = true
  try {
    const res = await $fetch<{ success: boolean; preview: typeof placePreview.value }>('/api/dashboard/onboarding/lookup-place', {
      method: 'POST',
      body: { mapsUrl: url },
    })
    if (res.success) placePreview.value = res.preview
  } catch (err: unknown) {
    const msg = err && typeof err === 'object' && 'data' in err
      ? (err as { data?: { error?: string } }).data?.error
      : null
    lookupError.value = msg ?? 'Could not find your business. Try copying the full URL from your browser.'
  } finally {
    lookupLoading.value = false
  }
}

function onPaste(e: ClipboardEvent) {
  const text = e.clipboardData?.getData('text') ?? ''
  mapsUrl.value = text
  nextTick(triggerLookup)
}

async function applyPlace() {
  if (!placePreview.value) return
  applyLoading.value = true
  applyError.value = null
  onboardStep.value = 1
  try {
    const res = await $fetch<{ success: boolean; orgSlug: string | null }>('/api/dashboard/onboarding/setup', {
      method: 'POST',
      body: { placeId: placePreview.value.placeId, vertical: vertical.value },
    })
    if (res.orgSlug && res.orgSlug !== route.params.orgSlug) {
      // New site created under a different org slug — navigate and signal step via query param
      await router.replace(`/dashboard/${res.orgSlug}?_onboard=preview`)
      return
    }
    await dashboardState.refresh()
    onboardStep.value = 2
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Setup failed. Please try again.'
    applyError.value = msg
    onboardStep.value = 0
  } finally {
    applyLoading.value = false
  }
}

const liveSiteUrl = computed(() => {
  const sub = dashboardState.restaurant.value?.subdomain
  return sub ? `https://${sub}.krabiclaw.com` : '#'
})

const heroImageUrl = computed(() => dashboardState.restaurant.value?.heroImageUrl ?? placePreview.value?.photos?.[0]?.photoUri ?? null)
const locationHeroImageUrl = computed(() => dashboardState.restaurant.value?.locationHeroImageUrl ?? placePreview.value?.photos?.[1]?.photoUri ?? null)
const galleryPhotos = computed(() => placePreview.value?.photos.slice(2, 5) ?? [])

const importedFacts = computed(() => {
  const facts: string[] = ['Name, address & hours']
  if (placePreview.value?.phone) facts.push('Phone number')
  if (placePreview.value?.ratingCount) facts.push(`${placePreview.value.ratingCount} Google reviews`)
  if (placePreview.value?.rating) facts.push(`${placePreview.value.rating} star rating`)
  return facts
})

function skipToConnect() {
  onboardStep.value = 4
}

async function copyMcpUrl() {
  await navigator.clipboard.writeText('https://krabiclaw.com/api/mcp')
  mcpCopied.value = true
  setTimeout(() => { mcpCopied.value = false }, 2000)
}

async function loadDashboardData() {
  const data = await $fetch<{ locations: Location[]; credits: Credits | null; events: SiteEvent[] }>('/api/dashboard/home')
  locations.value = data.locations
  credits.value = data.credits
  events.value = data.events
}

async function completeOnboarding() {
  completeLoading.value = true
  try {
    await $fetch('/api/dashboard/onboarding/complete', { method: 'POST' })
    await dashboardState.refresh()
    await loadDashboardData()
  } catch {
    // Still advance
  } finally {
    completeLoading.value = false
    await router.replace(`/dashboard/${route.params.orgSlug}`)
  }
}

// ── Normal dashboard state ─────────────────────────────────────────────────────

interface Location {
  id: string; slug: string; title: string; city: string | null
  rating: number | null; review_count: number | null
  is_primary: boolean; status: string; updated_at: string
  hero_url: string | null; thumbnail_url: string | null
}
interface Credits { balance: number; lifetime_used: number; last_topped_up_at: string | null }
interface SiteEvent {
  id: string; event_type: string; location_id: string | null
  metadata: Record<string, unknown> | null; created_at: string
  actor_name: string | null; actor_image: string | null; location_title: string | null
}

const loading = ref(true)
const locations = ref<Location[]>([])
const credits = ref<Credits | null>(null)
const events = ref<SiteEvent[]>([])

const avgRating = computed(() => {
  const rated = locations.value.filter(l => l.rating)
  if (!rated.length) return null
  return (rated.reduce((s, l) => s + (l.rating ?? 0), 0) / rated.length).toFixed(1)
})

const EVENT_LABELS: Record<string, string> = {
  'post.published': 'Published a post', 'menu.item_added': 'Added a menu item',
  'menu.item_updated': 'Updated a menu item', 'content.updated': 'Updated content',
  'media.uploaded': 'Uploaded media', 'review.received': 'New review received',
  'reservation.created': 'New reservation', 'location.created': 'Added a location',
  'location.gmb_connected': 'Connected Google Business',
}
function eventLabel(type: string) { return EVENT_LABELS[type] ?? type.replace('.', ' ') }
function timeAgo(dateStr: string) {
  const diff = Date.now() - new Date(dateStr).getTime()
  const mins = Math.floor(diff / 60000)
  if (mins < 1) return 'just now'
  if (mins < 60) return `${mins}m ago`
  const hrs = Math.floor(mins / 60)
  if (hrs < 24) return `${hrs}h ago`
  const days = Math.floor(hrs / 24)
  return days < 30 ? `${days}d ago` : new Date(dateStr).toLocaleDateString()
}

onMounted(async () => {
  // Restore onboarding step after cross-slug navigation (new site creation)
  if (route.query._onboard === 'preview') {
    onboardStep.value = 2
    router.replace({ query: {} })
  }

  try {
    await dashboardState.refresh()
    if (showOnboarding.value) return
    await loadDashboardData()
  } finally {
    loading.value = false
  }
})
</script>
