<template>
  <div class="font-poppins overflow">
   <default-header />
      <slot />
      <!-- Menu Toggle Button -->
      <MenuToggle :isOpen="menuOpen" @toggle="toggleMenu" />
      <!-- Full Menu Component -->
      <FullMenu :isOpen="menuOpen" @close="toggleMenu" />
    <default-footer />
   
  </div>
</template>
<script setup>
import { ref } from 'vue';
const menuOpen = ref(false);

const toggleMenu = () => {
  menuOpen.value = !menuOpen.value;
};
</script>

