import { describe, expect, it } from 'vitest'
import type { InstantaneaDeDelfin, ManadaDelNucleo } from '../../shared/delfines-types'
import type { NucleoLocal } from './delfines-nucleo'
import type { BotEnServidor, RegistroDeServidor } from './delfines-registro'
import type { Remoto } from './delfines-remoto'
import { crearServicioDeDelfines } from './delfines-servicio'

function bot(id: string, extra: Partial<InstantaneaDeDelfin> = {}): InstantaneaDeDelfin {
  return {
    id,
    nombre: id,
    motor: 'claude',
    permiso: 'leer',
    dir: `/b/${id}`,
    carpeta: '/c',
    corriendo: true,
    gasto: { usd: 0, corridas: 0 },
    telegram: false,
    ...extra
  }
}

function registroEnMemoria(inicial: Record<string, BotEnServidor> = {}): RegistroDeServidor & {
  datos: Record<string, BotEnServidor>
} {
  const estado = { datos: { ...inicial } }
  return {
    get datos() {
      return estado.datos
    },
    leer: async () => ({ ...estado.datos }),
    anotar: async (id, valor) => {
      estado.datos = { ...estado.datos, [id]: valor }
    },
    olvidar: async (id) => {
      estado.datos = Object.fromEntries(
        Object.entries(estado.datos).filter(([otro]) => otro !== id)
      )
    }
  }
}

function nucleoCon(manada: ManadaDelNucleo, pedidos: unknown[][] = []): NucleoLocal {
  return {
    carpeta: async () => '/core',
    json: async <T>(args: readonly string[], opciones?: { entrada?: string }) => {
      pedidos.push([...args, opciones?.entrada])
      return (args.length === 0 ? manada : { texto: 'listo', nada: false }) as T
    }
  }
}

const EN_SERVIDOR: BotEnServidor = {
  hostId: 'ssh:vps',
  nombre: 'vps',
  node: '/n/node',
  bin: '/home/ana/.dolphin-remote/nucleo-dolphin/bin/dolphin.mjs',
  desde: '2026-11-17T00:00:00.000Z',
  ultimo: bot('parte', { corriendo: true })
}

function servicio(remoto: Remoto | null, registro = registroEnMemoria({ parte: EN_SERVIDOR })) {
  return crearServicioDeDelfines({
    nucleo: nucleoCon({ servicio: { vivo: true }, carpeta: '/b', bots: [bot('vigia')], rotos: [] }),
    registro,
    abrirRemoto: async () => remoto,
    nombreDelServidor: () => 'vps-ana',
    huellaLocal: async () => 'h',
    carpetaPersonal: () => '/home/yo'
  })
}

describe('el servicio de los delfines', () => {
  it('junta los de acá con los del servidor, con el estado que contesta el servidor', async () => {
    const remoto: Remoto = {
      correr: async () => ({
        codigo: 0,
        salida: JSON.stringify({
          servicio: { vivo: true },
          bots: [bot('parte', { gasto: { usd: 2, corridas: 3 } })]
        })
      }),
      subirCarpeta: async () => undefined,
      escribir: async () => undefined
    }
    const registro = registroEnMemoria({ parte: EN_SERVIDOR })
    const manada = await servicio(remoto, registro).listar()
    expect(manada).toMatchObject({
      ok: true,
      servicioVivo: true,
      bots: [
        { id: 'vigia', donde: { tipo: 'aca' } },
        {
          id: 'parte',
          gasto: { usd: 2 },
          donde: { tipo: 'servidor', hostId: 'ssh:vps', nombre: 'vps-ana' }
        }
      ]
    })
    expect(registro.datos.parte?.ultimo?.gasto.usd).toBe(2)
  })

  it('con el servidor desconectado muestra el último estado, parado y marcado sin respuesta', async () => {
    const manada = await servicio(null).listar()
    expect(manada.ok && manada.bots[1]).toMatchObject({
      id: 'parte',
      corriendo: false,
      donde: { tipo: 'servidor', sinRespuesta: true }
    })
  })

  it('hablarle a uno del servidor manda el mensaje por stdin al núcleo de allá', async () => {
    const scripts: { script: string; entrada?: string }[] = []
    const remoto: Remoto = {
      correr: async (script, opciones) => {
        scripts.push({ script, ...(opciones?.entrada ? { entrada: opciones.entrada } : {}) })
        return { codigo: 0, salida: '{"texto":"todo en orden","nada":false}' }
      },
      subirCarpeta: async () => undefined,
      escribir: async () => undefined
    }
    const respuesta = await servicio(remoto).hablar({
      id: 'parte',
      texto: '-¿qué pasó?',
      hostId: 'ssh:vps'
    })
    expect(respuesta).toEqual({ ok: true, respuesta: { texto: 'todo en orden', nada: false } })
    expect(scripts[0]).toEqual({
      script:
        "'/n/node' '/home/ana/.dolphin-remote/nucleo-dolphin/bin/dolphin.mjs' bots hablar 'parte' --json",
      entrada: '-¿qué pasó?'
    })
    expect(await servicio(null).hablar({ id: 'parte', texto: 'hola', hostId: 'ssh:vps' })).toEqual({
      ok: false,
      code: 'sin-conexion'
    })
  })

  it('crear usa la plantilla y la carpeta personal si no se eligió otra', async () => {
    const pedidos: unknown[][] = []
    const s = crearServicioDeDelfines({
      nucleo: nucleoCon({ servicio: { vivo: false }, carpeta: '/b', bots: [], rotos: [] }, pedidos),
      registro: registroEnMemoria(),
      abrirRemoto: async () => null,
      nombreDelServidor: () => '',
      huellaLocal: async () => '',
      carpetaPersonal: () => '/home/yo'
    })
    await s.crear({ nombre: 'Vigía', plantilla: 'vigia' })
    expect(pedidos[0]).toEqual([
      'nuevo',
      'Vigía',
      '--plantilla=vigia',
      '--carpeta=/home/yo',
      undefined
    ])
  })
})
