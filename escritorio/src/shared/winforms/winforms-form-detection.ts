/**
 * ¿Este .cs es un formulario de WinForms? Se decide leyendo el código, sin compilar: la clase base
 * conocida (Form, XtraForm, RibbonForm…) alcanza casi siempre; con una base propia del proyecto
 * (XtraFormEditionBase, frmPivotTableBase…) decide el .Designer.cs, porque sólo un formulario
 * asigna `this.ClientSize` en InitializeComponent.
 */

export type FuenteWinForms = {
  tipo: 'formulario' | 'control'
  clase: string
  espacio: string
  nombreCompleto: string
  base: string
}

/** Bases que son formularios en WinForms y en las suites más comunes (DevExpress, Telerik…). */
const BASES_DE_FORMULARIO = new Set([
  'Form',
  'XtraForm',
  'RibbonForm',
  'SplashScreen',
  'WaitForm',
  'FluentDesignForm',
  'ToolbarForm',
  'DirectXForm',
  'XtraBaseForm',
  'RadForm',
  'ShapedForm',
  'MetroForm',
  'KryptonForm',
  'MaterialForm'
])

const BASES_DE_CONTROL = new Set(['UserControl', 'XtraUserControl', 'RadControl'])

/** Clases con diseñador que no son ventanas: reportes, componentes, DataSets. */
const BASES_QUE_NO_SON_VENTANAS = new Set([
  'XtraReport',
  'Component',
  'DataSet',
  'ApplicationSettingsBase',
  'Installer'
])

/** El código sin comentarios ni literales: lo que importa son las declaraciones. */
export function sinComentarios(codigo: string): string {
  let salida = ''
  let i = 0
  while (i < codigo.length) {
    const c = codigo[i]
    const siguiente = codigo[i + 1]
    if (c === '/' && siguiente === '/') {
      while (i < codigo.length && codigo[i] !== '\n') {
        i++
      }
      continue
    }
    if (c === '/' && siguiente === '*') {
      const fin = codigo.indexOf('*/', i + 2)
      const cierre = fin === -1 ? codigo.length : fin + 2
      // Los saltos se conservan para que los números de línea sigan valiendo.
      salida += codigo.slice(i, cierre).replace(/[^\n]/g, ' ')
      i = cierre
      continue
    }
    if (c === '"' || (c === '@' && siguiente === '"')) {
      const literal = c === '@'
      i += literal ? 2 : 1
      while (i < codigo.length) {
        if (!literal && codigo[i] === '\\') {
          i += 2
          continue
        }
        if (codigo[i] === '"') {
          if (literal && codigo[i + 1] === '"') {
            i += 2
            continue
          }
          break
        }
        i++
      }
      i++
      salida += '""'
      continue
    }
    if (c === "'") {
      const fin = codigo[i + 1] === '\\' ? codigo.indexOf("'", i + 3) : codigo.indexOf("'", i + 2)
      i = fin === -1 ? i + 1 : fin + 1
      salida += "' '"
      continue
    }
    salida += c
    i++
  }
  return salida
}

type Clase = { nombre: string; base: string; espacio: string }

/** Las clases declaradas, con su primera base y el namespace que las envuelve. */
export function clasesDeclaradas(codigo: string): Clase[] {
  const limpio = sinComentarios(codigo)
  const clases: Clase[] = []
  // Los namespaces abiertos, con la profundidad de llaves a la que cierran.
  const abiertos: { nombre: string; profundidad: number }[] = []
  let archivo = ''
  let profundidad = 0
  const patron =
    /\bnamespace\s+([\w.]+)\s*([;{])|\bclass\s+(\w+)\s*(?:<[^>{]*>)?\s*(?::\s*([\w.<>,\s]+?))?\s*(?:\{|\bwhere\b)|[{}]/g
  let m: RegExpExecArray | null
  while ((m = patron.exec(limpio)) !== null) {
    const token = m[0]
    if (token === '{') {
      profundidad++
      continue
    }
    if (token === '}') {
      profundidad--
      while ((abiertos.at(-1)?.profundidad ?? -1) > profundidad) {
        abiertos.pop()
      }
      continue
    }
    if (m[1]) {
      if (m[2] === ';') {
        archivo = m[1]
      } else {
        profundidad++
        abiertos.push({ nombre: m[1], profundidad })
      }
      continue
    }
    if (m[3]) {
      const espacio = [archivo, ...abiertos.map((a) => a.nombre)].filter(Boolean).join('.')
      const base = (m[4] ?? '').split(',')[0]?.trim().replace(/<.*$/, '') ?? ''
      clases.push({ nombre: m[3], base, espacio })
      if (token.endsWith('{')) {
        profundidad++
      }
    }
  }
  return clases
}

function ultimoSegmento(nombre: string): string {
  return nombre.slice(nombre.lastIndexOf('.') + 1)
}

function clasificarPorDesigner(designer: string | null): FuenteWinForms['tipo'] | null {
  if (!designer || !/\bInitializeComponent\s*\(/.test(designer)) {
    return null
  }
  const limpio = sinComentarios(designer)
  if (/\.Bands\.AddRange\b|\bXtraReport\b/.test(limpio)) {
    return null
  }
  if (/\bthis\.ClientSize\s*=/.test(limpio)) {
    return 'formulario'
  }
  if (/\bthis\.Size\s*=/.test(limpio) && /\bthis\.Name\s*=/.test(limpio)) {
    return 'control'
  }
  return null
}

function clasificarBase(base: string): FuenteWinForms['tipo'] | 'no' | null {
  const corto = ultimoSegmento(base)
  if (BASES_DE_FORMULARIO.has(corto)) {
    return 'formulario'
  }
  if (BASES_DE_CONTROL.has(corto)) {
    return 'control'
  }
  if (BASES_QUE_NO_SON_VENTANAS.has(corto)) {
    return 'no'
  }
  return null
}

/**
 * Analiza `Clase.cs` (y su `Clase.Designer.cs`, si hay). `nombreDeArchivo` elige la clase cuando el
 * archivo declara varias: la que se llama como el archivo.
 */
export function analizarFuenteWinForms(
  codigo: string,
  designer: string | null,
  nombreDeArchivo?: string
): FuenteWinForms | null {
  const esperado = nombreDeArchivo?.replace(/(\.Designer)?\.cs$/i, '')
  const clases = clasesDeclaradas(codigo)
  const delDesigner = designer ? clasesDeclaradas(designer) : []
  const clase =
    clases.find((c) => c.nombre === esperado) ??
    clases.find((c) => c.base) ??
    clases[0] ??
    delDesigner[0]
  if (!clase) {
    return null
  }
  // La base puede estar declarada sólo en la otra mitad de la clase parcial.
  const base =
    clase.base || delDesigner.find((c) => c.nombre === clase.nombre && c.base)?.base || ''
  const porBase = clasificarBase(base)
  if (porBase === 'no') {
    return null
  }
  const tipo =
    porBase ??
    clasificarPorDesigner(designer) ??
    (ultimoSegmento(base).endsWith('Form') ? 'formulario' : null)
  if (!tipo) {
    return null
  }
  return {
    tipo,
    clase: clase.nombre,
    espacio: clase.espacio,
    nombreCompleto: clase.espacio ? `${clase.espacio}.${clase.nombre}` : clase.nombre,
    base
  }
}

/** `C:\x\frmA.cs` → `C:\x\frmA.Designer.cs`; null si ya es el Designer o no es .cs. */
export function rutaDelDesigner(archivo: string): string | null {
  if (!/\.cs$/i.test(archivo) || /\.Designer\.cs$/i.test(archivo)) {
    return null
  }
  return archivo.replace(/\.cs$/i, '.Designer.cs')
}

/** `frmA.Designer.cs` → `frmA.cs`: la vista previa se abre siempre sobre el archivo principal. */
export function archivoPrincipal(archivo: string): string {
  return archivo.replace(/\.Designer\.cs$/i, '.cs')
}

/**
 * Para el explorador, que sólo tiene nombres: un `X.cs` con su `X.Designer.cs` al lado es candidato a
 * formulario (también lo son controles y reportes; el contenido decide después). `hermanos` va en
 * minúsculas: Visual Studio a veces escribe `X.designer.cs`.
 */
export function esCandidatoWinForms(nombre: string, hermanos: ReadonlySet<string>): boolean {
  if (!/\.cs$/i.test(nombre) || /\.Designer\.cs$/i.test(nombre)) {
    return false
  }
  return hermanos.has(nombre.replace(/\.cs$/i, '.designer.cs').toLowerCase())
}
