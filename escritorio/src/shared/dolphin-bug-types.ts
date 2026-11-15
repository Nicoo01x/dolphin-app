export type DolphinBugRequest = {
  id: string
  repoPath: string
  que: string
  elemento: string
}

export type DolphinBugFailureCode = 'incomplete' | 'already-running' | 'dolphin-missing' | 'unknown'

export type DolphinBugAvance = {
  id: string
  linea: string
}

export type DolphinBugTerminado = {
  id: string
  codigo: number
  lineaFinal: string
  fallo?: { code: DolphinBugFailureCode; detail?: string }
}
