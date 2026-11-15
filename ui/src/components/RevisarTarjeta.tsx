import { useCallback, useEffect, useState } from "react";
import { Check, FlaskConical, GitBranch, Undo2 } from "lucide-react";
import {
  devolverTarjeta,
  integrarTarjeta,
  marcarLineaDeTarjeta,
  probarRamaDeTarjeta,
  traerCambiosDeTarjeta,
  type CambiosDeLaRama,
  type RamaProbada,
  type Tarjeta,
} from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { LineasDiff, type MarcaDeLinea } from "./Diff";
import { LoQueCorrio } from "./LoQueCorrio";
import { Aviso, Seccion } from "./Pagina";
import { Preview } from "./Preview";

/**
 * Revisar la rama de una tarjeta sin salir de la tarjeta (Nico, 31/10: «que lo tenga integrado
 * directamente»): lo que cambió, y ahí mismo integrar o devolver.
 *
 * Antes la tarjeta te mandaba a la vista Git a buscar la rama y volver: cosechar era una puerta
 * aparte. Acá se decide en el mismo lugar donde se anotó.
 */

type Estado =
  | { que: "cargando" }
  | { que: "error"; porQue: string }
  | { que: "sinRama"; porQue: string }
  | { que: "listo"; cambios: CambiosDeLaRama };

export function RevisarTarjeta({ tarjeta: t, alCambiar }: { tarjeta: Tarjeta; alCambiar: (t: Tarjeta) => void }) {
  const [estado, setEstado] = useState<Estado>({ que: "cargando" });
  const [abierto, setAbierto] = useState(false);
  const [devolviendo, setDevolviendo] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);
  const [porQueNo, setPorQueNo] = useState<string | null>(null);
  const [noLaRegla, setNoLaRegla] = useState<string | null>(null);
  const [probando, setProbando] = useState(false);
  const [probada, setProbada] = useState<RamaProbada | null>(null);

  // Las marcas que ya tiene la tarjeta, de los comentarios que apuntan a una línea.
  const marcas: MarcaDeLinea[] = t.comentarios.flatMap((c) =>
    c.donde ? [{ archivo: c.donde.archivo, linea: c.donde.linea, texto: c.texto, quien: c.quien }] : [],
  );

  const cargar = useCallback(() => {
    setEstado({ que: "cargando" });
    traerCambiosDeTarjeta(t.id).then(
      (r) => setEstado(r.cambios ? { que: "listo", cambios: r.cambios } : { que: "sinRama", porQue: r.porQue ?? "la rama ya no está" }),
      (e: unknown) => setEstado({ que: "error", porQue: e instanceof Error ? e.message : String(e) }),
    );
  }, [t.id]);
  useEffect(cargar, [cargar]);

  /**
   * Cruzar la rama por el portón antes de integrarla. Mirar un diff no dice si los tests pasan, y
   * esto corre en un worktree aparte: no toca tu árbol de trabajo y solo corre las fases gratis.
   */
  const probar = async () => {
    setProbando(true);
    setPorQueNo(null);
    try {
      setProbada(await probarRamaDeTarjeta(t.id));
    } catch (e) {
      setPorQueNo(e instanceof Error ? e.message : String(e));
    } finally {
      setProbando(false);
    }
  };

  const hacer = async (que: () => Promise<Tarjeta>) => {
    setEnviando(true);
    setPorQueNo(null);
    try {
      alCambiar(await que());
    } catch (e) {
      setPorQueNo(e instanceof Error ? e.message : String(e));
    } finally {
      setEnviando(false);
    }
  };

  if (estado.que === "cargando") {
    return (
      <Seccion titulo="Lo que hizo">
        <Skeleton className="h-24 rounded-2xl" />
      </Seccion>
    );
  }
  if (estado.que === "error") {
    return (
      <Seccion titulo="Lo que hizo">
        <Aviso alReintentar={cargar}>No pude leer la rama: {estado.porQue}</Aviso>
      </Seccion>
    );
  }
  if (estado.que === "sinRama") {
    return (
      <Seccion titulo="Lo que hizo">
        <Aviso>{estado.porQue}. Para volver a intentarla, movela a Para hacer.</Aviso>
      </Seccion>
    );
  }

  const { cambios } = estado;
  const total = cambios.archivos.reduce((n, a) => n + a.agregadas + a.quitadas, 0);
  const yaEsta = cambios.estado === "mergeada";

  return (
    <Seccion
      titulo="Lo que hizo"
      extra={`${cambios.archivos.length} ${cambios.archivos.length === 1 ? "archivo" : "archivos"} · ${total} ${total === 1 ? "línea" : "líneas"}`}
    >
      <div className="bg-secondary/60 flex flex-col gap-3 rounded-2xl p-3.5">
        <div className="flex items-center gap-2.5">
          <GitBranch aria-hidden="true" className="text-muted-foreground size-4 flex-none" />
          <code className="min-w-0 flex-1 truncate font-mono text-[13px]" title={cambios.rama}>
            {cambios.rama}
          </code>
          {yaEsta && <span className="text-paso flex-none text-[12px] font-medium">ya integrada</span>}
        </div>

        <ul className="flex flex-col gap-1">
          {cambios.archivos.map((a) => (
            <li key={a.archivo} className="flex items-baseline gap-2 text-[13px]">
              <code className="min-w-0 flex-1 truncate font-mono" title={a.archivo}>
                {a.archivo}
              </code>
              <span className="flex-none tabular-nums">
                {a.agregadas > 0 && <span className="text-paso">+{a.agregadas}</span>}{" "}
                {a.quitadas > 0 && <span className="text-murio">−{a.quitadas}</span>}
              </span>
            </li>
          ))}
        </ul>

        {/* Lo que se ejecutó, no lo que el agente dice que ejecutó (ver nucleo/bitacora.ts). */}
        <LoQueCorrio corrido={cambios.corrido} />

        {/* Y cómo quedó la pantalla: un diff no dice si se ve bien. Desde acá se puede tocar un
            elemento y pedir el cambio sobre ese elemento. */}
        {!yaEsta && <Preview rama={cambios.rama} />}

        {/* El diff entero no se abre solo: lo primero que se mira es qué archivos tocó. */}
        <button
          type="button"
          onClick={() => setAbierto((x) => !x)}
          aria-expanded={abierto}
          className="presionable text-muted-foreground hover:text-foreground self-start text-[12px]"
        >
          {abierto ? "Ocultar los cambios" : "Ver los cambios"}
        </button>
        {abierto && (
          <div className="bg-background max-h-[420px] overflow-auto rounded-xl p-3 font-mono text-[12px] leading-relaxed">
            <LineasDiff
              texto={cambios.diff}
              marcas={marcas}
              {...(noLaRegla ? { noLaRegla } : {})}
              alMarcar={async (m) => {
                setNoLaRegla(null);
                const r = await marcarLineaDeTarjeta(t.id, m);
                setNoLaRegla(r.porQueNoLaRegla ?? null);
                alCambiar(r.tarjeta);
              }}
            />
            {cambios.recortado && <p className="text-muted-foreground mt-2">El diff sigue: está recortado para que la tarjeta no se trabe.</p>}
          </div>
        )}

        {porQueNo && <Aviso>{porQueNo}</Aviso>}

        {devolviendo === null ? (
          <div className="flex flex-wrap items-center gap-2">
            {!yaEsta && (
              <Button onClick={() => void hacer(() => integrarTarjeta(t.id))} disabled={enviando || probando}>
                <Check aria-hidden="true" /> Integrar y dar por hecha
              </Button>
            )}
            {!yaEsta && (
              <Button variant="secondary" onClick={() => void probar()} disabled={enviando || probando}>
                <FlaskConical aria-hidden="true" /> {probando ? "Probando…" : "Probar la rama"}
              </Button>
            )}
            <Button variant="ghost" onClick={() => (marcas.length > 0 ? void hacer(() => devolverTarjeta(t.id, "")) : setDevolviendo(""))} disabled={enviando}>
              <Undo2 aria-hidden="true" /> {marcas.length > 0 ? `Devolver con ${marcas.length === 1 ? "la marca" : `las ${marcas.length} marcas`}` : "Devolver"}
            </Button>
            {marcas.length > 0 ? (
              <span className="text-muted-foreground text-[12px]">Lo que marcaste en el diff es lo que va a leer quien la retome.</span>
            ) : (
              !yaEsta && <span className="text-muted-foreground text-[12px]">Integrar la mergea en tu rama de verdad.</span>
            )}
          </div>
        ) : null}

        {probada && (
          <div className="bg-secondary/60 mt-3 rounded-2xl px-3 py-2.5">
            <p className="text-[13px] font-medium">{probada.paso ? "Cruzó el portón." : `Rebotó en ${probada.rebote?.fase ?? "una fase"}.`}</p>
            <ul className="mt-1.5 flex flex-col gap-1">
              {probada.fases.map((f) => (
                <li key={f.nombre} className="text-muted-foreground flex gap-2 text-[12px] leading-snug">
                  <span aria-hidden="true">{f.salteada ? "·" : f.paso ? "✓" : "✖"}</span>
                  <span className="min-w-0">
                    <b className="text-foreground font-medium">{f.nombre}</b> {f.detalle}
                  </span>
                </li>
              ))}
            </ul>
            {probada.sinCorrerPorqueCuestan && probada.sinCorrerPorqueCuestan.length > 0 && (
              // Decirlo importa: «pasó» acá no es «pasó entero», y que una prueba a pedido gaste
              // plata a espaldas de quien paga es justo lo que no queremos.
              <p className="text-muted-foreground mt-2 text-[12px]">No corrieron porque cuestan: {probada.sinCorrerPorqueCuestan.join(", ")}.</p>
            )}
          </div>
        )}

        {devolviendo !== null && (
          <div className="flex flex-col gap-2">
            <textarea
              value={devolviendo}
              onChange={(ev) => setDevolviendo(ev.target.value)}
              rows={2}
              maxLength={2000}
              autoFocus
              aria-label="Qué hay que cambiar"
              placeholder="Qué hay que cambiar: le falta el encabezado del CSV…"
              className="bg-background placeholder:text-muted-foreground w-full resize-none rounded-xl px-3 py-2 text-[13px] [field-sizing:content]"
            />
            <div className="flex flex-wrap items-center gap-2">
              <Button
                onClick={() => void hacer(() => devolverTarjeta(t.id, devolviendo))}
                disabled={enviando || devolviendo.trim().length === 0}
              >
                Devolver a Para hacer
              </Button>
              <Button variant="ghost" onClick={() => setDevolviendo(null)} disabled={enviando}>
                Cancelar
              </Button>
              <span className="text-muted-foreground text-[12px]">La rama se va y esto es lo que va a leer quien la retome.</span>
            </div>
          </div>
        )}
      </div>
    </Seccion>
  );
}
