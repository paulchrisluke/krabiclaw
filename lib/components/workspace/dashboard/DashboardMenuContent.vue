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
        size="lg"
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
      size="lg"
      class="w-full justify-start"
      @click="$emit('search')"
    />

    <EditorNavigationList :groups="groups" :active-item="activeItem" />
  </div>
</template>

<script setup lang="ts">
import type { DropdownMenuItem } from '@nuxt/ui'
import EditorNavigationList from '~/components/dashboard/EditorNavigationList.vue'

// Rendered by both the desktop slideover and the mobile menu page, off one
// model, so the two surfaces cannot show different menus.
const { groups, activeItem, scopeModel } = useDashboardMenu()

defineEmits<{ search: [] }>()

const scopeItems = computed<DropdownMenuItem[][]>(() => {
  const model = scopeModel.value
  if (!model || model.peers.length === 0) return []
  const peers = model.peers.map(peer => ({
    label: peer.label,
    avatar: peer.avatar ? { src: peer.avatar } : undefined,
    icon: peer.avatar ? undefined : peer.icon,
    to: peer.to,
    checked: peer.active,
    type: 'checkbox' as const,
  }))
  const create = model.createAction
    ? [{ label: model.createAction.label, icon: 'i-lucide-plus', to: model.createAction.to }]
    : []
  return create.length ? [peers, create] : [peers]
})
</script>
