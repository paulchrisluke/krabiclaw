<template>
  <DashboardLeafPanel
    :id="`integration-google-maps-${String(route.params.locationSlug)}`"
    :title="location?.title ?? 'Google Maps'"
    :ready="integrations.summary.value !== undefined"
    :saving="saving"
    :error="error"
    :footer="false"
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

      <!-- Picking a prediction is the confirmation: it connects that place. -->
      <UFormField v-else label="Find this location on Google Maps" description="Picking it connects it, and imports its address, phone, opening hours, timezone, rating and reviews into this location.">
        <GooglePlacePicker :model-value="location.title" @select="connect" />
        <p v-if="saving" class="mt-2 text-sm text-muted" aria-live="polite">Connecting to Google Maps…</p>
      </UFormField>
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
import GooglePlacePicker from '~/lib/components/workspace/location/GooglePlacePicker.vue'
import type { OnboardingPlacePreview } from '~/composables/useOnboardingFlow'
import { integrationsKey } from '../../integrations.vue'

definePageMeta({ layout: 'dashboard' })

const route = useRoute()
const integrations = inject(integrationsKey)!
const dashboardApi = useDashboardApi()
const location = computed(() => integrations.summary.value?.google_maps.find(candidate => candidate.slug === route.params.locationSlug) ?? null)

const isSuccess = (value: unknown): value is { success: true } => isRecord(value) && value.success === true

const searching = ref(false)
const saving = ref(false)
const confirmingReimport = ref(false)
const error = ref('')

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
    searching.value = false
    confirmingReimport.value = false
    await integrations.refresh()
  } catch (cause) {
    error.value = getErrorMessage(cause, 'Google Maps import failed.')
    confirmingReimport.value = false
  } finally {
    saving.value = false
  }
}

const connect = (place: OnboardingPlacePreview) => importPlace(place.placeId)
const reimport = () => importPlace()
</script>
