<template>
  <nav v-if="page.recipe === 'products'" class="kc-product-nav" :aria-label="page.title">
    <span>{{ page.title }}</span>
    <div>
      <NuxtLink v-for="link in links" :key="link.url" :to="link.url">{{ link.label }}</NuxtLink>
    </div>
  </nav>
  <div v-else class="my-8 flex flex-wrap gap-3">
    <TenantPageButton v-for="link in links" :key="link.url + link.label" :label="link.label" :url="link.url" />
  </div>
</template>
<script setup lang="ts">
import type { PublicTenantPage } from '~/server/utils/public-tenant-pages'
import type { TenantPageBlock } from '~/utils/tenant-page-blocks'
import { blockRecords, blockText } from '~/utils/tenant-page-block-data'
import TenantPageButton from '~/components/tenant-pages/TenantPageButton.vue'
const props = defineProps<{ block: TenantPageBlock; page: PublicTenantPage }>()
const { localePath } = useI18n()
const links = computed(() => blockRecords(props.block.data.buttons).map(item => ({ label: blockText(item.label), url: localePath(blockText(item.url)) })))
</script>
<style scoped>
.kc-product-nav { display: flex; flex-wrap: wrap; justify-content: space-between; gap: 1.5rem; align-items: center; width: min(86%, 86rem); margin: auto; padding: 2rem 0; color: #a9aab4; }
.kc-product-nav > span { text-transform: uppercase; letter-spacing: .12em; font-size: .8rem; }
.kc-product-nav > div { display: flex; gap: clamp(1.5rem, 5vw, 5rem); }
.kc-product-nav a { color: #d6d7dd; text-decoration: none; font-size: 1rem; }
.kc-product-nav a:hover, .kc-product-nav a:focus-visible { color: var(--kc-coral); }
</style>
