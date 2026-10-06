<template>
 <DashboardIndexPanel id="availability-organizations" title="Your availability">
  <UAlert v-if="state.error" color="error" :description="getErrorMessage(state.error,'Your organizations could not be loaded.')" />
  <EditorNavigationList :groups="groups" :active-item="level.child.value" />
 </DashboardIndexPanel>
</template>
<script setup lang="ts">
import EditorNavigationList from '~/components/dashboard/EditorNavigationList.vue'
import {authClient} from '~/lib/auth-client'
definePageMeta({layout:'dashboard'})
const level=useRouteLevel()
const organizations=authClient.useListOrganizations()
const state=computed(()=>unref(organizations))
const groups=computed(()=>[{id:'organizations',items:(state.value.data??[]).map(org=>({id:org.id,label:org.name,to:`${level.path.value}/${encodeURIComponent(org.id)}`}))}])
</script>
