<template><section class="space-y-4"><h3 class="border-b border-white/10 pb-2 text-sm font-semibold text-gray-200">{{ title }}</h3><slot /></section></template>
<script setup lang="ts">defineProps<{ title: string }>()</script>
