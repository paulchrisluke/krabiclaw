<template>
  <div v-if="impersonatedBy" class="pointer-events-none fixed inset-x-0 bottom-0 z-50 flex justify-center px-4 sm:left-1/2 sm:right-auto sm:w-1/3 sm:-translate-x-1/2 sm:px-0">
    <div class="pointer-events-auto flex w-full max-w-full flex-wrap items-center justify-center gap-3 rounded-t-2xl border border-warning/40 border-b-0 bg-default px-6 py-4 shadow-[0_-4px_24px_rgba(0,0,0,0.15)]">
      <span class="relative flex size-2 shrink-0">
        <span class="absolute inline-flex h-full w-full animate-ping rounded-full bg-warning opacity-75" />
        <span class="relative inline-flex size-2 rounded-full bg-warning" />
      </span>
      <span class="min-w-0 truncate text-sm font-medium text-highlighted">
        Impersonating <span class="font-semibold">{{ sessionData?.user?.email }}</span>
      </span>
      <UButton size="xs" color="warning" variant="soft" :loading="stoppingImpersonation" @click="stopImpersonating">
        Exit to Admin
      </UButton>
    </div>
  </div>
</template>

<script setup lang="ts">
const { data: sessionData, refreshSession } = useAuth()
const toast = useToast()
const stoppingImpersonation = ref(false)

const impersonatedBy = computed(() => {
  const session = sessionData.value?.session as { impersonatedBy?: string } | undefined
  return session?.impersonatedBy
})

async function stopImpersonating() {
  stoppingImpersonation.value = true
  try {
    await $fetch('/api/admin/impersonation/stop', { method: 'POST' })
    await refreshSession()
    await navigateTo('/admin?tab=users')
  } catch (error) {
    console.error('Failed to stop impersonation:', error)
    toast.add({
      title: 'Error',
      description: 'Failed to stop impersonation',
      color: 'error',
    })
  } finally {
    stoppingImpersonation.value = false
  }
}
</script>
