import { createError, defineEventHandler, setResponseHeader } from 'h3'
import {
  DeploymentProvenanceError,
  readDeploymentProvenance,
} from '~/server/utils/deployment-provenance'

interface DeploymentRuntimeEnvironment {
  CF_VERSION_METADATA?: unknown
}

export default defineEventHandler((event) => {
  setResponseHeader(event, 'cache-control', 'no-store')
  const runtimeEnv = event.context.cloudflare?.env as DeploymentRuntimeEnvironment | undefined

  try {
    return readDeploymentProvenance(runtimeEnv?.CF_VERSION_METADATA)
  } catch (error) {
    if (error instanceof DeploymentProvenanceError) {
      throw createError({
        statusCode: 503,
        statusMessage: error.message,
        data: { code: error.code },
      })
    }
    throw error
  }
})
