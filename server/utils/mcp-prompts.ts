import { mcpProtocolError, MCP_ERROR } from "~/server/utils/mcp-protocol";

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
    name: "set_up_menu",
    description: "Build out a menu from a free-text description of dishes, sections, and prices.",
    arguments: [
      { name: "items_description", description: "Free text describing the dishes, sections, and prices to add.", required: true },
      { name: "menu_name", description: "Name for the menu, if creating a new one.", required: false },
    ],
  },
  {
    name: "create_and_publish_post",
    description: "Create a post and publish it to the requested channels.",
    arguments: [
      { name: "body", description: "The post body text.", required: true },
      { name: "post_type", description: "standard, offer, event, or update. Defaults to standard.", required: false },
      { name: "channels", description: "Comma-separated channels: site, facebook, instagram, gmb. Defaults to site.", required: false },
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
    description: "Summarize new contact messages, reservation requests, and experience bookings awaiting action.",
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
          "Do not ask about menus, detailed services, or social links yet — those come later, after the site is live.",
          "Once the required context is in hand, call create_site, then create_location, then show_site_preview, then call set_workspace_context so the new site becomes the active context for the rest of the conversation.",
          "Say \"Working with [site name].\" once the site is confirmed.",
        ].join(" "),
      };
    }
    case "set_up_menu": {
      const itemsDescription = requireArg(args, "items_description");
      const menuName = args.menu_name?.trim();
      return {
        description: "Build out a menu from a description",
        text: [
          "Call list_menus first to see if a menu already exists for the active site/location.",
          menuName
            ? `If none exists, call create_menu with name "${menuName}".`
            : "If none exists, call create_menu with a sensible name based on the business.",
          `Parse the following into individual menu items (name, section, price, and description where given), then call add_menu_items_batch with all of them in one call rather than creating items one at a time: ${itemsDescription}`,
          "If the user has photos for any dish, offer to attach them with set_menu_item_image after the items are created — do not block creating the menu on having images.",
          "Report back the menu name and the items that were added.",
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
          "If the user has supplied or approved an image for this post, call set_post_image with it before publishing.",
          channels
            ? `Immediately after create_post succeeds, call publish_post with channels [${channels}] — do not stop to describe the publish step instead of executing it.`
            : "Immediately after create_post succeeds, call publish_post (defaults to the site channel) — do not stop to describe the publish step instead of executing it.",
          "Report back the post id and which channels it published to.",
        ].filter(Boolean).join(" "),
      };
    }
    case "set_up_experience": {
      const description = requireArg(args, "description");
      return {
        description: "Create a new bookable experience",
        text: [
          `Based on this description, call create_experience with a sensible title, tagline, body, and any of price_amount/duration_minutes/max_capacity/time_slots that are implied or stated: ${description}`,
          "Use a status appropriate to whether this should go live immediately or stay as a draft — ask the user if it's not obvious.",
          "If the user has an image ready, call set_experience_image after creation.",
          "Report back what was created and its current status.",
        ].join(" "),
      };
    }
    case "triage_inbox": {
      return {
        description: "Summarize what's new across contact, reservations, and bookings",
        text: [
          "Call get_contact_inquiries for site-level contact messages, get_reservation_inquiries with location_id when the site has multiple locations, and list_experience_bookings for pending experience bookings.",
          "Summarize what's new, grouped by type, oldest first.",
          "For pending experience bookings only, update_experience_booking exists to confirm or decline — offer to do that with the user's explicit approval for each one, don't act unilaterally.",
          "There is no tool on this connection to reply to or change the status of contact or reservation submissions — for those, tell the user what's waiting and point them to the dashboard inbox and reservations pages to respond. Do not attempt to call a tool that doesn't exist for this.",
        ].join(" "),
      };
    }
    default:
      throw mcpProtocolError(MCP_ERROR.invalidParams, `Unknown prompt: ${name}`);
  }
}
