<template>
  <div class="flex flex-col w-full gap-1.5">
    <UPopover
      :content="{ align: 'start', collisionPadding: 12, side: 'top', sideOffset: 12 }"
      class="w-full"
      :ui="{ content: 'w-[260px] p-0 overflow-hidden rounded-xl border border-default bg-elevated shadow-xl z-50' }"
    >
      <template #default="{ open }">
        <UButton
          color="neutral"
          variant="ghost"
          class="w-full min-w-0"
          :class="[
            open ? 'bg-muted/80' : '',
            collapsed ? 'justify-center' : 'justify-between'
          ]"
          :ui="{ base: 'min-w-0 w-full items-center px-2 py-1.5', leadingAvatar: 'shrink-0' }"
        >
          <div class="flex items-center gap-2 min-w-0">
            <UAvatar
              :src="sessionData?.user?.image ?? undefined"
              :alt="sessionData?.user?.name || 'User avatar'"
              size="sm"
              class="shrink-0"
            />
            <span v-if="!collapsed" class="min-w-0 flex-1 truncate text-left text-sm font-medium text-highlighted">
              {{ sessionData?.user?.name }}
            </span>
          </div>
          <div
            v-if="!collapsed"
            class="size-7 hover:bg-muted rounded-full border border-default flex items-center justify-center text-dimmed shrink-0 transition-colors"
          >
            <UIcon name="i-lucide-ellipsis" class="size-4" />
          </div>
        </UButton>
      </template>

      <template #content="{ close }">
        <div class="flex flex-col text-default divide-y divide-default w-full overflow-hidden">
          <!-- Header row -->
          <div class="flex items-center justify-between px-4 py-3 min-w-0 bg-elevated">
            <div class="flex flex-col min-w-0">
              <span class="text-sm font-semibold text-highlighted truncate">
                {{ sessionData?.user?.name || 'User' }}
              </span>
              <span class="text-xs text-muted truncate mt-0.5">
                {{ sessionData?.user?.email }}
              </span>
            </div>
            <UButton
              to="/dashboard/account/settings"
              variant="ghost"
              color="neutral"
              icon="i-lucide-settings"
              size="sm"
              class="text-muted hover:text-highlighted hover:bg-muted shrink-0"
              @click="close"
            />
          </div>

          <!-- Menu items list -->
          <div class="p-1 flex flex-col gap-0.5 bg-elevated">
            <!-- Theme item with segmented control -->
            <div class="w-full flex items-center justify-between px-3 py-1.5 text-sm font-medium text-default">
              <span>Theme</span>
              <div class="bg-muted border border-default p-0.5 rounded-full flex items-center gap-0.5 shadow-inner">
                <button
                  v-for="pref in ['system', 'light', 'dark'] as const"
                  :key="pref"
                  class="rounded-full size-7 flex items-center justify-center transition-all cursor-pointer"
                  :class="colorMode.preference === pref ? 'bg-elevated text-highlighted shadow-sm border border-default' : 'text-dimmed hover:text-muted'"
                  @click="colorMode.preference = pref"
                >
                  <UIcon :name="getThemeIcon(pref)" class="size-3.5" />
                </button>
              </div>
            </div>

            <!-- Help -->
            <NuxtLink
              :to="config.public.helpUrl"
              target="_blank"
              rel="noopener noreferrer"
              class="w-full flex items-center justify-between px-3 py-2 text-sm font-medium rounded-lg text-default hover:text-highlighted hover:bg-muted transition-colors text-left"
              @click="close"
            >
              <span>Help</span>
              <UIcon name="i-lucide-circle-help" class="size-4 text-muted" />
            </NuxtLink>

            <!-- Docs -->
            <NuxtLink
              to="/docs"
              class="w-full flex items-center justify-between px-3 py-2 text-sm font-medium rounded-lg text-default hover:text-highlighted hover:bg-muted transition-colors text-left"
              @click="close"
            >
              <span>Docs</span>
              <UIcon name="i-lucide-book-open" class="size-4 text-muted" />
            </NuxtLink>

            <!-- Log Out -->
            <button
              class="w-full flex items-center justify-between px-3 py-2 text-sm font-medium rounded-lg text-error hover:text-error/85 hover:bg-error/10 transition-colors cursor-pointer text-left"
              @click="handleSignOut(); close();"
            >
              <span>Log Out</span>
              <UIcon name="i-lucide-log-out" class="size-4 text-error/80" />
            </button>
          </div>

          <!-- Platform Status flat row -->
          <div class="px-4 py-3 flex items-center justify-between select-none bg-muted/10">
            <div class="flex flex-col">
              <span class="text-[10px] text-dimmed uppercase tracking-wider font-semibold">
                Platform Status
              </span>
              <span class="text-xs font-semibold text-highlighted mt-0.5">
                {{ platformStatus === 'normal' ? 'All systems normal.' : platformStatus === 'loading' ? 'Checking status...' : 'System interruption' }}
              </span>
            </div>
            <!-- glowing status dot -->
            <span class="relative flex size-2">
              <span
                class="absolute inline-flex h-full w-full animate-ping rounded-full opacity-75"
                :class="{
                  'bg-emerald-500': platformStatus === 'normal',
                  'bg-amber-500': platformStatus === 'loading',
                  'bg-red-500': platformStatus === 'error'
                }"
              />
              <span
                class="relative inline-flex size-2 rounded-full"
                :class="{
                  'bg-emerald-500': platformStatus === 'normal',
                  'bg-amber-500': platformStatus === 'loading',
                  'bg-red-500': platformStatus === 'error'
                }"
              />
            </span>
          </div>
        </div>
      </template>
    </UPopover>
  </div>
</template>

<script setup lang="ts">
defineProps<{ collapsed?: boolean }>()

const { data: sessionData, signOut } = useAuth()
const config = useRuntimeConfig()
const colorMode = useColorMode()
const route = useRoute()
const platformStatus = ref<'normal' | 'loading' | 'error'>('loading')

function getThemeIcon(pref: 'system' | 'light' | 'dark') {
  if (pref === 'system') return 'i-lucide-monitor'
  if (pref === 'light') return 'i-lucide-sun'
  return 'i-lucide-moon'
}

async function checkPlatformStatus() {
  try {
    const res = await $fetch<{ status: string }>('/api/health')
    platformStatus.value = res.status === 'ok' ? 'normal' : 'error'
  } catch (err) {
    console.error('Failed to fetch platform status:', err)
    platformStatus.value = 'error'
  }
}

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

onMounted(() => {
  checkPlatformStatus().catch(console.error)
})
</script>
