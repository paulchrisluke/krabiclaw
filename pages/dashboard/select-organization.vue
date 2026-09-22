<template>
  <!--
    Which business this session is in. A person who belongs to more than one is
    asked rather than sent somewhere by list order (#905), so nothing here is
    preselected and nothing is entered until Better Auth says the session moved.
  -->
  <div class="mx-auto flex min-h-dvh w-full max-w-lg flex-col justify-center gap-6 px-4 py-12">
    <div>
      <h1 class="text-2xl font-semibold text-highlighted">Choose a business</h1>
      <p class="mt-2 text-sm text-muted">You work on more than one. Pick the one to open.</p>
    </div>

    <UAlert
      v-if="failure"
      color="error"
      variant="soft"
      icon="i-lucide-circle-alert"
      :description="failure"
    />

    <div v-if="pending" class="space-y-3">
      <USkeleton v-for="index in 3" :key="index" class="h-16 rounded-2xl" />
    </div>

    <UCard v-else-if="organizations.length" variant="subtle" class="overflow-hidden rounded-2xl" :ui="{ body: 'p-0! sm:p-0!' }">
      <button
        v-for="(organization, index) in organizations"
        :key="organization.id"
        type="button"
        class="flex min-h-20 w-full items-center gap-4 px-5 py-4 text-left transition-colors hover:bg-elevated disabled:opacity-60"
        :class="index > 0 ? 'border-t border-default' : ''"
        :disabled="Boolean(entering)"
        @click="enter(organization)"
      >
        <UAvatar :src="organization.logo ?? undefined" :alt="organization.name" icon="i-lucide-building-2" size="md" />
        <span class="min-w-0 flex-1 font-semibold text-highlighted">{{ organization.name }}</span>
        <UIcon
          v-if="entering === organization.id"
          name="i-lucide-loader-circle"
          class="size-5 shrink-0 animate-spin text-muted"
        />
        <UIcon v-else name="i-lucide-chevron-right" class="size-5 shrink-0 text-muted" />
      </button>
    </UCard>

    <p v-else class="text-sm text-muted">This account belongs to no business yet.</p>
  </div>
</template>

<script setup lang="ts">
import { authClient } from '~/lib/auth-client'
import { buildPostLoginUrl } from '~/shared/auth/return-target'
import { NEW_SALE_PLAN_ID } from '~/shared/billing-model'

// No organization scope yet, so no dashboard chrome and no scoped context.
definePageMeta({ layout: 'standalone' })
useSeoMeta({ title: 'Choose a business | KrabiClaw', robots: 'noindex, nofollow' })

const route = useRoute()
const session = authClient.useSession()
const organizationsState = authClient.useListOrganizations()

const organizations = computed(() => unref(organizationsState)?.data ?? [])
const pending = computed(() => Boolean(unref(organizationsState)?.isPending))
const failure = ref<string | null>(null)
const entering = ref<string | null>(null)

// The plan rides through the chooser so the billing destination stays decided
// in one place — `/api/post-login` — rather than being rebuilt here.
const plan = computed(() => (route.query.plan === NEW_SALE_PLAN_ID ? NEW_SALE_PLAN_ID : undefined))

async function enter(organization: { id: string }) {
  if (entering.value) return
  // Only a business Better Auth still lists may be chosen: the membership can
  // change while this page is open.
  if (!organizations.value.some(candidate => candidate.id === organization.id)) {
    failure.value = 'That business is no longer available to this account.'
    return
  }
  entering.value = organization.id
  failure.value = null
  const { error } = await authClient.organization.setActive({ organizationId: organization.id })
  if (error) {
    // Never navigate as though it became active.
    failure.value = error.message || 'Could not open that business.'
    entering.value = null
    return
  }
  await session.value.refetch()
  await navigateTo(buildPostLoginUrl(plan.value ? { plan: plan.value } : {}), { external: true })
}
</script>
