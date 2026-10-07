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
    name: "set_up_products",
    description: "Build out Products from a free-text description of names, collections, and prices.",
    arguments: [
      { name: "items_description", description: "Free text describing the Products, collections, and prices to add.", required: true },
    ],
  },
  {
    name: "create_and_publish_post",
    description: "Create a short post, review its draft, and publish it to the destinations the user names.",
    arguments: [
      { name: "body", description: "The caption, as the user wants it read. Event dates, offers and codes are part of it.", required: true },
      { name: "destinations", description: "Where to publish, in the user's words: website, Facebook, Instagram, Discord, or several. Nothing is assumed.", required: true },
    ],
  },
  {
    name: "set_up_bookable_product",
    description: "Create a new bookable Product from a description.",
    arguments: [
      { name: "description", description: "What it is, including price/duration/capacity if known.", required: true },
    ],
  },
  {
    name: "triage_inbox",
    description: "Summarize contact messages, table reservations and reviews awaiting a reply.",
    arguments: [],
  },
  {
    name: "improve_my_homepage",
    description: "Review the homepage and suggest the highest-impact changes to make it look better and more inviting.",
    arguments: [],
  },
  {
    name: "add_photos_to_organization",
    description: "Add the user's own photos to the right places on the site (homepage, location, Products, or posts).",
    arguments: [],
  },
  {
    name: "finish_my_organization_setup",
    description: "Identify missing business facts and finish the requested site setup.",
    arguments: [],
  },
  {
    name: "make_organization_more_bookable",
    description: "Review calls-to-action, contact info, and reservation/booking setup, and suggest changes to get more bookings.",
    arguments: [],
  },
  {
    name: "make_my_organization_look_better",
    description: "Review the website and recommend concrete visual and content improvements.",
    arguments: [],
  },
  {
    name: "grow_my_bookings",
    description: "Look at traffic, listing completeness, and booking/reservation demand together, and suggest the highest-impact next move to get more bookings this week.",
    arguments: [],
  },
];

export function renderMcpPrompt(name: string, args: Record<string, string>): { description: string; text: string } {
  switch (name) {
    case "set_up_products": {
      const itemsDescription = args.items_description!;
      return {
        description: "Build out Products from a description",
        text: [
          `Update the catalog from: ${itemsDescription}`,
          'Resolve the business and location. Read its current products and sections before matching existing IDs.',
          'For a restaurant menu, use update_menu with the stated sections, item order and prices. For other products, use the corresponding creation or reconciliation operation.',
          'Ask for missing prices or booking facts. Read back the result and public URL before reporting completion.',
        ].join(' '),
      };
    }
    case "create_and_publish_post": {
      const body = args.body!;
      const destinations = args.destinations!;
      return {
        description: "Create and publish a post",
        text: [
          `Call create_post with a new idempotency_key and this body: ${body}`,
          "If the user supplied or approved media, pass it as create_post media in the order they want it shown: the cover first, then the gallery.",
          `Publish only to: ${destinations}. For Facebook, Instagram or Discord, call get_social_connections and use the exact target_id and connection_revision it returns; if the destination is not connected or has a problem, say so instead of publishing elsewhere.`,
          "Show the user the draft's preview_url, then call publish_post with the post's updated_at as expected_updated_at and one target per named destination.",
          "Report each outcome exactly as returned. processing means call publish_post again later to finish the same post; unknown means use reconcile_post_publication, never publish again.",
        ].join(" "),
      };
    }
    case "set_up_bookable_product": {
      const description = args.description!;
      return {
        description: "Create a new bookable Product",
        text: [
          `Create a bookable offering from: ${description}`,
          'Resolve the business and location or online scope. Ask for missing price, duration, capacity, seating times, confirmation and payment choices.',
          'Use create_product with booking setup and one idempotency key. Preserve the supplied facts and attach supplied media to the returned product ID.',
          'Read back booking_readiness, availability and the public URL before reporting completion.',
        ].join(' '),
      };
    }
    case "triage_inbox": {
      return {
        description: "Summarize what's new across contact messages, reservations, and unreplied reviews",
        text: [
          'Read all relevant list_guest_conversations pages and get_guest_conversation for full messages, booking details and delivery receipts.',
          'Summarize unanswered messages and pending bookings. Use reply_to_guest or the corresponding booking operation for actions the user requests.',
          'Read location reviews separately; provider reviews and imported Google Q&A remain managed in Google.',
          'Report failed deliveries and actions awaiting guest acceptance accurately.',
        ].join(' '),
      };
    }
    case "improve_my_homepage": {
      return {
        description: "Review the homepage",
        text: "Read the homepage, its media and public preview. Recommend the most useful improvements in plain language. Apply the changes the user requests and read back the public result.",
      };
    }
    case "add_photos_to_organization": {
      return {
        description: "Place supplied photos",
        text: "Inspect the supplied photos and resolve their intended placement from the request. Ask only about an ambiguous destination. Save each attachment with a stable idempotency key and its placement, then read back the actual media and public result.",
      };
    }
    case "finish_my_organization_setup": {
      return {
        description: "Finish business setup",
        text: "Read the business, locations, public pages and catalog. Identify the facts missing from the requested website, menu and booking workflows. Ask for those facts, complete the requested setup and verify its public result.",
      };
    }
    case "make_organization_more_bookable": {
      return {
        description: "Review guest booking",
        text: "Read the public offering and its booking readiness, sessions, location hours and reservation policy. Identify what prevents guests from booking. Ask for missing business facts and complete the changes the user requests.",
      };
    }
    case "make_my_organization_look_better": {
      return {
        description: "Review the website",
        text: "Read the public pages, media and catalog. Recommend specific improvements using the actual content. Apply the changes the user requests and verify the public result.",
      };
    }
    case "grow_my_bookings": {
      return {
        description: "Review booking demand",
        text: "Read recent traffic, bookable offerings, availability and guest conversations. Recommend the most useful action supported by those records. Complete the action the user requests and report its actual outcome.",
      };
    }
    default:
      throw mcpProtocolError(MCP_ERROR.invalidParams, `Unknown prompt: ${name}`);
  }
}
