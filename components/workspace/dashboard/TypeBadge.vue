<template>
  <UBadge
    :color="badgeColor"
    :variant="variant"
    :size="size"
    :ui="{ base: 'inline-flex items-center gap-1.5' }"
  >
    <UIcon :name="iconName" class="size-3" />
    {{ label }}
  </UBadge>
</template>

<script setup lang="ts">
type SubmissionType = 'contact' | 'reservation' | 'experience_booking'

const props = withDefaults(defineProps<{
  type: SubmissionType
  size?: 'xs' | 'sm' | 'md'
  variant?: 'soft' | 'subtle' | 'outline'
}>(), {
  size: 'xs',
  variant: 'soft'
})

const typeConfig = {
  contact: {
    label: 'Contact',
    icon: 'i-lucide-mail',
    color: 'info'
  },
  reservation: {
    label: 'Reservation',
    icon: 'i-lucide-calendar-days',
    color: 'success'
  },
  experience_booking: {
    label: 'Booking',
    icon: 'i-lucide-bag',
    color: 'warning'
  }
}

const config = computed(() => typeConfig[props.type])
const label = computed(() => config.value.label)
const iconName = computed(() => config.value.icon)
const badgeColor = computed(() => config.value.color)
</script>
