<template>
  <UButton
    v-if="level.to.value"
    icon="i-lucide-arrow-left"
    aria-label="Back"
    color="neutral"
    variant="ghost"
    size="sm"
    square
    class="min-w-0 shrink-0"
    data-testid="dashboard-navbar-back"
    :to="level.to.value"
  />
</template>

<script setup lang="ts">
// An index's Back: a link to the level's declared parent, so it lands in the
// same place however the level was reached and a sheet that was closed can
// never become its destination. A tab root has nothing above it and renders
// nothing. A leaf has no Back — its Close is the leaf shell's.
const level = useRouteLevel()
</script>
