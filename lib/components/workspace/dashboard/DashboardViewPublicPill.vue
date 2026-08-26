<template>
  <div
    v-if="to"
    class="pointer-events-none fixed inset-x-0 bottom-(--dashboard-mobile-nav-clearance) z-20 flex justify-center px-4 md:bottom-5 lg:left-(--dashboard-sidebar-width)"
  >
    <UButton :to="to" target="_blank" icon="i-lucide-external-link" label="View" class="pointer-events-auto rounded-full px-5 shadow-lg" />
  </div>
</template>

<script setup lang="ts">
// Shared by the site and location overview pages — the only two places this
// floating "View" pill appears. `fixed inset-x-0` centers it against the full
// viewport, which is only correct when the sidebar is hidden (below `lg`);
// `lg:left-(--dashboard-sidebar-width)` (set by layouts/dashboard.vue from a
// ResizeObserver on the actual sidebar element) re-centers it against just
// the content column once the sidebar is visible, so it isn't skewed toward
// the sidebar on desktop.
defineProps<{ to: string }>()
</script>
