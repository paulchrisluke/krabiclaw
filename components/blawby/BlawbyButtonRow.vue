<template>
  <div v-if="buttons.length" class="my-4 mb-8 flex justify-center" data-parity-section="articles-more">
    <BlawbyButton v-for="button in buttons" :key="button.url" :to="localePath(button.url)">{{ button.label }}</BlawbyButton>
  </div>
</template>

<script setup lang="ts">
import type { PublicTenantPage } from '~/server/utils/public-tenant-pages'
import type { TenantPageBlock } from '~/utils/tenant-page-blocks'
import { blockText, blockRecords } from '~/utils/tenant-page-block-data'

/** A row of links the page carries, in the order it carries them. */
const props = defineProps<{ block: TenantPageBlock; page: PublicTenantPage }>()
const { localePath } = useI18n()

const buttons = computed(() => blockRecords(props.block.data.buttons)
  .map(button => ({ label: blockText(button.label), url: blockText(button.url) }))
  .filter(button => button.label && button.url))
</script>
