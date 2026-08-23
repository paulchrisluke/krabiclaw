import type { PublicBlawbyRouteData, PublicBlawbyShellData } from '~/types/blawby'
import { isRecord } from '~/utils/api-clients'

export interface BlawbyDocumentPayload {
  success: true
  shell: PublicBlawbyShellData
  route: PublicBlawbyRouteData
}

export const isBlawbyDocumentPayload = (value: unknown): value is BlawbyDocumentPayload =>
  isRecord(value)
  && value.success === true
  && isRecord(value.shell)
  && isRecord(value.route)
  && isRecord(value.shell.identity)
  && isRecord(value.shell.consultation)
  && isRecord(value.shell.themeTokens)
  && Array.isArray(value.shell.offeringLinks)
  && typeof value.route.recipe === 'string'
  && Array.isArray(value.route.offerings)
  && Array.isArray(value.route.qa)
  && Array.isArray(value.route.reviews)
  && Array.isArray(value.route.posts)
