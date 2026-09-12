import type { McpToolDefinition } from './shared'
import { fileReferenceObject, generatedImagePickerOutputSchema, globalTool, siteTool, withToolAnnotations } from './shared'

export const ONBOARDING_TOOLS: McpToolDefinition[] = [
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
      description: 'Upload a base64-encoded image to Cloudflare Images and persist a media_asset record with a public URL. Use ONLY when you already have a raw base64 string (e.g. from an external API). For ChatGPT native image_generation output, use save_generated_image_file instead — passing image_generation_call.result base64 here will be blocked by safety checks.',
      domain: 'onboarding',
      minimumRole: 'editor',
      confirmRequired: false,
      inputSchema: {
        image_data_base64: { type: 'string', description: 'Raw base64 image bytes or a base64 data URL already available from an external source; use save_generated_image_file for a native ChatGPT generated attachment.' },
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
      description: 'Use this right after generating an AI photo for the user — "make me a photo", "create an image". Primary path for saving a ChatGPT natively-generated image to media storage with a public URL. After calling image_generation, pass the resulting image as attachment_id (a file reference). This avoids safety blocks that occur when raw base64 is passed to save_generated_image.',
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
]
