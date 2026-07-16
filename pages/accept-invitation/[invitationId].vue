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
      <div class="lg:grid lg:grid-cols-2 lg:min-h-screen">
        <div class="flex flex-col px-8 py-12 lg:px-12 max-w-lg mx-auto w-full lg:order-1 lg:sticky lg:top-0 lg:h-screen lg:overflow-y-auto bg-default border-r border-default">
          <span class="self-start inline-flex items-center gap-2 text-[11px] font-bold tracking-[0.3em] uppercase text-(--kc-teal-600) bg-(--kc-teal-100) px-3.5 py-1.5 rounded-full mb-6">
            <span class="w-1.5 h-1.5 rounded-full bg-(--kc-teal) shrink-0" />
            {{ invitedPhone ? 'Location manager access' : 'Team invitation' }}
          </span>

          <h1 class="text-[clamp(32px,4vw,48px)] font-extrabold leading-[1.02] tracking-tight text-default text-balance m-0">
            {{ invitedPhone ? `Activate manager access for ${invitation.organization.name}` : `Join ${invitation.organization.name}` }}
          </h1>
          <p class="mt-4 text-base text-muted">
            <template v-if="invitedPhone">
              You’ve been given operational access as a <strong class="text-default">location manager</strong> — notification replies and daily updates only, not full account onboarding.
            </template>
            <template v-else>
              You’ve been invited to join as <strong class="text-default capitalize">{{ roleLabel }}</strong>.
            </template>
          </p>

          <div class="mt-6 space-y-3">
            <div class="flex items-start gap-3 text-sm">
              <svg class="size-4 text-muted mt-0.5 shrink-0" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" d="M21.75 6.75v10.5a2.25 2.25 0 01-2.25 2.25h-15a2.25 2.25 0 01-2.25-2.25V6.75m19.5 0A2.25 2.25 0 0019.5 4.5h-15a2.25 2.25 0 00-2.25 2.25m19.5 0v.243a2.25 2.25 0 01-1.07 1.916l-7.5 4.615a2.25 2.25 0 01-2.36 0L3.32 8.91a2.25 2.25 0 01-1.07-1.916V6.75" /></svg>
              <span class="text-muted">This invite was sent to <strong class="text-default">{{ invitation.email }}</strong>.</span>
            </div>
            <div v-if="invitation.site" class="flex items-start gap-3 text-sm">
              <svg class="size-4 text-muted mt-0.5 shrink-0" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" d="M12 21a9.004 9.004 0 008.716-6.747M12 21a9.004 9.004 0 01-8.716-6.747M12 21c2.485 0 4.5-4.03 4.5-9S14.485 3 12 3m0 18c-2.485 0-4.5-4.03-4.5-9S9.515 3 12 3m0 0a8.997 8.997 0 017.843 4.582M12 3a8.997 8.997 0 00-7.843 4.582m15.686 0A11.953 11.953 0 0112 10.5c-2.998 0-5.74-1.1-7.843-2.918m15.686 0A8.959 8.959 0 0121 12c0 .778-.099 1.533-.284 2.253m0 0A17.919 17.919 0 0112 16.5c-3.162 0-6.133-.815-8.716-2.247m0 0A9.015 9.015 0 013 12c0-1.605.42-3.113 1.157-4.418" /></svg>
              <span class="text-muted">
                You’ll land in <strong class="text-default">{{ invitation.site.brandName || invitation.site.subdomain || invitation.organization.name }}</strong>
                <template v-if="invitation.site.subdomain"> at <strong class="text-default">{{ invitation.site.subdomain }}.{{ freeSiteDomain }}</strong></template>.
              </span>
            </div>
            <div v-if="invitation.inviter.name || invitation.inviter.email" class="flex items-start gap-3 text-sm">
              <svg class="size-4 text-muted mt-0.5 shrink-0" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" d="M15.75 6a3.75 3.75 0 11-7.5 0 3.75 3.75 0 017.5 0zM4.501 20.118a7.5 7.5 0 0114.998 0A17.933 17.933 0 0112 21.75c-2.676 0-5.216-.584-7.499-1.632z" /></svg>
              <span class="text-muted">
                Invited by
                <strong class="text-default">{{ invitation.inviter.name || invitation.inviter.email }}</strong>.
              </span>
            </div>
          </div>

          <div class="mt-8 space-y-3">
            <template v-if="!isAuthenticated && !sessionLoading">
              <div v-if="invitedPhone" class="rounded-xl border border-default p-4 space-y-3">
                <p class="text-sm text-muted">Verify the invited WhatsApp number <strong class="text-default">{{ invitedPhone }}</strong> to activate location manager access. Your assignment stays inactive until this code is confirmed.</p>
                <button v-if="otpStep === 'send'" class="w-full py-3 px-4 rounded-[10px] font-semibold text-white bg-green-600 disabled:opacity-50" :disabled="otpLoading" @click="sendInvitationOtp">
                  {{ otpLoading ? 'Sending…' : 'Send code via WhatsApp' }}
                </button>
                <template v-else>
                  <input v-model="otpCode" type="text" inputmode="numeric" maxlength="6" autocomplete="one-time-code" placeholder="6-digit code" class="w-full rounded-lg border border-default bg-default px-3 py-2 text-center font-mono tracking-widest" @keydown.enter="verifyInvitationOtp" />
                  <button class="w-full py-3 px-4 rounded-[10px] font-semibold text-white bg-green-600 disabled:opacity-50" :disabled="otpLoading || otpCode.length !== 6" @click="verifyInvitationOtp">
                    {{ otpLoading ? 'Verifying…' : 'Verify and continue' }}
                  </button>
                  <button class="w-full text-sm text-muted" :disabled="otpLoading" @click="sendInvitationOtp">Resend code</button>
                </template>
                <p v-if="otpError" role="alert" class="text-sm text-red-500">{{ otpError }}</p>
              </div>
              <template v-else>
              <button class="w-full flex items-center justify-center bg-black dark:bg-white text-white dark:text-black py-3 px-4 rounded-[10px] font-semibold text-[15px] shadow-sm hover:scale-[1.01] transition-all duration-300" @click="continueWithGoogle">
                <svg class="w-5 h-5 mr-2" viewBox="0 0 24 24">
                  <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
                  <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
                  <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
                  <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
                </svg>
                Continue with Google
              </button>
              <NuxtLink :to="emailLoginUrl" class="w-full flex items-center justify-center bg-transparent border border-default text-default py-3 px-4 rounded-[10px] font-semibold text-[15px] hover:bg-muted/10 transition-all">
                Sign in with email
              </NuxtLink>
              <p class="text-xs text-center text-muted">Sign in or create an account with the invited email to join this team.</p>
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
              <div class="rounded-lg border border-green-500/30 bg-green-500/5 px-4 py-3 text-sm text-green-600 dark:text-green-500 flex items-center gap-3">
                <svg class="size-5 shrink-0" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12c0 1.268-.63 2.39-1.593 3.068a3.745 3.745 0 01-1.043 3.296 3.745 3.745 0 01-3.296 1.043A3.745 3.745 0 0112 21c-1.268 0-2.39-.63-3.068-1.593a3.746 3.746 0 01-3.296-1.043 3.745 3.745 0 01-1.043-3.296A3.745 3.745 0 013 12c0-1.268.63-2.39 1.593-3.068a3.745 3.745 0 011.043-3.296 3.746 3.746 0 013.296-1.043A3.746 3.746 0 0112 3c1.268 0 2.39.63 3.068 1.593a3.746 3.746 0 013.296 1.043 3.746 3.746 0 011.043 3.296A3.745 3.745 0 0121 12z" /></svg>
                <p>Signed in as {{ user?.email }}</p>
              </div>
              <div v-if="acceptError" role="alert" class="rounded-lg border border-red-500/30 bg-red-500/5 px-4 py-3 text-sm text-red-500">
                {{ acceptError }}
              </div>
              <button
                class="w-full flex items-center justify-center py-3 px-4 rounded-[10px] text-[15px] font-semibold shadow-sm transition-all text-white bg-black dark:bg-white dark:text-black hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed"
                :disabled="accepting"
                @click="acceptInvitation"
              >
                <svg v-if="accepting" class="animate-spin -ml-1 mr-2 h-4 w-4" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                  <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
                  <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                </svg>
                Join {{ invitation.organization.name }}
              </button>
            </template>
          </div>

          <p class="mt-6 text-xs text-muted text-center">Ignore this link if you weren’t expecting an invitation.</p>
        </div>

        <div class="relative bg-muted/20 lg:order-2 lg:sticky lg:top-0 lg:h-screen overflow-hidden">
          <template v-if="iframeUrl">
            <div class="lg:hidden h-56 relative overflow-hidden border-b border-default">
              <iframe
                :src="iframeUrl"
                class="absolute top-0 left-0 w-full h-full border-none"
                style="pointer-events: none;"
                sandbox="allow-scripts allow-same-origin"
                loading="lazy"
                title="Site preview"
              />
              <a :href="iframeUrl" target="_blank" rel="noopener" class="absolute inset-0 flex items-end justify-end p-3">
                <span class="flex items-center gap-1.5 bg-default/90 backdrop-blur-sm rounded-lg px-3 py-1.5 text-xs font-medium text-default shadow border border-default">
                  <svg class="size-3.5" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" d="M13.5 6H5.25A2.25 2.25 0 003 8.25v10.5A2.25 2.25 0 005.25 21h10.5A2.25 2.25 0 0018 18.75V10.5m-10.5 6L21 3m0 0h-5.25M21 3v5.25" /></svg>
                  Open full site
                </span>
              </a>
            </div>
            <div class="hidden lg:block absolute inset-0">
              <iframe
                :src="iframeUrl"
                class="w-full h-full border-none"
                sandbox="allow-scripts allow-same-origin"
                loading="lazy"
                title="Site preview"
              />
              <div class="absolute top-4 right-4 pointer-events-none">
                <a :href="iframeUrl" target="_blank" rel="noopener" class="pointer-events-auto flex items-center gap-1.5 bg-default/90 backdrop-blur-sm rounded-lg px-3 py-2 text-sm font-medium text-default shadow border border-default">
                  <svg class="size-4" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" d="M13.5 6H5.25A2.25 2.25 0 003 8.25v10.5A2.25 2.25 0 005.25 21h10.5A2.25 2.25 0 0018 18.75V10.5m-10.5 6L21 3m0 0h-5.25M21 3v5.25" /></svg>
                  Open full site
                </a>
              </div>
            </div>
          </template>
          <div v-else class="flex items-center justify-center h-56 lg:h-full text-sm text-muted px-6 text-center">
            You’ll be added to the team and sent to the dashboard after acceptance.
          </div>
        </div>
      </div>
    </template>
  </div>
</template>

<script setup lang="ts">
definePageMeta({ layout: false })

const route = useRoute()
const invitationId = route.params.invitationId as string
const preferredSiteId = computed(() => typeof route.query.siteId === 'string' ? route.query.siteId : '')
// Preserves any destination info already on this URL (currently `siteId`,
// and `returnTo` when a caller — e.g. a future dashboard reauth deep link —
// sets one) across the OTP verify -> full-page-reload round trip, instead of
// hardcoding just the one query param this page happens to read today.
const returnTo = computed(() => typeof route.query.returnTo === 'string' ? route.query.returnTo : '')

const { isAuthenticated, sessionLoading, user } = useAuth()

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

const pagePath = computed(() => {
  const url = new URL(`/accept-invitation/${invitationId}`, 'http://localhost')
  if (preferredSiteId.value) url.searchParams.set('siteId', preferredSiteId.value)
  if (returnTo.value) url.searchParams.set('returnTo', returnTo.value)
  return `${url.pathname}${url.search}`
})

const emailLoginUrl = computed(() => `/login?redirect=${encodeURIComponent(pagePath.value)}`)
const invitedPhone = computed(() => {
  const match = invitation.value?.email.match(/^phone-(\d+)@phone\.krabiclaw\.local$/i)
  return match ? `+${match[1]}` : ''
})
// Better Auth roles like `location_manager` are snake_case identifiers, not
// display copy — render them as normal words instead of leaking the raw
// underscore ("Location_manager") into invitation copy.
const roleLabel = computed(() => (invitation.value?.role ?? 'member').replace(/_/g, ' '))
const otpStep = ref<'send' | 'code'>('send')
const otpCode = ref('')
const otpLoading = ref(false)
const otpError = ref<string | null>(null)

const config = useRuntimeConfig()
const freeSiteDomain = computed(() => (config.public.freeSiteDomain as string).replace(/^https?:\/\//, ''))

const emailMatches = computed(() => {
  if (!invitation.value || !user.value) return false
  return user.value.email?.toLowerCase() === invitation.value.email.toLowerCase()
})

const iframeUrl = computed(() => {
  if (!invitation.value?.site?.subdomain) return ''
  return `https://${invitation.value.site.subdomain}.${freeSiteDomain.value}`
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

async function continueWithGoogle() {
  const { authClient } = await import('~/lib/auth-client')
  await authClient.signIn.social({
    provider: 'google',
    callbackURL: pagePath.value,
  })
}

async function sendInvitationOtp() {
  if (!invitedPhone.value) return
  otpLoading.value = true
  otpError.value = null
  try {
    const { authClient } = await import('~/lib/auth-client')
    const result = await authClient.phoneNumber.sendOtp({ phoneNumber: invitedPhone.value })
    if (result.error) throw new Error(result.error.message || 'Failed to send code')
    otpStep.value = 'code'
  } catch (error) {
    otpError.value = error instanceof Error ? error.message : 'Failed to send code'
  } finally {
    otpLoading.value = false
  }
}

async function verifyInvitationOtp() {
  if (!invitedPhone.value || otpCode.value.length !== 6) return
  otpLoading.value = true
  otpError.value = null
  try {
    const { authClient } = await import('~/lib/auth-client')
    const result = await authClient.phoneNumber.verify({ phoneNumber: invitedPhone.value, code: otpCode.value.trim() })
    if (result.error) throw new Error(result.error.message || 'Invalid or expired code')
    window.location.href = pagePath.value
  } catch (error) {
    otpError.value = error instanceof Error ? error.message : 'Invalid or expired code'
    otpCode.value = ''
  } finally {
    otpLoading.value = false
  }
}

async function switchAccount() {
  const { authClient } = await import('~/lib/auth-client')
  await authClient.signOut()
}
</script>
