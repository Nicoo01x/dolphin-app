// Los servidores vivos. Lo que importa acá es el ciclo de vida: uno por proyecto, no dos por abrir
// dos archivos a la vez, y ninguno colgado cuando falta la herramienta.

import { describe, expect, it, vi } from 'vitest'
import { encuadrar, LectorDeMensajes } from '../../shared/lsp/encuadre'
import type { ProcesoDeServidor } from './cliente-lsp'
import { ServidoresVivos } from './servidores-vivos'

/** Un servidor de mentira que contesta `initialize` apenas se lo pregunten. */
function servidorQueSaluda(): { proceso: ProcesoDeServidor; arrancado: () => number } {
  let arrancado = 0
  const lector = new LectorDeMensajes()
  let alRecibir: (datos: Buffer) => void = () => {}
  return {
    arrancado: () => arrancado,
    proceso: {
      escribir: (datos) => {
        for (const mensaje of lector.recibir(datos)) {
          const sobre = mensaje as { id?: number; method?: string }
          if (sobre.method === 'initialize' && sobre.id !== undefined) {
            arrancado += 1
            alRecibir(encuadrar({ jsonrpc: '2.0', id: sobre.id, result: { capabilities: {} } }))
          }
        }
      },
      alRecibir: (escuchar) => {
        alRecibir = escuchar
      },
      alSalir: () => {},
      terminar: () => {}
    }
  }
}

const EXISTE = (rutas: readonly string[]) => (ruta: string) => Promise.resolve(rutas.includes(ruta))

describe('los servidores vivos', () => {
  it('arranca uno y lo reusa para otro archivo del mismo proyecto', async () => {
    const falso = servidorQueSaluda()
    const vivos = new ServidoresVivos(() => {}, {
      abrirProceso: () => falso.proceso,
      existe: EXISTE(['/repo/tsconfig.json'])
    })
    const uno = await vivos.para('/repo/src/a.ts', 'typescript')
    const dos = await vivos.para('/repo/src/b.ts', 'typescript')
    expect('cliente' in uno && 'cliente' in dos).toBe(true)
    expect(falso.arrancado()).toBe(1)
    expect(vivos.cuantos).toBe(1)
  })

  it('abrir dos archivos a la vez no arranca dos servidores', async () => {
    const falso = servidorQueSaluda()
    const vivos = new ServidoresVivos(() => {}, {
      abrirProceso: () => falso.proceso,
      existe: EXISTE(['/repo/tsconfig.json'])
    })
    // Sin guardar la promesa del arranque, esto arrancaría dos y el segundo indexaría al pedo.
    await Promise.all([
      vivos.para('/repo/src/a.ts', 'typescript'),
      vivos.para('/repo/src/b.ts', 'typescript')
    ])
    expect(falso.arrancado()).toBe(1)
  })

  it('dos proyectos distintos tienen cada uno el suyo', async () => {
    const abiertos: string[] = []
    const vivos = new ServidoresVivos(() => {}, {
      abrirProceso: (_s, raiz) => {
        abiertos.push(raiz)
        return servidorQueSaluda().proceso
      },
      existe: EXISTE(['/uno/tsconfig.json', '/otro/tsconfig.json'])
    })
    await vivos.para('/uno/src/a.ts', 'typescript')
    await vivos.para('/otro/src/a.ts', 'typescript')
    expect(abiertos).toEqual(['/uno', '/otro'])
    expect(vivos.cuantos).toBe(2)
  })

  it('sin la herramienta instalada lo dice, y no se cuelga', async () => {
    const vivos = new ServidoresVivos(() => {}, {
      abrirProceso: () => null,
      existe: EXISTE(['/repo/tsconfig.json'])
    })
    const resultado = await vivos.para('/repo/src/a.ts', 'typescript')
    expect(resultado).toMatchObject({ motivo: 'no-instalado' })
    expect(vivos.cuantos).toBe(0)
  })

  it('un servidor instalado que no puede arrancar dice por qué, y no queda vivo', async () => {
    // typescript-language-server con TypeScript 7 (sin tsserver.js) contesta así el saludo.
    const lector = new LectorDeMensajes()
    let alRecibir: (datos: Buffer) => void = () => {}
    const terminar = vi.fn()
    const proceso: ProcesoDeServidor = {
      escribir: (datos) => {
        for (const mensaje of lector.recibir(datos)) {
          const sobre = mensaje as { id?: number }
          alRecibir(
            encuadrar({
              jsonrpc: '2.0',
              id: sobre.id,
              error: { code: -32603, message: 'Could not find a valid TypeScript installation.' }
            })
          )
        }
      },
      alRecibir: (escuchar) => {
        alRecibir = escuchar
      },
      alSalir: () => {},
      terminar
    }
    const vivos = new ServidoresVivos(() => {}, {
      // Como el de verdad, que primero busca el ejecutable: asíncrono.
      abrirProceso: () => Promise.resolve(proceso),
      existe: EXISTE(['/repo/tsconfig.json'])
    })
    const resultado = await vivos.para('/repo/src/a.ts', 'typescript')
    expect(resultado).toMatchObject({
      motivo: 'no-arranco',
      detalle: 'Could not find a valid TypeScript installation.'
    })
    expect(terminar).toHaveBeenCalled()
    expect(vivos.cuantos).toBe(0)
  })

  it('si se cierra sin contestar, el motivo es lo que dejó en stderr', async () => {
    let alSalir: (codigo: number | null) => void = () => {}
    const proceso: ProcesoDeServidor = {
      // Como rustup sin el componente: escribe el error y se va, sin contestar el saludo.
      escribir: () => alSalir(1),
      alRecibir: () => {},
      alSalir: (escuchar) => {
        alSalir = escuchar
      },
      terminar: () => {},
      ultimoError: () => "error: Unknown binary 'rust-analyzer.exe'"
    }
    const vivos = new ServidoresVivos(() => {}, {
      abrirProceso: () => proceso,
      existe: EXISTE(['/repo/Cargo.toml'])
    })
    expect(await vivos.para('/repo/src/main.rs', 'rust')).toMatchObject({
      motivo: 'no-arranco',
      detalle: "error: Unknown binary 'rust-analyzer.exe'"
    })
  })

  it('un lenguaje sin servidor y un archivo sin proyecto se dicen distinto', async () => {
    const vivos = new ServidoresVivos(() => {}, {
      abrirProceso: () => servidorQueSaluda().proceso,
      existe: EXISTE([])
    })
    expect(await vivos.para('/x/a.cob', 'cobol')).toEqual({
      motivo: 'sin-servidor-para-el-lenguaje'
    })
    expect(await vivos.para('/x/a.ts', 'typescript')).toMatchObject({ motivo: 'sin-raiz' })
  })

  it('los diagnósticos llegan con la raíz de su proyecto', async () => {
    const falso = servidorQueSaluda()
    const avisos: { raiz: string; uri: string }[] = []
    const vivos = new ServidoresVivos((raiz, datos) => avisos.push({ raiz, uri: datos.uri }), {
      abrirProceso: () => falso.proceso,
      existe: EXISTE(['/repo/tsconfig.json'])
    })
    const listo = await vivos.para('/repo/src/a.ts', 'typescript')
    expect('cliente' in listo).toBe(true)
    // El servidor publica diagnósticos por su cuenta.
    const recibir = vi.fn()
    expect(recibir).not.toHaveBeenCalled()
    falso.proceso.alRecibir(() => {})
    expect(avisos).toEqual([])
    expect(vivos.yaAndando('/repo/src/b.ts', 'typescript')).not.toBeNull()
    expect(vivos.yaAndando('/otro/b.ts', 'typescript')).toBeNull()
  })

  it('cada tecla de un archivo abierto no vuelve a mirar el disco', async () => {
    const existe = vi.fn(EXISTE(['/repo/tsconfig.json']))
    const vivos = new ServidoresVivos(() => {}, {
      abrirProceso: () => servidorQueSaluda().proceso,
      existe
    })
    await vivos.para('/repo/src/a.ts', 'typescript')
    existe.mockClear()
    expect(vivos.yaAndando('/repo/src/a.ts', 'typescript')).not.toBeNull()
    expect(existe).not.toHaveBeenCalled()
  })

  it('apagarlos los saca a todos', async () => {
    const vivos = new ServidoresVivos(() => {}, {
      abrirProceso: () => servidorQueSaluda().proceso,
      existe: EXISTE(['/repo/tsconfig.json'])
    })
    await vivos.para('/repo/src/a.ts', 'typescript')
    expect(vivos.cuantos).toBe(1)
    await vivos.apagarTodos()
    expect(vivos.cuantos).toBe(0)
  })
})
