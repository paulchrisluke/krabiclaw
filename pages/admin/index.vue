<template>
  <UDashboardPanel id="admin-addons">
    <template #header>
      <UDashboardNavbar title="Add-ons">
        <template #leading>
          <UDashboardSidebarCollapse />
        </template>
        <template #trailing>
          <UButton color="neutral" variant="ghost" size="xs" icon="i-lucide-refresh-cw" aria-label="Refresh queue" :loading="queueLoading" @click="loadQueue" />
        </template>
      </UDashboardNavbar>
    </template>

    <template #body>
      <div class="space-y-4">
        <UCard v-if="queueLoading">
          <div class="space-y-3">
            <USkeleton v-for="i in 3" :key="i" class="h-16 rounded-lg" />
          </div>
        </UCard>

        <UCard v-else-if="purchases.length === 0">
          <div class="text-center">
            <UIcon name="i-lucide-badge-check" class="mx-auto size-10 text-success mb-3" />
            <p class="font-semibold text-highlighted">All caught up</p>
            <p class="text-sm text-muted mt-1">No pending service add-ons.</p>
          </div>
        </UCard>

        <div v-else class="divide-y divide-default rounded-xl border border-default overflow-hidden">
          <div
            v-for="purchase in purchases"
            :key="purchase.id"
            class="flex items-center justify-between gap-4 px-5 py-4 bg-default hover:bg-elevated/50 transition-colors"
          >
            <div class="flex items-center gap-3 min-w-0">
              <div class="w-9 h-9 rounded-lg flex items-center justify-center shrink-0" :class="addonColor(purchase.addon_type)">
                <UIcon :name="addonIcon(purchase.addon_type)" class="size-4" />
              </div>
              <div class="min-w-0">
                <p class="font-semibold text-default">{{ addonLabel(purchase.addon_type) }}</p>
                <p class="text-sm text-muted truncate">{{ purchase.org_name }} · {{ formatDate(purchase.created_at) }}</p>
              </div>
            </div>
            <div class="flex items-center gap-2 shrink-0">
              <UButton
                v-if="purchase.org_slug"
                size="xs"
                color="neutral"
                variant="ghost"
                icon="i-lucide-external-link"
                :to="`/dashboard/${purchase.org_slug}`"
                target="_blank"
              >
                View
              </UButton>
              <UButton
                size="xs"
                color="success"
                variant="soft"
                icon="i-lucide-check"
                :loading="fulfillingId === purchase.id"
                @click="markDone(purchase.id)"
              >
                Mark done
              </UButton>
            </div>
          </div>
        </div>

        <div class="flex items-center gap-2">
          <UCheckbox v-model="showAllPurchases" label="Show fulfilled" @update:model-value="loadQueue" />
        </div>
      </div>
    </template>
  </UDashboardPanel>
</template>

<script setup lang="ts">
definePageMeta({ layout: 'dashboard', middleware: 'admin' })
useSeoMeta({ title: 'Platform Admin | KrabiClaw', robots: 'noindex, nofollow' })

const toast = useToast()

interface Purchase {
  id: string
  organization_id: string
  org_name: string
  org_slug: string | null
  addon_type: string
  fulfilled_at: string | null
  created_at: string
}

const purchases = ref<Purchase[]>([])
const queueLoading = ref(false)
const fulfillingId = ref<string | null>(null)
const showAllPurchases = ref(false)

const ADDON_LABELS: Record<string, string> = {
  translation: 'Language Translation',
  seasonal: 'Seasonal Relaunch',
  gbp_setup: 'Google Business Optimization',
}
const ADDON_ICONS: Record<string, string> = {
  translation: 'i-lucide-languages',
  seasonal: 'i-lucide-sparkles',
  gbp_setup: 'i-lucide-map-pin',
}
const ADDON_COLORS: Record<string, string> = {
  translation: 'bg-blue-50 dark:bg-blue-950/40 text-blue-600 dark:text-blue-400',
  seasonal: 'bg-amber-50 dark:bg-amber-950/40 text-amber-600 dark:text-amber-400',
  gbp_setup: 'bg-green-50 dark:bg-green-950/40 text-green-600 dark:text-green-400',
}

function addonLabel(type: string) { return ADDON_LABELS[type] ?? type }
function addonIcon(type: string) { return ADDON_ICONS[type] ?? 'i-lucide-shopping-bag' }
function addonColor(type: string) { return ADDON_COLORS[type] ?? 'bg-muted text-muted' }

async function loadQueue() {
  queueLoading.value = true
  try {
    const res = await $fetch<{ purchases: Purchase[] }>(`/api/admin/fulfillment?all=${showAllPurchases.value ? '1' : '0'}`)
    purchases.value = res.purchases
  } catch {
    toast.add({ title: 'Failed to load queue', color: 'error' })
  } finally {
    queueLoading.value = false
  }
}

async function markDone(id: string) {
  fulfillingId.value = id
  try {
    await $fetch(`/api/admin/fulfillment/${id}/done`, { method: 'POST' })
    toast.add({ title: 'Marked as fulfilled', color: 'success' })
    await loadQueue()
  } catch {
    toast.add({ title: 'Failed to mark done', color: 'error' })
  } finally {
    fulfillingId.value = null
  }
}

onMounted(loadQueue)
</script>
