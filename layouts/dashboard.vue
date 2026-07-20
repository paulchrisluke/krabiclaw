<template>
  <UApp>
    <UTheme :ui="dashboardUi">
      <div class="platform-theme">
        <DashboardImpersonationBanner />

        <UDashboardGroup storage-key="krabiclaw-dashboard" unit="rem" :min-size="14" :default-size="18" :max-size="24">
          <DashboardSidebar />

          <!--
            TEMPORARY: still the layout-owned universal panel/navbar wrapping
            every route's <slot/>. Issue #316 phase 4 migrates every
            pages/dashboard/** and pages/admin/** route to DashboardPage /
            DashboardWorkspacePage (each of which owns its own
            UDashboardPanel + UDashboardNavbar); once that migration is
            complete this wrapper is deleted and the layout renders only
            <DashboardSidebar /> + <slot /> per the target architecture.
            Kept intact for now so no route goes chromeless mid-refactor.
          -->
          <UDashboardPanel>
            <template #header>
              <DashboardNavbar />
            </template>
            <template #body>
              <slot />
            </template>
          </UDashboardPanel>

          <ChowBot v-if="!inConversationsWorkspace" />
        </UDashboardGroup>

        <PlatformCommandSearchModal surface="dashboard" />
        <BillingCreditPurchaseModal />
        <BillingServiceUpsellModal />
        <BillingSiteSubscribeModal />
      </div>
    </UTheme>
  </UApp>
</template>

<script setup lang="ts">
import PlatformCommandSearchModal from '~/components/platform/search/PlatformCommandSearchModal.vue'
import { dashboardUi } from '~/config/dashboard-theme'
import { useAnalytics } from '~/composables/useAnalytics'

const route = useRoute()
const { trackDashboardVisited } = useAnalytics()
const dashboard = useDashboardSite()
const { activeSiteId, inConversationsWorkspace } = useDashboardNavigation()

const dashboardContextError = ref<unknown>(null)

// Load dashboard context during SSR so nav links render stable org-scoped routes.
if (route.path.startsWith('/dashboard') && !dashboard.state.value) {
  try {
    await dashboard.refresh()
  } catch (error) {
    dashboardContextError.value = error
  }
}

onMounted(async () => {
  if (route.path.startsWith('/dashboard') && !dashboard.state.value && !dashboardContextError.value) {
    await dashboard.refresh()
  }

  // Track dashboard visit
  const segment = route.path.split('/').filter(Boolean).at(2)
  if (segment && activeSiteId.value) {
    trackDashboardVisited(segment, activeSiteId.value)
  }
})
</script>
