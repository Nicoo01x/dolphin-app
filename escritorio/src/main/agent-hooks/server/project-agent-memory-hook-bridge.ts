import type { ServerResponse } from 'node:http'
import {
  buildProjectMemoryHookResponse,
  type ProjectAgentMemoryOptions
} from '../project-agent-memory'

export class ProjectAgentMemoryHookBridge {
  private options: ProjectAgentMemoryOptions | null = null
  private readonly sentBySession = new Set<string>()

  setOptions(options: ProjectAgentMemoryOptions | null): void {
    this.options = options
    this.sentBySession.clear()
  }

  clear(): void {
    this.sentBySession.clear()
  }

  /** Nunca rechaza: el server lo arranca antes de tiempo y una falla de la memoria no rompe el hook. */
  async buildResponse(source: string, body: unknown): Promise<string> {
    if (!this.options || (source !== 'claude' && source !== 'gemini')) {
      return ''
    }
    try {
      const startedAt = Date.now()
      const response = await buildProjectMemoryHookResponse(
        source,
        body,
        this.options,
        this.sentBySession
      )
      return Date.now() - startedAt <= 300 ? response : ''
    } catch {
      return ''
    }
  }
}

export function sendProjectMemoryHookResponse(res: ServerResponse, response: string): void {
  if (response) {
    res.writeHead(200, { 'content-type': 'application/json' })
    res.end(response)
    return
  }
  res.writeHead(204)
  res.end()
}
