<template>
  <UDropdownMenu
    :items="items"
    :content="{ align: 'start', collisionPadding: 12, side: 'top', sideOffset: 12 }"
    :ui="{ content: 'w-[260px]' }"
  >
    <UButton
      color="neutral"
      variant="ghost"
      class="w-full min-w-0"
      :class="collapsed ? 'justify-center' : 'justify-between'"
      :ui="{ base: 'min-w-0 w-full items-center px-2 py-1.5', trailingIcon: 'text-dimmed ms-auto' }"
      :avatar="{ src: sessionData?.user?.image ?? undefined, alt: sessionData?.user?.name || 'User avatar', size: 'sm' }"
      :label="collapsed ? undefined : sessionData?.user?.name"
      :trailing-icon="collapsed ? undefined : 'i-lucide-ellipsis'"
    />

    <template #content-top>
      <div class="flex flex-col px-2.5 py-2">
        <span class="text-sm font-semibold text-highlighted truncate">{{ sessionData?.user?.name || 'User' }}</span>
        <span class="text-xs text-muted truncate mt-0.5">{{ sessionData?.user?.email }}</span>
      </div>
    </template>

    <template #theme>
      <div class="flex w-full items-center justify-between px-2.5 py-1.5 text-sm font-medium text-default">
        <span>Theme</span>
        <div class="bg-muted border border-default p-0.5 rounded-full flex items-center gap-0.5 shadow-inner">
          <button
            v-for="pref in ['system', 'light', 'dark'] as const"
            :key="pref"
            class="rounded-full size-7 flex items-center justify-center transition-all cursor-pointer"
            :class="colorMode.preference === pref ? 'bg-elevated text-highlighted shadow-sm border border-default' : 'text-dimmed hover:text-muted'"
            :aria-label="`${pref} theme`"
            :aria-pressed="colorMode.preference === pref"
            @click="colorMode.preference = pref"
          >
            <UIcon :name="getThemeIcon(pref)" class="size-3.5" />
          </button>
        </div>
      </div>
    </template>

    <template #content-bottom>
      <div class="px-2.5 py-2.5 flex items-center justify-between select-none border-t border-default">
        <div class="flex flex-col">
          <span class="text-[10px] text-dimmed uppercase tracking-wider font-semibold">Platform Status</span>
          <span class="text-xs font-semibold text-highlighted mt-0.5">
            {{ platformStatus === 'normal' ? 'All systems normal.' : platformStatus === 'loading' ? 'Checking status...' : 'System interruption' }}
          </span>
        </div>
        <span class="relative flex size-2">
          <span
            class="absolute inline-flex h-full w-full animate-ping rounded-full opacity-75"
            :class="{
              'bg-success': platformStatus === 'normal',
              'bg-warning': platformStatus === 'loading',
              'bg-error': platformStatus === 'error'
            }"
          />
          <span
            class="relative inline-flex size-2 rounded-full"
            :class="{
              'bg-success': platformStatus === 'normal',
              'bg-warning': platformStatus === 'loading',
              'bg-error': platformStatus === 'error'
            }"
          />
        </span>
      </div>
    </template>
  </UDropdownMenu>
</template>

<script setup lang="ts">
import type { DropdownMenuItem } from '@nuxt/ui'

defineProps<{ collapsed?: boolean }>()

const { data: sessionData, signOut } = useAuth()
const route = useRoute()
const colorMode = useColorMode()
const config = useRuntimeConfig()

function getThemeIcon(pref: 'system' | 'light' | 'dark') {
  if (pref === 'system') return 'i-lucide-monitor'
  if (pref === 'light') return 'i-lucide-sun'
  return 'i-lucide-moon'
}

const platformStatus = ref<'normal' | 'loading' | 'error'>('loading')

async function checkPlatformStatus() {
  try {
    const res = await $fetch<{ status: string }>('/api/health')
    platformStatus.value = res.status === 'ok' ? 'normal' : 'error'
  } catch (err) {
    console.error('Failed to fetch platform status:', err)
    platformStatus.value = 'error'
  }
}

onMounted(() => {
  checkPlatformStatus().catch(console.error)
})

async function handleSignOut() {
  // Preserve the current path across sign-out/sign-back-in like
  // middleware/account.ts and middleware/dashboard.global.ts already do for
  // session-expiry redirects, so a manager who explicitly logs out from a
  // notification deep link lands back on the same thread after signing in
  // again rather than the generic dashboard root.
  const redirect = route.fullPath
  await signOut()
  await navigateTo({ path: '/login', query: { redirect } })
}

const items = computed<DropdownMenuItem[][]>(() => [
  [{ label: 'Account settings', icon: 'i-lucide-settings', to: '/dashboard/account/profile' }],
  [{ slot: 'theme' }],
  [
    { label: 'Help', icon: 'i-lucide-circle-help', to: config.public.helpUrl as string, target: '_blank' },
    { label: 'Docs', icon: 'i-lucide-book-open', to: '/docs' },
  ],
  [{ label: 'Log Out', icon: 'i-lucide-log-out', color: 'error', onSelect: handleSignOut }],
])
</script>
