import { execFile } from "node:child_process";
import { access, mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import { esClonado } from "../nucleo/proyectos.js";
import { promisify } from "node:util";
import { join } from "node:path";
import {
  comandoDePegado,
  correrPegado,
  leerPegado,
  nombreDeLaImagen,
  type Plataforma,
} from "../nucleo/imagen-del-portapapeles.js";
import { planificadorConClaude, vozDelLider } from "../agentes/planificador.js";
import { verificadorRevisor } from "../agentes/revisor.js";
import { cambiosPorCompanero, correrEquipo, deshacerDelEquipo, volverAlTurnoEnElEquipo, type Aprobacion, type CambiosDeCompanero, type EventoEquipo, type ResultadoDeEquipo } from "../equipo/equipo.js";
import { editarPlan, lineasDelPlan } from "../equipo/editar-plan.js";
import { objetivoDeTarjeta, seguirConTarjeta } from "../equipo/con-tarjeta.js";
import { buscarTarjeta, leerTablero, type Tarjeta } from "../nucleo/tarjetas.js";
import { laFrenan } from "../nucleo/tarjetas-espera.js";
import { portonDelProyecto } from "../nucleo/porton-del-proyecto.js";
import { costoMaximo, type Planificador, type TareaDelPlan } from "../nucleo/plan.js";
import { pedidoConPistas, siguientePaso, type Intento } from "../nucleo/persistir.js";
import { correrOraculo, guardarEvidencia, pedidoConOraculo, porQueDelOraculo, separarOraculo, type VeredictoDelOraculo } from "../nucleo/oraculo.js";
import { decidirDeLaNoche, textoDelParte, ultimaNoche } from "../manana.js";
import { comparar, elegir, MOTORES_POR_DEFECTO, textoDeComparacion } from "../comparar.js";
import { deBugAArreglo, textoDelBug } from "../bug.js";
import { doctor, textoDelDoctor } from "../doctor.js";
import { armarInforme, informeEnTexto } from "../nucleo/informe.js";
import { turnosDe } from "../nucleo/turnos.js";
import { agendar } from "../nucleo/calendario.js";
import { buscarEnCharla, cuandoSeDijo, guardarMensaje, leerCharla } from "./charla-guardada.js";
import { leerProgramacion } from "./programar.js";
import { descartarRama, mergearRama } from "../nucleo/entrega.js";
import { gitValor } from "../nucleo/git.js";
import { leerBandeja, marcarParaLaNoche, sumarAsuntos } from "../nucleo/bandeja.js";
import { leerConfig } from "../nucleo/config.js";
import { decirEstimacion, pasaDelTope } from "../nucleo/estimar.js";
import { contextoDeMemoria, leerMemoria, memoriasRelevantes, recordar, registrarUsos } from "../nucleo/memoria.js";
import { importarInstrucciones } from "../nucleo/importar-instrucciones.js";
import { todosAlTablero } from "../nucleo/ideas-del-codigo.js";
import { configPropuesta, decirDeteccion, detectarProyecto } from "../nucleo/arranque.js";
import { carpetaDeDolphin, escribirDeUna } from "../nucleo/escritura.js";
import { sumarProyecto } from "../nucleo/proyectos.js";
import { modeloDelEscalon, motorDe, type Motor } from "../nucleo/router.js";
import { decirVoz, escucharVoces, type TipoDeVoz, type Voz } from "../nucleo/voces.js";
import { alCambiarDeCuenta, cuentaAgotada, cuentaEnUso, cuentasDeClaude, CUENTA_DE_SIEMPRE, elegirCuenta, type Cuenta } from "../nucleo/cuentas.js";
import { TRABADO_MS, type Avisador, type TipoDeAviso } from "../nucleo/avisos.js";
import { aplicarAlEquipo, equipoInicial, type EstadoEquipo } from "./equipo-estado.js";
import { esAprobacion, nombreDeCarpeta, pensadorConClaude, pensarConReglas, type Decision, type Pensador } from "./pensar.js";

/**
 * La conversación con Dolphin y lo que está corriendo. Lo que escribís en el prompt entra acá:
 * un mensaje suelto pasa primero por `pensar` (charla, tarea o proyecto; ver pensar.ts), y según
 * eso se contesta, lo hace un agente o se arma un equipo (un líder lo parte y los compañeros lo hacen),
 * `/memoria` y `/idea` escriben en los mismos archivos que la
 * app de escritorio. Todo corre en este proceso con el núcleo de siempre: no es otro motor.
 */

export type QuienHabla = "vos" | "dolphin" | "sistema";

export interface Mensaje {
  readonly t: number;
  readonly quien: QuienHabla;
  texto: string;
  tono?: "normal" | "bien" | "mal" | "aviso";
}

export interface Trabajo {
  readonly tipo: "equipo";
  readonly desde: number;
  readonly titulo: string;
  terminado?: number;
}

export interface ConfigDeSesion {
  readonly repo: string;
  readonly agente: Motor;
  /** --dangerously-skip-permissions: el agente no pide permisos, la política del portón sigue encima. */
  readonly automatico: boolean;
  readonly verificar?: readonly string[];
  /** Se abrió fuera de un repo: se ve todo, pero para trabajar hay que elegir un proyecto. */
  readonly sinRepo?: boolean;
  /**
   * true: la charla se anota en .dolphin/charla.jsonl y vuelve al abrir. Lo prenden la app y el canal
   * de Telegram; una sesión suelta (un script, un test) no escribe en el repo por su cuenta.
   */
  readonly guardarCharla?: boolean;
  /** Quién decide qué hacer con cada mensaje. Por defecto, Claude (o las reglas con el agente de mentira). */
  readonly pensar?: Pensador;
  /** Cómo avisar cuando algo termina, se traba o espera (ver nucleo/avisos.ts). Sin esto, no avisa. */
  readonly avisador?: Avisador;
  readonly ahora?: () => number;
}

/** Lo que Dolphin propuso y espera tu respuesta: el pedido mejorado y sus preguntas. */
export interface Propuesta {
  readonly prompt: string;
  readonly preguntas: readonly string[];
  /** Sin repo: la carpeta que va a crear. */
  readonly carpeta?: string;
}

/** Un renglón de la terminal de un agente: lo que dijo, qué herramienta usó, lo que le devolvieron. */
export interface RenglonDeTerminal {
  readonly t: number;
  readonly tipo: TipoDeVoz | "dolphin";
  readonly texto: string;
  /** El id de la herramienta, para emparejar su resultado (ver Voz.ref). */
  readonly ref?: string;
}

const TOPE_DE_TERMINAL = 600;

/** Los modelos que se pueden elegir como principal, de más caro a más barato. */
export const MODELOS_PRINCIPALES = ["opus", "sonnet", "haiku"] as const;

/** Lo que la app tiene que hacer después: abrir otro repo (y, si hay, arrancar el equipo ahí). */
export type Siguiente = "salir" | { readonly abrir: string; readonly despues?: string } | void;

const correr = promisify(execFile);

export const COMANDOS: readonly { nombre: string; uso: string; que: string }[] = [
  { nombre: "/objetivo", uso: "/objetivo <objetivo> [--oraculo <comando>]", que: "lo persigue hasta lograrlo (y, con oráculo, hasta que tu comando salga en 0): reintenta con lo que falló, escala de modelo y te pide ayuda solo si se traba" },
  { nombre: "/equipo", uso: "/equipo <tarea>", que: "un líder la parte y un equipo la hace a la vez (lo mismo que escribir la tarea sola)" },
  { nombre: "/hacer", uso: "/hacer <tarjeta>", que: "el equipo toma esa tarjeta del tablero: con tu «dale» pasa a Haciendo y, si sale, a Para revisar" },
  { nombre: "/cuenta", uso: "/cuenta [n]", que: "las cuentas de Claude (las del escritorio y la de siempre) y cuál usa; si una se queda sin cupo, pasa sola a otra" },
  { nombre: "/lider", uso: "/lider <modelo>", que: "elige el modelo principal, el que parte la tarea (opus, sonnet, haiku…)" },
  { nombre: "/turnos", uso: "/turnos <compañero>", que: "los turnos de ese compañero (escribió, corrigió…), con lo que cambió cada uno" },
  { nombre: "/volver", uso: "/volver <compañero> <n>", que: "lleva a ese compañero a su turno n dentro de la rama del equipo y vuelve a probar" },
  { nombre: "/deshacer", uso: "/deshacer <compañero>", que: "deshace solo el trabajo de ese compañero en la rama del equipo y vuelve a probar" },
  { nombre: "/integrar", uso: "/integrar", que: "lleva la rama del equipo a tu rama (merge), si pasó el portón" },
  { nombre: "/descartar", uso: "/descartar [n]", que: "tira la rama del equipo; con un número, la tarea n de la última noche" },
  { nombre: "/buscar", uso: "/buscar <palabras>", que: "busca en todo lo que hablaste con Dolphin en este proyecto, en cualquier sesión" },
  { nombre: "/programar", uso: "/programar [diario] 02:00 <tarea>", que: "la agenda en el calendario (la corren la consola y la app de escritorio)" },
  { nombre: "/doctor", uso: "/doctor", que: "busca lo que quedó roto (worktrees abandonados, agentes huérfanos, enlaces rotos…), lo arregla y dice qué hizo" },
  { nombre: "/bug", uso: "/bug <lo que viste>", que: "primero una prueba que reproduce el bug (tiene que fallar), después el arreglo hasta que esa prueba pase" },
  { nombre: "/comparar", uso: "/comparar <tarea> [--motores claude,codex]", que: "la misma tarea a varios motores a la vez; mirás las apps lado a lado y elegís" },
  { nombre: "/elegir", uso: "/elegir <n>", que: "mergea la que elegiste de la última comparación y tira las otras" },
  { nombre: "/noche", uso: "/noche <tarea>", que: "la deja para esta noche: la hace dolphin noche mientras dormís" },
  { nombre: "/parte", uso: "/parte", que: "lo que hizo la última noche, tarea por tarea" },
  { nombre: "/aprobar", uso: "/aprobar <n>", que: "mergea la tarea n de la última noche en tu rama" },
  { nombre: "/memoria", uso: "/memoria <regla>", que: "le enseña una regla al proyecto (la usan las dos apps)" },
  { nombre: "/idea", uso: "/idea <idea>", que: "la anota en la bandeja para hacerla después" },
  { nombre: "/imagen", uso: "/imagen [qué mirar]", que: "pega la imagen que tengas copiada: la guarda en el proyecto y se la pasa al agente" },
  { nombre: "/abrir", uso: "/abrir <ruta>", que: "trabaja sobre otro repo (queda en tus proyectos)" },
  { nombre: "/ayuda", uso: "/ayuda", que: "los atajos y los comandos" },
  { nombre: "/salir", uso: "/salir", que: "cierra Dolphin" },
];


export class Sesion {
  readonly mensajes: Mensaje[] = [];
  equipo: EstadoEquipo | null = null;
  trabajo: Trabajo | null = null;
  /** Mientras piensa qué hacer con un mensaje: desde cuándo. */
  pensandoDesde: number | null = null;
  /** Lo que propuso y espera tu respuesta («dale», o contestando las preguntas). */
  propuesta: Propuesta | null = null;
  /** El dolphin.config.json que propuso el arranque y espera tu «dale». */
  private arranque: Record<string, unknown> | null = null;
  /** El plan del líder espera tu «dale»: con qué contestarle al equipo. */
  private aprobacion: ((respuesta: Aprobacion) => void) | null = null;
  /** El plan que espera el «dale», tal como lo va corrigiendo la persona. */
  private planEnEspera: { tareas: TareaDelPlan[]; editado: boolean; conPlata: boolean; tope?: number } | null = null;
  /** El modelo principal que elegiste (/lider): el que parte la tarea. Sin elegir, el caro del motor. */
  lider: string | null = null;
  /**
   * Si el pedido lo reparte un equipo o lo hace un agente solo.
   *
   * Prendido, el líder parte la tarea y reparte; apagado, un agente la hace entera. Es una de las
   * tres cosas que el CLI deja elegir desde el 09/11/2026 (modelo, orquestar, entrar a cada
   * agente), y por eso vive acá y no detrás de un comando: se ve y se toca en el inicio.
   */
  orquestar = true;
  /** La terminal de cada agente: «lider», el id de cada tarea del equipo, o «u1»… de una siembra. */
  readonly terminales = new Map<string, RenglonDeTerminal[]>();
  /** Los archivos que escribió cada agente (de sus voces «Edit x», «Write x»): los candados del equipo. */
  readonly archivosDe = new Map<string, Set<string>>();
  /** De qué carpeta (o clave de voz) es cada terminal. */
  private readonly dondeEs = new Map<string, string>();
  private readonly dejarDeEscuchar: () => void;
  /** La última señal de vida del trabajo (una voz, un evento, un mensaje): para saber si se trabó. */
  private ultimaSenal = 0;
  private readonly vigia: NodeJS.Timeout;
  /** Avisa que algo cambió (los datos del disco, sobre todo) para releerlos. */
  alCambiar: () => void = () => {};
  /** Cada mensaje nuevo, para quien lo quiera llevar a otro lado (el canal de Telegram). */
  alDecir: (m: Mensaje) => void = () => {};
  private readonly ahora: () => number;

  constructor(readonly config: ConfigDeSesion) {
    this.ahora = config.ahora ?? Date.now;
    const dejarDeOir = escucharVoces((voz) => this.oir(voz));
    // Cuando una cuenta se queda sin cupo y sigue otra, se cuenta en el chat.
    const dejarCuentas = alCambiarDeCuenta(({ de, a, porLimite }) => {
      if (porLimite) this.decir("dolphin", `${nombreDeCuenta(de)} llegó a su límite de uso: sigo con ${nombreDeCuenta(a)}.`, "aviso");
    });
    this.dejarDeEscuchar = () => {
      dejarDeOir();
      dejarCuentas();
    };
    this.vigia = setInterval(() => this.revisarSiSeTrabo(), 30_000);
    this.vigia.unref();
  }

  /** Avisa por los canales que haya (notificación, Telegram), una vez por clave. */
  private avisar(tipo: TipoDeAviso, titulo: string, texto: string, clave: string): void {
    void this.config.avisador?.avisar({ tipo, titulo, texto, clave }).catch(() => false);
  }

  /** Si un trabajo lleva TRABADO_MS sin ninguna señal, avisa (una vez por trabajo). */
  revisarSiSeTrabo(): void {
    const trabajo = this.trabajo;
    if (!trabajo || trabajo.terminado || this.esperaDale) return;
    const silencio = this.ahora() - Math.max(this.ultimaSenal, trabajo.desde);
    if (silencio < TRABADO_MS) return;
    this.avisar("trabado", "Dolphin parece trabado", `«${trabajo.titulo}» lleva ${Math.round(silencio / 60_000)} min sin novedades.`, `trabado:${trabajo.desde}`);
  }

  /** Deja de escuchar a los agentes (al cambiar de proyecto o salir). */
  cerrar(): void {
    this.dejarDeEscuchar();
    clearInterval(this.vigia);
  }

  private oir(voz: Voz): void {
    const clave = this.dondeEs.get(voz.donde);
    if (!clave) return;
    this.anotarEnTerminal(clave, voz.tipo, voz.texto, voz.t, voz.ref);
    // Lo que edita un agente queda como su candado: dos sobre el mismo archivo es un choque anunciado.
    const escribe = voz.tipo === "herramienta" ? /^(?:Edit|Write|MultiEdit|NotebookEdit) (.+)$/.exec(voz.texto) : null;
    if (escribe) {
      const archivos = this.archivosDe.get(clave) ?? new Set<string>();
      archivos.add(escribe[1]!.trim());
      this.archivosDe.set(clave, archivos);
    }
  }

  /** Los archivos que tocan dos compañeros o más: dónde puede chocar la integración. */
  get choques(): { archivo: string; quienes: string[] }[] {
    const porArchivo = new Map<string, string[]>();
    for (const [clave, archivos] of this.archivosDe) {
      if (clave === "lider" || clave === "revisor") continue;
      for (const a of archivos) porArchivo.set(a, [...(porArchivo.get(a) ?? []), clave]);
    }
    return [...porArchivo].filter(([, quienes]) => quienes.length > 1).map(([archivo, quienes]) => ({ archivo, quienes }));
  }

  /** Un renglón en la terminal de un agente (lo usan las voces y los eventos del portón). */
  anotarEnTerminal(clave: string, tipo: RenglonDeTerminal["tipo"], texto: string, t = this.ahora(), ref?: string): void {
    this.ultimaSenal = this.ahora();
    const terminal = this.terminales.get(clave) ?? [];
    terminal.push({ t, tipo, texto, ...(ref ? { ref } : {}) });
    if (terminal.length > TOPE_DE_TERMINAL) terminal.splice(0, terminal.length - TOPE_DE_TERMINAL);
    this.terminales.set(clave, terminal);
  }

  decir(quien: QuienHabla, texto: string, tono: Mensaje["tono"] = "normal"): void {
    this.ultimaSenal = this.ahora();
    const mensaje: Mensaje = { t: this.ahora(), quien, texto, tono };
    this.mensajes.push(mensaje);
    this.alDecir(mensaje);
    // La charla queda en el repo: la próxima vez vuelve, y /buscar la encuentra.
    if (quien !== "sistema" && !this.config.sinRepo && this.config.guardarCharla === true)
      void guardarMensaje(this.config.repo, { t: mensaje.t, quien, texto }).catch(() => {});
    if (this.mensajes.length > 400) this.mensajes.splice(0, this.mensajes.length - 400);
  }

  /** El plan del líder está esperando tu «dale». */
  get esperaDale(): boolean {
    return this.aprobacion !== null;
  }


  /**
   * La imagen que tengas copiada, guardada en el proyecto y pasada al agente como una ruta.
   *
   * En una terminal no se puede pegar una imagen —lo que viaja por el teclado es texto—, así que
   * se la saca del portapapeles del sistema. Queda en `.dolphin/imagenes/` del proyecto y no en
   * una carpeta temporal a propósito: el agente la va a abrir, y una ruta temporal que el sistema
   * limpia a mitad de camino deja un pedido hablando de un archivo que ya no está.
   */
  private async pegarImagen(queMirar: string): Promise<Siguiente> {
    const carpeta = join(this.config.repo, ".dolphin", "imagenes");
    await mkdir(carpeta, { recursive: true });
    const destino = join(carpeta, nombreDeLaImagen());
    const plataforma: Plataforma =
      process.platform === "win32" ? "win32" : process.platform === "darwin" ? "darwin" : "linux";
    const comando = comandoDePegado(plataforma, destino);
    try {
      const salida = await correrPegado(comando, destino);
      const ruta = leerPegado(comando, salida, destino);
      this.decir("dolphin", `Guardada en ${ruta}.`, "bien");
      // Se manda como un pedido normal con la ruta adentro: el agente ya sabe abrir un @archivo,
      // así que esto no inventa un camino nuevo para las imágenes.
      return this.pensarYHacer(`${queMirar || "Mirá esta imagen y decime qué ves"}: @${ruta}`);
    } catch (error) {
      this.decir("dolphin", error instanceof Error ? error.message : String(error), "aviso");
      return;
    }
  }

  get ocupada(): boolean {
    return (!!this.trabajo && !this.trabajo.terminado) || this.persecucion !== null;
  }

  /** Mientras /objetivo persigue algo: sus equipos internos pueden arrancar; otro pedido, no. */
  private persecucion: string | null = null;

  /** Lo que se escribió en el prompt. Devuelve "salir" si hay que cerrar. */
  async recibir(entrada: string): Promise<Siguiente> {
    const texto = entrada.trim();
    if (!texto) return;
    this.decir("vos", texto);
    const [comando = "", ...resto] = texto.split(/\s+/);
    const argumento = texto.slice(comando.length).trim();
    if (comando === "/abrir") return argumento ? { abrir: argumento.replace(/^["']|["']$/g, "") } : this.decir("dolphin", "¿Qué repo abro? /abrir D:/ruta/al/repo.", "aviso");
    // Un mensaje suelto: primero se piensa qué hace falta (charla, tarea o proyecto).
    if (!comando.startsWith("/")) return this.pensarYHacer(texto);
    // Sin un repo no hay dónde escribir ramas ni memoria: se puede charlar, pero para trabajar hay un proyecto.
    if (this.config.sinRepo && comando !== "/salir" && comando !== "/ayuda") {
      this.decir("dolphin", "Primero elegí un proyecto: de la lista del inicio, con ctrl+k, o con /abrir <ruta> para uno nuevo.", "aviso");
      return;
    }

    switch (comando) {
      case "/salir":
        return "salir";
      case "/ayuda":
        this.decir("dolphin", COMANDOS.map((c) => `${c.uso} — ${c.que}`).join("\n"));
        return;
      case "/equipo":
        if (!argumento) return this.decir("dolphin", "Decime qué hay que hacer: /equipo <tarea>.", "aviso");
        await this.pedirAlEquipo(argumento);
        return;
      case "/hacer": {
        if (!argumento) return this.decir("dolphin", "¿Cuál? /hacer <id de la tarjeta> (las ves con dolphin tarea).", "aviso");
        let tarjeta: Tarjeta;
        try {
          tarjeta = await buscarTarjeta(this.config.repo, argumento);
        } catch (e) {
          return this.decir("dolphin", `${(e as Error).message}.`, "aviso");
        }
        if (tarjeta.columna === "hecho") return this.decir("dolphin", `«${tarjeta.titulo}» ya está en Hecho.`, "aviso");
        const frenan = laFrenan(tarjeta, await leerTablero(this.config.repo));
        if (frenan.length > 0) return this.decir("dolphin", `«${tarjeta.titulo}» espera a ${frenan.map((t) => `«${t.titulo}»`).join(" y ")}: primero eso.`, "aviso");
        await this.pedirAlEquipo(objetivoDeTarjeta(tarjeta), { tarjeta: tarjeta.id });
        return;
      }
      case "/buscar": {
        if (!argumento) return this.decir("dolphin", "¿Qué busco? /buscar <palabras>.", "aviso");
        const hallados = await buscarEnCharla(this.config.repo, argumento);
        // El propio pedido de búsqueda recién anotado no cuenta como hallazgo.
        const otros = hallados.filter((m) => !(m.quien === "vos" && m.texto.trim() === texto));
        this.decir(
          "dolphin",
          otros.length === 0
            ? `No encontré «${argumento}» en lo que hablamos.`
            : [`Encontré ${otros.length}:`, ...otros.map((m) => `${cuandoSeDijo(m.t)} · ${m.quien === "vos" ? "vos" : "dolphin"}: ${m.texto.split("\n")[0]}`)].join("\n"),
        );
        return;
      }
      case "/programar": {
        const p = leerProgramacion(argumento, new Date(this.ahora()));
        if (!p) return this.decir("dolphin", "No entendí cuándo. Probá: /programar 02:00 <tarea>, /programar mañana 9:30 <tarea> o /programar diario 03:00 <tarea>.", "aviso");
        const turno = await agendar(this.config.repo, { tareas: [p.tarea], cuando: p.cuando.toISOString(), agente: this.config.agente, ...(p.diario ? { repetir: "diario" as const } : {}) });
        this.decir(
          "dolphin",
          `Agendado ${p.diario ? `todos los días a las ${turno.hora}` : `para el ${cuandoSeDijo(p.cuando.getTime())}`}: «${p.tarea}». Lo corre la consola (npm run ui) o la app de escritorio mientras estén abiertas, en una rama y con el portón; el parte queda en el historial.`,
          "bien",
        );
        this.alCambiar();
        return;
      }
      case "/objetivo": {
        const { objetivo, oraculo } = separarOraculo(argumento);
        if (!objetivo) return this.decir("dolphin", "¿Qué hay que lograr? /objetivo <objetivo>, y si querés que lo juzgue un comando tuyo: --oraculo <comando>.", "aviso");
        await this.perseguir(objetivo, oraculo ? { oraculo } : {});
        return;
      }
      case "/integrar":
        return this.integrar();
      case "/descartar":
        if (/^\d+$/.test(argumento)) return this.decidirDeLaNoche(Number(argumento), "descartar");
        return this.descartar();
      case "/aprobar":
        if (!/^\d+$/.test(argumento)) return this.decir("dolphin", "¿Cuál? /aprobar 2 mergea la tarea 2 de la última noche (mirala con /parte).", "aviso");
        return this.decidirDeLaNoche(Number(argumento), "aprobar");
      case "/doctor": {
        if (this.config.sinRepo) return this.decir("dolphin", "Abrí un proyecto primero: /abrir <ruta>.", "aviso");
        this.decir("dolphin", textoDelDoctor(await doctor(this.config.repo)));
        this.alCambiar();
        return;
      }
      case "/bug": {
        if (!argumento) return this.decir("dolphin", "¿Qué viste? /bug el cupón del 10 % no descuenta nada.", "aviso");
        if (this.noSiEstaOcupada()) return;
        const trabajo: Trabajo = { tipo: "equipo", desde: this.ahora(), titulo: `/bug ${argumento}` };
        this.trabajo = trabajo;
        try {
          const r = await deBugAArreglo({ repo: this.config.repo, descripcion: argumento, agente: this.config.agente, verificar: await this.verificar() }, { contar: (t) => this.decir("dolphin", t) });
          this.decir("dolphin", textoDelBug(r), r.etapa === "arreglado" ? "bien" : "aviso");
          if (r.etapa === "arreglado") this.avisar("termino", "Bug arreglado", argumento, `bug:${this.ahora()}`);
        } finally {
          trabajo.terminado = this.ahora();
          this.alCambiar();
        }
        return;
      }
      case "/comparar": {
        const m = /^([\s\S]*?)(?:\s+--motores\s+(\S+))?\s*$/.exec(argumento);
        const tarea = (m?.[1] ?? "").trim();
        if (!tarea) return this.decir("dolphin", "¿Qué tarea? /comparar <tarea>, y si querés elegir los motores: --motores claude,codex.", "aviso");
        if (this.noSiEstaOcupada()) return;
        const trabajo: Trabajo = { tipo: "equipo", desde: this.ahora(), titulo: `/comparar ${tarea}` };
        this.trabajo = trabajo;
        try {
          const motores: Motor[] = this.config.agente === "mentira" ? ["mentira", "mentira", "mentira"] : m?.[2] ? m[2].split(",").map((x) => motorDe(x.trim(), "claude")) : [...MOTORES_POR_DEFECTO];
          this.decir("dolphin", `Se la doy a ${motores.join(", ")} a la vez, cada uno en su rama y con el portón. Cuando terminen, las ves lado a lado.`);
          const c = await comparar({ repo: this.config.repo, tarea, motores, verificar: await this.verificar() });
          this.decir("dolphin", `${textoDeComparacion(c)}\n\nLa página: .dolphin/comparar/${c.id}.html`, c.contendientes.some((x) => x.estado === "lista") ? "bien" : "mal");
        } finally {
          trabajo.terminado = this.ahora();
          this.alCambiar();
        }
        return;
      }
      case "/elegir": {
        if (!/^\d+$/.test(argumento)) return this.decir("dolphin", "¿Cuál? /elegir 2 mergea la segunda de la última comparación.", "aviso");
        const r = await elegir(this.config.repo, Number(argumento));
        this.decir("dolphin", r.ok ? r.porQue : `No pude: ${r.porQue}.`, r.ok ? "bien" : "aviso");
        this.alCambiar();
        return;
      }
      case "/parte": {
        const noche = await ultimaNoche(this.config.repo);
        return this.decir("dolphin", noche ? textoDelParte(noche) : "Todavía no corrió ninguna noche acá. Dejá tareas con /noche <tarea> y corré dolphin noche antes de dormir.");
      }
      case "/noche": {
        if (!argumento) return this.decir("dolphin", "¿Qué querés que haga esta noche? /noche <tarea>.", "aviso");
        const { sumados, yaEstaban } = await sumarAsuntos(this.config.repo, [{ tipo: "idea", titulo: argumento, detalle: argumento, origen: "terminal" }]);
        const id = sumados[0]?.id ?? (await leerBandeja(this.config.repo)).asuntos.find((a) => a.titulo === argumento && a.estado === "abierto")?.id;
        if (!id || !(await marcarParaLaNoche(this.config.repo, id, new Date(this.ahora()).toISOString().slice(0, 10)))) {
          return this.decir("dolphin", yaEstaban > 0 ? "Esa ya estaba en la bandeja y no está abierta: no la puedo dejar para esta noche." : "Esa se había rechazado antes: no la dejo para esta noche.", "aviso");
        }
        const cuantas = (await leerBandeja(this.config.repo)).asuntos.filter((a) => a.estado === "abierto" && a.paraLaNoche).length;
        this.decir("dolphin", `Queda para esta noche (${cuantas} en total). Antes de dormir: dolphin noche --hasta 07:00. A la mañana, /parte.`, "bien");
        this.alCambiar();
        return;
      }
      case "/turnos":
        return argumento ? this.turnos(argumento) : this.decir("dolphin", "¿De quién? /turnos backend (o el id: t1).", "aviso");
      case "/volver": {
        const m = /^(\S+)\s+(\d+)$/.exec(argumento);
        return m ? this.volverAlTurno(m[1]!, Number(m[2])) : this.decir("dolphin", "¿A qué turno? /volver backend 1 (los turnos los ves con /turnos backend).", "aviso");
      }
      case "/deshacer":
        return argumento ? this.deshacer(argumento) : this.decir("dolphin", "¿De quién? /deshacer backend (o el id: t1).", "aviso");
      case "/cuenta": {
        const cuentas = await cuentasDeClaude(!argumento);
        if (!argumento) {
          const enUso = cuentaEnUso()?.id ?? CUENTA_DE_SIEMPRE;
          const lista = cuentas.map((c, i) => `${i + 1}. ${nombreDeCuenta(c)}${c.id === enUso ? " ← la que uso" : ""}${cuentaAgotada(c.id) ? " (sin cupo)" : ""}`);
          const sumar = cuentas.length === 1 ? "\n\nPara sumar otra (otra suscripción), agregala en la app de escritorio: Ajustes → cuentas." : "";
          return this.decir("dolphin", `Las cuentas de Claude:\n${lista.join("\n")}\n\nPara cambiar: /cuenta <número>. Si una se queda sin cupo, paso sola a la siguiente.${sumar}`);
        }
        const elegida = cuentas[Number.parseInt(argumento, 10) - 1];
        if (!elegida) return this.decir("dolphin", `No hay una cuenta ${argumento}. Mirá la lista con /cuenta.`, "aviso");
        elegirCuenta(elegida.id);
        return this.decir("dolphin", `Listo: trabajo con ${nombreDeCuenta(elegida)}.`, "bien");
      }
      case "/lider": {
        const modelo = argumento.toLowerCase();
        if (!modelo) {
          this.decir("dolphin", `El modelo principal es ${this.lider ?? "el de siempre (el más capaz del motor)"}. Para cambiarlo: /lider ${MODELOS_PRINCIPALES.join(" | ")}.`);
          return;
        }
        this.lider = modelo;
        this.decir("dolphin", `Listo: ${modelo} es el modelo principal. Él parte la tarea y reparte; los compañeros usan el que les toque.`, "bien");
        return;
      }
      case "/memoria": {
        if (!argumento) return this.decir("dolphin", "¿Qué tengo que recordar? /memoria <regla>.", "aviso");
        const r = await recordar(this.config.repo, argumento, undefined, "regla", { origen: "owner" });
        this.decir("dolphin", `Anotado en la memoria del proyecto: «${r.dicho}». Lo ve también la app de escritorio.`, "bien");
        this.alCambiar();
        return;
      }
      case "/imagen":
        return this.pegarImagen(argumento);
      case "/idea": {
        if (!argumento) return this.decir("dolphin", "¿Cuál es la idea? /idea <idea>.", "aviso");
        const { sumados, yaEstaban } = await sumarAsuntos(this.config.repo, [{ tipo: "idea", titulo: argumento, detalle: argumento, origen: "terminal" }]);
        this.decir("dolphin", sumados.length > 0 ? "Anotada en la bandeja." : yaEstaban > 0 ? "Esa idea ya estaba en la bandeja." : "Esa idea se había rechazado antes.", sumados.length > 0 ? "bien" : "aviso");
        this.alCambiar();
        return;
      }
      default:
        this.decir("dolphin", `No conozco ${comando}. Escribí /ayuda para ver los comandos.`, "aviso");
    }
  }

  /** El mensaje suelto: si hay una propuesta esperando, es la respuesta; si no, se piensa qué hace falta. */
  async pensarYHacer(texto: string): Promise<Siguiente> {
    // El plan del líder espera: «dale» arranca, «no» lo deja.
    if (this.aprobacion) {
      const contestar = this.aprobacion;
      const enEspera = this.planEnEspera;
      const edicion = enEspera ? editarPlan(enEspera.tareas, texto) : null;
      if (edicion && enEspera) {
        if ("porQue" in edicion) {
          this.decir("dolphin", `No lo cambié: ${edicion.porQue}.`, "aviso");
          return;
        }
        enEspera.tareas = edicion.tareas;
        enEspera.editado = true;
        const tope = enEspera.tope !== undefined && costoMaximo({ tareas: edicion.tareas }) > enEspera.tope ? `\n\nOjo: así se pasa del tope del proyecto (US$ ${enEspera.tope.toFixed(2)}).` : "";
        this.decir("dolphin", `${edicion.hecho} Queda así:\n${lineasDelPlan(edicion.tareas, enEspera.conPlata).join("\n")}${tope}\n\n¿Arranco? «dale», «no», o seguí corrigiendo.`);
        return;
      }
      if (esAprobacion(texto)) {
        this.aprobacion = null;
        this.planEnEspera = null;
        this.decir("dolphin", `Arranca el equipo${enEspera?.editado ? " con el plan corregido" : ""}. Lo ves en la pestaña Equipo (3).`);
        contestar(enEspera?.editado ? { tareas: enEspera.tareas } : true);
      } else if (/^(no|cancel[aá]|dej[aá])\b/i.test(texto)) {
        this.aprobacion = null;
        this.planEnEspera = null;
        contestar("no se aprobó el plan");
      } else {
        this.decir("dolphin", "El plan espera: decime «dale» para arrancar, «no» para dejarlo, o corregilo: «sacá 2», «sumá <tarea>», «cambiá 2: <tarea>».", "aviso");
      }
      return;
    }
    // El arranque propuso el dolphin.config.json: «dale» lo escribe, «no» lo deja.
    if (this.arranque) {
      const config = this.arranque;
      if (esAprobacion(texto)) {
        this.arranque = null;
        await writeFile(join(this.config.repo, "dolphin.config.json"), `${JSON.stringify(config, null, 2)}\n`);
        this.decir("dolphin", "Guardé dolphin.config.json. Commitealo y el portón queda igual para todos (y para la app de escritorio).", "bien");
        this.alCambiar();
        return;
      }
      if (/^(no|cancel[aá]|dej[aá])\b/i.test(texto)) {
        this.arranque = null;
        this.decir("dolphin", "Listo, no lo guardo. Uso lo que detecté igual mientras esté abierto.");
        return;
      }
      // Otra cosa es otro pedido: la propuesta queda, y el mensaje sigue su camino.
    }
    if (this.propuesta) {
      const p = this.propuesta;
      if (/^(no|cancel[aá]|dej[aá]|olvidate)\b/i.test(texto)) {
        this.propuesta = null;
        this.decir("dolphin", "Listo, lo dejo. Cuando quieras, me lo pedís de nuevo.");
        return;
      }
      this.propuesta = null;
      // «dale» arranca con lo propuesto; cualquier otra cosa son las respuestas, que viajan con el pedido.
      const prompt = esAprobacion(texto) ? p.prompt : `${p.prompt}\n\nLo que contestó la persona a las preguntas:\n${texto}`;
      return this.lanzarProyecto(prompt, p.carpeta);
    }
    if (this.noSiEstaOcupada()) return;

    const config = this.config.sinRepo ? {} : await leerConfig(this.config.repo);
    const modo = config.terminal?.modo ?? "pensar";
    if (!this.config.sinRepo && modo === "equipo") {
      await this.pedirAlEquipo(texto);
      return;
    }
    if (!this.config.sinRepo && modo === "agente") {
      await this.pedirAlEquipo(texto, { solo: true });
      return;
    }

    const decision = await this.decidir(texto, config.terminal?.modelo);
    if (!decision) return;
    if (modo === "charla" && decision.tipo !== "charla") {
      this.decir("dolphin", "En este proyecto estoy en modo charla (dolphin.config.json → terminal.modo): no armo equipos. Si querés que trabaje, usá /equipo.", "aviso");
      return;
    }
    return this.hacer(decision, config.terminal?.preguntar !== false);
  }

  /**
   * Lo último que se habló en este proyecto vuelve al chat al abrir: Dolphin se acuerda de la charla
   * de ayer, y el triage la tiene en cuenta. Se cargan sin volver a anotarse.
   */
  async cargarHistoria(cuantos = 30): Promise<void> {
    if (this.config.sinRepo || this.config.guardarCharla !== true) return;
    const anteriores = (await leerCharla(this.config.repo).catch(() => [])).slice(-cuantos);
    if (anteriores.length === 0) return;
    this.mensajes.unshift(
      { t: anteriores[0]!.t, quien: "sistema", texto: `La charla de antes (desde el ${cuandoSeDijo(anteriores[0]!.t)}):` },
      ...anteriores.map((m) => ({ t: m.t, quien: m.quien, texto: m.texto }) as Mensaje),
      { t: this.ahora(), quien: "sistema", texto: "— hasta acá, lo de antes —" },
    );
  }

  /**
   * Lo que el repo ya les dice a los agentes (CLAUDE.md, AGENTS.md) pasa a la memoria como reglas que
   * esperan tu ok. Una vez por versión del archivo: se llama al abrir el proyecto, no cuesta nada.
   */
  async traerInstrucciones(): Promise<void> {
    if (this.config.sinRepo) return;
    const importados = await importarInstrucciones(this.config.repo).catch(() => []);
    if (importados.length === 0) return;
    const cuantas = importados.reduce((s, i) => s + i.nuevas, 0);
    this.decir(
      "dolphin",
      `Leí ${importados.map((i) => i.archivo).join(" y ")} y traje ${cuantas} regla${cuantas === 1 ? "" : "s"} a la memoria. Esperan tu ok en Memoria (5): «a» para aprobarla, espacio para descartarla.`,
    );
    this.alCambiar();
  }

  /**
   * Los TODO del código entran al tablero como ideas. Igual que las instrucciones: al abrir el
   * proyecto, una sola vez cada uno, y sin gastar un token.
   */
  async traerTodosDelCodigo(): Promise<void> {
    if (this.config.sinRepo) return;
    const nuevas = await todosAlTablero(this.config.repo).catch(() => []);
    if (nuevas.length === 0) return;
    this.decir(
      "dolphin",
      `Encontré ${nuevas.length} TODO en el código y ${nuevas.length === 1 ? "lo dejé" : "los dejé"} como idea${nuevas.length === 1 ? "" : "s"} en el tablero (3), con su archivo y su línea.`,
    );
    this.alCambiar();
  }

  /**
   * La primera vez en un repo sin dolphin.config.json: qué es, con qué se instala y qué corre el
   * portón, y la propuesta del archivo (se escribe con un «dale»). Pregunta una sola vez por repo.
   */
  /** Al abrir un proyecto: lo que quedó roto de otra vez se arregla solo, y se dice solo si hubo algo. */
  async revisarAlAbrir(): Promise<void> {
    if (this.config.sinRepo) return;
    const arreglado = (await doctor(this.config.repo).catch(() => [])).filter((h) => h.arreglado);
    if (arreglado.length > 0) this.decir("dolphin", textoDelDoctor(arreglado));
  }

  async proponerArranque(): Promise<void> {
    if (this.config.sinRepo) return;
    const repo = this.config.repo;
    const yaTiene = await access(join(repo, "dolphin.config.json")).then(() => true, () => false);
    const marca = join(repo, ".dolphin", "arranque-propuesto");
    const yaPregunto = await access(marca).then(() => true, () => false);
    if (yaTiene || yaPregunto) return;
    const crudo = await detectarProyecto(repo);
    const clonado = await esClonado(repo).catch(() => false);
    const deteccion = clonado && crudo.comandos.length > 0 ? { ...crudo, comandos: [], notas: [...crudo.notas, "Este repo vino de afuera: sus comandos (pytest, go test…) no corren en el portón, por seguridad."] } : crudo;
    const propuesta = configPropuesta(deteccion);
    await carpetaDeDolphin(repo);
    await escribirDeUna(marca, new Date().toISOString());
    if (Object.keys(propuesta).length === 0) {
      this.decir("dolphin", decirDeteccion(deteccion), "aviso");
      return;
    }
    this.arranque = propuesta;
    this.decir("dolphin", `${decirDeteccion(deteccion)}\n\n¿Lo guardo en dolphin.config.json? Decime «dale», o «no» para dejarlo así.`);
  }

  /** Pregunta a quien piensa; si Claude no contesta, decide por reglas y lo dice. */
  private async decidir(texto: string, modelo?: string): Promise<Decision | undefined> {
    const motor = this.config.agente;
    const pensador = this.config.pensar ?? (motor === "mentira" ? pensarConReglas : pensadorConClaude(modelo ?? modeloDelEscalon(motor, "medio") ?? "sonnet"));
    const leida = this.config.sinRepo ? { recuerdos: [] } : await leerMemoria(this.config.repo).catch(() => ({ recuerdos: [] }));
    const memoria = contextoDeMemoria(leida, texto);
    // Las reglas que más tienen que ver con el mensaje: se dicen después, así se ve de dónde salió la respuesta.
    const usadas = memoriasRelevantes(leida, texto)
      .map((m) => m.recuerdo)
      .filter((r) => r.activo && !r.candidato)
      .slice(0, 3);
    const contexto = {
      pedido: texto,
      memoria,
      charla: this.mensajes.slice(-9, -1).filter((m) => m.quien !== "sistema").map((m) => ({ quien: m.quien === "vos" ? "persona" : "dolphin", texto: m.texto })),
      sinRepo: this.config.sinRepo === true,
      repo: this.config.repo,
    };
    this.pensandoDesde = this.ahora();
    const citar = (): void => {
      if (usadas.length === 0) return;
      this.decir("sistema", `De la memoria: ${usadas.map((r) => `«${r.dicho}»`).join(" · ")}`);
      void registrarUsos(this.config.repo, usadas.map((r) => r.id)).catch(() => {});
    };
    try {
      const { decision } = await pensador(contexto);
      citar();
      return decision;
    } catch (e) {
      this.decir("sistema", `No pude pensarlo con el modelo (${(e as Error).message}); decido por reglas.`);
      citar();
      return (await pensarConReglas(contexto)).decision;
    } finally {
      this.pensandoDesde = null;
    }
  }

  private async hacer(decision: Decision, preguntar: boolean): Promise<Siguiente> {
    if (decision.tipo === "charla") {
      this.decir("dolphin", decision.respuesta);
      return;
    }
    // Con la orquestación apagada, un proyecto se hace igual pero sin repartirlo: lo toma un
    // agente solo, con el pedido ya mejorado que el pensador devolvió. Se baja acá, en el único
    // lugar donde la decisión se convierte en trabajo, y no en el pensador: así el pensador sigue
    // diciendo lo que ve —que esto era un proyecto— y la elección de la persona manda sobre eso.
    if (decision.tipo === "proyecto" && !this.orquestar) {
      decision = { tipo: "tarea", tarea: decision.prompt, ...(decision.resumen ? { porQue: decision.resumen } : {}) };
    }
    if (decision.tipo === "tarea") {
      if (this.config.sinRepo) {
        // Sin repo no hay dónde hacerla: se propone una carpeta nueva, como con un proyecto.
        const carpeta = nombreDeCarpeta(decision.tarea.split(/\s+/).slice(0, 4).join(" ")) || "proyecto-nuevo";
        this.propuesta = { prompt: decision.tarea, preguntas: [], carpeta };
        this.decir("dolphin", `Para hacerlo necesito un proyecto. ¿Creo la carpeta «${carpeta}» acá y lo arranco? Decime «dale», o elegí un proyecto de la lista.`);
        return;
      }
      await this.pedirAlEquipo(decision.tarea, { solo: true });
      return;
    }
    const principal = this.lider ?? (this.config.agente === "mentira" ? "demo" : (modeloDelEscalon(this.config.agente, "caro") ?? "opus"));
    const lineas = [`Lo tomo como un proyecto: ${decision.resumen}`, "", "Así lo voy a pedir:", decision.prompt, "", `Lo dirige ${principal} (/lider para cambiarlo) y lo ves en la pestaña Equipo (3).`];
    if (decision.carpeta) lineas.push("", `Lo armo en una carpeta nueva: «${decision.carpeta}».`);
    if (preguntar && decision.preguntas.length > 0) {
      lineas.push("", "Antes de arrancar:", ...decision.preguntas.map((p, i) => `${i + 1}. ${p}`), "", "Contestame lo que quieras (o «dale» para arrancar así).");
      this.propuesta = { prompt: decision.prompt, preguntas: decision.preguntas, ...(decision.carpeta ? { carpeta: decision.carpeta } : {}) };
      this.arranque = null;
      this.decir("dolphin", lineas.join("\n"));
      this.avisar("espera", "Dolphin te hizo preguntas", decision.preguntas[0] ?? decision.resumen, `preguntas:${this.ahora()}`);
      return;
    }
    if (this.config.sinRepo && !decision.carpeta) {
      this.propuesta = { prompt: decision.prompt, preguntas: [], carpeta: "proyecto-nuevo" };
      this.decir("dolphin", `${lineas.join("\n")}\n\n¿Lo armo en la carpeta «proyecto-nuevo»? Decime «dale».`);
      return;
    }
    this.decir("dolphin", lineas.join("\n"));
    return this.lanzarProyecto(decision.prompt, decision.carpeta);
  }

  /** Arranca el equipo con el pedido. Sin repo, primero crea la carpeta (git y todo) y la suma a tus proyectos. */
  private async lanzarProyecto(prompt: string, carpeta?: string): Promise<Siguiente> {
    if (!this.config.sinRepo) {
      await this.pedirAlEquipo(prompt);
      return;
    }
    const ruta = join(this.config.repo, nombreDeCarpeta(carpeta ?? "") || "proyecto-nuevo");
    const ocupadaYa = await readdir(ruta).then((x) => x.length > 0, () => false);
    if (ocupadaYa) {
      this.decir("dolphin", `Ya hay una carpeta «${ruta}» con cosas adentro: no la toco. Decime otro nombre, o abrila con /abrir si es ese proyecto.`, "aviso");
      return;
    }
    try {
      await mkdir(ruta, { recursive: true });
      await correr("git", ["init", "-q"], { cwd: ruta, windowsHide: true });
      // Un repo sin commits no sirve para abrir ramas: el primero va vacío.
      await correr("git", ["commit", "--allow-empty", "-qm", "Arranca el proyecto"], { cwd: ruta, windowsHide: true });
      await sumarProyecto(ruta);
    } catch (e) {
      this.decir("dolphin", `No pude crear el proyecto en ${ruta}: ${(e as Error).message}`, "mal");
      return;
    }
    this.decir("dolphin", `Creé ${ruta} y lo sumé a tus proyectos (lo ve también la app de escritorio). Arranco el equipo ahí.`, "bien");
    return { abrir: ruta, despues: prompt };
  }

  private noSiEstaOcupada(interno = false): boolean {
    const trabajando = !!this.trabajo && !this.trabajo.terminado;
    if (!trabajando && (this.persecucion === null || interno)) return false;
    this.decir("dolphin", `Estoy con «${this.persecucion ?? this.trabajo!.titulo}». Cuando termine, mandámelo de nuevo.`, "aviso");
    return true;
  }

  private async verificar(): Promise<string[]> {
    if (this.config.verificar?.length) return [...this.config.verificar];
    return portonDelProyecto(this.config.repo);
  }

  /**
   * `solo`: una tarea chica, un equipo de uno. No hay líder que la parta (va entera a un agente), ni
   * plan que aprobar, ni revisor que mire cómo encajan las piezas: hay una sola. El portón es el mismo.
   */
  async pedirAlEquipo(objetivo: string, opciones: { lider?: string; esperarDale?: boolean; interno?: boolean; solo?: boolean; tarjeta?: string } = {}): Promise<ResultadoDeEquipo | undefined> {
    if (this.noSiEstaOcupada(opciones.interno)) return;
    // Se marca ANTES del primer await: dos pedidos en la misma vuelta (Telegram, dos Enter) no arrancan dos equipos.
    const trabajo: Trabajo = { tipo: "equipo", desde: this.ahora(), titulo: objetivo };
    this.trabajo = trabajo;
    const { repo, agente, automatico } = this.config;
    const deMentira = agente === "mentira";
    const verificar = await this.verificar();
    const config = await leerConfig(repo);
    // Sin permisos arranca solo; con permisos, el plan espera tu «dale» (salvo que el proyecto diga que no).
    const solo = opciones.solo === true;
    const esperarDale = !solo && (opciones.esperarDale ?? (!automatico && config.terminal?.aprobarPlan !== false));
    this.equipo = equipoInicial(objetivo, agente, this.ahora());
    const porton = verificar.length ? `; el portón es ${verificar.join(" › ")}` : "";
    this.decir("dolphin", `${solo ? "Esto lo hace un agente en su rama" : "Armo un equipo para esto"}${porton}. Lo ves en vivo en la pestaña Equipo (3).`);

    const lider = deMentira ? "demo" : (opciones.lider ?? this.lider ?? modeloDelEscalon(agente, "caro") ?? "opus");
    const modeloRevisor = deMentira ? "demo" : (modeloDelEscalon(agente, "medio") ?? "sonnet");
    const pensar: Planificador = solo ? async () => tareaSola(objetivo) : deMentira ? liderDeMentira(objetivo) : planificadorConClaude(lider);
    // Las terminales arrancan de cero: la del líder es la de su voz; la de cada compañero, su worktree.
    this.terminales.clear();
    this.dondeEs.clear();
    this.archivosDe.clear();
    this.dondeEs.set(vozDelLider(repo), "lider");
    this.anotarEnTerminal("lider", "dolphin", `Objetivo: ${objetivo}`);
    const revisor = solo ? null : verificadorRevisor({
      tarea: objetivo,
      modelo: modeloRevisor,
      ...(deMentira ? { correr: async () => ({ texto: '{"decision": "aceptar", "porque": "las piezas encajan"}', gastado: 0 }) } : {}),
    });

    // Con una tarjeta del tablero, el equipo la va moviendo (ver equipo/con-tarjeta.ts).
    const seguimiento = opciones.tarjeta ? seguirConTarjeta(repo, opciones.tarjeta, () => new Date(this.ahora())) : undefined;
    try {
      const resultado = await correrEquipo(
        {
          repo,
          objetivo,
          agente,
          verificar,
          concurrencia: 3,
          automatico,
          pensar,
          revisor,
          nombres: { lider, revisor: modeloRevisor },
          aprobar: async ({ resumen, tareas, estimacion }) => {
            const porTarea = new Map(estimacion.tareas.map((e) => [e.id, e] as const));
            const plata = (d: number) => (config.suscripcion ? "" : ` · US$ ${d.toFixed(2)}`);
            if (solo) return true;
            const lineas = [
              `${lider} lo partió así: ${resumen}`,
              ...tareas.map((t, i) => `${i + 1}. ${t.titulo}${plata(porTarea.get(t.id)?.estimado ?? t.presupuesto)}${t.dependeDe ? ` (después de ${t.dependeDe})` : ""}`),
              "",
              decirEstimacion(estimacion, config.suscripcion === true),
            ];
            if (pasaDelTope(estimacion, config.terminal?.tope)) {
              this.decir("dolphin", `${lineas.join("\n")}\n\nEn el peor caso se pasa del tope de este proyecto (US$ ${config.terminal!.tope!.toFixed(2)}, en dolphin.config.json → terminal.tope): no arranco.`, "mal");
              return "el plan se pasa del tope del proyecto";
            }
            if (!esperarDale) {
              this.decir("dolphin", lineas.join("\n"));
              return true;
            }
            this.decir("dolphin", `${lineas.join("\n")}\n\n¿Arranco? Decime «dale», «no» para dejarlo, o corregilo antes: «sacá 2», «sumá <tarea>», «cambiá 2: <tarea>».`);
            this.avisar("espera", "El plan espera tu «dale»", `${tareas.length} tareas para «${objetivo}». ${decirEstimacion(estimacion, config.suscripcion === true)} Contestá donde lo pediste.`, `plan:${trabajo.desde}`);
            this.planEnEspera = { tareas: [...tareas], editado: false, conPlata: !config.suscripcion, ...(config.terminal?.tope !== undefined ? { tope: config.terminal.tope } : {}) };
            return new Promise<Aprobacion>((resolver) => (this.aprobacion = resolver));
          },
        },
        (e: EventoEquipo) => {
          if (this.equipo) aplicarAlEquipo(this.equipo, e, this.ahora());
          this.contarDelEquipo(e);
          this.terminalesDelEquipo(e);
          seguimiento?.alPasar(e);
        },
      );
      await seguimiento?.listo().catch((e: Error) => this.decir("dolphin", `No pude mover la tarjeta: ${e.message}`, "aviso"));
      const segundos = (resultado.ms / 1000).toFixed(1);
      if (resultado.rama) this.avisar("termino", "El equipo terminó", `«${objetivo}» pasó el portón en ${segundos} s: ${resultado.rama}`, `equipo:${trabajo.desde}`);
      else this.avisar("fallo", "El equipo no pudo", `«${objetivo}»: ${resultado.porQue}`, `equipo:${trabajo.desde}`);
      this.decir(
        "dolphin",
        resultado.rama
          ? `Listo en ${segundos} s. La rama ${resultado.rama} pasó el portón${solo ? "" : " y la revisión"}; está en ${resultado.ruta}.\n${await this.informeDelEquipo(objetivo, resultado)}`
          : `No salió: ${resultado.porQue}`,
        resultado.rama ? "bien" : "mal",
      );
      return resultado;
    } catch (e) {
      this.decir("dolphin", `Se cortó el equipo: ${(e as Error).message}`, "mal");
      return { porQue: `se cortó: ${(e as Error).message}`, ms: this.ahora() - trabajo.desde, gastado: 0 };
    } finally {
      trabajo.terminado = this.ahora();
      this.alCambiar();
    }
  }

  /**
   * Persigue un objetivo hasta lograrlo (ver nucleo/persistir.ts): cada intento es un equipo; si no
   * sale, reintenta con lo que falló como pista, escala de modelo si falla igual, instala lo del repo
   * si falta una dependencia, y te pide ayuda solo cuando ya no hay nada razonable que probar.
   * El primer plan espera tu «dale» (si corrés con permisos); los siguientes, no: ya dijiste que sí.
   */
  async perseguir(objetivo: string, opciones: { oraculo?: string } = {}): Promise<Intento[]> {
    if (this.noSiEstaOcupada()) return [];
    this.persecucion = objetivo;
    try {
      return await this.perseguirSinCandado(objetivo, opciones.oraculo);
    } finally {
      this.persecucion = null;
    }
  }

  private async perseguirSinCandado(objetivo: string, oraculo?: string): Promise<Intento[]> {
    const { repo, agente } = this.config;
    const config = await leerConfig(repo);
    const escalera = agente === "mentira" ? ["demo"] : ["sonnet", "opus"];
    // Un repo de afuera no instala nada solo (su configuración no se ejecuta); los demás, con el lockfile congelado.
    const deAfuera = await esClonado(repo).catch(() => true);
    const gestor = deAfuera ? undefined : (await detectarProyecto(repo).catch(() => undefined))?.gestor;
    const intentos: Intento[] = [];
    let modelo = this.lider && escalera.includes(this.lider) ? this.lider : escalera[0]!;
    this.decir(
      "dolphin",
      `Voy a perseguir esto hasta lograrlo, empezando con ${modelo}. Si algo falla igual dos veces, escalo; si me trabo, te pregunto.${oraculo ? ` Lo doy por logrado recién cuando \`${oraculo}\` salga en 0 sobre la rama del equipo.` : ""}`,
    );
    const veredictos: VeredictoDelOraculo[] = [];
    // Lo que dijo el oráculo en cada intento queda guardado, se logre o no: es la evidencia.
    const conEvidencia = async (rama?: string): Promise<Intento[]> => {
      if (oraculo) await guardarEvidencia(repo, { objetivo, oraculo, ...(rama ? { rama } : {}), logrado: !!rama, intentos, veredictos }).catch(() => "");
      return intentos;
    };
    for (;;) {
      const pedido = pedidoConPistas(pedidoConOraculo(objetivo, oraculo), intentos);
      const resultado = await this.pedirAlEquipo(pedido, { lider: modelo, interno: true, ...(intentos.length > 0 ? { esperarDale: false } : {}) });
      if (!resultado) return conEvidencia();
      let ok = !!resultado.rama;
      let porQue = resultado.porQue;
      // El portón dijo que la rama está sana; el oráculo dice si hace lo que pediste.
      if (ok && oraculo && resultado.ruta) {
        this.decir("dolphin", `La rama pasó el portón. Corro el oráculo: ${oraculo}`);
        const veredicto = await correrOraculo(oraculo, resultado.ruta);
        veredictos.push(veredicto);
        if (!veredicto.paso) {
          ok = false;
          porQue = porQueDelOraculo(veredicto);
          this.decir("dolphin", `El oráculo no pasó (${(veredicto.ms / 1000).toFixed(1)} s): ${porQue.split("\n")[0]!.replace(/^el oráculo no pasó: /, "")}`, "aviso");
        }
      }
      intentos.push({ ok, porQue, modelo, gastado: resultado.gastado });
      if (resultado.porQue === "no se aprobó el plan" || resultado.porQue === "el plan se pasa del tope del proyecto") return conEvidencia();
      const paso = siguientePaso(intentos, { escalera, maxIntentos: 5, ...(config.terminal?.tope ? { presupuesto: config.terminal.tope } : {}), ...(gestor ? { gestor } : {}) });
      if (paso.accion === "listo") {
        const ultimo = veredictos.at(-1);
        const prueba = oraculo && ultimo ? ` El oráculo pasó (${(ultimo.ms / 1000).toFixed(1)} s)${ultimo.salida ? `:\n${ultimo.salida.split("\n").slice(-5).join("\n")}` : "."}` : "";
        this.decir("dolphin", `Lo logré en ${intentos.length} intento${intentos.length === 1 ? "" : "s"}: ${resultado.rama}.${prueba}`, "bien");
        return conEvidencia(resultado.rama);
      }
      if (paso.accion === "ayuda") {
        this.decir("dolphin", `Necesito que lo mires: ${paso.porQue}. La evidencia de cada intento está en el chat y en la pestaña Equipo. Contame qué cambio y lo retomo.`, "aviso");
        this.avisar("trabado", "Dolphin necesita tu ayuda", `«${objetivo}»: ${paso.porQue}`, `ayuda:${this.ahora()}`);
        return conEvidencia();
      }
      if (paso.accion === "herramienta") {
        if (!paso.instalar) {
          this.decir("dolphin", `Falta «${paso.falta}» en la máquina y no es algo que instale solo: instalalo y decime «/objetivo» de nuevo.`, "aviso");
          this.avisar("trabado", "Falta una herramienta", `«${paso.falta}» para «${objetivo}»`, `herramienta:${paso.falta}`);
          return conEvidencia();
        }
        this.decir("dolphin", `Falta «${paso.falta}»: instalo las dependencias del repo (${[paso.instalar.cmd, ...paso.instalar.args].join(" ")}) y vuelvo a probar.`, "aviso");
        const instalado = await correr(paso.instalar.cmd, [...paso.instalar.args], { cwd: repo, windowsHide: true, shell: process.platform === "win32" }).then(
          () => true,
          () => false,
        );
        if (!instalado) {
          this.decir("dolphin", "No pude instalar las dependencias: mirá el repo y decime.", "mal");
          return conEvidencia();
        }
        continue;
      }
      if (paso.accion === "escalar") {
        this.decir("dolphin", `Falló igual que antes. Escalo a ${paso.modelo} para destrabarlo.`, "aviso");
        modelo = paso.modelo;
        continue;
      }
      this.decir("dolphin", "No salió, pero falló distinto que antes: hay progreso. Reintento con lo que aprendí.", "aviso");
    }
  }

  /** El informe verificable del equipo: con qué se comprobó lo integrado y qué quedó sin comprobar. */
  private async informeDelEquipo(objetivo: string, resultado: ResultadoDeEquipo): Promise<string> {
    const fases = (this.equipo?.finales ?? []).filter((f) => f.estado !== "corre").map((f) => ({ nombre: f.verificador, estado: f.estado as "paso" | "fallo" | "salteada", ...(f.ms !== undefined ? { ms: f.ms } : {}), ...(f.detalle ? { detalle: f.detalle } : {}) }));
    const tocados = resultado.base && resultado.ruta ? (await gitValor(["diff", "--name-only", resultado.base, "HEAD"], resultado.ruta).catch(() => "")).split("\n").filter(Boolean) : [];
    return informeEnTexto(armarInforme({ tarea: objetivo, fases, tocados }));
  }

  /** Aprobar o descartar una tarea de la última noche (ver manana.ts): desde la terminal o desde Telegram. */
  private async decidirDeLaNoche(n: number, accion: "aprobar" | "descartar"): Promise<void> {
    const r = await decidirDeLaNoche(this.config.repo, n, accion);
    this.decir("dolphin", r.ok ? r.porQue : `No pude: ${r.porQue}.`, r.ok ? "bien" : "aviso");
    this.alCambiar();
  }

  /** Lo que el equipo cuenta, en la terminal de quien corresponde: el plan al líder, el portón a cada compañero. */
  private terminalesDelEquipo(e: EventoEquipo): void {
    if (e.tipo === "worktree") this.dondeEs.set(e.ruta, e.id);
    if (e.tipo === "plan") for (const x of e.tareas) this.anotarEnTerminal("lider", "dolphin", `${x.id} · ${x.titulo}${x.modelo ? ` (${x.modelo})` : ""}${x.dependeDe ? ` · después de ${x.dependeDe}` : ""}`);
    if (e.tipo === "plan-fallo") this.anotarEnTerminal("lider", "error", e.porQue);
    if (e.tipo === "merge") this.anotarEnTerminal("lider", e.ok ? "dolphin" : "error", e.ok ? `Integré ${e.id}${e.resuelto?.length ? ` (resolví el choque en ${e.resuelto.join(", ")})` : ""}` : `${e.id} chocó: ${e.porQue ?? ""}`);
    if (e.tipo === "choque") for (const [yo, otro] of [e.ids, [e.ids[1], e.ids[0]]] as const) this.anotarEnTerminal(yo, "dolphin", `Choque temprano con ${otro}: ${e.archivos.join(", ")}`);
    if (e.tipo === "deshecha") {
      this.anotarEnTerminal("lider", e.ok ? "dolphin" : "error", `Deshacer ${e.id}: ${e.porQue}`);
      this.anotarEnTerminal(e.id, e.ok ? "dolphin" : "error", e.ok ? "Su trabajo se deshizo en la rama del equipo (git revert del merge)." : e.porQue);
    }
    if (e.tipo === "fase-final" && e.estado !== "corre") this.anotarEnTerminal("revisor", e.estado === "fallo" ? "error" : "dolphin", `${e.verificador}: ${e.estado === "paso" ? "pasó" : e.estado}${e.detalle ? ` · ${e.detalle.split("\n")[0]}` : ""}`);
    if (e.tipo === "companero") {
      const v = e.evento;
      if (v.tipo === "veredicto") this.anotarEnTerminal(e.id, v.paso || v.salteada ? "dolphin" : "error", `Portón · ${v.verificador}: ${v.paso ? "pasó" : v.salteada ? "salteada" : "falló"} (${(v.ms / 1000).toFixed(1)} s)`);
      if (v.tipo === "corrige") this.anotarEnTerminal(e.id, "dolphin", `Corrige ${v.verificador} (intento ${v.intento})`);
      if (v.tipo === "fallo-escribiendo") this.anotarEnTerminal(e.id, "error", v.porQue);
    }
  }

  /** Lo que tocó cada compañero en la rama del equipo, para revisar por partes. */
  async cambiosDelEquipo(): Promise<CambiosDeCompanero[]> {
    const equipo = this.equipo;
    if (!equipo?.fin?.ruta) return [];
    const merges = equipo.tareas.filter((t) => t.commit && t.estado !== "deshecha").map((t) => ({ id: t.id, commit: t.commit! }));
    return cambiosPorCompanero(equipo.fin.ruta, merges);
  }

  /** La rama del equipo, lista para integrar: con qué commit y a qué rama. */
  private async ramaDelEquipo() {
    const fin = this.equipo?.fin;
    if (!fin?.rama || !fin.ruta || !fin.base) return null;
    const commit = await gitValor(["rev-parse", "HEAD"], fin.ruta).catch(() => "");
    return commit ? { entregada: { rama: fin.rama, commit, base: fin.base, ...(fin.ramaBase ? { ramaBase: fin.ramaBase } : {}) }, ruta: fin.ruta } : null;
  }

  /** Lleva la rama del equipo a tu rama, con las guardas de siempre (nada sin commitear, la rama correcta). */
  async integrar(): Promise<void> {
    if (this.noSiEstaOcupada()) return;
    const lista = await this.ramaDelEquipo();
    if (!lista || !this.equipo) {
      this.decir("dolphin", "No hay una rama del equipo que haya pasado el portón para integrar.", "aviso");
      return;
    }
    const r = await mergearRama(this.config.repo, lista.entregada, this.equipo.objetivo, lista.ruta);
    if (r.ok) {
      // Ya no hay worktree ni rama: el trabajo vive en tu rama. Sin ruta, no se integra dos veces.
      const { ruta: _ruta, ...resto } = this.equipo.fin!;
      this.equipo.fin = { ...resto, porQue: `integrada en ${lista.entregada.ramaBase ?? "tu rama"}` };
    }
    this.decir("dolphin", r.ok ? `Listo: lo del equipo ya está en ${lista.entregada.ramaBase ?? "tu rama"}. Limpié el worktree y la rama.` : `No lo integré: ${r.porQue}`, r.ok ? "bien" : "mal");
    this.alCambiar();
  }

  /** Tira la rama del equipo y su worktree. El commit queda en el reflog un tiempo, por las dudas. */
  async descartar(): Promise<void> {
    if (this.noSiEstaOcupada()) return;
    const lista = await this.ramaDelEquipo();
    if (!lista || !this.equipo) {
      this.decir("dolphin", "No hay una rama del equipo para descartar.", "aviso");
      return;
    }
    await descartarRama(this.config.repo, lista.entregada, lista.ruta);
    this.equipo.fin = { porQue: "descartada", ms: this.equipo.fin!.ms, gastado: this.equipo.fin!.gastado };
    this.decir("dolphin", `Descarté ${lista.entregada.rama}. Si te arrepentís, el commit ${lista.entregada.commit.slice(0, 7)} sigue en el reflog un tiempo.`);
    this.alCambiar();
  }

  /** Deshace solo el trabajo de un compañero (por id o por nombre) en la rama de integración y vuelve a probar. */
  /** Los turnos de un compañero del último equipo (ver nucleo/turnos.ts). */
  async turnos(quien: string): Promise<void> {
    const x = this.equipo?.tareas.find((t) => t.id === quien || t.dueno === quien);
    if (!x?.rama) return this.decir("dolphin", `No hay ningún compañero «${quien}» con rama en el último equipo.`, "aviso");
    const turnos = await turnosDe(this.config.repo, x.rama);
    if (turnos.length === 0) return this.decir("dolphin", `${x.dueno} no tiene turnos guardados.`, "aviso");
    this.decir("dolphin", [`Los turnos de ${x.dueno} (${x.titulo}):`, ...turnos.map((t) => `${t.n}. ${t.que} · +${t.agregadas} −${t.quitadas}`), "", `Para volver a uno: /volver ${x.dueno} 1`].join("\n"));
  }

  /** Lleva a un compañero a un turno anterior dentro de la rama del equipo, y vuelve a probar. */
  async volverAlTurno(quien: string, n: number): Promise<void> {
    if (this.noSiEstaOcupada()) return;
    const equipo = this.equipo;
    const x = equipo?.tareas.find((t) => t.id === quien || t.dueno === quien);
    if (!equipo?.fin?.ruta || !x?.rama || x.estado !== "integrada") {
      this.decir("dolphin", `No hay ningún compañero «${quien}» integrado en el último equipo.`, "aviso");
      return;
    }
    const trabajo: Trabajo = { tipo: "equipo", desde: this.ahora(), titulo: `${x.dueno} vuelve al turno ${n}` };
    this.trabajo = trabajo;
    this.decir("dolphin", `Llevo a ${x.dueno} a su turno ${n} y vuelvo a pasar el portón por todo.`);
    try {
      const { ok, porQue } = await volverAlTurnoEnElEquipo(
        { repo: this.config.repo, ruta: equipo.fin.ruta, id: x.id, rama: x.rama, n, agente: this.config.agente, verificar: await this.verificar(), automatico: this.config.automatico },
        (e) => {
          aplicarAlEquipo(equipo, e, this.ahora());
          this.terminalesDelEquipo(e);
        },
      );
      this.decir("dolphin", ok ? `Listo: ${porQue}.` : `No pude: ${porQue}.`, ok ? "bien" : "mal");
    } finally {
      trabajo.terminado = this.ahora();
      this.alCambiar();
    }
  }

  async deshacer(quien: string): Promise<void> {
    if (this.noSiEstaOcupada()) return;
    const equipo = this.equipo;
    const x = equipo?.tareas.find((t) => t.id === quien || t.dueno === quien);
    if (!equipo || !x) {
      this.decir("dolphin", `No hay ningún compañero «${quien}» en el último equipo.`, "aviso");
      return;
    }
    if (x.estado !== "integrada" || !x.commit || !equipo.fin?.ruta) {
      this.decir("dolphin", `${x.dueno} no tiene trabajo integrado para deshacer (está ${x.estado}).`, "aviso");
      return;
    }
    const trabajo: Trabajo = { tipo: "equipo", desde: this.ahora(), titulo: `deshacer ${x.dueno}` };
    this.trabajo = trabajo;
    this.decir("dolphin", `Deshago lo de ${x.dueno} (${x.titulo}) y vuelvo a pasar el portón por lo que queda.`);
    try {
      const { ok, porQue } = await deshacerDelEquipo(
        { repo: this.config.repo, ruta: equipo.fin.ruta, id: x.id, commit: x.commit, agente: this.config.agente, verificar: await this.verificar(), automatico: this.config.automatico, titulo: x.titulo, objetivo: equipo.objetivo },
        (e) => {
          aplicarAlEquipo(equipo, e, this.ahora());
          this.terminalesDelEquipo(e);
        },
      );
      if (ok && !equipo.fin.rama) {
        const rama = await gitValor(["rev-parse", "--abbrev-ref", "HEAD"], equipo.fin.ruta).catch(() => "");
        if (rama) equipo.fin = { ...equipo.fin, rama, porQue };
      }
      this.decir("dolphin", ok ? `Listo: ${porQue}. La rama ${equipo.fin.rama ?? ""} sigue con el resto.` : porQue, ok ? "bien" : "mal");
    } catch (e) {
      this.decir("dolphin", `No se pudo deshacer: ${(e as Error).message}`, "mal");
    } finally {
      trabajo.terminado = this.ahora();
      this.alCambiar();
    }
  }

  /** Lo importante del equipo, dicho en el chat; el detalle queda en la pestaña Equipo. */
  private contarDelEquipo(e: EventoEquipo): void {
    if (e.tipo === "plan" && !e.corregido) this.decir("dolphin", `El líder la partió en ${e.tareas.length}: ${e.tareas.map((x) => x.titulo).join(", ")}.`);
    if (e.tipo === "plan-fallo") this.decir("dolphin", `El líder no pudo armar el plan: ${e.porQue}`, "mal");
    if (e.tipo === "merge" && !e.ok) this.decir("dolphin", `${e.id} chocó al integrar${e.porQue ? `: ${e.porQue}` : ""}.`, "aviso");
    const dueno = (id: string) => this.equipo?.tareas.find((t) => t.id === id)?.dueno ?? id;
    if (e.tipo === "choque") this.decir("dolphin", `Ojo: ${dueno(e.ids[0])} y ${dueno(e.ids[1])} están tocando ${e.archivos.length === 1 ? e.archivos[0] : `${e.archivos.length} archivos en común`}. Si chocan al integrar, la cola vuelve a hacer la segunda encima de la primera.`, "aviso");
    if (e.tipo === "fase-final" && e.verificador === "revisión" && e.estado === "fallo") this.decir("dolphin", "La revisión no lo aceptó.", "mal");
  }
}

/** El líder de mentira: un plan fijo de tres partes, una que depende de otra. No gasta nada, pero cuenta lo que hace. */
function liderDeMentira(objetivo: string): Planificador {
  return async (_prompt, repo) => {
    const voz = vozDelLider(repo);
    decirVoz(voz, "pensando", "¿Qué se puede hacer en paralelo y qué tiene que esperar?");
    decirVoz(voz, "texto", "Miro el repo antes de partir la tarea.");
    decirVoz(voz, "herramienta", "Read package.json");
    decirVoz(voz, "resultado", "Leyó 1 renglón");
    decirVoz(voz, "herramienta", "Glob src/**/*");
    decirVoz(voz, "resultado", "1 archivo\nsrc/a.js");
    decirVoz(voz, "texto", "La parto en tres: la lógica, la pantalla y los tests (que esperan a la lógica).");
    return liderFijo(objetivo);
  };
}

/** El plan de un equipo de uno: el pedido entero, a un agente del escalón medio. No gasta nada. */
function tareaSola(objetivo: string): { texto: string; gastado: number } {
  return { texto: JSON.stringify({ resumen: objetivo, tareas: [{ id: "t1", titulo: objetivo, tarea: objetivo, escalon: "medio" }] }), gastado: 0 };
}

/** Cómo se nombra una cuenta en el chat: su email, o «la de siempre». */
export function nombreDeCuenta(c: Cuenta | null): string {
  if (!c || c.id === CUENTA_DE_SIEMPRE) return c?.email ? `${c.email} (la de siempre)` : "la cuenta de siempre";
  return c.email ?? c.id;
}

function liderFijo(objetivo: string): { texto: string; gastado: number } {
  return {
    texto: JSON.stringify({
      resumen: `partir «${objetivo}» en la lógica, la pantalla y sus tests`,
      tareas: [
        { id: "t1", titulo: "la lógica", tarea: `${objetivo}: la lógica de fondo`, escalon: "medio" },
        { id: "t2", titulo: "la pantalla", tarea: `${objetivo}: lo que se ve en la interfaz`, escalon: "barato" },
        { id: "t3", titulo: "los tests", tarea: `${objetivo}: tests de la lógica`, escalon: "barato", dependeDe: "t1" },
      ],
    }),
    gastado: 0,
  };
}
