<template>
  <!--
    The settings index is the parent level's own column: `settings.vue` renders
    the section list beside this route, and with nothing open there is no detail
    to draw. This exists so `/settings` resolves to that parent.
  -->
  <div />
</template>

<script setup lang="ts">
definePageMeta({ layout: 'dashboard' })
useSeoMeta({ title: 'Organization Settings | KrabiClaw', robots: 'noindex, nofollow' })
</script>
