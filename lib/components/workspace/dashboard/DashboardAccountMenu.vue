<template>
  <UButton
    :to="{ path: '/dashboard/account/profile' }"
    color="neutral"
    variant="ghost"
    square
    :avatar="{ src: renderedUser?.image ?? undefined, alt: displayName, size: 'md' }"
    :aria-label="`Account: ${displayName}`"
    data-testid="dashboard-account-link"
  />
</template>

<script setup lang="ts">
import { authClient } from '~/lib/auth-client'
// A plain link, not a menu. Everything the old dropdown held — usage, settings,
// help, docs, log out — is on the account profile page or in the menu slideover,
// so an avatar that opens a menu that only relinks to those was a layer of
// indirection with nothing of its own to say.
const session = authClient.useSession()
const sessionData = computed(() => session.value.data)
const renderedUser = computed(() => sessionData.value?.user ?? null)
const displayName = computed(() => renderedUser.value?.name || renderedUser.value?.email || 'User')
</script>
