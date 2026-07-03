<template>
  <form @submit.prevent="submit" class="booking-contact-form space-y-4">
    <div>
      <label for="booking-name" class="block text-sm font-medium text-default mb-1">Full name</label>
      <input 
        id="booking-name"
        v-model="form.name"
        type="text"
        required
        class="w-full px-3 py-2 border border-default rounded-lg focus:outline-none focus:ring-2 focus:ring-black dark:focus:ring-white bg-transparent text-default"
      />
    </div>

    <div>
      <label for="booking-email" class="block text-sm font-medium text-default mb-1">Email address</label>
      <input 
        id="booking-email"
        v-model="form.email"
        type="email"
        required
        class="w-full px-3 py-2 border border-default rounded-lg focus:outline-none focus:ring-2 focus:ring-black dark:focus:ring-white bg-transparent text-default"
      />
    </div>

    <div>
      <label for="booking-phone" class="block text-sm font-medium text-default mb-1">Phone number <span class="text-muted font-normal">(Optional)</span></label>
      <input 
        id="booking-phone"
        v-model="form.phone"
        type="tel"
        class="w-full px-3 py-2 border border-default rounded-lg focus:outline-none focus:ring-2 focus:ring-black dark:focus:ring-white bg-transparent text-default"
      />
    </div>

    <div>
      <label for="booking-notes" class="block text-sm font-medium text-default mb-1">Special requests <span class="text-muted font-normal">(Optional)</span></label>
      <textarea 
        id="booking-notes"
        v-model="form.notes"
        rows="3"
        class="w-full px-3 py-2 border border-default rounded-lg focus:outline-none focus:ring-2 focus:ring-black dark:focus:ring-white bg-transparent text-default resize-none"
      ></textarea>
    </div>

    <div class="pt-2">
      <button 
        type="submit"
        class="w-full py-3 px-4 rounded-xl text-white bg-black dark:bg-white dark:text-black font-semibold text-[15px] shadow-sm hover:opacity-90 transition-opacity disabled:opacity-50"
        :disabled="loading"
      >
        <span v-if="loading" class="flex items-center justify-center gap-2">
          <svg class="animate-spin h-4 w-4" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
            <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
            <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
          </svg>
          Processing...
        </span>
        <span v-else>{{ submitText }}</span>
      </button>
    </div>
  </form>
</template>

<script setup lang="ts">
import { reactive } from 'vue'

export interface ContactFormState {
  name: string
  email: string
  phone: string
  notes: string
}

const props = withDefaults(defineProps<{
  initialState?: Partial<ContactFormState>
  loading?: boolean
  submitText?: string
}>(), {
  submitText: 'Confirm booking',
  loading: false
})

const emit = defineEmits<{
  (e: 'submit', form: ContactFormState): void
}>()

const form = reactive<ContactFormState>({
  name: props.initialState?.name || '',
  email: props.initialState?.email || '',
  phone: props.initialState?.phone || '',
  notes: props.initialState?.notes || ''
})

function submit() {
  emit('submit', { ...form })
}
</script>
