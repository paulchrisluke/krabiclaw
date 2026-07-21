<template>
  <GeneralSettingsPage />
</template>

<script setup lang="ts">
import GeneralSettingsPage from './general.vue'

definePageMeta({ layout: 'dashboard' })
useSeoMeta({ title: 'Settings | KrabiClaw Dashboard', robots: 'noindex, nofollow' })
</script>
