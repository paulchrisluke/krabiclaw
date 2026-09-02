<template>
  <UButton
    v-if="actionIcon"
    class="min-h-11 min-w-11 shrink-0"
    color="neutral"
    variant="ghost"
    size="sm"
    square
    :icon="actionIcon"
    :aria-label="actionLabel"
    @click="$emit('action')"
  />
  <UButton
    v-else-if="detailParent"
    class="min-h-11 min-w-11 shrink-0"
    color="neutral"
    variant="ghost"
    size="sm"
    square
    icon="i-lucide-chevron-left"
    :aria-label="`Back to ${detailParent.label}`"
    :to="detailParent.to"
  />
  <UButton
    v-else-if="scopeParent"
    class="min-h-11 min-w-11 shrink-0"
    color="neutral"
    variant="ghost"
    size="sm"
    square
    icon="i-lucide-chevron-left"
    :aria-label="`Back to ${scopeParent.label}`"
    :to="scopeParent.to"
  />
</template>

<script setup lang="ts">
import { dashboardOrganizationParentKey, dashboardScopeHeaderModelKey } from './dashboardScopeHeaderContext'

type DashboardRoute = string | { path: string; query?: Record<string, string> }

const props = withDefaults(defineProps<{
  detailTo?: DashboardRoute | null
  detailLabel?: string
  backToOrganization?: boolean
  actionIcon?: string | null
  actionLabel?: string
}>(), {
  detailTo: null,
  detailLabel: 'Back',
  backToOrganization: false,
  actionIcon: null,
  actionLabel: 'Navigation action',
})

defineEmits<{ action: [] }>()

const scopeHeaderModel = inject(dashboardScopeHeaderModelKey, null)
const organizationParent = inject(dashboardOrganizationParentKey, null)
const route = useRoute()
const scopeOverview = computed(() => {
  const organizationSlug = typeof route.params.orgSlug === 'string' ? route.params.orgSlug : null
  const siteSlug = typeof route.params.siteSlug === 'string' ? route.params.siteSlug : null
  const locationSlug = typeof route.params.locationSlug === 'string' ? route.params.locationSlug : null
  if (!organizationSlug || !siteSlug) return null
  const sitePath = `/dashboard/${encodeURIComponent(organizationSlug)}/sites/${encodeURIComponent(siteSlug)}`
  if (scopeHeaderModel?.value.scope === 'location' && locationSlug) {
    return { label: 'Location overview', to: `${sitePath}/locations/${encodeURIComponent(locationSlug)}` }
  }
  if (scopeHeaderModel?.value.scope === 'site') return { label: 'Site overview', to: sitePath }
  return null
})
const detailParent = computed(() => props.detailTo
  ? { label: props.detailLabel, to: props.detailTo }
  : props.backToOrganization ? organizationParent?.value ?? null : null)
const scopeParent = computed(() => {
  const overview = scopeOverview.value
  if (overview && route.path !== overview.to) return overview
  return scopeHeaderModel?.value.parent ?? null
})
</script>
