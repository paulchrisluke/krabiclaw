<template>
  <!-- Airbnb's Account settings → Payments: Your payments and Payment methods, the same tab the business has. -->
  <DashboardIndexPanel id="account-payments" title="Payments">
    <div class="mx-auto w-full max-w-3xl pb-10">
      <PaymentsAccountSettings personal-scope />
    </div>
  </DashboardIndexPanel>
</template>

<script setup lang="ts">
import PaymentsAccountSettings from '~/components/dashboard/settings/PaymentsAccountSettings.vue'
definePageMeta({ layout: 'dashboard' })
useSeoMeta({ title: 'Payments | Krabiclaw', robots: 'noindex, nofollow' })
</script>
