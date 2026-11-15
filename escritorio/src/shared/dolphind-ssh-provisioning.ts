import type { DolphindManagedDeployResult } from './dolphind-managed-runtime'
import type { SshRepoReadoption, SshTargetCreateInput } from './ssh-types'

export type DolphindSshProvisioningIntent = Readonly<{
  requestId: string
  name: string
}>

// Why estos tres siguen acá aunque la base los sacó: son el contrato de «conectar una máquina en un
// paso» de Dolphin (preload y renderer). La base borró el módulo de main que los atendía; el preload
// ahora arma el mismo pedido con `ssh:addTarget` + `runtimeEnvironments:deployDolphind`.
export type DolphindSshProvisioningRequest = DolphindSshProvisioningIntent & {
  target: SshTargetCreateInput
}

export type DolphindSshPendingProvisioning = DolphindSshProvisioningIntent & {
  sshTargetId: string
}

export type DolphindSshProvisioningResult = DolphindSshPendingProvisioning & {
  repoReadoptions: SshRepoReadoption[]
  result: DolphindManagedDeployResult | { outcome: 'pending'; reason: string }
}
