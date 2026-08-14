<template>
  <section class="space-y-3">
    <h2 class="text-sm font-semibold uppercase tracking-wide text-muted">{{ title }}</h2>
    <div class="divide-y divide-default border-y border-default">
      <slot />
    </div>
    <slot name="after" />
  </section>
</template>

<script setup lang="ts">
defineProps<{ title: string }>()
</script>
