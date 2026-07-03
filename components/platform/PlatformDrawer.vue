<template>
  <Teleport to="body">
    <div v-if="modelValue" class="fixed inset-0 z-100 flex">
      <Transition name="platform-drawer-fade" appear>
        <div class="absolute inset-0 bg-black/40" @click="close" />
      </Transition>
      <Transition name="platform-drawer-slide" appear>
        <div
          class="relative z-10 flex h-full w-full max-w-xs flex-col bg-default shadow-xl"
          role="dialog"
          aria-modal="true"
          :aria-label="title"
        >
          <div class="flex items-center justify-between border-b border-default px-4 py-3">
            <p class="text-base font-semibold text-default">{{ title }}</p>
            <button
              ref="closeButton"
              type="button"
              class="flex size-8 items-center justify-center rounded-full text-muted transition-colors hover:bg-muted hover:text-default"
              aria-label="Close"
              @click="close"
            >
              <PlatformIcon name="x" class="size-4.5" />
            </button>
          </div>
          <div class="flex-1 overflow-y-auto px-4 py-4">
            <slot />
          </div>
        </div>
      </Transition>
    </div>
  </Teleport>
</template>

<script setup lang="ts">
const props = defineProps<{
  modelValue: boolean
  title: string
}>()

const emit = defineEmits<{ 'update:modelValue': [boolean] }>()

const closeButton = ref<HTMLButtonElement | null>(null)
const previousFocus = ref<HTMLElement | null>(null)

const { acquire: acquireScrollLock, release: releaseScrollLock } = useScrollLock()

function close() {
  emit('update:modelValue', false)
}

function onKeydown(event: KeyboardEvent) {
  if (event.key === 'Escape' && props.modelValue) close()
  
  // Simple focus trap: Tab/Shift+Tab on close button cycles focus
  if (event.key === 'Tab' && props.modelValue && closeButton.value) {
    if (!event.shiftKey && document.activeElement === closeButton.value) {
      event.preventDefault()
      closeButton.value.focus()
    } else if (event.shiftKey && document.activeElement === closeButton.value) {
      event.preventDefault()
      closeButton.value.focus()
    }
  }
}

watch(() => props.modelValue, (open) => {
  if (!import.meta.client) return
  
  if (open) {
    acquireScrollLock()
    previousFocus.value = document.activeElement as HTMLElement
    nextTick(() => {
      closeButton.value?.focus()
    })
  } else {
    releaseScrollLock()
    previousFocus.value?.focus()
  }
})

onMounted(() => document.addEventListener('keydown', onKeydown))
onUnmounted(() => {
  document.removeEventListener('keydown', onKeydown)
  releaseScrollLock()
})
</script>

<style>
.platform-drawer-fade-enter-active,
.platform-drawer-fade-leave-active {
  transition: opacity 0.2s ease;
}
.platform-drawer-fade-enter-from,
.platform-drawer-fade-leave-to {
  opacity: 0;
}

.platform-drawer-slide-enter-active,
.platform-drawer-slide-leave-active {
  transition: transform 0.25s ease;
}
.platform-drawer-slide-enter-from,
.platform-drawer-slide-leave-to {
  transform: translateX(-100%);
}
</style>
