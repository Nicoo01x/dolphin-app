import type { ManagedDolphindPreloadApi } from '../../../../../preload/api/managed-dolphind-api'
import { isWebClientLocation } from '@/app-shell/platform/web-client-location'

/** Web fallback stubs cannot manage SSH hosts. */
export function getManagedDolphindApi(): ManagedDolphindPreloadApi | undefined {
  return isWebClientLocation() ? undefined : window.api.runtimeEnvironments.managedDolphind
}
