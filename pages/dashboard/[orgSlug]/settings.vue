<template>
  <!--
    Notifications, Insights and the members pair draw their own panels, so
    this level only routes to them. Everything else is a leaf in the column
    beside the Menu.
  -->
  <NuxtPage v-if="rendersStandalone || frame.mode.value === 'yield'" />

  <template v-else>
    <UDashboardPanel
      id="organization-settings"
      :class="hasDetail ? 'hidden lg:flex' : undefined"
      :default-size="hasDetail ? 32 : undefined"
    >
      <template #header>
        <UDashboardNavbar title="Menu" :toggle="false">
          <template #right>
            <DashboardNotificationBell :to="notificationsTo" />
            <DashboardAccountMenu />
          </template>
        </UDashboardNavbar>
      </template>

      <template #body>
        <div class="mx-auto w-full" :class="hasDetail ? 'max-w-xl' : 'max-w-[var(--ws-page-narrow,45rem)]'">
          <DashboardMenuContent @search="openSearch" />
        </div>
      </template>
    </UDashboardPanel>

    <UDashboardPanel v-if="hasDetail" id="organization-settings-detail">
      <template #header>
        <UDashboardNavbar :title="activeLabel" :toggle="false">
          <template #leading>
            <DashboardNavbarLeading />
          </template>
        </UDashboardNavbar>
      </template>

      <template #body>
        <div class="mx-auto w-full" :class="wideDetail ? 'max-w-5xl' : 'max-w-2xl'">
          <NuxtPage />
        </div>
      </template>
    </UDashboardPanel>
  </template>
</template>

<script setup lang="ts">
import DashboardMenuContent from '~/lib/components/workspace/dashboard/DashboardMenuContent.vue'
import DashboardNotificationBell from '~/lib/components/workspace/dashboard/DashboardNotificationBell.vue'
import DashboardAccountMenu from '~/lib/components/workspace/dashboard/DashboardAccountMenu.vue'

definePageMeta({ layout: 'dashboard' })
useSeoMeta({ title: 'Menu | KrabiClaw Dashboard', robots: 'noindex, nofollow' })

const route = useRoute()
const nuxtApp = useNuxtApp()

const { settingsPath, activeLabel } = useOrganizationSettingsNavigation()
const frame = useEditorFrame(settingsPath)
const hasDetail = computed(() => frame.mode.value === 'pair')
const rendersStandalone = computed(() => route.matched.some(record => record.meta?.ownsChrome === true))
const wideDetail = computed(() => route.meta.wideDetail === true)

const { notificationsTo } = useDashboardMenu()

function openSearch() {
  nuxtApp.hooks.callHook('dashboard:search:toggle')
}
</script>
