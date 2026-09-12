<template>
  <LinksPageEditor />
</template>

<script setup lang="ts">
import LinksPageEditor from '~/components/dashboard/LinksPageEditor.vue'
// No `ownsChrome`: with no section open the links page is the site hub's detail
// column, so the site keeps its own rail and this renders the links rows inside
// it. The catch-all beside this file claims the chrome once a section opens,
// which is how `/blog` and a blog post divide it too.
definePageMeta({ layout: 'dashboard', cmsCapabilityKey: 'site.links' })
</script>
