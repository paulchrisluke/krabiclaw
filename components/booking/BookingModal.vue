<template>
  <Teleport to="body">
    <Transition
      enter-active-class="transition duration-200 ease-out"
      enter-from-class="opacity-0 scale-95"
      enter-to-class="opacity-100 scale-100"
      leave-active-class="transition duration-150 ease-in"
      leave-from-class="opacity-100 scale-100"
      leave-to-class="opacity-0 scale-95"
    >
      <div v-if="modelValue" ref="modalRef" class="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-6" role="dialog" aria-modal="true" :aria-labelledby="titleId">
        <!-- Backdrop -->
        <div class="absolute inset-0 bg-black/40 backdrop-blur-sm" @click="close"></div>
        
        <!-- Modal content -->
        <div class="relative bg-white dark:bg-zinc-900 rounded-2xl shadow-xl w-full max-w-md max-h-[90vh] overflow-hidden flex flex-col">
          <!-- Header -->
          <div class="flex items-center justify-between p-4 border-b border-default shrink-0">
            <button 
              v-if="canGoBack" 
              type="button" 
              class="p-2 -ml-2 rounded-full hover:bg-muted/10 text-default transition-colors"
              @click="goBack"
            >
              <svg class="w-5 h-5" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="2.5" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" d="M15.75 19.5L8.25 12l7.5-7.5" /></svg>
            </button>
            <div v-else class="w-9 h-9"></div> <!-- Spacer for alignment -->
            
            <h2 :id="titleId" class="text-base font-semibold text-default flex-1 text-center truncate px-2">
              {{ title }}
            </h2>
            
            <button 
              type="button" 
              class="p-2 -mr-2 rounded-full hover:bg-muted/10 text-default transition-colors"
              @click="close"
            >
              <svg class="w-5 h-5" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="2.5" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>
            </button>
          </div>
          
          <!-- Body -->
          <div class="p-4 sm:p-6 overflow-y-auto">
            <slot />
          </div>
          
          <!-- Footer (optional) -->
          <div v-if="$slots.footer" class="p-4 sm:px-6 border-t border-default shrink-0">
            <slot name="footer" />
          </div>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>

<script setup lang="ts">
import { watch, onUnmounted, ref, nextTick } from 'vue'
import { useScrollLock } from '~/composables/useScrollLock'

const props = defineProps<{
  modelValue: boolean
  title: string
  canGoBack?: boolean
}>()

const emit = defineEmits<{
  'update:modelValue': [value: boolean]
  back: []
}>()

const modalRef = ref<HTMLElement | null>(null)
const titleId = `modal-title-${Math.random().toString(36).slice(2, 9)}`
const previousActiveElement = ref<HTMLElement | null>(null)
const hasAcquired = ref(false)
const { acquire, release } = useScrollLock()

function close() {
  emit('update:modelValue', false)
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

onUnmounted(() => {
  document.removeEventListener('keydown', handleKeyDown)
  if (hasAcquired.value) {
    release()
  }
})
</script>
