<template>
  <div class="space-y-6">
    <div>
      <h1 class="text-2xl font-semibold tracking-tight text-highlighted">Accept invitation</h1>
      <p class="mt-2 text-sm text-muted">Sign in with the email address that received this invitation.</p>
    </div>

    <!-- Not keyed on sessionLoading: the client reports pending for the tick
         it hydrates on, so the server rendered the signed-out buttons where
         the client wanted this node, and every load logged a hydration
         mismatch. The session is awaited in setup, so by render time both
         sides agree on isAuthenticated. -->
    <div v-if="accepting" class="text-sm text-muted">
      Accepting invitation…
    </div>

    <template v-else-if="!isAuthenticated">
      <AuthGoogleButton @activate="continueWithGoogle" />
      <UButton :to="emailLoginUrl" color="neutral" variant="outline" size="lg" block :ui="{ base: 'justify-start' }">
        Sign in with email
      </UButton>
    </template>

    <template v-else>
      <UAlert v-if="acceptError" color="error" variant="soft" :description="acceptError" />
      <UButton v-if="acceptError" block size="lg" :loading="accepting" @click="acceptInvitation">Try again</UButton>
      <UButton v-if="acceptError" block size="lg" color="neutral" variant="ghost" @click="switchAccount">Sign in with a different account</UButton>
    </template>
  </div>
</template>

<script setup lang="ts">
import { authClient } from '~/lib/auth-client'
import { buildLoginUrl } from '~/shared/auth/return-target'

definePageMeta({ layout: 'access' })

const route = useRoute()
const invitationId = String(route.params.invitationId || '')
const pagePath = `/accept-invitation/${encodeURIComponent(invitationId)}`
const emailLoginUrl = computed(() => buildLoginUrl({ redirect: pagePath }))
const { isAuthenticated, sessionLoading } = await useAuthSession()
const authOperation = useAuthOperation()
const accepting = ref(false)
const acceptError = ref<string | null>(null)
const attempted = ref(false)

async function acceptInvitation() {
  accepting.value = true
  acceptError.value = null
  try {
    const result = await authClient.organization.acceptInvitation({ invitationId })
    if (result.error) throw new Error(result.error.message || 'Failed to accept invitation')
    await navigateTo('/dashboard')
  } catch (error) {
    acceptError.value = error instanceof Error ? error.message : 'Failed to accept invitation'
  } finally {
    accepting.value = false
  }
}

watch([sessionLoading, isAuthenticated], async () => {
  if (sessionLoading.value || !isAuthenticated.value || attempted.value) return
  attempted.value = true
  await acceptInvitation()
}, { immediate: true })

async function continueWithGoogle() {
  await authOperation.signInWithGoogle(pagePath)
}

async function switchAccount() {
  attempted.value = false
  await authClient.signOut()
}
</script>
