<template>
  <UCard class="onboarding-intake-card" :ui="{ body: 'p-0 sm:p-0' }">
    <div class="space-y-5 p-6 sm:p-7">
      <div class="flex items-start gap-4">
        <div class="flex size-11 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
          <UIcon name="i-lucide-bell" class="size-5" />
        </div>
        <div class="min-w-0 pt-0.5">
          <p class="text-[17px] font-bold leading-6 text-highlighted">{{ title }}</p>
          <p class="mt-1 text-[15px] leading-6 text-muted">{{ description }}</p>
        </div>
      </div>

      <UFormField label="Your number (gets all notifications)">
        <UInput
          v-model="form.ownerPhone"
          class="w-full"
          type="tel"
          placeholder="+447464115465"
          size="xl"
        />
      </UFormField>

      <UFormField label="Channel">
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
      </UFormField>

      <UFormField v-if="form.locations.length" label="Location notification numbers">
        <div class="space-y-2">
          <div v-for="loc in form.locations" :key="loc.id" class="flex items-center gap-2">
            <span class="w-32 shrink-0 truncate text-[12px] text-muted">{{ loc.title }}</span>
            <UInput
              v-model="loc.notificationPhone"
              type="tel"
              :placeholder="loc.title"
              size="lg"
              class="flex-1"
            />
          </div>
        </div>
      </UFormField>

      <div class="grid gap-4">
        <p class="text-[13px] leading-5 text-muted">
          Confirm the routing now, or change it later from Settings.
        </p>
        <UButton
          size="xl"
          color="primary"
          block
          class="justify-center"
          :loading="loading"
          :disabled="disabled"
          @click="$emit('submit')"
        >
          {{ actionLabel }}
        </UButton>
        <UButton
          v-if="showSkip"
          size="xl"
          color="neutral"
          variant="ghost"
          block
          class="justify-center"
          :disabled="disabled"
          @click="$emit('skip')"
        >
          Skip for now
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
  showSkip?: boolean
  loading?: boolean
  disabled?: boolean
}>()

defineEmits<{ submit: []; skip: [] }>()

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

<style scoped>
.onboarding-intake-card {
  border-radius: 22px;
}

.onboarding-intake-card :deep(.rounded-md),
.onboarding-intake-card :deep(.rounded-lg) {
  border-radius: 14px;
}

.onboarding-intake-card :deep(label) {
  color: var(--ui-text-muted);
  font-size: 0.76rem;
  font-weight: 800;
  letter-spacing: 0;
  text-transform: uppercase;
}
</style>
