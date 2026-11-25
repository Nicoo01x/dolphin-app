#!/usr/bin/env node
/**
 * Trae los logos de archivo de Material Icon Theme (MIT, el set de íconos de archivo más usado en
 * VS Code) a la app: los SVG que usan sus mapas de archivos y la tabla extensión/nombre → ícono.
 *
 * Por qué vendorizados y no una dependencia: la app no necesita el paquete en tiempo de ejecución,
 * sólo 1 MB de SVG y una tabla; y así el build no depende de npm para dibujar un ícono.
 *
 * Uso (para actualizar a una versión nueva del paquete):
 *   npm pack material-icon-theme && tar -xzf material-icon-theme-*.tgz
 *   node config/scripts/file-icons/vendor-material-file-icons.mjs <carpeta>/package
 *
 * Escribe:
 *   src/renderer/src/assets/file-icons/*.svg      los íconos (más LICENSE y VERSION)
 *   src/renderer/src/lib/file-icons/material-file-icon-table.generated.ts
 *
 * Las carpetas no se traen: Dolphin dibuja las suyas, y los temas de plugins pueden cambiarlas.
 */
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  rmSync,
  writeFileSync
} from 'node:fs'
import { dirname, join, resolve } from 'node:path'

const paquete = process.argv[2]
if (!paquete || !existsSync(join(paquete, 'dist', 'material-icons.json'))) {
  console.error(
    'Uso: node vendor-material-file-icons.mjs <carpeta del paquete material-icon-theme>'
  )
  process.exit(2)
}

const raiz = resolve(import.meta.dirname, '../../..')
const destinoIconos = join(raiz, 'src/renderer/src/assets/file-icons')
const destinoTabla = join(
  raiz,
  'src/renderer/src/lib/file-icons/material-file-icon-table.generated.ts'
)
const manifiesto = JSON.parse(readFileSync(join(paquete, 'dist', 'material-icons.json'), 'utf8'))
const version = JSON.parse(readFileSync(join(paquete, 'package.json'), 'utf8')).version

/** Claves en minúscula: la búsqueda también lo es, y el manifiesto mezcla «Dockerfile» y «dockerfile». */
function enMinuscula(mapa = {}) {
  return Object.fromEntries(
    Object.entries(mapa).map(([clave, icono]) => [clave.toLowerCase(), icono])
  )
}

const tablas = {
  porExtension: enMinuscula(manifiesto.fileExtensions),
  porNombre: enMinuscula(manifiesto.fileNames),
  porExtensionClaro: enMinuscula(manifiesto.light?.fileExtensions),
  porNombreClaro: enMinuscula(manifiesto.light?.fileNames)
}

// Sólo los íconos que nombra alguna tabla, y el genérico.
const usados = new Set([manifiesto.file])
for (const tabla of Object.values(tablas)) {
  for (const icono of Object.values(tabla)) {
    usados.add(icono)
  }
}

rmSync(destinoIconos, { recursive: true, force: true })
mkdirSync(destinoIconos, { recursive: true })
const faltantes = []
for (const icono of usados) {
  const definicion = manifiesto.iconDefinitions[icono]
  const origen = definicion && join(paquete, 'dist', definicion.iconPath)
  if (!origen || !existsSync(origen)) {
    faltantes.push(icono)
    continue
  }
  copyFileSync(origen, join(destinoIconos, `${icono}.svg`))
}
// Una entrada que apunta a un ícono que no vino no sirve: se cae a lo de siempre.
for (const tabla of Object.values(tablas)) {
  for (const [clave, icono] of Object.entries(tabla)) {
    if (faltantes.includes(icono)) {
      delete tabla[clave]
    }
  }
}
copyFileSync(join(paquete, 'LICENSE'), join(destinoIconos, 'LICENSE'))
writeFileSync(join(destinoIconos, 'VERSION'), `material-icon-theme ${version}\n`)

const lineas = [
  '// GENERADO por config/scripts/file-icons/vendor-material-file-icons.mjs — no editar a mano.',
  `// Material Icon Theme ${version} (MIT): src/renderer/src/assets/file-icons/LICENSE.`,
  '',
  `export const MATERIAL_ICONO_GENERICO = ${JSON.stringify(manifiesto.file)}`,
  ''
]
const nombresTs = {
  porExtension: 'MATERIAL_ICONO_POR_EXTENSION',
  porNombre: 'MATERIAL_ICONO_POR_NOMBRE',
  porExtensionClaro: 'MATERIAL_ICONO_POR_EXTENSION_CLARO',
  porNombreClaro: 'MATERIAL_ICONO_POR_NOMBRE_CLARO'
}
for (const [clave, nombreTs] of Object.entries(nombresTs)) {
  const ordenado = Object.fromEntries(
    Object.entries(tablas[clave]).sort(([a], [b]) => a.localeCompare(b))
  )
  lineas.push(
    `export const ${nombreTs}: Readonly<Record<string, string>> = ${JSON.stringify(ordenado, null, 2)}`,
    ''
  )
}
mkdirSync(dirname(destinoTabla), { recursive: true })
writeFileSync(destinoTabla, lineas.join('\n'))

const cantidad = readdirSync(destinoIconos).filter((f) => f.endsWith('.svg')).length
console.log(
  `material-icon-theme ${version}: ${cantidad} íconos, ${Object.keys(tablas.porExtension).length} extensiones, ${Object.keys(tablas.porNombre).length} nombres.`
)
if (faltantes.length > 0) {
  console.log(`Sin archivo (quedan afuera): ${faltantes.join(', ')}`)
}
