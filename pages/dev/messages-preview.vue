<template>
  <UPage>
    <UPageBody class="space-y-6">
      <UCard>
        <template #header>
          <div class="flex items-center justify-between gap-4 flex-wrap">
            <div>
              <h1 class="text-xl font-semibold text-highlighted">Messaging Copy + Email Style Preview</h1>
              <p class="text-sm text-muted">Template-level preview from current code. Not based on historical notification rows.</p>
            </div>
            <UBadge color="neutral" variant="soft">{{ filtered.length }} templates</UBadge>
          </div>
        </template>

        <div class="flex items-center gap-2 flex-wrap">
          <UButton size="sm" :variant="audience === 'all' ? 'solid' : 'soft'" @click="audience = 'all'">All</UButton>
          <UButton size="sm" :variant="audience === 'owner' ? 'solid' : 'soft'" @click="audience = 'owner'">Owner</UButton>
          <UButton size="sm" :variant="audience === 'guest' ? 'solid' : 'soft'" @click="audience = 'guest'">Guest</UButton>
          <USeparator orientation="vertical" class="h-6" />
          <UButton size="sm" :variant="channel === 'all' ? 'solid' : 'soft'" @click="channel = 'all'">All channels</UButton>
          <UButton size="sm" :variant="channel === 'email' ? 'solid' : 'soft'" @click="channel = 'email'">Email</UButton>
          <UButton size="sm" :variant="channel === 'whatsapp' ? 'solid' : 'soft'" @click="channel = 'whatsapp'">WhatsApp</UButton>
        </div>
      </UCard>

      <UCard v-if="error" color="error" variant="soft">
        <p class="text-sm">{{ error }}</p>
      </UCard>

      <UCard v-for="item in filtered" :key="item.id">
        <template #header>
          <div class="flex items-center justify-between gap-2 flex-wrap">
            <div class="flex items-center gap-2 flex-wrap">
              <UBadge :color="item.channel === 'email' ? 'info' : 'success'" variant="soft">{{ item.channel }}</UBadge>
              <UBadge :color="item.audience === 'owner' ? 'warning' : 'neutral'" variant="soft">{{ item.audience }}</UBadge>
              <span class="text-sm font-medium text-highlighted">{{ item.title }}</span>
            </div>
            <span class="text-xs text-muted">{{ item.template }}</span>
          </div>
        </template>

        <div class="space-y-3 text-sm">
          <p v-if="item.subject"><span class="text-muted">Subject:</span> {{ item.subject }}</p>

          <div v-if="item.channel === 'email'" class="space-y-2">
            <div class="rounded-md border border-default bg-default p-3 overflow-auto max-h-96">
              <iframe class="w-full min-h-96 bg-white rounded" sandbox="" :srcdoc="item.html || ''" title="Email template preview" />
            </div>
            <details>
              <summary class="cursor-pointer text-muted">Plain text version</summary>
              <pre class="text-xs whitespace-pre-wrap break-words mt-2 text-default">{{ item.text }}</pre>
            </details>
          </div>

          <div v-else class="rounded-md border border-default bg-elevated/40 p-3">
            <p class="text-default">{{ item.text }}</p>
            <p class="text-xs text-muted mt-2">WhatsApp display is template-constrained by Meta. This is the effective message summary preview.</p>
          </div>
        </div>
      </UCard>
    </UPageBody>
  </UPage>
</template>

<script setup lang="ts">
definePageMeta({ layout: 'platform', auth: false })

type Preview = {
  id: string
  audience: 'owner' | 'guest'
  channel: 'email' | 'whatsapp'
  template: string
  title: string
  subject?: string
  html?: string
  text: string
}

const rows = ref<Preview[]>([])
const error = ref('')
const audience = ref<'all' | 'owner' | 'guest'>('all')
const channel = ref<'all' | 'email' | 'whatsapp'>('all')

const filtered = computed(() => rows.value.filter((item) => {
  if (audience.value !== 'all' && item.audience !== audience.value) return false
  if (channel.value !== 'all' && item.channel !== channel.value) return false
  return true
}))

onMounted(async () => {
  try {
    const res = await $fetch<{ previews: Preview[] }>('/api/dev/notifications-preview')
    rows.value = res.previews || []
  } catch (err) {
    error.value = err instanceof Error ? err.message : 'Failed to load previews'
  }
})
</script>
