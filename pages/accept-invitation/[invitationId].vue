<template>
  <div class="min-h-screen bg-default">
    <div v-if="loading" class="min-h-screen flex items-center justify-center">
      <div class="text-center space-y-3">
        <svg class="animate-spin text-4xl text-muted w-10 h-10 mx-auto" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24"><circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle><path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path></svg>
        <p class="text-muted text-sm">Loading…</p>
      </div>
    </div>

    <div v-else-if="loadError" class="min-h-screen flex items-center justify-center px-4">
      <div class="text-center space-y-4 max-w-sm">
        <div class="w-16 h-16 rounded-full bg-red-100 dark:bg-red-900/30 flex items-center justify-center mx-auto">
          <svg class="w-8 h-8 text-red-500" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" d="M9.75 9.75l4.5 4.5m0-4.5l-4.5 4.5M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
        </div>
        <h1 class="text-xl font-bold text-highlighted">Invitation unavailable</h1>
        <p class="text-muted text-sm">{{ loadError }}</p>
        <NuxtLink to="/dashboard" class="inline-flex justify-center rounded-lg px-4 py-2 text-sm font-semibold bg-elevated text-default border border-default hover:bg-muted/10 transition-colors">Go to Dashboard</NuxtLink>
      </div>
    </div>

    <div v-else-if="accepted" class="min-h-screen flex items-center justify-center px-4">
      <div class="text-center space-y-4 max-w-sm">
        <div class="w-16 h-16 rounded-full bg-green-100 dark:bg-green-900/30 flex items-center justify-center mx-auto">
          <svg class="w-8 h-8 text-green-500" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
        </div>
        <h1 class="text-xl font-bold text-highlighted">You’re in</h1>
        <p class="text-muted text-sm">Opening {{ invitation?.organization.name }}…</p>
      </div>
    </div>

    <template v-else-if="invitation">
      <div class="min-h-screen flex items-center">
        <div class="flex flex-col px-8 py-12 max-w-lg mx-auto w-full bg-default">
          <h1 class="text-[clamp(32px,4vw,48px)] font-extrabold leading-[1.02] tracking-tight text-default text-balance m-0">
            Join {{ invitation.organization.name }}
          </h1>
          <p class="mt-4 text-base text-muted">
            You’ve been invited as <strong class="text-default capitalize">{{ roleLabel }}</strong><template v-if="inviterDisplay"> by <strong class="text-default">{{ inviterDisplay }}</strong></template>.
          </p>
          <p class="mt-3 text-sm text-muted">Continue as <strong class="text-default">{{ invitedPhone || invitation.email }}</strong>.</p>

          <div class="mt-8 space-y-3">
            <template v-if="!isAuthenticated && !sessionLoading">
              <AuthPhoneOtpForm v-if="invitedPhone" :fixed-phone="invitedPhone" @verified="finishPhoneInvitation" />
              <template v-else>
              <AuthGoogleAuthButton @activate="continueWithGoogle" />
              <NuxtLink :to="emailLoginUrl" class="w-full flex items-center justify-center bg-transparent border border-default text-default py-3 px-4 rounded-[10px] font-semibold text-[15px] hover:bg-muted/10 transition-all">
                Sign in with email
              </NuxtLink>
              </template>
            </template>

            <template v-else-if="isAuthenticated && !emailMatches">
              <div class="rounded-lg border border-yellow-500/30 bg-yellow-500/5 px-4 py-3 text-sm text-yellow-600 dark:text-yellow-500 flex items-start gap-3">
                <svg class="size-5 shrink-0 mt-0.5" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" /></svg>
                <div>
                  <h3 class="font-bold">Wrong account</h3>
                  <p class="mt-1">This was sent to {{ invitation.email }}. You’re signed in as {{ user?.email }}.</p>
                </div>
              </div>
              <button class="w-full py-2.5 px-4 bg-muted/10 text-default rounded-lg text-sm font-medium hover:bg-muted/20 transition-colors" @click="switchAccount">Sign in with a different account</button>
            </template>

            <template v-else-if="isAuthenticated">
              <p v-if="accepting" class="text-sm text-muted text-center py-3">Joining {{ invitation.organization.name }}…</p>
              <div v-if="acceptError" role="alert" class="rounded-lg border border-red-500/30 bg-red-500/5 px-4 py-3 text-sm text-red-500">
                {{ acceptError }}
              </div>
              <button
                v-if="acceptError"
                class="w-full flex items-center justify-center py-3 px-4 rounded-[10px] text-[15px] font-semibold shadow-sm transition-all text-white bg-black dark:bg-white dark:text-black hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed"
                :disabled="accepting"
                @click="acceptInvitation"
              >
                <svg v-if="accepting" class="animate-spin -ml-1 mr-2 h-4 w-4" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                  <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
                  <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                </svg>
                Try again
              </button>
            </template>
          </div>

          <details v-if="showInvitationDetails" class="mt-6 rounded-lg border border-default px-4 py-3 text-sm text-muted">
            <summary class="cursor-pointer font-medium text-default">Invitation details</summary>
            <dl class="mt-3 space-y-2">
              <div><dt class="inline">Destination:</dt> <dd class="inline">{{ destinationLabel }}</dd></div>
            </dl>
          </details>
        </div>
      </div>
    </template>
  </div>
</template>

<script setup lang="ts">
import { completeVerifiedInvitation } from '~/shared/auth/invitation-activation'
import { buildLoginUrl } from '~/shared/auth/return-target'

definePageMeta({ layout: false })

const route = useRoute()
const invitationId = route.params.invitationId as string
const preferredSiteId = computed(() => typeof route.query.siteId === 'string' ? route.query.siteId : '')
// Preserves any destination info already on this URL (currently `siteId`,
// and `returnTo` when a caller — e.g. a future dashboard reauth deep link —
// sets one) across the OTP verify -> full-page-reload round trip, instead of
// hardcoding just the one query param this page happens to read today.
const returnTo = computed(() => typeof route.query.returnTo === 'string' ? route.query.returnTo : '')

const { isAuthenticated, sessionLoading, user } = await useAuthSession()

interface InvitationInfo {
  id: string
  email: string
  role: string
  expiresAt: string
  organization: {
    id: string
    name: string
    slug: string | null
  }
  inviter: {
    name: string | null
    email: string | null
  }
  site: {
    id: string
    subdomain: string | null
    brandName: string | null
    status: string | null
    onboardingStatus: string | null
  } | null
  siteCount: number
  preferredSiteRequested: boolean
}

const loading = ref(true)
const loadError = ref<string | null>(null)
const invitation = ref<InvitationInfo | null>(null)
const accepting = ref(false)
const acceptError = ref<string | null>(null)
const accepted = ref(false)
const autoAcceptAttempted = ref(false)
const authOperation = useAuthOperation()

const pagePath = computed(() => {
  const url = new URL(`/accept-invitation/${invitationId}`, 'http://localhost')
  if (preferredSiteId.value) url.searchParams.set('siteId', preferredSiteId.value)
  if (returnTo.value) url.searchParams.set('returnTo', returnTo.value)
  return `${url.pathname}${url.search}`
})

const emailLoginUrl = computed(() => buildLoginUrl({ redirect: pagePath.value }))
const invitedPhone = computed(() => {
  const match = invitation.value?.email.match(/^phone-(\d+)@phone\.krabiclaw\.local$/i)
  return match ? `+${match[1]}` : ''
})
// Better Auth roles are identifiers, not display copy — render them as normal
// words instead of leaking raw underscores into invitation copy.
const roleLabel = computed(() => (invitation.value?.role ?? 'member').replace(/_/g, ' '))
const inviterDisplay = computed(() => invitation.value?.inviter.name || invitation.value?.inviter.email || '')
const destinationLabel = computed(() => invitation.value?.site?.brandName || invitation.value?.site?.subdomain || '')
const showInvitationDetails = computed(() => (
  Boolean(destinationLabel.value)
  && destinationLabel.value.trim().toLowerCase() !== invitation.value?.organization.name.trim().toLowerCase()
))
const emailMatches = computed(() => {
  if (!invitation.value || !user.value) return false
  return user.value.email?.toLowerCase() === invitation.value.email.toLowerCase()
})

function invitationQuerySuffix(): string {
  const params = new URLSearchParams()
  if (preferredSiteId.value) params.set('siteId', preferredSiteId.value)
  if (returnTo.value) params.set('returnTo', returnTo.value)
  return params.size ? `?${params.toString()}` : ''
}

onMounted(async () => {
  try {
    const result = await $fetch<InvitationInfo | { status: 'accepted'; redirectTo: string }>(`/api/invitations/${invitationId}${invitationQuerySuffix()}`)
    // Idempotent re-visit of an already-accepted invitation (see
    // server/api/invitations/[invitationId].get.ts): the current session is
    // already the accepted member, so skip straight to the destination
    // instead of rendering the invite screen or an error.
    if ('status' in result && result.status === 'accepted') {
      accepted.value = true
      loading.value = false
      await navigateTo(result.redirectTo)
      return
    }
    invitation.value = result as InvitationInfo
  } catch (err: unknown) {
    const errorData = err && typeof err === 'object' && 'data' in err ? (err as Record<string, { error?: string }>).data : null
    const errorMessage = err && typeof err === 'object' && 'message' in err ? (err as Record<string, string>).message : null
    loadError.value = errorData?.error ?? errorMessage ?? 'This invitation link is invalid or unavailable.'
  } finally {
    loading.value = false
  }
})

async function acceptInvitation() {
  accepting.value = true
  acceptError.value = null
  try {
    const result = await $fetch<{ success: boolean; redirectTo: string }>(`/api/invitations/${invitationId}/accept${invitationQuerySuffix()}`, {
      method: 'POST',
    })
    accepted.value = true
    await navigateTo(result.redirectTo)
  } catch (err: unknown) {
    const errorData = err && typeof err === 'object' && 'data' in err ? (err as Record<string, { error?: string }>).data : null
    acceptError.value = errorData?.error ?? 'Failed to accept this invitation. Please try again.'
  } finally {
    accepting.value = false
  }
}

// The invitation link already records intent to join. Once authentication
// proves the invited email or phone identity, finish acceptance immediately
// for both flows instead of presenting a second consent button. A failed
// attempt remains visible with an explicit retry action.
watch([loading, sessionLoading, isAuthenticated, emailMatches, invitation], async () => {
  if (loading.value || sessionLoading.value || !invitation.value) return
  if (!isAuthenticated.value || !emailMatches.value || autoAcceptAttempted.value) return
  autoAcceptAttempted.value = true
  await acceptInvitation()
}, { immediate: true })

async function continueWithGoogle() {
  await authOperation.signInWithGoogle(pagePath.value)
}

async function finishPhoneInvitation() {
  autoAcceptAttempted.value = true
  await completeVerifiedInvitation({
    accept: acceptInvitation,
    isAccepted: () => accepted.value,
    fallback: () => { window.location.href = pagePath.value },
  })
}

async function switchAccount() {
  const { authClient } = await import('~/lib/auth-client')
  await authClient.signOut()
}
</script>
