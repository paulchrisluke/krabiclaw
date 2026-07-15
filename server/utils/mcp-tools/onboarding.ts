import type { McpToolDefinition } from './shared'
import { chatgptFileInput, fileReferenceObject, generatedImagePickerOutputSchema, globalTool, siteTool, withToolAnnotations } from './shared'

export const ONBOARDING_TOOLS: McpToolDefinition[] = [
  globalTool(withToolAnnotations({
      name: 'import_from_maps',
      description: 'Import business details from a Google Maps URL or share link. Returns business info and photos. Call this when the user provides a Maps URL during site creation.',
      domain: 'onboarding',
      minimumRole: 'editor',
      confirmRequired: false,
      inputSchema: {
        type: 'object',
        properties: {
          maps_url: { type: 'string', description: 'Google Maps URL or short share link (maps.app.goo.gl or google.com/maps/place/...).' },
          parsed_hint: {
            type: 'object',
            description: 'Optional, non-authoritative hints from LLM URL parsing. Backend always re-extracts independently and logs divergence >1 km.',
            properties: {
              name_hint: { type: 'string' },
              lat: { type: 'number' },
              lng: { type: 'number' },
              feature_id: { type: 'string' },
              internal_id: { type: 'string' },
              expected_country: { type: 'string' },
              expected_region: { type: 'string' },
            },
            additionalProperties: false,
          },
          matching_policy: {
            type: 'object',
            description: 'Controls how strictly the backend validates the Places API result. Defaults to strict coordinate matching.',
            properties: {
              allow_name_only_fallback: { type: 'boolean', description: 'If false (default), reject when no coordinates are available to bias the search.' },
              require_coordinate_match: { type: 'boolean', description: 'If true (default), reject any Places result more than max_distance_km from URL coordinates.' },
              max_distance_km: { type: 'number', description: 'Rejection threshold in km. Default 5.' },
              prefer_backend_extraction: { type: 'boolean', description: 'If true (default), backend URL extraction takes precedence over parsed_hint.' },
            },
            additionalProperties: false,
          },
        },
        required: ['maps_url'],
        additionalProperties: false,
      },
      outputSchema: {
        type: 'object',
        properties: {
          business: {
            type: 'object',
            description: 'Parsed business details from Google Places.',
            properties: {
              name: { type: 'string' },
              address: { type: 'string' },
              phone: { type: ['string', 'null'] },
              hours: { type: 'array', items: { type: 'string' } },
              rating: { type: ['number', 'null'] },
              reviewCount: { type: ['number', 'null'] },
              placeId: { type: 'string' },
              mapsUrl: { type: 'string' },
            },
            required: ['name', 'address', 'placeId'],
          },
          photos: {
            type: 'array',
            description: 'Photos uploaded to Cloudflare Images. Up to 10.',
            items: {
              type: 'object',
              properties: {
                cfImageId: { type: 'string' },
                publicUrl: { type: 'string' },
              },
              required: ['cfImageId', 'publicUrl'],
            },
          },
          missingPhotos: { type: 'boolean', description: 'True if fewer than 3 photos were imported — prompt the user to upload their own.' },
        },
        required: ['business', 'photos', 'missingPhotos'],
      },
    })),
  globalTool(withToolAnnotations({
      name: 'show_generated_images',
      description: 'Use this after generating AI photos for the user to pick from — the picker for AI-generated images. First persist each image with save_generated_image or save_generated_image_file, then pass the resulting assetId and publicUrl here. Include target metadata when the selected image should be applied directly.',
      domain: 'onboarding',
      minimumRole: 'editor',
      confirmRequired: false,
      inputSchema: {
        type: 'object',
        properties: {
          images: {
            type: 'array',
            description: 'Array of { assetId, publicUrl } returned by save_generated_image or save_generated_image_file.',
            items: { type: 'object', properties: { assetId: { type: 'string' }, publicUrl: { type: 'string' } } },
          },
          target: {
            type: 'string',
            enum: ['logo', 'home_hero', 'about_story_image', 'home_story_image', 'location_hero', 'post_image', 'menu_item_image', 'experience_image'],
            description: 'Optional target that should be updated directly after the user selects an image.',
          },
          site_id: { type: 'string', description: 'Required with target. Site ID that owns the target content.' },
          location_id: { type: 'string' },
          post_id: { type: 'string' },
          menu_item_id: { type: 'string' },
          experience_id: { type: 'string' },
          title: { type: 'string', description: 'Optional title override.' },
          subtitle: { type: 'string', description: 'Optional subtitle override.' },
          use_label: { type: 'string', description: 'Optional label for the primary button.' },
          regenerate_label: { type: 'string', description: 'Optional label for the secondary button.' },
        },
        required: ['images'],
        additionalProperties: true,
      },
      outputSchema: generatedImagePickerOutputSchema,
    })),
  siteTool({
      name: 'save_generated_image',
      description: 'Upload a base64-encoded image to Cloudflare Images and persist a media_asset record. Use ONLY when you already have a raw base64 string (e.g. from an external API). For ChatGPT native image_generation output, use save_generated_image_file instead — passing image_generation_call.result base64 here will be blocked by safety checks.',
      domain: 'onboarding',
      minimumRole: 'editor',
      confirmRequired: false,
      inputSchema: {
        image_data_base64: { type: 'string', description: 'Base64-encoded image data from image_generation_call.result, or a base64 data URL.' },
        prompt: { type: 'string', description: 'The prompt used to generate the image (stored as alt text).' },
      },
      required: ['image_data_base64'],
      outputSchema: {
        type: 'object',
        properties: {
          assetId: { type: 'string' },
          publicUrl: { type: 'string' },
          thumbnailUrl: { type: 'string' },
        },
        required: ['assetId', 'publicUrl'],
      },
    }),
  siteTool({
      name: 'save_generated_image_file',
      description: 'Use this right after generating an AI photo for the user — "make me a photo", "create an image". Primary path for saving a ChatGPT natively-generated image. After calling image_generation, pass the resulting image as attachment_id (a file reference). This avoids safety blocks that occur when raw base64 is passed to save_generated_image.',
      domain: 'onboarding',
      minimumRole: 'editor',
      confirmRequired: false,
      inputSchema: {
        attachment_id: { ...fileReferenceObject, description: 'Authorized file reference supplied by ChatGPT for the generated image attachment.' },
        prompt: { type: 'string', description: 'The prompt used to generate the image (stored as alt text).' },
      },
      required: ['attachment_id'],
      fileParams: ['attachment_id'],
      outputSchema: {
        type: 'object',
        properties: {
          assetId: { type: 'string' },
          publicUrl: { type: 'string' },
          thumbnailUrl: { type: 'string' },
        },
        required: ['assetId', 'publicUrl'],
      },
    }),
  siteTool({
      name: 'upload_user_photo',
      description: 'Use this when the user wants to add their own photos or pictures to the site — "add photos", "upload my pictures", "use this image on my site". Image-only legacy path for a user-provided photo attached directly in the chat; upload_user_media is the newer generic path that also supports video. Only call this tool once the host has actually resolved a `file`/`file_id` value (this reliably happens for files sent through the explicit attach/paperclip control, not for an image the user merely pastes or drops inline into the message — you can see that image, but do not assume or invent a file/file_id value for it). This tool uploads the image into the site media library but does not place it on a page by itself. Do not send users to a KrabiClaw photo uploader or dashboard media-library upload from this MCP app. Do not pass raw local paths. Prefer the file argument over file_id when available. If you do not have a real resolved reference, call open_media_upload instead so the user can supply the image through the upload widget. After upload succeeds, immediately call the appropriate assignment tool such as set_home_hero_image, set_logo, set_about_story_image, set_home_story_image, set_location_hero_image, set_post_image, or set_experience_image. Do NOT use save_generated_image_file for user uploads; that tool is only for ChatGPT native image_generation output.',
      domain: 'onboarding',
      minimumRole: 'editor',
      confirmRequired: false,
      inputSchema: {
        file: chatgptFileInput,
        file_id: { type: 'string', description: 'Resolved file identifier for a user-uploaded image (e.g. file_abc123). Prefer this when the host can supply it directly.' },
        category: { type: 'string', enum: ['exterior', 'interior', 'food', 'menu', 'team', 'logo', 'blog', 'other'], description: 'What this photo will be used for.' },
        description: { type: 'string', description: 'Description of the photo (stored as alt text).' },
        oneOf: [
          { required: ['file'] },
          { required: ['file_id'] },
        ],
      },
      required: [],
      fileParams: ['file'],
      outputSchema: {
        type: 'object',
        properties: {
          assetId: { type: 'string' },
          publicUrl: { type: 'string' },
          thumbnailUrl: { type: 'string' },
          nextStep: { type: 'string' },
        },
        required: ['assetId', 'publicUrl'],
      },
    }),
  siteTool({
      name: 'show_site_preview',
      description: 'Show a preview of the site. Call after create_site + create_location succeed. Works before the site is publicly launched.',
      domain: 'onboarding',
      minimumRole: 'editor',
      confirmRequired: false,
      outputSchema: {
        type: 'object',
        properties: {
          site: {
            type: 'object',
            properties: {
              id: { type: 'string' },
              name: { type: 'string' },
              subdomain: { type: ['string', 'null'] },
              publicUrl: { type: 'string' },
              previewUrl: { type: 'string' },
            },
            required: ['id', 'publicUrl', 'previewUrl'],
          },
          pages: {
            type: 'array',
            description: 'Navigable pages shown in the preview tabs.',
            items: {
              type: 'object',
              properties: {
                label: { type: 'string' },
                path: { type: 'string' },
              },
              required: ['label', 'path'],
            },
          },
          ogImageUrl: { type: ['string', 'null'], description: 'Hero image URL for the OG preview.' },
        },
        required: ['site', 'pages'],
      },
    }),
]
