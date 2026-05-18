<template>
  <UApp>
    <NuxtLoadingIndicator color="var(--saya-primary, var(--kc-coral))" :height="2" :throttle="150" />
    <NuxtLayout>
      <NuxtPage />
    </NuxtLayout>
  </UApp>
</template>
