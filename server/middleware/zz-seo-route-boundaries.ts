import { HTTPError, defineHandler  } from 'nitro';

import { isTenantOnlySeoPath } from '~/server/utils/seo-policy'
import { TENANT_TYPES } from '~/utils/tenant-routing'

export default defineHandler((event) => {
  if (event.context.tenantType !== TENANT_TYPES.PLATFORM) return

  const pathname = event.url.pathname
  if (!isTenantOnlySeoPath(pathname)) return

  throw new HTTPError({
    statusCode: 404,
    statusMessage: 'Page not found',
  })
})
