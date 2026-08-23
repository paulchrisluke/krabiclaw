<template>
  <UDashboardPanel id="account-authentication">
    <template #header>
      <UDashboardNavbar title="Authentication">
        <template #leading>
          <DashboardNavbarLeading :detail-to="accountIndexTo" detail-label="Account" />
        </template>
        <template #right><DashboardAccountMenu mobile-only class="lg:hidden" /></template>
      </UDashboardNavbar>
    </template>

    <template #body>
      <div class="w-full max-w-[var(--ws-page-narrow,45rem)]">
            <div class="divide-y divide-default border-y border-default">
              <!-- Email -->
              <div class="auth-row">
                <div class="flex min-w-0 items-center gap-3.5">
                  <UIcon name="i-lucide-mail" class="size-[22px] shrink-0 text-muted" />
                  <div>
                    <p class="font-medium text-highlighted">Email</p>
                    <p class="text-sm text-muted">{{ sessionData?.user?.email }}</p>
                  </div>
                </div>
                <div class="flex shrink-0 items-center gap-3">
                  <span v-if="sessionData?.user?.emailVerified" class="status-pill"><span class="status-dot" />Verified</span>
                  <NuxtLink to="/forgot-password" class="account-action">Reset password</NuxtLink>
                </div>
              </div>

              <!-- Google -->
              <div class="auth-row">
                <div class="flex min-w-0 items-center gap-3.5">
                  <UIcon name="i-logos-google-icon" class="size-[22px] shrink-0" />
                  <div>
                    <p class="font-medium text-highlighted">Google</p>
                    <p v-if="googleStatus === 'loading'" class="text-sm text-muted">Checking…</p>
                    <p v-else-if="googleStatus === 'connected'" class="text-sm text-muted">Connected</p>
                    <p v-else-if="googleStatus === 'error'" class="text-sm text-muted">Unable to check connection status</p>
                    <p v-else class="text-sm text-muted">Not connected</p>
                  </div>
                </div>
              </div>

              <!-- WhatsApp (OTP) -->
              <div class="auth-row">
                <div class="flex min-w-0 items-center gap-3.5">
                  <UIcon name="i-logos-whatsapp-icon" class="size-[22px] shrink-0" />
                  <div>
                    <p class="font-medium text-highlighted">WhatsApp</p>
                    <p v-if="sessionData?.user?.phoneNumber" class="text-sm text-muted">{{ sessionData?.user?.phoneNumber }}</p>
                    <p v-else class="text-sm text-muted">Not connected</p>
                  </div>
                </div>
                <div class="flex shrink-0 items-center gap-3">
                  <span v-if="sessionData?.user?.phoneNumberVerified" class="status-pill"><span class="status-dot" />Verified</span>
                  <NuxtLink :to="profileTo" class="account-action">{{ sessionData?.user?.phoneNumber ? 'Manage' : 'Add' }}</NuxtLink>
                </div>
              </div>
            </div>
      </div>
    </template>
  </UDashboardPanel>
</template>

<script setup lang="ts">
import { authClient } from '~/lib/auth-client'
import { useAuth } from '~/composables/useAuth'

definePageMeta({ layout: 'dashboard' })
useSeoMeta({ title: 'Authentication | KrabiClaw Dashboard', robots: 'noindex, nofollow' })

const { data: sessionData } = useAuth()
const route = useRoute()
const accountIndexTo = computed(() => ({
  path: '/dashboard/account',
  query: {
    ...(typeof route.query.organization === 'string' ? { organization: route.query.organization } : {}),
    ...(typeof route.query.organizationName === 'string' ? { organizationName: route.query.organizationName } : {}),
  },
}))
const profileTo = computed(() => ({
  path: '/dashboard/account/profile',
  query: {
    ...(typeof route.query.organization === 'string' ? { organization: route.query.organization } : {}),
    ...(typeof route.query.organizationName === 'string' ? { organizationName: route.query.organizationName } : {}),
  },
}))

// listAccounts() doesn't expose a per-account email (only providerId/accountId/
// scopes) — there's no Google-specific email to show, so "connected" renders a
// generic label rather than implying we know a per-provider address. A failed
// lookup is shown distinctly from "not connected" too, since defaulting an
// error to false would misreport a real Google-linked account as unlinked.
const googleStatus = ref<'loading' | 'connected' | 'not-connected' | 'error'>('loading')
onMounted(async () => {
  try {
    const { data, error } = await authClient.listAccounts()
    if (error) {
      googleStatus.value = 'error'
      return
    }
    googleStatus.value = data?.some(account => account.providerId === 'google') ? 'connected' : 'not-connected'
  } catch {
    googleStatus.value = 'error'
  }
})
</script>

<style scoped>
.auth-row { display: flex; min-height: var(--ws-row-min-height, 66px); align-items: center; justify-content: space-between; gap: 1rem; padding-block: 18px; }
.account-action { font-size: 13.5px; font-weight: 600; color: var(--ui-text-highlighted); text-decoration: underline; text-underline-offset: 3px; }
.status-pill { display: inline-flex; align-items: center; gap: 6px; border-radius: 999px; background: var(--ui-bg-muted); padding: 4px 9px; font-size: 12px; font-weight: 600; color: var(--ui-text-muted); }
.status-dot { width: 6px; height: 6px; border-radius: 999px; background: var(--ui-success); }
</style>
