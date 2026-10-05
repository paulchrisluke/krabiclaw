<template>
  <!--
    Airbnb's account "Payments": the sections of the Payments tab. Ours has one —
    Your payments — because every purchase is paid at the business's own checkout
    and there are no saved payment methods to manage. A card on Menu, so it
    renders beside Menu and Back returns there.
  -->
  <DashboardIndexPanel id="account-payments" title="Payments">
    <div class="mx-auto w-full max-w-3xl pb-6">
      <section>
        <h2 class="text-2xl font-semibold text-highlighted">Your payments</h2>
        <p class="mt-2 text-base text-muted">Keep track of all your payments and refunds.</p>
        <UButton class="mt-6" size="xl" label="Manage payments" :to="`${level.path.value}/history`" />
      </section>
    </div>
  </DashboardIndexPanel>
</template>

<script setup lang="ts">
definePageMeta({ layout: 'dashboard', path: '/dashboard/account/payments' })
useSeoMeta({ title: 'Payments | Krabiclaw', robots: 'noindex, nofollow' })

const level = useRouteLevel()
</script>
