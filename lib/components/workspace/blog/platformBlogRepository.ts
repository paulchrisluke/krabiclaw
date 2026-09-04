import type { BlogLifecycleState, BlogPostRepository, BlogPost, BlogPostCreateInput, BlogPostUpdateInput } from './types'
import {
  isBlogLifecycleResponse,
  isBlogPostResponse,
  isCreatedBlogPostResponse,
  isSuccessResponse,
} from './blog-response-contracts'

export function platformBlogRepository(): BlogPostRepository {
  return {
    listUrl: '/admin/blog',
    editUrl: postId => `/admin/blog/${postId}`,

    async get(postId: string): Promise<BlogPost> {
      const res = await applicationFetch<{ post: BlogPost }>(
        `/api/admin/blog/posts/${postId}`,
        { validate: isBlogPostResponse },
      )
      return res.post
    },

    async create(input: BlogPostCreateInput): Promise<BlogPost & { id: string }> {
      const res = await applicationFetch<{ id: string; post: BlogPost }>('/api/admin/blog/posts', {
        method: 'POST',
        body: input,
        validate: isCreatedBlogPostResponse,
      })
      return { ...res.post, id: res.id }
    },

    async update(postId: string, input: BlogPostUpdateInput): Promise<BlogPost> {
      const res = await applicationFetch<{ post: BlogPost }>(`/api/admin/blog/posts/${postId}`, {
        method: 'PATCH',
        body: input,
        validate: isBlogPostResponse,
      })
      return res.post
    },

    async delete(postId: string): Promise<void> {
      await applicationFetch(`/api/admin/blog/posts/${postId}`, { method: 'DELETE', validate: isSuccessResponse })
    },

    async publish(postId: string, input): Promise<BlogLifecycleState> {
      const response = await applicationFetch<{ success: true; lifecycle: BlogLifecycleState }>(`/api/admin/blog/posts/${postId}/publish`, {
        method: 'POST',
        body: input,
        validate: isBlogLifecycleResponse,
      })
      return response.lifecycle
    },

  }
}
