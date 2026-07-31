<template>
  <UApp>
    <div class="h-dvh overflow-hidden flex flex-col bg-muted">
      <div
        v-if="dashboard.pending.value"
        class="flex min-h-screen items-center justify-center bg-default px-6"
        data-testid="editor-context-loading"
      >
        <div class="w-full max-w-xl space-y-4">
          <div class="h-7 w-48 animate-pulse rounded bg-elevated" />
          <div class="h-32 animate-pulse rounded-xl bg-elevated" />
        </div>
      </div>
      <div
        v-else-if="!dashboard.state.value"
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
// Minimal layout for full-screen editor pages
// No sidebar, navbar, or dashboard wrapper
// But we still need to load dashboard context for site-scoped pages
import { UPGRADE_MODAL_ENABLED } from '~/composables/useUpgradeModal'
import SayaUpgradeModal from '~/components/saya/_ignored/SayaUpgradeModal.vue'
import { useDashboardSite } from '~/composables/useDashboardSite'

// Load dashboard context for site-scoped editor pages
// Since SSR is disabled for editor routes, this runs client-side
const dashboard = useDashboardSite()
</script>
