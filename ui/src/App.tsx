import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ArrowUpRight, GitBranch, WifiOff, Grid2x2 } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { Empty, EmptyContent, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty";
import { Barra, type Vista } from "@/components/Barra";
import { MissionControl } from "@/components/MissionControl";
import { Nueva } from "@/components/Nueva";
import { Memoria } from "@/components/Memoria";
import { Bots } from "@/components/Bots";
import { Git } from "@/components/Git";
import { Tareas } from "@/components/Tareas";
import { MasterPrompt } from "@/components/MasterPrompt";
import { Button } from "@/components/ui/button";
import { Bandeja } from "@/components/Bandeja";
import { Turnos } from "@/components/Turnos";
import { Ramas } from "@/components/Ramas";
import { EnVivo } from "@/components/EnVivo";
import { Codigo, type EstadoCodigo } from "@/components/Codigo";
import { Detalle } from "@/components/Detalle";
import { Visor } from "@/components/Visor";
import { LineasDiff } from "@/components/Diff";
import { PedidoEntero } from "@/components/PedidoEntero";
import { BotonCopiar } from "@/components/BotonCopiar";
import { dolphinNuevaTarea, embebida, pedirALaApp, registrarVista, sinBarra, type VistaDeLaApp } from "@/lib/embebida";
import { Porton } from "@/components/Porton";
import { Archivos, Marcas } from "@/components/Ramas";
import {
  buscarMemorias,
  conProyecto,
  mandarRama,
  proyectoActivo,
  RespuestaMala,
  traerBandeja,
  traerCosecha,
  traerDiff,
  traerEntrenamiento,
  traerHistorial,
  volverAlDelArranque,
} from "@/lib/api";
import { Entrenando } from "@/components/Entrenando";
import { useEnVivo } from "@/lib/use-en-vivo";
import { escalonesDe, fasesSalteadas, motivoLegible, plataDe, reloj, sinLasSalteadas, tituloDeTarea } from "@/lib/datos";
import type { RespuestaCosecha, RespuestaDiff, Turno } from "@/lib/tipos";

/**
 * La consola de dolphin.
 *
 * En Cosechas, una cosecha es un solo objeto: a la izquierda las tareas por
 * sección, en el medio sus ramas y el código de la elegida, a la derecha el
 * detalle de la rama. Las otras vistas —Nueva, Bandeja, Tablero, Memoria—
 * comparten la barra de arriba.
 */

const DIRECCION: Record<Vista, VistaDeLaApp> = {
  tareas: "tareas",
  nueva: "nueva",
  bandeja: "bandeja",
  tablero: "tablero",
  cosecha: "cosechas",
  memoria: "memoria",
  bots: "bots",
  git: "git",
};

/** Lo primero del hash: la vista, o «prompt» (ver App). Lo que va después de una barra es de la vista (#tareas/<id> es una tarjeta abierta). */
const hashPedido = () => window.location.hash.replace(/^#\/?/, "").split("/")[0];

function vistaDeLaUrl(): Vista {
  const pedida = hashPedido();
  return (Object.keys(DIRECCION) as Vista[]).find((v) => DIRECCION[v] === pedida) ?? "tablero";
}

type Pantalla =
  | { que: "cargando" }
  /** `contesto`: el código, si el servidor contestó. Sin él, no contestó nadie. */
  | { que: "error"; motivo: string; contesto?: number }
  | { que: "vacia"; repo: string }
  | { que: "cosecha"; rta: RespuestaCosecha & { cosecha: NonNullable<RespuestaCosecha["cosecha"]> } };

export default function App() {
  const [pantalla, setPantalla] = useState<Pantalla>({ que: "cargando" });
  const [turnos, setTurnos] = useState<Turno[]>([]);
  const [turnoId, setTurnoId] = useState<string | null>(null);
  const [elegido, setElegido] = useState<string | null>(null);
  const [codigo, setCodigo] = useState<EstadoCodigo>({ que: "nada" });
  const [visor, setVisor] = useState<{ titulo: string; sub: string } | null>(null);
  const [repo, setRepo] = useState("");
  const [vista, setVistaEstado] = useState<Vista>(vistaDeLaUrl);
  // Master Prompt: una ventana que flota sobre cualquier vista. #prompt la abre (así llega la app de escritorio).
  const [prompt, setPrompt] = useState<{ quienAbrio: HTMLElement | null } | null>(() => (hashPedido() === "prompt" ? { quienAbrio: null } : null));
  const vistaRef = useRef(vista);
  vistaRef.current = vista;
  // ¿Ya se entrenó al delfín en este proyecto? Si el servidor no sabe (uno viejo), no se frena nada.
  const [entrenamiento, setEntrenamiento] = useState<"cargando" | "falta" | "listo">("cargando");
  useEffect(() => {
    traerEntrenamiento().then(
      (r) => setEntrenamiento(r.entrenamiento ? "listo" : "falta"),
      () => setEntrenamiento("listo"),
    );
  }, []);
  const [abiertos, setAbiertos] = useState(0);

  // Cada vista tiene su dirección (#cosechas, #bandeja…): refrescar no te
  // devuelve al tablero, atrás vuelve a la vista anterior, y el tester de
  // pantalla puede llegar a cualquiera con una URL.
  const setVista = useCallback((nueva: Vista) => {
    setVistaEstado(nueva);
    const destino = `#${DIRECCION[nueva]}`;
    if (window.location.hash !== destino) window.history.pushState(null, "", destino);
    if (embebida) pedirALaApp(`vista:${DIRECCION[nueva]}`);
  }, []);
  // El lienzo del escritorio pone cada ventana en su vista por acá y no por el hash, que la
  // consola pisa al arrancar (ver lib/embebida.ts).
  useEffect(
    () =>
      registrarVista((pedida) => {
        const cual = (Object.keys(DIRECCION) as Vista[]).find((v) => DIRECCION[v] === pedida);
        if (cual) setVistaEstado(cual);
      }),
    [],
  );
  // Cuando una acción cambia de vista (Implementar → Cosechas), el botón que tenía el foco
  // desaparece y el foco caía en body: va al título de la vista nueva. Desde la barra no
  // pasa, porque el foco se queda en la pestaña.
  const vistaInicial = useRef(true);
  useEffect(() => {
    // Al abrir la consola el foco se queda donde lo pone el navegador.
    if (vistaInicial.current) {
      vistaInicial.current = false;
      return;
    }
    requestAnimationFrame(() => {
      if (document.activeElement !== document.body) return;
      document.querySelector<HTMLElement>("main h1, h1[tabindex]")?.focus({ preventScroll: true });
    });
  }, [vista]);
  useEffect(() => {
    const alMoverse = () => {
      // #prompt no es una vista: abre la ventana sobre la que estás mirando, y la dirección vuelve a esa.
      if (hashPedido() === "prompt") {
        setPrompt((p) => p ?? { quienAbrio: null });
        window.history.replaceState(null, "", `#${DIRECCION[vistaRef.current]}`);
        return;
      }
      const nueva = vistaDeLaUrl();
      setVistaEstado(nueva);
      if (embebida) pedirALaApp(`vista:${DIRECCION[nueva]}`);
    };
    window.addEventListener("popstate", alMoverse);
    window.addEventListener("hashchange", alMoverse);
    return () => {
      window.removeEventListener("popstate", alMoverse);
      window.removeEventListener("hashchange", alMoverse);
    };
  }, []);

  const diffs = useRef(new Map<string, RespuestaDiff>());
  const turnoIdRef = useRef<string | null>(null);
  turnoIdRef.current = turnoId;
  const pedidoRef = useRef(0);
  const cargaRef = useRef(0);
  const triggerVisor = useRef<HTMLElement | null>(null);

  const cosecha = pantalla.que === "cosecha" ? pantalla.rta.cosecha : null;
  const conWorktree = useMemo(
    () => new Set(pantalla.que === "cosecha" ? pantalla.rta.conWorktree : []),
    [pantalla],
  );
  const candidato = useMemo(
    () => cosecha?.candidatos.find((c) => c.universo.id === elegido) ?? null,
    [cosecha, elegido],
  );
  const pedirCodigo = useCallback(
    async (id: string | null, turno: string | null, worktrees: ReadonlySet<string>, deCommits = false) => {
      const mio = ++pedidoRef.current;
      if (!id) return setCodigo({ que: "nada" });
      // La elegida entregada se lee de sus commits aunque su worktree ya no esté (mergearla lo limpia).
      if (!worktrees.has(id) && !deCommits) return setCodigo({ que: "sin-worktree", id });

      const clave = `${turno ?? ""}|${id}`;
      const guardado = diffs.current.get(clave);
      if (guardado) return setCodigo({ que: "diff", diff: guardado });

      setCodigo({ que: "leyendo" });
      try {
        const diff = await traerDiff(id, turno);
        diffs.current.set(clave, diff);
        if (mio === pedidoRef.current) setCodigo({ que: "diff", diff });
      } catch (error) {
        if (mio === pedidoRef.current)
          setCodigo({ que: "error", motivo: error instanceof Error ? error.message : String(error) });
      }
    },
    [],
  );

  const cargar = useCallback(
    async (id: string | null) => {
      const miCarga = ++cargaRef.current;
      try {
        const [historial, rta] = await Promise.all([traerHistorial(), traerCosecha(id)]);
        // Dos cargas en vuelo (montaje doble, R repetida): gana la última
        // pedida, no la última en llegar.
        if (miCarga !== cargaRef.current) return;
        setTurnos(historial.cosechas);
        setRepo(rta.repo);
        // La cuenta de la bandeja no frena la pantalla: si tarda, llega después.
        void traerBandeja()
          .then((b) => setAbiertos(b.asuntos.filter((a) => a.estado === "abierto").length))
          .catch(() => undefined);

        if (!rta.cosecha) {
          setPantalla({ que: "vacia", repo: rta.repo });
          return;
        }

        const turno = id ?? historial.cosechas[0]?.id ?? null;
        const worktrees = new Set(rta.conWorktree);
        const ganador = rta.cosecha.ganador?.universo.id ?? rta.cosecha.candidatos[0]?.universo.id ?? null;

        setTurnoId(turno);
        setPantalla({ que: "cosecha", rta: { ...rta, cosecha: rta.cosecha } });
        setElegido(ganador);
        void pedirCodigo(ganador, turno, worktrees, Boolean(rta.cosecha.entregada && ganador === rta.cosecha.ganador?.universo.id));
      } catch (error) {
        if (miCarga !== cargaRef.current) return;
        setPantalla({
          que: "error",
          motivo: error instanceof Error ? error.message : String(error),
          ...(error instanceof RespuestaMala ? { contesto: error.status } : {}),
        });
      }
    },
    [pedirCodigo],
  );

  useEffect(() => {
    void cargar(null);
  }, [cargar]);

  // Con el servidor caído, la consola vuelve a probar sola: cuando se
  // levanta, la pantalla aparece sin que nadie toque Refrescar. Un «eso no
  // está» (4xx) no se arregla probando de nuevo: ese no reintenta.
  const caida = pantalla.que === "error" && !(pantalla.contesto && pantalla.contesto < 500);
  useEffect(() => {
    if (!caida) return;
    const reloj = window.setInterval(() => void cargar(turnoId), 4000);
    return () => window.clearInterval(reloj);
  }, [caida, cargar, turnoId]);

  // La siembra en curso, si la hay: pisa lo guardado hasta que termina. Si
  // la conexión se corta y vuelve, se relee todo: algo pudo pasar mientras.
  const { vivo, enLinea } = useEnVivo(
    () => void cargar(null),
    () => void cargar(turnoIdRef.current),
  );

  // Con historia y sin entrenar (lo de antes de que existiera el entrenamiento): se BUSCA en
  // silencio, que es gratis, sin frenar la vista; lo encontrado se ve en Memoria. Destilar usa el
  // cupo de Claude y lo pide la persona desde Memoria: antes arrancaba solo al abrir una cosecha.
  useEffect(() => {
    if (entrenamiento !== "falta" || pantalla.que !== "cosecha") return;
    setEntrenamiento("listo");
    void buscarMemorias().catch(() => undefined);
  }, [entrenamiento, pantalla.que]);

  const elegir = useCallback(
    (id: string) => {
      setElegido(id);
      void pedirCodigo(id, turnoId, conWorktree, Boolean(cosecha?.entregada && cosecha.ganador?.universo.id === id));
    },
    [pedirCodigo, turnoId, conWorktree, cosecha],
  );

  // En angosto el detalle va debajo de todo: tocar una rama sin moverse no daba respuesta a la vista.
  // Solo con el clic: las flechas recorren las ramas y no tienen que arrastrar la página.
  const elDetalle = useRef<HTMLDivElement>(null);
  const elegirYMostrar = useCallback(
    (id: string) => {
      elegir(id);
      if (!window.matchMedia("(max-width: 1280px)").matches) return;
      const quieto = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
      requestAnimationFrame(() => elDetalle.current?.scrollIntoView({ block: "start", behavior: quieto ? "auto" : "smooth" }));
    },
    [elegir],
  );

  // Refrescar relee también el código: el worktree pudo cambiar a mano.
  const refrescar = useCallback(() => {
    diffs.current.clear();
    void cargar(turnoIdRef.current);
  }, [cargar]);

  // El visor es de la rama que estabas mirando: si cambia la vista, la tarea o la rama, o arranca una
  // siembra, se cierra. Antes quedaba armado y reaparecía solo al volver, con el diff de otra cosa.
  const haySiembra = Boolean(vivo);
  useEffect(() => {
    setVisor(null);
  }, [vista, turnoId, elegido, haySiembra]);

  // Mientras corre una siembra, Cosechas la muestra en vivo; tocar otra tarea de la lista la deja
  // mirar sin cortar nada. Cuando termina la siembra, se vuelve a lo de siempre.
  const [mirandoOtra, setMirandoOtra] = useState(false);
  useEffect(() => {
    if (!haySiembra) setMirandoOtra(false);
  }, [haySiembra]);

  const diffPuesto = codigo.que === "diff" && codigo.diff.hay && codigo.diff.texto ? codigo.diff : null;

  const agrandar = useCallback(
    (trigger: HTMLElement) => {
      if (!diffPuesto || !candidato) return;
      triggerVisor.current = trigger;
      setVisor({
        // «Rama 2 · mínimo»: el id interno (u2) no le dice nada a quien mira.
        titulo: `Rama ${candidato.universo.id.replace(/^u(?=\d+$)/, "")}${candidato.enfoque ? ` · ${candidato.enfoque}` : ""}`,
        sub: `${diffPuesto.lineas} ${diffPuesto.lineas === 1 ? "línea" : "líneas"}${diffPuesto.recortado ? " · se muestran las primeras 1200" : ""}`,
      });
    },
    [diffPuesto, candidato],
  );

  // El teclado de la consola: R refresca, ↑↓ recorren, Enter agranda.
  useEffect(() => {
    const alTeclear = (ev: KeyboardEvent) => {
      // Otra ventana abierta (Sumar un proyecto) o un control que ya usó la tecla: el teclado es suyo.
      if (visor || ev.defaultPrevented || document.querySelector("[aria-modal='true']")) return;
      const objetivo = ev.target as HTMLElement;
      const escribiendo = /^(input|textarea|select)$/i.test(objetivo.tagName) || objetivo.isContentEditable;
      if (escribiendo || ev.metaKey || ev.ctrlKey || ev.altKey) return;

      if (ev.key === "r" || ev.key === "R") {
        ev.preventDefault();
        refrescar();
        return;
      }
      // P abre el Master Prompt sobre lo que estés mirando.
      if (ev.key === "p" || ev.key === "P") {
        ev.preventDefault();
        setPrompt({ quienAbrio: objetivo instanceof HTMLElement && objetivo !== document.body ? objetivo : null });
        return;
      }

      // Las flechas y Enter son de la cosecha. En otra vista, las flechas
      // scrollean, y un Enter no puede abrir un visor que no se dibuja ahí.
      if (vista !== "cosecha" || vivo || !cosecha) return;
      const ids = cosecha.candidatos.map((c) => c.universo.id);
      if (ids.length === 0) return;
      // Son de las ramas, salvo que el foco esté en algo que usa las flechas (el menú de proyectos,
      // unas pestañas) o adentro del código, donde lo desplazan. Un botón cualquiera —el
      // «Cosechas» que recién tocaste— no las usa: ahí siguen siendo de las ramas.
      const esRama = objetivo.closest("[data-rama]") !== null;
      const enNada = objetivo === document.body;
      const usaFlechas =
        objetivo.closest(
          "[role='menu'],[role='menubar'],[role='listbox'],[role='tablist'],[role='radiogroup'],[role='slider'],[role='tree'],[role='grid'],[role='combobox'],[aria-label='Lo que escribió']",
        ) !== null;

      // En angosto la página es una sola columna y las flechas la desplazan: ahí solo cuentan sobre una rama.
      const angosto = window.matchMedia("(max-width: 880px)").matches;
      const libres = !angosto && !usaFlechas;
      if ((ev.key === "ArrowDown" || ev.key === "ArrowUp") && ids.length > 1 && (esRama || libres)) {
        ev.preventDefault();
        const i = ids.indexOf(elegido ?? "");
        const paso = ev.key === "ArrowDown" ? 1 : -1;
        const siguiente = ids[(i + paso + ids.length) % ids.length]!;
        elegir(siguiente);
        // El foco va con la elegida: se ve dónde estás y Enter la agranda.
        document.querySelector<HTMLElement>(`[data-rama="${CSS.escape(siguiente)}"]`)?.focus();
        return;
      }

      // Enter sobre un botón cualquiera lo aprieta, como siempre; sobre una
      // rama (o con el foco en ningún lado) agranda su código, y al cerrar
      // el foco vuelve a la rama, no al botón de abajo.
      if (ev.key === "Enter" && (esRama || enNada)) {
        const boton = document.querySelector<HTMLElement>("[aria-label='Lo que escribió'] button[data-agrandar]:not([disabled])");
        if (!boton || !diffPuesto) return;
        ev.preventDefault();
        agrandar(esRama ? (objetivo.closest<HTMLElement>("[data-rama]") ?? boton) : boton);
      }
    };
    document.addEventListener("keydown", alTeclear);
    return () => document.removeEventListener("keydown", alTeclear);
  }, [visor, vista, vivo, cosecha, elegido, refrescar, elegir, agrandar, diffPuesto]);

  const abrirCosecha = (id: string | null) => {
    // Sin id es «la de ahora»: si hay una siembra corriendo, es la del vivo.
    setMirandoOtra(id !== null);
    setVista("cosecha");
    void cargar(id);
  };

  // Estable: el Tablero lo llama cuando una tarea de la cola termina.
  const recargar = useCallback(() => void cargar(turnoId), [cargar, turnoId]);

  // Una sola barra para todas las vistas. Sin conexión con el servidor, lo
  // dice ahí, en cualquier vista: antes no se enteraba nadie hasta tocar algo.
  const barra = (
    <>
      {/* Sin barra va igual un hueco de alto cero: cada vista es una grilla de dos filas (barra y
          contenido), y con un hijo menos el contenido cae en la fila de alto automático y se
          encoge a nada. Era la pantalla negra de las ventanas del lienzo. */}
      {sinBarra ? (
        <span aria-hidden="true" />
      ) : (
        <Barra
          repo={repo}
          alRefrescar={refrescar}
          vista={vista}
          alCambiarVista={setVista}
          alAbrirPrompt={(boton) => setPrompt({ quienAbrio: boton })}
          nadando={Boolean(vivo)}
          abiertos={abiertos}
          desconectado={!enLinea}
        />
      )}
      {/* Flota sobre cualquier vista: va con la barra, que está en todas. El Visor se dibuja en el body. */}
      {prompt && <MasterPrompt quienAbrio={prompt.quienAbrio} alCerrado={() => setPrompt(null)} />}
    </>
  );

  // Un proyecto nuevo de verdad (sin entrenar y sin siembras): lo primero es entrenar al delfín.
  // Uno con historia se entrena solo y en silencio (efecto de arriba): no se le frena la vista.
  if (entrenamiento === "falta" && pantalla.que === "vacia" && !vivo) {
    return (
      <div className="grid h-dvh grid-cols-[minmax(0,1fr)] grid-rows-[auto_minmax(0,1fr)]">
        {barra}
        <Entrenando alTerminar={() => setEntrenamiento("listo")} />
      </div>
    );
  }

  // Nueva, Bandeja y Memoria no dependen de la cosecha: se muestran ya,
  // sin esperar a que cargue (antes no se podía escribir una tarea hasta
  // que llegara el historial).
  if (vista === "nueva" && pantalla.que !== "error") {
    return (
      <div className="grid h-dvh grid-cols-[minmax(0,1fr)] grid-rows-[auto_minmax(0,1fr)]">
        {barra}
        <Nueva alSembrar={() => setVista("cosecha")} alEncolar={() => setVista("tablero")} />
      </div>
    );
  }

  if (vista === "bandeja" && pantalla.que !== "error") {
    return (
      <div className="grid h-dvh grid-cols-[minmax(0,1fr)] grid-rows-[auto_minmax(0,1fr)]">
        {barra}
        <Bandeja alImplementar={() => setVista("cosecha")} alContar={setAbiertos} />
      </div>
    );
  }

  if (vista === "memoria" && pantalla.que !== "error") {
    return (
      <div className="grid h-dvh grid-cols-[minmax(0,1fr)] grid-rows-[auto_minmax(0,1fr)]">
        {barra}
        <Memoria />
      </div>
    );
  }

  if (vista === "tareas" && pantalla.que !== "error") {
    return (
      <div className="grid h-dvh grid-cols-[minmax(0,1fr)] grid-rows-[auto_minmax(0,1fr)]">
        {barra}
        <Tareas />
      </div>
    );
  }

  if (vista === "git" && pantalla.que !== "error") {
    return (
      <div className="grid h-dvh grid-cols-[minmax(0,1fr)] grid-rows-[auto_minmax(0,1fr)]">
        {barra}
        {/* Comenzar un issue no lo siembra solo: deja la tarea escrita en el compositor, donde se
            elige el motor y cuántas ramas. */}
        <Git
          alComenzar={(tarea) => {
            dolphinNuevaTarea(tarea);
            setVista("nueva");
          }}
        />
      </div>
    );
  }

  if (vista === "bots" && pantalla.que !== "error") {
    return (
      <div className="grid h-dvh grid-cols-[minmax(0,1fr)] grid-rows-[auto_minmax(0,1fr)]">
        {barra}
        <Bots repo={repo} />
      </div>
    );
  }

  if (vista === "tablero" && pantalla.que !== "cargando" && pantalla.que !== "error") {
    return (
      <div className="grid h-dvh grid-cols-[minmax(0,1fr)] grid-rows-[auto_minmax(0,1fr)]">
        {barra}
        <MissionControl
          turnos={turnos}
          vivo={vivo}
          alAbrirCosecha={abrirCosecha}
          alCambiarCola={recargar}
          alNueva={() => setVista("nueva")}
          alBandeja={() => setVista("bandeja")}
        />
      </div>
    );
  }

  if (vivo && vista === "cosecha" && !mirandoOtra) {
    return (
      <EnVivo
        vivo={vivo}
        turnos={turnos}
        repo={repo}
        elegido={elegido}
        alElegir={setElegido}
        alRefrescar={() => void cargar(null)}
        alCambiarVista={setVista}
        alAbrirTurno={(id) => {
          setMirandoOtra(true);
          void cargar(id);
        }}
        desconectado={!enLinea}
      />
    );
  }

  if (pantalla.que === "cargando") return <Esqueleto vista={vista} />;
  // Con la barra arriba: sin ella, un repo sin cosechas dejaba la vista sin
  // salida, y con el servidor caído no había dónde refrescar.
  if (pantalla.que === "error" || pantalla.que === "vacia")
    return (
      <div className="grid h-dvh grid-cols-[minmax(0,1fr)] grid-rows-[auto_minmax(0,1fr)]">
        {barra}
        {pantalla.que === "error" && pantalla.contesto === 404 && proyectoActivo() ? (
          <Aviso
            icono="grilla"
            titulo="Ese proyecto no está en tu lista"
            texto="Lo quitaste, o el enlace es de otra máquina. Sumalo desde la barra, o seguí con el proyecto con el que arrancó la consola."
            accion={{ rotulo: "Ir al del arranque", alTocar: volverAlDelArranque }}
          />
        ) : pantalla.que === "error" && pantalla.contesto ? (
          <Aviso
            icono="red"
            titulo="El servidor no pudo contestar"
            texto={`${conPunto(pantalla.motivo)} Tus cosechas siguen en disco.`}
            accion={{ rotulo: "Probar de nuevo", alTocar: refrescar }}
          />
        ) : pantalla.que === "error" ? (
          embebida ? (
            // Adentro de la app no hay terminal que mostrar: la levanta la app.
            <Aviso
              icono="red"
              titulo="Se cayó la consola de Dolphin"
              texto={`${motivoLegible(pantalla.motivo)} Tus cosechas siguen en disco.`}
              accion={{ rotulo: "Levantarla de nuevo", alTocar: () => pedirALaApp("recargar") }}
            />
          ) : (
            <Aviso
              icono="red"
              titulo="Se cayó el servidor de la consola"
              texto={`${motivoLegible(pantalla.motivo)} Tus cosechas siguen en disco. Levantalo de nuevo: la consola vuelve a probar sola cada pocos segundos.`}
              comando={{
                entero: `npm run ui -- --repo ${repo ? `"${repo}"` : "<tu repo>"}`,
                visible: `npm run ui -- --repo ${repo ? `"…/${repo.split(/[\\/]/).filter(Boolean).pop() ?? repo}"` : "<tu repo>"}`,
              }}
            />
          )
        ) : (
          <Aviso
            icono="grilla"
            titulo="Todavía no sembraste nada"
            texto={`Cuando una siembra termina en ${pantalla.repo.split(/[\\/]/).filter(Boolean).pop() ?? pantalla.repo}, sus ramas aparecen acá.`}
            accion={{ rotulo: "Sembrar", alTocar: () => setVista("nueva") }}
          />
        )}
      </div>
    );

  const { rta } = pantalla;
  const c = rta.cosecha;
  const vivos = c.candidatos.filter((x) => x.vivo).length;
  const sinRamas = c.candidatos.length === 0;
  // Con una sola rama —lo de todos los días— la cabecera cuenta todo: no hay lista que comparar.
  const unica = c.candidatos.length === 1 ? c.candidatos[0] : undefined;

  return (
    <div className="grid h-dvh grid-cols-[minmax(0,1fr)] grid-rows-[auto_minmax(0,1fr)] max-[880px]:block max-[880px]:h-auto max-[880px]:min-h-dvh">
      {barra}

      {/* En angosto cambia la PRIORIDAD: el detalle pasa abajo del todo y
          los turnos se vuelven una tira horizontal, no desaparece nada. */}
      <div className="grid min-h-0 grid-cols-[260px_minmax(0,1fr)_340px] max-[1280px]:grid-cols-[224px_minmax(0,1fr)] max-[1280px]:grid-rows-[minmax(0,1fr)_auto] max-[880px]:block">
        <div className="min-h-0 max-[1280px]:row-start-1">
          <Turnos turnos={turnos} turnoId={turnoId} alElegir={(id) => void cargar(id)} />
        </div>

        {/* La columna del medio scrollea sola: con muchas ramas el código
            baja, pero no se aplasta, y los costados quedan quietos. */}
        <main className="flex min-h-0 flex-col overflow-y-auto max-[1280px]:row-start-1 max-[880px]:overflow-visible">
          <header className="flex-none px-5 pt-5 pb-4">
            <h1 className="titulo-vista line-clamp-2 max-w-[48ch] break-words">
              {tituloDeTarea(c.tarea)}
            </h1>
            {/* Con la key, otra cosecha arranca con el pedido cerrado. */}
            <PedidoEntero key={c.cuando ?? c.tarea} tarea={c.tarea} />
            <p className="text-muted-foreground mt-2 text-[13px] tabular-nums">
              {sinRamas ? (
                <b className="text-foreground font-semibold">No se abrió ninguna rama</b>
              ) : c.candidatos.length === 1 ? (
                // Con una sola rama no hay nada que contar: se dice cómo le fue.
                <b className="text-foreground font-semibold">
                  {vivos === 0
                    ? `Se cortó en ${c.candidatos[0]?.murioEn ?? "el testing"}`
                    : c.candidatos[0]?.pasadas.length === 0
                      ? "Sin fases: no se probó nada"
                      : fasesSalteadas(c.candidatos[0]!).length > 0
                        ? `Pasó, ${sinLasSalteadas(fasesSalteadas(c.candidatos[0]!))}`
                        : "Pasó todas las fases"}
                </b>
              ) : (
                <>
                  <b className="text-foreground font-semibold">{vivos}</b> de {c.candidatos.length} pasaron todas las
                  fases
                </>
              )}
              {c.candidatos.length > 1 && c.muertosGratis > 0 && (
                <>
                  <Sep />
                  <b className="text-foreground font-semibold">{c.muertosGratis}</b>{" "}
                  {c.muertosGratis === 1 ? "se cortó gratis" : "se cortaron gratis"}, sin gastar un token
                </>
              )}
              {/* Con suscripción la plata no se muestra: nadie pagó por uso. */}
              {!c.suscripcion && !sinRamas && (
                <>
                  <Sep />
                  <b className="text-foreground font-semibold">{plataDe(c.gastado, c.costoDesconocido)}</b>
                </>
              )}
              <Sep />
              <b className="text-foreground font-semibold">{reloj(c.ms)}</b>
            </p>
            {/* Quién hizo cada trabajo: el caro escribe, el barato revisa. Y el parte, para mandarlo o mirarlo entero. */}
            {((c.modelos && c.modelos.escribir !== "demo") || c.parte) && (
              <p className="text-muted-foreground mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-[12px]">
                {c.modelos && c.modelos.escribir !== "demo" && <span>{repartoEnPalabras(c.modelos, c.candidatos.find((x) => x.modelo)?.modelo)}</span>}
                {c.parte && (
                  <a
                    href={conProyecto(`/partes/${encodeURIComponent(c.parte)}`)}
                    target="_blank"
                    rel="noreferrer"
                    className="text-foreground/90 hover:text-foreground inline-flex items-center gap-1 font-medium underline-offset-4 hover:underline"
                  >
                    Ver el parte
                    <ArrowUpRight aria-hidden="true" className="size-3.5" />
                  </a>
                )}
              </p>
            )}
            {/* Por qué escribió ese modelo, con los números del repo: la estrategia preguntando a los datos. */}
            {c.modelos?.porDatos && <p className="text-muted-foreground mt-1 max-w-[72ch] text-[12px] leading-snug">{c.modelos.porDatos}</p>}
            {unica && (
              <>
                {/* El portón de la rama, dibujado: es lo que la hace probada. */}
                <Porton c={unica} escalones={escalonesDe(c)} className="mt-4" />
                {unica.contrato?.resumen && (
                  <p className="text-foreground/85 mt-3 max-w-[72ch] text-[13px] leading-snug break-words">{unica.contrato.resumen}</p>
                )}
                <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1.5">
                  <Marcas c={unica} cosecha={c} />
                  <Archivos c={unica} />
                </div>
              </>
            )}
          </header>

          {sinRamas ? (
            // Sin ramas no hay código que mostrar ni nada que elegir: se dice
            // qué pasó y se lleva a volver a sembrar.
            <Empty className="py-12">
              <EmptyHeader>
                <EmptyMedia variant="icon">
                  <GitBranch aria-hidden="true" />
                </EmptyMedia>
                <EmptyTitle>Esta siembra no abrió ninguna rama</EmptyTitle>
                <EmptyDescription>Se pidieron cero ramas, o el archivo de la cosecha quedó a medias.</EmptyDescription>
              </EmptyHeader>
              <EmptyContent>
                <Button size="lg" onClick={() => setVista("nueva")}>
                  Sembrarla de nuevo
                </Button>
              </EmptyContent>
            </Empty>
          ) : (
            <>
              {/* Para comparar hacen falta dos: con una sola rama, lo suyo ya está en la cabecera. */}
              {!unica && (
                <div className="flex-none px-5 pb-4">
                  <Ramas cosecha={c} elegido={elegido} alElegir={elegirYMostrar} />
                </div>
              )}

              <Codigo
                estado={codigo}
                alCopiar={() => (diffPuesto?.texto ? copiar(diffPuesto.texto) : Promise.resolve(false))}
                alAgrandar={agrandar}
              />
            </>
          )}
        </main>

        <div
          ref={elDetalle}
          className="bg-card/40 min-h-0 max-[1280px]:col-span-full max-[1280px]:row-start-2 max-[1280px]:max-h-[42vh] max-[1280px]:scroll-mt-14 max-[1280px]:overflow-auto"
        >
          <Detalle
            // Otra tarea u otra rama arrancan de cero: una confirmación de «Descartar» abierta no
            // pasa armada a otra cosecha, donde un clic más borraba la rama equivocada.
            key={`${turnoId ?? ""}|${candidato?.universo.id ?? ""}`}
            cosecha={c}
            candidato={candidato}
            conWorktree={conWorktree}
            alCopiarRuta={(ruta) => copiar(ruta)}
            {...(rta.estadoRama ? { estadoRama: rta.estadoRama } : {})}
            puedePr={rta.puedePr ?? false}
            {...(rta.pideAprobacion ? { pideAprobacion: rta.pideAprobacion } : {})}
            ocultarPorton={unica !== undefined}
            alRama={async (accion, aprobado) => {
              const turno = turnoId;
              try {
                await mandarRama(accion, turno, aprobado);
                diffs.current.clear();
                // Si mientras tanto pasaste a otra tarea, no te devuelve a esta.
                if (turnoIdRef.current === turno) await cargar(turno);
                return null;
              } catch (e) {
                return e instanceof Error ? e.message : String(e);
              }
            }}
          />
        </div>
      </div>

      {visor && diffPuesto?.texto && (
        <Visor
          quienAbrio={triggerVisor.current}
          titulo={visor.titulo}
          sub={visor.sub}
          onCerrado={() => {
            setVisor(null);
            // Quien lo abrió pudo desaparecer (se recargó la cosecha): el foco no cae al vacío.
            if (!triggerVisor.current?.isConnected) document.querySelector<HTMLElement>("button[data-agrandar]")?.focus();
          }}
          onCopiar={() => copiar(diffPuesto.texto!)}
        >
          <LineasDiff texto={diffPuesto.texto} />
        </Visor>
      )}
    </div>
  );
}

const Sep = () => <span className="text-muted-foreground/50 mx-2">·</span>;

/** «Escribió sonnet · revisó haiku · estrategia equilibrada»: lo mismo que imprime el CLI. */
// Codex y Antigravity no reciben modelo del reparto: el nombre lo dice la rama.
function repartoEnPalabras(m: NonNullable<RespuestaCosecha["cosecha"]>["modelos"] & object, deLaRama?: string): string {
  const partes = [`Escribió ${m.escribir ?? deLaRama ?? "el modelo por defecto"}`];
  if (m.corregir && m.corregir !== m.escribir) partes.push(`corrigió ${m.corregir}`);
  partes.push(m.revisar ? `revisó ${m.revisar}` : "sin revisión con modelo");
  if (m.explorar) partes.push(`una rama midió a ${m.explorar}`);
  return `${partes.join(" · ")} · estrategia ${m.estrategia === "economia" ? "economía" : m.estrategia}`;
}

/** El porqué del servidor como oración: algunos traen el punto y otros no. */
function conPunto(texto: string): string {
  const limpio = texto.trim();
  return /[.!?…]$/.test(limpio) ? limpio : `${limpio}.`;
}

async function copiar(texto: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(texto);
    return true;
  } catch {
    // Sin permiso de portapapeles no se simula un «Copiado» que no pasó.
    return false;
  }
}

/**
 * Mientras llega lo primero, con la forma de lo que va a aparecer: la
 * grilla del Tablero o las tres columnas de Cosechas. Un esqueleto con
 * otra forma hacía saltar la pantalla al cargar.
 */
function Esqueleto({ vista }: { vista: Vista }) {
  return (
    <div aria-busy="true" aria-label="Cargando la consola" className="grid h-dvh grid-cols-[minmax(0,1fr)] grid-rows-[auto_minmax(0,1fr)]">
      <div className="flex h-[52px] items-center gap-4 border-b px-4 pointer-coarse:h-[60px]">
        <Skeleton className="size-[18px] rounded-full" />
        <Skeleton className="h-4 w-16 max-[640px]:hidden" />
        <Skeleton className="h-8 w-[330px] rounded-lg max-[640px]:w-40" />
        <Skeleton className="ml-auto h-9 w-28 rounded-lg max-[640px]:w-9" />
      </div>
      {vista === "cosecha" ? (
        <div className="grid min-h-0 grid-cols-[260px_minmax(0,1fr)_340px] max-[1280px]:grid-cols-[224px_minmax(0,1fr)] max-[880px]:grid-cols-1">
          <div className="space-y-3 border-r p-4 max-[880px]:hidden">
            {Array.from({ length: 4 }, (_, i) => (
              <div key={i} className="space-y-1.5">
                <Skeleton className="h-3.5 w-24" />
                <Skeleton className="h-3 w-full" />
              </div>
            ))}
          </div>
          <div className="space-y-4 p-5">
            <Skeleton className="h-7 w-2/3" />
            <Skeleton className="h-4 w-1/2" />
            <Skeleton className="h-40 w-full rounded-xl" />
            <Skeleton className="h-64 w-full rounded-xl" />
          </div>
          <div className="space-y-3 border-l p-4 max-[1280px]:hidden">
            <Skeleton className="h-5 w-16" />
            <Skeleton className="h-3 w-full" />
            <Skeleton className="h-3 w-4/5" />
          </div>
        </div>
      ) : (
        <div className="min-h-0 overflow-hidden">
          <div className="mx-auto grid w-full max-w-[1180px] auto-rows-[175px] grid-cols-4 gap-3 px-5 py-6 max-[880px]:grid-cols-2">
            <Skeleton className="col-span-2 rounded-2xl" />
            <Skeleton className="col-span-2 row-span-2 rounded-2xl" />
            <Skeleton className="rounded-2xl" />
            <Skeleton className="rounded-2xl" />
            <Skeleton className="col-span-2 rounded-2xl" />
            <Skeleton className="col-span-2 rounded-2xl" />
          </div>
        </div>
      )}
    </div>
  );
}

/** Lo que se ve cuando no hay cosecha que mostrar: qué falta y qué hacer ahora. */
function Aviso({
  icono,
  titulo,
  texto,
  comando,
  accion,
}: {
  icono: "grilla" | "red";
  titulo: string;
  texto: string;
  /** Lo que se copia, entero; `visible` es como se muestra (sin la ruta larga). */
  comando?: { entero: string; visible: string };
  accion?: { rotulo: string; alTocar: () => void };
}) {
  const Icono = icono === "red" ? WifiOff : Grid2x2;
  return (
    <Empty role={icono === "red" ? "alert" : undefined}>
      <EmptyHeader>
        <EmptyMedia variant="icon">
          <Icono aria-hidden="true" />
        </EmptyMedia>
        <EmptyTitle as="h1" className="titulo-vista">
          {titulo}
        </EmptyTitle>
        <EmptyDescription>{texto}</EmptyDescription>
      </EmptyHeader>
      {(comando || accion) && (
        <EmptyContent>
          {comando && (
            <div className="bg-card flex max-w-full items-center gap-3 rounded-xl py-2 pr-2 pl-4">
              <code title={comando.entero} className="text-foreground/90 min-w-0 flex-1 truncate text-left font-mono text-xs">
                {comando.visible}
              </code>
              <BotonCopiar
                alCopiar={() => navigator.clipboard.writeText(comando.entero).then(() => true, () => false)}
                rotulo="Copiar"
                chico
              />
            </div>
          )}
          {accion && (
            <Button size="lg" onClick={accion.alTocar}>
              {accion.rotulo}
            </Button>
          )}
        </EmptyContent>
      )}
    </Empty>
  );
}
