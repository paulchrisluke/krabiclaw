<template>
 <main class="mx-auto max-w-2xl space-y-6 px-5 py-10"><h1 class="text-3xl font-semibold">My availability</h1><p class="text-muted">Your working hours, time off and optional Google busy-calendar checks.</p><UAlert v-if="error" color="error" :description="getErrorMessage(error,'Sign in to manage your schedule')" /><MemberScheduleEditor v-if="member" :organization-id="organizationId" :member-id="member.id" self /><UButton v-else to="/login" color="neutral">Sign in</UButton></main>
</template>
<script setup lang="ts">
import MemberScheduleEditor from '~/components/dashboard/MemberScheduleEditor.vue'
definePageMeta({layout:'standalone'})
const route=useRoute(),organizationId=String(route.params.organizationId)
const {data,error}=await useFetch<{members:{id:string;self:boolean}[]}>(`/api/organizations/${organizationId}/members/scheduling`,{server:false})
const member=computed(()=>data.value?.members.find(member=>member.self)??null)
useSeoMeta({title:'My availability',robots:'noindex, nofollow'})
</script>
