<template>
  <UDashboardPanel id="account-authentication">
    <template #header>
      <UDashboardNavbar title="Authentication">
        <template #leading>
          <UDashboardSidebarCollapse />
        </template>
      </UDashboardNavbar>
    </template>

    <template #body>
      <div class="max-w-4xl space-y-10">
        
        <!-- Sign-in Methods -->
        <section class="space-y-4">
          <div class="space-y-1">
            <h3 class="text-xl font-semibold text-highlighted">Sign-in Methods</h3>
            <p class="text-sm text-muted">Customize how you access your account. Link your social profiles or phone number for seamless, secure authentication.</p>
          </div>

          <UCard variant="soft">
            <div class="divide-y divide-default">
              <!-- Email -->
              <div class="flex items-center justify-between p-4 sm:px-6">
                <div class="flex items-center gap-4">
                  <UIcon name="i-lucide-mail" class="size-6 text-muted" />
                  <div>
                    <p class="font-medium text-highlighted">Email</p>
                    <p class="text-sm text-muted">{{ sessionData?.user?.email }}</p>
                  </div>
                </div>
                <div class="flex items-center gap-4">
                  <UBadge v-if="sessionData?.user?.emailVerified" color="success" variant="subtle" size="sm">Verified</UBadge>
                  <UButton color="neutral" variant="soft" size="sm" to="/forgot-password">
                    Reset password
                  </UButton>
                </div>
              </div>

              <!-- Google -->
              <div class="flex items-center justify-between p-4 sm:px-6">
                <div class="flex items-center gap-4">
                  <UIcon name="i-logos-google-icon" class="size-6" />
                  <div>
                    <p class="font-medium text-highlighted">Google</p>
                    <p v-if="googleConnected" class="text-sm text-muted">Connected to {{ sessionData?.user?.email }}</p>
                    <p v-else class="text-sm text-muted">Not connected</p>
                  </div>
                </div>
              </div>

              <!-- WhatsApp (OTP) -->
              <div class="flex items-center justify-between p-4 sm:px-6">
                <div class="flex items-center gap-4">
                  <UIcon name="i-logos-whatsapp-icon" class="size-6" />
                  <div>
                    <p class="font-medium text-highlighted">WhatsApp</p>
                    <p v-if="sessionData?.user?.phoneNumber" class="text-sm text-muted">{{ sessionData?.user?.phoneNumber }}</p>
                    <p v-else class="text-sm text-muted">Not connected</p>
                  </div>
                </div>
                <div class="flex items-center gap-4">
                  <UBadge v-if="sessionData?.user?.phoneNumberVerified" color="success" variant="subtle" size="sm">Verified</UBadge>
                  <UButton color="neutral" variant="soft" size="sm" to="/dashboard/account/profile">
                    {{ sessionData?.user?.phoneNumber ? 'Manage' : 'Add' }}
                  </UButton>
                </div>
              </div>
            </div>
          </UCard>
        </section>

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

const googleConnected = ref(false)
onMounted(async () => {
  try {
    const { data } = await authClient.listAccounts()
    googleConnected.value = data?.some(account => account.providerId === 'google') ?? false
  } catch {
    googleConnected.value = false
  }
})
</script>
