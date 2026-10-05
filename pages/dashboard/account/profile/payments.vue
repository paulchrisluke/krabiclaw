<template>
  <!-- Airbnb's Account settings → Payments: the cards this account keeps with the businesses it pays. -->
  <DashboardLeafPanel id="account-payments" title="Payments" :footer="false">
    <PaymentsAccountSettings personal-scope />
  </DashboardLeafPanel>
</template>

<script setup lang="ts">
import PaymentsAccountSettings from '~/components/dashboard/settings/PaymentsAccountSettings.vue'
definePageMeta({ layout: 'dashboard' })
useSeoMeta({ title: 'Payments | Krabiclaw', robots: 'noindex, nofollow' })
</script>
