<template>
  <form @submit.prevent="submit" class="booking-contact-form space-y-4">
    <div>
      <label for="booking-name" class="block text-sm font-medium text-default mb-1">Full name</label>
      <input 
        id="booking-name"
        v-model="form.name"
        type="text"
        required
        class="w-full px-3 py-2 border border-default rounded-lg focus:outline-none focus:ring-2 focus:ring-primary bg-transparent text-default"
      />
    </div>

    <div>
      <label for="booking-email" class="block text-sm font-medium text-default mb-1">Email address</label>
      <input 
        id="booking-email"
        v-model="form.email"
        type="email"
        required
        class="w-full px-3 py-2 border border-default rounded-lg focus:outline-none focus:ring-2 focus:ring-primary bg-transparent text-default"
      />
    </div>

    <div>
      <label for="booking-phone" class="block text-sm font-medium text-default mb-1">Phone number <span v-if="!phoneRequired" class="text-muted font-normal">(Optional)</span></label>
      <input 
        id="booking-phone"
        v-model="form.phone"
        type="tel"
        :required="phoneRequired"
        class="w-full px-3 py-2 border border-default rounded-lg focus:outline-none focus:ring-2 focus:ring-primary bg-transparent text-default"
      />
    </div>

    <div>
      <label for="booking-notes" class="block text-sm font-medium text-default mb-1">Special requests <span class="text-muted font-normal">(Optional)</span></label>
      <textarea 
        id="booking-notes"
        v-model="form.notes"
        rows="3"
        class="w-full px-3 py-2 border border-default rounded-lg focus:outline-none focus:ring-2 focus:ring-primary bg-transparent text-default resize-none"
      ></textarea>
    </div>

    <div class="pt-2">
      <SayaButton type="submit" size="lg" block :loading="loading" :disabled="loading">
        {{ loading ? 'Processing...' : submitText }}
      </SayaButton>
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
  phoneRequired?: boolean
}>(), {
  submitText: 'Confirm booking',
  loading: false,
  phoneRequired: false
})

const emit = defineEmits<{
  submit: [form: ContactFormState]
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
