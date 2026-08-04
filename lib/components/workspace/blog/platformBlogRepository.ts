import type { BlogPostRepository, BlogPost, PlatformBlogCreateInput, PlatformBlogUpdateInput } from './types'

export function platformBlogRepository(): BlogPostRepository {
  const isBlogPost = (value: unknown): value is BlogPost =>
    isRecord(value)
    && typeof value.id === 'string'
    && typeof value.title === 'string'
    && typeof value.body === 'string'
  const isPostResponse = (value: unknown): value is { post: BlogPost } =>
    isRecord(value) && isBlogPost(value.post)
  const isCreatedPostResponse = (value: unknown): value is { id: string; post: BlogPost } =>
    isRecord(value) && typeof value.id === 'string' && isBlogPost(value.post)
  const isSuccess = (value: unknown): value is { success: true } =>
    isRecord(value) && value.success === true
  return {
    listUrl: '/admin/blog',
    editUrl: postId => `/admin/blog/${postId}`,

    async get(postId: string): Promise<BlogPost> {
      const res = await applicationFetch<{ post: BlogPost }>(
        `/api/admin/blog/posts/${postId}`,
        { validate: isPostResponse },
      )
      if (!res.post) throw new Error('Post not found')
      return res.post
    },

    async create(input: PlatformBlogCreateInput): Promise<BlogPost & { id: string }> {
      const res = await applicationFetch<{ id: string; post: BlogPost }>('/api/admin/blog/posts', {
        method: 'POST',
        body: input,
        validate: isCreatedPostResponse,
      })
      return { ...res.post, id: res.id } as BlogPost & { id: string }
    },

    async update(postId: string, input: PlatformBlogUpdateInput): Promise<BlogPost> {
      const res = await applicationFetch<{ post: BlogPost }>(`/api/admin/blog/posts/${postId}`, {
        method: 'PATCH',
        body: input,
        validate: isPostResponse,
      })
      if (!res.post) throw new Error('Post not found after update')
      return res.post
    },

    async delete(postId: string): Promise<void> {
      await applicationFetch(`/api/admin/blog/posts/${postId}`, { method: 'DELETE', validate: isSuccess })
    },

    async publish(postId: string): Promise<void> {
      await applicationFetch(`/api/admin/blog/posts/${postId}`, {
        method: 'PATCH',
        body: { publish: true },
        validate: isPostResponse,
      })
    },

    async unpublish(postId: string): Promise<void> {
      await applicationFetch(`/api/admin/blog/posts/${postId}`, {
        method: 'PATCH',
        body: { unpublish: true },
        validate: isPostResponse,
      })
    },
  }
}
