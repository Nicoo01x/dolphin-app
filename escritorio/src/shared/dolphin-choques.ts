export type DolphinChoque = {
  a: string
  b: string
  archivos: string[]
}

export type DolphinChoquesRepo = {
  repoPath: string
  repoName: string
  choques: DolphinChoque[]
}

export type DolphinChoquesResult =
  | { disponible: false }
  | { disponible: true; repos: DolphinChoquesRepo[] }
