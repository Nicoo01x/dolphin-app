// Qué servidor atiende cada archivo y en qué carpeta arranca. La raíz es lo que decide si el
// servidor encuentra el tsconfig y los tipos del proyecto, o contesta que todo está mal.

import { describe, expect, it } from 'vitest'
import { raizDelProyecto, servidorDe, SERVIDORES } from './servidores'

const CONJUNTO = (rutas: readonly string[]) => (ruta: string) => rutas.includes(ruta)

describe('los servidores de lenguaje', () => {
  it('cada lenguaje tiene a lo sumo un servidor', () => {
    const vistos = new Set<string>()
    for (const servidor of SERVIDORES) {
      for (const lenguaje of servidor.lenguajes) {
        expect(vistos.has(lenguaje), `${lenguaje} está en dos servidores`).toBe(false)
        vistos.add(lenguaje)
      }
    }
  })

  it('encuentra el servidor por lenguaje, sin importar la caja', () => {
    expect(servidorDe('typescript')?.id).toBe('typescript')
    expect(servidorDe('TypeScriptReact')?.id).toBe('typescript')
    expect(servidorDe('rust')?.id).toBe('rust')
    expect(servidorDe('cobol')).toBeNull()
  })

  it('la raíz es la carpeta más cercana con una marca', () => {
    const ts = servidorDe('typescript')!
    const raiz = raizDelProyecto(
      '/repo/paquetes/web/src/index.ts',
      ts,
      CONJUNTO(['/repo/package.json', '/repo/paquetes/web/tsconfig.json'])
    )
    // En un monorepo, el servidor tiene que arrancar en el paquete y no en la raíz: ahí están su
    // tsconfig y sus dependencias.
    expect(raiz).toBe('/repo/paquetes/web')
  })

  it('una marca más específica gana aunque esté más arriba', () => {
    const ts = servidorDe('typescript')!
    const raiz = raizDelProyecto(
      '/repo/ejemplos/demo/index.ts',
      ts,
      // El package.json del ejemplo está al lado del archivo; el tsconfig, tres carpetas arriba.
      CONJUNTO(['/repo/tsconfig.json', '/repo/ejemplos/demo/package.json'])
    )
    expect(raiz).toBe('/repo')
  })

  it('sin ninguna marca no hay raíz, y eso no es un error', () => {
    const ts = servidorDe('typescript')!
    expect(raizDelProyecto('/tmp/suelto.ts', ts, CONJUNTO([]))).toBeNull()
  })

  it('entiende rutas de Windows', () => {
    const rust = servidorDe('rust')!
    expect(
      raizDelProyecto(
        'D:\\proyectos\\cosa\\src\\main.rs',
        rust,
        CONJUNTO(['D:/proyectos/cosa/Cargo.toml'])
      )
    ).toBe('D:/proyectos/cosa')
  })
})
