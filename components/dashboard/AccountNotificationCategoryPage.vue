<template>
  <div v-if="setting" class="space-y-8">
    <p class="text-base text-muted">{{ copy.summary }}</p>

    <UAlert v-if="failure" color="error" variant="soft" icon="i-lucide-triangle-alert" :description="failure" />

    <div class="space-y-4">
      <USwitch v-model="draft.email" label="Email" :disabled="emailLocked" size="lg" />
      <p v-if="emailLocked" class="text-sm text-muted">
        Password resets, email verification and invitations are always sent by email — losing one would lock you out of your own account.
      </p>

      <USwitch v-model="draft.whatsapp" label="WhatsApp" :disabled="!phoneVerified" size="lg" />
      <p v-if="!phoneVerified" class="text-sm text-muted">
        <NuxtLink to="/dashboard/account/profile/phone" class="underline underline-offset-2">Verify a phone number</NuxtLink>
        to receive notifications over WhatsApp.
      </p>
    </div>

    <div class="flex items-center justify-between gap-4 border-t border-default pt-4">
      <UButton color="neutral" variant="ghost" label="Cancel" :disabled="!dirty || saving" @click="cancel" />
      <UButton label="Save" :disabled="!dirty" :loading="saving" @click="commit" />
    </div>
  </div>
</template>

<script setup lang="ts">
import { NOTIFICATION_CATEGORY_COPY, isMandatoryEmailCategory, isNotificationCategory } from '~/shared/notification-categories'

const route = useRoute()
const toast = useToast()

const category = computed(() => {
  const value = route.params.category
  const segment = Array.isArray(value) ? value[0] : value
  if (!isNotificationCategory(segment)) throw createError({ statusCode: 404, statusMessage: 'Page not found' })
  return segment
})

const { preferences, save } = useNotificationPreferences()
const { sessionData } = await useAuthSession()

const copy = computed(() => NOTIFICATION_CATEGORY_COPY[category.value])
const setting = computed(() => preferences.value?.[category.value] ?? null)
const emailLocked = computed(() => isMandatoryEmailCategory(category.value))
const phoneVerified = computed(() => Boolean(sessionData.value?.user?.phoneNumberVerified))

const draft = reactive({ email: true, whatsapp: false })
const saving = ref(false)
const failure = ref('')

// Re-seeded whenever the stored value or the open category changes, so
// navigating between categories never leaves the previous one's draft behind.
watchEffect(() => {
  const current = setting.value
  if (!current) return
  draft.email = current.email
  draft.whatsapp = current.whatsapp
})

const dirty = computed(() => Boolean(setting.value) && (draft.email !== setting.value!.email || draft.whatsapp !== setting.value!.whatsapp))

function cancel() {
  if (!setting.value) return
  draft.email = setting.value.email
  draft.whatsapp = setting.value.whatsapp
  failure.value = ''
}

async function commit() {
  if (!dirty.value) return
  saving.value = true
  failure.value = ''
  try {
    await save(category.value, { email: draft.email, whatsapp: draft.whatsapp })
    toast.add({ title: 'Notification settings saved', icon: 'i-lucide-circle-check', color: 'success' })
  } catch (cause) {
    failure.value = cause instanceof Error ? cause.message : 'Saving failed. Please try again.'
  } finally {
    saving.value = false
  }
}
</script>
