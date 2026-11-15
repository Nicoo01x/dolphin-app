import { useCallback, useEffect, useRef, useState } from "react";
import { ArrowUp, Trash2 } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { NuevaRutina } from "./BotRutinaNueva";
import { BotDeshacer } from "./BotDeshacer";
import { Aviso, conTono } from "./Pagina";
import {
  agregarRutina,
  borrarHabilidad,
  cambiarBot,
  cuandoDice,
  darPermiso,
  hablarConBot,
  olvidar,
  PERMISOS,
  sacarRutina,
  traerBot,
  type BotEntero,
  type BotListado,
  type Permiso,
} from "@/lib/bots";

// Un campo directo sobre el panel: un tono más hondo que la superficie, con el radio de una fila.
const CAMPO = "bg-background placeholder:text-muted-foreground w-full rounded-2xl px-3 text-[13px]";

type Pestana = "charla" | "alma" | "memoria" | "habilidades" | "rutinas";
const PESTANAS: readonly [Pestana, string][] = [
  ["charla", "Charla"],
  ["alma", "Alma"],
  ["memoria", "Memoria"],
  ["habilidades", "Habilidades"],
  ["rutinas", "Rutinas"],
];

const mensajeDe = (e: unknown) => (e instanceof Error ? e.message : String(e));

export function BotDetalle({ listado, alCambiar }: { listado: BotListado; alCambiar: () => void | Promise<void> }) {
  const [datos, setDatos] = useState<BotEntero | null>(null);
  const [pestana, setPestana] = useState<Pestana>("charla");
  const [error, setError] = useState<string | null>(null);

  const cargar = useCallback(async () => {
    try {
      setDatos(await traerBot(listado.id));
      setError(null);
    } catch (e) {
      setError(mensajeDe(e));
    }
  }, [listado.id]);
  useEffect(() => {
    void cargar();
  }, [cargar]);
  const tras = (accion: () => Promise<unknown>) => async () => {
    try {
      const resultado = await accion();
      await Promise.all([cargar(), alCambiar()]);
      return resultado;
    } catch (e) {
      setError(mensajeDe(e));
    }
  };

  if (!datos) {
    return error ? (
      <Aviso alReintentar={() => void cargar()}>No pude leer este bot: {error}</Aviso>
    ) : (
      <Skeleton className="min-h-80 rounded-3xl" />
    );
  }
  const { bot } = datos;
  return (
    // En escritorio el panel llena el alto y scrollea adentro; en el celular crece con lo que tiene y
    // scrollea la página (un panel de 80 % de alto, vacío, dejaba el compositor fuera de la pantalla).
    <section className="bg-card flex min-h-0 flex-col rounded-3xl max-[860px]:flex-none" aria-label={bot.nombre}>
      <header className="flex flex-wrap items-center gap-x-3 gap-y-3 px-5 pt-4 pb-3">
        <div className="min-w-0">
          <h2 className="titulo-vista truncate">{bot.nombre}</h2>
          <p className="text-muted-foreground truncate text-[13px]">
            {bot.motor} · {PERMISOS[bot.permiso]} · {bot.carpeta}{bot.presupuesto ? ` · US$ ${bot.gasto?.usd.toFixed(2) ?? "0.00"} / ${bot.presupuesto.usdPorMes ?? `${bot.presupuesto.corridasPorMes} corridas`}` : ""}
          </p>
        </div>
        {/* En angosto las cinco no entran: se desliza de costado, sin barra, y el borde se desvanece
            para que se note que sigue. */}
        <div
          role="group"
          aria-label="Partes del bot"
          className="sin-barra bg-background ml-auto flex max-w-full overflow-x-auto rounded-full p-0.5 max-[640px]:ml-0 max-[640px]:[mask-image:linear-gradient(to_right,black_calc(100%-32px),transparent)]"
        >
          {PESTANAS.map(([clave, rotulo]) => (
            <Button
              key={clave}
              variant="ghost"
              aria-pressed={pestana === clave}
              onClick={(ev) => {
                setPestana(clave);
                ev.currentTarget.scrollIntoView({ block: "nearest", inline: "nearest" });
              }}
              className={pestana === clave ? "bg-secondary text-foreground hover:bg-secondary" : "hover:text-foreground hover:bg-transparent"}
            >
              {rotulo}
            </Button>
          ))}
        </div>
      </header>
      {error && <Aviso className="mx-5 mb-3">{error}</Aviso>}
      {/* En la charla, el aire de abajo lo pone el compositor (que se pega al pie y tapa lo que pasa por detrás). */}
      <div className={cn("min-h-0 flex-1 overflow-y-auto px-5 max-[860px]:overflow-visible", pestana === "charla" ? "pb-0" : "pb-5")}>
        {pestana === "charla" && <Charla datos={datos} alCambiar={() => Promise.all([cargar(), alCambiar()])} />}
        {pestana === "alma" && <Alma datos={datos} alGuardar={(alma, permiso, respaldo) => tras(() => cambiarBot(bot.id, { alma, permiso, respaldo: respaldo || null }))()} />}
        {pestana === "alma" && bot.permiso === "carpeta" && <BotDeshacer id={bot.id} alHecho={() => Promise.all([cargar(), alCambiar()])} />}
        {pestana === "memoria" && (
          <Lista vacia="Todavía no aprendió nada. Lo que le corrijas en la charla queda acá.">
            {datos.memoria.map((linea) => (
              <Fila key={linea} texto={linea} alBorrar={tras(() => olvidar(bot.id, linea))} rotulo="Olvidar" />
            ))}
          </Lista>
        )}
        {pestana === "habilidades" && (
          <Lista vacia="Cuando termine una tarea que valga repetir, escribe acá cómo la hizo.">
            {datos.habilidades.map((h) => (
              <Fila key={h.nombre} titulo={h.nombre} texto={h.descripcion} alBorrar={tras(() => borrarHabilidad(bot.id, h.nombre))} rotulo="Borrar habilidad" />
            ))}
          </Lista>
        )}
        {pestana === "rutinas" && (
          <>
            <Lista vacia="Sin rutinas: solo trabaja cuando le escribís.">
              {bot.rutinas.map((r) => (
                <Fila
                  key={r.id}
                  titulo={`${cuandoDice(r)}${r.latido ? " · latido" : ""}`}
                  texto={r.tarea}
                  alBorrar={tras(() => sacarRutina(bot.id, r.id))}
                  rotulo="Sacar rutina"
                />
              ))}
            </Lista>
            <NuevaRutina botId={bot.id} alAgregar={(r) => tras(() => agregarRutina(bot.id, r))()} />
          </>
        )}
      </div>
    </section>
  );
}
function Charla({ datos, alCambiar }: { datos: BotEntero; alCambiar: () => Promise<unknown> }) {
  const [texto, setTexto] = useState("");
  const [pensando, setPensando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fin = useRef<HTMLDivElement>(null);
  useEffect(() => fin.current?.scrollIntoView({ block: "end" }), [datos.historial.length, pensando]);

  const mandar = async (accion: () => Promise<unknown>) => {
    setPensando(true);
    setError(null);
    try {
      await accion();
      await alCambiar();
    } catch (e) {
      setError(mensajeDe(e));
    } finally {
      setPensando(false);
    }
  };
  const enviar = () => {
    const t = texto.trim();
    if (!t || pensando) return;
    setTexto("");
    void mandar(() => hablarConBot(datos.bot.id, t));
  };

  return (
    // Ocupa todo el alto: la charla arriba y el campo para escribir siempre abajo, como en cualquier chat.
    <div className="flex min-h-full flex-col gap-3">
      <ol className="flex flex-1 flex-col justify-end gap-2" aria-live="polite">
        {datos.historial.length === 0 && <li className="text-muted-foreground py-6 text-center text-[13px]">Te escribe solo cuando le toca una rutina.</li>}
        {datos.historial.map((m, i) => (
          <li
            key={`${m.cuando}-${i}`}
            className={cn(
              "max-w-[80%] rounded-2xl px-3.5 py-2.5 text-[13px] leading-snug whitespace-pre-wrap",
              m.quien === "vos" ? "bg-primary text-primary-foreground self-end" : m.quien === "sistema" ? "text-muted-foreground self-center text-[12px]" : "bg-secondary self-start",
            )}
          >
            {m.quien === "rutina" && <span className="text-muted-foreground mb-1 block text-[12px] font-medium">rutina</span>}
            {m.texto}
          </li>
        ))}
        {pensando && <li className="bg-secondary text-muted-foreground self-start rounded-2xl px-3.5 py-2.5 text-[13px]">pensando…</li>}
      </ol>
      {datos.bot.pendiente && !pensando && (
        // Te espera a vos: el color de «para revisar».
        <div className="con-tono flex flex-wrap items-center gap-3 rounded-2xl px-4 py-3" style={conTono("var(--revisar)")}>
          <p className="text-foreground min-w-0 flex-1 text-[13px]">
            <span className="font-semibold">Quiere hacer esto:</span> {datos.bot.pendiente.quiere}
          </p>
          <Button size="lg" onClick={() => void mandar(() => darPermiso(datos.bot.id, datos.bot.pendiente?.id))}>
            Dale
          </Button>
        </div>
      )}
      {error && <Aviso>{error}</Aviso>}
      {/* Pegado al pie del panel (o de la pantalla, en el celular): la charla puede ser larga, pero
          escribirle no puede quedar fuera de la vista. La franja de abajo tapa lo que pasa por detrás. */}
      <div className="bg-card sticky bottom-0 z-10 pt-1 pb-5">
        <form
          className="bg-background focus-within:ring-foreground/40 flex items-end gap-2 rounded-2xl p-1.5 transition-shadow duration-150 focus-within:ring-2"
          onSubmit={(e) => {
            e.preventDefault();
            enviar();
          }}
        >
          <textarea
            aria-label={`Escribirle a ${datos.bot.nombre}`}
            data-sin-anillo
            rows={1}
            value={texto}
            onChange={(e) => setTexto(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                enviar();
              }
            }}
            placeholder={`Escribile a ${datos.bot.nombre}`}
            className="placeholder:text-muted-foreground max-h-40 min-h-9 flex-1 resize-none bg-transparent px-2 py-2 text-[13px] outline-none [field-sizing:content] pointer-coarse:min-h-12 pointer-coarse:py-3"
          />
          <Button type="submit" size="icon-lg" aria-label="Mandar" disabled={!texto.trim() || pensando}>
            <ArrowUp aria-hidden="true" />
          </Button>
        </form>
      </div>
    </div>
  );
}

function Alma({ datos, alGuardar }: { datos: BotEntero; alGuardar: (alma: string, permiso: Permiso, respaldo: "claude" | "codex" | "") => Promise<unknown> }) {
  const [alma, setAlma] = useState(datos.alma);
  const [permiso, setPermiso] = useState<Permiso>(datos.bot.permiso);
  const [respaldo, setRespaldo] = useState<"claude" | "codex" | "">(datos.bot.respaldo ?? "");
  const [guardando, setGuardando] = useState(false);
  const cambio = alma !== datos.alma || permiso !== datos.bot.permiso || respaldo !== (datos.bot.respaldo ?? "");
  return (
    <div className="flex flex-col gap-4">
      <label className="flex flex-col gap-1.5 text-[13px] font-medium">
        Quién es, qué hace y cómo te habla
        <textarea className={cn(CAMPO, "min-h-56 py-2.5 leading-relaxed font-normal")} value={alma} onChange={(e) => setAlma(e.target.value)} />
      </label>
      <fieldset className="flex flex-col gap-1.5">
        <legend className="mb-1.5 text-[13px] font-medium">Antes de tocar algo</legend>
        <div role="group" className="bg-background flex flex-wrap gap-0.5 self-start rounded-3xl p-0.5">
          {(Object.keys(PERMISOS) as Permiso[]).map((p) => (
            <Button
              key={p}
              variant="ghost"
              aria-pressed={permiso === p}
              onClick={() => setPermiso(p)}
              className={permiso === p ? "bg-secondary text-foreground hover:bg-secondary" : "hover:text-foreground hover:bg-transparent"}
            >
              {PERMISOS[p]}
            </Button>
          ))}
        </div>
      </fieldset>
      <label className="flex flex-col gap-1.5 text-[13px] font-medium">
        Motor de respaldo si se queda sin cupo
        <select className={cn(CAMPO, "h-10 font-normal")} value={respaldo} onChange={(e) => setRespaldo(e.target.value as "claude" | "codex" | "")}>
          <option value="">Sin respaldo</option>
          <option value="claude">Claude</option>
          <option value="codex">Codex</option>
        </select>
      </label>
      <Button
        size="lg"
        className="self-start"
        disabled={!cambio || guardando}
        onClick={async () => {
          setGuardando(true);
          await alGuardar(alma, permiso, respaldo);
          setGuardando(false);
        }}
      >
        {guardando ? "Guardando…" : "Guardar"}
      </Button>
    </div>
  );
}

function Lista({ vacia, children }: { vacia: string; children: React.ReactNode[] }) {
  if (children.length === 0) return <p className="text-muted-foreground py-6 text-center text-[13px]">{vacia}</p>;
  return <ul className="flex flex-col gap-1">{children}</ul>;
}

function Fila({ titulo, texto, alBorrar, rotulo }: { titulo?: string; texto: string; alBorrar: () => void; rotulo: string }) {
  return (
    <li className="ficha flex items-start gap-3 rounded-2xl px-3.5 py-2.5">
      <div className="min-w-0 flex-1">
        {titulo && <p className="text-[13px] font-semibold">{titulo}</p>}
        <p className={cn("text-[13px] break-words", titulo && "text-muted-foreground")}>{texto}</p>
      </div>
      <Button variant="ghost" size="icon" aria-label={rotulo} title={rotulo} onClick={alBorrar} className="hover:bg-background">
        <Trash2 aria-hidden="true" />
      </Button>
    </li>
  );
}
