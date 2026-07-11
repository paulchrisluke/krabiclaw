import type { AiTool } from '~/server/utils/ai-gateway'

export const BLOG_CHOWBOT_TOOLS: AiTool[] = [
  // ── Blog (long-form content, distinct from the social-update Posts above) ──
    {
      name: "list_blog_posts",
      description: "List this site's blog posts (draft and published).",
      input_schema: {
        type: "object",
        properties: {
          status: { type: "string", enum: ["draft", "published"] },
        },
      },
    },
  {
      name: "get_blog_post",
      description: "Get a single blog post by id or slug, including full body.",
      input_schema: {
        type: "object",
        properties: {
          post_id: { type: "string", description: "Post id or slug." },
        },
        required: ["post_id"],
      },
    },
  {
      name: "create_blog_post",
      description:
        "Create a blog post for this site. Set publish=true to publish immediately, otherwise it's saved as a draft.",
      input_schema: {
        type: "object",
        properties: {
          title: { type: "string" },
          body: { type: "string", description: "Use {{component type=\"faq\"}} or {{component type=\"how_to\"}} when you want structured embeds in the article body." },
          excerpt: { type: "string" },
          category: { type: "string", description: "Free text, e.g. 'News', 'Recipes'." },
          seo_description: { type: "string" },
          seo_keywords: { type: "string" },
          canonical_url: { type: "string" },
          robots: { type: "string", enum: ["index,follow", "noindex,follow", "index,nofollow", "noindex,nofollow"] },
          publish: { type: "boolean" },
        },
        required: ["title", "body"],
      },
    },
  {
      name: "update_blog_post",
      description:
        "Update a blog post. Only provided fields change. Set publish=true to publish, or unpublish=true to revert to draft.",
      input_schema: {
        type: "object",
        properties: {
          post_id: { type: "string", description: "Post id or slug." },
          title: { type: "string" },
          body: { type: "string", description: "Use {{component type=\"faq\"}} or {{component type=\"how_to\"}} when you want structured embeds in the article body." },
          excerpt: { type: "string" },
          category: { type: "string" },
          seo_description: { type: "string" },
          seo_keywords: { type: "string" },
          canonical_url: { type: "string" },
          robots: { type: "string", enum: ["index,follow", "noindex,follow", "index,nofollow", "noindex,nofollow"] },
          publish: { type: "boolean" },
          unpublish: { type: "boolean" },
        },
        required: ["post_id"],
      },
    },
  {
      name: "set_blog_post_image",
      description: "Set or replace the featured image on a blog post.",
      input_schema: {
        type: "object",
        properties: {
          post_id: { type: "string", description: "Post id or slug." },
          asset_id: { type: "string", description: "Media asset ID." },
        },
        required: ["post_id", "asset_id"],
      },
    },
  {
      name: "delete_blog_post",
      description: "Delete a blog post.",
      input_schema: {
        type: "object",
        properties: {
          post_id: { type: "string", description: "Post id or slug." },
        },
        required: ["post_id"],
      },
    },
]
