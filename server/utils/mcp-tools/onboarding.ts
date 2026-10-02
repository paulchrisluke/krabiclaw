import type { McpToolDefinition } from './shared'
import { fileReferenceObject, organizationTool } from './shared'

export const ONBOARDING_TOOLS: McpToolDefinition[] = [
  organizationTool({
      name: 'save_generated_image',
      description: "Save an existing base64-encoded generated image to the selected KrabiClaw site when the user requests it. Creates a media asset with a public URL; it does not assign or publish the image. Repeated calls may create duplicate assets. For an existing generated attachment, save_generated_image_file accepts its authorized file reference.",
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
      description: "Save an existing generated image attachment to the selected KrabiClaw site when the user requests saving it there. Accepts an authorized file reference and creates a media asset with a public URL; it does not assign or publish the image. Repeated calls may create duplicate assets.",
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
