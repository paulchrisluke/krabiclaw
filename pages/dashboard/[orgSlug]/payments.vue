<template>
  <DashboardIndexPanel id="payments" title="Payments" :auto-open="`${base}/overview`">
    <EditorNavigationList :groups="[{id:'payments',items}]" :active-item="level.child.value" />
  </DashboardIndexPanel>
</template>
<script setup lang="ts">
import EditorNavigationList from '~/components/dashboard/EditorNavigationList.vue'
definePageMeta({layout:'dashboard'})
useSeoMeta({title:'Payments | Krabiclaw',robots:'noindex, nofollow'})
const route=useRoute(),level=useRouteLevel()
const base=computed(()=>`/dashboard/${String(route.params.orgSlug)}/payments`)
const items=computed(()=>['Overview','Transactions','Refunds','Disputes','Payouts'].map(label=>({id:label.toLowerCase(),label,to:`${base.value}/${label.toLowerCase()}`})))
</script>
