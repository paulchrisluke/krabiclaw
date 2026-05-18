
<template>
  <UButton
    v-for="(item, index) in buttonAttrs"
    :key="`${item.attrs.label}-${item.attrs.to || 'action'}-${index}`"
    v-bind="item.attrs"
    @click="item.onClick?.()"
  />
</template>

<script lang="ts">
import { defineComponent, type PropType, computed } from 'vue'
import type { DashboardActionLink } from '~/composables/useDashboardSiteLinks'

export default defineComponent({
  name: 'DashboardSiteHeaderLinks',
  props: {
    links: {
      type: Array as PropType<DashboardActionLink[]>,
      required: true
    }
  },
  setup(props) {
    const buttonAttrs = computed(() =>
      props.links.map(({ onClick, ...attrs }) => ({
        attrs,
        onClick
      }))
    )
    return { buttonAttrs }
  }
})
</script>
