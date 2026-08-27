import type { McpToolDefinition } from './shared'
import { fileReferenceObject, generatedImagePickerOutputSchema, globalTool, siteTool, withToolAnnotations } from './shared'

export const ONBOARDING_TOOLS: McpToolDefinition[] = [
  globalTool(withToolAnnotations({
      name: 'import_from_maps',
      description: 'Import business details from a Google Maps URL or share link. Call this when the user provides a Maps URL during site creation. Media is added only after the site exists through the canonical media asset tools.',
      domain: 'onboarding',
      minimumRole: 'editor',
      confirmRequired: false,
      inputSchema: {
        type: 'object',
        properties: {
          maps_url: { type: 'string', description: 'Google Maps URL or short share link (maps.app.goo.gl or google.com/maps/place/...).' },
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
        },
        required: ['business'],
      },
    })),
  globalTool(withToolAnnotations({
      name: 'show_generated_images',
      description: 'Use this after generating AI photos for the user to pick from. First persist each image, then pass the returned asset_id and public_url. To assign the selection, build placement from the target entity type and id.',
      domain: 'onboarding',
      minimumRole: 'editor',
      confirmRequired: false,
      inputSchema: {
        type: 'object',
        properties: {
          images: {
            type: 'array',
            description: 'Array of { asset_id, public_url } returned by save_generated_image or save_generated_image_file.',
            items: { type: 'object', properties: { asset_id: { type: 'string' }, public_url: { type: 'string' } }, required: ['asset_id', 'public_url'], additionalProperties: false },
          },
          placement: {
            type: 'object',
            additionalProperties: false,
            properties: { owner_type: { type: 'string' }, owner_id: { type: 'string' }, slot: { type: 'string' } },
            required: ['owner_type', 'owner_id', 'slot'],
          },
          site_id: { type: 'string', description: 'Required with placement.' },
          title: { type: 'string', description: 'Optional title override.' },
          subtitle: { type: 'string', description: 'Optional subtitle override.' },
          use_label: { type: 'string', description: 'Optional label for the primary button.' },
          regenerate_label: { type: 'string', description: 'Optional label for the secondary button.' },
        },
        required: ['images'],
        dependentRequired: { placement: ['site_id'] },
        additionalProperties: false,
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
          asset_id: { type: 'string' },
          public_url: { type: 'string' },
          thumbnail_url: { type: 'string' },
        },
        required: ['asset_id', 'public_url'],
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
          asset_id: { type: 'string' },
          public_url: { type: 'string' },
          thumbnail_url: { type: 'string' },
        },
        required: ['asset_id', 'public_url'],
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
        },
        required: ['site', 'pages'],
      },
    }),
]
