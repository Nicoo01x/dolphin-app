import { useEffect, useState } from "react";
import { ArrowUp, ChevronDown, Clock, Loader2, Minus, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Aviso, conTono } from "./Pagina";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { DelfinDeSimbolos } from "./Delfin";
import { MarDeSimbolos } from "./Mar";
import { aprobarPlan, mandarCalendario, pedirCola, pedirPlan, pedirSiembra, traerCalendario, type Plan } from "@/lib/api";
import { aInputLocal, cuandoCorre, instanteDe, type Momento } from "@/lib/cuando";
import { cn } from "@/lib/utils";
import { Casilla } from "./Casilla";
import { PlanEditable } from "./PlanEditable";
import { registrarCampoNuevaTarea, tomarTareaNuevaPendiente } from "@/lib/embebida";

/**
 * La pantalla para hablarle a dolphin: contás la tarea, elegís quién
 * escribe y cuántos intentos, y dolphin orquesta el resto. Al enviar,
 * la consola pasa sola a la siembra en vivo.
 */

interface Pluma {
  readonly clave: string;
  readonly nombre: string;
  readonly detalle: string;
  readonly logo: string;
  readonly agente: "claude" | "antigravity" | "codex" | "mentira";
  readonly modelo?: string;
}

const PLUMAS: readonly Pluma[] = [
  { clave: "claude", nombre: "Claude", detalle: "el que tengas configurado", logo: "/logos/claude.svg", agente: "claude" },
  { clave: "opus", nombre: "Claude Opus", detalle: "el más capaz", logo: "/logos/claude.svg", agente: "claude", modelo: "opus" },
  { clave: "sonnet", nombre: "Claude Sonnet", detalle: "equilibrado", logo: "/logos/claude.svg", agente: "claude", modelo: "sonnet" },
  { clave: "haiku", nombre: "Claude Haiku", detalle: "rápido y barato", logo: "/logos/claude.svg", agente: "claude", modelo: "haiku" },
  // Los otros motores reciben la misma memoria: el perfil y las reglas del repo viajan igual.
  { clave: "antigravity", nombre: "Antigravity", detalle: "Gemini Flash, barato", logo: "/logos/gemini.svg", agente: "antigravity" },
  { clave: "codex", nombre: "Codex", detalle: "el de tu cuenta de ChatGPT", logo: "/logos/openai.svg", agente: "codex" },
  { clave: "demo", nombre: "Demo", detalle: "sin gastar un token", logo: "/dolphin-blanco-128.png", agente: "mentira" },
];

// Las pastillas del compositor (quién escribe, cuándo): tonales al pasar, con el texto de siempre.
const PASTILLA = "text-foreground hover:bg-secondary gap-2 px-3";

export function Nueva({ alSembrar, alEncolar }: { alSembrar: () => void; alEncolar: () => void }) {
  const [tarea, setTarea] = useState("");
  const [pluma, setPluma] = useState<Pluma>(PLUMAS[0]!);
  const [intentos, setIntentos] = useState(1);
  // Una rama es lo normal; varias son para comparar y se piden a propósito desde el menú.
  const comparar = intentos > 1;
  // Por defecto solo queda en disco la rama elegida: el resto se borra.
  const [guardarTodas, setGuardarTodas] = useState(false);
  const [estado, setEstado] = useState<{ que: "quieto" | "enviando" | "error"; porQue?: string }>({ que: "quieto" });
  // Una tarea, o un objetivo grande que Thinking parte en un plan para aprobar antes de gastar.
  const [modo, setModo] = useState<"tarea" | "objetivo">("tarea");
  const [plan, setPlan] = useState<Plan | null>(null);
  const [conSuscripcion, setConSuscripcion] = useState(false);
  const [aprobando, setAprobando] = useState<{ enviando: boolean; porQue?: string }>({ enviando: false });
  useEffect(() => {
    const pendiente = tomarTareaNuevaPendiente();
    if (pendiente !== null) setTarea(pendiente);
    return registrarCampoNuevaTarea(setTarea);
  }, []);
  // ¿Cuándo? Ahora, o agendado en el calendario: lo lanza el servidor a su hora.
  const [momento, setMomento] = useState<Momento>("ahora");
  const [elegido, setElegido] = useState(() => aInputLocal(new Date(Date.now() + 60 * 60 * 1000)));
  const [diario, setDiario] = useState(false);
  const [agendado, setAgendado] = useState<string | null>(null);
  // Dónde corre lo agendado: esta máquina, o un host por SSH de dolphin.config.json.
  const [hosts, setHosts] = useState<string[]>([]);
  // Adónde va cada uno: el nombre lo escribió el repo, el destino es lo que importa.
  const [destinos, setDestinos] = useState<Record<string, string>>({});
  const [host, setHost] = useState("");
  useEffect(() => {
    void traerCalendario()
      .then((c) => {
        setHosts(c.hosts ?? []);
        setDestinos(c.destinos ?? {});
      })
      .catch(() => undefined);
  }, []);
  const instante = instanteDe(momento, new Date(), elegido);
  const cuando = momento === "ahora" || !instante ? "Ahora" : cuandoCorre(instante, new Date());

  const lista = tarea.trim().length > 0 && estado.que !== "enviando";
  // Varias líneas son varias tareas: van a la cola, cada una en su rama y a la vez.
  const lineas = tarea.split("\n").map((l) => l.trim()).filter((l) => l !== "");
  const esCola = modo === "tarea" && lineas.length >= 2;
  const esObjetivo = modo === "objetivo";

  const enviar = async () => {
    if (!lista) return;
    setEstado({ que: "enviando" });
    setAgendado(null);
    try {
      if (esObjetivo) {
        // Pensar no escribe nada: lee el repo y propone. Lo que gasta es aprobar.
        setPlan(null);
        const pensado = await pedirPlan(tarea.trim());
        setPlan(pensado.plan);
        setConSuscripcion(pensado.suscripcion === true);
        setAprobando({ enviando: false });
        setEstado({ que: "quieto" });
        return;
      }
      if (momento !== "ahora") {
        if (!instante) throw new Error("elegí una fecha y hora para agendar");
        if (instante.getTime() <= Date.now()) throw new Error("esa hora ya pasó: elegí una más adelante");
        await mandarCalendario({
          accion: "agendar",
          tareas: esCola ? lineas : [tarea.trim()],
          cuando: instante.toISOString(),
          ...(diario ? { repetir: "diario" as const } : {}),
          agente: pluma.agente,
          ...(pluma.modelo ? { modelo: pluma.modelo } : {}),
          ...(host ? { host } : {}),
        });
        setAgendado(`Agendado: corre ${cuandoCorre(instante, new Date())}${diario ? " y después todos los días a esa hora" : ""}. Lo ves en En vivo.`);
        setTarea("");
        setEstado({ que: "quieto" });
        return;
      }
      if (esCola) {
        await pedirCola({ tareas: lineas, agente: pluma.agente, ...(pluma.modelo ? { modelo: pluma.modelo } : {}) });
        setEstado({ que: "quieto" });
        alEncolar();
        return;
      }
      await pedirSiembra({
        tarea: tarea.trim(),
        n: intentos,
        agente: pluma.agente,
        ...(pluma.modelo ? { modelo: pluma.modelo } : {}),
        ...(guardarTodas ? { guardarTodas: true } : {}),
      });
      setEstado({ que: "quieto" });
      alSembrar();
    } catch (error) {
      setEstado({ que: "error", porQue: error instanceof Error ? error.message : String(error) });
    }
  };

  const aprobar = async () => {
    if (!plan) return;
    setAprobando({ enviando: true });
    try {
      await aprobarPlan(plan, pluma.agente);
      setPlan(null);
      setTarea("");
      setAprobando({ enviando: false });
      alEncolar();
    } catch (error) {
      setAprobando({ enviando: false, porQue: error instanceof Error ? error.message : String(error) });
    }
  };

  return (
    // El mar y el delfín van en la caja que NO scrollea: cubren siempre lo que se ve, y el delfín no
    // queda cortado al desplazar. Lo que scrollea es la capa de adelante.
    <div className="relative min-h-0 overflow-hidden">
      <MarDeSimbolos opacity={0.22} />
      {/* La marca, viva: el delfín hecho de símbolos de código cruza la pantalla saltando, detrás de la tarea.
          En angosto no hay costado por donde pase sin cruzarse con el compositor: no está. */}
      <DelfinDeSimbolos legibles="h1, p, label, button" className="max-[800px]:hidden" />
      <div className="relative z-10 h-full overflow-y-auto">
      <div className="mx-auto flex min-h-full w-full max-w-2xl flex-col items-center justify-center px-5 py-12 max-[640px]:px-4">
        <h1 className="titulo-vista text-center">¿Qué sembramos hoy?</h1>

        {/* Thinking: un objetivo grande se parte en un plan que se aprueba antes de gastar. */}
        <div role="group" aria-label="Qué le pedís" className="bg-secondary mt-5 flex rounded-full p-0.5">
          {(
            [
              ["tarea", "Una tarea"],
              ["objetivo", "Un objetivo"],
            ] as const
          ).map(([valor, rotulo]) => (
            <Button
              key={valor}
              variant="ghost"
              aria-pressed={modo === valor}
              onClick={() => {
                setModo(valor);
                setPlan(null);
                if (valor === "objetivo") setMomento("ahora");
              }}
              className={cn(
                modo === valor ? "bg-background text-foreground hover:bg-background" : "hover:text-foreground hover:bg-transparent",
              )}
            >
              {rotulo}
            </Button>
          ))}
        </div>

        {/* Opaca, no de vidrio: los puntos del mar se leían a través de lo que escribías. */}
        <div className="bg-card focus-within:ring-foreground/40 mt-4 w-full rounded-3xl shadow-[var(--vidrio-sombra)] transition-shadow duration-150 focus-within:ring-2">
          <textarea
            name="tarea"
            data-sin-anillo
            value={tarea}
            onChange={(ev) => setTarea(ev.target.value)}
            onKeyDown={(ev) => {
              if (ev.key === "Enter" && !ev.shiftKey) {
                ev.preventDefault();
                void enviar();
              }
            }}
            rows={3}
            maxLength={2000}
            placeholder={
              esObjetivo
                ? "Que la tienda acepte cupones de descuento: un campo en el carrito, que valide el código y que el total lo descuente…"
                : "Contá qué hay que cambiar y dónde: el login no valida el mail vacío y deja mandar el formulario…"
            }
            aria-label={esObjetivo ? "El objetivo a planificar" : "La tarea a sembrar"}
            // Crece con lo que escribís, hasta unas ocho líneas: después scrollea adentro.
            className="placeholder:text-muted-foreground max-h-[13.5rem] min-h-[5.25rem] w-full resize-none bg-transparent px-4 pt-4 pb-2 text-sm outline-none [field-sizing:content]"
          />

          {/* En el teléfono no entran los cuatro en una fila (con los dedos, cada botón mide 48 px):
              el contador y el botón de enviar bajan a una segunda, y nada pierde su texto. */}
          <div className="flex flex-wrap items-center gap-2 px-3 pb-3">
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="lg" aria-label={`Quién escribe: ${pluma.nombre}`} className={PASTILLA}>
                  <img src={pluma.logo} alt="" className="size-4" />
                  <span>{pluma.nombre}</span>
                  <ChevronDown aria-hidden="true" className="text-muted-foreground size-3.5" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start" className="w-64">
                {PLUMAS.map((p) => (
                  <DropdownMenuItem key={p.clave} onClick={() => setPluma(p)} className="gap-2.5">
                    <img src={p.logo} alt="" className="size-4" />
                    <span className="font-medium">{p.nombre}</span>
                    <span className="text-muted-foreground ml-auto text-xs">{p.detalle}</span>
                  </DropdownMenuItem>
                ))}
                {/* Abrir varias ramas para la misma tarea es comparar, no la forma normal de trabajar. */}
                {!esObjetivo && !esCola && momento === "ahora" && !comparar && (
                  <>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem onClick={() => setIntentos(2)} className="text-[13px]">
                      Comparar en varias ramas…
                    </DropdownMenuItem>
                  </>
                )}
              </DropdownMenuContent>
            </DropdownMenu>

            {/* Un plan se piensa ahora: lo que se agenda es una tarea. */}
            {!esObjetivo && (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  variant="ghost"
                  size="lg"
                  aria-label={`Cuándo corre: ${cuando}`}
                  className={cn(PASTILLA, momento !== "ahora" && "bg-secondary")}
                >
                  <Clock aria-hidden="true" className="size-4" />
                  <span>{cuando}</span>
                  <ChevronDown aria-hidden="true" className="text-muted-foreground size-3.5" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start" className="w-56">
                {(
                  [
                    ["ahora", "Ahora"],
                    ["en-una-hora", "En una hora"],
                    ["esta-noche", "Esta noche, 23:00"],
                    ["manana", "Mañana, 09:00"],
                    ["elegido", "Elegir fecha y hora…"],
                  ] as const
                ).map(([clave, rotulo]) => (
                  <DropdownMenuItem key={clave} onClick={() => setMomento(clave)} className="text-[13px]">
                    {rotulo}
                  </DropdownMenuItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>
            )}

            {esObjetivo ? null : esCola ? (
              // Una cola es una rama por tarea: el selector de ramas no aplica.
              <span className="bg-secondary text-foreground inline-flex h-9 items-center rounded-full px-3.5 text-[13px] font-medium tabular-nums">
                {lineas.length} tareas a la vez
              </span>
            ) : momento !== "ahora" || !comparar ? null : (
              <div role="group" className="bg-secondary flex h-9 items-center rounded-full px-1" aria-label="Cuántas ramas">
                {/* Bajar a una rama deja de comparar: el contador se va y vuelve el modo normal. */}
                <Button
                  variant="ghost"
                  size="icon-sm"
                  aria-label={intentos === 2 ? "Volver a una rama" : "Una rama menos"}
                  onClick={() => setIntentos((n) => Math.max(1, n - 1))}
                  className="text-foreground hover:bg-accent"
                >
                  <Minus aria-hidden="true" className="size-3.5" />
                </Button>
                <span className="w-20 text-center text-[13px] font-medium tabular-nums">
                  {intentos} {intentos === 1 ? "rama" : "ramas"}
                </span>
                {/* En el tope, el botón se apaga: un botón activo que no hace nada
                    es un botón roto (lo encontró el explorador de Dolphin). */}
                <Button
                  variant="ghost"
                  size="icon-sm"
                  aria-label="Una rama más"
                  disabled={intentos >= 12}
                  onClick={() => setIntentos((n) => Math.min(12, n + 1))}
                  className="text-foreground hover:bg-accent"
                >
                  <Plus aria-hidden="true" className="size-3.5" />
                </Button>
              </div>
            )}

            <Button
              size="icon-lg"
              onClick={() => void enviar()}
              disabled={!lista}
              aria-label={esObjetivo ? "Armar el plan" : momento !== "ahora" ? "Agendar" : esCola ? `Encolar ${lineas.length} tareas` : "Sembrar"}
              className="ml-auto"
            >
              {estado.que === "enviando" ? (
                <Loader2 aria-hidden="true" className="size-4 animate-spin" />
              ) : (
                <ArrowUp aria-hidden="true" className="size-4" />
              )}
            </Button>
          </div>
        </div>

        {momento !== "ahora" && (
          <div className="bg-card mt-3 flex w-full flex-wrap items-center gap-x-4 gap-y-2 rounded-3xl px-4 py-3 text-[13px]">
            {momento === "elegido" && (
              <label className="flex items-center gap-2">
                <span className="text-muted-foreground">Cuándo</span>
                <input
                  type="datetime-local"
                  value={elegido}
                  min={aInputLocal(new Date())}
                  onChange={(ev) => setElegido(ev.target.value)}
                  className="bg-secondary h-9 rounded-2xl px-3 text-[13px] tabular-nums"
                />
              </label>
            )}
            {hosts.length > 0 && (
              <label className="flex items-center gap-2">
                <span className="text-muted-foreground">Dónde</span>
                <select
                  value={host}
                  onChange={(ev) => setHost(ev.target.value)}
                  className="bg-secondary h-9 rounded-2xl px-3 text-[13px]"
                >
                  <option value="">Esta máquina</option>
                  {hosts.map((h) => (
                    <option key={h} value={h}>
                      {destinos[h] ? `${h}, por SSH a ${destinos[h]}` : `${h}, por SSH`}
                    </option>
                  ))}
                </select>
              </label>
            )}
            <Casilla marcada={diario} alCambiar={setDiario}>
              Todos los días a esa hora
            </Casilla>
            {/* Lo único que no se ve venir: lo agendado corre solo y no toca lo delicado. */}
            <span className="text-muted-foreground text-[12px]">Corre sin vos: no deploya ni toca migraciones.</span>
          </div>
        )}

        {momento === "ahora" && !esCola && !esObjetivo && comparar && (
          // Sin esto, el código de una rama que se cortó se borra con ella, y
          // la consola no tenía cómo pedir lo contrario (era solo --sucio).
          <Casilla
            marcada={guardarTodas}
            alCambiar={setGuardarTodas}
            className="bg-card text-muted-foreground hover:text-foreground mt-3 self-start rounded-full px-3.5 text-[13px] transition-colors"
          >
            Guardar el código de todas las ramas <span className="text-muted-foreground">· si no, solo queda la elegida</span>
          </Casilla>
        )}

        {/* Sobre el mar, con fondo propio: el tono tenue de un aviso deja ver los puntos a través. */}
        {agendado && (
          // Agendado es «por hacer»: azul, no el verde de lo que ya salió.
          <p role="status" className="bg-card mt-3 flex items-baseline gap-2 self-start rounded-2xl px-3.5 py-2.5 text-[13px]">
            <span aria-hidden="true" className="punto-tono size-2 flex-none translate-y-[-1px] rounded-full" style={conTono("var(--hacer)")} />
            <span>{agendado}</span>
          </p>
        )}

        {estado.que === "error" && (
          <div className="bg-background mt-3 self-start rounded-2xl">
            <Aviso>No salió: {estado.porQue}. Si el servidor se reinició, refrescá la página y probá de nuevo.</Aviso>
          </div>
        )}

        {esObjetivo && estado.que === "enviando" && (
          <p role="status" className="bg-card text-muted-foreground mt-3 rounded-full px-3.5 py-2 text-center text-[13px]">
            Pensando el plan: lee el repo y lo parte en tareas. Tarda un minuto y no escribe nada.
          </p>
        )}

        {plan && (
          <PlanEditable
            plan={plan}
            conClaude={pluma.agente === "claude"}
            suscripcion={conSuscripcion}
            enviando={aprobando.enviando}
            {...(aprobando.porQue ? { porQue: aprobando.porQue } : {})}
            alCambiar={setPlan}
            alAprobar={() => void aprobar()}
            alDescartar={() => setPlan(null)}
          />
        )}
      </div>
      </div>
    </div>
  );
}
