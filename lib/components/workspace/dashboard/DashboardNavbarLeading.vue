<template>
  <UButton
    :to="to"
    icon="i-lucide-arrow-left"
    :aria-label="`Back to ${label}`"
    color="neutral"
    variant="ghost"
    size="sm"
    square
    class="min-w-0 shrink-0"
    data-testid="dashboard-navbar-back"
  />
</template>

<script setup lang="ts">
// One control, one meaning: go up one level to `to`.
//
// This component used to choose between three branches — an explicit action, an
// injected detail parent, an injected scope parent — and render nothing when all
// three missed. That inference is why the organization root rendered a back
// arrow pointing at itself: nothing declared a parent, so the chain guessed one.
//
// A page that sits at the root of a navigation stack renders no leading control
// at all. It does not render this component with an empty target.
defineProps<{
  /** Where "up one level" goes. Required: a back control with nowhere to go is a bug, not a default. */
  to: string | { path: string, query?: Record<string, string> }
  /** Names the destination for screen readers. */
  label: string
}>()
</script>
