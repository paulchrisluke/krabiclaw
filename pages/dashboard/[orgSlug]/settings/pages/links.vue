<template>
  <LinksPageEditor />
</template>

<script setup lang="ts">
import LinksPageEditor from '~/components/dashboard/LinksPageEditor.vue'

// A row on Pages, nested under it so Pages is both its pane and its Back; the URL stays `/links`.
definePageMeta({ layout: 'dashboard', path: '/dashboard/:orgSlug/links' })
</script>
