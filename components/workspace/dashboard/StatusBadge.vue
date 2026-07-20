<template>
  <UBadge
    :color="badgeColor"
    :variant="variant"
    :size="size"
  >
    {{ label }}
  </UBadge>
</template>

<script setup lang="ts">
type InboxStatus = 'open' | 'waiting_on_owner' | 'waiting_on_guest' | 'closed'

const props = withDefaults(defineProps<{
  status: InboxStatus
  size?: 'xs' | 'sm' | 'md'
  variant?: 'soft' | 'subtle' | 'outline'
}>(), {
  size: 'xs',
  variant: 'soft'
})

const statusConfig = {
  open: {
    label: 'Open',
    color: 'info'
  },
  waiting_on_owner: {
    label: 'Waiting on you',
    color: 'warning'
  },
  waiting_on_guest: {
    label: 'Waiting on guest',
    color: 'success'
  },
  closed: {
    label: 'Closed',
    color: 'neutral'
  }
}

const config = computed(() => statusConfig[props.status])
const label = computed(() => config.value.label)
const badgeColor = computed(() => config.value.color)
</script>
