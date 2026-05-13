<template>
  <UPage>
    <UPageHeader
      title="Launch"
      description="Check what is ready before this website goes live."
      :links="headerLinks"
    />

    <UPageBody>
      <div v-if="loading" class="space-y-4">
        <USkeleton class="h-32 w-full" />
        <USkeleton class="h-48 w-full" />
        <div class="grid gap-4 lg:grid-cols-2">
          <USkeleton class="h-40" />
          <USkeleton class="h-40" />
        </div>
      </div>

      <UAlert
        v-else-if="error"
        color="error"
        variant="soft"
        icon="i-heroicons-exclamation-triangle"
        :description="error"
      />

      <div v-else-if="readiness" class="space-y-6">
        <UCard>
          <div class="flex flex-col gap-6 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <UBadge :color="readiness.overall_ready ? 'success' : 'warning'" variant="soft">
                {{ readiness.overall_ready ? 'Ready' : 'Needs work' }}
              </UBadge>
              <h2 class="mt-3 text-3xl font-semibold text-highlighted">{{ readinessScore }}% complete</h2>
              <p class="mt-2 text-sm text-muted">
                {{ readiness.missing_critical }} critical and {{ readiness.missing_optional }} optional item{{ readiness.missing_optional === 1 ? '' : 's' }} remaining.
              </p>
            </div>

            <div class="w-full max-w-sm">
              <UProgress :model-value="readinessScore" />
              <div class="mt-4 grid grid-cols-3 gap-3 text-center">
                <div>
                  <p class="text-2xl font-semibold text-highlighted">{{ completedCount }}</p>
                  <p class="text-xs text-muted">Done</p>
                </div>
                <div>
                  <p class="text-2xl font-semibold text-highlighted">{{ readiness.missing_critical }}</p>
                  <p class="text-xs text-muted">Critical</p>
                </div>
                <div>
                  <p class="text-2xl font-semibold text-highlighted">{{ readiness.missing_optional }}</p>
                  <p class="text-xs text-muted">Optional</p>
                </div>
              </div>
            </div>
          </div>
        </UCard>

        <UCard v-if="readiness.action_items.length > 0">
          <template #header>
            <h2 class="font-semibold text-highlighted">Action Items</h2>
          </template>

          <div class="divide-y divide-default">
            <div
              v-for="item in readiness.action_items"
              :key="`${item.section}-${item.item}`"
              class="flex flex-col gap-3 py-4 first:pt-0 last:pb-0 md:flex-row md:items-center md:justify-between"
            >
              <div class="min-w-0">
                <div class="flex flex-wrap items-center gap-2">
                  <UBadge :color="item.priority === 'critical' ? 'error' : 'warning'" variant="soft" size="xs">
                    {{ item.priority }}
                  </UBadge>
                  <span class="text-xs text-muted">{{ item.section }}</span>
                </div>
                <p class="mt-2 font-medium text-highlighted">{{ item.description }}</p>
              </div>

              <UButton
                v-if="item.action_url"
                :to="item.action_url"
                icon="i-heroicons-arrow-right"
                trailing
                color="neutral"
                variant="soft"
              >
                Fix
              </UButton>
            </div>
          </div>
        </UCard>

        <div class="grid gap-4 lg:grid-cols-2">
          <UCard
            v-for="section in readinessSections"
            :key="section.key"
          >
            <template #header>
              <div class="flex items-center justify-between gap-4">
                <h2 class="font-semibold text-highlighted">{{ section.label }}</h2>
                <UBadge :color="section.complete ? 'success' : 'warning'" variant="soft">
                  {{ section.complete ? 'Complete' : 'Incomplete' }}
                </UBadge>
              </div>
            </template>

            <div class="space-y-3">
              <div
                v-for="item in section.items"
                :key="item.label"
                class="flex items-center justify-between gap-4"
              >
                <span class="text-sm text-default">{{ item.label }}</span>
                <UIcon
                  :name="item.checked ? 'i-heroicons-check-circle' : 'i-heroicons-x-circle'"
                  :class="item.checked ? 'text-success' : 'text-muted'"
                  class="size-5 shrink-0"
                />
              </div>
            </div>
          </UCard>
        </div>
      </div>
    </UPageBody>
  </UPage>
</template>

<script setup lang="ts">
definePageMeta({ layout: 'dashboard' })

const route = useRoute()
const siteId = route.params.siteId as string

const loading = ref(true)
const error = ref<string | null>(null)
const readiness = ref<any>(null)
const siteUrl = ref('')

const headerLinks = computed(() => [
  { label: 'Settings', icon: 'i-heroicons-cog-6-tooth', to: `/dashboard/sites/${siteId}/settings`, color: 'neutral' as const, variant: 'soft' as const },
  { label: 'View Site', icon: 'i-heroicons-arrow-top-right-on-square', to: siteUrl.value, target: '_blank', color: 'neutral' as const, variant: 'outline' as const, disabled: !siteUrl.value }
])

const totalLaunchItems = computed(() =>
  readinessSections.value.reduce((total, section) => total + section.items.length, 0)
)

const completedCount = computed(() =>
  readinessSections.value.reduce((total, section) => total + section.items.filter(item => item.checked).length, 0)
)

const readinessScore = computed(() => {
  if (!totalLaunchItems.value) return 0
  return Math.round((completedCount.value / totalLaunchItems.value) * 100)
})

const labelize = (key: string) =>
  key.split('_').map(part => part.charAt(0).toUpperCase() + part.slice(1)).join(' ')

const readinessSections = computed(() => {
  if (!readiness.value?.sections) return []

  return Object.entries(readiness.value.sections).map(([key, section]: [string, any]) => {
    const items = Object.entries(section.items || {}).map(([itemKey, checked]) => ({
      label: labelize(itemKey),
      checked: Boolean(checked)
    }))

    return {
      key,
      label: labelize(key),
      items,
      complete: items.every(item => item.checked)
    }
  })
})

const loadReadiness = async () => {
  loading.value = true
  error.value = null
  try {
    const [readinessResponse, settingsResponse] = await Promise.all([
      $fetch<any>(`/api/sites/${siteId}/launch-readiness`),
      $fetch<any>(`/api/sites/${siteId}/settings`)
    ])

    if (!readinessResponse.success) throw new Error('Failed to load launch readiness')
    if (!settingsResponse.success) throw new Error('Failed to load site settings')

    readiness.value = readinessResponse.launch_readiness
    siteUrl.value = settingsResponse.settings.public_url
  } catch (err) {
    error.value = err instanceof Error ? err.message : 'Failed to load launch readiness'
  } finally {
    loading.value = false
  }
}

onMounted(loadReadiness)

useSeoMeta({ title: 'Launch | KrabiClaw Dashboard', robots: 'noindex, nofollow' })
</script>
