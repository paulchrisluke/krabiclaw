<template>
  <div class="tenant-layout min-h-screen flex flex-col font-sans">
    <SayaHeader />
    <main class="flex-grow">
      <slot />
    </main>
    <SayaFooter />
  </div>
</template>

<style>
/* Tenant-specific base styles can go here */
</style>
