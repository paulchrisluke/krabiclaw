<template>
  <DashboardLeafPanel
    :id="`integration-google-maps-${String(route.params.locationSlug)}`"
    :title="location?.title ?? 'Google Maps'"
    :ready="integrations.summary.value !== undefined"
    :saving="saving"
    :disabled="!candidate"
    :error="error"
    :footer="Boolean(candidate)"
    save-label="Connect this place"
    @cancel="candidate = null"
    @save="connect"
  >
    <UAlert v-if="!location" color="error" variant="soft" icon="i-lucide-map-pin-off" description="This business has no active location at this address." />
    <div v-else class="space-y-6">
      <UCard v-if="location.google_place_id && !searching" variant="subtle">
        <p class="font-semibold text-highlighted">Connected to Google Maps</p>
        <dl class="mt-4 grid grid-cols-2 gap-4 text-sm">
          <div><dt class="text-muted">Rating</dt><dd class="mt-1 font-medium text-highlighted">{{ location.rating ?? 'No rating yet' }}</dd></div>
          <div><dt class="text-muted">Reviews</dt><dd class="mt-1 font-medium text-highlighted">{{ location.review_count ?? 0 }}</dd></div>
          <div class="col-span-2"><dt class="text-muted">Last updated from Google</dt><dd class="mt-1 font-medium text-highlighted">{{ location.last_synced_at ? new Date(location.last_synced_at).toLocaleString() : 'Not yet' }}</dd></div>
        </dl>
        <p class="mt-4 text-sm text-muted">Rating and reviews update from Google every week. Your address, phone, hours and timezone are yours to edit and are never changed unless you re-import them.</p>
        <div class="mt-5 flex flex-wrap gap-3">
          <UButton icon="i-lucide-refresh-cw" color="neutral" variant="outline" @click="confirmingReimport = true">Re-import details from Google Maps</UButton>
          <UButton color="neutral" variant="ghost" @click="searching = true">Connect a different place</UButton>
        </div>
      </UCard>

      <template v-else>
        <UFormField label="Find this location on Google Maps" hint="Or paste a Google Maps link">
          <div class="flex gap-2">
            <UInput v-model="lookup" size="xl" class="w-full" placeholder="Business name and town" @keydown.enter.prevent="find" />
            <UButton size="xl" :loading="finding" :disabled="!lookup.trim()" @click="find">Find</UButton>
          </div>
        </UFormField>

        <UCard v-if="candidate" variant="subtle">
          <p class="text-sm text-muted">Is this {{ location.title }}?</p>
          <p class="mt-2 font-semibold text-highlighted">{{ candidate.name }}</p>
          <p v-if="candidateAddress" class="mt-1 text-sm text-default">{{ candidateAddress }}</p>
          <p v-if="candidate.phone" class="mt-1 text-sm text-default">{{ candidate.phone }}</p>
          <p class="mt-1 text-sm text-default">{{ candidate.rating ? `${candidate.rating} ★ · ${candidate.ratingCount ?? 0} reviews` : 'No reviews yet' }}</p>
          <ULink v-if="candidate.mapsUrl" :to="candidate.mapsUrl" target="_blank" class="mt-2 inline-block text-sm text-primary">View on Google Maps</ULink>
          <p class="mt-4 text-sm text-muted">Connecting imports its address, phone, opening hours, timezone, rating and reviews into this location.</p>
        </UCard>
      </template>
    </div>

    <UModal v-model:open="confirmingReimport" title="Re-import details from Google Maps?">
      <template #body>
        <p class="text-sm text-default">This replaces {{ location?.title }}'s <strong>address, phone, website, opening hours and timezone</strong> with what Google Maps has now. Anything you edited in KrabiClaw is overwritten.</p>
      </template>
      <template #footer>
        <div class="flex w-full justify-end gap-2">
          <UButton color="neutral" variant="ghost" @click="confirmingReimport = false">Cancel</UButton>
          <UButton :loading="saving" @click="reimport">Replace with Google Maps details</UButton>
        </div>
      </template>
    </UModal>
  </DashboardLeafPanel>
</template>

<script setup lang="ts">
import { formatPostalAddress, parsePostalAddress } from '~/utils/postal-address'
import { integrationsKey } from '../../integrations.vue'

definePageMeta({ layout: 'dashboard' })

interface PlacePreview {
  placeId: string
  name: string
  address: unknown
  phone: string | null
  mapsUrl: string | null
  rating: number | null
  ratingCount: number | null
}

const route = useRoute()
const integrations = inject(integrationsKey)!
const dashboardApi = useDashboardApi()
const location = computed(() => integrations.summary.value?.google_maps.find(candidate => candidate.slug === route.params.locationSlug) ?? null)

const isPreview = (value: unknown): value is { preview: PlacePreview } =>
  isRecord(value) && isRecord(value.preview) && typeof value.preview.placeId === 'string' && typeof value.preview.name === 'string'
const isSuccess = (value: unknown): value is { success: true } => isRecord(value) && value.success === true

const lookup = ref('')
const candidate = ref<PlacePreview | null>(null)
const candidateAddress = computed(() => formatPostalAddress(parsePostalAddress(candidate.value?.address)))
const searching = ref(false)
const finding = ref(false)
const saving = ref(false)
const confirmingReimport = ref(false)
const error = ref('')

async function find() {
  const value = lookup.value.trim()
  if (!value) return
  finding.value = true
  error.value = ''
  candidate.value = null
  try {
    const isUrl = /^https?:\/\//i.test(value)
    const response = await dashboardApi('/api/dashboard/onboarding/places-preview', {
      method: 'POST', body: isUrl ? { mapsUrl: value } : { query: value }, validate: isPreview,
    })
    candidate.value = response.preview
  } catch (cause) {
    error.value = getErrorMessage(cause, 'Could not find that place on Google Maps.')
  } finally {
    finding.value = false
  }
}

async function importPlace(placeId?: string) {
  if (!location.value) return
  saving.value = true
  error.value = ''
  try {
    await dashboardApi('/api/integrations/google-places/sync', {
      method: 'POST',
      body: { organizationId: integrations.organizationId, locationId: location.value.id, ...(placeId ? { placeId } : {}) },
      validate: isSuccess,
    })
    candidate.value = null
    searching.value = false
    lookup.value = ''
    confirmingReimport.value = false
    await integrations.refresh()
  } catch (cause) {
    error.value = getErrorMessage(cause, 'Google Maps import failed.')
    confirmingReimport.value = false
  } finally {
    saving.value = false
  }
}

const connect = () => importPlace(candidate.value?.placeId)
const reimport = () => importPlace()
</script>
