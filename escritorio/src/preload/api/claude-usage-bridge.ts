import { ipcRenderer } from 'electron'
import { createUsageProviderApi } from '../usage-provider-api'
import type { PreloadApi } from '../api-types'
import type { ClaudeCostQuery, ClaudeUsageApi } from './agent-usage-api'

const baseApi = createUsageProviderApi(ipcRenderer, 'claudeUsage') satisfies ClaudeUsageApi

export const claudeUsageApi = {
  ...baseApi,
  estimateCost: (query: ClaudeCostQuery) => ipcRenderer.invoke('claudeUsage:estimateCost', query)
} satisfies PreloadApi['claudeUsage']
