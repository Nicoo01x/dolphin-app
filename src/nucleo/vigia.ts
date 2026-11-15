import { ordenarPorCosto } from "./porton.js";
import type { ContextoDeVerificacion, Universo, Verificador } from "./tipos.js";

/**
 * El vigía: mientras alguien escribe código —una persona o un agente—,
 * cada cambio vuelve a pasar por las fases y por la pantalla, hasta que
 * todo da verde. Es el portón en modo «watch»: lo que la siembra hace al
 * final, el vigía lo hace mientras tanto, y el error aparece cuando
 * todavía es barato arreglarlo.
 *
 * Acá vive la lógica (cuándo correr, qué juntar); quién avisa los cambios
 * y quién mira la pantalla se le pasan desde afuera. Así se prueba sin
 * disco ni navegador.
 */

export interface Resultado {
  readonly nombre: string;
  readonly paso: boolean;
  readonly detalle: string;
  readonly evidencia?: string;
  readonly ms: number;
  /** No corrió (ver Veredicto.salteada): no frena, pero tampoco está en verde. */
  readonly salteada?: boolean;
}

export interface Vuelta {
  readonly numero: number;
  /** Qué archivos la dispararon (o «(arranque)»). */
  readonly por: readonly string[];
  readonly resultados: readonly Resultado[];
  readonly verde: boolean;
  readonly ms: number;
}

export interface OpcionesVigia {
  readonly universo: Universo;
  readonly verificadores: readonly Verificador[];
  /** Lo declarado: qué pantallas mira el tester. */
  readonly contexto?: ContextoDeVerificacion;
  /** Cuánto esperar sin cambios antes de correr: guardar un archivo dispara varios avisos. */
  readonly esperaMs?: number;
  readonly alEmpezar?: (numero: number, por: readonly string[]) => void;
  readonly alTerminar?: (vuelta: Vuelta) => void;
}

export interface Vigia {
  /** Corre la primera vuelta ya, sin esperar un cambio. */
  arrancar(): void;
  /** Un archivo cambió. */
  avisar(archivo: string): void;
  /** Se resuelve con la primera vuelta en verde (la que venga). */
  hastaVerde(): Promise<Vuelta>;
  /** Deja de mirar; espera a que termine la vuelta en curso, si hay una. */
  detener(): Promise<void>;
}

export function crearVigia(opciones: OpcionesVigia): Vigia {
  const espera = opciones.esperaMs ?? 400;
  const pendientes = new Set<string>();
  const esperandoVerde: ((vuelta: Vuelta) => void)[] = [];
  let numero = 0;
  let corriendo: Promise<void> | null = null;
  let temporizador: ReturnType<typeof setTimeout> | undefined;
  let detenido = false;

  async function vuelta(por: readonly string[]): Promise<Vuelta> {
    numero += 1;
    const n = numero;
    opciones.alEmpezar?.(n, por);
    const desde = Date.now();
    const resultados: Resultado[] = [];

    // Todas las fases, de lo barato a lo caro, y sin cortar en la primera:
    // mientras se escribe sirve ver todo lo que está en rojo, no solo lo primero.
    for (const verificador of ordenarPorCosto(opciones.verificadores)) {
      const t0 = Date.now();
      const v = await verificador.correr(opciones.universo, opciones.contexto).catch((error: unknown) => ({
        paso: true,
        salteada: true,
        detalle: `${verificador.nombre}: se rompió el verificador, se salteó (${error instanceof Error ? error.message : String(error)})`,
        evidencia: undefined,
      }));
      resultados.push({
        nombre: verificador.nombre,
        paso: v.paso,
        detalle: v.detalle,
        ...(v.evidencia ? { evidencia: v.evidencia } : {}),
        ms: Date.now() - t0,
        ...(v.salteada ? { salteada: true } : {}),
      });
    }

    const hecha: Vuelta = { numero: n, por, resultados, verde: resultados.every((r) => r.paso), ms: Date.now() - desde };
    opciones.alTerminar?.(hecha);
    if (hecha.verde) for (const resolver of esperandoVerde.splice(0)) resolver(hecha);
    return hecha;
  }

  /** Mientras haya cambios sin mirar, otra vuelta. Nunca dos a la vez. */
  async function ciclo(): Promise<void> {
    try {
      while (!detenido && pendientes.size > 0) {
        const por = [...pendientes];
        pendientes.clear();
        await vuelta(por);
      }
    } finally {
      corriendo = null;
    }
  }

  const disparar = () => {
    if (!detenido && !corriendo && pendientes.size > 0) corriendo = ciclo();
  };

  return {
    arrancar() {
      pendientes.add("(arranque)");
      disparar();
    },
    avisar(archivo) {
      if (detenido) return;
      pendientes.add(archivo);
      // Si hay una vuelta corriendo, este cambio entra en la próxima: el
      // ciclo la corre apenas termina la actual.
      clearTimeout(temporizador);
      temporizador = setTimeout(disparar, espera);
    },
    hastaVerde() {
      return new Promise((resolver) => esperandoVerde.push(resolver));
    },
    async detener() {
      detenido = true;
      clearTimeout(temporizador);
      await corriendo;
    },
  };
}

/** Lo que no es código de la app: el vigía no se despierta por esto. */
const IGNORADOS = /(^|[\\/])(\.git|node_modules|\.dolphin|dist|build|out|coverage|\.next|\.vite|\.turbo|\.cache)([\\/]|$)/;

/** ¿Este cambio puede cambiar lo que se ve o lo que se prueba? */
export function importa(archivo: string): boolean {
  if (archivo.trim() === "") return false;
  if (IGNORADOS.test(archivo)) return false;
  // Los temporales de los editores: guardar en vim, VS Code o JetBrains los
  // crea y los borra, y la escritura atómica deja «estilos.css.tmp.20260.f6cc…».
  return !/(~|\.sw[a-p]|\.tmp(\.[\w.-]+)?|\.crdownload|___jb_\w+___)$/i.test(archivo);
}
