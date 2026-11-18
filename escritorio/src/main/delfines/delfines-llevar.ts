import { quotePosixShell } from '../../shared/shell/launch/shell-argument-quoting'
import type {
  EtapaDeLlevar,
  InstantaneaDeDelfin,
  ManadaDelNucleo,
  ResultadoDeLlevar,
  ServidorParaDelfines
} from '../../shared/delfines-types'
import type { NucleoLocal } from './delfines-nucleo'
import type { Remoto } from './delfines-remoto'
import {
  NUCLEO_REMOTO,
  leerRevision,
  revisionPublica,
  scriptDeRevision,
  type RevisionCruda
} from './delfines-revision'

/**
 * «Correr en tu servidor»: lleva un bot de esta computadora a un servidor conectado por SSH y lo
 * deja corriendo ahí como servicio de systemd de usuario, aunque la PC esté apagada.
 *
 * El orden importa: el bot de acá se aparta recién cuando el de allá está corriendo. Al revés, un
 * fallo en el medio lo dejaba sin correr en ningún lado. Lo que no se puede hacer por la persona
 * (iniciar sesión en el motor, permisos de root) frena en la revisión con el comando exacto.
 */

export type PlanDeLlevar = {
  remoto: Remoto
  nucleo: NucleoLocal
  servidor: ServidorParaDelfines
  bot: Pick<InstantaneaDeDelfin, 'id' | 'motor' | 'dir' | 'carpeta'>
  /** Dónde va a trabajar en el servidor; vacío, la sugerida por la revisión. */
  carpeta: string
  huellaLocal: () => Promise<string>
  alAvanzar?: (etapa: EtapaDeLlevar) => void
  /** Entre intentos de ver si el servicio quedó prendido. */
  esperar?: (ms: number) => Promise<void>
  /** El package.json del núcleo de acá; se inyecta en los tests. */
  leerArchivo?: (ruta: string) => Promise<string>
}

class FalloDeEtapa extends Error {
  constructor(
    readonly etapa: EtapaDeLlevar,
    detalle: string
  ) {
    super(detalle)
  }
}

const VUELTAS_DE_VERIFICACION = 10
const ESPERA_ENTRE_VUELTAS_MS = 1_000
const ESPERA_DE_SUBIDA_MS = 5 * 60 * 1000

/** `~/x` y `$HOME/x` a la ruta entera; una ruta relativa se toma desde la casa del servidor. */
export function carpetaEnElServidor(pedida: string, home: string, sugerida: string): string {
  const limpia = pedida.trim()
  if (!limpia) {
    return sugerida
  }
  if (/[\n\r\0]/.test(limpia)) {
    throw new FalloDeEtapa('revisar', 'la carpeta no puede tener saltos de línea')
  }
  const sinCasa = limpia.replace(/^(?:~|\$HOME)(?=\/|$)/, home)
  return sinCasa.startsWith('/') ? sinCasa.replace(/\/+$/, '') || '/' : `${home}/${sinCasa}`
}

async function correrOFallar(
  remoto: Remoto,
  etapa: EtapaDeLlevar,
  script: string,
  esperaMs?: number
): Promise<string> {
  const { codigo, salida } = await remoto.correr(script, esperaMs ? { esperaMs } : {})
  if (codigo !== 0) {
    const ultima = salida.split(/\r?\n/).findLast((linea) => linea.trim()) ?? `código ${codigo}`
    throw new FalloDeEtapa(etapa, ultima.replace(/^\w*Error:\s*/, ''))
  }
  return salida
}

/** El núcleo de Dolphin en el servidor: se sube sólo si cambió desde la última vez. */
async function subirNucleo(plan: PlanDeLlevar, revision: RevisionCruda): Promise<string> {
  const destino = `${revision.home}/${NUCLEO_REMOTO}`
  const huella = await plan.huellaLocal()
  if (revision.huella !== huella) {
    const local = await plan.nucleo.carpeta()
    const q = quotePosixShell(destino)
    await correrOFallar(plan.remoto, 'nucleo', `rm -rf ${q} && mkdir -p ${q}`)
    await plan.remoto.subirCarpeta(`${local}/bin`, `${destino}/bin`)
    await plan.remoto.subirCarpeta(`${local}/dist`, `${destino}/dist`)
    const leer =
      plan.leerArchivo ??
      (async (ruta: string) => (await import('node:fs/promises')).readFile(ruta, 'utf8'))
    await plan.remoto.escribir(`${destino}/package.json`, await leer(`${local}/package.json`))
    await plan.remoto.escribir(`${destino}/.huella`, `${huella}\n`)
  }
  return `${destino}/bin/dolphin.mjs`
}

function dolphinRemoto(revision: RevisionCruda, bin: string): string {
  return `${quotePosixShell(revision.node ?? 'node')} ${quotePosixShell(bin)} bots`
}

async function llevarCarpetaDelBot(
  plan: PlanDeLlevar,
  revision: RevisionCruda,
  dolphin: string
): Promise<void> {
  const llegada = `${revision.home}/.dolphin-remote/delfines-llegando/${plan.bot.id}`
  const q = quotePosixShell(llegada)
  await correrOFallar(plan.remoto, 'bot', `rm -rf ${q} && mkdir -p ${q}`)
  await plan.remoto.subirCarpeta(plan.bot.dir, llegada)
  const carpeta = carpetaEnElServidor(plan.carpeta, revision.home, revision.carpetaSugerida)
  await correrOFallar(
    plan.remoto,
    'bot',
    `${dolphin} importar ${q} --carpeta ${quotePosixShell(carpeta)} --reemplazar --json; r=$?; rm -rf ${q}; exit $r`,
    ESPERA_DE_SUBIDA_MS
  )
}

async function instalarServicio(
  plan: PlanDeLlevar,
  revision: RevisionCruda,
  bin: string,
  dolphin: string
): Promise<boolean> {
  // systemd toma la línea tal cual: cada ruta entre comillas dobles por si la casa tiene espacios.
  const comando = `"${revision.node ?? 'node'}" "${bin}" bots correr`
  // El linger sin sudo funciona donde polkit lo deja hacer sobre uno mismo; si no, queda el aviso.
  await plan.remoto.correr('loginctl enable-linger "$(id -un)" >/dev/null 2>&1; true', {
    esperaMs: 15_000
  })
  await correrOFallar(
    plan.remoto,
    'instalar',
    `${dolphin} instalar --comando ${quotePosixShell(comando)} --json`
  )
  const linger = await plan.remoto.correr(
    'loginctl show-user "$(id -un)" -p Linger --value 2>/dev/null'
  )
  return linger.salida.trim() === 'yes'
}

async function verificar(plan: PlanDeLlevar, dolphin: string): Promise<void> {
  const esperar = plan.esperar ?? ((ms) => new Promise((listo) => setTimeout(listo, ms)))
  for (let vuelta = 0; vuelta < VUELTAS_DE_VERIFICACION; vuelta += 1) {
    const activo = await plan.remoto.correr('systemctl --user is-active dolphin-bots.service')
    if (activo.codigo === 0) {
      const manada = await correrOFallar(plan.remoto, 'verificar', `${dolphin} --json`)
      const leida = JSON.parse(manada.split(/\r?\n/).findLast((l) => l.startsWith('{')) ?? '{}') as
        | Partial<ManadaDelNucleo>
        | undefined
      if (leida?.bots?.some((bot) => bot.id === plan.bot.id)) {
        return
      }
      throw new FalloDeEtapa('verificar', 'el servicio corre pero no encuentra al bot')
    }
    await esperar(ESPERA_ENTRE_VUELTAS_MS)
  }
  const diario = await plan.remoto.correr(
    'journalctl --user -u dolphin-bots.service -n 5 --no-pager 2>&1 | tail -n 3'
  )
  throw new FalloDeEtapa('verificar', diario.salida.trim() || 'el servicio no arrancó')
}

export async function llevarAlServidor(plan: PlanDeLlevar): Promise<ResultadoDeLlevar> {
  let etapa: EtapaDeLlevar = 'revisar'
  const avanzar = (siguiente: EtapaDeLlevar): void => {
    etapa = siguiente
    plan.alAvanzar?.(siguiente)
  }
  try {
    avanzar('revisar')
    const salida = await plan.remoto.correr(scriptDeRevision(plan.bot.motor, plan.bot.carpeta))
    const revision = leerRevision(plan.servidor, plan.bot.motor, plan.bot.id, salida.salida)
    if (!revision.listo || !revision.home) {
      return {
        ok: false,
        etapa: 'revisar',
        detail: 'falta-algo',
        revision: revisionPublica(revision)
      }
    }
    avanzar('nucleo')
    const bin = await subirNucleo(plan, revision)
    const dolphin = dolphinRemoto(revision, bin)
    avanzar('bot')
    await llevarCarpetaDelBot(plan, revision, dolphin)
    avanzar('instalar')
    const linger = await instalarServicio(plan, revision, bin, dolphin)
    avanzar('verificar')
    await verificar(plan, dolphin)
    avanzar('apartar')
    await plan.nucleo.json(['apartar', plan.bot.id])
    return { ok: true, linger }
  } catch (error) {
    const detalle = error instanceof Error ? error.message : String(error)
    return {
      ok: false,
      etapa: error instanceof FalloDeEtapa ? error.etapa : etapa,
      detail: detalle
    }
  }
}
