import { useCallback, useEffect, useState } from "react";
import { Bot, Plus, X } from "lucide-react";
import { Empty, EmptyContent, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { crearBot, cuandoDice, listarBots, PERMISOS, PLANTILLAS, type BotListado, type Plantilla } from "@/lib/bots";
import { BotDetalle } from "./BotDetalle";
import { BotonCopiar } from "./BotonCopiar";
import { Aviso, Cabecera, conTono, Pagina } from "./Pagina";

/**
 * Dolphin bots: agentes siempre prendidos que viven en ~/.dolphin/bots. A la izquierda la manada,
 * a la derecha el bot elegido (su charla, su alma, lo que aprendió y cuándo se despierta).
 * Crear uno es elegir una plantilla y un nombre, ahí mismo: no hay ventana.
 */

const CAMPO = "bg-background placeholder:text-muted-foreground h-10 w-full rounded-xl px-3 text-[13px]";
const PRENDER = "dolphin bots correr";

const mensajeDe = (e: unknown) => (e instanceof Error ? e.message : String(e));

async function copiar(texto: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(texto);
    return true;
  } catch {
    // Sin permiso de portapapeles no se simula un «Copiado» que no pasó.
    return false;
  }
}

/** «hoy 14:32» o «28/10 09:15»: desde cuándo corren. */
function desdeCuando(iso: string | undefined): string {
  if (!iso) return "ahora";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "ahora";
  const hora = d.toLocaleTimeString("es-AR", { hour: "2-digit", minute: "2-digit" });
  return d.toDateString() === new Date().toDateString() ? `las ${hora}` : `el ${d.toLocaleDateString("es-AR", { day: "2-digit", month: "2-digit" })} a las ${hora}`;
}

/**
 * Si los bots corren o no es lo primero que hay que saber: apagados, ninguna rutina se despierta. Antes
 * era una frase gris de 12 px; ahora es un punto de color, y apagados, el comando para prenderlos a mano.
 */
function EstadoServicio({ vivo, desde }: { vivo: boolean; desde?: string }) {
  return (
    <span role="status" className="text-foreground inline-flex items-center gap-2 font-medium">
      <span aria-hidden="true" className="punto-tono size-2 flex-none rounded-full" style={conTono(vivo ? "var(--paso)" : "var(--murio)")} />
      {vivo ? `Prendidos desde ${desdeCuando(desde)}` : "Apagados"}
    </span>
  );
}

/** `repo`: el proyecto que estás mirando; un bot nuevo trabaja ahí si no le decís otra carpeta. */
export function Bots({ repo }: { repo: string }) {
  const [bots, setBots] = useState<BotListado[] | null>(null);
  const [elegido, setElegido] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [creando, setCreando] = useState(false);
  const [servicio, setServicio] = useState<{ vivo: boolean; desde?: string }>({ vivo: false });

  const cargar = useCallback(async () => {
    try {
      const respuesta = await listarBots();
      const { bots } = respuesta;
      setBots(bots);
      setServicio(respuesta.servicio);
      setElegido((actual) => (actual && bots.some((b) => b.id === actual) ? actual : (bots[0]?.id ?? null)));
      setError(null);
    } catch (e) {
      setError(mensajeDe(e));
    }
  }, []);
  useEffect(() => {
    void cargar();
    // Las rutinas corren solas: la lista se refresca cada tanto para ver la próxima corrida.
    const t = setInterval(() => void cargar(), 30_000);
    return () => clearInterval(t);
  }, [cargar]);

  const cabecera = (
    <Cabecera titulo="Bots" detalle={bots ? <EstadoServicio {...servicio} /> : undefined}>
      {bots && !servicio.vivo && <BotonCopiar chico rotulo={PRENDER} alCopiar={() => copiar(PRENDER)} />}
      {bots && bots.length > 0 && !creando && (
        <Button variant="secondary" onClick={() => setCreando(true)}>
          <Plus aria-hidden="true" /> Nuevo
        </Button>
      )}
    </Cabecera>
  );

  if (error && !bots) {
    return (
      <Pagina>
        {cabecera}
        <Aviso alReintentar={() => void cargar()}>No pude leer tus bots: {error}</Aviso>
      </Pagina>
    );
  }
  if (!bots) {
    return (
      <Pagina aria-busy="true">
        {cabecera}
        <div className="grid min-h-0 flex-1 grid-cols-[300px_minmax(0,1fr)] gap-4 max-[860px]:grid-cols-1">
          <div className="flex flex-col gap-2">
            {[0, 1, 2].map((i) => (
              <Skeleton key={i} className="h-16 rounded-2xl" />
            ))}
          </div>
          <Skeleton className="min-h-80 rounded-3xl" />
        </div>
      </Pagina>
    );
  }

  if (bots.length === 0 && !creando) {
    return (
      <Pagina>
        {cabecera}
        <Empty>
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <Bot aria-hidden="true" />
            </EmptyMedia>
            <EmptyTitle>Tu primera manada</EmptyTitle>
            <EmptyDescription>Un bot vive en tu máquina, aprende de lo que le corregís y te escribe cuando hay algo.</EmptyDescription>
          </EmptyHeader>
          <EmptyContent>
            <Button size="lg" onClick={() => setCreando(true)}>
              <Plus aria-hidden="true" /> Crear un bot
            </Button>
          </EmptyContent>
        </Empty>
      </Pagina>
    );
  }

  const bot = bots.find((b) => b.id === elegido) ?? null;
  return (
    // En escritorio la manada y el bot llenan el alto y cada uno scrollea solo; en el celular, una
    // columna que scrollea entera: la lista arriba y el bot abajo, con el compositor pegado al pie.
    <Pagina className="pb-5 max-[860px]:pb-10">
      {cabecera}
      {error && <Aviso alReintentar={() => void cargar()}>No pude actualizar la lista: {error}</Aviso>}
      <div className="grid min-h-0 flex-1 grid-cols-[300px_minmax(0,1fr)] gap-4 max-[860px]:flex max-[860px]:flex-none max-[860px]:flex-col">
        <aside className="flex min-h-0 flex-col gap-2 overflow-y-auto max-[860px]:flex-none max-[860px]:overflow-visible" aria-label="Tus bots">
          {creando && (
            <NuevoBot
              repo={repo}
              alCrear={async (id) => {
                setCreando(false);
                await cargar();
                setElegido(id);
              }}
              alCancelar={() => setCreando(false)}
            />
          )}
          <ul className="flex flex-col gap-1">
            {bots.map((b) => {
              // Un bot roto no tiene rutinas legibles: la lista igual debe mostrar su error.
              const proxima = b.error ? undefined : [...(b.rutinas ?? [])].sort((x, y) => x.proxima.localeCompare(y.proxima))[0];
              return (
                <li key={b.id}>
                  <button
                    type="button"
                    aria-current={b.id === elegido ? "true" : undefined}
                    onClick={() => setElegido(b.id)}
                    className={cn(
                      "presionable w-full cursor-pointer rounded-2xl px-4 py-3 text-left transition-colors",
                      b.id === elegido ? "bg-card" : "hover:bg-card/60",
                    )}
                  >
                    <span className="flex items-center justify-between gap-3">
                      <span className="truncate text-[15px] font-semibold">{b.nombre ?? b.id}</span>
                      {/* Te espera a vos: el color de «para revisar». */}
                      {b.pendiente && (
                        <span className="con-tono flex-none rounded-xl px-2 py-0.5 text-[12px] font-medium" style={conTono("var(--revisar)")}>
                          espera tu «dale»
                        </span>
                      )}
                    </span>
                    <span className={cn("mt-0.5 block truncate text-[13px]", b.error ? "text-murio" : "text-muted-foreground")}>
                      {b.error ? `no se pudo leer: ${b.error}` : proxima ? cuandoDice(proxima) : PERMISOS[b.permiso]}
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        </aside>
        {bot ? <BotDetalle key={bot.id} listado={bot} alCambiar={cargar} /> : <div />}
      </div>
    </Pagina>
  );
}

function NuevoBot({ repo, alCrear, alCancelar }: { repo: string; alCrear: (id: string) => void | Promise<void>; alCancelar: () => void }) {
  const [plantilla, setPlantilla] = useState<Plantilla>("vigia");
  const [nombre, setNombre] = useState("");
  const [carpeta, setCarpeta] = useState("");
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const elegida = PLANTILLAS.find((p) => p.id === plantilla)!;

  const crear = async () => {
    setEnviando(true);
    setError(null);
    try {
      const donde = carpeta.trim() || repo;
      const { bot } = await crearBot({ nombre: nombre.trim() || elegida.nombre, plantilla, ...(donde ? { carpeta: donde } : {}) });
      await alCrear(bot.id);
    } catch (e) {
      setError(mensajeDe(e));
    } finally {
      setEnviando(false);
    }
  };

  return (
    <form
      className="bg-card flex flex-col gap-3 rounded-3xl p-4"
      onSubmit={(e) => {
        e.preventDefault();
        void crear();
      }}
    >
      <div className="flex items-center justify-between">
        <h2 className="titulo-seccion">Nuevo bot</h2>
        <Button variant="ghost" size="icon" aria-label="Cancelar" onClick={alCancelar}>
          <X aria-hidden="true" />
        </Button>
      </div>
      {/* Un segmentado como los demás: el botón dice si está apretado. */}
      <div role="group" aria-label="Plantilla" className="bg-background flex flex-wrap gap-0.5 self-start rounded-3xl p-0.5">
        {PLANTILLAS.map((p) => (
          <Button
            key={p.id}
            variant="ghost"
            aria-pressed={plantilla === p.id}
            onClick={() => setPlantilla(p.id)}
            className={plantilla === p.id ? "bg-secondary text-foreground hover:bg-secondary" : "hover:text-foreground hover:bg-transparent"}
          >
            {p.nombre}
          </Button>
        ))}
      </div>
      <p className="text-muted-foreground text-[13px]">{elegida.hace}</p>
      <label className="flex flex-col gap-1 text-[13px] font-medium">
        Nombre
        <input className={CAMPO} value={nombre} onChange={(e) => setNombre(e.target.value)} placeholder={elegida.nombre} maxLength={40} />
      </label>
      <label className="flex flex-col gap-1 text-[13px] font-medium">
        Dónde trabaja
        <input className={CAMPO} value={carpeta} onChange={(e) => setCarpeta(e.target.value)} placeholder={repo || "la carpeta del proyecto"} />
      </label>
      {error && <Aviso>{error}</Aviso>}
      <Button type="submit" size="lg" disabled={enviando}>
        {enviando ? "Creando…" : "Crear"}
      </Button>
    </form>
  );
}
