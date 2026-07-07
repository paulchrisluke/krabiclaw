import type { AiTool } from '~/server/utils/ai-gateway'

export const POSTS_CHOWBOT_TOOLS: AiTool[] = [
  // ── Posts ──────────────────────────────────────────────────────────────────
    {
      name: "list_posts",
      description:
        "List posts for this site. Optionally filter by status or location.",
      input_schema: {
        type: "object",
        properties: {
          status: {
            type: "string",
            enum: ["draft", "published", "archived"],
            description: "Filter by status. Omit to get all.",
          },
          location_id: {
            type: "string",
            description: "Filter to posts for a specific location.",
          },
        },
      },
    },
  {
      name: "create_post",
      description:
        "Create and publish a post immediately.",
      input_schema: {
        type: "object",
        properties: {
          title: {
            type: "string",
            description: "Short headline (max 80 chars). Optional.",
          },
          slug: {
            type: "string",
            description: "Optional public URL slug. If omitted, KrabiClaw generates one.",
          },
          seo_title: {
            type: "string",
            description: "Optional SEO title for the public post page.",
          },
          seo_description: {
            type: "string",
            description: "Optional SEO/meta description for the public post page.",
          },
          body: {
            type: "string",
            description: "Post body (max 400 chars). Friendly, warm tone. To embed structured content, include {{component type=\"faq\"}} or {{component type=\"how_to\"}} where the matching component should render.",
          },
          components: {
            type: "array",
            description: "Optional structured content components to render with the post. Use faq or how_to components only.",
            items: {
              type: "object",
              properties: {
                type: { type: "string", enum: ["faq", "how_to"] },
                label: { type: ["string", "null"] },
                status: { type: ["string", "null"], enum: ["active", "inactive", null] },
                render_enabled: { type: ["boolean", "null"] },
                schema_enabled: { type: ["boolean", "null"] },
                position: { type: ["number", "null"] },
                data: { type: "object" },
              },
            },
          },
          image_asset_id: {
            type: "string",
            description:
              "Optional media asset ID from generate_image, get_site_media_assets, or pending WhatsApp media.",
          },
          og_image_asset_id: {
            type: "string",
            description: "Optional Open Graph image asset ID.",
          },
          gallery_media: {
            type: "array",
            description: "Optional ordered gallery media for the public post page.",
            items: {
              type: "object",
              properties: {
                media_asset_id: { type: "string" },
                role: { type: "string", enum: ["gallery", "cover"] },
                caption: { type: "string" },
                alt_text: { type: "string" },
              },
              required: ["media_asset_id"],
            },
          },
          location_id: {
            type: "string",
            description:
              "Pin this post to a specific location. Omit for site-wide.",
          },
          post_type: {
            type: "string",
            enum: ["standard", "offer", "event", "update"],
            description: "Post type. Default: standard.",
          },
          cta_type: {
            type: "string",
            enum: ["BOOK", "ORDER", "SHOP", "LEARN_MORE", "SIGN_UP", "CALL"],
            description: "Call-to-action button type.",
          },
          cta_url: { type: "string", description: "URL for the CTA button." },
          event_title: {
            type: "string",
            description: "Event name (for post_type: event).",
          },
          event_start: {
            type: "string",
            description: "Event start datetime ISO string.",
          },
          event_end: {
            type: "string",
            description: "Event end datetime ISO string.",
          },
          offer_coupon: {
            type: "string",
            description: "Coupon code (for post_type: offer).",
          },
          offer_terms: {
            type: "string",
            description: "Offer terms and conditions.",
          },
        },
        required: ["body"],
      },
    },
  {
      name: "publish_post",
      description:
        "Publish a post to external channels (Google Business, Facebook, Instagram). Only call after confirming with the user.",
      input_schema: {
        type: "object",
        properties: {
          post_id: { type: "string", description: "ID of the post to publish." },
        },
        required: ["post_id"],
      },
    },
  {
      name: "update_post",
      description:
        "Update a post — title, body, image, location, type, CTA, or event/offer fields.",
      input_schema: {
        type: "object",
        properties: {
          post_id: { type: "string", description: "ID of the post to update." },
          title: {
            type: "string",
            description: "New headline (max 80 chars). Omit to leave unchanged.",
          },
          slug: {
            type: "string",
            description: "Update the public URL slug. Omit to leave unchanged.",
          },
          seo_title: { type: "string" },
          seo_description: { type: "string" },
          body: {
            type: "string",
            description:
              "New post body (max 400 chars). Omit to leave unchanged. Use {{component type=\"faq\"}} or {{component type=\"how_to\"}} to embed structured content blocks.",
          },
          components: {
            type: "array",
            description: "Updated structured content components. Use faq or how_to components only.",
            items: {
              type: "object",
              properties: {
                type: { type: "string", enum: ["faq", "how_to"] },
                label: { type: ["string", "null"] },
                status: { type: ["string", "null"], enum: ["active", "inactive", null] },
                render_enabled: { type: ["boolean", "null"] },
                schema_enabled: { type: ["boolean", "null"] },
                position: { type: ["number", "null"] },
                data: { type: "object" },
              },
            },
          },
          image_asset_id: {
            type: "string",
            description: "New media asset ID. Omit to leave unchanged.",
          },
          og_image_asset_id: { type: "string" },
          gallery_media: {
            type: "array",
            description: "Replace the ordered public post gallery. Omit to leave unchanged.",
            items: {
              type: "object",
              properties: {
                media_asset_id: { type: "string" },
                role: { type: "string", enum: ["gallery", "cover"] },
                caption: { type: "string" },
                alt_text: { type: "string" },
              },
              required: ["media_asset_id"],
            },
          },
          location_id: {
            type: "string",
            description: "Reassign to a location. Omit to leave unchanged.",
          },
          post_type: {
            type: "string",
            enum: ["standard", "offer", "event", "update"],
          },
          cta_type: {
            type: "string",
            enum: ["BOOK", "ORDER", "SHOP", "LEARN_MORE", "SIGN_UP", "CALL"],
          },
          cta_url: { type: "string" },
          event_title: { type: "string" },
          event_start: { type: "string", description: "ISO datetime string." },
          event_end: { type: "string", description: "ISO datetime string." },
          offer_coupon: { type: "string" },
          offer_terms: { type: "string" },
        },
        required: ["post_id"],
      },
    },
  {
      name: "delete_post",
      description: "Permanently delete a post. Confirm with user first.",
      input_schema: {
        type: "object",
        properties: {
          post_id: { type: "string", description: "ID of the post to delete." },
        },
        required: ["post_id"],
      },
    },
  // ── Posts (single fetch) ───────────────────────────────────────────────────
    {
      name: "get_post",
      description: "Get a single post by ID, including full body and metadata.",
      input_schema: {
        type: "object",
        properties: {
          post_id: { type: "string", description: "ID of the post." },
        },
        required: ["post_id"],
      },
    },
  {
      name: "set_post_image",
      description: "Set or replace the hero image on a post.",
      input_schema: {
        type: "object",
        properties: {
          post_id: { type: "string" },
          asset_id: { type: "string", description: "Media asset ID." },
        },
        required: ["post_id", "asset_id"],
      },
    },
]
