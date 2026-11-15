import { z } from 'zod'

/**
 * Por qué no se pudo: un código, que el renderer traduce al idioma de la app, y el detalle tal
 * cual. El detalle es la carpeta donde se buscó, la última línea de error de la consola o lo que
 * contestó Dolphin, que habla en castellano.
 */
export type DolphinFailureCode =
  /** No está dolphin-app, o le faltan sus dependencias. Detalle: dónde se buscó. */
  | 'not-found'
  /** La consola no está construida (`npm run ui:build`). */
  | 'not-built'
  /** Se cerró al arrancar. Detalle: el código y su última línea de error. */
  | 'exited'
  /** No contestó a tiempo. Detalle: cuántos segundos se esperó. */
  | 'timeout'
  /** No se pudo hablar con ella. Detalle: el error de la conexión. */
  | 'unreachable'
  /** Dolphin no lo aceptó. Detalle: su porqué. */
  | 'rejected'
  /** El pedido vino incompleto o de alguien que no es la ventana de la app. */
  | 'invalid-request'
  /** La carpeta no es un proyecto ni un worktree de la app. */
  | 'unknown-project'
  /** Ninguna anotación dice qué cambiar. */
  | 'nothing-to-send'

/** Lo que contesta el proceso principal cuando se le pide la consola de Dolphin de un repo. */
export type DolphinConsoleResult =
  | { ok: true; url: string }
  | { ok: false; code: DolphinFailureCode; detail?: string }

/** Pedir la consola de un repo. Lo validan el IPC y, por el tipo, el renderer. */
export const DolphinOpenConsoleRequestSchema = z.object({
  repoPath: z.string().min(1).max(4096)
})

/**
 * Un toque del modo live: el elemento que se tocó en el navegador y lo que se pidió cambiarle.
 * Es lo que recibe `POST /api/live` de la consola de Dolphin, más el repo donde sembrar. Trae
 * texto de una página cualquiera (su HTML, sus estilos): se acota antes de que salga del proceso,
 * y la consola lo vuelve a recortar al armar la tarea.
 */
export const DolphinLiveRequestSchema = z.object({
  repoPath: z.string().min(1).max(4096),
  pedido: z.string().trim().min(1).max(2000),
  elemento: z.object({
    url: z.string().max(2000).optional(),
    selector: z.string().max(1000).optional(),
    texto: z.string().max(2000).optional(),
    html: z.string().max(20_000).optional(),
    /** Archivo y línea, si el navegador los sabe. */
    fuente: z.string().max(500).optional(),
    estilos: z.record(z.string().max(80), z.string().max(300)).optional()
  })
})

export type DolphinLiveRequest = z.infer<typeof DolphinLiveRequestSchema>

/** Lo que contesta un toque: la URL de la consola (para ir a mirarlo) o por qué no se pudo. */
export type DolphinLiveResult = DolphinConsoleResult

export const DolphinPortonRevisionSchema = z.object({
  tarea: z.string().trim().min(1).max(20_000),
  escribio: z.string().trim().min(1).max(500).optional(),
  base: z.string().trim().min(1).max(4096).optional()
})

export type DolphinPortonRevision = z.infer<typeof DolphinPortonRevisionSchema>

/** Pasar la carpeta de una sesión por el portón de Dolphin (las fases del repo), o preguntar cómo va. */
export const DolphinPortonRequestSchema = z.object({
  repoPath: z.string().min(1).max(4096),
  revision: DolphinPortonRevisionSchema.optional()
})

/**
 * Una pasada del portón a mano, tal como la cuenta la consola de Dolphin (`/api/porton`), que habla
 * en castellano. Se valida al llegar: es la respuesta de otro proceso. Sin `hasta`, todavía corre; las
 * fases que quedan «esperando» al terminar no llegaron a correr porque una anterior falló.
 */
export const DolphinPortonRunSchema = z.object({
  desde: z.string(),
  hasta: z.string().optional(),
  fases: z
    .array(
      z.object({
        nombre: z.string().max(200),
        estado: z.enum(['esperando', 'corriendo', 'paso', 'fallo', 'salteada']),
        detalle: z.string().max(2_000).optional(),
        ms: z.number().nonnegative().optional()
      })
    )
    .max(50)
})

export type DolphinPortonRun = z.infer<typeof DolphinPortonRunSchema>

/** Cómo va el portón de una carpeta: si corre, y su última pasada (null si nunca pasó). */
export type DolphinPortonResult =
  | { ok: true; corriendo: boolean; pasada: DolphinPortonRun | null }
  | { ok: false; code: DolphinFailureCode; detail?: string }
