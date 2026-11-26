import type { LineasDelControl } from '../../shared/winforms/winforms-controls'
import type {
  WinFormsAnalisis,
  WinFormsMensaje
} from '../../shared/winforms/winforms-preview-types'

/** Dolphin, sólo escritorio en Windows: la vista previa de formularios WinForms. */
export type WinFormsApi = {
  analizar: (archivo: string) => Promise<WinFormsAnalisis>
  /** Varios .cs de una vez, para marcar formularios en el explorador. */
  clasificar: (archivos: string[]) => Promise<Record<string, 'formulario' | 'control' | null>>
  abrir: (pedido: {
    sesion: string
    archivo: string
    raiz: string | null
    ensamblado?: string | null
  }) => Promise<boolean>
  ordenar: (pedido: { sesion: string; orden: 'refrescar' | 'cerrar-dialogos' }) => Promise<void>
  cerrar: (pedido: { sesion: string }) => Promise<void>
  elegirEnsamblado: (desde: string | null) => Promise<string | null>
  ubicar: (pedido: { designer: string; nombre: string }) => Promise<LineasDelControl | null>
  alEvento: (callback: (mensaje: WinFormsMensaje) => void) => () => void
}
