import {
  MATERIAL_ICONO_POR_EXTENSION,
  MATERIAL_ICONO_POR_EXTENSION_CLARO,
  MATERIAL_ICONO_POR_NOMBRE,
  MATERIAL_ICONO_POR_NOMBRE_CLARO
} from './material-file-icon-table.generated'

/**
 * Los logos reales de cada lenguaje (Material Icon Theme, MIT), no una ficha con las letras.
 *
 * Nico, 25/11/2026: «los logos de los archivos por lenguaje son genéricos, no son los reales».
 * Un `.cs` lleva el logo de C#, un `.cpp` el de C++, un `.csproj` el de Visual Studio, igual que
 * en VS Code. Los SVG y la tabla los trae `config/scripts/file-icons/vendor-material-file-icons.mjs`.
 *
 * Se dibujan como los temas de plugins: UNA regla CSS por ícono y, en cada fila, sólo un atributo.
 * Un árbol de cinco mil archivos no repite cinco mil veces la misma imagen.
 */
export const ATRIBUTO_LOGO = 'data-logo-archivo'
export const ATRIBUTO_LOGO_CLARO = 'data-logo-archivo-claro'

export type LogoDeArchivo = { oscuro: string; claro: string }

function nombreDeArchivo(ruta: string): string {
  const barra = Math.max(ruta.lastIndexOf('/'), ruta.lastIndexOf('\\'))
  return (barra >= 0 ? ruta.slice(barra + 1) : ruta).toLowerCase()
}

/** El sufijo con puntos más largo que la tabla conozca: `d.ts` le gana a `ts`, `tar.gz` a `gz`. */
function porExtension(tabla: Readonly<Record<string, string>>, nombre: string): string | undefined {
  const partes = nombre.split('.')
  for (let desde = 1; desde < partes.length; desde += 1) {
    const clave = partes.slice(desde).join('.')
    if (Object.hasOwn(tabla, clave)) {
      return tabla[clave]
    }
  }
  return undefined
}

/** El logo de un archivo, o null si Material no lo conoce (queda lo de siempre). */
export function logoDeArchivo(ruta: string | null | undefined): LogoDeArchivo | null {
  if (!ruta) {
    return null
  }
  const nombre = nombreDeArchivo(ruta)
  if (!nombre) {
    return null
  }
  const oscuro = Object.hasOwn(MATERIAL_ICONO_POR_NOMBRE, nombre)
    ? MATERIAL_ICONO_POR_NOMBRE[nombre]
    : porExtension(MATERIAL_ICONO_POR_EXTENSION, nombre)
  if (!oscuro) {
    return null
  }
  // El tema claro tiene sus propias versiones de algunos (los que en oscuro son blancos).
  const claro =
    (Object.hasOwn(MATERIAL_ICONO_POR_NOMBRE_CLARO, nombre)
      ? MATERIAL_ICONO_POR_NOMBRE_CLARO[nombre]
      : porExtension(MATERIAL_ICONO_POR_EXTENSION_CLARO, nombre)) ?? oscuro
  return { oscuro, claro }
}

const ID_DE_ESTILO = 'dolphin-logos-de-archivo'

/** El nombre del ícono (sin `.svg`) a partir de la ruta que da Vite. */
function iconoDeRuta(ruta: string): string {
  return ruta.slice(ruta.lastIndexOf('/') + 1).replace(/\.svg$/, '')
}

/**
 * Pone la hoja de estilos con una regla por logo. Una sola vez por documento; los SVG los sirve
 * Vite como archivos (`?url`), así el navegador los cachea y no viajan dentro del JS.
 */
export function instalarLogosDeArchivo(doc: Document = document): void {
  if (doc.getElementById(ID_DE_ESTILO)) {
    return
  }
  const urls = import.meta.glob<string>('../../assets/file-icons/*.svg', {
    eager: true,
    query: '?url',
    import: 'default'
  })
  const reglas = [`[${ATRIBUTO_LOGO}]{display:inline-block;background:center / contain no-repeat}`]
  for (const [ruta, url] of Object.entries(urls)) {
    const icono = iconoDeRuta(ruta)
    // El oscuro es el de siempre; el claro sólo cambia cuando la raíz no está en `.dark`.
    reglas.push(`[${ATRIBUTO_LOGO}="${icono}"]{background-image:url("${url}")}`)
    reglas.push(
      `:root:not(.dark) [${ATRIBUTO_LOGO_CLARO}="${icono}"]{background-image:url("${url}")}`
    )
  }
  const estilo = doc.createElement('style')
  estilo.id = ID_DE_ESTILO
  estilo.textContent = reglas.join('\n')
  doc.head.append(estilo)
}
