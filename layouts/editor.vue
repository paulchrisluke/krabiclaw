<template>
  <UApp>
    <div class="h-dvh overflow-hidden flex flex-col bg-muted">
      <div
        v-if="!skipDashboardContext && dashboard.pending.value"
        class="flex min-h-screen items-center justify-center bg-default px-6"
        data-testid="editor-context-loading"
      >
        <div class="w-full max-w-xl space-y-4">
          <div class="h-7 w-48 animate-pulse rounded bg-elevated" />
          <div class="h-32 animate-pulse rounded-xl bg-elevated" />
        </div>
      </div>
      <div
        v-else-if="!skipDashboardContext && !dashboard.state.value"
        class="flex min-h-screen items-center justify-center bg-default px-6"
        data-testid="editor-context-error"
      >
        <UCard class="w-full max-w-xl">
          <h1 class="text-xl font-semibold text-highlighted">Editor context could not be loaded</h1>
          <p class="mt-3 text-sm text-muted">Dashboard context is required for the content editor.</p>
        </UCard>
      </div>
      <slot v-else />
      <!-- Feature-flagged off — see composables/useUpgradeModal.ts for why and
           how to bring it back. -->
      <SayaUpgradeModal v-if="UPGRADE_MODAL_ENABLED" />
    </div>
  </UApp>
</template>

<script setup>
// Minimal layout for full-screen editor pages: no sidebar, navbar, or
// dashboard wrapper. Site-scoped editor pages (content/menu editors) need
// this layout to gate rendering on useDashboardSite's org/site-scoped
// context, which they load themselves via their own dashboard.refresh()
// guard. Pages with no org/site scope of their own — the root and
// org-scoped onboarding wizards, which manage their own independent context
// via a dedicated endpoint and never call useDashboardSite at all — set
// `skipDashboardContext: true` in definePageMeta to bypass this gate
// entirely rather than being blocked on a context load they never start.
import { UPGRADE_MODAL_ENABLED } from '~/composables/useUpgradeModal'
import SayaUpgradeModal from '~/components/saya/_ignored/SayaUpgradeModal.vue'
import { useDashboardSite } from '~/composables/useDashboardSite'
import dashboardCssUrl from '~/assets/css/dashboard.css?url'

const route = useRoute()
const skipDashboardContext = computed(() => route.meta.skipDashboardContext === true)
const dashboard = useDashboardSite()
useHead({ link: [{ rel: 'stylesheet', href: dashboardCssUrl }] })
</script>
