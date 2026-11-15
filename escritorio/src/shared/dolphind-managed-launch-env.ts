/** Managed launches alone enable idle exit and name the activation fence that keeps updates/rollbacks alive.
 * Dependency-free so the dolphind launcher can read it. */
export const DOLPHIND_MANAGED_ACTIVATION_ROOT_ENV = 'DOLPHIN_DOLPHIND_MANAGED_ACTIVATION_ROOT'

/** Host login env naming a machine's own managed-server data on a shared home; clones copy /etc/machine-id. */
export const DOLPHIN_MACHINE_NAME_ENV = 'DOLPHIN_MACHINE_NAME'
