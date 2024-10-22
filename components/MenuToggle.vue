<template>
    <a
      href="#"
      class="bg-black menuToggle w-16 h-16 flex items-center justify-center fixed right-4 rounded-[50%] bottom-4 z-[9999]"
      @click.prevent="$emit('toggle')"
    >
      <img v-if="!isOpen" src="~/assets/images/menu-icon.svg" alt="" class="menu-icon-img" />
      <img v-else src="~/assets/images/cross.svg" alt="" class="cross-icon" />
    </a>
  </template>
  
  <script setup>
  import { onMounted, onUnmounted } from 'vue';

  const props = defineProps({
    isOpen: {
      type: Boolean,
      required: true,
    },
  });

  const emit = defineEmits(['toggle']);

  // Add event listener for 'keydown' event
  onMounted(() => {
    window.addEventListener('keydown', handleKeyDown);
  });

  // Remove event listener when component is unmounted
  onUnmounted(() => {
    window.removeEventListener('keydown', handleKeyDown);
  });

  // Function to handle keydown event
  const handleKeyDown = (event) => {
    if (event.key === 'Escape' && props.isOpen) {
      emit('toggle');
    }
  };
  </script>
