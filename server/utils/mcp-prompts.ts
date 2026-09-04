import { mcpProtocolError, MCP_ERROR } from "./mcp-protocol.ts";

export interface McpPromptArgument {
  name: string;
  description: string;
  required: boolean;
}

export interface McpPromptDefinition {
  name: string;
  description: string;
  arguments: McpPromptArgument[];
}

export const MCP_PROMPTS: McpPromptDefinition[] = [
  {
    name: "onboard_new_site",
    description: "Set up a brand-new KrabiClaw site end-to-end from a Google Maps listing.",
    arguments: [
      { name: "maps_url", description: "Google Maps URL or shortlink for the business.", required: true },
    ],
  },
  {
    name: "set_up_products",
    description: "Build out Products from a free-text description of names, categories, and prices.",
    arguments: [
      { name: "items_description", description: "Free text describing the Products, categories, and prices to add.", required: true },
    ],
  },
  {
    name: "create_and_publish_post",
    description: "Create a post and publish it to the requested channels.",
    arguments: [
      { name: "body", description: "The post body text.", required: true },
      { name: "post_type", description: "standard, offer, event, or update. Defaults to standard.", required: false },
      { name: "channels", description: "Comma-separated channels: site, facebook, instagram. Defaults to site.", required: false },
    ],
  },
  {
    name: "set_up_experience",
    description: "Create a new bookable experience from a description.",
    arguments: [
      { name: "description", description: "What the experience is, including price/duration/capacity if known.", required: true },
    ],
  },
  {
    name: "triage_inbox",
    description: "Summarize new contact messages, reservation requests, experience bookings, and reviews awaiting a reply.",
    arguments: [],
  },
  {
    name: "improve_my_homepage",
    description: "Review the homepage and suggest the highest-impact changes to make it look better and more inviting.",
    arguments: [],
  },
  {
    name: "add_photos_to_site",
    description: "Add the user's own photos to the right places on the site (homepage, location, Products, experiences, or posts).",
    arguments: [],
  },
  {
    name: "finish_my_site_setup",
    description: "Check what's still missing from the site and guide the user through finishing setup, one step at a time.",
    arguments: [],
  },
  {
    name: "make_site_more_bookable",
    description: "Review calls-to-action, contact info, and reservation/experience setup, and suggest changes to get more bookings.",
    arguments: [],
  },
  {
    name: "make_my_site_look_better",
    description: "General visual/content review of the site with concrete suggestions the user can approve one at a time.",
    arguments: [],
  },
  {
    name: "grow_my_bookings",
    description: "Look at traffic, listing completeness, and booking/reservation demand together, and suggest the highest-impact next move to get more bookings this week.",
    arguments: [],
  },
];

function requireArg(args: Record<string, string>, name: string): string {
  const value = args[name];
  if (!value || !value.trim()) {
    throw mcpProtocolError(MCP_ERROR.invalidParams, `Argument "${name}" is required for this prompt.`);
  }
  return value.trim();
}

export function renderMcpPrompt(name: string, args: Record<string, string>): { description: string; text: string } {
  switch (name) {
    case "onboard_new_site": {
      const mapsUrl = requireArg(args, "maps_url");
      return {
        description: `Onboard a new site from ${mapsUrl}`,
        text: [
          `Call import_from_maps with maps_url "${mapsUrl}" to pull in the business details.`,
          "Ask for the required missing context: what the main CTA button should say (e.g. \"Book Now\"), and whether they want to upload a hero image or have AI generate one — follow the existing image-work rules for whichever they choose.",
          "Ask the optional questions too (short business story, logo upload), but let the user skip either.",
          "Do not ask about Products, detailed services, or social links yet — those come later, after the site is live.",
          "Once the required context is in hand, call create_site, then create_location, then call set_workspace_context so the new site becomes the active context for the rest of the conversation.",
          "Say \"Working with [site name].\" once the site is confirmed.",
        ].join(" "),
      };
    }
    case "set_up_products": {
      const itemsDescription = requireArg(args, "items_description");
      return {
        description: "Build out Products from a description",
        text: [
          "Call get_workspace_context and list_locations, then use the explicit location_id selected by the user.",
          "Call every list_location_products page before deciding whether this is a create or reconciliation.",
          "Call list_product_categories for that location. Match the user's section names to category records, call create_product_category for any new section, and use the returned category_id in every Product write. Product reads return category as an object; do not send a category string. Use move_products for category membership changes, reorder_products with every Product ID in one category for item order, and reorder_product_categories with every category ID at the location for section order.",
          `Parse the following into individual Products (name, category, and description where given). Every row must include price: a nested Price object with integer amount_minor for a fixed amount, or price: null only when the source explicitly states there is no fixed amount (e.g. "Market Price", "Ask Staff") — copy that exact wording into a details entry with key "price-note". Fixed Prices use the site's default currency unless currency is supplied, and default to unit "item" and tax_behavior "unspecified". If an item's price is simply missing, unclear, or not mentioned at all, do not assume price: null and do not invent a price or a note — ask the user for that item's price instead. Then call batch_create_products for entirely new Products or sync_products for mixed create/update work: ${itemsDescription}`,
          "If the user has photos or videos, offer to attach them after creation. Use set_media with { owner_type: 'product', owner_id: <exact Product id>, slot: 'image' } for the explicit primary and attach_media with slot 'gallery' for detail-gallery assets.",
          "Report the Products that were created or updated.",
        ].join(" "),
      };
    }
    case "create_and_publish_post": {
      const body = requireArg(args, "body");
      const postType = args.post_type?.trim();
      const channels = args.channels?.trim();
      return {
        description: "Create and publish a post",
        text: [
          `Call create_post with this body: ${body}`,
          postType ? `Use post_type "${postType}".` : "",
          "If the user has supplied or approved media for this post, create the post first, then use set_media with placement { owner_type: 'post', owner_id: <exact post id>, slot: 'cover' } for the selected cover asset.",
          channels
            ? `If media is supplied or approved, call publish_post with channels [${channels}] only after set_media succeeds; otherwise immediately after create_post succeeds. Do not stop to describe the publish step instead of executing it.`
            : "If media is supplied or approved, call publish_post only after set_media succeeds; otherwise immediately after create_post succeeds. publish_post defaults to the site channel. Do not stop to describe the publish step instead of executing it.",
          "Report back the post id, the live view URL, and which channels it published to.",
        ].filter(Boolean).join(" "),
      };
    }
    case "set_up_experience": {
      const description = requireArg(args, "description");
      return {
        description: "Create a new bookable experience",
        text: [
          `Based on this description, call create_experience with a sensible title, tagline, body, and any nested Price, duration_minutes, max_capacity, or time_slots that are implied or stated: ${description}`,
          "Use active only when the user has approved making the experience public; otherwise use inactive.",
          "If the user has media ready, call attach_media once per asset after creation with placement { owner_type: 'experience', owner_id: <exact experience id>, slot: 'gallery' }, then use reorder_media only if the requested order differs.",
          "Report back what was created, its current status, and the live URL when one is available.",
        ].join(" "),
      };
    }
    case "triage_inbox": {
      return {
        description: "Summarize what's new across contact, reservations, bookings, and unreplied reviews",
        text: [
          "Call get_contact_inquiries for site-level contact messages, get_reservation_inquiries with location_id when the site has multiple locations, and list_all_experience_bookings for experience bookings across the whole site; summarize only pending experience bookings from that last result.",
          "Call list_locations, then list_location_reviews for each location, and pull out any review that has no owner reply yet.",
          "Summarize what's new, grouped by type (messages, reservations, bookings, reviews needing a reply), oldest first.",
          "For pending experience bookings only, update_experience_booking exists to confirm or decline — offer to do that with the user's explicit approval for each one, don't act unilaterally.",
          "For unreplied reviews, offer to compose a reply for any the user wants to answer now, and call reply_to_review only after they approve the exact wording.",
          "There is no tool on this connection to reply to or change the status of contact or reservation submissions — for those, tell the user what's waiting and point them to the dashboard inbox and reservations pages to respond. Do not attempt to call a tool that doesn't exist for this.",
        ].join(" "),
      };
    }
    case "improve_my_homepage": {
      return {
        description: "Review the homepage and suggest top improvements",
        text: [
          "Call get_workspace_context to confirm the active site, then call list_tenant_pages and resolve the page whose path is \"/\", call get_tenant_page with that variant id to see the current homepage content, and get_site_media_assets to see what photos are already available.",
          "Look at the main photo at the top of the page (the hero/cover photo), the headline and call-to-action button text, and the story section photo and text.",
          "Suggest 2-3 concrete, highest-impact changes — for example a stronger call-to-action, a better main photo, or a punchier headline. Explain each suggestion in plain language, not in terms of field names.",
          "Ask the user which suggestion to act on first rather than changing everything at once. After confirmation, use set_media for a single hero/image placement, or attach_media/remove_media/reorder_media for a gallery. Apply copy/text suggestions with update_tenant_page without resubmitting media arrays.",
        ].join(" "),
      };
    }
    case "add_photos_to_site": {
      return {
        description: "Add the user's own photos to the right places on the site",
        text: [
          "If the user hasn't already attached photos in this conversation, ask them to attach the photos they want to add directly in ChatGPT.",
          "For each attached photo, inspect it visually first, then ask the user (or infer from context) where it should go: the homepage main photo, a specific location's main photo, the about/story section, a Product, an experience, or a post.",
          "Confirm the target site and placement with the user before uploading anything.",
          "After confirmation, call upload_user_media exactly once for each confirmed attachment with file set to its resolved ChatGPT file reference. Upload every confirmed photo before reporting any of them as placed. Use set_media with asset_id for a single cover/hero/logo placement; use attach_media once per new asset for a gallery or document list, and reorder_media only when needed. Always use the exact owner id returned by a read tool. Never switch to a bare file_id or invent a download URL.",
          "Reply confirming exactly where each photo was placed.",
        ].join(" "),
      };
    }
    case "finish_my_site_setup": {
      return {
        description: "Check what's missing and guide the user through finishing setup",
        text: [
          "Call get_workspace_context first. If there is no active site yet, call list_sites and help the user pick or create one before continuing.",
          "Check what's in place: call get_site_media_assets (kind=\"image\") to see available photos, call list_tenant_pages and get_tenant_page for the variants whose paths are \"/\" and \"/about\", call list_locations, then call every list_location_products page for each relevant location or list_experiences as appropriate.",
          "Identify the single most important missing piece — a main photo, Products or experiences, the about/story text, or a first post — and ask the user if they want to work on that now.",
          "Guide them through completing just that one thing at a time. Don't ask for everything up front.",
        ].join(" "),
      };
    }
    case "make_site_more_bookable": {
      return {
        description: "Review CTAs, contact info, and booking setup, and suggest changes to get more bookings",
        text: [
          "Call get_workspace_context, then call list_tenant_pages and get_tenant_page for the variant whose path is \"/\" to check the call-to-action button text, and list_locations to check whether contact info and hours are filled in.",
          "If the business takes reservations or bookings, check list_location_products for the explicit location and list_experiences to make sure offerings have clear prices and descriptions.",
          "Suggest concrete changes that make it easier for a visitor to take action — a clearer call-to-action, visible contact info, or more complete Product/experience listings. Explain suggestions in plain language.",
          "Apply changes only after the user approves each one.",
        ].join(" "),
      };
    }
    case "make_my_site_look_better": {
      return {
        description: "General visual and content review with concrete suggestions",
        text: [
          "Call get_workspace_context, then call list_tenant_pages and get_tenant_page for the variant whose path is \"/\", plus get_site_media_assets, to see current photos and text.",
          "Review the main photo, headline, story section, and overall completeness. Note anything that looks unfinished, generic, or low-quality (e.g. a missing or blurry main photo, thin story text, no Products or experiences).",
          "Suggest specific, actionable improvements in plain language — avoid internal field names. Offer to act on one at a time, starting with whichever has the biggest visual impact (usually the main photo).",
          "Only make changes the user has explicitly approved.",
        ].join(" "),
      };
    }
    case "grow_my_bookings": {
      return {
        description: "Combine traffic, listing completeness, and booking demand into one concrete next move",
        text: [
          "Call get_workspace_context, then get_site_analytics for the last 30 days to see traffic, top pages, and whether traffic is up or down versus the prior period.",
          "Call list_locations and every relevant list_location_products page, or list_experiences when appropriate, to check whether offerings have clear pricing, descriptions, and availability. Call list_all_experience_bookings and get_reservation_inquiries to see current demand and whether anything is sitting unconfirmed or unanswered.",
          "Cross-reference the three: if traffic is healthy but the listing is thin or bookings are stalling unconfirmed, say so explicitly — don't treat these as separate topics.",
          "Suggest exactly one highest-impact next move, not a list — for example confirming stalled bookings, completing a thin listing, or publishing a post about a specific under-booked experience. Explain it in plain language tied to what you actually found in the data.",
          "Ask the user to confirm before doing anything. If they approve a post, use create_post; if they approve a listing fix, use update_product, update_experience, or set_media as appropriate. Do not change pricing or availability without explicit approval.",
        ].join(" "),
      };
    }
    default:
      throw mcpProtocolError(MCP_ERROR.invalidParams, `Unknown prompt: ${name}`);
  }
}
