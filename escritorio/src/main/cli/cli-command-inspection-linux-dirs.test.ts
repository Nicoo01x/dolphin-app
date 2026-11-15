import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

/**
 * Las carpetas donde puede estar un Dolphin instalado por paquete en Linux.
 *
 * Esta lista no se puede leer en tiempo de ejecución desde el instalador, así que son dos copias
 * de lo mismo en dos lenguajes. Lo que fija esta prueba es que no se separen: el instalador manda
 * —es el que crea las carpetas— y el inspector tiene que reconocer por lo menos esas.
 *
 * Y que no haya repetidas. No es cosmético: la lista nació con `/opt/Dolphin` y el renombre lo
 * convirtió en un segundo `/opt/Dolphin`. La repetida no molesta a nadie, pero la que se perdió
 * era justo una instalación vieja que esto existe para poder reparar.
 */

const CARPETA = join(__dirname, 'cli-command-inspection.ts')
const INSTALADOR = join(__dirname, '../../../resources/linux/packaging/after-install.sh')

function carpetasDelInspector(): string[] {
  const fuente = readFileSync(CARPETA, 'utf8')
  const bloque = /const PACKAGED_LINUX_LAUNCHER_DIRECTORIES = \[([^\]]*)\]/.exec(fuente)
  expect(bloque, 'no encontré la lista en cli-command-inspection.ts').not.toBeNull()
  return [...bloque![1].matchAll(/'([^']+)'/g)].map((coincidencia) => coincidencia[1])
}

describe('las carpetas de una instalación por paquete en Linux', () => {
  it('no repite ninguna', () => {
    const carpetas = carpetasDelInspector()
    expect(carpetas).toEqual([...new Set(carpetas)])
  })

  it('reconoce todas las que el instalador crea', () => {
    const guion = readFileSync(INSTALADOR, 'utf8')
    const delInstalador = [...guion.matchAll(/(\/opt\/[A-Za-z0-9._-]+)\//g)].map((c) => c[1])
    expect(delInstalador.length, 'el instalador dejó de nombrar carpetas en /opt').toBeGreaterThan(
      0
    )
    const inspector = carpetasDelInspector()
    for (const carpeta of new Set(delInstalador)) {
      expect(inspector, `el inspector no reconoce ${carpeta}`).toContain(carpeta)
    }
  })

  it('sigue leyendo las instalaciones viejas, que es para lo que están', () => {
    // Si alguna de estas se cae, un Dolphin instalado antes del renombre deja de poder repararse
    // solo: su enlace en /usr/local/bin queda apuntando a una ruta que nadie reconoce.
    expect(carpetasDelInspector()).toEqual(
      expect.arrayContaining(['/opt/Dolphin', '/opt/dolphin-ide', '/opt/dolphin'])
    )
  })
})
