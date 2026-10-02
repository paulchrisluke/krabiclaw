<template>
 <DashboardLeafPanel id="member-scheduling" title="Member profile & availability" :ready="Boolean(organizationId)" :footer="false"><MemberScheduleEditor v-if="organizationId" :organization-id="organizationId" :member-id="memberId" admin :self="self" /><p class="mt-6 text-sm text-muted">Members can manage their own schedule at <NuxtLink :to="`/member-schedule/${organizationId}`" class="underline">My availability</NuxtLink>.</p></DashboardLeafPanel>
</template>
<script setup lang="ts">
import MemberScheduleEditor from '~/components/dashboard/MemberScheduleEditor.vue'
import { authClient } from '~/lib/auth-client'
definePageMeta({layout:'dashboard'})
const route=useRoute(),dashboard=useDashboardOrganization(),organizationId=computed(()=>dashboard.organization.value?.id??''),memberId=String(route.params.memberId)
const {data}=await useFetch<{members:{id:string;userId:string}[]}>('/api/dashboard/members',{server:false,query:{org:String(route.params.orgSlug)}})
const auth=authClient.useSession()
const self=computed(()=>data.value?.members.find(m=>m.id===memberId)?.userId===auth.value?.data?.user?.id)
</script>
