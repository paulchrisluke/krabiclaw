<template>
  <div class="relative h-[110px] bg-white p-0" aria-hidden="true" data-parity-section="shield-divider">
    <svg
      class="w-full"
      viewBox="0 0 1920 160"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
    >
      <path :fill="fill" :d="SHIELD_PATH" />
    </svg>
  </div>
</template>

<script setup lang="ts">
import type { PublicTenantPage } from '~/server/utils/public-tenant-pages'
import type { TenantPageBlock } from '~/utils/tenant-page-blocks'
import { blawbyShieldVariant } from '~/types/blawby'

// This took a `variant` a dispatcher passed. The dispatcher is gone and the
// block registry hands every block its `block` and `page`, so `variant` arrived
// undefined and every divider fell to the default fill — /about and /contact
// lost their accent, and the two undeclared props landed on the div as
// `block="[object Object]"`. No divider block stores a variant, so the page
// answers, through the same resolver the hero above it uses.
const props = defineProps<{ block: TenantPageBlock; page: PublicTenantPage }>()

const SHIELD_PATH = 'M0 0H1920V23.4197C1920 40.325 1907.32 54.2924 1890.45 55.3984C1744.66 64.9576 1103.56 109.281 970.166 157.83C963.441 160.277 956.559 160.277 949.834 157.83C816.436 109.281 175.342 64.9576 29.5456 55.3984C12.6765 54.2924 0 40.325 0 23.4197V0Z'

const fill = computed(() => {
  const variant = blawbyShieldVariant(props.page.path)
  if (variant === 'schedule') return 'var(--blawby-primary-800)'
  if (variant === 'about' || variant === 'contact') return 'var(--blawby-accent-200)'
  return 'var(--blawby-primary-100)'
})
</script>
