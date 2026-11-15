/**
 * El vocabulario de Dolphin.
 *
 * Una TAREA se siembra en varios UNIVERSOS (copias aisladas del repo).
 * Cada universo produce un CANDIDATO, que tiene que cruzar el PORTÓN:
 * una escalera de VERIFICADORES ordenada por costo. Lo que no cuesta
 * nada corre primero y mata a la mayoría; el modelo caro recién decide
 * entre los que quedaron vivos.
 */

/** Lo que sale del bolsillo por correr un verificador. */
export type Costo = "gratis" | "barato" | "caro";

export const ORDEN_DE_COSTO: readonly Costo[] = ["gratis", "barato", "caro"];

/** Una copia aislada del repo donde trabaja un intento. */
export interface Universo {
  readonly id: string;
  readonly rama: string;
  /** Ruta al worktree en disco. */
  readonly ruta: string;
  /**
   * El commit desde el que nació: contra esto se mide lo que hizo. Antes se
   * adivinaba por el asunto «dolphin: …» del HEAD, y una tarea sembrada
   * encima de otra ya entregada mostraba también el trabajo de la otra.
   */
  readonly base?: string;
  readonly nacido: number;
  /**
   * El repo del que salió. El worktree se borra al limpiar, así que lo que haya que guardar de la
   * rama —la bitácora de lo que se corrió, ver nucleo/bitacora.ts— va ahí y no adentro del universo.
   */
  readonly repo?: string;
  /** Puerto y base propios: sin esto, dos universos levantando la app se
   *  pisan y el portón mata al candidato equivocado. */
  readonly entorno?: Readonly<Record<string, string>>;
  /** Cómo se dejó listo el worktree (dependencias, archivos): ver entorno.ts. */
  readonly preparado?: { readonly pasos: readonly string[]; readonly porQue?: string };
}

/** El resultado de UN verificador sobre UN candidato. */
export interface Veredicto {
  readonly paso: boolean;
  /** En voz humana: qué pasó. Es lo que se le muestra a la persona. */
  readonly detalle: string;
  /** Salida cruda, captura, traza: lo que prueba el veredicto. */
  readonly evidencia?: string;
  /** Videos de lo que falló, por nombre de archivo en `.dolphin/videos/`. */
  readonly videos?: readonly string[];
  /**
   * No corrió: faltaba con qué (Chrome, el comando), el revisor no contestó
   * en formato, o se rompió el verificador. Deja pasar —el código no tiene
   * la culpa— pero no cuenta como pasada: se dice que se salteó.
   */
  readonly salteada?: boolean;
  /** Cuánto esperó en la cola de verificación antes de que le tocara correr (ms). Ausente: no esperó. */
  readonly esperaMs?: number;
}

/** Lo que el portón sabe de este candidato cuando lo manda a verificar. */
export interface ContextoDeVerificacion {
  /** Lo que el agente declaró haber tocado. Sin esto, el escalón de
   *  pantalla prueba a ciegas. */
  readonly contrato?: Contrato;
  readonly enfoque?: string;
  /** Qué modelo escribió este universo: la revisión tiene que ser de otro. */
  readonly modelo?: string;
}

export interface Verificador {
  readonly nombre: string;
  readonly costo: Costo;
  /** Lo que gastó de verdad, en dólares. Los gratis devuelven 0. */
  correr(universo: Universo, contexto?: ContextoDeVerificacion): Promise<Veredicto & { gastado?: number }>;
}

/** Cuánto cambió un candidato. Es lo que decide quién es "el más simple". */
export interface Forma {
  readonly archivos: number;
  readonly agregadas: number;
  readonly quitadas: number;
  readonly dependenciasNuevas: number;
  /** Qué archivos tocó, con sus líneas: es lo que la pantalla lista por
   *  rama, con el ícono de cada lenguaje. Tope de 30 para que una cosecha
   *  no pese megabytes. */
  readonly tocados?: readonly { ruta: string; agregadas: number; quitadas: number }[];
  /** Tests que ya existían y esta rama cambió o borró (ver tests-intactos.ts). */
  readonly testsCambiados?: readonly { ruta: string; quitadas: number; borrado?: boolean; asercionesQuitadas?: number }[];
  /** Hallazgos de trampas en el diff, aunque la política sea «avisar». */
  readonly trampas?: readonly HallazgoTrampa[];
}

export interface HallazgoTrampa {
  readonly tipo: string;
  readonly archivo: string;
  readonly linea: number;
  readonly detalle: string;
}

export interface Pasada {
  readonly verificador: string;
  readonly costo: Costo;
  readonly paso: boolean;
  readonly detalle: string;
  readonly gastado: number;
  readonly ms: number;
  /** Qué vuelta fue: 1 la primera, 2 después de corregir. Ausente = 1. */
  readonly intento?: number;
  /** Los videos de lo que falló, en `.dolphin/videos/` (la fase de pantalla). */
  readonly videos?: readonly string[];
  /** Falló porque la corrección de otra fase la rompió: el nombre de esa fase. */
  readonly rotaPor?: string;
  /** Y esa corrección se deshizo: el universo volvió a la foto de antes de corregir. */
  readonly deshecha?: boolean;
  /** No corrió (ver Veredicto.salteada): dejó pasar, pero no es una fase pasada. */
  readonly salteada?: boolean;
  /** Cuánto de `ms` fue esperar turno en la cola de verificación (ver cola-de-verificacion.ts). */
  readonly esperaMs?: number;
}

export interface Candidato {
  readonly universo: Universo;
  readonly vivo: boolean;
  /** Qué modelo escribió acá. Es lo que deja ver quién hizo qué por cuánto. */
  readonly modelo?: string;
  /** Cuánto tardó el agente escribiendo, en ms: el primer tramo de la corrida. */
  readonly msAgente?: number;
  /** Lo que gastó el agente en esta rama, escribiendo y corrigiendo, en dólares.
   *  Las fases van aparte, en cada pasada. */
  readonly gastadoAgente?: number;
  /** La escritura salió de la memoria de respuestas, con este ahorro. */
  readonly deCache?: boolean;
  readonly ahorro?: number;
  /** Nombre del verificador que lo mató, si murió. */
  readonly murioEn?: string;
  readonly porQue?: string;
  readonly pasadas: readonly Pasada[];
  readonly forma?: Forma;
  /** El ángulo que le tocó probar. */
  readonly enfoque?: string;
  readonly contrato?: Contrato;
  /** Cada vuelta de corrección del agente, en orden: ya están sumadas en `gastadoAgente`. */
  readonly correcciones?: readonly Correccion[];
  /** Los tokens del agente en esta rama, escribiendo y corrigiendo, si el motor los informa. */
  readonly tokens?: Tokens;
  /** El motor no informó lo que costó esta rama: `gastadoAgente` se queda corto (ver Trabajo). */
  readonly costoDesconocido?: boolean;
  /**
   * La rama cambió de motor a mitad de camino porque el titular no pudo trabajar (ver relevo.ts).
   * Lo que gastaron los que se fueron ya está adentro de `gastadoAgente`.
   */
  readonly relevo?: { readonly salio: readonly string[]; readonly entro: string };
}

/** Una vuelta de corrección: qué fase la pidió, cuánto costó y cómo la encaró el agente. */
export interface Correccion {
  readonly fase: string;
  readonly gastado: number;
  readonly ms: number;
  /** Retomó la sesión en la que escribió, en vez de releer el repo de cero (ver claude.ts). */
  readonly reanudada?: boolean;
  readonly modelo?: string;
  /** La corrección misma se cayó: lo que gastó se cuenta igual. */
  readonly cayo?: boolean;
  /** El motor no informó lo que costó esta vuelta (ver Trabajo). */
  readonly costoDesconocido?: boolean;
}

/** Lo que Dolphin entrega al final de una siembra. */
export interface Cosecha {
  readonly tarea: string;
  readonly candidatos: readonly Candidato[];
  readonly ganador?: Candidato;
  /** Por qué ganó ese y no otro, en voz humana. */
  readonly porQueGano?: string;
  readonly gastado: number;
  /** Cuántos murieron sin gastar un solo token. Es la promesa del producto. */
  readonly muertosGratis: number;
  readonly ms: number;
  /** El draft PR que se abrió con la rama elegida, si se abrió (y cuándo). */
  readonly pr?: { readonly url: string; readonly en?: string };
  /** Cuándo se mergeó o se descartó la rama desde la consola. Lo que se
   *  hace en la terminal git lo sabe igual, pero sin la hora. */
  readonly mergeadaEn?: string;
  readonly descartadaEn?: string;
  /** La elegida pasó pero git no la pudo commitear (sin identidad, una firma que no contestó): el porqué. */
  readonly sinEntregar?: string;
  /** La rama elegida, entregada: commiteada con la identidad del dueño, lista para mergear. */
  readonly entregada?: {
    readonly rama: string;
    readonly commit: string;
    readonly base: string;
    readonly ramaBase?: string;
  };
  /** El parte de esta siembra, en `.dolphin/partes/` (ver parte.ts). */
  readonly parte?: string;
  /** Qué modelo hizo cada trabajo: escribir, corregir, revisar (ver router.ts). */
  readonly modelos?: {
    readonly estrategia: string;
    readonly escribir?: string;
    readonly corregir?: string;
    readonly revisar: string | null;
    /** Qué dijeron las cifras propias del repo sobre quién escribe (ver desempeno.ts). */
    readonly porDatos?: string;
    /** Un universo escribió con este otro modelo, para medirlo. */
    readonly explorar?: string;
  };
  /** El agente corrió con una suscripción ya pagada: los montos se miden
   *  igual, pero no se muestran — serían plata que nadie pagó por uso. */
  readonly suscripcion?: boolean;
  /** Alguna rama corrió con un motor que no informa su costo: `gastado` es un piso, no el total. */
  readonly costoDesconocido?: boolean;
}

/** Qué superficie del producto tocó un universo. Es lo que le permite al
 *  escalón de pantalla probar lo que cambió en vez de ir a ciegas. */
export interface Contrato {
  /** Rutas o pantallas afectadas: "/facturas", "app/panel". */
  readonly superficies: readonly string[];
  /** En una línea, qué cambió de cara al usuario. */
  readonly resumen?: string;
  /** Lo que el agente aprendió del repo y le serviría a quien venga después (ver notas.ts). */
  readonly nota?: string;
}

export interface Trabajo {
  readonly forma: Forma;
  readonly gastado: number;
  readonly contrato?: Contrato;
  /** El modelo que realmente corrió: lo declara el agente, no se adivina. */
  readonly modelo?: string;
  /** Salió de la memoria de respuestas: no se pagó ni un token. */
  readonly deCache?: boolean;
  /** Lo que costó la primera vez: es lo que este reuso ahorró. */
  readonly ahorro?: number;
  /** Una corrección que retomó la sesión de la escritura (ver claude.ts). */
  readonly reanudada?: boolean;
  /** Lo que el motor informó en tokens: Codex y Antigravity informan esto y no plata. */
  readonly tokens?: Tokens;
  /**
   * El motor no informó cuánto costó: `gastado` es 0 porque no se sabe, no
   * porque haya sido gratis. Un cero falso hace pasar por barato al que no
   * dice su precio.
   */
  readonly costoDesconocido?: boolean;
  /**
   * La rama cambió de manos a mitad de camino: el titular no pudo trabajar y la siguió otro motor
   * en el mismo worktree (ver relevo.ts). Sin esto, el trabajo quedaría firmado por quien lo
   * terminó y nadie sabría que el primero se cayó ni que su gasto está adentro de `gastado`.
   */
  readonly relevo?: { readonly salio: readonly string[]; readonly entro: string };
}

/** Tokens de una corrida, como los informa el motor. */
export interface Tokens {
  readonly entrada: number;
  readonly salida: number;
  /** De la entrada, cuánto se leyó del caché. */
  readonly cache?: number;
}

/** Lo que se le cuenta al agente cuando una fase lo rebotó. */
export interface Falla {
  readonly verificador: string;
  readonly detalle: string;
  readonly evidencia?: string;
}

/** Quien escribe el código dentro de un universo. Se inyecta: puede ser
 *  un agente de verdad, otro modelo, o uno falso en los tests. */
export interface Agente {
  readonly nombre: string;
  /** `enfoque` es el ángulo que le toca a ESTE universo: es lo que hace que
   *  sembrar ocho no sea pagar ocho veces por la misma idea. */
  trabajar(universo: Universo, tarea: string, enfoque?: { nombre: string; instruccion: string; modelo?: string }, senal?: AbortSignal): Promise<Trabajo>;
  /** El bucle Code → Test → FIX: recibe el veredicto que lo rebotó y
   *  corrige en el mismo universo. Opcional: sin esto no hay reintentos. */
  corregir?(universo: Universo, tarea: string, falla: Falla, enfoque?: { nombre: string; instruccion: string; modelo?: string }): Promise<Trabajo>;
  /** Retoma el turno de escritura con un mensaje de un compañero, si el motor conserva sesión. */
  retomar?(universo: Universo, mensaje: string): Promise<Trabajo | undefined>;
}

/** Quien crea y destruye los universos. Lo real usa git worktree. */
export interface Taller {
  abrir(id: string, rama: string): Promise<Universo>;
  cerrar(universo: Universo): Promise<void>;
  /** Deja el turno `n` del agente guardado, para volver a él después (ver turnos.ts). Opcional. */
  turno?(universo: Universo, n: number, que: string): Promise<void>;
  /** La foto del universo antes de una corrección. Opcional: sin esto no hay vuelta atrás. */
  guardar?(universo: Universo): Promise<string>;
  /** Vuelve a la foto y devuelve la forma medida de nuevo. */
  volver?(universo: Universo, punto: string): Promise<Forma>;
}

/**
 * Un agente que falló DESPUÉS de haber gastado.
 *
 * El costo hay que devolverlo igual: si se pierde, la cosecha informa de
 * menos y además cuenta al candidato como «muerto gratis», que es
 * justamente la métrica que el producto pone de titular. Falsificarla
 * hacia el lado favorable es lo peor que puede hacer esta herramienta.
 */
export class FalloDelAgente extends Error {
  constructor(
    mensaje: string,
    readonly gastado: number,
    /** El motor corrió pero no informa su costo: no se sabe si gastó (ver Trabajo). */
    readonly costoDesconocido = false,
  ) {
    super(mensaje);
    this.name = "FalloDelAgente";
  }
}
