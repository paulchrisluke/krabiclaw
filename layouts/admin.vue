<template>
  <div class="min-h-screen bg-stone-50 font-sans">
    <header class="bg-white border-b border-stone-200 sticky top-0 z-30">
      <div class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div class="flex justify-between items-center h-16">
          <div class="flex items-center gap-6">
            <NuxtLink to="/admin" class="text-xl font-bold tracking-tight italic">
              KIKUZUKI <span class="text-stone-400 font-normal not-italic">Admin</span>
            </NuxtLink>
            <nav v-if="session?.authenticated" class="hidden md:flex items-center gap-1">
              <NuxtLink
                v-for="link in navLinks"
                :key="link.to"
                :to="link.to"
                class="text-sm font-medium px-3 py-2 rounded-lg transition-colors text-stone-500 hover:text-stone-900 hover:bg-stone-100"
                active-class="text-stone-900 bg-stone-100"
              >
                {{ link.label }}
              </NuxtLink>
            </nav>
          </div>
          <div v-if="session?.authenticated" class="flex items-center gap-4">
            <span class="text-sm text-stone-400 hidden sm:inline">{{ session.email }}</span>
            <button
              @click="handleLogout"
              class="text-sm font-medium text-red-600 hover:text-red-700 bg-red-50 hover:bg-red-100 px-3 py-1.5 rounded-lg transition-colors"
            >
              Sign Out
            </button>
          </div>
        </div>
      </div>
    </header>
    <main class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-10">
      <slot />
    </main>
  </div>
</template>

<script setup>
const { data: session } = await useFetch('/api/auth/session', {
  key: 'admin-session'
})

const navLinks = [
  { to: '/admin', label: 'Dashboard' },
  { to: '/admin/reviews', label: 'Reviews' },
  { to: '/admin/connection', label: 'Connection' },
  { to: '/admin/content', label: 'Content' },
  { to: '/admin/insights', label: 'Insights' },
]

const handleLogout = async () => {
  await $fetch('/api/auth/logout', { method: 'POST' })
  await refreshNuxtData('admin-session')
  navigateTo('/admin')
}
</script>
