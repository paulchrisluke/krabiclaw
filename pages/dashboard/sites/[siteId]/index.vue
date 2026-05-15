<template>
  <UPage>
    <UPageHeader
      title="Overview"
      :description="site?.brand_name ?? ''"
      :links="headerLinks"
    />

    <UPageBody>
      <div v-if="loading" class="space-y-4">
        <USkeleton class="h-10 w-full" />
        <USkeleton class="h-56 w-full" />
        <div class="grid gap-4 md:grid-cols-3">
          <USkeleton class="h-20" />
          <USkeleton class="h-20" />
          <USkeleton class="h-20" />
        </div>
      </div>

      <UAlert
        v-else-if="error"
        color="error"
        variant="soft"
        icon="i-heroicons-exclamation-triangle"
        :description="error"
      />

      <div v-else-if="site" class="space-y-6">
        <!-- Welcome banner (shown once after wizard completes) -->
        <UAlert
          v-if="showWelcomeBanner"
          color="success"
          variant="soft"
          icon="i-heroicons-check-circle"
          :title="`Welcome to ${site.brand_name}! 🎉`"
          :description="`Your site is live at ${publicUrl}. Continue below to get it ready for guests.`"
          :close-button="{ icon: 'i-heroicons-x-mark', color: 'neutral', variant: 'link' }"
          @close="dismissWelcomeBanner"
        />

        <!-- ─── Setup Journey card (shown until all required steps done) ─── -->
        <UCard v-if="progress && !progress.can_publish">
          <template #header>
            <div class="flex items-center justify-between gap-4">
              <div>
                <h2 class="font-semibold text-highlighted">Get ready to go live</h2>
                <p class="mt-1 text-sm text-muted">
                  Complete the required steps, then publish your site.
                </p>
              </div>
              <UBadge color="warning" variant="soft" size="lg">
                {{ progress.required_complete }}/{{ progress.required_total }} required done
              </UBadge>
            </div>
          </template>

          <!-- Progress bar (required steps only) -->
          <div class="mb-6">
            <UProgress
              :model-value="requiredProgress"
              size="md"
              color="primary"
            />
          </div>

          <!-- Required steps -->
          <div class="space-y-1">
            <p class="mb-2 text-xs font-semibold uppercase tracking-wide text-muted">Required</p>
            <div
              v-for="step in requiredSteps"
              :key="step.id"
              class="flex items-center gap-3 rounded-lg px-3 py-2.5 transition"
              :class="step.done ? 'opacity-60' : 'bg-elevated'"
            >
              <div
                class="flex size-5 shrink-0 items-center justify-center rounded-full"
                :class="step.done ? 'bg-success' : 'border-2 border-muted'"
              >
                <UIcon v-if="step.done" name="i-heroicons-check" class="size-3 text-default" />
              </div>
              <div class="min-w-0 flex-1">
                <p class="text-sm font-medium" :class="step.done ? 'text-muted line-through' : 'text-highlighted'">
                  {{ step.label }}
                </p>
                <p v-if="!step.done" class="text-xs text-muted">{{ step.description }}</p>
              </div>
              <UButton
                v-if="!step.done && step.action_url"
                :to="step.action_url"
                size="xs"
                variant="soft"
                color="primary"
              >
                Set up
              </UButton>
            </div>
          </div>

          <!-- ChowBot nudge (shown once primary location is done) -->
          <div
            v-if="progress.required_complete >= 2"
            class="mt-4 flex items-start gap-3 rounded-lg border border-dashed border-default p-4"
          >
            <UIcon name="i-heroicons-sparkles" class="mt-0.5 size-5 shrink-0 text-primary" />
            <div class="min-w-0 flex-1">
              <p class="text-sm font-medium text-highlighted">Let ChowBot help</p>
              <p class="mt-0.5 text-xs text-muted">
                ChowBot can write your About page, add menu descriptions, and create your first post.
              </p>
            </div>
            <UButton
              :to="`/dashboard/sites/${siteId}/chowbot?prompt=Help+me+finish+setting+up+my+restaurant+site`"
              size="xs"
              variant="soft"
              color="primary"
            >
              Ask ChowBot
            </UButton>
          </div>

          <!-- Recommended steps (collapsed by default) -->
          <div class="mt-6">
            <button
              class="flex w-full items-center gap-2 text-left"
              @click="showRecommended = !showRecommended"
            >
              <p class="text-xs font-semibold uppercase tracking-wide text-muted">
                Recommended ({{ progress.recommended_complete }}/{{ progress.recommended_total }} done)
              </p>
              <UIcon
                :name="showRecommended ? 'i-heroicons-chevron-up' : 'i-heroicons-chevron-down'"
                class="ml-auto size-4 text-muted"
              />
            </button>

            <div v-if="showRecommended" class="mt-2 space-y-1">
              <div
                v-for="step in recommendedSteps"
                :key="step.id"
                class="flex items-center gap-3 rounded-lg px-3 py-2 transition"
                :class="step.done ? 'opacity-50' : ''"
              >
                <div
                  class="flex size-4 shrink-0 items-center justify-center rounded-full"
                  :class="step.done ? 'bg-success' : 'border border-muted'"
                >
                  <UIcon v-if="step.done" name="i-heroicons-check" class="size-2.5 text-default" />
                </div>
                <p class="min-w-0 flex-1 text-sm" :class="step.done ? 'text-muted line-through' : 'text-default'">
                  {{ step.label }}
                </p>
                <UButton
                  v-if="!step.done && step.action_url"
                  :to="step.action_url"
                  size="xs"
                  variant="ghost"
                  color="neutral"
                >
                  Add
                </UButton>
              </div>
            </div>
          </div>
        </UCard>

        <!-- ─── "Go Live" card (shown when all required steps are done) ── -->
        <UCard v-else-if="progress && progress.can_publish && !isPublished">
          <div class="flex flex-col items-center gap-4 py-4 text-center">
            <div class="flex size-14 items-center justify-center rounded-full bg-success/10">
              <UIcon name="i-heroicons-rocket-launch" class="size-7 text-success" />
            </div>
            <div>
              <h2 class="text-xl font-semibold text-highlighted">Your site is ready to publish!</h2>
              <p class="mt-1 text-sm text-muted">
                All required content is in place. Publish to make it visible to guests.
              </p>
            </div>
            <div class="flex flex-wrap justify-center gap-3">
              <UButton
                size="xl"
                color="success"
                icon="i-heroicons-rocket-launch"
                :loading="publishing"
                @click="publishSite"
              >
                Publish Your Site
              </UButton>
              <UButton
                size="xl"
                color="neutral"
                variant="soft"
                :to="publicUrl"
                target="_blank"
                icon="i-heroicons-arrow-top-right-on-square"
              >
                Preview
              </UButton>
            </div>
          </div>
        </UCard>

        <!-- ─── "Site is live" pill (after published) ───────────────────── -->
        <UAlert
          v-else-if="isPublished"
          color="success"
          variant="soft"
          icon="i-heroicons-check-circle"
          title="Your site is live"
          :description="`Guests can visit you at ${publicUrl}`"
        >
          <template #actions>
            <UButton :to="publicUrl" target="_blank" size="sm" color="neutral" variant="soft">
              View site
            </UButton>
          </template>
        </UAlert>

        <!-- Locations card -->
        <UCard v-if="locations.length > 0">
          <template #header>
            <div class="flex items-center justify-between gap-4">
              <div>
                <h2 class="font-semibold text-highlighted">Locations</h2>
                <p class="mt-1 text-sm text-muted">Choose a location to edit its menu and content.</p>
              </div>
              <UButton
                :to="`/dashboard/sites/${siteId}/locations`"
                icon="i-heroicons-arrow-right"
                trailing
                color="neutral"
                variant="soft"
              >
                Manage All
              </UButton>
            </div>
          </template>

          <div class="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            <NuxtLink
              v-for="location in locations"
              :key="location.id"
              :to="`/dashboard/sites/${siteId}/menu?locationId=${location.id}`"
              class="group relative rounded-lg border border-default p-4 transition hover:bg-elevated"
            >
              <div class="flex items-start justify-between gap-3">
                <div class="min-w-0 flex-1">
                  <div class="flex items-center gap-2">
                    <p class="truncate font-medium text-highlighted">{{ location.title }}</p>
                    <UBadge v-if="location.is_primary" color="primary" variant="soft" size="xs">Primary</UBadge>
                  </div>
                  <p class="mt-1 truncate text-sm text-muted">
                    {{ addressLabel(location) || location.city || `/${location.slug}` }}
                  </p>
                </div>
                <UIcon name="i-heroicons-arrow-right" class="size-4 shrink-0 text-muted transition group-hover:text-primary" />
              </div>
              <div class="mt-3 flex items-center gap-2">
                <UButton :to="`/dashboard/sites/${siteId}/menu?locationId=${location.id}`" size="xs" block>
                  Edit Menu
                </UButton>
                <UButton
                  :to="`/dashboard/sites/${siteId}/locations`"
                  size="xs"
                  color="neutral"
                  variant="ghost"
                  icon="i-heroicons-cog-6-tooth"
                />
              </div>
            </NuxtLink>
          </div>
        </UCard>

        <!-- Add location prompt (if none yet) -->
        <UCard v-else-if="!loading">
          <div class="grid gap-6 lg:grid-cols-[minmax(0,1fr)_20rem] lg:items-center">
            <div>
              <UBadge color="warning" variant="soft">Location required</UBadge>
              <h2 class="mt-4 text-2xl font-semibold text-highlighted">Add your first location</h2>
              <p class="mt-2 max-w-2xl text-sm text-muted">
                Location content, menus, hours, addresses, and Google Business sync all start with a physical location.
              </p>
            </div>
            <div class="flex flex-col gap-2">
              <UButton :to="`/dashboard/sites/${siteId}/locations`" icon="i-heroicons-plus" color="primary" size="lg" block>
                Add Location
              </UButton>
              <UButton
                :to="`/dashboard/sites/${siteId}/content`"
                icon="i-heroicons-document-text"
                color="neutral"
                variant="soft"
                block
              >
                Edit Brand Pages
              </UButton>
            </div>
          </div>
        </UCard>

        <!-- Stats row (always visible once published, optional before) -->
        <div v-if="isPublished" class="grid gap-4 md:grid-cols-3">
          <UCard>
            <p class="text-sm text-muted">Locations</p>
            <p class="mt-2 text-3xl font-semibold text-highlighted">{{ locations.length }}</p>
          </UCard>
          <UCard>
            <p class="text-sm text-muted">Menu items</p>
            <p class="mt-2 text-3xl font-semibold text-highlighted">{{ menuItemsCount }}</p>
          </UCard>
          <UCard>
            <p class="text-sm text-muted">Reviews</p>
            <p class="mt-2 text-3xl font-semibold text-highlighted">{{ reviewCount }}</p>
          </UCard>
        </div>
      </div>
    </UPageBody>
  </UPage>
</template>

<script setup lang="ts">
definePageMeta({ layout: 'dashboard' })

interface BusinessLocation {
  id: string
  slug: string
  title: string
  address: { addressLines?: string[] } | null
  city: string | null
  phone: string | null
  is_primary: boolean
  status: string
}

interface SetupStep {
  id: string
  label: string
  description: string
  done: boolean
  required: boolean
  action_url?: string
}

interface SetupProgress {
  steps: SetupStep[]
  required_complete: number
  required_total: number
  recommended_complete: number
  recommended_total: number
  can_publish: boolean
  public_url: string | null
}

const route = useRoute()
const config = useRuntimeConfig()
const toast = useToast()
const siteId = route.params.siteId as string

// ─── Welcome banner from wizard redirect ─────────────────────────────────────
const showWelcomeBanner = ref(route.query.welcome === 'true')
function dismissWelcomeBanner() {
  showWelcomeBanner.value = false
  // Clean the query param without navigating
  history.replaceState({}, '', route.path)
}

// ─── State ───────────────────────────────────────────────────────────────────
const loading = ref(true)
const error = ref<string | null>(null)
const site = ref<ApiRecord | null>(null)
const locations = ref<BusinessLocation[]>([])
const menuItemsCount = ref(0)
const reviewCount = ref(0)
const progress = ref<SetupProgress | null>(null)
const publishing = ref(false)
const showRecommended = ref(false)

// ─── Derived ─────────────────────────────────────────────────────────────────
const platformHostname = computed(() => {
  const domain = config.public.freeSiteDomain
  return domain.replace(/^https?:\/\//, '')
})

const publicUrl = computed(() => {
  if (!site.value?.subdomain) return ''
  return `https://${site.value.subdomain}.${platformHostname.value}`
})

const isPublished = computed(() =>
  !!site.value?.last_published_at
)

const requiredSteps = computed(() =>
  progress.value?.steps.filter(s => s.required) ?? []
)

const recommendedSteps = computed(() =>
  progress.value?.steps.filter(s => !s.required) ?? []
)

const requiredProgress = computed(() => {
  if (!progress.value) return 0
  return Math.round((progress.value.required_complete / progress.value.required_total) * 100)
})

const headerLinks = computed(() => [
  {
    label: 'View Site',
    icon: 'i-heroicons-arrow-top-right-on-square',
    to: publicUrl.value,
    target: '_blank',
    color: 'neutral' as const,
    variant: 'outline' as const,
    disabled: !publicUrl.value
  }
])

// ─── Helpers ─────────────────────────────────────────────────────────────────
const addressLabel = (location: BusinessLocation) =>
  location.address?.addressLines?.join(', ') || ''

// ─── Publish action ───────────────────────────────────────────────────────────
async function publishSite() {
  if (publishing.value) return
  publishing.value = true
  try {
    await $fetch(`/api/sites/${siteId}/settings`, {
      method: 'PATCH',
      body: { last_published_at: new Date().toISOString() }
    })
    // Refresh site data so last_published_at is populated
    await loadSiteData()
    toast.add({ description: '🎉 Your site is now live!', color: 'success' })
  } catch (err) {
    toast.add({
      description: err instanceof Error ? err.message : 'Failed to publish site',
      color: 'error'
    })
  } finally {
    publishing.value = false
  }
}

// ─── Data loading ─────────────────────────────────────────────────────────────
async function loadSiteData() {
  loading.value = true
  error.value = null

  try {
    const [settingsResponse, locationsResponse, menuResponse, googleResponse, progressResponse] = await Promise.all([
      $fetch<ApiRecord>(`/api/sites/${siteId}/settings`),
      $fetch<ApiRecord>(`/api/sites/${siteId}/locations`),
      $fetch<ApiRecord>(`/api/public/sites/${siteId}/menus`),
      $fetch<ApiRecord>(`/api/public/sites/${siteId}/google-business`),
      $fetch<ApiRecord>(`/api/sites/${siteId}/setup-progress`)
    ])

    if (!settingsResponse.success) throw new Error('Failed to load site settings')
    if (!locationsResponse.success) throw new Error('Failed to load locations')

    site.value = settingsResponse.settings
    locations.value = locationsResponse.locations
    menuItemsCount.value =
      menuResponse.success && Array.isArray(menuResponse.menu?.items)
        ? menuResponse.menu.items.length
        : 0
    reviewCount.value = Array.isArray(googleResponse.reviews) ? googleResponse.reviews.length : 0

    if (progressResponse.success) {
      progress.value = progressResponse.progress as SetupProgress
    }
  } catch (err) {
    error.value = err instanceof Error ? err.message : 'Failed to load dashboard data'
  } finally {
    loading.value = false
  }
}

onMounted(loadSiteData)

useSeoMeta({ title: 'Site Overview | KrabiClaw Dashboard', robots: 'noindex, nofollow' })
</script>
