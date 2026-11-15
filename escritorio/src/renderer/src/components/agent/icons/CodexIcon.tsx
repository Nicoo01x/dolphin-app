import type React from 'react'
import { AGENT_FAVICON_ASSETS } from './agent-favicon-assets'

/**
 * The Codex agent's own app icon (OpenAI's blue-violet cloud with a prompt), bundled from
 * OpenAI's desktop app. Use it where the Codex agent is meant; the OpenAI knot (`OpenAIIcon`)
 * stays on the OpenAI account and usage surfaces.
 */
export function CodexIcon({
  size = 14,
  className
}: {
  size?: number
  className?: string
}): React.JSX.Element {
  return (
    <img
      src={AGENT_FAVICON_ASSETS.codex}
      width={size}
      height={size}
      className={className}
      alt=""
      aria-hidden
      draggable={false}
    />
  )
}
