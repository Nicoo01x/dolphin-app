import { Check, Database, X } from "lucide-react";
import type { Candidato, Cosecha } from "@/lib/tipos";
import {
  costoDeRama,
  DICE_DE_FASE,
  escalonesDe,
  estadoDe,
  fasesSalteadas,
  iconoDeArchivo,
  logoDeModelo,
  motivoDe,
  plata,
  plataDe,
  portonDe,
  reloj,
  sinLasSalteadas,
  tocoLosTests,
  type Escalon,
  type EstadoDeFase,
} from "@/lib/datos";
import { cn } from "@/lib/utils";
import { conTono } from "./Pagina";

/**
 * Las ramas de la cosecha, como una lista de trabajo profesional: una
 * sola superficie, filas alineadas, y en cada una el autor con su foto,
 * el estado de la rama, el resumen que el agente dejó al terminar, los
 * archivos con el ícono de su lenguaje y las métricas en columna fija.
 * El color señala; no grita.
 */
export function Ramas({
  cosecha,
  elegido,
  alElegir,
  fases,
  haciendo = {},
  colaVivo,
}: {
  cosecha: Cosecha;
  elegido: string | null;
  alElegir: (id: string) => void;
  fases?: Escalon[];
  haciendo?: Record<string, string>;
  colaVivo?: Record<string, string>;
}) {
  const escalones = fases ?? escalonesDe(cosecha);

  if (cosecha.candidatos.length === 0) {
    return <p className="text-muted-foreground px-5 py-6 text-[13px]">Esta cosecha no tiene ramas.</p>;
  }

  return (
    <div className="bg-secondary/40 space-y-1 rounded-3xl p-1.5">
      {cosecha.candidatos.map((c) => (
        <Fila
          key={c.universo.id}
          c={c}
          cosecha={cosecha}
          escalones={escalones}
          esElegida={c.universo.id === elegido}
          alElegir={alElegir}
          corriendo={haciendo[c.universo.id]}
          vivo={colaVivo?.[c.universo.id]}
        />
      ))}
    </div>
  );
}

function Fila({
  c,
  cosecha,
  escalones,
  esElegida,
  alElegir,
  corriendo,
  vivo,
}: {
  c: Candidato;
  cosecha: Cosecha;
  escalones: Escalon[];
  esElegida: boolean;
  alElegir: (id: string) => void;
  corriendo?: string;
  vivo?: string;
}) {
  const estado = estadoDe(c, cosecha);
  const logo = logoDeModelo(c.modelo);
  const resumen = c.contrato?.resumen;
  const rama = c.universo.rama || c.universo.id;
  const ms = (c.msAgente ?? 0) + c.pasadas.reduce((n, p) => n + p.ms, 0);
  const gastado = costoDeRama(c);

  return (
    <button
      type="button"
      data-rama={c.universo.id}
      aria-pressed={esElegida}
      onClick={() => alElegir(c.universo.id)}
      className={cn(
        // La que estás mirando se ve por tono; «elegida» es un chip, no un borde. El foco, adentro: la tarjeta recorta.
        "relative grid w-full cursor-pointer grid-cols-[auto_minmax(0,1fr)_auto] gap-x-3.5 rounded-2xl px-4 py-3.5 text-left transition-colors duration-100 focus-visible:-outline-offset-2 max-[640px]:grid-cols-[auto_minmax(0,1fr)]",
        esElegida ? "ficha" : "hover:bg-secondary/60",
      )}
    >
      <span className="bg-background mt-0.5 inline-flex size-7 flex-none items-center justify-center rounded-full">
        <img src={logo.src} alt={logo.nombre} className="size-4" loading="lazy" />
      </span>

      <span className="min-w-0">
        {/* flex-wrap: en angosto los chips bajan de línea, el nombre no se come. */}
        <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
          <span className="truncate font-mono text-[13px] font-semibold tracking-tight">{rama}</span>
          <EstadoChip estado={estado} c={c} corriendo={corriendo} vivo={vivo} />
          <Marcas c={c} cosecha={cosecha} />
        </span>
        <span className="text-muted-foreground mt-0.5 block text-[12px]">
          {c.modelo ?? logo.nombre}
          {c.enfoque ? ` · ${c.enfoque}` : ""}
        </span>

        {estado === "corto" ? (
          <span className="mt-1.5 flex min-w-0 items-center gap-1.5 text-[13px]">
            <X aria-hidden="true" className="text-murio size-3.5 flex-none" />
            <span className="text-foreground/70 truncate" title={c.porQue ?? ""}>
              {c.porQue ? motivoDe(c.porQue, c.murioEn ?? "") : "se cortó"}
            </span>
          </span>
        ) : resumen ? (
          <span className="text-foreground/85 mt-1.5 line-clamp-2 text-[13px] leading-snug break-words">
            {resumen}
          </span>
        ) : null}

        <Archivos c={c} className="mt-2" />
      </span>

      {/* Las métricas, alineadas en su propia columna: el ojo escanea. En
          angosto bajan abajo del contenido, o el resumen queda en una
          palabra por renglón. */}
      <span className="flex flex-none flex-col items-end gap-1.5 pt-0.5 max-[640px]:col-start-2 max-[640px]:mt-2.5 max-[640px]:flex-row max-[640px]:flex-wrap max-[640px]:items-center max-[640px]:justify-between max-[640px]:gap-x-3">
        <Tira c={c} escalones={escalones} corriendo={corriendo} />
        <span className="text-muted-foreground font-mono text-[12px] whitespace-nowrap tabular-nums">
          {c.vivo && c.forma ? (
            <>
              <span className="text-paso">+{c.forma.agregadas}</span>{" "}
              <span className="text-murio">−{c.forma.quitadas}</span>
              <span className="text-muted-foreground/50 mx-1.5">·</span>
            </>
          ) : null}
          {ms > 0 ? reloj(ms) : "—"}
          {(gastado > 0 || c.costoDesconocido) && !cosecha.suscripcion && (
            <>
              <span className="text-muted-foreground/50 mx-1.5">·</span>
              {plataDe(gastado, c.costoDesconocido)}
            </>
          )}
        </span>
      </span>
    </button>
  );
}

/** Lo que hay que ver de una rama antes de mergearla: si cambió tests que ya existían, y si salió de la caché. */
export function Marcas({ c, cosecha }: { c: Candidato; cosecha: Cosecha }) {
  return (
    <>
      {c.vivo && tocoLosTests(c.forma) && (
        <span
          title={
            c.forma?.testsCambiados?.length
              ? `Cambió pruebas que ya existían: ${c.forma.testsCambiados
                  .map((t) => `${t.borrado ? `borró ${t.ruta}` : `${t.ruta} (−${t.quitadas})`}${t.asercionesQuitadas ? `; sacó ${t.asercionesQuitadas} expect/assert` : ""}`)
                  .join(", ")}. Puede ser legítimo (la tarea era de tests), pero es el truco clásico para ponerse verde: mirarlo antes de mergear.`
              : "Esta rama modificó archivos de test. Puede ser legítimo (la tarea era de tests) — pero mejor mirarlo: es el truco clásico para ponerse verde."
          }
          className="con-tono inline-flex flex-none items-center rounded-xl px-2 py-0.5 text-[12px] font-medium" style={conTono("var(--revisar)")}
        >
          {c.forma?.testsCambiados?.length ? "cambió tests existentes" : "tocó los tests"}
        </span>
      )}
      {c.vivo && c.forma?.trampas && c.forma.trampas.length > 0 && (
        <span
          title={c.forma.trampas.map((h) => `${h.archivo}:${h.linea} — ${h.detalle}`).join("\n")}
          className="con-tono inline-flex flex-none items-center rounded-xl px-2 py-0.5 text-[12px] font-medium" style={conTono("var(--murio)")}
        >
          detectó trampas ({c.forma.trampas.length})
        </span>
      )}
      {/* «reusada» y no «de memoria»: se confundía con la vista Memoria, que es otra cosa. */}
      {c.deCache && (
        <span
          title={
            cosecha.suscripcion
              ? "La misma tarea sobre el mismo código ya se había escrito: salió de la caché, sin gastar un token."
              : c.ahorro !== undefined
                ? `La misma tarea sobre el mismo código ya se había escrito: salió de la caché y ahorró ${plata(c.ahorro)}.`
                : "La misma tarea sobre el mismo código ya se había escrito: salió de la caché, sin gastar un token."
          }
          className="text-muted-foreground bg-secondary inline-flex flex-none items-center gap-1 rounded-xl px-2 py-0.5 text-[12px] font-medium"
        >
          <Database aria-hidden="true" className="size-3" />
          reusada
        </span>
      )}
    </>
  );
}

/** Los archivos que tocó, con su ícono y lo que sumó y sacó: hasta cinco, y cuántos más. */
export function Archivos({ c, className }: { c: Candidato; className?: string }) {
  const tocados = c.forma?.tocados ?? [];
  if (tocados.length === 0) return null;
  return (
    <span className={cn("flex flex-wrap items-center gap-x-3.5 gap-y-1", className)}>
      {tocados.slice(0, 5).map((a) => {
        const icono = iconoDeArchivo(a.ruta);
        const nombre = a.ruta.split("/").pop() ?? a.ruta;
        return (
          <span key={a.ruta} className="flex min-w-0 items-center gap-1.5 text-[12px]" title={a.ruta}>
            {icono.src ? (
              <img src={icono.src} alt={icono.rotulo} className="size-3 flex-none" loading="lazy" />
            ) : (
              <span className="bg-secondary text-muted-foreground flex-none rounded-full px-1.5 font-mono text-[12px] leading-4 font-semibold">
                {icono.rotulo}
              </span>
            )}
            <span className="text-foreground/65 max-w-[20ch] truncate font-mono">{nombre}</span>
            <span className="text-muted-foreground flex-none font-mono tabular-nums">
              <span className="text-paso">+{a.agregadas}</span> <span className="text-murio">−{a.quitadas}</span>
            </span>
          </span>
        );
      })}
      {tocados.length > 5 && <span className="text-muted-foreground text-[12px]">+{tocados.length - 5}</span>}
    </span>
  );
}

/**
 * Un chip de estado, con su color de siempre (app.css): pasó = paso, se cortó = murio, trabajando
 * ahora = corriendo, te espera a vos (elegida, a medias) = revisar. Sin tono, el gris de lo neutro.
 */
export function Chip({ tono, children, className, title }: { tono?: string; children: React.ReactNode; className?: string; title?: string }) {
  return (
    <span
      title={title}
      className={cn(
        "inline-flex flex-none items-center gap-1 rounded-xl px-2 py-0.5 text-[12px] font-medium tabular-nums",
        tono ? "con-tono" : "text-muted-foreground bg-secondary",
        className,
      )}
      style={tono ? conTono(tono) : undefined}
    >
      {children}
    </span>
  );
}

function EstadoChip({
  estado,
  c,
  corriendo,
  vivo,
}: {
  estado: "elegido" | "paso" | "corto";
  c: Candidato;
  corriendo?: string;
  vivo?: string;
}) {
  // En vivo, el estado ES lo que está haciendo ahora.
  if (vivo !== undefined && c.vivo) {
    return (
      <Chip {...(corriendo ? { tono: "var(--corriendo)" } : {})}>
        {corriendo && <span aria-hidden="true" className="bg-corriendo size-1.5 animate-pulse rounded-full" />}
        {vivo}
      </Chip>
    );
  }

  // Sin fases no hubo prueba: la rama pasó porque no había nada que pasar.
  const sinProbar = c.vivo && c.pasadas.length === 0;
  // Y con una fase que no corrió, pasó lo que corrió: se dice qué faltó. No es verde (no terminó
  // bien del todo) ni ámbar (no está trabajando): te toca mirarla, como a la elegida.
  const salteadas = c.vivo ? fasesSalteadas(c) : [];
  const aMedias = sinProbar || salteadas.length > 0;
  const falta = sinProbar ? "sin probar" : sinLasSalteadas(salteadas);
  if (estado === "elegido") {
    return (
      <Chip tono="var(--revisar)">
        <Check aria-hidden="true" className="size-3" />
        {aMedias ? `elegida, ${falta}` : "elegida"}
      </Chip>
    );
  }
  if (estado === "paso" && aMedias) return <Chip tono="var(--revisar)">{sinProbar ? "sin probar" : `probada, ${falta}`}</Chip>;
  if (estado === "paso") return <Chip tono="var(--paso)">probada</Chip>;
  return <Chip tono="var(--murio)">se cortó en {c.murioEn ?? "el testing"}</Chip>;
}

const SEGMENTO: Record<EstadoDeFase, string> = {
  paso: "bg-paso/60",
  corto: "bg-murio/70",
  nollego: "bg-secondary",
  // No corrió: hueco, ni verde ni rojo.
  salteada: "ring-muted-foreground/70 ring-1 ring-inset",
  corriendo: "celda-corriendo",
};

/** Las fases como segmentos finos, para comparar ramas de un vistazo: se leen, no mandan. */
function Tira({ c, escalones, corriendo }: { c: Candidato; escalones: Escalon[]; corriendo?: string }) {
  return (
    <span className="flex flex-none items-center gap-1">
      {portonDe(c, escalones, corriendo)
        .flat()
        .map((f) => {
          // Para quien no ve el color, el estado; el motivo ya está escrito en la fila.
          const dice = `${f.nombre}: ${DICE_DE_FASE[f.estado]}${f.vueltas > 1 ? `, tras ${f.vueltas} vueltas` : ""}`;
          return (
            <span
              key={f.nombre}
              title={f.dijo ? `${f.nombre}: ${f.dijo}` : dice}
              className={cn("relative h-[5px] w-[16px] rounded-full", SEGMENTO[f.estado])}
            >
              {f.vueltas > 1 && (
                <span
                  aria-hidden="true"
                  className={cn(
                    "absolute -top-3.5 left-1/2 -translate-x-1/2 font-mono text-[12px] leading-none font-bold",
                    f.estado === "paso" ? "text-paso" : "text-murio",
                  )}
                >
                  ×{f.vueltas}
                </span>
              )}
              <span className="sr-only">{dice}</span>
            </span>
          );
        })}
    </span>
  );
}
