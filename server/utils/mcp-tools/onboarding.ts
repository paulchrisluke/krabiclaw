import type { McpToolDefinition } from './shared'
import { fileReferenceObject, organizationTool } from './shared'

export const ONBOARDING_TOOLS: McpToolDefinition[] = [
  organizationTool({
      name: 'save_generated_image',
      description: 'Upload a base64-encoded image to Cloudflare Images and persist a media_asset record with a public URL. Use ONLY when you already have a raw base64 string (e.g. from an external API). For ChatGPT native image_generation output, use save_generated_image_file instead — passing image_generation_call.result base64 here will be blocked by safety checks.',
      domain: 'onboarding',
      minimumRole: 'admin',
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
  organizationTool({
      name: 'save_generated_image_file',
      description: 'Use this right after generating an AI photo for the user — "make me a photo", "create an image". Primary path for saving a ChatGPT natively-generated image to media storage with a public URL. After calling image_generation, pass the resulting image as attachment_id (a file reference). This avoids safety blocks that occur when raw base64 is passed to save_generated_image.',
      domain: 'onboarding',
      minimumRole: 'admin',
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
