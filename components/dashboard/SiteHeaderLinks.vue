<template>
  <UButton
    v-for="(link, index) in links"
    :key="`${link.label}-${link.to || 'action'}-${index}`"
    v-bind="link"
    @click="link.onClick?.()"
  />
</template>

<script lang="ts">
import { defineComponent, type PropType } from 'vue'
import type { DashboardActionLink } from '~/composables/useDashboardSiteLinks'

export default defineComponent({
  name: 'DashboardSiteHeaderLinks',
  props: {
    links: {
      type: Array as PropType<DashboardActionLink[]>,
      required: true
    }
  }
})
</script>
