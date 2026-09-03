import type { BlogLifecycleState, BlogPostRepository, BlogPost, BlogPostCreateInput, BlogPostUpdateInput } from './types'
import {
  isBlogLifecycleResponse,
  isBlogPostResponse,
  isCreatedBlogPostResponse,
  isSuccessResponse,
} from './blog-response-contracts'
import { dashboardFetch } from '~/composables/dashboardFetch'

interface TenantBlogRepositoryOptions {
  siteId: string
}

export function tenantBlogRepository({ siteId, orgSlug, siteSlug }: TenantBlogRepositoryOptions & { orgSlug: string; siteSlug: string }): BlogPostRepository {
  const baseUrl = `/api/editor/sites/${siteId}/blog`
  const dashboardBaseUrl = `/dashboard/${orgSlug}/sites/${siteSlug}/blog`
  const scope = { orgSlug, siteSlug }
  return {
    listUrl: dashboardBaseUrl,
    editUrl: postId => `${dashboardBaseUrl}/${postId}`,

    async get(postId: string): Promise<BlogPost> {
      const res = await dashboardFetch<{ post: BlogPost }>(
        `${baseUrl}/${postId}`,
        scope,
        { validate: isBlogPostResponse },
      )
      return res.post
    },

    async create(input: BlogPostCreateInput): Promise<BlogPost & { id: string }> {
      const res = await dashboardFetch<{ id: string; post: BlogPost }>(`${baseUrl}/posts`, scope, {
        method: 'POST',
        body: input,
        validate: isCreatedBlogPostResponse,
      })
      return { ...res.post, id: res.id }
    },

    async update(postId: string, input: BlogPostUpdateInput): Promise<BlogPost> {
      const res = await dashboardFetch<{ post: BlogPost }>(`${baseUrl}/${postId}`, scope, {
        method: 'PATCH',
        body: input,
        validate: isBlogPostResponse,
      })
      return res.post
    },

    async delete(postId: string): Promise<void> {
      await dashboardFetch(`${baseUrl}/${postId}`, scope, { method: 'DELETE', validate: isSuccessResponse })
    },

    async publish(postId: string, input): Promise<BlogLifecycleState> {
      const response = await dashboardFetch<{ success: true; lifecycle: BlogLifecycleState }>(
        `/api/editor/sites/${siteId}/blog/${postId}/publish`,
        scope,
        { method: 'POST', body: input, validate: isBlogLifecycleResponse },
      )
      return response.lifecycle
    },

  }
}
