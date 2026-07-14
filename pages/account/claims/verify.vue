<template>
  <div>
    <h1 class="text-2xl font-extrabold tracking-tight text-default mb-4">Confirming your booking history</h1>

    <div v-if="status === 'pending'" class="text-sm text-muted">Confirming…</div>

    <div v-else-if="status === 'ok'" class="rounded-lg border border-green-500/30 bg-green-500/5 px-4 py-3 text-sm text-green-600">
      Linked. <NuxtLink to="/account" class="underline">View your bookings</NuxtLink>.
    </div>

    <div v-else role="alert" class="rounded-lg border border-red-500/30 bg-red-500/5 px-4 py-3 text-sm text-red-500">
      {{ errorMessage }}
    </div>
  </div>
</template>

<script setup>
definePageMeta({ layout: 'account', middleware: 'account' })

const route = useRoute()
const status = ref('pending')
const errorMessage = ref('This link is invalid or has expired.')

onMounted(async () => {
  const token = typeof route.query.token === 'string' ? route.query.token : ''
  if (!token) {
    status.value = 'error'
    return
  }

  try {
    const result = await $fetch('/api/account/claims/verify', {
      method: 'POST',
      body: { token },
    })
    status.value = result?.ok ? 'ok' : 'error'
  } catch (err) {
    status.value = 'error'
    const reason = err?.data?.error
    if (reason === 'already_claimed_by_other') {
      errorMessage.value = 'This booking history has already been linked to a different account.'
    } else if (reason === 'token_user_mismatch') {
      errorMessage.value = 'This link was issued to a different account. Sign in with that account and try again.'
    }
  }
})
</script>
