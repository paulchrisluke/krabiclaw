import type { BlogPostRepository, BlogPost, PlatformBlogCreateInput, PlatformBlogUpdateInput } from './types'

interface TenantBlogRepositoryOptions {
  siteId: string
}

export function tenantBlogRepository({ siteId, orgSlug, siteSlug }: TenantBlogRepositoryOptions & { orgSlug: string; siteSlug: string }): BlogPostRepository {
  const baseUrl = `/api/editor/sites/${siteId}/blog`
  const dashboardBaseUrl = `/dashboard/${orgSlug}/sites/${siteSlug}/blog`

  return {
    listUrl: dashboardBaseUrl,
    editUrl: postId => `${dashboardBaseUrl}/${postId}`,

    async get(postId: string): Promise<BlogPost> {
      const res = await $fetch<{ post: BlogPost }>(`${baseUrl}/${postId}`)
      if (!res.post) throw new Error('Post not found')
      return res.post
    },

    async create(input: PlatformBlogCreateInput): Promise<BlogPost & { id: string }> {
      const res = await $fetch<{ id: string; post: BlogPost }>(`${baseUrl}/posts`, {
        method: 'POST',
        body: input,
      })
      return { ...res.post, id: res.id } as BlogPost & { id: string }
    },

    async update(postId: string, input: PlatformBlogUpdateInput): Promise<BlogPost> {
      const res = await $fetch<{ post: BlogPost }>(`${baseUrl}/${postId}`, {
        method: 'PATCH',
        body: input,
      })
      if (!res.post) throw new Error('Post not found after update')
      return res.post
    },

    async delete(postId: string): Promise<void> {
      await $fetch(`${baseUrl}/${postId}`, { method: 'DELETE' })
    },

    async publish(postId: string): Promise<void> {
      await $fetch(`/api/editor/sites/${siteId}/blog/${postId}/publish`, { method: 'POST' })
    },

    async unpublish(postId: string): Promise<void> {
      await $fetch(`/api/editor/sites/${siteId}/blog/${postId}/unpublish`, { method: 'POST' })
    },
  }
}
