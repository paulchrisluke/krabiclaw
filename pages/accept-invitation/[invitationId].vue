<template>
  <div class="min-h-screen bg-default flex items-center justify-center px-4">
    <div class="w-full max-w-md space-y-6">
      <div>
        <h1 class="text-3xl font-extrabold tracking-tight text-default">Accept invitation</h1>
        <p class="mt-2 text-sm text-muted">Sign in with the email address that received this invitation.</p>
      </div>

      <div v-if="sessionLoading || accepting" class="text-sm text-muted">
        {{ accepting ? 'Accepting invitation…' : 'Loading…' }}
      </div>

      <template v-else-if="!isAuthenticated">
        <AuthGoogleAuthButton @activate="continueWithGoogle" />
        <NuxtLink :to="emailLoginUrl" class="w-full flex items-center justify-center border border-default text-default py-3 px-4 rounded-[10px] font-semibold text-[15px] hover:bg-muted/10 transition-all">
          Sign in with email
        </NuxtLink>
      </template>

      <template v-else>
        <UAlert v-if="acceptError" color="error" variant="soft" :description="acceptError" />
        <UButton v-if="acceptError" block :loading="accepting" @click="acceptInvitation">Try again</UButton>
        <UButton v-if="acceptError" block color="neutral" variant="ghost" @click="switchAccount">Sign in with a different account</UButton>
      </template>
    </div>
  </div>
</template>

<script setup lang="ts">
import { authClient } from '~/lib/auth-client'
import { buildLoginUrl } from '~/shared/auth/return-target'

definePageMeta({ layout: 'standalone' })

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
