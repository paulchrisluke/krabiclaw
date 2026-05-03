<template>
  <nav aria-label="Breadcrumb" class="max-w-6xl mx-auto px-4 py-3">
    <ol class="flex items-center gap-2 text-sm text-gray-500">
      <li v-for="(crumb, i) in crumbs" :key="crumb.to" class="flex items-center gap-2">
        <NuxtLink
          v-if="i < crumbs.length - 1"
          :to="crumb.to"
          class="hover:text-black transition-colors"
        >
          {{ crumb.label }}
        </NuxtLink>
        <span v-else class="text-black font-medium" aria-current="page">
          {{ crumb.label }}
        </span>
        <span v-if="i < crumbs.length - 1" aria-hidden="true">›</span>
      </li>
    </ol>
  </nav>
</template>

<script setup>
defineProps({
  crumbs: {
    type: Array,
    required: true
  }
})
</script>
