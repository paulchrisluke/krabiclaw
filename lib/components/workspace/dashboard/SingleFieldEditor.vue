<template>
  <UModal :open="open" :dismissible="saveState !== 'saving'" :ui="{ content: 'max-w-[600px]' }" @update:open="handleOpenChange">
    <template #content>
      <div class="flex flex-col gap-4 p-8">
        <div class="flex items-start gap-3.5">
          <h2 class="min-w-0 flex-1 text-[22px] font-semibold tracking-tight text-highlighted">{{ currentLabel }}</h2>
          <UButton icon="i-lucide-x" color="neutral" variant="ghost" square size="sm" aria-label="Close" @click="handleOpenChange(false)" />
        </div>

        <div class="flex flex-col gap-2.5">
          <span v-if="currentLimit" class="text-[12.5px] text-muted"><b class="text-highlighted">{{ currentLimit - currentValue.length }}</b> available</span>
          <UTextarea
            v-if="currentKind === 'textarea'"
            v-model="currentValue"
            :rows="4"
            :maxlength="currentLimit"
            :placeholder="currentPlaceholder"
            :disabled="saveState === 'saving'"
            size="xl"
            class="w-full"
            autofocus
          />
          <UInput
            v-else
            v-model="currentValue"
            :type="currentKind === 'number' ? 'number' : currentKind"
            :maxlength="currentLimit"
            :placeholder="currentPlaceholder"
            :disabled="saveState === 'saving'"
            size="xl"
            class="w-full"
            autofocus
            @keydown.enter="advance"
          />
        </div>

        <p v-if="saveState === 'failed'" class="text-sm text-error">{{ errorMessage }}</p>

        <div class="flex justify-end">
          <UButton icon="i-lucide-check" :loading="saveState === 'saving'" :disabled="!canAdvance" @click="advance">
            {{ isLastStep ? 'Save' : 'Next' }}
          </UButton>
        </div>
      </div>
    </template>
  </UModal>
</template>

<script setup lang="ts">
// KcFieldEditor's real shape (Editor - Shell and Card Stack.dc.html, 1f — desktop leaf, the
// shell drops away): a heading naming the field (never a separate title bar), an optional
// counter above the field when the column has a real limit, the field itself, and Save
// bottom-right, greyed until dirty. No Cancel — closing (the X) is cancelling.
//
// Two modes, mutually exclusive:
// - single field: label/value/kind/save
// - sequence: steps + submit — one field visible at a time, Next on all but the last step,
//   submit(values) called once, on the last step. Never build the sequence as a wrapper
//   around this component; it has to live here or a second editor grows next to it.
type FieldKind = 'text' | 'url' | 'textarea' | 'number'

interface Step {
  key: string
  label: string
  kind?: FieldKind
  placeholder?: string
  limit?: number
}

const props = defineProps<{
  open: boolean
  label?: string
  value?: string
  kind?: FieldKind
  placeholder?: string
  limit?: number
  save?: (_value: string) => Promise<void>
  steps?: Step[]
  submit?: (_values: Record<string, string>) => Promise<void>
}>()

const emit = defineEmits<{ 'update:open': [boolean] }>()

const stepIndex = ref(0)
const stepValues = ref<Record<string, string>>({})
const singleValue = ref('')
const saveState = ref<'idle' | 'saving' | 'failed'>('idle')
const errorMessage = ref('')

const isSequence = computed(() => Boolean(props.steps?.length))
const currentStep = computed(() => props.steps?.[stepIndex.value])
const isLastStep = computed(() => !isSequence.value || stepIndex.value === (props.steps!.length - 1))
const currentLabel = computed(() => isSequence.value ? currentStep.value!.label : props.label!)
const currentKind = computed(() => (isSequence.value ? currentStep.value!.kind : props.kind) ?? 'text')
const currentPlaceholder = computed(() => isSequence.value ? currentStep.value!.placeholder : props.placeholder)
const currentLimit = computed(() => isSequence.value ? currentStep.value!.limit : props.limit)
const currentValue = computed({
  get: () => isSequence.value ? (stepValues.value[currentStep.value!.key] ?? '') : singleValue.value,
  set: (next: string) => {
    if (isSequence.value) stepValues.value = { ...stepValues.value, [currentStep.value!.key]: next }
    else singleValue.value = next
  },
})
const canAdvance = computed(() => {
  if (saveState.value === 'saving') return false
  if (isSequence.value) return currentValue.value.trim().length > 0
  return currentValue.value !== (props.value ?? '')
})

// immediate: v-if-gated usage (the common case here — see "My site") mounts this component
// with open already true rather than transitioning false -> true, so a non-immediate watcher
// never fires and the field opens blank.
watch(() => props.open, (isOpen) => {
  if (!isOpen) return
  saveState.value = 'idle'
  errorMessage.value = ''
  stepIndex.value = 0
  if (isSequence.value) {
    stepValues.value = {}
  } else {
    singleValue.value = props.value ?? ''
  }
}, { immediate: true })

function validateCurrent(): string | null {
  if (currentKind.value !== 'url' || !currentValue.value.trim()) return null
  try {
    const url = new URL(currentValue.value.trim())
    if (!['http:', 'https:'].includes(url.protocol)) throw new Error()
    return null
  } catch {
    return 'Enter a valid URL'
  }
}

function handleOpenChange(next: boolean) {
  if (saveState.value === 'saving') return
  emit('update:open', next)
}

async function advance() {
  if (!canAdvance.value) return
  const validationError = validateCurrent()
  if (validationError) {
    saveState.value = 'failed'
    errorMessage.value = validationError
    return
  }
  if (isSequence.value && !isLastStep.value) {
    saveState.value = 'idle'
    errorMessage.value = ''
    stepIndex.value += 1
    return
  }
  saveState.value = 'saving'
  errorMessage.value = ''
  try {
    if (isSequence.value) await props.submit!({ ...stepValues.value })
    else await props.save!(currentValue.value)
    emit('update:open', false)
  } catch (error) {
    saveState.value = 'failed'
    errorMessage.value = error instanceof Error ? error.message : 'Failed to save'
  } finally {
    if (saveState.value === 'saving') saveState.value = 'idle'
  }
}
</script>
