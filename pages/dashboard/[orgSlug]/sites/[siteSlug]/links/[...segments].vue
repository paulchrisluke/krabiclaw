<template>
  <LinksPageEditor />
</template>

<script setup lang="ts">
import LinksPageEditor from '~/components/dashboard/LinksPageEditor.vue'
definePageMeta({ layout: 'dashboard', cmsCapabilityKey: 'site.links', ownsChrome: true })
</script>
