import type { BlogLifecycleState, BlogPost } from './types'
import { isRecord } from '~/utils/api-clients'

export function isBlogPost(value: unknown): value is BlogPost {
  return isRecord(value)
    && typeof value.id === 'string'
    && typeof value.title === 'string'
    && isRecord(value.content_document)
    && Array.isArray(value.content_document.blocks)
}

export function isBlogPostResponse(value: unknown): value is { post: BlogPost } {
  return isRecord(value) && isBlogPost(value.post)
}

export function isCreatedBlogPostResponse(value: unknown): value is { id: string; post: BlogPost } {
  return isRecord(value) && typeof value.id === 'string' && isBlogPost(value.post)
}

export function isSuccessResponse(value: unknown): value is { success: true } {
  return isRecord(value) && value.success === true
}

function isBlogLifecycleState(value: unknown): value is BlogLifecycleState {
  return isRecord(value)
    && typeof value.id === 'string'
    && (value.status === 'published' || value.status === 'scheduled')
    && (value.published_at === null || typeof value.published_at === 'string')
    && (value.scheduled_for === null || typeof value.scheduled_for === 'string')
    && typeof value.updated_at === 'string'
    && typeof value.content_document_updated_at === 'string'
}

export function isBlogLifecycleResponse(value: unknown): value is { success: true; lifecycle: BlogLifecycleState } {
  return isRecord(value) && value.success === true && isBlogLifecycleState(value.lifecycle)
}
