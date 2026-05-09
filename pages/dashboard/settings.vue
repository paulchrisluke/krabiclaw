<template>
  <UPage>
    <UPageHeader
      title="Settings"
      description="Organization and account preferences for the dashboard."
    />

    <UPageBody>
      <div class="grid gap-4 lg:grid-cols-2">
        <UCard>
          <template #header>
            <h2 class="font-semibold text-(--ui-text-highlighted)">Profile</h2>
          </template>

          <div class="flex items-center gap-4">
            <UAvatar
              :src="sessionData?.user?.image"
              :alt="sessionData?.user?.name || 'User avatar'"
              size="lg"
            />
            <div class="min-w-0">
              <p class="truncate font-medium text-(--ui-text-highlighted)">{{ sessionData?.user?.name }}</p>
              <p class="truncate text-sm text-(--ui-text-muted)">{{ sessionData?.user?.email }}</p>
            </div>
          </div>
        </UCard>

        <UCard>
          <template #header>
            <h2 class="font-semibold text-(--ui-text-highlighted)">Organization</h2>
          </template>

          <div v-if="organization" class="space-y-3">
            <div>
              <p class="text-sm text-(--ui-text-muted)">Name</p>
              <p class="mt-1 font-medium text-(--ui-text-highlighted)">{{ organization.name }}</p>
            </div>
            <div>
              <p class="text-sm text-(--ui-text-muted)">Role</p>
              <p class="mt-1 font-medium capitalize text-(--ui-text-highlighted)">{{ organization.role || 'Member' }}</p>
            </div>
          </div>

          <p v-else class="text-sm text-(--ui-text-muted)">No organization found.</p>
        </UCard>

        <UCard class="lg:col-span-2">
          <template #header>
            <h2 class="font-semibold text-(--ui-text-highlighted)">Workspace Boundaries</h2>
          </template>

          <div class="grid gap-4 md:grid-cols-3">
            <div>
              <p class="font-medium text-(--ui-text-highlighted)">Organization</p>
              <p class="mt-1 text-sm text-(--ui-text-muted)">Billing, connected accounts, team ownership.</p>
            </div>
            <div>
              <p class="font-medium text-(--ui-text-highlighted)">Website</p>
              <p class="mt-1 text-sm text-(--ui-text-muted)">Brand, domain, theme, SEO defaults.</p>
            </div>
            <div>
              <p class="font-medium text-(--ui-text-highlighted)">Location</p>
              <p class="mt-1 text-sm text-(--ui-text-muted)">Address, hours, local menu, Google Business mapping.</p>
            </div>
          </div>
        </UCard>
      </div>
    </UPageBody>
  </UPage>
</template>

<script setup lang="ts">
import { authClient } from '~/lib/auth-client'
import { useAuth } from '~/composables/useAuth'

definePageMeta({ layout: 'dashboard' })

const { data: sessionData } = useAuth()
const organizationsState = authClient.useListOrganizations()
const organization = computed(() => unref(organizationsState)?.data?.[0] || null)

useSeoMeta({ title: 'Settings | KrabiClaw Dashboard', robots: 'noindex, nofollow' })
</script>
