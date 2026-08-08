<template>
  <UDashboardPanel id="admin-service-addon-history">
    <template #header>
      <UDashboardNavbar title="Historical service add-on audit (read-only)">
        <template #leading>
          <DashboardSidebarCollapseButton />
        </template>
        <template #trailing>
          <UButton color="neutral" variant="ghost" size="xs" icon="i-lucide-refresh-cw" aria-label="Refresh historical records" :loading="historyLoading" @click="loadHistory" />
        </template>
      </UDashboardNavbar>
    </template>

    <template #body>
      <div class="space-y-4">
        <p class="text-sm text-muted">
          Retired service add-on records are preserved for audit only. New service add-on purchases and fulfillment actions are no longer available.
        </p>

        <UCard v-if="historyLoading">
          <div class="space-y-3">
            <USkeleton v-for="i in 3" :key="i" class="h-16 rounded-lg" />
          </div>
        </UCard>

        <UCard v-else-if="records.length === 0">
          <div class="text-center">
            <UIcon name="i-lucide-badge-check" class="mx-auto size-10 text-success mb-3" />
            <p class="font-semibold text-highlighted">Historical audit is empty</p>
            <p class="text-sm text-muted mt-1">No historical service add-on records found.</p>
          </div>
        </UCard>

        <div v-else class="divide-y divide-default rounded-xl border border-default overflow-hidden">
          <div
            v-for="record in records"
            :key="record.id"
            class="flex items-center justify-between gap-4 px-5 py-4 bg-default hover:bg-elevated/50 transition-colors"
          >
            <div class="flex items-center gap-3 min-w-0">
              <div class="w-9 h-9 rounded-lg flex items-center justify-center shrink-0" :class="historicalAddonColor(record.addon_type)">
                <UIcon :name="historicalAddonIcon(record.addon_type)" class="size-4" />
              </div>
              <div class="min-w-0">
                <p class="font-semibold text-default">{{ historicalAddonLabel(record.addon_type) }}</p>
                <p class="text-sm text-muted truncate">{{ record.org_name }} · {{ formatDate(record.created_at) }}</p>
                <p v-if="record.fulfilled_at" class="text-xs text-success mt-1">
                  Historical status: fulfilled · {{ formatDate(record.fulfilled_at) }}
                </p>
                <p v-else class="text-xs text-warning mt-1">Historical status: unfulfilled</p>
              </div>
            </div>
            <div class="flex items-center gap-2 shrink-0">
              <UButton
                v-if="record.org_slug"
                size="xs"
                color="neutral"
                variant="ghost"
                icon="i-lucide-external-link"
                :to="`/dashboard/${record.org_slug}`"
                target="_blank"
              >
                View
              </UButton>
            </div>
          </div>
        </div>
      </div>
    </template>
  </UDashboardPanel>
</template>

<script setup lang="ts">
definePageMeta({ layout: 'dashboard' })
useSeoMeta({ title: 'Platform Admin | KrabiClaw', robots: 'noindex, nofollow' })

const toast = useToast()

interface HistoricalServiceAddonRecord {
  id: string
  organization_id: string
  org_name: string
  org_slug: string | null
  addon_type: string
  fulfilled_at: string | null
  created_at: string
}

const isHistoricalRecordsResponse = (value: unknown): value is { purchases: HistoricalServiceAddonRecord[] } =>
  isRecord(value)
  && Array.isArray(value.purchases)
  && value.purchases.every(purchase =>
    isRecord(purchase)
    && typeof purchase.id === 'string'
    && typeof purchase.organization_id === 'string'
    && typeof purchase.addon_type === 'string'
    && typeof purchase.created_at === 'string'
    && (purchase.fulfilled_at === null || typeof purchase.fulfilled_at === 'string'),
  )

const records = ref<HistoricalServiceAddonRecord[]>([])
const historyLoading = ref(false)

const HISTORICAL_ADDON_LABELS: Record<string, string> = {
  seasonal: 'Seasonal Relaunch',
  gbp_setup: 'Google Business Optimization',
}
const HISTORICAL_ADDON_ICONS: Record<string, string> = {
  seasonal: 'i-lucide-sparkles',
  gbp_setup: 'i-lucide-map-pin',
}
const HISTORICAL_ADDON_COLORS: Record<string, string> = {
  seasonal: 'bg-amber-50 dark:bg-amber-950/40 text-amber-600 dark:text-amber-400',
  gbp_setup: 'bg-green-50 dark:bg-green-950/40 text-green-600 dark:text-green-400',
}

function historicalAddonLabel(type: string) { return HISTORICAL_ADDON_LABELS[type] ?? type }
function historicalAddonIcon(type: string) { return HISTORICAL_ADDON_ICONS[type] ?? 'i-lucide-shopping-bag' }
function historicalAddonColor(type: string) { return HISTORICAL_ADDON_COLORS[type] ?? 'bg-muted text-muted' }

async function loadHistory() {
  historyLoading.value = true
  try {
    const res = await applicationFetch<{ purchases: HistoricalServiceAddonRecord[] }>(
      '/api/admin/fulfillment?all=1',
      { validate: isHistoricalRecordsResponse },
    )
    records.value = res.purchases
  } catch {
    toast.add({ title: 'Failed to load historical service add-on records', color: 'error' })
  } finally {
    historyLoading.value = false
  }
}

onMounted(loadHistory)
</script>
