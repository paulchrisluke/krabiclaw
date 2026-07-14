<template>
  <div class="account-layout platform-theme min-h-screen flex flex-col font-sans">
    <header class="border-b border-default bg-default">
      <div class="max-w-3xl mx-auto px-6 py-4 flex items-center justify-between">
        <NuxtLink to="/account" class="font-extrabold tracking-tight text-default text-lg no-underline">
          KrabiClaw
        </NuxtLink>
        <nav class="flex items-center gap-4 text-sm">
          <NuxtLink to="/account" class="text-muted hover:text-highlighted no-underline">Bookings</NuxtLink>
          <NuxtLink to="/account/claims" class="text-muted hover:text-highlighted no-underline">Link a booking</NuxtLink>
          <button type="button" class="text-muted hover:text-highlighted" @click="signOut">Sign out</button>
        </nav>
      </div>
    </header>
    <main class="grow">
      <div class="max-w-3xl mx-auto px-6 py-10">
        <slot />
      </div>
    </main>
  </div>
</template>

<script setup>
import { authClient } from '~/lib/auth-client'

useSeoMeta({ robots: 'noindex, nofollow' })

async function signOut() {
  try {
    await authClient.signOut()
  } finally {
    await navigateTo('/login')
  }
}
</script>
