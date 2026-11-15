export type DolphinBucleMotivo = 'herramienta-repetida' | 'tests-fallando'

export type DolphinBucleAviso = {
  id: string
  paneKey: string
  tabId?: string
  worktreeId?: string
  agentType?: string
  toolName: string
  repeticiones: number
  motivo: DolphinBucleMotivo
}

export type DolphinBucleEvento =
  | { tipo: 'detectado'; aviso: DolphinBucleAviso }
  | { tipo: 'desarmado'; paneKey: string }
