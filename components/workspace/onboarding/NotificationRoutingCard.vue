<template>
  <UCard :ui="{ body: 'p-0 sm:p-0' }">
    <template #header>
      <div class="flex items-start gap-3 px-4 pt-4">
        <div class="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
          <UIcon name="i-lucide-bell" class="size-4" />
        </div>
        <div class="min-w-0">
          <p class="text-[13px] font-semibold text-highlighted">{{ title }}</p>
          <p class="mt-0.5 text-[12px] leading-relaxed text-muted">{{ description }}</p>
        </div>
      </div>
    </template>

    <div class="px-4 pb-4 space-y-4">
      <div>
        <p class="text-[11px] font-bold uppercase tracking-wide text-dimmed mb-2">Your number (gets all notifications)</p>
        <UInput
          v-model="form.ownerPhone"
          type="tel"
          placeholder="+447464115465"
          size="sm"
        />
      </div>

      <div>
        <p class="text-[11px] font-bold uppercase tracking-wide text-dimmed mb-2">Channel</p>
        <div class="flex gap-2">
          <button
            v-for="ch in channelOptions"
            :key="ch.value"
            type="button"
            :class="[
              'rounded-lg border px-3 py-1.5 text-xs font-semibold transition-colors',
              form.channels.includes(ch.value)
                ? 'border-primary bg-primary/10 text-primary'
                : 'border-default bg-default text-muted hover:border-default/80',
            ]"
            @click="toggleChannel(ch.value)"
          >{{ ch.label }}</button>
        </div>
      </div>

      <div v-if="form.locations.length">
        <p class="text-[11px] font-bold uppercase tracking-wide text-dimmed mb-2">Location notification numbers</p>
        <div class="space-y-2">
          <div v-for="loc in form.locations" :key="loc.id" class="flex items-center gap-2">
            <span class="w-32 shrink-0 truncate text-[12px] text-muted">{{ loc.title }}</span>
            <UInput
              v-model="loc.notificationPhone"
              type="tel"
              :placeholder="loc.title"
              size="sm"
              class="flex-1"
            />
          </div>
        </div>
      </div>

      <div class="flex items-center justify-between gap-3">
        <p class="text-[11px] text-muted">
          Confirm the routing now, or change it later from Settings.
        </p>
        <UButton
          size="sm"
          color="primary"
          :loading="loading"
          :disabled="disabled"
          @click="$emit('submit')"
        >
          {{ actionLabel }}
        </UButton>
      </div>
    </div>
  </UCard>
</template>

<script setup lang="ts">
type NotificationLocation = { id: string; title: string; notificationPhone: string }
type NotificationForm = {
  ownerPhone: string
  channels: string[]
  locations: NotificationLocation[]
}

const form = defineModel<NotificationForm>('form', { required: true })

defineProps<{
  title: string
  description: string
  actionLabel: string
  loading?: boolean
  disabled?: boolean
}>()

defineEmits<{ submit: [] }>()

const channelOptions = [
  { label: 'WhatsApp', value: 'whatsapp' },
  { label: 'Email', value: 'email' },
]

function toggleChannel(value: string) {
  const idx = form.value.channels.indexOf(value)
  if (idx === -1) {
    form.value.channels.push(value)
  } else if (form.value.channels.length > 1) {
    form.value.channels.splice(idx, 1)
  }
}
</script>
