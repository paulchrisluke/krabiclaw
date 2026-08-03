export default defineNuxtPlugin(async (nuxtApp) => {
  if (window.top === window.self) return

  const { registerAdminPreview } = await import('~/utils/admin-preview-runtime.client')
  await nuxtApp.runWithContext(registerAdminPreview)
})
