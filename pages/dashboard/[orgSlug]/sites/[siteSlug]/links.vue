<template>
  <LinksPageEditor />
</template>

<script setup lang="ts">
import LinksPageEditor from '~/components/dashboard/LinksPageEditor.vue'

// Reached from Pages, which is the row that opens it.
definePageMeta({ layout: 'dashboard', back: 'dashboard-orgSlug-sites-siteSlug-pages' })
</script>
