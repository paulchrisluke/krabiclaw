<template>
  <div class="flex min-w-0 shrink-0 items-center gap-1">
    <DashboardSidebarCollapseButton />
    <UButton
      v-if="detailParent"
      class="min-w-0 shrink-0 md:hidden"
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
      class="min-w-0 shrink-0 md:hidden"
      color="neutral"
      variant="ghost"
      size="sm"
      square
      icon="i-lucide-chevron-left"
      :aria-label="`Back to ${scopeParent.label}`"
      :to="scopeParent.to"
    />
  </div>
</template>

<script setup lang="ts">
import type { RouteLocationRaw } from 'vue-router'
import { dashboardOrganizationParentKey, dashboardScopeHeaderModelKey } from './dashboardScopeHeaderContext'

const props = withDefaults(defineProps<{
  detailTo?: RouteLocationRaw | null
  detailLabel?: string
  backToOrganization?: boolean
}>(), {
  detailTo: null,
  detailLabel: 'Back',
  backToOrganization: false,
})

const scopeHeaderModel = inject(dashboardScopeHeaderModelKey, null)
const organizationParent = inject(dashboardOrganizationParentKey, null)
const detailParent = computed(() => props.detailTo
  ? { label: props.detailLabel, to: props.detailTo }
  : props.backToOrganization ? organizationParent?.value ?? null : null)
const scopeParent = computed(() => scopeHeaderModel?.value.parent ?? null)
</script>
