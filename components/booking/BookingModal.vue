<template>
      <input
        :id="toggleId"
        ref="toggleRef"
        type="checkbox"
        class="booking-modal-toggle sr-only"
        @change="syncOpenState"
      />
      <div
        :id="targetId"
        ref="modalRef"
        class="booking-modal-shell fixed inset-0 z-50 items-center justify-center p-4 sm:p-6"
        role="dialog"
        aria-modal="true"
        :aria-labelledby="titleId"
      >
        <!-- Backdrop -->
        <label :for="toggleId" class="absolute inset-0 bg-black/40 backdrop-blur-sm" :aria-label="t('saya.experience_detail.close_booking')"></label>
        
        <!-- Modal content -->
        <div class="relative bg-default border border-default rounded-xl shadow-xl w-full max-w-md h-[min(720px,90vh)] overflow-hidden flex flex-col">
          <!-- Header -->
          <div class="flex items-center justify-between gap-2 p-4 pb-3 shrink-0">
            <button
              v-if="canGoBack"
              type="button"
              class="flex size-9 items-center justify-center rounded-full border border-default hover:bg-muted text-default transition-colors shrink-0"
              @click="goBack"
            >
              <svg class="w-4.5 h-4.5" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="2.5" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" d="M15.75 19.5L8.25 12l7.5-7.5" /></svg>
            </button>
            <div v-else class="size-9 shrink-0"></div> <!-- Spacer for alignment -->

            <div class="flex-1 min-w-0 text-center">
              <p v-if="kicker" class="saya-eyebrow mb-1 truncate text-primary">{{ kicker }}</p>
              <h2 :id="titleId" class="saya-display text-lg text-default truncate px-2">
                {{ title }}
              </h2>
            </div>

            <label
              :for="toggleId"
              role="button"
              tabindex="0"
              class="flex size-9 items-center justify-center rounded-full border border-default hover:bg-muted text-default transition-colors shrink-0"
            >
              <svg class="w-4.5 h-4.5" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="2.5" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>
            </label>
          </div>

          <!-- Body -->
          <div class="px-4 sm:px-6 pb-4 sm:pb-6 overflow-y-auto overscroll-contain flex-1 flex flex-col min-h-0">
            <slot />
          </div>

          <!-- Footer (optional) -->
          <div v-if="$slots.footer" class="p-4 sm:px-6 border-t border-default shrink-0">
            <slot name="footer" />
          </div>
        </div>
      </div>
</template>

<script setup lang="ts">
import { watch, onMounted, onUnmounted, ref, nextTick, useId } from 'vue'
import { useScrollLock } from '~/composables/useScrollLock'

const props = defineProps<{
  modelValue: boolean
  title: string
  targetId: string
  kicker?: string
  canGoBack?: boolean
}>()
const { t } = useI18n()

const emit = defineEmits<{
  'update:modelValue': [value: boolean]
  back: []
}>()

const modalRef = ref<HTMLElement | null>(null)
const toggleRef = ref<HTMLInputElement | null>(null)
const toggleId = `${props.targetId}-toggle`
const titleId = `modal-title-${useId()}`
const previousActiveElement = ref<HTMLElement | null>(null)
const hasAcquired = ref(false)
const { acquire, release } = useScrollLock()

function close() {
  emit('update:modelValue', false)
}

function syncOpenState(event: Event) {
  const isOpen = (event.currentTarget as HTMLInputElement).checked
  if (isOpen !== props.modelValue) emit('update:modelValue', isOpen)
}

function goBack() {
  emit('back')
}

function handleKeyDown(e: KeyboardEvent) {
  if (e.key === 'Escape') {
    close()
  }
  if (e.key === 'Tab') {
    trapFocus(e)
  }
}

function trapFocus(e: KeyboardEvent) {
  if (!modalRef.value) return
  const focusableElements = Array.from(
    modalRef.value.querySelectorAll<HTMLElement>(
      'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
    )
  ).filter((el) => !el.hasAttribute('disabled') && el.getAttribute('aria-disabled') !== 'true')
  const firstElement = focusableElements[0]
  const lastElement = focusableElements[focusableElements.length - 1]

  if (e.shiftKey) {
    if (document.activeElement === firstElement) {
      e.preventDefault()
      lastElement?.focus()
    }
  } else {
    if (document.activeElement === lastElement) {
      e.preventDefault()
      firstElement?.focus()
    }
  }
}

function restoreFocus() {
  if (previousActiveElement.value) {
    previousActiveElement.value.focus()
  }
}

// Lock body scroll when modal is open
watch(() => props.modelValue, async (isOpen) => {
  if (typeof document === 'undefined') return
  if (toggleRef.value) toggleRef.value.checked = isOpen
  if (isOpen) {
    previousActiveElement.value = document.activeElement as HTMLElement
    acquire()
    hasAcquired.value = true
    document.addEventListener('keydown', handleKeyDown)
    await nextTick()
    modalRef.value?.querySelector('button')?.focus()
  } else {
    document.removeEventListener('keydown', handleKeyDown)
    if (hasAcquired.value) {
      release()
      hasAcquired.value = false
    }
    restoreFocus()
  }
}, { immediate: true })

onMounted(() => {
  const toggle = toggleRef.value
  if (!toggle) return
  if (props.modelValue) {
    toggle.checked = true
  } else if (toggle.checked) {
    emit('update:modelValue', true)
  }
})

onUnmounted(() => {
  document.removeEventListener('keydown', handleKeyDown)
  if (hasAcquired.value) {
    release()
  }
})
</script>

<style scoped>
.booking-modal-shell {
  display: none;
  width: 100%;
  height: 100%;
  margin: 0;
  border: 0;
  background: transparent;
}

.booking-modal-toggle:checked + .booking-modal-shell {
  display: flex;
}
</style>
