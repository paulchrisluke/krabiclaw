<template>
  <AccountProfilePage />
</template>

<script setup lang="ts">
import AccountProfilePage from '~/components/dashboard/AccountProfilePage.vue'

// Account settings is a row on Menu, which is where Back goes.
definePageMeta({ layout: 'dashboard', tab: 'menu', back: 'dashboard-account-menu' })
</script>
