<template>
  <UModal :open="open" :dismissible="saveState !== 'saving'" :ui="{ content: 'w-[900px] max-w-[calc(100vw-2rem)] h-[620px] max-h-[calc(100vh-2rem)] rounded-[18px] ring-0 border border-default overflow-hidden' }" @update:open="handleOpenChange">
    <template #content>
      <div class="flex h-full flex-col overflow-hidden">
        <!-- KcEditorShell's canvas header: the dismiss control, never the field's name. -->
        <div class="flex flex-none items-center gap-3 px-[30px] pb-[18px] pt-[26px]">
          <button
            type="button"
            class="flex size-[38px] flex-none items-center justify-center rounded-full bg-muted text-highlighted"
            aria-label="Close"
            @click="handleOpenChange(false)"
          >
            <UIcon name="i-lucide-x" class="size-[17px]" />
          </button>
        </div>

        <!-- KcFieldEditor: heading, optional counter, the field, then its own save bar. -->
        <div class="flex min-h-0 flex-1 flex-col overflow-hidden">
          <div class="min-h-0 flex-1 overflow-auto px-10 pb-10 pt-11">
            <div class="mx-auto flex max-w-[620px] flex-col gap-[18px]">
              <h2 class="min-w-0 flex-1 text-[34px] font-semibold leading-[1.1] tracking-[-0.025em] text-highlighted">{{ currentLabel }}</h2>

              <div class="flex flex-col gap-2.5">
                <span class="text-[12.5px] text-muted"><b class="text-highlighted">{{ effectiveLimit - currentValue.length }}</b> available</span>
                <textarea
                  v-if="currentKind === 'textarea'"
                  v-model="currentValue"
                  :maxlength="currentLimit"
                  :placeholder="currentPlaceholder"
                  :disabled="saveState === 'saving'"
                  rows="4"
                  class="w-full rounded-xl border border-accented bg-elevated px-[18px] py-4 text-[22px] leading-[1.35] tracking-[-0.015em] text-highlighted placeholder:text-dimmed focus:outline-none focus-visible:ring-2 focus-visible:ring-primary"
                />
                <input
                  v-else
                  v-model="currentValue"
                  :type="currentKind === 'number' ? 'number' : currentKind"
                  :maxlength="currentLimit"
                  :placeholder="currentPlaceholder"
                  :disabled="saveState === 'saving'"
                  class="min-h-[96px] w-full rounded-xl border border-accented bg-elevated px-[18px] py-4 text-[22px] leading-[1.35] tracking-[-0.015em] text-highlighted placeholder:text-dimmed focus:outline-none focus-visible:ring-2 focus-visible:ring-primary"
                  @keydown.enter="advance"
                >
              </div>

              <p v-if="saveState === 'failed'" class="text-sm text-error">{{ errorMessage }}</p>
            </div>
          </div>

          <!-- KcFieldEditor's own save bar: Cancel, then Save — near-white pill once dirty. -->
          <div class="flex h-14 flex-none items-center justify-end gap-[22px] border-t border-default bg-elevated px-10">
            <button type="button" class="text-[13.5px] font-semibold text-muted" @click="handleOpenChange(false)">Cancel</button>
            <button
              type="button"
              class="rounded-[10px] px-[26px] py-2.5 text-[13.5px] font-semibold disabled:cursor-not-allowed"
              :class="canAdvance ? 'bg-inverted text-inverted' : 'bg-muted text-dimmed'"
              :disabled="!canAdvance"
              @click="advance"
            >
              {{ saveState === 'saving' ? 'Saving…' : isLastStep ? 'Save' : 'Next' }}
            </button>
          </div>
        </div>
      </div>
    </template>
  </UModal>
</template>

<script setup lang="ts">
// KcFieldEditor + KcEditorShell (mode="canvas", case 1f — desktop leaf, the shell drops away):
// the shell's chrome is only the dismiss control; the field's own name is the canvas's h2, and
// the save bar (Cancel, then Save — a near-white pill once dirty, a greyed chip otherwise) is
// the field editor's own, not the shell's. See Editor - Shell and Card Stack.dc.html and
// KcFieldEditor.dc.html directly — do not re-derive this from prose describing them.
import { getErrorMessage } from '~/utils/errors'

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
// KcFieldEditor's own default when no limit is given: counter: (this.props.limit || 50) - ...
// — kept for the counter's display only. The HTML maxlength stays bound to the real
// currentLimit (unset unless a caller passes one), so a column with no actual length
// constraint (sites.social_facebook_url and friends today) never has typing silently
// truncated at a display-only default.
const effectiveLimit = computed(() => currentLimit.value || 50)
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
    errorMessage.value = getErrorMessage(error, 'Failed to save')
  } finally {
    if (saveState.value === 'saving') saveState.value = 'idle'
  }
}
</script>
