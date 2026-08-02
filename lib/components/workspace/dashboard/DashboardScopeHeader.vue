<template>
  <div class="flex w-full" :class="collapsed ? 'items-center justify-center' : ''">
    <UDropdownMenu
      :items="menuItems"
      :content="{ align: 'start', collisionPadding: 12 }"
      :ui="{ content: 'w-(--reka-dropdown-menu-trigger-width) min-w-64' }"
    >
      <UButton
        :avatar="currentAvatar"
        :icon="currentIcon"
        :label="collapsed ? undefined : model.current.label"
        trailing-icon="i-lucide-chevrons-up-down"
        color="neutral"
        variant="ghost"
        class="w-full data-[state=open]:bg-elevated"
        :block="collapsed"
        :ui="{ label: 'truncate text-left', trailingIcon: 'text-dimmed ms-auto' }"
      />
    </UDropdownMenu>
  </div>
</template>

<script setup lang="ts">
export interface DashboardScopeHeaderPeer {
  label: string
  to?: string
  active: boolean
  icon?: string
  avatar?: string
  onSelect?: () => void
}

// This component renders ONLY the current-level switcher (dropdown of peers +
// createAction). It deliberately does NOT render `model.parent` — that's
// consumed by the layout to build a normal nav item instead (see
// layouts/dashboard.vue's parentNavItem()), matching the reviewed reference
// pattern of a back-row sized like every other nav item, not custom chrome
// inside the switcher header. Do not add parent-rendering back here.
export interface DashboardScopeHeaderModel {
  scope: 'organization' | 'site' | 'location'
  current: { label: string; icon?: string; avatar?: string }
  parent: { label: string; to: string } | null
  peers: DashboardScopeHeaderPeer[]
  createAction?: { label: string; to: string }
}

const props = defineProps<{ model: DashboardScopeHeaderModel; collapsed?: boolean }>()

const currentAvatar = computed(() => props.model.current.avatar ? { src: props.model.current.avatar } : undefined)
const currentIcon = computed(() => !props.model.current.avatar ? (props.model.current.icon ?? 'i-lucide-building-2') : undefined)

interface ScopeMenuItem {
  label: string
  icon?: string
  avatar?: { src: string }
  to?: string
  onSelect?: () => void
}

const menuItems = computed(() => {
  const peerItems: ScopeMenuItem[] = props.model.peers.map((peer) => ({
    label: peer.label,
    icon: peer.active ? 'i-lucide-check' : peer.icon,
    avatar: !peer.active && peer.avatar ? { src: peer.avatar } : undefined,
    to: peer.to,
    onSelect: peer.onSelect
  }))
  const groups: ScopeMenuItem[][] = [peerItems]
  if (props.model.createAction) {
    groups.push([{ label: props.model.createAction.label, icon: 'i-lucide-plus', to: props.model.createAction.to }])
  }
  return groups
})
</script>
