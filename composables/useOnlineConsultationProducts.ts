import type { Product } from '~/server/types/products'
import { isCurrencyCode, type CurrencyCode } from '~/shared/currencies'
import { isPublicProduct } from '~/utils/public-resource-contracts'
import { isRecord, publicApiRequest } from '~/utils/api-clients'
export async function useOnlineConsultationProducts() {
  const { organizationId, organization } = useTenantOrganization()
  if (!organizationId || !organization?.name) throw createError({ statusCode: 404, statusMessage: 'Organization not found' })
  const organizationName = organization.name
  const { data, pending, error } = await useAsyncData(`online-consultations:${organizationId}`, async () => {
    if (import.meta.server) {
      const event = useRequestEvent()!
      const { cloudflareEnv } = await import('~/server/utils/api-response')
      const { listPublicOnlineProducts } = await import('~/server/utils/public-session-booking')
      return await listPublicOnlineProducts(cloudflareEnv(event).DB, organizationId, Boolean(event.context.previewAuthorized))
    }
    return await publicApiRequest<{ products: Product[]; currency: CurrencyCode }>('/api/public/products?online=true', {
      validate: (value): value is { products: Product[]; currency: CurrencyCode } => isRecord(value) && Array.isArray(value.products) && value.products.every(isPublicProduct) && isCurrencyCode(value.currency),
    })
  })
  if (error.value) throw error.value
  return { data, pending, error, organizationId, organizationName }
}
