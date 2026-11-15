import { useEffect, useMemo, useState, type ReactNode } from "react";
import { ArrowUpRight, Brain, Bug, CalendarClock, Check, GitMerge, GitPullRequest, History, Lightbulb, Sprout, X } from "lucide-react";
import { Empty, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty";
import { Aviso } from "./Pagina";
import { Skeleton } from "@/components/ui/skeleton";
import type { Actividad } from "@/lib/api";
import type { EstadoActividad } from "@/lib/use-actividad";
import { logoDeModelo, motivoLegible } from "@/lib/datos";
import { seccionDe } from "@/lib/secciones";
import { cn } from "@/lib/utils";
import { Shell } from "./widgets";

/**
 * La actividad del proyecto en En vivo: qué sembró, qué encontró, qué
 * aprendió y qué hiciste vos. Una lista por día, como el resto de la
 * consola: Nico no quiere líneas de tiempo («lo de la línea del tiempo no
 * lo quiero»), así que acá no hay línea, ni marcadores encadenados. Cada
 * fila dice el resultado con palabras; el color del ícono solo lo acompaña.
 */

const ICONOS: Record<Actividad["tipo"], ReactNode> = {
  siembra: <Sprout />,
  pr: <GitPullRequest />,
  merge: <GitMerge />,
  descarte: <X />,
  idea: <Lightbulb />,
  error: <Bug />,
  arreglo: <Check />,
  turno: <CalendarClock />,
  memoria: <Brain />,
};

/** El color con significado: salió bien o mal manda; si no, una idea es violeta y el resto no lleva color. */
function tonoDe(a: Actividad): string {
  if (a.tono === "bien") return "text-paso";
  if (a.tono === "mal") return "text-murio";
  return a.tipo === "idea" ? "text-idea" : "text-muted-foreground";
}

/** La hora de referencia, al día: «hace 5 min» no puede quedarse quieto. */
function useAhora(cadaMs: number): number {
  const [ahora, setAhora] = useState(() => Date.now());
  useEffect(() => {
    const reloj = window.setInterval(() => setAhora(Date.now()), cadaMs);
    return () => window.clearInterval(reloj);
  }, [cadaMs]);
  return ahora;
}

/** «hace 3 min» en la primera hora; hoy y ayer, la hora (el día ya lo dice la sección); antes, la fecha. */
function cuandoCorto(iso: string, ahora: number): string {
  const fecha = new Date(iso);
  const ms = ahora - fecha.getTime();
  if (Number.isNaN(ms)) return "";
  if (ms < 60_000) return "recién";
  if (ms < 3_600_000) return `hace ${Math.round(ms / 60_000)} min`;
  const ayer = new Date(ahora);
  ayer.setDate(ayer.getDate() - 1);
  if (fecha.toDateString() === new Date(ahora).toDateString() || fecha.toDateString() === ayer.toDateString()) {
    return fecha.toLocaleTimeString("es-AR", { hour: "2-digit", minute: "2-digit", hourCycle: "h23" });
  }
  return fecha.toLocaleDateString("es-AR", { day: "2-digit", month: "2-digit" });
}

/**
 * Si a la lista le queda algo abajo por ver: ahí, y solo ahí, el pie se desvanece. Un
 * degradado fijo sobre una lista que ya terminó parecería que falta algo.
 */
function useQuedaAbajo() {
  const [nodo, setNodo] = useState<HTMLDivElement | null>(null);
  const [queda, setQueda] = useState(false);
  useEffect(() => {
    if (!nodo) return;
    const medir = () => setQueda(nodo.scrollHeight - nodo.scrollTop - nodo.clientHeight > 2);
    medir();
    nodo.addEventListener("scroll", medir, { passive: true });
    const observador = new ResizeObserver(medir);
    observador.observe(nodo);
    for (const hijo of Array.from(nodo.children)) observador.observe(hijo);
    return () => {
      nodo.removeEventListener("scroll", medir);
      observador.disconnect();
    };
  }, [nodo]);
  return [setNodo, queda] as const;
}

const DESVANECIDO = "linear-gradient(to bottom, #000 calc(100% - 40px), transparent)";

export function WidgetActividad({
  estado,
  alAbrirCosecha,
}: {
  estado: EstadoActividad;
  alAbrirCosecha: (id: string) => void;
}) {
  const ahora = useAhora(30_000);
  const [lista, quedaAbajo] = useQuedaAbajo();
  // Por día, como Cosechas: «Hoy», «Ayer», y después la fecha.
  const dias = useMemo(() => {
    if (estado.que !== "lista") return [];
    const grupos: { dia: string; filas: Actividad[] }[] = [];
    for (const a of estado.actividad) {
      const dia = seccionDe(a.en, new Date(ahora));
      const ultimo = grupos[grupos.length - 1];
      if (ultimo?.dia === dia) ultimo.filas.push(a);
      else grupos.push({ dia, filas: [a] });
    }
    return grupos;
  }, [estado, ahora]);

  if (estado.que === "cargando") {
    return (
      <Shell titulo="Actividad">
        <div className="space-y-4" aria-busy="true" aria-label="Leyendo la actividad">
          {Array.from({ length: 4 }, (_, i) => (
            <div key={i} className="flex gap-3">
              <Skeleton className="size-4 flex-none rounded-full" />
              <div className="flex-1 space-y-1.5">
                <Skeleton className="h-3.5 w-1/2" />
                <Skeleton className="h-3 w-4/5" />
              </div>
            </div>
          ))}
        </div>
      </Shell>
    );
  }

  if (estado.que === "error") {
    return (
      <Shell titulo="Actividad">
        <Aviso className="my-auto">
          No pude leer la actividad: {motivoLegible(estado.motivo).toLowerCase()} Lo que pasó sigue en disco: cuando el servidor vuelva, aparece sola.
        </Aviso>
      </Shell>
    );
  }

  const total = dias.reduce((n, d) => n + d.filas.length, 0);
  if (total === 0) {
    return (
      <Shell titulo="Actividad">
        <Empty className="py-4">
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <History />
            </EmptyMedia>
            <EmptyTitle as="h3">Todavía no pasó nada</EmptyTitle>
          </EmptyHeader>
        </Empty>
      </Shell>
    );
  }

  return (
    <Shell titulo="Actividad" meta={`${estado.recortada ? "las últimas " : ""}${total}`}>
      {/* La tarjeta crece con la lista hasta un tope; de ahí en más scrollea, con el pie
          desvanecido mientras quede algo abajo. Apilada (embebida, teléfono) no tiene tope: ya
          scrollea la página, y dos scrolls anidados se pelean. Sus filas se tocan: sin el
          stopPropagation, apretar adentro arrastraba la tarjeta entera de la grilla. */}
      <div
        ref={lista}
        className="-mx-2 max-h-[min(560px,62vh)] min-h-0 flex-1 overflow-y-auto [scrollbar-width:thin] in-data-apilada:max-h-none"
        style={quedaAbajo ? { maskImage: DESVANECIDO, WebkitMaskImage: DESVANECIDO } : undefined}
        onPointerDown={(e) => e.stopPropagation()}
        aria-label="Actividad del proyecto"
      >
        {dias.map(({ dia, filas }) => (
          <section key={dia} aria-label={dia} className="mb-2 last:mb-0">
            <h3 className="text-muted-foreground px-2 pt-1 pb-1.5 text-[12px] font-medium">{dia}</h3>
            <ul>
              {filas.map((a) => (
                <li key={a.id}>
                  <Fila a={a} ahora={ahora} alAbrirCosecha={alAbrirCosecha} />
                </li>
              ))}
            </ul>
          </section>
        ))}
      </div>
    </Shell>
  );
}

function Fila({ a, ahora, alAbrirCosecha }: { a: Actividad; ahora: number; alAbrirCosecha: (id: string) => void }) {
  const logo = a.tipo === "siembra" && a.modelo ? logoDeModelo(a.modelo) : null;
  const contenido = (
    <>
      <span aria-hidden="true" className={cn("mt-0.5 flex size-4 flex-none items-center justify-center [&_svg]:size-4", tonoDe(a))}>
        {logo ? <img src={logo.src} alt="" className="size-3.5" loading="lazy" /> : ICONOS[a.tipo]}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-[13px] font-medium">{a.titulo}</span>
        {a.sobre && (
          // Dos renglones y no uno con «…»: en el teléfono no hay hover que muestre el title.
          <span className="text-muted-foreground line-clamp-2 block text-[12px] break-words" title={a.sobre}>
            {a.sobre}
          </span>
        )}
        {a.nota && <span className="text-muted-foreground mt-0.5 line-clamp-2 block text-[12px] break-words">{a.nota}</span>}
      </span>
      <span className="text-muted-foreground flex flex-none items-center gap-1 text-[12px] whitespace-nowrap tabular-nums">
        {cuandoCorto(a.en, ahora)}
        {a.cosecha && <ArrowUpRight aria-hidden="true" className="size-3.5 opacity-0 transition-opacity group-hover:opacity-100" />}
      </span>
    </>
  );
  const clase = "group flex w-full items-start gap-3 rounded-2xl px-2 py-2 text-left";
  // Con cosecha, la fila entera la abre; sin cosecha, es solo texto.
  return a.cosecha ? (
    <button
      type="button"
      onClick={() => alAbrirCosecha(a.cosecha!)}
      title="Abrir la cosecha"
      className={cn(clase, "hover:bg-secondary/70 cursor-pointer transition-colors duration-150")}
    >
      {contenido}
    </button>
  ) : (
    <div className={clase}>{contenido}</div>
  );
}
