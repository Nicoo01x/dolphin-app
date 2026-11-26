import type { WinFormsControl } from './winforms-preview-types'

/**
 * El control que está bajo un punto del cuadro, como lo haría `Control.GetChildAtPoint`: se baja por
 * el árbol y, entre hermanos superpuestos, gana el primero (en WinForms, `Controls[0]` está arriba).
 */
export function controlEnPunto(
  controles: readonly WinFormsControl[],
  x: number,
  y: number
): WinFormsControl | null {
  const hijos = new Map<number, WinFormsControl[]>()
  for (const control of controles) {
    const lista = hijos.get(control.padre)
    if (lista) {
      lista.push(control)
    } else {
      hijos.set(control.padre, [control])
    }
  }
  const contiene = (c: WinFormsControl): boolean =>
    c.w > 0 && c.h > 0 && x >= c.x && y >= c.y && x < c.x + c.w && y < c.y + c.h
  let actual: WinFormsControl | null = null
  let nivel = hijos.get(-1) ?? []
  for (;;) {
    const debajo = nivel.find(contiene)
    if (!debajo) {
      return actual
    }
    actual = debajo
    nivel = hijos.get(debajo.id) ?? []
  }
}

/** Los nombres desde el formulario hasta el control: «panelControl1 › btnGuardar». */
export function caminoDelControl(controles: readonly WinFormsControl[], id: number): string[] {
  const porId = new Map(controles.map((c) => [c.id, c]))
  const camino: string[] = []
  let actual = porId.get(id)
  // El tope evita un ciclo si el host mandara un mapa roto.
  for (let paso = 0; actual && paso < 64; paso++) {
    camino.unshift(actual.nombre || tipoCorto(actual.tipo))
    actual = porId.get(actual.padre)
  }
  return camino
}

export function tipoCorto(tipo: string): string {
  return tipo.slice(tipo.lastIndexOf('.') + 1)
}

export type LineasDelControl = {
  /** El campo: `private DevExpress.XtraEditors.SimpleButton btnGuardar;` (1-based). */
  declaracion: number | null
  /** Donde InitializeComponent lo configura: el bloque `// btnGuardar` o el primer `this.btnGuardar.`. */
  configuracion: number | null
}

const escapar = (s: string): string => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

/** Dónde vive un control en el .Designer.cs, para que la referencia lleve archivo y línea. */
export function lineasDelControl(designer: string, nombre: string): LineasDelControl {
  if (!/^\w+$/.test(nombre)) {
    return { declaracion: null, configuracion: null }
  }
  const lineas = designer.split(/\r?\n/)
  const n = escapar(nombre)
  const declaracion = new RegExp(
    `^\\s*(?:(?:private|protected|internal|public|readonly|static)\\s+)*[\\w.<>,\\s]+?\\s+${n}\\s*;`
  )
  const comentario = new RegExp(`^\\s*//\\s*${n}\\s*$`)
  const uso = new RegExp(`\\bthis\\.${n}\\.`)
  let lineaDeclaracion: number | null = null
  let lineaComentario: number | null = null
  let lineaUso: number | null = null
  lineas.forEach((linea, indice) => {
    if (lineaDeclaracion === null && declaracion.test(linea) && !linea.includes('=')) {
      lineaDeclaracion = indice + 1
    }
    if (lineaComentario === null && comentario.test(linea)) {
      lineaComentario = indice + 1
    }
    if (lineaUso === null && uso.test(linea)) {
      lineaUso = indice + 1
    }
  })
  return { declaracion: lineaDeclaracion, configuracion: lineaComentario ?? lineaUso }
}

export type ReferenciaDeControl = {
  control: WinFormsControl
  camino: string[]
  formulario: string
  titulo: string
  designer: string | null
  lineas: LineasDelControl
  /** El archivo relativo al worktree, si se puede; si no, la ruta completa. */
  designerVisible: string | null
}

/**
 * El texto que recibe el agente. Lleva lo necesario para encontrar el control en el código sin
 * adivinar: el nombre, el tipo, el archivo y la línea del diseñador, y dónde está en el formulario.
 */
export function referenciaDeControl(ref: ReferenciaDeControl): string {
  const c = ref.control
  const nombre = c.nombre || `(sin nombre, ${tipoCorto(c.tipo)})`
  const lineas = [
    `[WinForms] Control «${nombre}» del formulario ${ref.formulario}${ref.titulo ? ` («${ref.titulo}»)` : ''}`,
    `- Tipo: ${c.tipo}`
  ]
  if (c.texto && c.texto !== c.nombre) {
    lineas.push(`- Texto: ${c.texto}`)
  }
  if (ref.camino.length > 1) {
    lineas.push(`- Dónde: ${ref.camino.join(' › ')}`)
  }
  lineas.push(`- Tamaño: ${c.w}×${c.h} px, en x=${c.x}, y=${c.y} del formulario`)
  const archivo = ref.designerVisible ?? ref.designer
  if (archivo) {
    const linea = ref.lineas.declaracion ?? ref.lineas.configuracion
    lineas.push(`- Declarado en: ${archivo}${linea ? `:${linea}` : ''}`)
    if (ref.lineas.configuracion && ref.lineas.configuracion !== linea) {
      lineas.push(`- Configurado en: ${archivo}:${ref.lineas.configuracion}`)
    }
  }
  return lineas.join('\n')
}
