<template>
  <div
    class="flex items-center gap-2 border-t border-default bg-default p-4"
    :class="$slots.leading ? 'justify-between' : 'justify-end'"
  >
    <slot name="leading" />
    <div class="flex justify-end gap-2">
      <slot />
    </div>
  </div>
</template>

<script setup lang="ts">
// Single source for the fixed-position-free contextual action bar every
// detail/edit page renders in UDashboardPanel's own #footer slot — mirrors
// the Airbnb host app, where an edit screen's top bar carries only
// back/title and the primary commit action always lives at the bottom, at
// every breakpoint. Renders as a plain flex sibling after the panel's
// scrollable body, so it never needs `fixed` positioning and never spans
// under the persistent sidebar.
//
// Pass buttons via the default slot (right-aligned, e.g. Cancel/Save). Pass
// a `leading` slot (e.g. a destructive Delete action) to split it to the
// opposite edge — always a single row, at every breakpoint, so keep the
// leading slot's content icon-only (square, with aria-label) rather than a
// labeled button, or it can crowd out the default slot's buttons on narrow
// screens. Omit the leading slot entirely for a simple right-aligned bar.
defineSlots<{
  default(): unknown
  leading?(): unknown
}>()
</script>
