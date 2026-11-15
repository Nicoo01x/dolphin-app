/**
 * Lo que viaja por el cable entre el servidor de dolphin y la consola.
 *
 * Es el espejo de src/nucleo/tipos.ts del lado del navegador: si el núcleo
 * cambia una forma, esto es lo único que hay que poner al día acá.
 */

export type Costo = "gratis" | "barato" | "caro";

export interface Pasada {
  readonly verificador: string;
  readonly costo: Costo;
  readonly paso: boolean;
  readonly detalle: string;
  readonly gastado: number;
  readonly ms: number;
  /** Qué vuelta fue: 2 en adelante es el bucle de corrección. */
  readonly intento?: number;
  /** Los videos de lo que falló (la fase de pantalla), en `/videos/`. */
  readonly videos?: readonly string[];
  /** Falló porque la corrección de otra fase la rompió (su nombre)... */
  readonly rotaPor?: string;
  /** ...y esa corrección se deshizo: se volvió a la foto de antes. */
  readonly deshecha?: boolean;
  /** No corrió (faltaba Chrome, el revisor no contestó): dejó pasar, pero no es una fase pasada. */
  readonly salteada?: boolean;
}

export interface Forma {
  readonly archivos: number;
  readonly agregadas: number;
  readonly quitadas: number;
  readonly dependenciasNuevas: number;
  /** Qué archivos tocó, con sus líneas. Cosechas viejas no lo traen. */
  readonly tocados?: readonly { ruta: string; agregadas: number; quitadas: number }[];
  /** Tests que ya existían y la rama cambió o borró. Cosechas viejas no lo traen. */
  readonly testsCambiados?: readonly { ruta: string; quitadas: number; borrado?: boolean; asercionesQuitadas?: number }[];
  readonly trampas?: readonly { tipo: string; archivo: string; linea: number; detalle: string }[];
}

export interface Contrato {
  readonly superficies: readonly string[];
  readonly resumen?: string;
}

export interface Candidato {
  readonly universo: { readonly id: string; readonly rama: string; readonly ruta: string; readonly nacido: number };
  readonly vivo: boolean;
  readonly murioEn?: string;
  readonly porQue?: string;
  readonly pasadas: readonly Pasada[];
  readonly forma?: Forma;
  readonly enfoque?: string;
  readonly contrato?: Contrato;
  /** Qué modelo escribió en este universo. Las cosechas viejas no lo traen. */
  readonly modelo?: string;
  /** Cuánto tardó el agente escribiendo, en ms. Las cosechas viejas no lo traen. */
  readonly msAgente?: number;
  /** Lo que gastó el agente escribiendo y corrigiendo. Las cosechas viejas no lo traen. */
  readonly gastadoAgente?: number;
  /** La escritura salió de la memoria de respuestas, con este ahorro. */
  readonly deCache?: boolean;
  readonly ahorro?: number;
  /** Cada vuelta de corrección del agente, ya sumada en gastadoAgente. Las cosechas viejas no la traen. */
  readonly correcciones?: readonly Correccion[];
  /** Los tokens del agente, si el motor los informa (Codex y Antigravity informan esto y no plata). */
  readonly tokens?: Tokens;
  /** El motor no informó lo que costó esta rama: el gasto es un piso. */
  readonly costoDesconocido?: boolean;
}

export interface Tokens {
  readonly entrada: number;
  readonly salida: number;
  readonly cache?: number;
}

/** Una vuelta de corrección: qué fase la pidió, cuánto costó y si retomó la sesión de la escritura. */
export interface Correccion {
  readonly fase: string;
  readonly gastado: number;
  readonly ms: number;
  readonly reanudada?: boolean;
  readonly modelo?: string;
  readonly cayo?: boolean;
  readonly costoDesconocido?: boolean;
}

export interface Cosecha {
  readonly tarea: string;
  readonly cuando?: string;
  readonly candidatos: readonly Candidato[];
  readonly ganador?: Candidato;
  readonly porQueGano?: string;
  readonly gastado: number;
  readonly muertosGratis: number;
  readonly ms: number;
  /** Corrió con suscripción: la plata se midió, pero no se muestra. */
  readonly suscripcion?: boolean;
  /** Algún motor no informó su costo: `gastado` es un piso. */
  readonly costoDesconocido?: boolean;
  /** El draft PR que se abrió con la rama elegida. */
  readonly pr?: { readonly url: string };
  /** La rama elegida, entregada: commiteada y lista para mergear. */
  readonly entregada?: { readonly rama: string; readonly commit: string; readonly base: string; readonly ramaBase?: string };
  /** El parte de esta siembra, para abrir en `/partes/`. Las cosechas viejas no lo traen. */
  readonly parte?: string;
  /** Qué modelo hizo cada trabajo. Las cosechas viejas no lo traen. */
  readonly modelos?: {
    readonly estrategia: string;
    readonly escribir?: string;
    readonly corregir?: string;
    readonly revisar: string | null;
    /** Qué dijeron las cifras propias del repo sobre quién escribe. */
    readonly porDatos?: string;
    /** Una rama escribió con este otro modelo, para medirlo. */
    readonly explorar?: string;
  };
}

export type EstadoDeRama = "probada" | "en-revision" | "mergeada" | "descartada";

/** Una fila del historial: el resumen con el id para pedir el turno entero. */
export interface Turno {
  readonly id: string;
  readonly cuando?: string;
  readonly tarea: string;
  readonly gastado: number;
  readonly ms: number;
  readonly universos: number;
  readonly vivos: number;
  readonly ganador: string | null;
  /** Corrió con suscripción: la plata se midió, pero no se muestra. */
  readonly suscripcion?: boolean;
  /** Algún motor no informó su costo: `gastado` es un piso. */
  readonly costoDesconocido?: boolean;
  /** Lo justo para las métricas del tablero. Historiales viejos no lo traen. */
  readonly intentos?: readonly {
    readonly id: string;
    readonly vivo: boolean;
    readonly modelo?: string;
    readonly murioEn?: string;
    /** Lo que costó la rama: escribirla, corregirla y sus fases. */
    readonly gastado: number;
    /** Solo lo de las fases. Historiales viejos no lo traen. */
    readonly gastadoFases?: number;
    /** Cuántas fases corrió. Historiales viejos no lo traen. */
    readonly fases?: number;
  }[];
}

export interface RespuestaCosecha {
  readonly repo: string;
  readonly cosecha: Cosecha | null;
  readonly conWorktree: readonly string[];
  /** Lo que dice git de la rama elegida, si se entregó. */
  readonly estadoRama?: EstadoDeRama;
  /** Hay un remoto «origin»: se puede abrir un PR. */
  readonly puedePr?: boolean;
  /** Con la política «aprobar»: por qué mergearla o abrirle un PR necesita tu visto bueno. */
  readonly pideAprobacion?: string;
}

export interface RespuestaDiff {
  readonly hay: boolean;
  readonly porQue?: string;
  readonly texto?: string;
  readonly lineas?: number;
  readonly recortado?: boolean;
}
