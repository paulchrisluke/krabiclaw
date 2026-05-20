export default defineNitroPlugin((nitroApp) => {
  nitroApp.hooks.hook('error', async (error, { event }) => {
    console.error('[NITRO_SERVER_ERROR]', error.message)
    if (error.stack) {
      console.error('[NITRO_SERVER_STACK]', error.stack)
    }
  })
})
