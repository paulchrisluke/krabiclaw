<template>
  <CalendarPage personal-scope />
</template>

<script setup lang="ts">
import CalendarPage from '~/components/dashboard/CalendarPage.vue'

definePageMeta({ layout: 'dashboard', tab: 'calendar' })
</script>
