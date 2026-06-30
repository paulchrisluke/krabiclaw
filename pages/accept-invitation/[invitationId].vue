<template>
  <div class="min-h-screen bg-default">
    <div v-if="loading" class="min-h-screen flex items-center justify-center">
      <div class="text-center space-y-3">
        <UIcon name="i-heroicons-arrow-path" class="animate-spin text-4xl text-muted" />
        <p class="text-muted text-sm">Loading…</p>
      </div>
    </div>

    <div v-else-if="loadError" class="min-h-screen flex items-center justify-center px-4">
      <div class="text-center space-y-4 max-w-sm">
        <div class="w-16 h-16 rounded-full bg-red-100 dark:bg-red-900/30 flex items-center justify-center mx-auto">
          <UIcon name="i-heroicons-x-circle" class="text-3xl text-red-500" />
        </div>
        <h1 class="text-xl font-bold text-highlighted">Invitation unavailable</h1>
        <p class="text-muted text-sm">{{ loadError }}</p>
        <UButton to="/dashboard" variant="soft">Go to Dashboard</UButton>
      </div>
    </div>

    <div v-else-if="accepted" class="min-h-screen flex items-center justify-center px-4">
      <div class="text-center space-y-4 max-w-sm">
        <div class="w-16 h-16 rounded-full bg-green-100 dark:bg-green-900/30 flex items-center justify-center mx-auto">
          <UIcon name="i-heroicons-check-circle" class="text-3xl text-green-500" />
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
            Team invitation
          </span>

          <h1 class="text-[clamp(32px,4vw,48px)] font-extrabold leading-[1.02] tracking-tight text-default text-balance m-0">
            Join {{ invitation.organization.name }}
          </h1>
          <p class="mt-4 text-base text-muted">
            You’ve been invited to join as <strong class="text-default capitalize">{{ invitation.role }}</strong>.
          </p>

          <div class="mt-6 space-y-3">
            <div class="flex items-start gap-3 text-sm">
              <UIcon name="i-heroicons-envelope" class="size-4 text-muted mt-0.5 shrink-0" />
              <span class="text-muted">This invite was sent to <strong class="text-default">{{ invitation.email }}</strong>.</span>
            </div>
            <div v-if="invitation.site" class="flex items-start gap-3 text-sm">
              <UIcon name="i-heroicons-globe-alt" class="size-4 text-muted mt-0.5 shrink-0" />
              <span class="text-muted">
                You’ll land in <strong class="text-default">{{ invitation.site.brandName || invitation.site.subdomain || invitation.organization.name }}</strong>
                <template v-if="invitation.site.subdomain"> at <strong class="text-default">{{ invitation.site.subdomain }}.{{ freeSiteDomain }}</strong></template>.
              </span>
            </div>
            <div v-if="invitation.inviter.name || invitation.inviter.email" class="flex items-start gap-3 text-sm">
              <UIcon name="i-heroicons-user" class="size-4 text-muted mt-0.5 shrink-0" />
              <span class="text-muted">
                Invited by
                <strong class="text-default">{{ invitation.inviter.name || invitation.inviter.email }}</strong>.
              </span>
            </div>
          </div>

          <div class="mt-8 space-y-3">
            <template v-if="!isAuthenticated && !sessionLoading">
              <UButton block color="primary" size="xl" class="rounded-[10px] font-semibold text-[15px] shadow-sm hover:scale-[1.01] transition-all duration-300" @click="continueWithGoogle">
                <UIcon name="i-simple-icons-google" class="mr-2" />
                Continue with Google
              </UButton>
              <UButton block variant="outline" size="xl" class="rounded-[10px] font-semibold text-[15px]" :to="emailLoginUrl">
                Sign in with email
              </UButton>
              <p class="text-xs text-center text-muted">Sign in or create an account with the invited email to join this team.</p>
            </template>

            <template v-else-if="isAuthenticated && !emailMatches">
              <UAlert
                color="warning"
                variant="soft"
                icon="i-heroicons-exclamation-triangle"
                title="Wrong account"
                :description="`This was sent to ${invitation.email}. You’re signed in as ${user?.email}.`"
              />
              <UButton block variant="soft" @click="switchAccount">Sign in with a different account</UButton>
            </template>

            <template v-else-if="isAuthenticated">
              <UAlert
                color="success"
                variant="soft"
                icon="i-heroicons-check-badge"
                :description="`Signed in as ${user?.email}`"
              />
              <UAlert v-if="acceptError" color="error" variant="soft" :description="acceptError" />
              <UButton
                block
                color="primary"
                size="xl"
                class="rounded-[10px] font-semibold text-[15px] shadow-sm hover:scale-[1.01] transition-all duration-300"
                :loading="accepting"
                @click="acceptInvitation"
              >
                Join {{ invitation.organization.name }}
              </UButton>
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
                  <UIcon name="i-heroicons-arrow-top-right-on-square" class="size-3.5" />
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
                  <UIcon name="i-heroicons-arrow-top-right-on-square" class="size-4" />
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
  return `${url.pathname}${url.search}`
})

const emailLoginUrl = computed(() => `/login?next=${encodeURIComponent(pagePath.value)}`)

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

onMounted(async () => {
  try {
    const params = new URLSearchParams()
    if (preferredSiteId.value) params.set('siteId', preferredSiteId.value)
    const suffix = params.size ? `?${params.toString()}` : ''
    invitation.value = await $fetch<InvitationInfo>(`/api/invitations/${invitationId}${suffix}`)
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
    const params = new URLSearchParams()
    if (preferredSiteId.value) params.set('siteId', preferredSiteId.value)
    const suffix = params.size ? `?${params.toString()}` : ''
    const result = await $fetch<{ success: boolean; redirectTo: string }>(`/api/invitations/${invitationId}/accept${suffix}`, {
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

async function switchAccount() {
  const { authClient } = await import('~/lib/auth-client')
  await authClient.signOut()
}
</script>
