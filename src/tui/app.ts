import type { ReadStream, WriteStream } from "node:tty";
import { resolve } from "node:path";
import { cambiarEstado } from "../nucleo/bandeja.js";
import { sumarProyecto } from "../nucleo/proyectos.js";
import { revisarRepo } from "../nucleo/repo.js";
import { aprobarCandidato, descartarCandidato, prenderRecuerdo } from "../nucleo/memoria.js";
import { Bufer, diferencia, profundidadDe, type Profundidad } from "./celdas.js";
import { barraDeArriba, dibujarAyuda, dibujarPaleta, dibujarPrompt, filtrarPaleta, pie, sugerencias, VISTAS, vistaChat, vistaInicio, type EntradaDePaleta, type EstadoPrompt, type Vista } from "./cromo.js";
import { instantaneaVacia, leerInstantanea, type Instantanea } from "./datos.js";
import { T, vacio, type Rect, type Zona } from "./piezas.js";
import { crearAvisador, emisoresDelEntorno } from "../nucleo/avisos.js";
import { ColaDeMensajes } from "./cola-de-mensajes.js";
import { MODELOS_PRINCIPALES, Sesion, type ConfigDeSesion } from "./sesion.js";
import { crearLector, MODOS, type Entrada } from "./teclas.js";
import { asuntosOrdenados, vistaBandeja, vistaHistorial, vistaMemoria } from "./vistas-datos.js";
import { columnaVecina, tarjetasOrdenadas, vistaTablero } from "./vistas-tablero.js";
import { moverTarjeta } from "../nucleo/tarjetas.js";
import { laFrenan } from "../nucleo/tarjetas-espera.js";
import { tarjetasDelEquipo, vistaEquipo, vistaRevision, vistaTerminal } from "./vistas-equipo.js";
import { EstadoGit, PESTANAS_GIT } from "./git-estado.js";
import { vistaGit } from "./vistas-git.js";
import { vistaGitAdentro } from "./vistas-git-adentro.js";
import { abrirEnElNavegador } from "./abrir.js";
import type { CambiosDeCompanero } from "../equipo/equipo.js";

/**
 * Dolphin en la terminal: una cáscara en grises con las secciones adentro; todo lo
 * que se ve sale del núcleo (la sesión corre equipo y siembra) y de `.dolphin/` (los datos de la
 * app de escritorio). `App` no toca la terminal: recibe entradas y devuelve cuadros, así los tests
 * la manejan con teclas de mentira. `abrirApp` es la que pone la terminal en modo crudo y la deja
 * como estaba al salir, pase lo que pase.
 */

/** Un dígito que nombra una sección: se arma de VISTAS para que sumar una no deje la última sin atajo. */
const esDigitoDeVista = (texto: string): boolean => /^[1-9]$/.test(texto) && Number(texto) <= VISTAS.length;

const CON_LISTA: readonly Vista[] = ["equipo"];

export class App {
  vista: Vista = "inicio";
  /** El foco: el prompt o la lista de la vista. */
  focoEnVista = false;
  readonly prompt: EstadoPrompt = { texto: "", cursor: 0, foco: true, sugerencia: 0 };
  readonly seleccion: Record<Vista, number> = { inicio: 0, chat: 0, equipo: 0 };
  desplazamientoChat = 0;
  /** La terminal de un agente abierta en la pestaña Equipo (su clave), y cuánto se subió. */
  terminalAbierta: string | null = null;
  desplazamientoTerminal = 0;
  /** La revisión de la rama del equipo (lo que tocó cada compañero), si está abierta. */
  revision: CambiosDeCompanero[] | null = null;
  /** Una x pide confirmar el descarte con otra x. */
  descartePendiente = false;
  /** La última pestaña que se cambió con un dígito, por si era el principio de un mensaje. */
  private porDigito: { t: number; vista: Vista; digito: string } | null = null;
  /** Una tecla que hace algo que no se deshace solo (d, espacio sobre una candidata, r): se repite para confirmar. */
  confirmando: { tecla: string; que: string; t: number } | null = null;
  paleta: { filtro: string; seleccion: number } | null = null;
  ayuda = false;
  datos: Instantanea;
  /** La sección Git: ramas, grafo e issues, leídos al entrar (ver git-estado.ts). */
  readonly git = new EstadoGit(() => this.sesion.alCambiar());
  /** Un Ctrl+C con algo corriendo pide un segundo para cortar: cuándo fue el primero. */
  avisoDeCorte = 0;
  saliendo: "salir" | "cortar" | null = null;
  /** Si la terminal tiene el foco (modo 1004). Sin foco, los avisos salen como notificación. */
  enFoco = true;
  /** Cuándo se abrió: el delfín se arma ahí, punto por punto. */
  readonly abierta: number;
  /** Cuándo se cambió de sección (la nueva entra fundiéndose) y cuándo se mandó algo (el prompt destella). */
  private cambioDeVista = 0;
  private mandado = 0;
  /** Lo que escribiste mientras el equipo trabajaba: sale solo cuando termina. */
  readonly cola = new ColaDeMensajes();
  private zonas: Zona[] = [];
  private historial: string[] = [];
  private enHistorial = -1;

  constructor(
    public sesion: Sesion,
    readonly ahora: () => number = Date.now,
  ) {
    this.datos = instantaneaVacia(sesion.config.repo);
    this.abierta = ahora();
  }

  /** Pasa a otro proyecto de ~/.dolphin: otra sesión sobre otro repo, con los datos de ese repo. */
  async cambiarProyecto(ruta: string, sumar = false): Promise<void> {
    if (this.sesion.ocupada) {
      this.sesion.decir("dolphin", "Cuando termine lo que está corriendo te cambio de proyecto.", "aviso");
      return;
    }
    const revision = await revisarRepo(ruta);
    if (!revision.sirve) {
      this.sesion.decir("dolphin", revision.porQue ?? "Esa carpeta no es un repo de git que se pueda usar.", "mal");
      return;
    }
    // Uno nuevo (/abrir) queda en ~/.dolphin: la app de escritorio también lo ve.
    if (sumar) await sumarProyecto(ruta).catch(() => null);
    const avisar = this.sesion.alCambiar;
    this.sesion.cerrar();
    this.sesion = new Sesion({ ...this.sesion.config, repo: ruta, sinRepo: false });
    this.sesion.alCambiar = avisar;
    this.datos = instantaneaVacia(ruta);
    this.irA("inicio");
    avisar();
    await this.sesion
      .cargarHistoria()
      .then(() => this.sesion.traerInstrucciones())
      .then(() => this.sesion.traerTodosDelCodigo())
      .then(() => this.sesion.proponerArranque())
      .then(() => this.sesion.revisarAlAbrir())
      .catch((e: unknown) => this.sesion.decir("sistema", `No pude leer todo del proyecto: ${(e as Error).message}`));
  }

  /** Salir: si algo corre (o está pensando), es cortar, para que no queden procesos ni enlaces colgados. */
  salir(): void {
    this.saliendo = this.sesion.ocupada || this.sesion.pensandoDesde ? "cortar" : "salir";
  }

  irA(vista: Vista): void {
    if (vista !== this.vista) this.cambioDeVista = this.ahora();
    if (vista !== "equipo") {
      this.terminalAbierta = null;
      this.revision = null;
    }
    this.vista = vista;
    this.focoEnVista = CON_LISTA.includes(vista);
    this.prompt.foco = !this.focoEnVista;
    if (vista === "chat") this.desplazamientoChat = 0;
  }

  // --- Lo que se dibuja ---

  dibujar(ancho: number, alto: number): Bufer {
    const t = this.ahora();
    const b = new Bufer(ancho, alto);
    const zonas: Zona[] = [];
    if (ancho < 60 || alto < 20) {
      b.rellenar(0, 0, ancho, alto, T.fondo);
      vacio(b, { x: 0, y: 0, w: ancho, h: alto }, "Dolphin necesita más lugar.", `Agrandá la terminal a 60×20 (ahora ${ancho}×${alto}).`);
      return b;
    }
    // Lo que esperaba sale acá y no al terminar el trabajo: «terminó» no es un momento —`ocupada`
    // es un cálculo sobre el trabajo y la persecución— y buscarle un gancho a cada forma de
    // terminar deja siempre una sin cubrir, con el pedido de la persona guardado para siempre.
    this.soltarLaColaSiSePuede();
    const enInicio = this.vista === "inicio";
    b.rellenar(0, 0, ancho, alto, T.fondo);
    // En el inicio el prompt va al centro (lo ubica el inicio); en las demás, abajo.
    const area: Rect = { x: 1, y: 4, w: ancho - 2, h: alto - 4 - (enInicio ? 2 : 5) };
    let prompt: Rect = { x: 1, y: alto - 4, w: ancho - 2, h: 3 };
    zonas.push(...barraDeArriba(b, this.datos, this.sesion, this.vista, t, (v) => this.irA(v)));

    const elegir = (i: number) => {
      this.seleccion[this.vista] = i;
      this.focoEnVista = true;
      this.prompt.foco = false;
    };
    switch (this.vista) {
      case "inicio":
      {
        const inicio = vistaInicio(b, area, this.datos, this.sesion, t, {
          abierta: this.abierta,
          seleccion: this.seleccion.inicio,
          abrir: (ruta) => void this.cambiarProyecto(ruta),
          otroModelo: () => this.otroModelo(),
          alternarOrquestar: () => {
            this.sesion.orquestar = !this.sesion.orquestar;
            this.sesion.decir("dolphin", this.sesion.orquestar ? "Listo: reparto el pedido en un equipo." : "Listo: lo hace un agente solo, sin repartir.", "bien");
          },
          verAgentes: () => this.irA("equipo"),
        });
        prompt = inicio.prompt;
        zonas.push(...inicio.zonas);
        break;
      }
      case "chat":
        vistaChat(b, area, this.datos, this.sesion, this.desplazamientoChat, t, this.abierta);
        break;
      case "equipo": {
        const tarjetas = this.sesion.equipo ? tarjetasDelEquipo(this.sesion.equipo, this.sesion.equipo.agente) : [];
        const abierta = tarjetas.find((x) => x.clave === this.terminalAbierta);
        if (this.revision) vistaRevision(b, area, this.sesion, this.revision, this.descartePendiente);
        else if (abierta) vistaTerminal(b, area, this.sesion, abierta, t, this.desplazamientoTerminal);
        else
          zonas.push(
            ...vistaEquipo(b, area, this.sesion, this.seleccion.equipo, t, (i) => {
              // Un clic elige; un clic sobre la elegida abre su terminal.
              if (this.seleccion.equipo === i) this.abrirTerminal();
              else elegir(i);
            }),
          );
        break;
      }
    }

    // La sección nueva entra fundiéndose desde el fondo (180 ms).
    const entrada = (t - this.cambioDeVista) / 180;
    if (entrada < 1) b.velo(0, 3, ancho, alto - 3, T.fondo, 1 - entrada * entrada);

    zonas.push(
      ...dibujarPrompt(
        b,
        prompt,
        this.prompt,
        this.sesion.ocupada,
        t,
        () => {
          this.focoEnVista = false;
          this.prompt.foco = true;
        },
        this.sesion.config.sinRepo,
        this.mandado,
        this.sesion.esperaDale,
        this.cola.pendientes,
      ),
    );
    pie(b, this.vista, this.focoEnVista, this.sesion.ocupada, this.sesion, t);
    if (this.confirmando && t - this.confirmando.t < 3000) {
      const aviso = ` ${this.confirmando.tecla === " " ? "espacio" : this.confirmando.tecla} otra vez para ${this.confirmando.que} `;
      b.texto(Math.max(0, Math.floor((ancho - aviso.length) / 2)), alto - 5, aviso, { fg: T.fondo, bg: T.amarillo, negrita: true });
    }
    if (this.avisoDeCorte && t - this.avisoDeCorte < 2500) {
      const aviso = " ctrl+c otra vez corta lo que está corriendo ";
      b.texto(Math.floor((ancho - aviso.length) / 2), alto - 5, aviso, { fg: T.fondo, bg: T.amarillo, negrita: true });
    }

    if (this.paleta) {
      zonas.length = 0;
      zonas.push(...dibujarPaleta(b, this.entradasDePaleta(), this.paleta.filtro, this.paleta.seleccion, (i) => this.elegirDePaleta(i)));
    } else if (this.ayuda) {
      zonas.length = 0;
      dibujarAyuda(b);
    }
    this.zonas = zonas;
    return b;
  }

  /** Si el cuadro cambia solo (el delfín, un reloj): cada cuánto redibujar. */
  get cuadroMs(): number {
    if (this.vista === "inicio" || this.vista === "chat" || this.sesion.ocupada || (this.vista === "equipo" && this.sesion.equipo)) return 50;
    return this.ahora() - this.cambioDeVista < 400 ? 33 : 120;
  }

  // --- Lo que entra ---

  entradasDePaleta(): EntradaDePaleta[] {
    const ir = VISTAS.map((v, i) => ({ texto: `Ir a ${v}`, nota: String(i + 1), hacer: () => this.irA(v) }));
    const escribir = (texto: string) => () => {
      this.irA("chat");
      this.ponerTexto(texto);
    };
    const comandos: EntradaDePaleta[] = [
      { texto: "Pedirle algo al equipo…", nota: "enter", hacer: escribir("") },
      { texto: "Enseñarle una regla a la memoria…", nota: "/memoria", hacer: escribir("/memoria ") },
      { texto: "Anotar una idea en la bandeja…", nota: "/idea", hacer: escribir("/idea ") },
      ...MODELOS_PRINCIPALES.map((m) => ({ texto: `Modelo principal: ${m}`, nota: this.sesion.lider === m ? "elegido" : "/lider", hacer: () => void this.sesion.recibir(`/lider ${m}`) })),
      { texto: "Ayuda y atajos", nota: "f1", hacer: () => (this.ayuda = true) },
      { texto: "Salir de Dolphin", nota: "ctrl+c", hacer: () => this.salir() },
    ];
    const proyectos = this.datos.proyectos
      .filter((p) => p.ruta !== this.datos.repo)
      .map((p) => ({ texto: `Proyecto: ${p.nombre}`, nota: "abrir", hacer: () => void this.cambiarProyecto(p.ruta) }));
    return [...comandos, ...ir, ...proyectos];
  }

  private elegirDePaleta(i: number): void {
    const elegida = filtrarPaleta(this.entradasDePaleta(), this.paleta?.filtro ?? "")[i];
    this.paleta = null;
    elegida?.hacer();
  }

  private ponerTexto(texto: string): void {
    this.prompt.texto = texto;
    this.prompt.cursor = [...texto].length;
    this.prompt.foco = true;
    this.focoEnVista = false;
  }

  private insertar(texto: string): void {
    const letras = [...this.prompt.texto];
    const nuevas = [...texto.replace(/\r?\n/g, " ")];
    letras.splice(this.prompt.cursor, 0, ...nuevas);
    this.prompt.texto = letras.join("");
    this.prompt.cursor += nuevas.length;
    this.prompt.sugerencia = 0;
  }

  /** Con el equipo libre, lo que quedó esperando sale como UN pedido. */
  private soltarLaColaSiSePuede(): void {
    if (this.soltando || !this.cola.hay || this.sesion.ocupada || this.sesion.esperaDale || this.sesion.pensandoDesde) return;
    const texto = this.cola.soltar();
    if (!texto) return;
    this.soltando = true;
    this.irA("chat");
    void this.sesion
      .recibir(texto)
      .catch(() => this.sesion.decir("dolphin", "No pude con lo que había quedado esperando. Probá de nuevo.", "mal"))
      .finally(() => (this.soltando = false));
  }

  private soltando = false;

  private async mandar(): Promise<void> {
    const texto = this.prompt.texto.trim();
    if (!texto) return;
    // Con el equipo trabajando, un pedido suelto se guarda en vez de largar otro agente encima del
    // que está. Los comandos (/ayuda, /salir, /memoria) salen igual: son instantáneos y no compiten
    // por el repo. Y con el plan esperando el «dale», tampoco: esa respuesta es la que se espera.
    if (this.sesion.ocupada && !this.sesion.esperaDale && !texto.startsWith("/")) {
      if (this.cola.encolar(texto, this.ahora())) {
        this.historial.push(texto);
        this.enHistorial = -1;
        this.ponerTexto("");
      }
      return;
    }
    this.historial.push(texto);
    this.enHistorial = -1;
    this.mandado = this.ahora();
    this.ponerTexto("");
    // Lo que se pide se ve en el chat; las anotaciones se quedan donde estás.
    if (!/^\/(memoria|idea|ayuda)\b/.test(texto)) this.irA("chat");
    this.focoEnVista = false;
    this.prompt.foco = true;
    const r = await this.sesion.recibir(texto);
    if (r === "salir") this.salir();
    else if (r) {
      await this.cambiarProyecto(resolve(r.abrir), true);
      // Si venía con un pedido (un proyecto nuevo), el equipo arranca en el repo nuevo.
      if (r.despues && this.sesion.config.repo === resolve(r.abrir)) {
        this.irA("chat");
        void this.sesion.pedirAlEquipo(r.despues);
      }
    }
  }

  /** Una entrada (tecla, texto, mouse). Devuelve una promesa solo cuando se mandó algo. */
  manejar(e: Entrada): Promise<void> | void {
    if (e.tipo === "foco") {
      this.enFoco = e.enFoco;
      return;
    }
    if (e.tipo === "mouse") return this.manejarMouse(e);
    if (e.tipo === "pegar") {
      if (this.paleta) this.paleta.filtro += e.texto.replace(/\s+/g, " ");
      else {
        this.focoEnVista = false;
        this.prompt.foco = true;
        this.insertar(e.texto);
      }
      return;
    }
    if (e.tipo === "tecla" && e.ctrl && e.nombre === "c") return this.cortar();
    if (e.tipo === "tecla" && e.ctrl && e.nombre === "k") {
      this.paleta = this.paleta ? null : { filtro: "", seleccion: 0 };
      return;
    }
    if (e.tipo === "tecla" && e.nombre === "f1") {
      this.ayuda = !this.ayuda;
      return;
    }
    if (this.paleta) return this.manejarPaleta(e);
    if (this.ayuda) {
      if (e.tipo === "tecla" && (e.nombre === "escape" || e.nombre === "enter")) this.ayuda = false;
      return;
    }
    if (e.tipo === "tecla" && e.alt && esDigitoDeVista(e.nombre)) return this.irA(VISTAS[Number(e.nombre) - 1]!);
    // Un dígito con el prompt vacío cambia de pestaña. Si enseguida (menos de 400 ms) llega más texto,
    // estabas escribiendo «2 cosas…»: se vuelve a donde estabas y el dígito va al prompt.
    // En una pestaña con lista, lo que sigue es un comando de la lista (6 y espacio en Memoria): no se vuelve.
    if (e.tipo === "texto" && this.porDigito && this.ahora() - this.porDigito.t < 400 && !CON_LISTA.includes(this.vista)) {
      const { vista, digito } = this.porDigito;
      this.porDigito = null;
      this.irA(vista);
      this.focoEnVista = false;
      this.prompt.foco = true;
      this.insertar(digito + e.texto);
      return;
    }
    this.porDigito = null;
    if (e.tipo === "texto" && esDigitoDeVista(e.texto) && !this.prompt.texto) {
      this.porDigito = { t: this.ahora(), vista: this.vista, digito: e.texto };
      return this.irA(VISTAS[Number(e.texto) - 1]!);
    }
    if (e.tipo === "tecla" && e.nombre === "tab" && !e.shift && sugerencias(this.prompt.texto).length === 0) {
      if (CON_LISTA.includes(this.vista)) {
        this.focoEnVista = !this.focoEnVista;
        this.prompt.foco = !this.focoEnVista;
      }
      return;
    }
    if (this.focoEnVista) return this.manejarLista(e);
    return this.manejarPrompt(e);
  }

  private cortar(): void {
    if (this.prompt.texto) return this.ponerTexto("");
    if (!this.sesion.ocupada && !this.sesion.pensandoDesde) {
      this.saliendo = "salir";
      return;
    }
    const t = this.ahora();
    if (this.avisoDeCorte && t - this.avisoDeCorte < 2500) this.saliendo = "cortar";
    else this.avisoDeCorte = t;
  }

  private manejarPaleta(e: Entrada): void {
    const p = this.paleta!;
    const total = filtrarPaleta(this.entradasDePaleta(), p.filtro).length;
    if (e.tipo === "texto") {
      p.filtro += e.texto;
      p.seleccion = 0;
    } else if (e.tipo === "tecla") {
      if (e.nombre === "escape") this.paleta = null;
      else if (e.nombre === "enter") this.elegirDePaleta(p.seleccion);
      else if (e.nombre === "borrar") p.filtro = [...p.filtro].slice(0, -1).join("");
      else if (e.nombre === "arriba") p.seleccion = (p.seleccion - 1 + Math.max(1, total)) % Math.max(1, total);
      else if (e.nombre === "abajo" || e.nombre === "tab") p.seleccion = (p.seleccion + 1) % Math.max(1, total);
    }
  }

  private cuantosEnLista(): number {
    if (this.vista === "inicio") return this.sesion.config.sinRepo ? this.datos.proyectos.length : 0;
    if (this.vista === "equipo") return this.sesion.equipo ? this.sesion.equipo.tareas.length + 2 : 0;
    return 0;
  }

  private mover(delta: number): void {
    const total = this.cuantosEnLista();
    if (total === 0) return;
    this.seleccion[this.vista] = Math.max(0, Math.min(total - 1, this.seleccion[this.vista] + delta));
  }

  /** Entra a la terminal del agente elegido en la pestaña Equipo. */
  private abrirTerminal(): void {
    const tarjetas = this.sesion.equipo ? tarjetasDelEquipo(this.sesion.equipo, this.sesion.equipo.agente) : [];
    const x = tarjetas[this.seleccion.equipo];
    if (!x) return;
    this.terminalAbierta = x.clave;
    this.desplazamientoTerminal = 0;
    this.cambioDeVista = this.ahora();
  }

  private manejarLista(e: Entrada): Promise<void> | void {
    // Revisando la rama del equipo: i integra, x x descarta, cualquier otra cosa vuelve.
    if (this.vista === "equipo" && this.revision) {
      const tecla = e.tipo === "texto" ? e.texto : e.tipo === "tecla" ? e.nombre : "";
      if (tecla === "x" && this.descartePendiente) {
        this.descartePendiente = false;
        this.revision = null;
        return this.sesion.descartar();
      }
      if (tecla === "x") {
        this.descartePendiente = true;
        return;
      }
      this.descartePendiente = false;
      if (tecla === "i") {
        this.revision = null;
        return this.sesion.integrar();
      }
      if (tecla === "escape" || tecla === "borrar" || tecla === "r") this.revision = null;
      return;
    }
    // Adentro de la terminal de un agente: subir, bajar y volver.
    if (this.vista === "equipo" && this.terminalAbierta && e.tipo === "tecla") {
      if (e.nombre === "escape" || e.nombre === "borrar") {
        this.terminalAbierta = null;
        this.cambioDeVista = this.ahora();
      } else if (e.nombre === "repag" || e.nombre === "arriba") this.desplazamientoTerminal += e.nombre === "repag" ? 10 : 1;
      else if (e.nombre === "avpag" || e.nombre === "abajo") this.desplazamientoTerminal = Math.max(0, this.desplazamientoTerminal - (e.nombre === "avpag" ? 10 : 1));
      return;
    }
    if (e.tipo === "texto") {
      // Las teclas de la lista; cualquier otra letra se va al prompt, como si hubieras empezado a escribir.
      const tecla = e.texto;
      if (tecla === "r" && this.vista === "equipo" && !this.terminalAbierta && this.sesion.equipo?.fin?.ruta) {
        return this.sesion
          .cambiosDelEquipo()
          .then((cambios) => {
            this.revision = cambios;
            this.cambioDeVista = this.ahora();
          })
          .catch(this.fallo);
      }
      if (tecla === "d" && this.vista === "equipo" && !this.terminalAbierta) {
        const x = this.sesion.equipo ? tarjetasDelEquipo(this.sesion.equipo, this.sesion.equipo.agente)[this.seleccion.equipo] : undefined;
        const tarea = x && this.sesion.equipo?.tareas.find((t) => t.id === x.clave);
        // Solo un compañero con trabajo integrado se puede deshacer; sobre otra tarjeta, «d» es texto.
        if (tarea?.estado === "integrada") {
          if (!this.confirmar("d", `deshacer lo de ${tarea.dueno}`)) return;
          return void this.sesion
            .recibir(`/deshacer ${tarea.id}`)
            .then(() => this.sesion.alCambiar())
            .catch((e: unknown) => this.sesion.decir("sistema", `No se pudo deshacer: ${(e as Error).message}`));
        }
      }
      if (tecla === "j") return this.mover(1);
      if (tecla === "k") return this.mover(-1);
      this.focoEnVista = false;
      this.prompt.foco = true;
      this.insertar(tecla);
      return;
    }
    if (e.tipo !== "tecla") return;
    if (e.nombre === "arriba" || e.nombre === "izquierda") return this.mover(-1);
    if (e.nombre === "abajo" || e.nombre === "derecha") return this.mover(1);
    if (e.nombre === "enter" && this.vista === "equipo") return this.abrirTerminal();
    if (e.nombre === "repag") return this.mover(-10);
    if (e.nombre === "avpag") return this.mover(10);
    if (e.nombre === "inicio") return this.mover(-1e6);
    if (e.nombre === "fin") return this.mover(1e6);
  }


  /** La primera vez anota qué se va a hacer; la segunda (dentro de 3 s, la misma tecla) lo confirma. */
  private confirmar(tecla: string, que: string): boolean {
    const ahora = this.ahora();
    if (this.confirmando && this.confirmando.tecla === tecla && ahora - this.confirmando.t < 3000) {
      this.confirmando = null;
      return true;
    }
    this.confirmando = { tecla, que, t: ahora };
    return false;
  }

  private recargar(): void {
    this.sesion.alCambiar();
  }

  /**
   * Pasa al modelo siguiente: sin elegir → el primero → … → el último → sin elegir.
   *
   * Vuelve a «sin elegir» a propósito: es el default del motor (el más capaz), y si el ciclo no
   * pasara por ahí, una vez tocada la pastilla no habría forma de volver a dejarlo decidir.
   */
  private otroModelo(): void {
    const i = this.sesion.lider === null ? -1 : MODELOS_PRINCIPALES.indexOf(this.sesion.lider as (typeof MODELOS_PRINCIPALES)[number]);
    const siguiente = MODELOS_PRINCIPALES[i + 1] ?? null;
    this.sesion.lider = siguiente;
    this.sesion.decir("dolphin", siguiente ? `Listo: ${siguiente} es el modelo principal.` : "Listo: vuelve a elegir el motor (el más capaz).", "bien");
  }

  /** Un error de algo que corre en segundo plano se dice en el chat: no puede tirar la app. */
  private fallo = (e: unknown): void => this.sesion.decir("sistema", `Algo no salió: ${(e as Error).message}`);


  private manejarPrompt(e: Entrada): Promise<void> | void {
    const p = this.prompt;
    if (e.tipo === "texto") return this.insertar(e.texto);
    if (e.tipo !== "tecla") return;
    const letras = [...p.texto];
    const lista = sugerencias(p.texto);
    if (lista.length > 0 && (e.nombre === "tab" || e.nombre === "arriba" || e.nombre === "abajo")) {
      if (e.nombre === "tab") return this.ponerTexto(`${lista[p.sugerencia % lista.length]!.nombre} `);
      p.sugerencia = (p.sugerencia + (e.nombre === "abajo" ? 1 : lista.length - 1)) % lista.length;
      return;
    }
    if (e.ctrl && e.nombre === "a") p.cursor = 0;
    else if (e.ctrl && e.nombre === "e") p.cursor = letras.length;
    else if (e.ctrl && e.nombre === "u") this.ponerTexto("");
    else if ((e.ctrl && e.nombre === "w") || (e.nombre === "borrar" && (e.ctrl || e.alt))) {
      const antes = letras.slice(0, p.cursor).join("").replace(/\S+\s*$/, "");
      p.texto = antes + letras.slice(p.cursor).join("");
      p.cursor = [...antes].length;
    } else if (e.nombre === "enter") {
      // Sin proyecto y sin nada escrito, enter abre el proyecto elegido en la lista.
      const elegido = this.sesion.config.sinRepo && !p.texto.trim() && this.vista === "inicio" ? this.datos.proyectos[this.seleccion.inicio] : undefined;
      return elegido ? this.cambiarProyecto(elegido.ruta) : this.mandar();
    }
    else if (e.nombre === "borrar" && p.cursor > 0) {
      letras.splice(p.cursor - 1, 1);
      p.texto = letras.join("");
      p.cursor--;
    } else if (e.nombre === "suprimir" && p.cursor < letras.length) {
      letras.splice(p.cursor, 1);
      p.texto = letras.join("");
    } else if (e.nombre === "izquierda") p.cursor = Math.max(0, p.cursor - 1);
    else if (e.nombre === "derecha") p.cursor = Math.min(letras.length, p.cursor + 1);
    else if (e.nombre === "inicio") p.cursor = 0;
    else if (e.nombre === "fin") p.cursor = letras.length;
    else if (e.nombre === "repag") this.desplazamientoChat += 10;
    else if (e.nombre === "avpag") this.desplazamientoChat = Math.max(0, this.desplazamientoChat - 10);
    else if (e.nombre === "arriba" || e.nombre === "abajo") {
      if (CON_LISTA.includes(this.vista) || (this.vista === "inicio" && this.sesion.config.sinRepo)) return this.mover(e.nombre === "arriba" ? -1 : 1);
      // Lo que ya mandaste, como en cualquier shell.
      if (this.historial.length === 0) return;
      if (e.nombre === "arriba") this.enHistorial = this.enHistorial < 0 ? this.historial.length - 1 : Math.max(0, this.enHistorial - 1);
      else this.enHistorial = this.enHistorial < 0 ? -1 : this.enHistorial + 1;
      if (this.enHistorial >= this.historial.length) this.enHistorial = -1;
      this.ponerTexto(this.enHistorial < 0 ? "" : this.historial[this.enHistorial]!);
    } else if (e.nombre === "escape" && CON_LISTA.includes(this.vista)) {
      this.focoEnVista = true;
      p.foco = false;
    }
  }

  private manejarMouse(e: Extract<Entrada, { tipo: "mouse" }>): void {
    if (e.accion === "rueda-arriba" || e.accion === "rueda-abajo") {
      const sube = e.accion === "rueda-arriba";
      if (this.paleta) return;
      if (this.vista === "chat") this.desplazamientoChat = Math.max(0, this.desplazamientoChat + (sube ? 3 : -3));
      else this.mover(sube ? -1 : 1);
      return;
    }
    if (e.accion !== "clic" || e.boton !== 0) return;
    const zona = [...this.zonas].reverse().find((z) => e.x >= z.x && e.x < z.x + z.w && e.y >= z.y && e.y < z.y + z.h);
    if (zona) zona.accion();
    else if (this.paleta) this.paleta = null;
    else if (this.ayuda) this.ayuda = false;
  }
}

// --- La terminal ---

const ALTERNATIVA = "\x1b[?1049h";
const NORMAL = "\x1b[?1049l";
const SIN_CURSOR = "\x1b[?25l";
const CON_CURSOR = "\x1b[?25h";
const SINCRO = ["\x1b[?2026h", "\x1b[?2026l"] as const;

export interface OpcionesDeApp extends ConfigDeSesion {
  readonly entrada?: ReadStream;
  readonly salida?: WriteStream;
}

/** Abre la app en la terminal y resuelve cuando la persona sale. "cortar" = salir cortando lo que corría. */
export async function abrirApp(opciones: OpcionesDeApp): Promise<"salir" | "cortar"> {
  const entrada = opciones.entrada ?? (process.stdin as ReadStream);
  const salida = opciones.salida ?? (process.stdout as WriteStream);
  const profundidad: Profundidad = profundidadDe(process.env, salida);
  // Los avisos salen solo si no estás mirando la terminal (si la estás mirando, ya lo ves).
  let mirando = (): boolean => true;
  const sesion = new Sesion({ ...opciones, guardarCharla: true, avisador: crearAvisador(emisoresDelEntorno(), () => !mirando()) });
  const app = new App(sesion);
  mirando = () => app.enFoco;
  let anterior: Bufer | null = null;
  let ocupadaLaSalida = false;

  // Lo que el núcleo diga por consola mientras la app está abierta va al chat, no a la pantalla.
  const consola = { log: console.log, info: console.info, warn: console.warn, error: console.error };
  const alChat = (...partes: unknown[]) => app.sesion.decir("sistema", partes.map((p) => (typeof p === "string" ? p : String(p))).join(" "));
  console.log = console.info = alChat;
  console.warn = console.error = alChat;

  let restaurada = false;
  const restaurar = (): void => {
    if (restaurada) return;
    restaurada = true;
    Object.assign(console, consola);
    try {
      if (entrada.isTTY) entrada.setRawMode(false);
    } catch {
      // la entrada ya se cerró
    }
    salida.write(`\x1b[0m${MODOS.apagar}${CON_CURSOR}${NORMAL}`);
  };
  process.once("exit", restaurar);

  const pintar = (completo = false): void => {
    if (ocupadaLaSalida) return;
    const ahora = app.dibujar(salida.columns ?? 100, salida.rows ?? 32);
    const cambios = diferencia(completo ? null : anterior, ahora, profundidad);
    anterior = ahora;
    if (!cambios) return;
    if (!salida.write(SINCRO[0] + cambios + SINCRO[1])) {
      // La terminal no da abasto: se saltean cuadros hasta que drene.
      ocupadaLaSalida = true;
      salida.once("drain", () => (ocupadaLaSalida = false));
    }
  };

  salida.write(ALTERNATIVA + SIN_CURSOR + MODOS.prender);
  if (entrada.isTTY) entrada.setRawMode(true);
  entrada.setEncoding("utf8");
  entrada.resume();

  const recargar = async (): Promise<void> => {
    const repo = app.sesion.config.repo;
    const leida = await leerInstantanea(repo).catch(() => null);
    // Si en el medio se cambió de proyecto, lo leído es del anterior: se tira.
    if (leida && app.sesion.config.repo === repo) app.datos = leida;
  };
  sesion.alCambiar = () => void recargar();
  // No se espera: el oyente de la entrada se engancha ya, así nada de lo que tecleás en la primera carga se pierde.
  void recargar();
  // Lo que el repo ya les dice a los agentes entra a la memoria (esperando tu ok), y si es la primera
  // vez en el repo, el arranque propone el dolphin.config.json. Las dos cosas sin gastar nada.
  void sesion
    .cargarHistoria()
    .then(() => sesion.traerInstrucciones())
    .then(() => sesion.traerTodosDelCodigo())
    .then(() => sesion.proponerArranque())
    .then(() => sesion.revisarAlAbrir())
    .catch(() => {});

  return new Promise((resolver) => {
    let latido: NodeJS.Timeout;
    let ritmo = app.cuadroMs;
    const programar = (): void => {
      clearInterval(latido);
      ritmo = app.cuadroMs;
      latido = setInterval(() => {
        pintar();
        if (app.cuadroMs !== ritmo) programar();
        if (app.saliendo) terminar(app.saliendo);
      }, ritmo);
    };
    const datos = setInterval(() => void recargar(), 3000);

    const terminar = (como: "salir" | "cortar"): void => {
      clearInterval(latido);
      clearInterval(datos);
      entrada.off("data", alLeer);
      entrada.off("end", alCerrarse);
      entrada.off("error", alCerrarse);
      salida.off("resize", alCambiarTamano);
      entrada.pause();
      restaurar();
      process.off("exit", restaurar);
      resolver(como);
    };
    const leer = crearLector();
    const alLeer = (datosCrudos: string): void => {
      for (const e of leer(datosCrudos)) {
        const promesa = app.manejar(e);
        if (promesa)
          void promesa
            .then(() => pintar())
            .catch((e: unknown) => app.sesion.decir("sistema", `Algo no salió: ${(e as Error).message}`));
      }
      pintar();
      if (app.saliendo) terminar(app.saliendo);
    };
    const alCambiarTamano = (): void => pintar(true);
    // Si se cierra la entrada (se cerró la terminal, un pipe que terminó), no hay quién la use: se sale.
    const alCerrarse = (): void => terminar(app.sesion.ocupada ? "cortar" : "salir");

    entrada.on("data", alLeer);
    entrada.once("end", alCerrarse);
    entrada.once("error", alCerrarse);
    salida.on("resize", alCambiarTamano);
    programar();
    pintar(true);
  });
}
