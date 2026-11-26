import type { ChildProcessWithoutNullStreams } from 'node:child_process'
import { readFile } from 'node:fs/promises'
import { basename, dirname } from 'node:path'
import { createInterface } from 'node:readline'
import { spawnProcess } from '@dolphin/process-host'
import {
  analizarFuenteWinForms,
  rutaDelDesigner
} from '../../shared/winforms/winforms-form-detection'
import {
  leerEventoDelHost,
  type WinFormsBuild,
  type WinFormsCodigoDeError,
  type WinFormsEventoDeSesion,
  type WinFormsPlan
} from '../../shared/winforms/winforms-preview-types'
import {
  buscarBuilds,
  buscarProyecto,
  configuracionDelBuild,
  dentroDe,
  exesVecinos,
  fuenteMasNueva,
  leerCsproj,
  raizDelRepositorio,
  archivoDelEnsamblado
} from './winforms-build'
import { asegurarHost, ErrorDelHost, type Arquitectura } from './winforms-host'
import { arquitecturaDelHost, leerInfoPeDeArchivo, type InfoPe } from './winforms-pe'
import type { MemoriaDeBuilds } from './winforms-memoria'

/**
 * Una pestaña de vista previa: busca el build, elige la arquitectura, lanza el host y le pasa sus
 * eventos a la pestaña. Si un build no sirve (le falta una dependencia, no tiene la clase, no es .NET)
 * prueba el siguiente, y cuenta cuál descartó y por qué.
 */

export type PedidoDeSesion = {
  archivo: string
  /** La carpeta abierta en Dolphin: ahí se buscan copias del build si su proyecto no tiene. */
  raiz: string | null
  /** Un ensamblado elegido a mano: se prueba primero. */
  ensamblado?: string | null
}

type Emitir = (evento: WinFormsEventoDeSesion) => void

/** Errores que dependen del build y no del formulario: con otro build puede andar. */
const PROBAR_OTRO: ReadonlySet<WinFormsCodigoDeError> = new Set([
  'dependencia',
  'tipo-no-encontrado',
  'no-es-net',
  'ensamblado',
  'sin-ensamblado'
])

const MAX_INTENTOS = 5

function error(
  codigo: WinFormsCodigoDeError,
  mensaje: string,
  detalle = ''
): WinFormsEventoDeSesion {
  return { evento: 'error', codigo, mensaje, detalle }
}

export class SesionWinForms {
  private proceso: ChildProcessWithoutNullStreams | null = null
  private cerrada = false

  constructor(
    private readonly pedido: PedidoDeSesion,
    private readonly emitir: Emitir,
    private readonly memoria: MemoriaDeBuilds
  ) {}

  async iniciar(): Promise<void> {
    if (process.platform !== 'win32') {
      this.emitir(
        error('no-es-windows', 'La vista previa de formularios sólo funciona en Windows.')
      )
      return
    }
    const plan = await this.planificar()
    if (!plan || this.cerrada) {
      return
    }
    this.emitir({ evento: 'plan', plan })
    if (plan.builds.length === 0) {
      this.emitir(
        error(
          'sin-build',
          `No encontré un build de ${plan.ensambladoEsperado ?? 'este proyecto'}. Compilá el proyecto o elegí el ensamblado a mano.`
        )
      )
      return
    }
    await this.probarBuilds(plan)
  }

  private async planificar(): Promise<WinFormsPlan | null> {
    const { archivo } = this.pedido
    const designer = rutaDelDesigner(archivo)
    const [codigo, codigoDesigner] = await Promise.all([
      readFile(archivo, 'utf8').catch(() => null),
      designer ? readFile(designer, 'utf8').catch(() => null) : Promise.resolve(null)
    ])
    if (codigo === null) {
      this.emitir(error('sin-ensamblado', `No se pudo leer ${basename(archivo)}.`))
      return null
    }
    const fuente = analizarFuenteWinForms(codigo, codigoDesigner, basename(archivo))
    if (!fuente) {
      this.emitir(
        error(
          'no-es-formulario',
          `${basename(archivo)} no declara un formulario ni un control de WinForms.`
        )
      )
      return null
    }
    const proyecto = await buscarProyecto(archivo)
    const base = {
      archivo,
      designer: codigoDesigner === null ? null : designer,
      clase: fuente.clase,
      nombreCompleto: fuente.nombreCompleto,
      tipo: fuente.tipo
    }
    if (!proyecto) {
      if (this.pedido.ensamblado) {
        return {
          ...base,
          proyecto: null,
          ensambladoEsperado: null,
          builds: [{ ruta: this.pedido.ensamblado, modificado: 0, origen: 'elegido' }]
        }
      }
      this.emitir(
        error(
          'sin-proyecto',
          `No encontré el .csproj de ${basename(archivo)}: elegí el ensamblado a mano.`
        )
      )
      return null
    }
    const csproj = leerCsproj(await readFile(proyecto, 'utf8').catch(() => ''))
    const raiz =
      this.pedido.raiz && dentroDe(this.pedido.raiz, archivo)
        ? this.pedido.raiz
        : await raizDelRepositorio(dirname(proyecto))
    const recuerdo = this.memoria.leer(proyecto)
    const builds = await buscarBuilds({
      proyecto,
      csproj,
      raiz,
      preferido: this.pedido.ensamblado ?? recuerdo.funciono,
      conocidos: recuerdo.conocidos
    })
    this.memoria.recordar(proyecto, {
      conocidos: builds.filter((b) => b.origen !== 'proyecto').map((b) => b.ruta)
    })
    return {
      ...base,
      proyecto,
      ensambladoEsperado: archivoDelEnsamblado(proyecto, csproj),
      builds
    }
  }

  private async probarBuilds(plan: WinFormsPlan): Promise<void> {
    let ultimo: WinFormsEventoDeSesion | null = null
    let intento = 0
    for (const build of plan.builds.slice(0, MAX_INTENTOS)) {
      if (this.cerrada) {
        return
      }
      const info = await leerInfoPeDeArchivo(build.ruta)
      if (!info?.esNet) {
        this.emitir({
          evento: 'descartado',
          build,
          motivo: info ? 'no es un ensamblado .NET' : 'no se pudo leer'
        })
        continue
      }
      const vecinos = await Promise.all((await exesVecinos(build.ruta)).map(leerInfoPeDeArchivo))
      const arquitectura = arquitecturaDelHost(
        info,
        vecinos.filter((v): v is InfoPe => v !== null)
      )
      if (!arquitectura) {
        this.emitir({ evento: 'descartado', build, motivo: `compilado para ${info.maquina}` })
        continue
      }
      let resultado = await this.lanzar(plan, build, arquitectura, ++intento)
      if (
        resultado !== 'listo' &&
        resultado.evento === 'error' &&
        resultado.codigo === 'arquitectura'
      ) {
        // Un AnyCPU que arrastra una dependencia nativa de la otra arquitectura.
        const otra: Arquitectura = arquitectura === 'x86' ? 'x64' : 'x86'
        resultado = await this.lanzar(plan, build, otra, ++intento)
      }
      if (resultado === 'listo' || this.cerrada) {
        if (resultado === 'listo' && plan.proyecto) {
          this.memoria.recordar(plan.proyecto, { funciono: build.ruta })
        }
        return
      }
      ultimo = resultado
      if (ultimo.evento === 'error' && PROBAR_OTRO.has(ultimo.codigo)) {
        this.emitir({ evento: 'descartado', build, motivo: ultimo.mensaje })
        continue
      }
      this.emitir(ultimo)
      return
    }
    this.emitir(
      ultimo ??
        error('sin-build', `Ningún build de ${plan.ensambladoEsperado ?? 'este proyecto'} sirvió.`)
    )
  }

  /** Resuelve 'listo' cuando el formulario se ve, o con el error que impidió abrirlo. */
  private async lanzar(
    plan: WinFormsPlan,
    build: WinFormsBuild,
    arquitectura: Arquitectura,
    intento: number
  ): Promise<'listo' | WinFormsEventoDeSesion> {
    const desactualizado = await fuenteMasNueva(
      build,
      [plan.archivo, plan.designer, plan.archivo.replace(/\.cs$/i, '.resx')].filter(
        (f): f is string => Boolean(f)
      )
    )
    this.emitir({ evento: 'build', build, arquitectura, desactualizado, intento })
    let exe: string
    try {
      exe = await asegurarHost(arquitectura, () => this.emitir({ evento: 'compilando-host' }))
    } catch (e) {
      return error('host', e instanceof ErrorDelHost ? e.message : String(e))
    }
    const config = await configuracionDelBuild(build.ruta)
    // Justo antes de lanzar: la pestaña pudo cerrarse mientras se buscaba el build o el .config.
    if (this.cerrada) {
      return error('host', 'cerrada')
    }
    const proceso = spawnProcess({
      program: exe,
      args: [build.ruta, plan.nombreCompleto, ...(config ? ['--config', config] : [])],
      cwd: dirname(build.ruta),
      stdio: ['pipe', 'pipe', 'pipe'],
      timeoutMs: null
    })
    this.proceso = proceso
    proceso.stdin.on('error', () => undefined)
    let errores = ''
    proceso.stderr.on('data', (chunk: Buffer) => {
      errores = (errores + chunk.toString('utf8')).slice(-4000)
    })
    return new Promise((resolver) => {
      let listo = false
      let resuelto = false
      const resolverUnaVez = (valor: 'listo' | WinFormsEventoDeSesion): void => {
        if (!resuelto) {
          resuelto = true
          resolver(valor)
        }
      }
      createInterface({ input: proceso.stdout, crlfDelay: Infinity }).on('line', (linea) => {
        const evento = leerEventoDelHost(linea)
        if (!evento) {
          return
        }
        if (evento.evento === 'error' && !listo) {
          resolverUnaVez(evento)
          return
        }
        if (evento.evento === 'listo') {
          listo = true
          resolverUnaVez('listo')
        }
        this.emitir(evento)
      })
      proceso.once('error', (e) => resolverUnaVez(error('host', e.message)))
      proceso.once('exit', (codigo) => {
        if (this.proceso === proceso) {
          this.proceso = null
        }
        if (!listo) {
          resolverUnaVez(
            error(
              'host',
              `El host terminó sin abrir el formulario (código ${codigo ?? '?'}).`,
              errores
            )
          )
        } else if (!this.cerrada) {
          this.emitir({ evento: 'cerrado' })
        }
      })
    })
  }

  ordenar(orden: 'refrescar' | 'cerrar-dialogos'): void {
    this.proceso?.stdin.write(`${orden}\n`)
  }

  cerrar(): void {
    this.cerrada = true
    const proceso = this.proceso
    this.proceso = null
    if (!proceso) {
      return
    }
    proceso.stdin.write('cerrar\n')
    proceso.stdin.end()
    // Si el formulario está trabado (un diálogo modal, un constructor que no vuelve), se lo mata.
    const plazo = setTimeout(() => proceso.kill(), 1500)
    proceso.once('exit', () => clearTimeout(plazo))
  }
}
