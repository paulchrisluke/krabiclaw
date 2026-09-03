<template>
  <USlideover
    v-model:open="open"
    title="Menu"
    :ui="{ body: 'overflow-y-auto' }"
  >
    <template #body>
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
          @click="openSearch"
        />

        <EditorNavigationList :groups="groups" :active-item="activeItem" />
      </div>
    </template>
  </USlideover>
</template>

<script setup lang="ts">
import type { DropdownMenuItem } from '@nuxt/ui'
import EditorNavigationList from '~/components/dashboard/EditorNavigationList.vue'
import type { EditorNavigationGroup } from '~/components/dashboard/EditorNavigationList.vue'
import type { DashboardScopeHeaderModel } from './DashboardScopeHeader.vue'

const props = defineProps<{
  groups: EditorNavigationGroup[]
  activeItem?: string | null
  /** Organization/site switcher model. Null on surfaces with no scope, e.g. admin. */
  scopeModel?: DashboardScopeHeaderModel | null
}>()

const open = defineModel<boolean>('open', { default: false })

const route = useRoute()
const nuxtApp = useNuxtApp()

// Same model the deleted sidebar header used, so switching organizations and
// sites keeps working off one source rather than a second list built here.
const scopeItems = computed<DropdownMenuItem[][]>(() => {
  const model = props.scopeModel
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

function openSearch() {
  open.value = false
  nuxtApp.hooks.callHook('dashboard:search:toggle')
}

// EditorNavigationList renders plain NuxtLinks, so a selection navigates the
// page underneath the slideover rather than closing it. Close on the resulting
// path change instead of wrapping every item in a click handler.
watch(() => route.path, () => { open.value = false })
</script>
