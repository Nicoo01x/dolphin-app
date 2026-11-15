import { BotonCopiar } from "./BotonCopiar";
import { AccionesDeRama } from "./AccionesDeRama";
import { Porton } from "./Porton";
import type { Candidato, Cosecha, EstadoDeRama } from "@/lib/tipos";
import { escalonesDe, estadoDe, plata, tokensEnPalabras, type Escalon } from "@/lib/datos";
import { conProyecto } from "@/lib/api";

/** El panel de la rama que estás mirando: lo que hay que hacer con ella y lo que no está dicho en otro lado. */
export function Detalle({
  cosecha,
  candidato,
  conWorktree,
  alCopiarRuta,
  estadoTexto,
  enVivo = false,
  estadoRama,
  alRama,
  puedePr = false,
  pideAprobacion,
  ocultarPorton = false,
  escalones,
  corriendo,
}: {
  cosecha: Cosecha;
  candidato: Candidato | null;
  conWorktree: ReadonlySet<string>;
  alCopiarRuta: (ruta: string) => Promise<boolean>;
  /** En vivo, el estado lo dicta la siembra («escribiendo…», «en test»). */
  estadoTexto?: string;
  enVivo?: boolean;
  /** Lo que dice git de la rama elegida, si se entregó. */
  estadoRama?: EstadoDeRama;
  alRama?: (accion: "mergear" | "descartar" | "pr", aprobado?: boolean) => Promise<string | null>;
  /** Hay un remoto adonde subir la rama: se puede abrir un PR. */
  puedePr?: boolean;
  /** Con la política «aprobar»: por qué la rama necesita tu visto bueno. */
  pideAprobacion?: string;
  /** El portón ya está dibujado en otro lado (con una sola rama, bajo el veredicto). */
  ocultarPorton?: boolean;
  /** Las fases de la siembra; en vivo, las que van apareciendo. */
  escalones?: Escalon[];
  /** La fase que está corriendo ahora, en vivo. */
  corriendo?: string;
}) {
  if (!candidato) {
    return (
      <aside aria-label="Rama">
        <header className="px-4 pt-5 pb-3">
          <h2 className="titulo-seccion">Rama</h2>
        </header>
        <p className="text-muted-foreground px-4 text-[13px]">
          {cosecha.candidatos.length === 0 ? "Esta siembra no tiene ramas que mirar." : "Elegí una rama de la lista."}
        </p>
      </aside>
    );
  }

  const c = candidato;
  const estado = estadoDe(c, cosecha);
  const hayWorktree = conWorktree.has(c.universo.id);
  const sola = cosecha.candidatos.length === 1;
  // Cada dato, una vez: el veredicto, la plata y el tiempo los dice la cabecera (o la fila de la
  // rama), el modelo la fila o el reparto, los archivos su lista. Acá queda lo que no está en otro lado.
  // El porqué, solo si agrega algo: con una rama casi siempre repite el veredicto de arriba.
  const porQue =
    estado === "elegido" && cosecha.porQueGano && cosecha.porQueGano !== "Pasó todas las fases." && (!sola || c.pasadas.length === 0)
      ? cosecha.porQueGano
      : undefined;
  const dependencias = c.forma?.dependenciasNuevas ?? 0;

  return (
    <aside aria-label={`Rama ${c.universo.rama || c.universo.id}`} className="flex h-full min-h-0 flex-col overflow-auto">
      <header className="flex items-baseline justify-between gap-2 px-4 pt-5 pb-2">
        <h2 className="titulo-seccion">{sola ? "La rama" : "Esta rama"}</h2>
        {/* En vivo, lo que está haciendo; terminada, el estado ya lo dice el veredicto o el chip de su fila. */}
        {estadoTexto && <span className="text-muted-foreground text-[12px]">{estadoTexto}</span>}
      </header>

      {dependencias > 0 && (
        // Antes de mergear te toca mirarlo: el color de «para revisar».
        <p className="text-revisar px-4 pb-2 text-[12px]">
          Suma {dependencias} {dependencias === 1 ? "dependencia nueva" : "dependencias nuevas"}: es lo que más pesa
          al mergear.
        </p>
      )}

      {!enVivo && c.tokens && (
        <p className="text-muted-foreground px-4 pb-2 text-[12px] tabular-nums" title="Lo que informó el motor">
          {tokensEnPalabras(c.tokens)}
        </p>
      )}

      {!enVivo && c.correcciones && c.correcciones.length > 0 && (
        <p className="text-muted-foreground px-4 pb-2 text-[12px]">{cuentaDelAgente(c, !cosecha.suscripcion)}</p>
      )}

      {porQue && <p className="ficha text-foreground/85 mx-4 my-2 rounded-2xl px-3.5 py-2.5 text-[13px] leading-snug">{porQue}</p>}

      {estado === "elegido" && cosecha.entregada && estadoRama && alRama && (
        <AccionesDeRama
          entregada={cosecha.entregada}
          estado={estadoRama}
          alRama={alRama}
          sinProbar={candidato.pasadas.length === 0}
          puedePr={puedePr}
          {...(cosecha.pr ? { pr: cosecha.pr } : {})}
          {...(pideAprobacion ? { pideAprobacion } : {})}
        />
      )}

      <div className="px-4 py-3">
        {/* Con una sola rama, el portón va arriba, bajo el veredicto: acá no se repite. */}
        {!ocultarPorton && (
          <>
            <h3 className="titulo-seccion mb-2">El portón</h3>
            {c.pasadas.length === 0 && !corriendo ? (
              <p className="text-muted-foreground text-[13px]">
                {enVivo ? "Arranca apenas termine de escribir." : "No corrió ninguna fase."}
              </p>
            ) : (
              <Porton c={c} escalones={escalones ?? escalonesDe(cosecha)} {...(corriendo ? { corriendo } : {})} />
            )}
          </>
        )}
        {/* Lo que vio la persona que encontró el problema, grabado: se mira acá mismo. */}
        {c.pasadas
          .flatMap((p) => p.videos ?? [])
          .map((video) => (
            <figure key={video} className="mt-3">
              <video
                src={conProyecto(`/videos/${encodeURIComponent(video)}`)}
                // La portada: la captura con el problema resaltado, antes de darle play.
                poster={conProyecto(`/videos/${encodeURIComponent(video.replace(/\.webm$/, ".png"))}`)}
                controls
                preload="metadata"
                className="bg-secondary aspect-[9/16] max-h-[360px] w-full rounded-2xl object-contain"
              />
              <figcaption className="text-muted-foreground mt-1 truncate text-[12px]" title={video}>
                {quienLoVio(video)}
              </figcaption>
            </figure>
          ))}
      </div>

      <div className="mt-auto px-4 pt-2 pb-5">
        {enVivo ? null : hayWorktree ? (
          <>
            <BotonCopiar alCopiar={() => alCopiarRuta(c.universo.ruta)} rotulo="Copiar la ruta" />
            {/* El final de la ruta, que es lo que la distingue; entera, al pasar el mouse y al copiarla. */}
            <p className="text-muted-foreground mt-2 truncate font-mono text-[12px]" title={c.universo.ruta}>
              {finDeRuta(c.universo.ruta)}
            </p>
          </>
        ) : (
          <p className="text-muted-foreground text-[12px]">
            Su worktree ya se limpió. Para que queden todas, prendé «Guardar el código de todas las ramas» en Nueva (o{" "}
            <code className="bg-secondary text-foreground/80 rounded-xl px-1.5 py-0.5">--sucio</code> en la terminal).
          </p>
        )}
      </div>
    </aside>
  );
}

/** «Escribió por US$ 0,12; corrigió «test» retomando su sesión por US$ 0,02»: lo mismo que dice el parte. */
function cuentaDelAgente(c: Candidato, conPlata: boolean): string {
  const vueltas = c.correcciones ?? [];
  const escribir = Math.max(0, (c.gastadoAgente ?? 0) - vueltas.reduce((n, v) => n + v.gastado, 0));
  // De la memoria de respuestas no costó nada, pero «por US$ 0» diría que escribir es gratis.
  const escribio = c.deCache
    ? `Escribió de memoria${conPlata && c.ahorro ? ` (ahorró ${plata(c.ahorro)})` : ""}`
    : conPlata && !c.costoDesconocido
      ? `Escribió por ${plata(escribir)}`
      : conPlata
        ? "Escribió sin informar su costo"
        : "Escribió";
  return [
    escribio,
    ...vueltas.map((v) => {
      const como = v.cayo ? "y se cayó" : v.reanudada ? "retomando su sesión" : "de cero";
      return `corrigió «${v.fase}» ${como}${conPlata && !v.costoDesconocido ? ` por ${plata(v.gastado)}` : ""}`;
    }),
  ].join("; ");
}

/** «u1-pulgar-alta-1792….webm» → «Lo que vio pulgar en alta». */
function quienLoVio(video: string): string {
  const [, persona, ...resto] = video.replace(/\.webm$/, "").split("-");
  const pantalla = resto.slice(0, -1).join("-");
  return `Lo que vio ${persona ?? "la persona"}${pantalla ? ` en ${pantalla}` : ""}`;
}

/** «C:\Users\…\Temp\dolphin-O74FYI\u1» → «…\dolphin-O74FYI\u1». */
function finDeRuta(ruta: string): string {
  const separador = ruta.includes("\\") ? "\\" : "/";
  const partes = ruta.split(/[\\/]/).filter(Boolean);
  return partes.length > 2 ? `…${separador}${partes.slice(-2).join(separador)}` : ruta;
}
