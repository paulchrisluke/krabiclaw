<template>
  <ClientOnly>
    <div v-if="toasts.length > 0" class="fixed top-4 right-4 z-100 flex flex-col gap-3 pointer-events-none">
      <TransitionGroup
        enter-active-class="transition duration-300 ease-out"
        enter-from-class="transform translate-x-12 opacity-0"
        enter-to-class="transform translate-x-0 opacity-100"
        leave-active-class="transition duration-200 ease-in"
        leave-from-class="transform translate-x-0 opacity-100"
        leave-to-class="transform translate-x-12 opacity-0"
      >
        <UCard
          v-for="toast in toasts"
          :key="toast.id"
          class="pointer-events-auto min-w-70"
          :class="[
            toast.type === 'success' ? 'bg-black text-white border-white/10' : 
            toast.type === 'error' ? 'bg-red-600 text-white border-red-500' : 
            'bg-stone-800 text-white border-white/5'
          ]"
        >
          <div class="flex items-center justify-between gap-4">
            <span>{{ toast.message }}</span>
            <UButton 
              @click="removeToast(toast.id)"
              variant="ghost"
              color="neutral"
              size="xs"
              square
              class="opacity-50 hover:opacity-100"
            >
              <Icon name="i-lucide-x" />
            </UButton>
          </div>
        </UCard>
      </TransitionGroup>
    </div>
  </ClientOnly>
</template>

<script setup lang="ts">
import { useToast } from '@/composables/useToast'
const toast = useToast()
const toasts = toast.toasts
const removeToast = toast.removeToast
</script>
