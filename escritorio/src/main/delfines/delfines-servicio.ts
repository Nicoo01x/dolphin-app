import { quotePosixShell } from '../../shared/shell/launch/shell-argument-quoting'
import type {
  CharlaConDelfin,
  Delfin,
  InstantaneaDeDelfin,
  ManadaDelNucleo,
  ManadaLeida,
  PedidoDeCrearDelfin,
  PedidoDeHablar,
  PedidoDeLlevar,
  RespuestaDelDelfin,
  Resultado,
  ResultadoDeLlevar,
  RevisionDelServidor,
  ServidorParaDelfines,
  EtapaDeLlevar
} from '../../shared/delfines-types'
import {
  FalloDelNucleo,
  ESPERA_DE_CHARLA_MS,
  jsonDeLaSalida,
  type NucleoLocal
} from './delfines-nucleo'
import type { Remoto } from './delfines-remoto'
import type { RegistroDeServidor } from './delfines-registro'
import { leerRevision, NUCLEO_REMOTO, revisionPublica, scriptDeRevision } from './delfines-revision'
import { llevarAlServidor } from './delfines-llevar'

/**
 * Lo que la página «Delfines» le pide a main, armado sobre el núcleo de acá, el registro de los
 * bots que se fueron a un servidor y la conexión SSH a ese servidor. Sin Electron: se prueba con
 * dobles de las tres cosas.
 */

export type DepsDeDelfines = {
  nucleo: NucleoLocal
  registro: RegistroDeServidor
  /** El servidor por SSH, si está conectado ahora; null si no. */
  abrirRemoto: (hostId: `ssh:${string}`) => Promise<Remoto | null>
  nombreDelServidor: (hostId: `ssh:${string}`) => string
  huellaLocal: () => Promise<string>
  carpetaPersonal: () => string
}

function falla(error: unknown): { ok: false; code: 'sin-nucleo' | 'nucleo'; detail: string } {
  if (error instanceof FalloDelNucleo) {
    return { ok: false, code: error.code, detail: error.message }
  }
  return {
    ok: false,
    code: 'nucleo',
    detail: error instanceof Error ? error.message : String(error)
  }
}

async function jsonRemoto<T>(remoto: Remoto, script: string, entrada?: string): Promise<T> {
  const { codigo, salida } = await remoto.correr(script, {
    esperaMs: ESPERA_DE_CHARLA_MS,
    ...(entrada !== undefined ? { entrada } : {})
  })
  if (codigo !== 0) {
    throw new FalloDelNucleo(
      'nucleo',
      salida.split(/\r?\n/).findLast(Boolean) ?? `código ${codigo}`
    )
  }
  return jsonDeLaSalida<T>(salida)
}

export function crearServicioDeDelfines(deps: DepsDeDelfines) {
  const dolphinAlla = (bot: { node: string; bin: string }): string =>
    `${quotePosixShell(bot.node)} ${quotePosixShell(bot.bin)} bots`

  /** Los bots que viven en un servidor, con su estado de allá o el último que se supo. */
  async function delServidor(): Promise<Delfin[]> {
    const registrados = Object.entries(await deps.registro.leer())
    const porServidor = new Map<`ssh:${string}`, typeof registrados>()
    for (const par of registrados) {
      porServidor.set(par[1].hostId, [...(porServidor.get(par[1].hostId) ?? []), par])
    }
    const listas = await Promise.all(
      [...porServidor].map(async ([hostId, bots]) => {
        const nombre = deps.nombreDelServidor(hostId)
        const remoto = await deps.abrirRemoto(hostId).catch(() => null)
        const manada = remoto
          ? await jsonRemoto<ManadaDelNucleo>(remoto, `${dolphinAlla(bots[0]![1])} --json`).catch(
              () => null
            )
          : null
        return Promise.all(
          bots.map(async ([id, bot]): Promise<Delfin | null> => {
            const vivo = manada?.bots.find((candidato) => candidato.id === id)
            if (vivo) {
              await deps.registro.anotar(id, { ...bot, ultimo: vivo })
              return { ...vivo, donde: { tipo: 'servidor', hostId, nombre } }
            }
            const ultimo: InstantaneaDeDelfin | undefined = bot.ultimo
            return ultimo
              ? {
                  ...ultimo,
                  corriendo: false,
                  donde: { tipo: 'servidor', hostId, nombre, sinRespuesta: true }
                }
              : null
          })
        )
      })
    )
    return listas.flat().filter((delfin): delfin is Delfin => delfin !== null)
  }

  return {
    async listar(): Promise<ManadaLeida> {
      try {
        const [local, remotos] = await Promise.all([
          deps.nucleo.json<ManadaDelNucleo>([]),
          delServidor()
        ])
        const enServidor = new Set(remotos.map((bot) => bot.id))
        const aca: Delfin[] = local.bots
          .filter((bot) => !enServidor.has(bot.id))
          .map((bot) => ({ ...bot, donde: { tipo: 'aca' } }))
        return {
          ok: true,
          servicioVivo: local.servicio.vivo,
          bots: [...aca, ...remotos],
          rotos: local.rotos
        }
      } catch (error) {
        return falla(error)
      }
    },

    async crear(pedido: PedidoDeCrearDelfin): Promise<Resultado<{ bot: InstantaneaDeDelfin }>> {
      try {
        const bot = await deps.nucleo.json<InstantaneaDeDelfin>([
          'nuevo',
          pedido.nombre,
          `--plantilla=${pedido.plantilla}`,
          `--carpeta=${pedido.carpeta?.trim() || deps.carpetaPersonal()}`
        ])
        return { ok: true, bot }
      } catch (error) {
        return falla(error)
      }
    },

    async hablar(pedido: PedidoDeHablar): Promise<Resultado<{ respuesta: RespuestaDelDelfin }>> {
      try {
        if (!pedido.hostId) {
          const respuesta = await deps.nucleo.json<RespuestaDelDelfin>(['hablar', pedido.id], {
            entrada: pedido.texto,
            esperaMs: ESPERA_DE_CHARLA_MS
          })
          return { ok: true, respuesta }
        }
        const bot = (await deps.registro.leer())[pedido.id]
        const remoto = bot ? await deps.abrirRemoto(pedido.hostId) : null
        if (!bot || !remoto) {
          return { ok: false, code: 'sin-conexion' }
        }
        const respuesta = await jsonRemoto<RespuestaDelDelfin>(
          remoto,
          `${dolphinAlla(bot)} hablar ${quotePosixShell(pedido.id)} --json`,
          pedido.texto
        )
        return { ok: true, respuesta }
      } catch (error) {
        return falla(error)
      }
    },

    async charla(
      id: string,
      hostId?: `ssh:${string}`
    ): Promise<Resultado<{ charla: CharlaConDelfin[] }>> {
      try {
        if (!hostId) {
          return { ok: true, charla: await deps.nucleo.json<CharlaConDelfin[]>(['historial', id]) }
        }
        const bot = (await deps.registro.leer())[id]
        const remoto = bot ? await deps.abrirRemoto(hostId) : null
        if (!bot || !remoto) {
          return { ok: false, code: 'sin-conexion' }
        }
        const charla = await jsonRemoto<CharlaConDelfin[]>(
          remoto,
          `${dolphinAlla(bot)} historial ${quotePosixShell(id)} --json`
        )
        return { ok: true, charla }
      } catch (error) {
        return falla(error)
      }
    },

    async revisar(
      id: string,
      servidor: ServidorParaDelfines
    ): Promise<Resultado<{ revision: RevisionDelServidor }>> {
      try {
        const local = await deps.nucleo.json<ManadaDelNucleo>([])
        const bot = local.bots.find((candidato) => candidato.id === id)
        const remoto = await deps.abrirRemoto(servidor.hostId)
        if (!bot) {
          return { ok: false, code: 'pedido-invalido', detail: id }
        }
        if (!remoto) {
          return { ok: false, code: 'sin-conexion' }
        }
        const salida = await remoto.correr(scriptDeRevision(bot.motor, bot.carpeta))
        return {
          ok: true,
          revision: revisionPublica(leerRevision(servidor, bot.motor, id, salida.salida))
        }
      } catch (error) {
        return falla(error)
      }
    },

    async llevar(
      pedido: PedidoDeLlevar,
      alAvanzar: (etapa: EtapaDeLlevar) => void
    ): Promise<ResultadoDeLlevar> {
      const local = await deps.nucleo.json<ManadaDelNucleo>([]).catch(() => null)
      const bot = local?.bots.find((candidato) => candidato.id === pedido.id)
      const remoto = await deps.abrirRemoto(pedido.hostId).catch(() => null)
      if (!bot || !remoto) {
        return { ok: false, etapa: 'revisar', detail: bot ? 'sin-conexion' : 'sin-bot' }
      }
      const servidor = { hostId: pedido.hostId, nombre: deps.nombreDelServidor(pedido.hostId) }
      let node = ''
      let home = ''
      const resultado = await llevarAlServidor({
        remoto: {
          ...remoto,
          // Se anota con qué Node quedó para poder hablarle después, sin otra revisión.
          correr: async (script, opciones) => {
            const respuesta = await remoto.correr(script, opciones)
            const revision = /^node=(.+)$/m.exec(respuesta.salida)
            const casa = /^home=(.+)$/m.exec(respuesta.salida)
            node ||= revision?.[1]?.trim() ?? ''
            home ||= casa?.[1]?.trim() ?? ''
            return respuesta
          }
        },
        nucleo: deps.nucleo,
        servidor,
        bot,
        carpeta: pedido.carpeta,
        huellaLocal: deps.huellaLocal,
        alAvanzar
      })
      // Si falló sólo el último paso, el bot ya corre allá: se anota igual, y el error dice que el de
      // acá sigue prendido para que la persona lo pare.
      if (resultado.ok || resultado.etapa === 'apartar') {
        await deps.registro.anotar(bot.id, {
          hostId: pedido.hostId,
          nombre: servidor.nombre,
          node,
          bin: `${home}/${NUCLEO_REMOTO}/bin/dolphin.mjs`,
          desde: new Date().toISOString(),
          ultimo: bot
        })
      }
      return resultado
    }
  }
}

export type ServicioDeDelfines = ReturnType<typeof crearServicioDeDelfines>
