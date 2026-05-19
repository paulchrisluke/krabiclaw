<template>
  <UModal v-model:open="isOpen" title="Auto top-up settings" :ui="{ content: 'max-w-md' }">
    <template #body>
      <div class="space-y-5">
        <!-- Master toggle -->
        <div class="flex items-center justify-between">
          <div>
            <p class="text-sm font-medium text-highlighted">Auto top-up</p>
            <p class="text-xs text-muted">Automatically add credits when your balance runs low</p>
          </div>
          <UToggle v-model="form.enabled" />
        </div>

        <div v-if="form.enabled" class="space-y-4 border-t border-default pt-4">
          <!-- Threshold -->
          <div>
            <label class="mb-1.5 block text-sm font-medium text-highlighted">When balance drops below</label>
            <USelect v-model="form.threshold" :items="thresholdOptions" class="w-full" />
          </div>

          <!-- Bundle -->
          <div>
            <label class="mb-1.5 block text-sm font-medium text-highlighted">Top up with</label>
            <USelect v-model="form.bundle" :items="bundleOptions" class="w-full" />
          </div>

          <!-- Summary line -->
          <div class="rounded-lg bg-elevated px-4 py-3 text-sm text-muted">
            When your balance drops below <span class="font-medium text-highlighted">{{ form.threshold }} credits</span>,
            we'll charge your saved card <span class="font-medium text-highlighted">{{ bundlePrice }}</span> for
            <span class="font-medium text-highlighted">{{ form.bundle.toLocaleString() }} credits</span>.
            You'll receive an email receipt each time.
          </div>
        </div>
      </div>
    </template>

    <template #footer>
      <div class="flex w-full justify-end gap-2">
        <UButton color="neutral" variant="ghost" :disabled="saving" @click="isOpen = false">Cancel</UButton>
        <UButton :loading="saving" @click="save">Save</UButton>
      </div>
    </template>
  </UModal>
</template>

<script setup lang="ts">
import { CREDIT_BUNDLES } from '~/shared/creditBundles'

const thresholdOptions = [
  { label: '50 credits', value: 50 },
  { label: '100 credits', value: 100 },
  { label: '200 credits', value: 200 },
  { label: '500 credits', value: 500 },
]

const bundleOptions = CREDIT_BUNDLES.map(b => ({ label: b.label, value: b.credits }))
const bundlePriceMap = Object.fromEntries(CREDIT_BUNDLES.map(b => [b.credits, b.price]))

const props = defineProps<{
  initialEnabled: boolean
  initialBundle: number
  initialThreshold: number
}>()

const emit = defineEmits<{
  saved: [{ enabled: boolean; bundle: number; threshold: number }]
}>()

const isOpen = defineModel<boolean>('open', { default: false })
const saving = ref(false)

const form = reactive({
  enabled: props.initialEnabled,
  bundle: props.initialBundle,
  threshold: props.initialThreshold,
})

watch(() => props.initialEnabled, v => { form.enabled = v })
watch(() => props.initialBundle, v => { form.bundle = v })
watch(() => props.initialThreshold, v => { form.threshold = v })

const bundlePrice = computed(() => bundlePriceMap[form.bundle] ?? '$9')

const toast = useToast()

async function save() {
  saving.value = true
  try {
    await $fetch('/api/billing/auto-topup', {
      method: 'PATCH',
      body: { enabled: form.enabled, bundle: form.bundle, threshold: form.threshold },
    })
    emit('saved', { enabled: form.enabled, bundle: form.bundle, threshold: form.threshold })
    isOpen.value = false
    toast.add({ title: form.enabled ? 'Auto top-up enabled' : 'Auto top-up disabled', color: 'success' })
  } catch {
    toast.add({ title: 'Failed to save settings', color: 'error' })
  } finally {
    saving.value = false
  }
}
</script>
