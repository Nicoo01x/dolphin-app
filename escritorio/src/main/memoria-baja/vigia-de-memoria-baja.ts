import {
  resolverModoPocaRam,
  umbralPocaRamBytes,
  type AvisoDeMemoriaBaja,
  type EstadoDeMemoriaBaja,
  type ModoPocaRam,
  type ModoPocaRamSettings
} from '../../shared/modo-poca-ram'
import type { HostMemory, MemorySnapshot } from '../../shared/process-stats-types'
import {
  EPISODIO_INICIAL,
  evaluarMuestra,
  modoActivo,
  silenciar,
  type EpisodioDeMemoriaBaja
} from './episodio-de-memoria-baja'
import { loQueMasPesa } from './lo-que-mas-pesa'

/** Cada cuánto se mira la memoria. Leer lo libre es una llamada al sistema, no un proceso. */
export const INTERVALO_DE_MUESTREO_MS = 5_000

export type DependenciasDelVigia = {
  readonly leerAjustes: () => ModoPocaRamSettings | null | undefined
  /** Lo barato: lo libre y lo total. Corre cada muestra. */
  readonly leerMemoria: () => Promise<Pick<HostMemory, 'availableMemory' | 'totalMemory'>>
  /** Lo caro: la foto entera con cada proceso. Corre sólo cuando hay que avisar. */
  readonly sacarFoto: () => Promise<Pick<MemorySnapshot, 'worktrees' | 'totalMemory'>>
  readonly avisar: (aviso: AvisoDeMemoriaBaja) => void
  readonly ahora?: () => number
}

/**
 * El que mira la memoria cada pocos segundos y decide, con `evaluarMuestra`, cuándo avisar.
 * Apagado no muestrea nada. Cambiar de modo empieza de cero: prender «siempre» avisa enseguida.
 */
export class VigiaDeMemoriaBaja {
  private episodio: EpisodioDeMemoriaBaja = EPISODIO_INICIAL
  private modoAnterior: ModoPocaRam | null = null
  private ultima: Pick<HostMemory, 'availableMemory' | 'totalMemory'> | null = null
  private ocupado = false

  constructor(private readonly deps: DependenciasDelVigia) {}

  private ahora(): number {
    return this.deps.ahora?.() ?? Date.now()
  }

  private modo(): ModoPocaRam {
    return resolverModoPocaRam(this.deps.leerAjustes()?.modoPocaRam)
  }

  /** Una vuelta. Si la anterior sigue (una foto lenta), ésta se saltea en vez de apilarse. */
  async muestrear(): Promise<void> {
    if (this.ocupado) {
      return
    }
    this.ocupado = true
    try {
      await this.vuelta()
    } catch (error) {
      console.warn('[memoria-baja] no se pudo leer la memoria', error)
    } finally {
      this.ocupado = false
    }
  }

  private async vuelta(): Promise<void> {
    const ajustes = this.deps.leerAjustes()
    const modo = this.modo()
    if (modo !== this.modoAnterior) {
      this.episodio = { ...EPISODIO_INICIAL, silenciadoHasta: this.episodio.silenciadoHasta }
      this.modoAnterior = modo
    }
    if (modo === 'apagado') {
      // El cambio de modo de arriba ya dejó el episodio en cero; una muestra vieja no se muestra.
      this.ultima = null
      return
    }
    const memoria = await this.deps.leerMemoria()
    this.ultima = memoria
    const { estado, avisar } = evaluarMuestra(this.episodio, {
      disponible: memoria.availableMemory,
      umbral: umbralPocaRamBytes(ajustes),
      modo,
      ahora: this.ahora()
    })
    this.episodio = estado
    if (!avisar) {
      return
    }
    const foto = await this.deps.sacarFoto()
    this.deps.avisar({
      disponible: memoria.availableMemory,
      total: memoria.totalMemory,
      dolphin: Math.max(0, foto.totalMemory),
      masPesado: loQueMasPesa(foto),
      motivo: modo === 'siempre' ? 'siempre' : 'umbral'
    })
  }

  silenciar(ms: number): void {
    this.episodio = silenciar(this.episodio, this.ahora(), ms)
  }

  activo(): boolean {
    return modoActivo(this.episodio, this.modo())
  }

  estado(): EstadoDeMemoriaBaja {
    return {
      disponible: this.ultima?.availableMemory ?? null,
      total: this.ultima?.totalMemory ?? null,
      activo: this.activo()
    }
  }
}
