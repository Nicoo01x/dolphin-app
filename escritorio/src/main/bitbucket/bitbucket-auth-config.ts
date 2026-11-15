import { Buffer } from 'node:buffer'
import { leerEnvDolphinNoVacio } from '../../shared/dolphin-env'

export const DEFAULT_API_BASE_URL = 'https://api.bitbucket.org/2.0'

export type BitbucketAuthConfig = {
  baseUrl: string
  accessToken: string | null
  email: string | null
  apiToken: string | null
}

export function envValue(name: string): string | null {
  return leerEnvDolphinNoVacio(name.replace(/^DOLPHIN_/, ''))
}

export function getEnvAuthConfig(): BitbucketAuthConfig {
  return {
    baseUrl: envValue('DOLPHIN_BITBUCKET_API_BASE_URL') ?? DEFAULT_API_BASE_URL,
    accessToken: envValue('DOLPHIN_BITBUCKET_ACCESS_TOKEN'),
    email: envValue('DOLPHIN_BITBUCKET_EMAIL'),
    apiToken: envValue('DOLPHIN_BITBUCKET_API_TOKEN')
  }
}

export function hasAuth(config: BitbucketAuthConfig): boolean {
  return Boolean(config.accessToken || (config.email && config.apiToken))
}

export function authHeaders(config: BitbucketAuthConfig): Record<string, string> {
  if (config.accessToken) {
    return { Authorization: `Bearer ${config.accessToken}` }
  }
  if (config.email && config.apiToken) {
    const encoded = Buffer.from(`${config.email}:${config.apiToken}`).toString('base64')
    return { Authorization: `Basic ${encoded}` }
  }
  return {}
}
