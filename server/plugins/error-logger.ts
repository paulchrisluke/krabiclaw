export default defineNitroPlugin((nitroApp) => {
  nitroApp.hooks.hook('error', async (error, { event: _event }) => {
    // A 404 here is routinely a scanner bot probing for .env/wp-admin/phpinfo
    // paths, not a real server fault — logging every one at error severity
    // drowns out genuine 5xx exceptions in Observability queries filtered by
    // level=error (this happened during the 2026-07-21 MCP OAuth incident).
    // Mirrors the same >=500 threshold already used in server/api/auth/[...].ts.
    const statusCode = (error as { statusCode?: number }).statusCode
    const log = statusCode && statusCode < 500 ? console.warn : console.error
    log('[NITRO_SERVER_ERROR]', error.message)
    if (error.stack) {
      log('[NITRO_SERVER_STACK]', error.stack)
    }
  })
})
