// Que un servidor que se cae se avise: el editor le devuelve el hover y el completado al worker
// de TypeScript de Monaco cuando ya no hay quién conteste.

import { describe, expect, it } from 'vitest'
import { encuadrar, LectorDeMensajes } from '../../shared/lsp/encuadre'
import type { ProcesoDeServidor } from './cliente-lsp'
import { ServidoresVivos } from './servidores-vivos'

function servidorQueSeCae(): { proceso: ProcesoDeServidor; caer: () => void } {
  const lector = new LectorDeMensajes()
  let alRecibir: (datos: Buffer) => void = () => {}
  let alSalir: (codigo: number | null) => void = () => {}
  return {
    caer: () => alSalir(1),
    proceso: {
      escribir: (datos) => {
        for (const mensaje of lector.recibir(datos)) {
          // oxlint-disable-next-line typescript/consistent-type-assertions -- SAFETY: el servidor de mentira sólo mira `id` y `method` de lo que le escriben.
          const sobre = mensaje as { id?: number; method?: string }
          if (sobre.method === 'initialize' && sobre.id !== undefined) {
            alRecibir(encuadrar({ jsonrpc: '2.0', id: sobre.id, result: { capabilities: {} } }))
          }
        }
      },
      alRecibir: (escuchar) => {
        alRecibir = escuchar
      },
      alSalir: (escuchar) => {
        alSalir = escuchar
      },
      terminar: () => {}
    }
  }
}

describe('un servidor que se cae', () => {
  it('avisa con su id y su raíz, y deja de contar como andando', async () => {
    const falso = servidorQueSeCae()
    const caidos: { servidor: string; raiz: string }[] = []
    const vivos = new ServidoresVivos(() => {}, {
      abrirProceso: () => falso.proceso,
      existe: (ruta) => Promise.resolve(ruta === '/repo/tsconfig.json'),
      alCaerse: (servidor, raiz) => caidos.push({ servidor, raiz })
    })
    const listo = await vivos.para('/repo/src/a.ts', 'typescript')
    expect('cliente' in listo).toBe(true)
    expect(vivos.yaAndando('/repo/src/a.ts', 'typescript')).not.toBeNull()

    falso.caer()

    expect(caidos).toEqual([
      { servidor: 'cliente' in listo ? listo.servidor.id : '', raiz: '/repo' }
    ])
    expect(vivos.yaAndando('/repo/src/a.ts', 'typescript')).toBeNull()
  })
})
