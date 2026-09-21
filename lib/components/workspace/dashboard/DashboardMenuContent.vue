<template>
  <div class="space-y-6">
    <UDropdownMenu
      v-if="scopeItems.length"
      :items="scopeItems"
      :content="{ align: 'start', collisionPadding: 12 }"
      :ui="{ content: 'w-(--reka-dropdown-menu-trigger-width) min-w-64' }"
    >
      <UButton
        :avatar="scopeModel?.current.avatar ? { src: scopeModel.current.avatar } : undefined"
        :icon="scopeModel?.current.avatar ? undefined : scopeModel?.current.icon"
        :label="scopeModel?.current.label"
        color="neutral"
        variant="subtle"
        trailing-icon="i-lucide-chevron-down"
        class="w-full justify-start"
        :ui="{ label: 'truncate text-left', trailingIcon: 'ms-auto text-dimmed' }"
        data-testid="dashboard-menu-scope-switcher"
      />
    </UDropdownMenu>

    <UButton
      label="Search"
      icon="i-lucide-search"
      color="neutral"
      variant="subtle"
      class="w-full justify-start"
      @click="$emit('search')"
    />

    <!--
      Insights is organization-wide with its own site filter, so it belongs to
      the organization-scoped menu rather than to any one site.
    -->
    <NuxtLink
      v-if="insightsPath"
      :to="insightsPath"
      class="block rounded-2xl border border-default bg-elevated p-5 transition-colors hover:bg-accented"
      data-testid="dashboard-menu-insights"
    >
      <div class="flex items-center justify-between gap-3">
        <p class="text-[15px] font-semibold text-highlighted">Insights</p>
        <UIcon name="i-lucide-chart-no-axes-column" class="size-5 text-muted" />
      </div>
      <p class="mt-1 text-sm text-muted">Traffic, sources and conversions across your sites.</p>
    </NuxtLink>

    <EditorNavigationList :groups="groups" :active-item="activeItem" @act="onAct" />
  </div>
</template>

<script setup lang="ts">
import type { DropdownMenuItem } from '@nuxt/ui'
import EditorNavigationList from '~/components/dashboard/EditorNavigationList.vue'

// Rendered by both the desktop slideover and the mobile menu page, off one
// model, so the two surfaces cannot show different menus.
const { groups, activeItem, scopeModel, logOut } = useDashboardMenu()
const { orgPaths } = useDashboardSiteLinks()

const insightsPath = computed(() => (orgPaths.value.org === '/dashboard' ? null : `${orgPaths.value.settings}/insights`))

function onAct(id: string) {
  if (id === 'log-out') logOut().catch(error => console.error('sign_out_failed', error))
}

defineEmits<{ search: [] }>()

const scopeItems = computed<DropdownMenuItem[][]>(() => {
  const model = scopeModel.value
  if (!model || model.peers.length === 0) return []
  const peers = model.peers.map(peer => ({
    label: peer.label,
    avatar: !peer.active && peer.avatar ? { src: peer.avatar } : undefined,
    icon: peer.active ? 'i-lucide-check' : peer.avatar ? undefined : peer.icon,
    to: peer.to,
    onSelect: peer.onSelect,
  }))
  const create = model.createAction
    ? [{ label: model.createAction.label, icon: 'i-lucide-plus', to: model.createAction.to }]
    : []
  return create.length ? [peers, create] : [peers]
})
</script>
