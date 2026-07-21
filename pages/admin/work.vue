<template>
  <UDashboardPanel id="admin-work">
    <template #header>
      <UDashboardNavbar title="Work Queue">
        <template #leading>
          <UDashboardSidebarCollapse />
        </template>
        <template #trailing>
          <UButton color="neutral" variant="ghost" size="xs" :loading="workLoading" @click="loadWorkRequests">
            <UIcon name="i-lucide-refresh-cw" class="size-4" />
          </UButton>
        </template>
      </UDashboardNavbar>
    </template>

    <template #body>
      <div class="space-y-4">
        <div class="flex items-center justify-between">
          <UCheckbox v-model="workShowDone" label="Show completed" @update:model-value="loadWorkRequests" />
        </div>

        <UCard v-if="workLoading">
          <div class="space-y-3"><USkeleton v-for="i in 4" :key="i" class="h-16 rounded-lg" /></div>
        </UCard>

        <UCard v-else-if="workRequests.length === 0">
          <div class="text-center py-4">
            <UIcon name="i-lucide-list-todo" class="mx-auto size-10 text-muted mb-3" />
            <p class="font-semibold text-highlighted">No work requests</p>
            <p class="text-sm text-muted mt-1">Managed clients submit requests from their dashboard or via ChowBot.</p>
          </div>
        </UCard>

        <div v-else class="divide-y divide-default rounded-xl border border-default overflow-hidden">
          <div
            v-for="req in workRequests"
            :key="req.id"
            class="px-5 py-4 bg-default hover:bg-elevated/50 transition-colors"
          >
            <div class="flex items-start justify-between gap-4">
              <div class="flex items-start gap-3 min-w-0 flex-1">
                <div class="mt-0.5 w-8 h-8 rounded-lg flex items-center justify-center shrink-0" :class="workTypeColor(req.type)">
                  <UIcon :name="workTypeIcon(req.type)" class="size-4" />
                </div>
                <div class="min-w-0 flex-1">
                  <div class="flex items-center gap-2 flex-wrap">
                    <p class="font-semibold text-default">{{ req.title }}</p>
                    <UBadge :label="req.priority" :color="priorityColor(req.priority)" variant="soft" size="xs" class="capitalize" />
                    <UBadge :label="req.source" color="neutral" variant="soft" size="xs" />
                  </div>
                  <p class="text-sm text-muted truncate mt-0.5">
                    {{ req.brand_name || req.org_name }} · {{ formatDate(req.created_at) }}
                  </p>
                  <p v-if="req.description" class="text-sm text-muted mt-1 line-clamp-2">{{ req.description }}</p>
                  <p v-if="req.notes" class="text-xs text-primary mt-1 italic">Note: {{ req.notes }}</p>
                </div>
              </div>
              <div class="flex items-center gap-2 shrink-0">
                <USelect
                  :model-value="req.status"
                  :items="[
                    { label: 'Pending', value: 'pending' },
                    { label: 'In Progress', value: 'in_progress' },
                    { label: 'Done', value: 'done' },
                    { label: 'Cancelled', value: 'cancelled' },
                  ]"
                  size="xs"
                  class="w-32"
                  @update:model-value="updateWorkRequest(req.id, { status: $event })"
                />
                <UButton
                  v-if="req.org_slug"
                  size="xs"
                  color="neutral"
                  variant="ghost"
                  icon="i-lucide-external-link"
                  :to="`/dashboard/${req.org_slug}`"
                  target="_blank"
                />
              </div>
            </div>
          </div>
        </div>
      </div>
    </template>
  </UDashboardPanel>
</template>

<script setup lang="ts">
definePageMeta({ layout: 'dashboard', middleware: 'admin' })
useSeoMeta({ title: 'Work Queue | KrabiClaw Admin', robots: 'noindex, nofollow' })

const toast = useToast()

interface WorkRequest {
  id: string; type: string; title: string; description: string | null
  status: string; priority: string; source: string; notes: string | null
  org_name: string; org_slug: string | null; brand_name: string | null
  created_at: string; completed_at: string | null
}

const workRequests = ref<WorkRequest[]>([])
const workLoading = ref(false)
const workShowDone = ref(false)

const WORK_TYPE_ICONS: Record<string, string> = {
  content_update: 'i-lucide-file-text', menu_update: 'i-lucide-utensils',
  translation: 'i-lucide-languages', seo: 'i-lucide-trending-up',
  google_business: 'i-lucide-map-pin', seasonal: 'i-lucide-sparkles',
  photo_update: 'i-lucide-image', social_media: 'i-lucide-share-2',
  technical: 'i-lucide-wrench', other: 'i-lucide-circle-help',
}
const WORK_TYPE_COLORS: Record<string, string> = {
  content_update: 'bg-blue-50 dark:bg-blue-950/40 text-blue-600',
  menu_update: 'bg-amber-50 dark:bg-amber-950/40 text-amber-600',
  translation: 'bg-violet-50 dark:bg-violet-950/40 text-violet-600',
  seo: 'bg-green-50 dark:bg-green-950/40 text-green-600',
  google_business: 'bg-red-50 dark:bg-red-950/40 text-red-500',
  seasonal: 'bg-orange-50 dark:bg-orange-950/40 text-orange-500',
  photo_update: 'bg-pink-50 dark:bg-pink-950/40 text-pink-500',
  social_media: 'bg-sky-50 dark:bg-sky-950/40 text-sky-500',
  technical: 'bg-slate-50 dark:bg-slate-950/40 text-slate-500',
  other: 'bg-muted text-muted',
}
const PRIORITY_COLORS: Record<string, 'error' | 'warning' | 'neutral' | 'success'> = {
  urgent: 'error', high: 'warning', normal: 'neutral', low: 'success',
}

function workTypeIcon(type: string) { return WORK_TYPE_ICONS[type] ?? 'i-lucide-circle-help' }
function workTypeColor(type: string) { return WORK_TYPE_COLORS[type] ?? 'bg-muted text-muted' }
function priorityColor(p: string) { return PRIORITY_COLORS[p] ?? 'neutral' }

async function loadWorkRequests() {
  workLoading.value = true
  try {
    const res = await $fetch<{ requests: WorkRequest[] }>(`/api/admin/work-requests?done=${workShowDone.value ? '1' : '0'}`)
    workRequests.value = res.requests
  } catch {
    toast.add({ title: 'Failed to load work requests', color: 'error' })
  } finally {
    workLoading.value = false
  }
}

async function updateWorkRequest(id: string, patch: { status?: string; notes?: string }) {
  try {
    await $fetch(`/api/admin/work-requests/${id}`, { method: 'PATCH', body: patch })
    await loadWorkRequests()
  } catch {
    toast.add({ title: 'Failed to update request', color: 'error' })
  }
}

onMounted(loadWorkRequests)
</script>
