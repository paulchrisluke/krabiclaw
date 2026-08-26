import type { BlogLifecycleState, BlogPostRepository, BlogPost, PlatformBlogCreateInput, PlatformBlogUpdateInput } from './types'
import { dashboardFetch } from '~/composables/dashboardFetch'

interface TenantBlogRepositoryOptions {
  siteId: string
}

export function tenantBlogRepository({ siteId, orgSlug, siteSlug }: TenantBlogRepositoryOptions & { orgSlug: string; siteSlug: string }): BlogPostRepository {
  const baseUrl = `/api/editor/sites/${siteId}/blog`
  const dashboardBaseUrl = `/dashboard/${orgSlug}/sites/${siteSlug}/blog`
  const scope = { orgSlug, siteSlug }
  const isBlogPost = (value: unknown): value is BlogPost =>
    isRecord(value)
    && typeof value.id === 'string'
    && typeof value.title === 'string'
    && isRecord(value.content_document)
  const isPostResponse = (value: unknown): value is { post: BlogPost } =>
    isRecord(value) && isBlogPost(value.post)
  const isCreatedPostResponse = (value: unknown): value is { id: string; post: BlogPost } =>
    isRecord(value) && typeof value.id === 'string' && isBlogPost(value.post)
  const isSuccess = (value: unknown): value is { success: true } =>
    isRecord(value) && value.success === true
  const isLifecycleState = (value: unknown): value is BlogLifecycleState =>
    isRecord(value)
    && typeof value.id === 'string'
    && ['published', 'scheduled'].includes(String(value.status))
    && (value.published_at === null || typeof value.published_at === 'string')
    && (value.scheduled_for === null || typeof value.scheduled_for === 'string')
    && typeof value.updated_at === 'string'
    && typeof value.content_document_updated_at === 'string'
  const isLifecycleResponse = (value: unknown): value is { success: true; lifecycle: BlogLifecycleState } =>
    isRecord(value) && value.success === true && isLifecycleState(value.lifecycle)

  return {
    listUrl: dashboardBaseUrl,
    editUrl: postId => `${dashboardBaseUrl}/${postId}`,

    async get(postId: string): Promise<BlogPost> {
      const res = await dashboardFetch<{ post: BlogPost }>(
        `${baseUrl}/${postId}`,
        scope,
        { validate: isPostResponse },
      )
      return res.post
    },

    async create(input: PlatformBlogCreateInput): Promise<BlogPost & { id: string }> {
      const res = await dashboardFetch<{ id: string; post: BlogPost }>(`${baseUrl}/posts`, scope, {
        method: 'POST',
        body: input,
        validate: isCreatedPostResponse,
      })
      return { ...res.post, id: res.id } as BlogPost & { id: string }
    },

    async update(postId: string, input: PlatformBlogUpdateInput): Promise<BlogPost> {
      const res = await dashboardFetch<{ post: BlogPost }>(`${baseUrl}/${postId}`, scope, {
        method: 'PATCH',
        body: input,
        validate: isPostResponse,
      })
      if (!res.post) throw new Error('Post not found after update')
      return res.post
    },

    async delete(postId: string): Promise<void> {
      await dashboardFetch(`${baseUrl}/${postId}`, scope, { method: 'DELETE', validate: isSuccess })
    },

    async publish(postId: string, input): Promise<BlogLifecycleState> {
      const response = await dashboardFetch<{ success: true; lifecycle: BlogLifecycleState }>(
        `/api/editor/sites/${siteId}/blog/${postId}/publish`,
        scope,
        { method: 'POST', body: input, validate: isLifecycleResponse },
      )
      return response.lifecycle
    },

  }
}
