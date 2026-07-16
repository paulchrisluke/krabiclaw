import type { BlogPostRepository, BlogPost, PlatformBlogCreateInput, PlatformBlogUpdateInput } from './types'

export function platformBlogRepository(): BlogPostRepository {
  return {
    listUrl: '/admin/blog',
    editUrl: postId => `/admin/blog/${postId}`,

    async get(postId: string): Promise<BlogPost> {
      const res = await $fetch<{ post: BlogPost }>(`/api/admin/blog/posts/${postId}`)
      if (!res.post) throw new Error('Post not found')
      return res.post
    },

    async create(input: PlatformBlogCreateInput): Promise<BlogPost & { id: string }> {
      const res = await $fetch<{ id: string; post: BlogPost }>('/api/admin/blog/posts', {
        method: 'POST',
        body: input,
      })
      return { ...res.post, id: res.id } as BlogPost & { id: string }
    },

    async update(postId: string, input: PlatformBlogUpdateInput): Promise<BlogPost> {
      const res = await $fetch<{ post: BlogPost }>(`/api/admin/blog/posts/${postId}`, {
        method: 'PATCH',
        body: input,
      })
      if (!res.post) throw new Error('Post not found after update')
      return res.post
    },

    async delete(postId: string): Promise<void> {
      await $fetch(`/api/admin/blog/posts/${postId}`, { method: 'DELETE' })
    },

    async publish(postId: string): Promise<void> {
      await $fetch(`/api/admin/blog/posts/${postId}`, {
        method: 'PATCH',
        body: { publish: true },
      })
    },

    async unpublish(postId: string): Promise<void> {
      await $fetch(`/api/admin/blog/posts/${postId}`, {
        method: 'PATCH',
        body: { unpublish: true },
      })
    },
  }
}
