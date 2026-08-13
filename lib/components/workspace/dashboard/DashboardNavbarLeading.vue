<template>
  <UButton
    v-if="detailParent"
    class="min-w-0 shrink-0"
    color="neutral"
    variant="ghost"
    size="sm"
    icon="i-lucide-chevron-left"
    :aria-label="`Back to ${detailParent.label}`"
    :to="detailParent.to"
  >
    <span v-if="!iconOnly" ref="labelElement" class="max-w-36 truncate">{{ detailParent.label }}</span>
  </UButton>
  <template v-else>
    <UButton
      v-if="scopeParent"
      class="min-w-0 shrink-0 md:hidden"
      color="neutral"
      variant="ghost"
      size="sm"
      icon="i-lucide-chevron-left"
      :aria-label="`Back to ${scopeParent.label}`"
      :to="scopeParent.to"
    >
      <span v-if="!iconOnly" ref="labelElement" class="max-w-36 truncate">{{ scopeParent.label }}</span>
    </UButton>
    <DashboardSidebarCollapseButton />
  </template>
</template>

<script setup lang="ts">
import type { RouteLocationRaw } from 'vue-router'
import { dashboardOrganizationParentKey, dashboardScopeHeaderModelKey } from './dashboardScopeHeaderContext'

const props = withDefaults(defineProps<{
  detailTo?: RouteLocationRaw | null
  detailLabel?: string
  backToOrganization?: boolean
  iconOnly?: boolean
}>(), {
  detailTo: null,
  detailLabel: 'Back',
  backToOrganization: false,
  iconOnly: false,
})

const scopeHeaderModel = inject(dashboardScopeHeaderModelKey, null)
const organizationParent = inject(dashboardOrganizationParentKey, null)
const labelElement = ref<HTMLElement | null>(null)
const measuredIconOnly = ref(false)
const iconOnly = computed(() => props.iconOnly || measuredIconOnly.value)

const detailParent = computed(() => props.detailTo
  ? { label: props.detailLabel, to: props.detailTo }
  : props.backToOrganization ? organizationParent?.value ?? null : null)
const scopeParent = computed(() => scopeHeaderModel?.value.parent ?? null)
const visibleLabel = computed(() => detailParent.value?.label ?? scopeParent.value?.label ?? '')

async function measureLabel() {
  measuredIconOnly.value = false
  await nextTick()
  const label = labelElement.value
  measuredIconOnly.value = Boolean(label && label.scrollWidth > label.clientWidth)
}

watch(visibleLabel, measureLabel, { flush: 'post' })
onMounted(() => {
  void measureLabel()
  window.addEventListener('resize', measureLabel)
})
onBeforeUnmount(() => window.removeEventListener('resize', measureLabel))
</script>
