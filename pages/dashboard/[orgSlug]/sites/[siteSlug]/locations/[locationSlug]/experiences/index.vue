<template>
  <UDashboardPanel id="location-experiences">
    <template #header>
      <UDashboardNavbar title="Experiences" :toggle="false">
        <template #leading>
          <DashboardNavbarLeading v-if="locationPaths" :to="locationPaths.location" label="Location" />
        </template>
      </UDashboardNavbar>
    </template>

    <template #body>
      <UCard
        v-if="!currentLocationId"
        class="border border-dashed border-default"
        :ui="{ body: 'py-20 sm:py-20 text-center' }"
      >
        <UIcon name="i-lucide-map-pin" class="mx-auto size-10 text-muted" />
        <p class="mt-4 text-sm font-semibold text-highlighted">Choose a location first</p>
        <p class="mt-1 text-sm text-muted">Experiences are managed per location.</p>
      </UCard>

      <DashboardListEditor
        v-else
        v-model:editing="editing"
        title="Experiences"
        description="Bookable experiences at this location — a tasting menu, a chef's table, a cooking class."
        :items="listItems"
        :pending="pending"
        :error="loadError"
        empty-title="No experiences yet"
        empty-icon="i-lucide-ticket"
        add-label="Add an experience"
        @add="openCreate"
        @open="openExperience"
      >
        <template #item="{ item }">
          <button
            type="button"
            class="flex w-full items-center gap-4 text-left"
            :data-testid="`experience-${item.id}`"
            @click="openExperience(item)"
          >
            <span class="size-12 shrink-0 overflow-hidden rounded-lg bg-muted">
              <img
                v-if="coverUrl(item.row)"
                :src="coverUrl(item.row)!"
                :alt="item.row.title"
                class="h-full w-full object-cover"
              >
              <span v-else class="flex h-full w-full items-center justify-center">
                <UIcon name="i-lucide-ticket" class="size-4 text-muted" />
              </span>
            </span>
            <span class="min-w-0 flex-1">
              <span class="block truncate text-sm font-semibold text-highlighted">{{ item.row.title }}</span>
              <!--
                A summary line, the way the menu lists a dish's price — not a
                badge. Nothing else in the CMS badges a row's state, and an
                experience that is off reads as a fact about it, not an alert.
              -->
              <span class="mt-1 block truncate text-sm" :class="summary(item.row) ? 'text-muted' : 'italic text-muted'">
                {{ summary(item.row) || 'Nothing set yet' }}
              </span>
            </span>
          </button>
        </template>
      </DashboardListEditor>
    </template>
  </UDashboardPanel>
</template>

<script setup lang="ts">
import DashboardListEditor from '~/components/dashboard/DashboardListEditor.vue'
import type { Experience } from '~/server/utils/experiences'
import { formatMinorAmount } from '~/shared/prices'
import { getErrorMessage } from '~/utils/errors'

definePageMeta({ layout: 'dashboard', cmsCapabilityKey: 'location.experiences' })

const dashboardApi = useDashboardApi()
const { locationPaths } = useDashboardSiteLinks()
const siteId = await useDashboardSiteId()
const dashboardLocation = useDashboardLocation()

const currentLocationId = computed(() => dashboardLocation.currentLocationId.value)
const experiencesPath = computed(() => locationPaths.value?.experiences ?? '')
const editing = ref(false)

const isExperiencesResponse = (value: unknown): value is { experiences: Experience[] } =>
  isRecord(value)
  && Array.isArray(value.experiences)
  && value.experiences.every(experience => isRecord(experience) && typeof experience.id === 'string')

const requestEvent = useRequestEvent()
const { data, pending, error } = await useAsyncData(
  computed(() => `dashboard-location-experiences-${siteId}-${currentLocationId.value ?? 'missing'}`),
  async () => {
    const locationId = currentLocationId.value
    if (!locationId) throw createError({ statusCode: 404, statusMessage: 'Location not found' })
    // On the server the list is read straight from D1; going back out over HTTP
    // to our own endpoint would cost a round trip during render.
    if (import.meta.server) {
      if (!requestEvent) throw createError({ statusCode: 500, statusMessage: 'Request context unavailable' })
      const { loadDashboardLocationExperiences } = await import('~/server/utils/dashboard-editor-resources')
      return await loadDashboardLocationExperiences(requestEvent, siteId, locationId)
    }
    return await dashboardApi(`/api/editor/sites/${siteId}/experiences`, {
      query: { location_id: locationId },
      validate: isExperiencesResponse,
    })
  },
  { lazy: import.meta.client, watch: [currentLocationId] },
)

const loadError = computed(() => (error.value ? getErrorMessage(error.value, 'Could not load experiences') : null))
const listItems = computed(() => (data.value?.experiences ?? []).map(row => ({ id: row.id, title: row.title, row })))

function openCreate() {
  return navigateTo(`${experiencesPath.value}/new`)
}

function openExperience(item: { row: Experience }) {
  return navigateTo(`${experiencesPath.value}/${item.row.id}`)
}

/** Price, then length, then the state — but only when the state is worth saying. */
function summary(experience: Experience): string {
  const parts: string[] = []
  const price = priceLabel(experience)
  if (price) parts.push(price)
  if (experience.duration_minutes) parts.push(`${experience.duration_minutes} min`)
  if (experience.max_capacity) parts.push(`${experience.max_capacity} guests`)
  if (experience.status === 'sold_out') parts.push('Sold out')
  else if (experience.status === 'inactive') parts.push('Not bookable')
  return parts.join(' · ')
}

function coverUrl(experience: Experience): string | null {
  const media = Array.isArray(experience.media) ? experience.media : []
  const cover = media[0]
  return cover?.thumbnail_url ?? cover?.public_url ?? null
}

function priceLabel(experience: Experience): string {
  if (!experience.price) return ''
  return formatMinorAmount(experience.price.amount_minor, experience.price.currency)
}

useSeoMeta({ title: 'Experiences | KrabiClaw Dashboard', robots: 'noindex, nofollow' })
</script>
