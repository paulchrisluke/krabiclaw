import {
  BLAWBY_ROUTE_RECIPES,
  type PublicBlawbyRouteData,
  type PublicBlawbyShellData,
} from '~/types/blawby'
import { isRecord } from '~/utils/api-clients'

export interface BlawbyDocumentPayload {
  success: true
  shell: PublicBlawbyShellData
  route: PublicBlawbyRouteData
}

const RECIPES = new Set<string>(BLAWBY_ROUTE_RECIPES)
const THEME_COLOR = /^#(?:[0-9a-f]{3}|[0-9a-f]{6}|[0-9a-f]{8})$/i

const isNullableString = (value: unknown) => value === null || typeof value === 'string'

function hasValidIdentity(value: unknown) {
  return isRecord(value)
    && typeof value.brand_name === 'string'
    && isNullableString(value.brand_description)
    && Array.isArray(value.media)
    && value.media.every(item => isRecord(item)
      && typeof item.asset_id === 'string'
      && typeof item.slot === 'string'
      && isNullableString(item.public_url))
    && isNullableString(value.phone)
    && isNullableString(value.banner_content)
    && typeof value.banner_dismissible === 'boolean'
    && isNullableString(value.primary_location_address_street)
    && isNullableString(value.primary_location_address_locality)
}

function hasValidConsultation(value: unknown) {
  return isRecord(value)
    && (value.mode === 'external_url' || value.mode === 'native_disabled')
    && typeof value.cta_label === 'string'
    && isNullableString(value.external_url)
    && typeof value.schedule_path === 'string'
    && typeof value.confirmation_path === 'string'
    && typeof value.tracking_enabled === 'boolean'
    && typeof value.contact_form_enabled === 'boolean'
    && isRecord(value.metadata)
}

function hasValidThemeTokens(value: unknown) {
  return isRecord(value)
    && Object.values(value).every(token => typeof token === 'string' && THEME_COLOR.test(token))
}

function hasRequiredRouteContent(route: Record<string, unknown>) {
  if (route.recipe === 'links' || route.recipe === 'confirmation') return true
  if (route.recipe === 'offering') return isRecord(route.offering)
  if (route.recipe === 'article') return isRecord(route.post)
  return isRecord(route.page)
}

export const isBlawbyDocumentPayload = (
  value: unknown,
  expectedRecipe: PublicBlawbyRouteData['recipe'],
): value is BlawbyDocumentPayload =>
  isRecord(value)
  && value.success === true
  && isRecord(value.shell)
  && isRecord(value.route)
  && hasValidIdentity(value.shell.identity)
  && hasValidConsultation(value.shell.consultation)
  && hasValidThemeTokens(value.shell.themeTokens)
  && Array.isArray(value.shell.offeringLinks)
  && Array.isArray(value.shell.pageLinks)
  && typeof value.route.recipe === 'string'
  && RECIPES.has(value.route.recipe)
  && value.route.recipe === expectedRecipe
  && Array.isArray(value.route.localeRepresentations)
  && Array.isArray(value.route.offerings)
  && Array.isArray(value.route.qa)
  && Array.isArray(value.route.reviews)
  && Array.isArray(value.route.posts)
  && hasRequiredRouteContent(value.route)
