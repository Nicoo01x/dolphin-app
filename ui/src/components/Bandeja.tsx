import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Bug, Check, ExternalLink, Inbox, Lightbulb } from "lucide-react";
import { conProyecto, mandarBandeja, traerBandeja, traerCalendario, mandarCalendario, valorarIdeas, type AccionDeAsunto, type Asunto, type TurnoAgendado } from "@/lib/api";
import { cuandoFue } from "@/lib/datos";
import { cn } from "@/lib/utils";
import { Empty, EmptyContent, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { BotonCopiar } from "./BotonCopiar";
import { Leible } from "./Leible";
import { Aviso, Cabecera, Pagina, conTono } from "./Pagina";

/**
 * La bandeja: lo que Dolphin encontró sin que se lo pidieras. Errores de
 * recorrer la app como una persona, e ideas que vio en otros productos.
 * Cada uno se decide con un botón: rechazar (no vuelve) o implementar,
 * que siembra una rama con el pedido armado entero.
 */

type Filtro = "abiertos" | "anotados" | "hechos" | "rechazados";

/** El ancho de la vista: la lista y el detalle juntos se leen bien hasta acá. */
const ANCHO = "w-full max-w-[1760px]";

const ENTRA: Record<Filtro, (a: Asunto) => boolean> = {
  abiertos: (a) => a.estado === "abierto" || a.estado === "implementando",
  anotados: (a) => a.estado === "anotado",
  hechos: (a) => a.estado === "hecho",
  rechazados: (a) => a.estado === "rechazado",
};

export function Bandeja({
  alImplementar,
  alContar,
}: {
  alImplementar: () => void;
  /** Cuántos quedan abiertos, para que la barra lo muestre al día. */
  alContar?: (abiertos: number) => void;
}) {
  const [asuntos, setAsuntos] = useState<Asunto[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [filtro, setFiltro] = useState<Filtro>("abiertos");
  const [elegido, setElegido] = useState<string | null>(null);
  const [porImplementar, setPorImplementar] = useState<string | null>(null);
  const [ocupado, setOcupado] = useState<string | null>(null);
  // Valorar compara todas las ideas con un modelo: tarda, y el reloj dice que anda.
  const [valorando, setValorando] = useState(false);
  const [segundos, setSegundos] = useState(0);
  const [autopiloto, setAutopiloto] = useState<TurnoAgendado | null>(null);
  const [autopilotoOcupado, setAutopilotoOcupado] = useState(false);
  useEffect(() => {
    if (!valorando) return;
    setSegundos(0);
    const reloj = window.setInterval(() => setSegundos((s) => s + 1), 1000);
    return () => window.clearInterval(reloj);
  }, [valorando]);

  const cargar = useCallback(async () => {
    try {
      const { asuntos } = await traerBandeja();
      const calendario = await traerCalendario();
      setAutopiloto(calendario.turnos.find((t) => t.repetir === "diario" && t.deLaBandeja && t.estado !== "cancelado") ?? null);
      // Lo más nuevo arriba; los errores antes que las ideas: primero lo que está roto.
      // Lo más nuevo arriba; los errores antes que las ideas (primero lo que está roto), y entre las
      // ideas, la que más vale primero: las sin valorar, al final.
      setAsuntos(
        [...asuntos].reverse().sort((a, b) => {
          if (a.tipo !== b.tipo) return a.tipo === "error" ? -1 : 1;
          return (b.valoracion?.valor ?? 0) - (a.valoracion?.valor ?? 0);
        }),
      );
      alContar?.(asuntos.filter((a) => a.estado === "abierto").length);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }, [alContar]);

  useEffect(() => {
    void cargar();
  }, [cargar]);

  // Mientras el autopiloto corre puede ponerse en pausa por el cupo: se relee para que la tarjeta lo
  // muestre sola. Solo entonces: de día, recargar cada 5 s pisaría lo que la persona está mirando.
  const autopilotoCorriendo = autopiloto?.estado === "corriendo";
  useEffect(() => {
    if (!autopilotoCorriendo) return;
    const reloj = window.setInterval(() => void cargar(), 5_000);
    return () => window.clearInterval(reloj);
  }, [autopilotoCorriendo, cargar]);

  const cuenta = useMemo(() => {
    const lista = asuntos ?? [];
    return {
      abiertos: lista.filter(ENTRA.abiertos).length,
      anotados: lista.filter(ENTRA.anotados).length,
      hechos: lista.filter(ENTRA.hechos).length,
      rechazados: lista.filter(ENTRA.rechazados).length,
      ideasAbiertas: lista.filter((a) => a.tipo === "idea" && a.estado === "abierto").length,
    };
  }, [asuntos]);

  const visibles = (asuntos ?? []).filter(ENTRA[filtro]);
  // La que más vale de las abiertas, si hay una sola arriba de todas: es la que se marca.
  const valores = visibles.filter((a) => a.tipo === "idea" && a.valoracion).map((a) => a.valoracion!.valor);
  const tope = Math.max(0, ...valores);
  const mejor = tope >= 4 && valores.filter((v) => v === tope).length === 1 ? visibles.find((a) => a.valoracion?.valor === tope)?.id : undefined;

  const decidir = async (accion: AccionDeAsunto, id: string) => {
    setOcupado(id);
    try {
      await mandarBandeja(accion, id);
      setPorImplementar(null);
      if (accion === "implementar") {
        alImplementar();
        return;
      }
      await cargar();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setOcupado(null);
    }
  };

  // El que se está mirando: el elegido si sigue en la lista; si no, el primero (en ancho siempre hay uno a la vista).
  const actual = visibles.find((a) => a.id === elegido) ?? null;
  const enAncho = () => window.matchMedia("(min-width: 1024px)").matches;
  const mirado = actual ?? (visibles[0] && enAncho() ? visibles[0] : null);

  const elegir = (id: string) => {
    // En angosto el detalle se abre debajo de la fila: tocarla de nuevo lo cierra.
    setElegido((antes) => (!enAncho() && antes === id ? null : id));
    setPorImplementar(null);
  };

  // ↑ ↓ recorren la lista, como en una bandeja de entrada.
  const conTeclas = (ev: React.KeyboardEvent<HTMLUListElement>) => {
    if (ev.key !== "ArrowDown" && ev.key !== "ArrowUp") return;
    ev.preventDefault();
    const i = Math.max(0, visibles.findIndex((a) => a.id === mirado?.id));
    const otro = visibles[ev.key === "ArrowDown" ? Math.min(visibles.length - 1, i + 1) : Math.max(0, i - 1)];
    if (!otro) return;
    setElegido(otro.id);
    setPorImplementar(null);
    ev.currentTarget.querySelector<HTMLButtonElement>(`[data-asunto="${otro.id}"]`)?.focus();
  };

  const panel = (asunto: Asunto, adentro: boolean) => (
    <Panel
      asunto={asunto}
      adentro={adentro}
      confirmando={porImplementar === asunto.id}
      ocupado={ocupado === asunto.id}
      alPedirImplementar={() => setPorImplementar(asunto.id)}
      alCancelar={() => setPorImplementar(null)}
      alDecidir={(accion) => void decidir(accion, asunto.id)}
    />
  );

  return (
    // En ancho la página no se desplaza: la lista y el detalle tienen cada uno su barra. El canal de
    // la barra queda reservado siempre, para que abrir un asunto no le cambie el ancho a nada.
    <Pagina className="[scrollbar-gutter:stable] lg:overflow-hidden lg:pb-5">
      <Cabecera titulo="Bandeja" className={ANCHO}>
        <div role="group" aria-label="Qué mostrar" className="bg-secondary flex rounded-full p-0.5">
          {(["abiertos", "anotados", "hechos", "rechazados"] as const).map((f) => (
            <button
              key={f}
              type="button"
              aria-pressed={filtro === f}
              onClick={() => setFiltro(f)}
              className={cn(
                "cursor-pointer rounded-full px-3 py-1 text-[13px] font-medium capitalize tabular-nums transition-colors",
                filtro === f ? "bg-background text-foreground" : "text-muted-foreground hover:text-foreground",
              )}
            >
              {f} <span className="text-muted-foreground font-normal">{cuenta[f]}</span>
            </button>
          ))}
        </div>
        {/* Comparar las ideas entre sí: cuál vale más para este proyecto. */}
        {filtro === "abiertos" && cuenta.ideasAbiertas > 0 && (
          <Button
            variant="secondary"
            disabled={valorando}
            onClick={async () => {
              setValorando(true);
              try {
                await valorarIdeas();
                await cargar();
              } catch (e) {
                setError(e instanceof Error ? e.message : String(e));
              } finally {
                setValorando(false);
              }
            }}
            title="Un modelo compara las ideas abiertas entre sí, mirando lo que este proyecto ya sabe de sí"
            className="tabular-nums"
          >
            {valorando ? `Comparando… ${segundos} s` : "Valorar ideas"}
          </Button>
        )}
      </Cabecera>

      <Autopiloto
        turno={autopiloto}
        marcadas={(asuntos ?? []).filter((a) => a.estado === "abierto" && a.paraLaNoche).length}
        ocupado={autopilotoOcupado}
        alCambiar={async (encendido) => {
          setAutopilotoOcupado(true);
          try {
            if (encendido) {
              const ahora = new Date();
              ahora.setHours(2, 0, 0, 0);
              if (ahora.getTime() <= Date.now()) ahora.setDate(ahora.getDate() + 1);
              await mandarCalendario({ accion: "agendar", deLaBandeja: { tope: 3 }, hora: "02:00", cuando: ahora.toISOString(), repetir: "diario", agente: "codex", modelo: "gpt-reserve" });
            } else if (autopiloto) await mandarCalendario({ accion: "cancelar", id: autopiloto.id });
            await cargar();
          } catch (e) {
            setError(e instanceof Error ? e.message : String(e));
          } finally {
            setAutopilotoOcupado(false);
          }
        }}
      />

      {error && <Aviso alReintentar={asuntos === null ? () => void cargar() : undefined}>{error}</Aviso>}

      {asuntos === null ? (
        error ? null : <Leyendo />
      ) : visibles.length === 0 ? (
        <Vacia filtro={filtro} />
      ) : (
        <div className="grid w-full max-w-[1760px] grid-cols-[minmax(0,1fr)] gap-5 lg:min-h-0 lg:flex-1 lg:grid-cols-[minmax(300px,380px)_minmax(0,1fr)] lg:grid-rows-[minmax(0,1fr)]">
          <section aria-label="La lista" className="bg-card min-h-0 rounded-3xl p-1.5 lg:overflow-auto">
            <ul aria-label="Asuntos" onKeyDown={conTeclas} className="space-y-0.5">
              {visibles.map((a) => (
                <li key={a.id}>
                  <Item asunto={a} elegido={mirado?.id === a.id} esLaMejor={a.id === mejor} alElegir={() => elegir(a.id)} />
                  {/* En angosto, el detalle abre debajo de la fila. */}
                  {actual?.id === a.id && <div className="mt-1 mb-2 lg:hidden">{panel(a, true)}</div>}
                </li>
              ))}
            </ul>
          </section>

          {/* En ancho, el detalle al lado: la lista para elegir, el panel para decidir. */}
          <section aria-label="El asunto" className="hidden min-h-0 lg:block">
            {mirado && panel(mirado, false)}
          </section>
        </div>
      )}
    </Pagina>
  );
}

function Autopiloto({
  turno,
  marcadas,
  ocupado,
  alCambiar,
}: {
  turno: TurnoAgendado | null;
  marcadas: number;
  ocupado: boolean;
  alCambiar: (encendido: boolean) => Promise<void>;
}) {
  const encendido = turno !== null;
  const ultima = turno?.corridas?.[turno.corridas.length - 1];
  const como = encendido
    ? `todas las noches a las ${turno.hora ?? "02:00"} con ${nombreDelAgente(turno.agente)}${turno.modelo ? ` (${turno.modelo})` : ""}, hasta ${turno.deLaBandeja?.tope ?? 3} ideas`
    : "apagado: de noche implementa las ideas que marques";
  const cuantas = marcadas === 0 ? "ninguna para esta noche" : marcadas === 1 ? "1 para esta noche" : `${marcadas} para esta noche`;
  const pausa = turno?.pausaCupo
    ? `en pausa hasta las ${horaDePausa(turno.pausaCupo.hasta)} (cupo de ${turno.pausaCupo.ventana === "5h" ? "5 h" : "la semana"} al ${turno.pausaCupo.usadoPct} %)`
    : null;
  const comoSalio = ultima ? (ultima.porQue ?? (ultima.salio ? "la última noche salió" : "la última noche no salió")) : null;
  // Una sola fila, siempre igual: el texto se parte a lo ancho que haya y el botón no se mueve de la
  // derecha (antes bajaba debajo del texto al abrir un asunto y todo saltaba 50 px).
  return (
    <section aria-label="Autopiloto" className="bg-card flex w-full max-w-[1760px] items-center gap-3 rounded-2xl py-2 pr-2 pl-4">
      <p className="text-muted-foreground min-w-0 flex-1 text-[13px] leading-snug">
        <span className="text-foreground font-semibold">Autopiloto</span>
        {" · "}
        {como} · {cuantas}
        {pausa && <span className="text-foreground"> · {pausa}</span>}
        {comoSalio && (
          <>
            {" · "}
            <span className={ultima?.salio ? "text-paso" : undefined}>{comoSalio}</span>
            {ultima?.parte ? (
              <>
                {" · "}
                <a className="text-foreground underline underline-offset-2" href={conProyecto(`/partes/${encodeURIComponent(ultima.parte)}`)}>
                  Ver parte
                </a>
              </>
            ) : null}
          </>
        )}
      </p>
      <Button variant="secondary" size="sm" disabled={ocupado} onClick={() => void alCambiar(!encendido)}>
        {ocupado ? "Guardando…" : encendido ? "Apagar" : "Prender"}
      </Button>
    </section>
  );
}

/** Una fila de la lista: el tipo, el título y de dónde vino. Se lee de un vistazo; el resto, en el panel. */
function Item({
  asunto,
  elegido,
  esLaMejor,
  alElegir,
}: {
  asunto: Asunto;
  elegido: boolean;
  esLaMejor: boolean;
  alElegir: () => void;
}) {
  const esError = asunto.tipo === "error";
  const Icono = esError ? Bug : Lightbulb;
  const estaNoche = asunto.paraLaNoche && asunto.estado === "abierto";
  // La línea entera, para el title: truncada se pierde justo el final.
  const meta = [esLaMejor ? "la que más vale" : null, deDonde(asunto), cuandoFue(asunto.creado), estaNoche ? "esta noche" : null]
    .filter(Boolean)
    .join(" · ");
  return (
    <button
      type="button"
      data-asunto={asunto.id}
      aria-current={elegido ? "true" : undefined}
      onClick={alElegir}
      className={cn(
        "grid w-full cursor-pointer grid-cols-[16px_minmax(0,1fr)_auto] items-start gap-x-3 rounded-2xl px-3 py-2.5 text-left transition-colors",
        // La elegida se apoya sobre la lista; las otras, apenas al pasar (en claro, hacia el blanco).
        elegido ? "ficha" : "hover:bg-secondary/50 in-data-[tema=claro]:hover:bg-background/70",
      )}
    >
      {/* El color es el de lo que es: violeta una idea, rojo un error. */}
      <Icono aria-hidden="true" className={cn("mt-0.5 size-4", esError ? "text-murio" : "text-idea")} />
      <span className="min-w-0">
        <span className="block truncate text-[13px] font-medium" title={asunto.titulo}>
          {asunto.titulo}
        </span>
        <span className="text-muted-foreground mt-0.5 block truncate text-xs" title={meta}>
          {esLaMejor ? <span className="text-foreground font-semibold">la que más vale · </span> : null}
          {deDonde(asunto)} · {cuandoFue(asunto.creado)}
          {estaNoche ? <span className="text-foreground font-medium"> · esta noche</span> : null}
        </span>
      </span>
      {asunto.valoracion && asunto.estado === "abierto" ? (
        <span className="mt-1 flex-none" title={`Vale ${asunto.valoracion.valor} de 5: ${asunto.valoracion.porQue}`}>
          <Medidor valor={asunto.valoracion.valor} />
        </span>
      ) : (
        <Estado asunto={asunto} />
      )}
    </button>
  );
}

const deDonde = (a: Asunto) =>
  a.tipo === "error" ? "lo encontró el explorador" : a.origen === "scout" ? "búsqueda de ideas" : a.origen;

const ESFUERZO: Readonly<Record<number, string>> = { 1: "chico", 2: "medio", 3: "grande" };

/**
 * Cuánto vale una idea, en cinco barras: se compara de un vistazo, sin leer un número. En blanco y
 * negro: el color queda para los estados, y cuánto vale no es un estado (lo dice la altura).
 */
function Medidor({ valor }: { valor: number }) {
  return (
    <span role="img" aria-label={`Vale ${valor} de 5`} className="flex items-end gap-[3px]">
      {[1, 2, 3, 4, 5].map((i) => (
        <span
          key={i}
          className={cn("w-[5px] rounded-full", i <= valor ? (valor >= 4 ? "bg-foreground" : "bg-foreground/55") : "bg-foreground/12")}
          style={{ height: `${6 + i * 2}px` }}
        />
      ))}
    </span>
  );
}

/** El asunto entero, para decidir: qué es, por qué, cómo se haría y la evidencia. Las acciones, arriba. */
function Panel({
  asunto,
  adentro,
  confirmando,
  ocupado,
  alPedirImplementar,
  alCancelar,
  alDecidir,
}: {
  asunto: Asunto;
  /** Abierto debajo de su fila, adentro de la lista: un tono más hondo que ella. */
  adentro: boolean;
  confirmando: boolean;
  ocupado: boolean;
  alPedirImplementar: () => void;
  alCancelar: () => void;
    alDecidir: (accion: AccionDeAsunto) => void;
}) {
  const esError = asunto.tipo === "error";
  const Icono = esError ? Bug : Lightbulb;
  const verbo = esError ? "Arreglar" : "Implementar";
  // Al cancelar la confirmación, el foco vuelve al botón que la abrió (si no, cae en body).
  const elVerbo = useRef<HTMLButtonElement>(null);
  const cancelar = () => {
    alCancelar();
    requestAnimationFrame(() => elVerbo.current?.focus());
  };

  return (
    <article
      key={asunto.id}
      className={cn("animate-entra flex flex-col lg:h-full lg:overflow-auto", adentro ? "bg-background rounded-2xl p-4" : "bg-card rounded-3xl p-5")}
    >
      <p className="text-muted-foreground flex flex-wrap items-center gap-x-2 gap-y-1 text-xs">
        <span className={cn("inline-flex items-center gap-1.5 font-medium", esError ? "text-murio" : "text-idea")}>
          <Icono aria-hidden="true" className="size-3.5" />
          {esError ? "Error encontrado" : "Idea"}
        </span>
        <Estado asunto={asunto} />
        <span>{deDonde(asunto)}</span>
        {asunto.vecesVisto ? <span>· visto {asunto.vecesVisto + 1} veces</span> : null}
        <span>· {cuandoFue(asunto.creado)}</span>
      </p>
      <h2 className="titulo-vista mt-2 break-words">{asunto.titulo}</h2>
      {asunto.valoracion && (
        <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1">
          <Medidor valor={asunto.valoracion.valor} />
          <span className="text-[13px] font-semibold">
            Vale {asunto.valoracion.valor} de 5
          </span>
          <span className="text-muted-foreground text-[13px]">· esfuerzo {ESFUERZO[asunto.valoracion.esfuerzo] ?? "medio"}</span>
          {asunto.valoracion.porQue && (
            <p className="text-muted-foreground w-full text-[13px] leading-snug"><Leible texto={asunto.valoracion.porQue} /></p>
          )}
        </div>
      )}
      {asunto.donde && (
        <p className="text-muted-foreground mt-1.5 truncate font-mono text-xs" title={asunto.donde}>
          {asunto.donde}
        </p>
      )}

      <div className="mt-4 flex flex-wrap items-center gap-2">
        {asunto.estado === "abierto" && !confirmando && (
          <>
            <Button size="lg" disabled={ocupado} ref={elVerbo} onClick={alPedirImplementar}>
              {verbo}
            </Button>
            {/* Un interruptor con rótulo fijo: el check y aria-pressed dicen si está puesta. */}
            <Button
              variant="secondary"
              size="lg"
              disabled={ocupado}
              aria-pressed={Boolean(asunto.paraLaNoche)}
              onClick={() => alDecidir(asunto.paraLaNoche ? "sacar-de-la-noche" : "noche")}
              className={cn(!asunto.paraLaNoche && "text-muted-foreground hover:text-foreground")}
            >
              {asunto.paraLaNoche && <Check aria-hidden="true" />}
              Esta noche
            </Button>
            {/* La tercera salida: ni tirarlo ni pagarlo ahora. Queda como idea en el tablero. */}
            <Button variant="secondary" size="lg" disabled={ocupado} onClick={() => alDecidir("anotar")}>
              Anotar
            </Button>
            <Button variant="ghost" size="lg" disabled={ocupado} onClick={() => alDecidir("rechazar")}>
              Rechazar
            </Button>
          </>
        )}
        {asunto.estado === "rechazado" && (
          <Button variant="secondary" size="lg" disabled={ocupado} onClick={() => alDecidir("reabrir")}>
            Reabrir
          </Button>
        )}
      </div>

      {/* Implementar lanza un agente de verdad: se confirma en el lugar, sin ventanas. */}
      {confirmando && (
        <div className="bg-secondary/70 mt-3 flex flex-wrap items-center gap-3 rounded-2xl px-3 py-2.5">
          <p className="min-w-0 flex-1 text-[12px] leading-snug">
            Corre un agente <b className="font-semibold">sin pedir permisos</b>, en una rama aparte: no toca tu rama
            principal, no deploya ni toca migraciones. Te queda la rama probada.
          </p>
          <Button variant="ghost" autoFocus onClick={cancelar} onKeyDown={(ev) => ev.key === "Escape" && cancelar()}>
            Cancelar
          </Button>
          <Button disabled={ocupado} onClick={() => alDecidir("implementar")}>
            {ocupado ? "Sembrando…" : `Sí, ${verbo.toLowerCase()}`}
          </Button>
        </div>
      )}

      <p className="text-foreground/85 mt-5 text-sm leading-relaxed break-words"><Leible texto={asunto.detalle} /></p>
      <Detalle asunto={asunto} />
    </article>
  );
}

/** El estado, en su color: ámbar lo que se está implementando, verde lo hecho, apagado lo rechazado. */
function Estado({ asunto }: { asunto: Asunto }) {
  const pastilla = "inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-[12px] font-semibold whitespace-nowrap";
  if (asunto.estado === "implementando") {
    return (
      <span className={cn("con-tono", pastilla)} style={conTono("var(--corriendo)")}>
        <span aria-hidden="true" className="punto-tono size-1.5 animate-pulse rounded-full" />
        en una rama
      </span>
    );
  }
  if (asunto.estado === "hecho") {
    return (
      <span className={cn("con-tono", pastilla)} style={conTono("var(--paso)")}>
        hecho
      </span>
    );
  }
  if (asunto.estado === "rechazado") {
    return <span className={cn("text-muted-foreground bg-secondary", pastilla)}>rechazado</span>;
  }
  return null;
}

function Detalle({ asunto }: { asunto: Asunto }) {
  return (
    <div className="mt-5 space-y-4 text-[13px]">
      {asunto.resuelto && (
        <p className="text-paso text-[12px]">
          Comprobado{asunto.resueltoEn ? ` ${cuandoFue(asunto.resueltoEn)}` : ""}: {asunto.resuelto}.
        </p>
      )}

      {asunto.cortado && asunto.estado === "abierto" && (
        <p className="text-muted-foreground text-[12px]">
          La rama se cortó {cuandoFue(asunto.cortado.en)} antes de terminar (se cerró la app o se apagó la máquina).
        </p>
      )}

      {asunto.pasos && asunto.pasos.length > 0 && (
        <div>
          <p className="text-muted-foreground mb-1 text-xs font-medium">Cómo reproducirlo</p>
          <ol className="text-foreground/85 list-decimal space-y-0.5 pl-5 text-[13px]">
            {asunto.pasos.map((p, i) => (
              <li key={i} className="break-words">
                <Leible texto={p} />
              </li>
            ))}
          </ol>
        </div>
      )}

      {asunto.propuesta && (
        <div>
          <p className="text-muted-foreground mb-1 text-xs font-medium">Cómo se haría acá</p>
          <p className="text-foreground/85 leading-snug break-words"><Leible texto={asunto.propuesta} /></p>
        </div>
      )}

      {asunto.fuentes && asunto.fuentes.length > 0 && (
        <div>
          <p className="text-muted-foreground mb-1 text-xs font-medium">Dónde se vio</p>
          <ul className="space-y-1">
            {asunto.fuentes.map((f) => (
              <li key={f.url} className="min-w-0">
                <a
                  href={f.url}
                  target="_blank"
                  rel="noreferrer noopener"
                  className="text-foreground inline-flex max-w-full items-center gap-1.5 underline-offset-2 hover:underline"
                >
                  <ExternalLink aria-hidden="true" className="size-3 flex-none" />
                  <span className="truncate" title={f.titulo}>
                    {f.titulo}
                  </span>
                  <span className="text-muted-foreground flex-none font-mono text-[12px]">{dominio(f.url)}</span>
                </a>
              </li>
            ))}
          </ul>
        </div>
      )}

      {asunto.evidencia && (
        <div>
          <p className="text-muted-foreground mb-1 text-xs font-medium">Lo que se midió</p>
          <pre className="bg-secondary max-h-48 overflow-auto rounded-xl p-3 font-mono text-[12px] leading-relaxed whitespace-pre-wrap">
            {asunto.evidencia}
          </pre>
        </div>
      )}

      {asunto.video && asunto.momento !== undefined && (
        <div>
          <p className="text-muted-foreground mb-1 text-xs font-medium">El momento, en video</p>
          {/* Un fragmento del recorrido: arranca 2 s antes de que pase y corta 3 s después. */}
          <video
            controls
            preload="metadata"
            src={conProyecto(`/videos/${encodeURIComponent(asunto.video)}#t=${Math.max(0, asunto.momento - 2).toFixed(1)},${(asunto.momento + 3).toFixed(1)}`)}
            aria-label={`El recorrido en el momento en que pasó: ${asunto.titulo}`}
            className="max-h-[360px] w-auto max-w-full rounded-2xl"
          />
        </div>
      )}

      {asunto.captura && (
        <div>
          <p className="text-muted-foreground mb-1 text-xs font-medium">El momento</p>
          <img
            src={conProyecto(`/bandeja/${asunto.captura}`)}
            alt={`Captura de cuando pasó: ${asunto.titulo}`}
            loading="lazy"
            className="max-h-[360px] w-auto max-w-full rounded-2xl"
          />
        </div>
      )}
    </div>
  );
}

const VACIA: Record<Filtro, { titulo: string; texto: string }> = {
  abiertos: {
    titulo: "No hay nada abierto",
    texto: "Dolphin deja acá lo que encuentra solo: los errores de recorrer tu app como una persona y las ideas que ve en otros productos.",
  },
  hechos: {
    titulo: "Todavía no se cerró nada",
    texto: "Un error queda hecho cuando Dolphin lo vuelve a probar y ya no pasa: no lo cierra nadie a mano.",
  },
  anotados: { titulo: "Nada anotado todavía", texto: "Lo que mandes al tablero queda acá, y la tarjeta espera en Ideas." },
  rechazados: { titulo: "No rechazaste nada", texto: "Lo que rechaces queda acá y no vuelve a aparecer." },
};

function Vacia({ filtro }: { filtro: Filtro }) {
  const { titulo, texto } = VACIA[filtro];
  return (
    <Empty className="py-14">
      <EmptyHeader>
        <EmptyMedia variant="icon">
          <Inbox aria-hidden="true" />
        </EmptyMedia>
        <EmptyTitle>{titulo}</EmptyTitle>
        <EmptyDescription>{texto}</EmptyDescription>
      </EmptyHeader>
      {filtro === "abiertos" && (
        // Qué hacer ahora: los dos comandos que llenan la bandeja.
        <EmptyContent className="items-stretch">
          {[
            ["npm run explorar -- --url http://localhost:3000", "recorre tu app y anota lo que no anda"],
            ["npm run ideas", "busca qué hacen otros y trae ideas con fuentes"],
          ].map(([comando, para]) => (
            <div key={comando} className="bg-card flex items-center gap-3 rounded-2xl px-3 py-2 text-left">
              <div className="min-w-0 flex-1">
                <code className="text-foreground/90 block font-mono text-xs break-all">
                  {comando}
                </code>
                <span className="text-muted-foreground text-[12px]">{para}</span>
              </div>
              <BotonCopiar alCopiar={() => navigator.clipboard.writeText(comando!).then(() => true, () => false)} rotulo="Copiar" chico />
            </div>
          ))}
        </EmptyContent>
      )}
    </Empty>
  );
}

/** Mientras se lee: la forma de las filas, no un texto suelto. */
function Leyendo() {
  return (
    <ul aria-busy="true" aria-label="Leyendo la bandeja" className="bg-card w-full space-y-0.5 rounded-3xl p-1.5 lg:max-w-[380px]">
      {Array.from({ length: 3 }, (_, i) => (
        <li key={i} className="flex gap-3 rounded-2xl px-3 py-3">
          <Skeleton className="size-4 flex-none rounded-full" />
          <div className="flex-1 space-y-2 pt-0.5">
            <Skeleton className="h-4 w-2/3" />
            <Skeleton className="h-3 w-11/12" />
          </div>
        </li>
      ))}
    </ul>
  );
}

function dominio(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return "";
  }
}

/** El agente con su nombre de marca: «codex» a secas en una frase se lee como un error. */
function nombreDelAgente(agente: string): string {
  return ({ claude: "Claude", codex: "Codex", antigravity: "Antigravity" } as Record<string, string>)[agente] ?? agente;
}

function horaDePausa(iso: string): string {
  return new Intl.DateTimeFormat("es-AR", { hour: "2-digit", minute: "2-digit", hour12: false }).format(new Date(iso));
}
