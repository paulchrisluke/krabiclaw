<template>
  <div v-if="setting" class="space-y-6">
    <UAlert v-if="failure" color="error" variant="soft" icon="i-lucide-triangle-alert" :description="failure" />

    <div class="space-y-4">
      <USwitch v-model="draft.email" label="Email" :disabled="emailLocked || saving" size="lg" />
      <USwitch v-model="draft.whatsapp" label="WhatsApp" :disabled="!phoneVerified || saving" size="lg" />
    </div>

    <NuxtLink v-if="!phoneVerified" to="/dashboard/account/profile/personal" class="block text-sm text-muted underline underline-offset-2">
      Add a WhatsApp number
    </NuxtLink>

  </div>
</template>

<script setup lang="ts">
import { authClient } from '~/lib/auth-client'
import { isMandatoryEmailCategory, isNotificationCategory, type NotificationCategory } from '~/shared/notification-categories'

// The category is passed in rather than read from the route, because the index
// route renders this leaf for the first category with no segment of its own.
const props = defineProps<{ category: NotificationCategory }>()

const session = authClient.useSession()
const sessionData = computed(() => session.value.data)
const { preferences, save } = useNotificationPreferences(() => sessionData.value?.user?.id)

if (!isNotificationCategory(props.category)) throw createError({ statusCode: 404, statusMessage: 'Page not found' })

const setting = computed(() => preferences.value?.[props.category] ?? null)
const emailLocked = computed(() => isMandatoryEmailCategory(props.category))
const phoneVerified = computed(() => Boolean(sessionData.value?.user?.phoneNumberVerified))

const draft = reactive({ email: true, whatsapp: false })
const saving = ref(false)
const failure = ref('')

// Re-seeded whenever the stored value or the open category changes, so
// navigating between categories never leaves the previous one's draft behind.
watchEffect(() => {
  const current = setting.value
  if (!current || saving.value) return
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
    await save(props.category, { email: draft.email, whatsapp: draft.whatsapp })
  } catch (cause) {
    failure.value = cause instanceof Error ? cause.message : 'Saving failed. Please try again.'
  } finally {
    saving.value = false
  }
}

// The page it sits in owns the Cancel/Save row, so every leaf commits the same way.
defineExpose({ dirty, saving, cancel, commit })
</script>
