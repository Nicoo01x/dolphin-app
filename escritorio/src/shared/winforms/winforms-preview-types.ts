/**
 * Vista previa de formularios WinForms: lo que se cuentan main, el host nativo
 * (native/winforms-host/DolphinFormHost.cs) y la pestaña del renderer.
 */

/** Un control del formulario, en píxeles del cuadro (el PNG), con origen arriba a la izquierda. */
export type WinFormsControl = {
  id: number
  /** -1 si cuelga directo del formulario. */
  padre: number
  nivel: number
  /** El Name del diseñador; vacío en controles creados por código sin nombre. */
  nombre: string
  /** El tipo completo (DevExpress.XtraEditors.SimpleButton). */
  tipo: string
  texto: string
  x: number
  y: number
  w: number
  h: number
}

export type WinFormsFase = 'cargando-ensamblado' | 'creando-formulario' | 'mostrando'

/** Por qué no se pudo abrir: cada código tiene un texto propio en la pestaña. */
export type WinFormsCodigoDeError =
  | 'uso'
  | 'sin-ensamblado'
  | 'no-es-net'
  | 'arquitectura'
  | 'ensamblado'
  | 'dependencia'
  | 'tipo-no-encontrado'
  | 'no-es-formulario'
  | 'sin-constructor'
  | 'constructor'
  | 'excepcion'
  | 'dominio'
  | 'host'
  | 'sin-build'
  | 'sin-proyecto'
  | 'no-es-windows'

export type WinFormsEventoDelHost =
  | { evento: 'fase'; fase: WinFormsFase }
  | {
      evento: 'listo'
      pid: number
      titulo: string
      clase: string
      arquitectura: 'x86' | 'x64'
      clr: string
    }
  | { evento: 'cuadro'; ancho: number; alto: number; titulo: string; png: string }
  | { evento: 'controles'; ancho: number; alto: number; controles: WinFormsControl[] }
  | { evento: 'dialogo'; titulo: string; texto: string }
  | { evento: 'aviso'; mensaje: string; detalle?: string }
  | { evento: 'error'; codigo: WinFormsCodigoDeError; mensaje: string; detalle?: string }
  | { evento: 'cerrado' }

/** Un build donde puede estar el formulario. */
export type WinFormsBuild = {
  ruta: string
  /** ms desde epoch. */
  modificado: number
  /** De dónde salió: la salida del .csproj o una copia encontrada en el repositorio. */
  origen: 'proyecto' | 'repositorio' | 'elegido'
}

/** Lo que main sabe del formulario antes de lanzar el host. */
export type WinFormsPlan = {
  archivo: string
  designer: string | null
  clase: string
  nombreCompleto: string
  tipo: 'formulario' | 'control'
  proyecto: string | null
  ensambladoEsperado: string | null
  builds: WinFormsBuild[]
}

/** Lo que main le cuenta a la pestaña además de los eventos del host. */
export type WinFormsEventoDeSesion =
  | { evento: 'plan'; plan: WinFormsPlan }
  | {
      evento: 'build'
      build: WinFormsBuild
      arquitectura: 'x86' | 'x64'
      /** El .cs o el .Designer.cs cambiaron después de este build. */
      desactualizado: { fuente: string; modificado: number } | null
      intento: number
    }
  | { evento: 'descartado'; build: WinFormsBuild; motivo: string }
  | { evento: 'compilando-host' }
  | WinFormsEventoDelHost

export type WinFormsMensaje = { sesion: string; evento: WinFormsEventoDeSesion }

export type WinFormsAnalisis = {
  tipo: 'formulario' | 'control'
  clase: string
  nombreCompleto: string
  designer: string | null
} | null

export type WinFormsUbicacion = { archivo: string; linea: number; columna: number } | null

const texto = (valor: unknown): string => (typeof valor === 'string' ? valor : '')
const numero = (valor: unknown): number =>
  typeof valor === 'number' && Number.isFinite(valor) ? valor : 0

function leerControl(valor: unknown): WinFormsControl | null {
  if (!valor || typeof valor !== 'object') {
    return null
  }
  const c = valor as Record<string, unknown>
  return {
    id: numero(c.id),
    padre: typeof c.padre === 'number' ? c.padre : -1,
    nivel: numero(c.nivel),
    nombre: texto(c.nombre),
    tipo: texto(c.tipo),
    texto: texto(c.texto),
    x: numero(c.x),
    y: numero(c.y),
    w: numero(c.w),
    h: numero(c.h)
  }
}

/**
 * Los textos de un diálogo, legibles: sin el HTML que usan algunos (XtraMessageBox con <br>, <b>) ni
 * los '&' de las teclas de acceso, y sin los botones ("Cerrar", "Enviar...", "Mostrar detalle").
 */
export function textoDeDialogo(crudo: string): string {
  return crudo
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&(?=\w)/g, '')
    .split('\n')
    .map((linea) => linea.replace(/^[-\s]+/, '').trim())
    .filter((linea) => linea.length > 20)
    .join(' ')
}

const FASES: readonly WinFormsFase[] = ['cargando-ensamblado', 'creando-formulario', 'mostrando']

/** Una línea del host, validada; null si no es un evento conocido. */
export function leerEventoDelHost(linea: string): WinFormsEventoDelHost | null {
  let crudo: unknown
  try {
    crudo = JSON.parse(linea)
  } catch {
    return null
  }
  if (!crudo || typeof crudo !== 'object') {
    return null
  }
  const e = crudo as Record<string, unknown>
  switch (e.evento) {
    case 'fase':
      return FASES.includes(e.fase as WinFormsFase)
        ? { evento: 'fase', fase: e.fase as WinFormsFase }
        : null
    case 'listo':
      return {
        evento: 'listo',
        pid: numero(e.pid),
        titulo: texto(e.titulo),
        clase: texto(e.clase),
        arquitectura: e.arquitectura === 'x64' ? 'x64' : 'x86',
        clr: texto(e.clr)
      }
    case 'cuadro':
      return {
        evento: 'cuadro',
        ancho: numero(e.ancho),
        alto: numero(e.alto),
        titulo: texto(e.titulo),
        png: texto(e.png)
      }
    case 'controles':
      return {
        evento: 'controles',
        ancho: numero(e.ancho),
        alto: numero(e.alto),
        controles: (Array.isArray(e.controles) ? e.controles : [])
          .map(leerControl)
          .filter((c): c is WinFormsControl => c !== null)
      }
    case 'dialogo':
      return { evento: 'dialogo', titulo: texto(e.titulo), texto: textoDeDialogo(texto(e.texto)) }
    case 'aviso':
      return { evento: 'aviso', mensaje: texto(e.mensaje), detalle: texto(e.detalle) }
    case 'error':
      return {
        evento: 'error',
        codigo: (texto(e.codigo) || 'host') as WinFormsCodigoDeError,
        mensaje: texto(e.mensaje),
        detalle: texto(e.detalle)
      }
    case 'cerrado':
      return { evento: 'cerrado' }
    default:
      return null
  }
}
