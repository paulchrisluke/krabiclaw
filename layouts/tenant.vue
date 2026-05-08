<template>
  <div class="tenant-layout saya-theme min-h-screen flex flex-col font-sans">
    <UTheme :ui="{}" :props="{ button: { color: 'neutral' } }">
      <SayaHeader />
      <main class="grow">
        <slot />
      </main>
      <SayaFooter />
    </UTheme>
  </div>
</template>

<style>
/* Tenant-specific base styles can go here */
</style>
