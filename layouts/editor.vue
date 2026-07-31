<template>
  <UApp>
    <div class="h-dvh overflow-hidden flex flex-col bg-muted">
      <slot />
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

// Load dashboard context using the same keyed SSR-hydrated pattern as dashboard layout
const dashboard = useDashboardSite()
if (!dashboard.state.value) await dashboard.refresh()
</script>
