<template>
  <DashboardIndexPanel id="catalog-collections" :title="presentation.collectionGroupLabelPlural">
    <CollectionList />
  </DashboardIndexPanel>
</template>

<script setup lang="ts">
import CollectionList from '~/components/dashboard/CollectionList.vue'
import { requireProductPresentation } from '~/utils/product-presentation'

// The catalog's groupings, in the scope Catalog was opened in: the site-wide
// ones, or one location's own when the URL names that location.
definePageMeta({ layout: 'dashboard' })

const dashboard = useDashboardOrganization()
const presentation = computed(() => requireProductPresentation(dashboard.organization.value?.vertical, dashboard.organization.value?.theme_id))
</script>
