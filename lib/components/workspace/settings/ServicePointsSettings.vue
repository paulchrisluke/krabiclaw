<template>
  <div class="space-y-6">
    <div>
      <h2 v-if="!embedded" class="text-3xl font-semibold text-highlighted">Service points</h2>
      <p class="mt-2 text-base text-muted">
        Name each ordering destination in the words your team uses, such as Table 12, Patio North, Bar 3, or Pickup Shelf.
      </p>
    </div>

    <UAlert
      v-if="revealedOrderingUrl"
      color="warning"
      variant="soft"
      icon="i-lucide-key-round"
      title="Copy this Ordering QR URL now"
      description="For security, the credential is shown only after provisioning or rotation. It cannot be recovered later."
    >
      <template #actions>
        <div class="flex min-w-0 flex-1 gap-2">
          <UInput :model-value="revealedOrderingUrl" readonly class="min-w-0 flex-1" />
          <UButton icon="i-lucide-copy" color="neutral" variant="outline" @click="copyOrderingUrl">Copy</UButton>
        </div>
      </template>
    </UAlert>

    <form class="flex gap-2" @submit.prevent="createPoint">
      <UFormField label="New service point" class="min-w-0 flex-1">
        <UInput v-model="newLabel" placeholder="Table 12, Patio North, Pickup Shelf..." maxlength="120" class="w-full" />
      </UFormField>
      <UButton type="submit" class="self-end" icon="i-lucide-plus" :loading="creating" :disabled="!newLabel.trim()">
        Add
      </UButton>
    </form>

    <div v-if="loading" class="space-y-3">
      <USkeleton v-for="index in 3" :key="index" class="h-28 rounded-xl" />
    </div>
    <UAlert v-else-if="loadError" color="error" variant="soft" :description="loadError" />
    <UAlert
      v-else-if="!servicePoints.length"
      color="neutral"
      variant="soft"
      icon="i-lucide-map-pinned"
      title="No service points yet"
      description="Add the first place where a guest can receive an order."
    />
    <div v-else class="space-y-3">
      <UCard v-for="point in servicePoints" :key="point.id" variant="subtle">
        <div class="flex flex-col gap-4">
          <div class="flex flex-wrap items-start justify-between gap-3">
            <UInput v-model="point.label" maxlength="120" class="min-w-56 flex-1" aria-label="Service point label" />
            <UBadge :color="point.status === 'active' ? 'success' : 'warning'" variant="soft">
              {{ point.status === 'active' ? 'Active' : 'Paused' }}
            </UBadge>
          </div>
          <div class="flex flex-wrap gap-2">
            <UButton size="sm" color="neutral" variant="outline" icon="i-lucide-save" @click="saveLabel(point)">Save label</UButton>
            <UButton
              size="sm"
              color="neutral"
              variant="outline"
              :icon="point.status === 'active' ? 'i-lucide-pause' : 'i-lucide-play'"
              @click="setPointStatus(point, point.status === 'active' ? 'paused' : 'active')"
            >
              {{ point.status === 'active' ? 'Pause' : 'Resume' }}
            </UButton>
            <UButton
              v-if="!point.qr_credential"
              size="sm"
              icon="i-lucide-qr-code"
              @click="changeCredential(point, 'provision')"
            >
              Provision QR
            </UButton>
            <template v-else>
              <UButton size="sm" color="neutral" variant="outline" icon="i-lucide-rotate-cw" @click="changeCredential(point, 'rotate')">
                Rotate QR
              </UButton>
              <UButton size="sm" color="error" variant="soft" icon="i-lucide-ban" @click="revokeCredential(point)">
                Revoke QR
              </UButton>
              <span class="self-center text-xs text-muted">QR version {{ point.qr_credential.version }}</span>
            </template>
          </div>
        </div>
      </UCard>
    </div>
  </div>
</template>

<script setup lang="ts">
import { getErrorMessage } from '~/utils/errors'

interface ServicePoint {
  id: string
  label: string
  status: 'active' | 'paused'
  qr_credential: { id: string; version: number; created_at: string } | null
}

interface ServicePointsResponse {
  service_points: ServicePoint[]
}

interface ServicePointResponse {
  service_point: ServicePoint
  ordering_qr?: { ordering_url: string }
}

const props = defineProps<{
  siteId: string
  locationId: string
  embedded?: boolean
}>()

const dashboardApi = useDashboardApi()
const toast = useToast()
const loading = ref(true)
const creating = ref(false)
const loadError = ref<string | null>(null)
const newLabel = ref('')
const servicePoints = ref<ServicePoint[]>([])
const revealedOrderingUrl = ref<string | null>(null)
const collectionPath = computed(() => `/api/sites/${props.siteId}/locations/${props.locationId}/service-points`)

const isServicePoint = (value: unknown): value is ServicePoint => isRecord(value)
  && typeof value.id === 'string'
  && typeof value.label === 'string'
  && (value.status === 'active' || value.status === 'paused')
  && (value.qr_credential === null || (isRecord(value.qr_credential)
    && typeof value.qr_credential.id === 'string'
    && typeof value.qr_credential.version === 'number'
    && typeof value.qr_credential.created_at === 'string'))
const isServicePointsResponse = (value: unknown): value is ServicePointsResponse => isRecord(value)
  && Array.isArray(value.service_points)
  && value.service_points.every(isServicePoint)
const isServicePointResponse = (value: unknown): value is ServicePointResponse => isRecord(value)
  && isServicePoint(value.service_point)
const isCredentialResponse = (value: unknown): value is ServicePointResponse => isServicePointResponse(value)
  && isRecord(value.ordering_qr)
  && typeof value.ordering_qr.ordering_url === 'string'
const isRevocationResponse = (value: unknown): value is { revoked: boolean } => isRecord(value)
  && typeof value.revoked === 'boolean'

function replacePoint(updated: ServicePoint) {
  const index = servicePoints.value.findIndex(point => point.id === updated.id)
  if (index >= 0) servicePoints.value[index] = updated
}

async function loadPoints() {
  loading.value = true
  loadError.value = null
  try {
    const response = await dashboardApi<ServicePointsResponse>(collectionPath.value, {
      validate: isServicePointsResponse,
    })
    servicePoints.value = response.service_points
  } catch (error) {
    loadError.value = getErrorMessage(error, 'Failed to load service points')
  } finally {
    loading.value = false
  }
}

async function createPoint() {
  const label = newLabel.value.trim()
  if (!label) return
  creating.value = true
  try {
    const response = await dashboardApi<ServicePointResponse>(collectionPath.value, {
      method: 'POST',
      body: { label },
      validate: isServicePointResponse,
    })
    servicePoints.value.push(response.service_point)
    servicePoints.value.sort((a, b) => a.label.localeCompare(b.label))
    newLabel.value = ''
    toast.add({ description: 'Service point added', color: 'success' })
  } catch (error) {
    toast.add({ description: getErrorMessage(error, 'Failed to add service point'), color: 'error' })
  } finally {
    creating.value = false
  }
}

async function patchPoint(point: ServicePoint, body: Record<string, unknown>, successMessage: string) {
  try {
    const response = await dashboardApi<ServicePointResponse>(`${collectionPath.value}/${point.id}`, {
      method: 'PATCH',
      body,
      validate: isServicePointResponse,
    })
    replacePoint(response.service_point)
    toast.add({ description: successMessage, color: 'success' })
  } catch (error) {
    toast.add({ description: getErrorMessage(error, 'Failed to update service point'), color: 'error' })
    await loadPoints()
  }
}

async function saveLabel(point: ServicePoint) {
  await patchPoint(point, { label: point.label.trim() }, 'Service point label saved')
}

async function setPointStatus(point: ServicePoint, status: ServicePoint['status']) {
  await patchPoint(point, { status }, status === 'paused' ? 'Service point paused' : 'Service point resumed')
}

async function changeCredential(point: ServicePoint, mode: 'provision' | 'rotate') {
  try {
    const response = await dashboardApi<ServicePointResponse>(`${collectionPath.value}/${point.id}/credential`, {
      method: 'POST',
      body: { mode },
      validate: isCredentialResponse,
    })
    replacePoint(response.service_point)
    revealedOrderingUrl.value = response.ordering_qr?.ordering_url ?? null
    toast.add({ description: mode === 'rotate' ? 'Ordering QR rotated' : 'Ordering QR provisioned', color: 'success' })
  } catch (error) {
    toast.add({ description: getErrorMessage(error, 'Failed to change Ordering QR'), color: 'error' })
  }
}

async function revokeCredential(point: ServicePoint) {
  try {
    await dashboardApi<{ revoked: boolean }>(`${collectionPath.value}/${point.id}/credential`, {
      method: 'DELETE',
      validate: isRevocationResponse,
    })
    revealedOrderingUrl.value = null
    await loadPoints()
    toast.add({ description: 'Ordering QR revoked', color: 'success' })
  } catch (error) {
    toast.add({ description: getErrorMessage(error, 'Failed to revoke Ordering QR'), color: 'error' })
  }
}

async function copyOrderingUrl() {
  if (!revealedOrderingUrl.value) return
  await navigator.clipboard.writeText(revealedOrderingUrl.value)
  toast.add({ description: 'Ordering QR URL copied', color: 'success' })
}

await loadPoints()
</script>
