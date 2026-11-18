import { describe, expect, it, vi } from 'vitest'
import type { EtapaDeLlevar } from '../../shared/delfines-types'
import type { NucleoLocal } from './delfines-nucleo'
import type { Remoto } from './delfines-remoto'
import { carpetaEnElServidor, llevarAlServidor } from './delfines-llevar'

const REVISION_OK = [
  'sistema=Linux',
  'home=/home/ana',
  'usuario=ana',
  'node=/home/ana/n/bin/node',
  'nodeVersion=24.22.1',
  'systemd=0',
  'linger=no',
  'huella=vieja',
  'motorEsta=1',
  'motorLogin=0'
].join('\n')

type Doble = {
  remoto: Remoto
  scripts: string[]
  subidas: [string, string][]
  escritos: string[]
}

/** Un servidor de mentira: contesta por patrones del script y anota lo que se le pidió. */
function servidor(
  respuestas: (script: string) => { codigo: number; salida: string } | undefined
): Doble {
  const scripts: string[] = []
  const subidas: [string, string][] = []
  const escritos: string[] = []
  return {
    scripts,
    subidas,
    escritos,
    remoto: {
      correr: async (script) => {
        scripts.push(script)
        return respuestas(script) ?? { codigo: 0, salida: '' }
      },
      subirCarpeta: async (local, remota) => {
        subidas.push([local, remota])
      },
      escribir: async (remota) => {
        escritos.push(remota)
      }
    }
  }
}

function respuestasDeUnServidorSano(
  script: string
): { codigo: number; salida: string } | undefined {
  if (script.includes('uname -s')) {
    return { codigo: 0, salida: REVISION_OK }
  }
  if (script.includes('show-user')) {
    return { codigo: 0, salida: 'yes' }
  }
  if (script.endsWith(' bots --json')) {
    return { codigo: 0, salida: JSON.stringify({ bots: [{ id: 'vigia' }] }) }
  }
  return undefined
}

function nucleoDoble(): NucleoLocal & { pedidos: unknown[][] } {
  const pedidos: unknown[][] = []
  return {
    pedidos,
    carpeta: async () => 'C:/app/dolphin-app',
    json: async <T>(args: readonly string[]) => {
      pedidos.push([...args])
      return { guardado: 'x' } as T
    }
  }
}

const BOT = {
  id: 'vigia',
  motor: 'claude' as const,
  dir: 'C:/u/.dolphin/bots/vigia',
  carpeta: 'D:/tienda'
}

describe('llevar un bot al servidor', () => {
  it('sube el núcleo si cambió, importa el bot, instala el servicio, lo verifica y recién ahí aparta el de acá', async () => {
    const doble = servidor(respuestasDeUnServidorSano)
    const nucleo = nucleoDoble()
    const etapas: EtapaDeLlevar[] = []
    const resultado = await llevarAlServidor({
      remoto: doble.remoto,
      nucleo,
      servidor: { hostId: 'ssh:vps', nombre: 'vps' },
      bot: BOT,
      carpeta: '~/tienda',
      huellaLocal: async () => 'nueva',
      leerArchivo: async () => '{"type":"module"}',
      alAvanzar: (etapa) => etapas.push(etapa),
      esperar: async () => undefined
    })
    expect(resultado).toEqual({ ok: true, linger: true })
    expect(etapas).toEqual(['revisar', 'nucleo', 'bot', 'instalar', 'verificar', 'apartar'])
    expect(doble.subidas).toEqual([
      ['C:/app/dolphin-app/bin', '/home/ana/.dolphin-remote/nucleo-dolphin/bin'],
      ['C:/app/dolphin-app/dist', '/home/ana/.dolphin-remote/nucleo-dolphin/dist'],
      ['C:/u/.dolphin/bots/vigia', '/home/ana/.dolphin-remote/delfines-llegando/vigia']
    ])
    const importar = doble.scripts.find((s) => s.includes(' importar '))!
    expect(importar).toContain("--carpeta '/home/ana/tienda' --reemplazar")
    const instalar = doble.scripts.find((s) => s.includes(' instalar '))!
    expect(instalar).toContain(
      `--comando '"/home/ana/n/bin/node" "/home/ana/.dolphin-remote/nucleo-dolphin/bin/dolphin.mjs" bots correr'`
    )
    expect(doble.escritos).toEqual([
      '/home/ana/.dolphin-remote/nucleo-dolphin/package.json',
      '/home/ana/.dolphin-remote/nucleo-dolphin/.huella'
    ])
    expect(nucleo.pedidos).toEqual([['apartar', 'vigia']])
  })

  it('con la misma huella no vuelve a subir el núcleo', async () => {
    const doble = servidor((script) =>
      script.includes('uname -s')
        ? { codigo: 0, salida: REVISION_OK.replace('huella=vieja', 'huella=igual') }
        : respuestasDeUnServidorSano(script)
    )
    await llevarAlServidor({
      remoto: doble.remoto,
      nucleo: nucleoDoble(),
      servidor: { hostId: 'ssh:vps', nombre: 'vps' },
      bot: BOT,
      carpeta: '',
      huellaLocal: async () => 'igual',
      esperar: async () => undefined
    })
    expect(doble.subidas.map(([, remota]) => remota)).toEqual([
      '/home/ana/.dolphin-remote/delfines-llegando/vigia'
    ])
  })

  it('si falta la sesión del motor no toca nada y devuelve la revisión', async () => {
    const doble = servidor((script) =>
      script.includes('uname -s')
        ? { codigo: 0, salida: REVISION_OK.replace('motorLogin=0', 'motorLogin=1') }
        : undefined
    )
    const nucleo = nucleoDoble()
    const resultado = await llevarAlServidor({
      remoto: doble.remoto,
      nucleo,
      servidor: { hostId: 'ssh:vps', nombre: 'vps' },
      bot: BOT,
      carpeta: '',
      huellaLocal: async () => 'x'
    })
    expect(resultado).toMatchObject({ ok: false, etapa: 'revisar', revision: { listo: false } })
    expect(doble.scripts).toHaveLength(1)
    expect(nucleo.pedidos).toEqual([])
  })

  it('si el servicio no arranca, el bot de acá sigue corriendo y el error trae el diario', async () => {
    const doble = servidor((script) => {
      if (script.includes('is-active')) {
        return { codigo: 3, salida: 'inactive' }
      }
      if (script.includes('journalctl')) {
        return { codigo: 0, salida: 'Failed to start dolphin-bots.service' }
      }
      return respuestasDeUnServidorSano(script)
    })
    const nucleo = nucleoDoble()
    const resultado = await llevarAlServidor({
      remoto: doble.remoto,
      nucleo,
      servidor: { hostId: 'ssh:vps', nombre: 'vps' },
      bot: BOT,
      carpeta: '',
      huellaLocal: async () => 'x',
      leerArchivo: async () => '{}',
      esperar: vi.fn(async () => undefined)
    })
    expect(resultado).toEqual({
      ok: false,
      etapa: 'verificar',
      detail: 'Failed to start dolphin-bots.service'
    })
    expect(nucleo.pedidos).toEqual([])
  })

  it('un import que falla dice el motivo del núcleo, sin el «Error:» de Node', async () => {
    const doble = servidor((script) =>
      script.includes(' importar ')
        ? { codigo: 1, salida: 'at x\nError: la carpeta no tiene un bot.json válido' }
        : respuestasDeUnServidorSano(script)
    )
    const resultado = await llevarAlServidor({
      remoto: doble.remoto,
      nucleo: nucleoDoble(),
      servidor: { hostId: 'ssh:vps', nombre: 'vps' },
      bot: BOT,
      carpeta: '',
      huellaLocal: async () => 'x',
      leerArchivo: async () => '{}'
    })
    expect(resultado).toEqual({
      ok: false,
      etapa: 'bot',
      detail: 'la carpeta no tiene un bot.json válido'
    })
  })
})

describe('la carpeta en el servidor', () => {
  it('expande la casa y respeta una ruta entera', () => {
    expect(carpetaEnElServidor('', '/home/ana', '/home/ana/dolphin-bots/x')).toBe(
      '/home/ana/dolphin-bots/x'
    )
    expect(carpetaEnElServidor('~/tienda/', '/home/ana', '')).toBe('/home/ana/tienda')
    expect(carpetaEnElServidor('$HOME', '/home/ana', '')).toBe('/home/ana')
    expect(carpetaEnElServidor('/srv/app', '/home/ana', '')).toBe('/srv/app')
    expect(carpetaEnElServidor('proyectos/app', '/home/ana', '')).toBe('/home/ana/proyectos/app')
    expect(() => carpetaEnElServidor('a\nb', '/home/ana', '')).toThrow()
  })
})
