import { useState } from "react";
import type { ComandoCorrido } from "@/lib/api";

/**
 * Lo que se corrió de verdad sobre la rama, con su salida y su código de salida.
 *
 * El diff muestra qué quedó escrito y el agente cuenta en su resultado qué hizo, pero eso último es
 * un texto que escribió él. Esto lo anota quien ejecuta (ver nucleo/bitacora.ts): alcanza para
 * revisar una rama sin creerle a nadie.
 *
 * El color dice el estado y nada más: verde solo para lo que terminó bien, rojo para lo que falló y
 * ámbar para lo que no llegó a terminar.
 */

const comoSeLee = (c: ComandoCorrido) => [c.cmd, ...c.args].map((p) => (/\s/.test(p) ? `"${p}"` : p)).join(" ");

/** «1,2 s» o «340 ms»: el tiempo se lee de un vistazo, sin ceros de más. */
function cuantoTardo(ms: number): string {
  if (ms < 1000) return `${ms} ms`;
  if (ms < 60_000) return `${(ms / 1000).toFixed(1).replace(".", ",")} s`;
  const minutos = Math.floor(ms / 60_000);
  return `${minutos} min ${Math.round((ms % 60_000) / 1000)} s`;
}

function Fila({ c }: { c: ComandoCorrido }) {
  const [abierto, setAbierto] = useState(false);
  const paso = c.codigo === 0;
  const color = c.codigo === null ? "bg-corriendo" : paso ? "bg-paso" : "bg-murio";
  const hay = c.salida.trim() !== "" || c.corrioComo !== undefined || c.donde !== undefined;

  return (
    <li className="bg-background/40 rounded-xl">
      <button
        type="button"
        onClick={() => setAbierto((x) => !x)}
        aria-expanded={abierto}
        disabled={!hay}
        className="presionable flex w-full items-center gap-2.5 px-2.5 py-2 text-left disabled:cursor-default"
      >
        <span aria-hidden="true" className={`size-1.5 flex-none rounded-full ${color}`} />
        <code className="min-w-0 flex-1 truncate font-mono text-[13px]" title={comoSeLee(c)}>
          {comoSeLee(c)}
        </code>
        {c.fase && <span className="bg-secondary text-muted-foreground flex-none rounded-md px-1.5 py-0.5 text-[11px]">{c.fase}</span>}
        <span className="text-muted-foreground flex-none text-[12px] tabular-nums">{cuantoTardo(c.ms)}</span>
        <span className={`flex-none text-[12px] font-medium tabular-nums ${c.codigo === null ? "text-corriendo" : paso ? "text-paso" : "text-murio"}`}>
          {c.codigo === null ? "no terminó" : `salió ${c.codigo}`}
        </span>
      </button>
      {abierto && (
        <div className="flex flex-col gap-1.5 px-2.5 pb-2.5">
          {c.salida.trim() !== "" && (
            <pre className="bg-background max-h-72 overflow-auto rounded-lg p-2.5 font-mono text-[12px] leading-relaxed whitespace-pre-wrap">
              {c.salida}
            </pre>
          )}
          {c.salidaEntera !== undefined && (
            <p className="text-muted-foreground text-[11px]">
              La salida sigue: escribió {c.salidaEntera.toLocaleString("es-AR")} caracteres y acá entran los primeros.
            </p>
          )}
          {/* Que se haya corrido envuelto —cmd.exe, la caja aislada— es parte de lo que pasó de verdad. */}
          {c.corrioComo && <p className="text-muted-foreground font-mono text-[11px]">se corrió como: {c.corrioComo}</p>}
          {c.donde && <p className="text-muted-foreground font-mono text-[11px]">en: {c.donde}</p>}
        </div>
      )}
    </li>
  );
}

export function LoQueCorrio({ corrido }: { corrido: readonly ComandoCorrido[] }) {
  const [abierto, setAbierto] = useState(false);
  if (corrido.length === 0) {
    return (
      <p className="text-muted-foreground text-[12px]">
        De esta rama no quedó registro de comandos: no pasó por el portón, o la hizo una versión anterior.
      </p>
    );
  }

  const fallados = corrido.filter((c) => c.codigo !== 0).length;
  const ms = corrido.reduce((n, c) => n + c.ms, 0);

  return (
    <div className="flex flex-col gap-2">
      <button
        type="button"
        onClick={() => setAbierto((x) => !x)}
        aria-expanded={abierto}
        className="presionable text-muted-foreground hover:text-foreground self-start text-[12px]"
      >
        {abierto ? "Ocultar lo que corrió" : "Ver lo que corrió"} · {corrido.length}{" "}
        {corrido.length === 1 ? "comando" : "comandos"}
        {fallados > 0 && <span className="text-murio"> · {fallados} sin pasar</span>} · {cuantoTardo(ms)}
      </button>
      {abierto && (
        <ul className="flex flex-col gap-1">
          {corrido.map((c, i) => (
            <Fila key={`${c.cuando}-${i}`} c={c} />
          ))}
        </ul>
      )}
    </div>
  );
}
