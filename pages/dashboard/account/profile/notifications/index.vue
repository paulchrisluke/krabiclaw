<template>
  <!--
    The category list is the parent level's own column: `notifications.vue`
    renders it beside this route, and with nothing open there is no detail to
    draw. This exists so `/notifications` resolves to that parent.
  -->
  <div />
</template>

<script setup lang="ts">
definePageMeta({ layout: 'dashboard' })
</script>
