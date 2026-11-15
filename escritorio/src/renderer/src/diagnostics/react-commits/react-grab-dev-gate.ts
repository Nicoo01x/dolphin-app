export type ReactGrabDevEnv = {
  readonly dev: boolean
  readonly enableFlag?: string
}

export function shouldEnableReactGrab(env: ReactGrabDevEnv): boolean {
  // Why: React Grab lays a full-window overlay with its own floating toolbar and guide lines over
  // the app. In `pnpm dev` that is what Nico sees, so it read as broken UI: it stays off unless a
  // developer opts in with VITE_ENABLE_REACT_GRAB=true.
  return env.dev && env.enableFlag === 'true'
}
