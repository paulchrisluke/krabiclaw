<template>
  <div class="min-h-screen bg-default flex items-center justify-center px-4 py-16">
    <div class="w-full max-w-md">

      <!-- Loading -->
      <div v-if="loading" class="text-center space-y-3">
        <UIcon name="i-heroicons-arrow-path" class="animate-spin text-4xl text-muted" />
        <p class="text-muted text-sm">Loading transfer details…</p>
      </div>

      <!-- Error / expired / already used -->
      <div v-else-if="loadError" class="text-center space-y-4">
        <div class="w-16 h-16 rounded-full bg-red-100 dark:bg-red-900/30 flex items-center justify-center mx-auto">
          <UIcon name="i-heroicons-x-circle" class="text-3xl text-red-500" />
        </div>
        <h1 class="text-xl font-bold text-highlighted">Transfer unavailable</h1>
        <p class="text-muted text-sm">{{ loadError }}</p>
        <UButton to="/dashboard" variant="soft">Go to Dashboard</UButton>
      </div>

      <!-- Accepted success -->
      <div v-else-if="accepted" class="text-center space-y-4">
        <div class="w-16 h-16 rounded-full bg-green-100 dark:bg-green-900/30 flex items-center justify-center mx-auto">
          <UIcon name="i-heroicons-check-circle" class="text-3xl text-green-500" />
        </div>
        <h1 class="text-xl font-bold text-highlighted">Transfer complete</h1>
        <p class="text-muted text-sm">
          <strong class="text-default">{{ transfer!.site_name }}</strong> is now in your account.
        </p>
        <UButton to="/dashboard" color="primary">Open Dashboard</UButton>
      </div>

      <!-- Transfer card -->
      <template v-else-if="transfer">
        <div class="border border-default rounded-2xl overflow-hidden bg-elevated shadow-sm">

          <!-- Header -->
          <div class="bg-(--ui-primary) px-6 py-5 text-white">
            <p class="text-xs font-semibold uppercase tracking-widest opacity-70 mb-1">Site Transfer</p>
            <h1 class="text-2xl font-bold leading-tight">{{ transfer.site_name }}</h1>
            <p class="text-sm opacity-80 mt-1">
              Invited by {{ transfer.initiated_by_name }} · expires {{ expiresIn }}
            </p>
          </div>

          <!-- Body -->
          <div class="px-6 py-6 space-y-5">

            <div class="space-y-3 text-sm text-muted">
              <div class="flex items-start gap-3">
                <UIcon name="i-heroicons-building-storefront" class="text-lg text-muted mt-0.5 shrink-0" />
                <span>Full ownership of <strong class="text-default">{{ transfer.site_name }}</strong> will move to your account, including all menu data, media, content, reviews, and conversation history.</span>
              </div>
              <div class="flex items-start gap-3">
                <UIcon name="i-heroicons-credit-card" class="text-lg text-muted mt-0.5 shrink-0" />
                <span>Billing is <strong class="text-default">not included</strong> — you'll manage your own subscription after transfer.</span>
              </div>
            </div>

            <p v-if="transfer.message" class="text-sm bg-muted/40 rounded-lg px-4 py-3 italic text-muted border border-default">
              "{{ transfer.message }}"
            </p>

            <!-- Not logged in -->
            <template v-if="!isAuthenticated && !sessionLoading">
              <UAlert
                color="info"
                variant="soft"
                icon="i-heroicons-information-circle"
                title="Sign in required"
                description="You need to sign in or create an account to accept this transfer."
              />
              <div class="space-y-3">
                <UButton block color="primary" @click="signInWithGoogle">
                  <UIcon name="i-simple-icons-google" class="mr-2" />
                  Continue with Google
                </UButton>
                <UButton block variant="outline" :to="`/login?next=/transfer/${token}`">
                  Sign in with email
                </UButton>
              </div>
            </template>

            <!-- Wrong email -->
            <template v-else-if="isAuthenticated && !emailMatches">
              <UAlert
                color="warning"
                variant="soft"
                icon="i-heroicons-exclamation-triangle"
                title="Wrong account"
                :description="`This transfer was sent to ${transfer.to_email}. You're signed in as ${user?.email}. Please sign in with the correct account.`"
              />
              <UButton block variant="soft" @click="switchAccount">Sign in with a different account</UButton>
            </template>

            <!-- Ready to accept -->
            <template v-else-if="isAuthenticated">
              <UAlert
                color="success"
                variant="soft"
                icon="i-heroicons-check-badge"
                :description="`Signed in as ${user?.email} — ready to accept.`"
              />
              <UAlert v-if="acceptError" color="error" variant="soft" :description="acceptError" />
              <UButton
                block
                color="primary"
                size="lg"
                :loading="accepting"
                @click="acceptTransfer"
              >
                Accept transfer
              </UButton>
            </template>

          </div>
        </div>

        <p class="text-center text-xs text-muted mt-4">
          Don't want this site? You can safely ignore this link.
        </p>
      </template>

    </div>
  </div>
</template>

<script setup lang="ts">
definePageMeta({ layout: false })

const route = useRoute()
const token = route.params.token as string

const { isAuthenticated, sessionLoading, user } = useAuth()

interface TransferInfo {
  id: string
  site_id: string
  site_name: string
  to_email: string
  expires_at: string
  message: string | null
  initiated_by_name: string
  initiated_by_domain: string
}

const loading = ref(true)
const loadError = ref<string | null>(null)
const transfer = ref<TransferInfo | null>(null)
const accepting = ref(false)
const acceptError = ref<string | null>(null)
const accepted = ref(false)

const emailMatches = computed(() => {
  if (!transfer.value || !user.value) return false
  return user.value.email?.toLowerCase() === transfer.value.to_email.toLowerCase()
})

const expiresIn = computed(() => {
  if (!transfer.value) return ''
  const diff = new Date(transfer.value.expires_at).getTime() - Date.now()
  const days = Math.ceil(diff / (1000 * 60 * 60 * 24))
  if (days <= 0) return 'soon'
  return days === 1 ? 'in 1 day' : `in ${days} days`
})

onMounted(async () => {
  try {
    const data = await $fetch<TransferInfo>(`/api/site-transfer/${token}`)
    transfer.value = data
  } catch (err: unknown) {
    const errorData = err && typeof err === 'object' && 'data' in err ? (err as Record<string, { error?: string }>).data : null
    const errorMessage = err && typeof err === 'object' && 'message' in err ? (err as Record<string, string>).message : null
    const msg = errorData?.error ?? errorMessage ?? 'This transfer link is invalid or has expired.'
    loadError.value = msg
  } finally {
    loading.value = false
  }
})

async function acceptTransfer() {
  accepting.value = true
  acceptError.value = null
  try {
    await $fetch(`/api/site-transfer/${token}/accept`, { method: 'POST' })
    accepted.value = true
  } catch (err: unknown) {
    const errorData = err && typeof err === 'object' && 'data' in err ? (err as Record<string, { error?: string }>).data : null
    acceptError.value = errorData?.error ?? 'Failed to accept the transfer. Please try again.'
  } finally {
    accepting.value = false
  }
}

async function signInWithGoogle() {
  const { authClient } = await import('~/lib/auth-client')
  await authClient.signIn.social({
    provider: 'google',
    callbackURL: `/transfer/${token}`,
  })
}

async function switchAccount() {
  const { authClient } = await import('~/lib/auth-client')
  await authClient.signOut()
}
</script>
