<!-- Three Page editor directions, switchable through ?variant=A|B|C on the existing route. -->
<template>
  <TenantPagePrototypeFocused v-if="variant === 'A'" :page="page" :back-to="backTo" :preview-to="previewTo" />
  <TenantPagePrototypeCanvas v-else-if="variant === 'B'" :page="page" />
  <TenantPagePrototypeStoryboard v-else :page="page" />
  <PrototypeVariantSwitcher :variants="PROTOTYPE_VARIANTS" :current-key="variant" @select="selectVariant" />
</template>

<script setup lang="ts">
import { computed } from 'vue'
import type { TenantPageBlock } from '~/utils/tenant-page-blocks'
import PrototypeVariantSwitcher from './PrototypeVariantSwitcher.vue'
import TenantPagePrototypeCanvas from './TenantPagePrototypeCanvas.vue'
import TenantPagePrototypeFocused from './TenantPagePrototypeFocused.vue'
import TenantPagePrototypeStoryboard from './TenantPagePrototypeStoryboard.vue'
import { PROTOTYPE_VARIANTS, createPrototypePageView, parsePrototypeVariant, type PrototypeVariantKey } from './prototype-model'

const props = defineProps<{
  title: string
  summary: string
  locale: string
  path: string
  dirty: boolean
  blocks: TenantPageBlock[]
  backTo: string
  previewTo?: string
}>()

const route = useRoute()
const router = useRouter()
const variant = computed(() => parsePrototypeVariant(route.query.variant))
const page = computed(() => createPrototypePageView({
  title: props.title,
  summary: props.summary,
  locale: props.locale,
  path: props.path,
  dirty: props.dirty,
  blocks: props.blocks,
}))

function selectVariant(key: PrototypeVariantKey) {
  void router.replace({ query: { ...route.query, variant: key } })
}
</script>
