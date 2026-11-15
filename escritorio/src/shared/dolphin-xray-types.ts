/**
 * Dolphin X-ray: señalar un control de cualquier app en pantalla y pasárselo al agente.
 * Lo que dice el ayudante nativo (native/xray-windows/xray.ps1), una línea JSON por evento.
 */

export type XrayRect = { x: number; y: number; width: number; height: number }

export type XrayElement = {
  name: string
  /** El tipo de control de UI Automation, en inglés (Button, Edit, MenuItem…). */
  role: string
  /** El mismo tipo en el idioma de Windows («botón»). */
  localizedRole: string
  automationId: string
  className: string
  helpText: string
  /** Vacío en un campo de contraseña: el ayudante nunca lo lee. */
  value: string
  enabled: boolean
  /** En píxeles físicos de pantalla. */
  rect: XrayRect
  /** Los ancestros con nombre, de la ventana hacia el control. */
  path: string[]
}

export type XrayApp = { pid: number; process: string; window: string; own: boolean }

export type XrayTarget = {
  point: { x: number; y: number }
  element: XrayElement | null
  app: XrayApp | null
  /** El recorte de pantalla (con contexto alrededor); vacío si no se pudo sacar. */
  crop: string
}

export type XrayEvent =
  | { type: 'ready' }
  | { type: 'error'; message: string }
  | { type: 'cancel' }
  | ({ type: 'hover' } & XrayTarget)
  | ({ type: 'pick' } & XrayTarget)

const texto = (valor: unknown): string => (typeof valor === 'string' ? valor : '')
const numero = (valor: unknown): number =>
  typeof valor === 'number' && Number.isFinite(valor) ? valor : 0

function leerRect(valor: unknown): XrayRect {
  const r = (valor && typeof valor === 'object' ? valor : {}) as Record<string, unknown>
  return { x: numero(r.x), y: numero(r.y), width: numero(r.width), height: numero(r.height) }
}

function leerElemento(valor: unknown): XrayElement | null {
  if (!valor || typeof valor !== 'object') {
    return null
  }
  const e = valor as Record<string, unknown>
  return {
    name: texto(e.name).trim(),
    role: texto(e.role),
    localizedRole: texto(e.localizedRole),
    automationId: texto(e.automationId),
    className: texto(e.className),
    helpText: texto(e.helpText),
    value: texto(e.value),
    enabled: e.enabled !== false,
    rect: leerRect(e.rect),
    path: Array.isArray(e.path) ? e.path.filter((p): p is string => typeof p === 'string') : []
  }
}

function leerApp(valor: unknown): XrayApp | null {
  if (!valor || typeof valor !== 'object') {
    return null
  }
  const a = valor as Record<string, unknown>
  return {
    pid: numero(a.pid),
    process: texto(a.process),
    window: texto(a.window).trim(),
    own: a.own === true
  }
}

/** Una línea del ayudante, o null si no es un evento que entendamos. */
export function leerEventoXray(linea: string): XrayEvent | null {
  let crudo: unknown
  try {
    crudo = JSON.parse(linea)
  } catch {
    return null
  }
  if (!crudo || typeof crudo !== 'object') {
    return null
  }
  const evento = crudo as Record<string, unknown>
  switch (evento.type) {
    case 'ready':
    case 'cancel':
      return { type: evento.type }
    case 'error':
      return { type: 'error', message: texto(evento.message) }
    case 'hover':
    case 'pick': {
      const punto = (evento.point ?? {}) as Record<string, unknown>
      return {
        type: evento.type,
        point: { x: numero(punto.x), y: numero(punto.y) },
        element: leerElemento(evento.element),
        app: leerApp(evento.app),
        crop: texto(evento.crop)
      }
    }
    default:
      return null
  }
}

/** Lo que se lee en la etiqueta de la capa: «botón · Guardar». */
export function etiquetaXray(target: XrayTarget): string {
  const elemento = target.element
  if (!elemento) {
    return target.app?.window || ''
  }
  const tipo = elemento.localizedRole || elemento.role
  const nombre = elemento.name || elemento.value || elemento.automationId
  return [tipo, nombre].filter(Boolean).join(' · ')
}

/** La referencia textual que recibe `dolphin bug --elemento`, sin mezclarle lo que viste. */
export function referenciaDeXray(target: XrayTarget): string {
  const lineas: string[] = []
  const app = target.app
  if (app) {
    lineas.push(`App: ${app.process || 'desconocida'}${app.window ? ` — ventana «${app.window}»` : ''}`)
  }
  const elemento = target.element
  if (elemento) {
    const rol = elemento.localizedRole || elemento.role || 'control'
    const nombre = elemento.name || elemento.value || elemento.automationId
    lineas.push(`Control: ${rol}${nombre ? ` «${nombre}»` : ''}`)
    if (elemento.value && elemento.value !== elemento.name) {
      lineas.push(`Texto o valor: ${elemento.value}`)
    }
    if (elemento.path.length > 0) {
      lineas.push(`Dónde: ${elemento.path.join(' › ')}`)
    }
  } else {
    lineas.push(`Punto: x=${target.point.x}, y=${target.point.y}`)
  }
  return lineas.join('\n')
}

/**
 * El texto que recibe el agente: qué app, qué control, dónde, y lo que pidió la persona.
 * Why tanto detalle: con el nombre solo, «Guardar» puede ser cualquiera de cinco botones; con el
 * camino, el id de automatización y el recorte, el agente lo encuentra en el código o en la UI.
 */
export function promptDeXray(target: XrayTarget, pedido: string): string {
  const lineas: string[] = ['[Dolphin X-ray] Te señalo un control en pantalla:']
  const app = target.app
  if (app) {
    const ventana = app.window ? ` — ventana «${app.window}»` : ''
    lineas.push(`- App: ${app.process || 'desconocida'}${ventana}`)
  }
  const e = target.element
  if (e) {
    const nombre = e.name ? ` «${e.name}»` : ''
    lineas.push(`- Control: ${e.localizedRole || e.role || 'control'}${nombre} (${e.role || '?'})`)
    const ids = [
      e.automationId ? `AutomationId ${e.automationId}` : '',
      e.className ? `clase ${e.className}` : ''
    ].filter(Boolean)
    if (ids.length > 0) {
      lineas.push(`- Identificación: ${ids.join(', ')}`)
    }
    if (e.path.length > 0) {
      lineas.push(`- Dónde: ${e.path.join(' › ')}`)
    }
    if (e.value) {
      lineas.push(`- Valor actual: ${e.value}`)
    }
    if (e.helpText) {
      lineas.push(`- Ayuda: ${e.helpText}`)
    }
    if (!e.enabled) {
      lineas.push('- Está deshabilitado')
    }
    const r = e.rect
    lineas.push(`- Posición en pantalla: x=${r.x}, y=${r.y}, ${r.width}×${r.height} px`)
  } else {
    lineas.push(`- Sin datos de accesibilidad: el punto x=${target.point.x}, y=${target.point.y}`)
  }
  if (target.crop) {
    lineas.push(`- Recorte de pantalla: ${target.crop}`)
  }
  const pedidoLimpio = pedido.trim()
  if (pedidoLimpio) {
    lineas.push('', pedidoLimpio)
  }
  return lineas.join('\n')
}
