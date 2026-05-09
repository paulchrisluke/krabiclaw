<template>
  <UPage>
    <UPageHeader
      title="Integrations"
      description="Connect organization-level services. Website and location mapping happens inside each website."
    />

    <UPageBody>
      <div class="grid gap-4 lg:grid-cols-2">
        <UCard>
          <template #header>
            <div class="flex items-center gap-3">
              <UIcon name="i-simple-icons-google" class="size-5 text-(--ui-primary)" />
              <h2 class="font-semibold text-(--ui-text-highlighted)">Google Business</h2>
            </div>
          </template>

          <p class="text-sm text-(--ui-text-muted)">
            Connect Google once for the organization, then map profiles to specific website locations.
          </p>

          <div class="mt-5 flex flex-wrap gap-2">
            <UButton
              to="/dashboard/sites"
              icon="i-heroicons-map-pin"
            >
              Map Per Website
            </UButton>
            <UButton
              icon="i-heroicons-link"
              color="neutral"
              variant="soft"
              @click="connectGoogle"
            >
              Connect Google
            </UButton>
          </div>
        </UCard>

        <UCard>
          <template #header>
            <div class="flex items-center gap-3">
              <UIcon name="i-heroicons-credit-card" class="size-5 text-(--ui-primary)" />
              <h2 class="font-semibold text-(--ui-text-highlighted)">Stripe</h2>
            </div>
          </template>

          <p class="text-sm text-(--ui-text-muted)">
            Stripe powers subscription billing for paid plans and customer portal access.
          </p>

          <UButton
            to="/dashboard/billing"
            icon="i-heroicons-arrow-right"
            trailing
            color="neutral"
            variant="soft"
            class="mt-5"
          >
            Open Billing
          </UButton>
        </UCard>
      </div>

      <UCard class="mt-6">
        <template #header>
          <h2 class="font-semibold text-(--ui-text-highlighted)">How Mapping Works</h2>
        </template>

        <div class="grid gap-4 md:grid-cols-3">
          <div>
            <p class="font-medium text-(--ui-text-highlighted)">1. Organization</p>
            <p class="mt-1 text-sm text-(--ui-text-muted)">Authenticate service accounts here.</p>
          </div>
          <div>
            <p class="font-medium text-(--ui-text-highlighted)">2. Website</p>
            <p class="mt-1 text-sm text-(--ui-text-muted)">Choose which website uses the service.</p>
          </div>
          <div>
            <p class="font-medium text-(--ui-text-highlighted)">3. Location</p>
            <p class="mt-1 text-sm text-(--ui-text-muted)">Map Google Business profiles to physical locations.</p>
          </div>
        </div>
      </UCard>
    </UPageBody>
  </UPage>
</template>

<script setup lang="ts">
import { authClient } from '~/lib/auth-client'

definePageMeta({ layout: 'dashboard' })

const connectGoogle = async () => {
  try {
    await authClient.signIn.social({
      provider: 'google',
      callbackURL: '/dashboard/integrations'
    })
  } catch (err) {
    console.error('Failed to connect Google:', err)
  }
}

useSeoMeta({ title: 'Integrations | KrabiClaw Dashboard', robots: 'noindex, nofollow' })
</script>
