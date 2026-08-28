import { HTTPError } from 'nitro'

export type LocalizationErrorCode =
  | 'LOCALE_QUERY_UNSUPPORTED'
  | 'LOCALE_NOT_CANONICAL'
  | 'PLATFORM_LOCALE_UNAVAILABLE'
  | 'LANGUAGE_LICENSE_REQUIRED'
  | 'LANGUAGE_LICENSE_SYNCING'
  | 'LOCALIZATION_NOT_FOUND'
  | 'LOCALIZATION_VALIDATION_FAILED'
  | 'LOCALIZED_ROUTE_CONFLICT'
  | 'PLATFORM_CATALOG_INCOMPLETE'
  | 'PLATFORM_CATALOG_PLACEHOLDER_MISMATCH'
  | 'NO_PRODUCTS_EXTRACTED'
  | 'PRODUCT_IMPORT_VALIDATION_FAILED'

export function localizationError(
  statusCode: number,
  code: LocalizationErrorCode,
  statusMessage: string,
  details: Record<string, unknown> = {},
): never {
  throw new HTTPError({ statusCode, statusMessage, data: { code, ...details } })
}

