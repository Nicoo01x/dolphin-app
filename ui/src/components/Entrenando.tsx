import { useCallback, useEffect, useRef, useState } from "react";
import { Check, FileText, Loader2, MessagesSquare, X } from "lucide-react";
import {
  buscarMemorias,
  destilarMemorias,
  olvidarAprendido,
  type Aprendido,
  type Entrenamiento,
  type FuenteDeMemoria,
  type HerramientaDeMemoria,
} from "@/lib/api";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Aviso } from "./Pagina";
import { DelfinDeSimbolos } from "./Delfin";
import { MarDeSimbolos } from "./Mar";
import { Leible } from "./Leible";

/**
 * Entrenando a tu delfín: la primera vez que Dolphin abre un proyecto.
 *
 * Tres pasos de verdad, sin esperas de adorno: buscar lo que este proyecto ya
 * les enseñó a otros modelos (instrucciones, la memoria de Claude Code, las
 * conversaciones), destilarlo con Claude en las verdades del proyecto, y
 * dejar que la persona tache lo que no va. Lo destilado viaja en cada
 * siembra, a cualquier modelo.
 *
 * Buscar es gratis y corre solo. Destilar usa el cupo de Claude: se pregunta
 * con un botón. Antes arrancaba solo al abrir la pantalla, y entrar al
 * tablero de un proyecto nuevo gastaba cupo sin que nadie lo pidiera.
 */

const DE_QUIEN: Readonly<Record<HerramientaDeMemoria, { nombre: string; logo?: string }>> = {
  claude: { nombre: "Claude", logo: "/logos/claude.svg" },
  agents: { nombre: "Codex y otros", logo: "/logos/openai.svg" },
  codex: { nombre: "Codex", logo: "/logos/openai.svg" },
  gemini: { nombre: "Gemini", logo: "/logos/gemini.svg" },
  copilot: { nombre: "Copilot", logo: "/logos/copilot.svg" },
  cursor: { nombre: "Cursor" },
  windsurf: { nombre: "Windsurf" },
  aider: { nombre: "Aider" },
  cline: { nombre: "Cline" },
  roo: { nombre: "Roo" },
  kiro: { nombre: "Kiro" },
  continue: { nombre: "Continue" },
  junie: { nombre: "Junie" },
  trae: { nombre: "Trae" },
  zed: { nombre: "Zed" },
  augment: { nombre: "Augment" },
};

const miles = (n: number) => n.toLocaleString("es-AR");

type Paso = "buscando" | "decidir" | "destilando" | "listo";

export function Entrenando({ alTerminar }: { alTerminar: () => void }) {
  const [paso, setPaso] = useState<Paso>("buscando");
  const [entrenamiento, setEntrenamiento] = useState<Entrenamiento | null>(null);
  const [error, setError] = useState<{ en: Paso; porQue: string } | null>(null);
  const [segundos, setSegundos] = useState(0);
  // Saltear el destilado: la respuesta que llegue tarde ya no pisa la pantalla.
  const salteado = useRef(false);
  // Cortar el pedido hace que el servidor mate el proceso de Claude: saltear no sigue gastando cupo.
  const corte = useRef<AbortController | null>(null);
  useEffect(() => () => corte.current?.abort(), []);
  const saltear = () => {
    salteado.current = true;
    corte.current?.abort();
    setPaso("listo");
  };
  const empezar = useRef<HTMLButtonElement>(null);

  const correr = useCallback(async () => {
    salteado.current = false;
    setError(null);
    setPaso("buscando");
    let buscado: Entrenamiento;
    try {
      buscado = (await buscarMemorias()).entrenamiento;
      setEntrenamiento(buscado);
    } catch (e) {
      setError({ en: "buscando", porQue: e instanceof Error ? e.message : String(e) });
      return;
    }
    // Lo que sigue usa el cupo de Claude: lo decide la persona.
    setPaso(buscado.fuentes.length === 0 ? "listo" : "decidir");
  }, []);

  const destilar = useCallback(async () => {
    salteado.current = false;
    setError(null);
    setPaso("destilando");
    corte.current = new AbortController();
    try {
      const destilado = (await destilarMemorias(corte.current.signal)).entrenamiento;
      if (salteado.current) return;
      setEntrenamiento(destilado);
    } catch (e) {
      if (salteado.current) return;
      setError({ en: "destilando", porQue: e instanceof Error ? e.message : String(e) });
    }
    setPaso("listo");
  }, []);

  useEffect(() => {
    void correr();
  }, [correr]);

  // El reloj del destilado: tarda medio minuto, y una pantalla quieta parece colgada.
  useEffect(() => {
    if (paso !== "destilando") return;
    setSegundos(0);
    const reloj = window.setInterval(() => setSegundos((s) => s + 1), 1000);
    return () => window.clearInterval(reloj);
  }, [paso]);

  useEffect(() => {
    if (paso === "listo" || paso === "decidir") empezar.current?.focus({ preventScroll: true });
  }, [paso]);

  const fuentes = entrenamiento?.fuentes ?? [];
  const aprendido = entrenamiento?.aprendido ?? [];
  const mensajes = fuentes.filter((f) => f.tipo === "conversaciones").reduce((n, f) => n + f.lineas, 0);
  const deCero = paso === "listo" && fuentes.length === 0 && !error;

  const tachar = async (a: Aprendido) => {
    try {
      const { entrenamiento: nuevo } = await olvidarAprendido(a.texto);
      if (nuevo) setEntrenamiento(nuevo);
    } catch {
      // Si no se pudo, la verdad sigue en la lista: nada que deshacer.
    }
  };

  return (
    // Como en Nueva: el mar y el delfín en la caja que no scrollea, el contenido en la de adelante.
    <div className="relative min-h-0 overflow-hidden">
      <MarDeSimbolos opacity={0.22} />
      <DelfinDeSimbolos legibles="h1, h2, p, li, button" className="max-[800px]:hidden" />
      <div className="relative z-10 h-full overflow-y-auto">
      <div className="mx-auto flex min-h-full w-full max-w-[680px] flex-col justify-center px-5 py-12 max-[640px]:px-4">
        <h1 tabIndex={-1} className="titulo-vista">
          {deCero ? "Tu delfín arranca de cero" : paso === "listo" && aprendido.length > 0 ? "Tu delfín ya conoce este proyecto" : "Entrenando a tu delfín"}
        </h1>
        {deCero && (
          <p className="bg-card text-muted-foreground mt-3 max-w-[60ch] self-start rounded-2xl px-3.5 py-2.5 text-[13px] leading-relaxed">
            No encontré nada que otros modelos hayan aprendido de este proyecto: ni instrucciones, ni memoria de Claude Code, ni
            conversaciones. Va a aprender de lo que le corrijas.
          </p>
        )}

        {/* Sobre el mar, con fondo propio: los puntos no se leen a través de los pasos. */}
        <ol aria-label="Pasos del entrenamiento" className="bg-card mt-5 space-y-3 rounded-3xl p-4">
          <PasoDe
            estado={paso === "buscando" ? (error?.en === "buscando" ? "error" : "andando") : "hecho"}
            titulo="Buscar lo que ya les enseñaste"
            detalle={
              paso === "buscando"
                ? "En el proyecto, en ~/.claude, ~/.codex y ~/.gemini…"
                : `${fuentes.length} ${fuentes.length === 1 ? "fuente" : "fuentes"}${mensajes > 0 ? ` · ${miles(mensajes)} mensajes tuyos` : ""}`
            }
          />
          {!deCero && (
            <PasoDe
              estado={
                paso === "buscando" || paso === "decidir"
                  ? "espera"
                  : paso === "destilando"
                    ? "andando"
                    : error?.en === "destilando"
                      ? "error"
                      : salteado.current
                        ? "salteado"
                        : "hecho"
              }
              titulo="Destilar lo importante con Claude"
              detalle={
                paso === "destilando"
                  ? `Leyendo y resumiendo · ${segundos} s (suele tardar medio minuto)`
                  : error?.en === "destilando"
                    ? `No se pudo: ${error.porQue}. Igual usa las instrucciones y la memoria tal cual.`
                    : salteado.current
                      ? "Salteado: usa las fuentes tal cual. Lo podés destilar desde Memoria."
                      : paso === "listo"
                        ? `${aprendido.length} ${aprendido.length === 1 ? "verdad" : "verdades"} del proyecto`
                        : paso === "decidir"
                          ? "Usa tu cupo de Claude (medio minuto, más o menos): arranca solo si lo pedís"
                          : "Después de buscar"
              }
            />
          )}
        </ol>

        {error?.en === "buscando" && (
          <div className="bg-background mt-4 self-start rounded-2xl">
            <Aviso alReintentar={() => void correr()}>No pude buscar: {error.porQue}.</Aviso>
          </div>
        )}

        {fuentes.length > 0 && paso !== "listo" && (
          <ul aria-label="Lo que encontró" className="bg-card mt-4 space-y-1 rounded-3xl p-1.5">
            {fuentes.map((f) => (
              <Fila key={`${f.herramienta}|${f.ruta}|${f.nombre}`} fuente={f} />
            ))}
          </ul>
        )}

        {paso === "listo" && aprendido.length > 0 && (
          <section aria-labelledby="aprendido-titulo" className="bg-card mt-4 rounded-3xl p-1.5">
            <h2 id="aprendido-titulo" className="titulo-seccion px-3 pt-2.5 pb-1.5">
              Lo que aprendió
            </h2>
            <ul className="max-h-[46vh] space-y-0.5 overflow-auto">
              {aprendido.map((a) => (
                <Verdad key={a.texto} aprendido={a} alTachar={() => void tachar(a)} />
              ))}
            </ul>
          </section>
        )}

        <div className="mt-6 flex min-h-9 flex-wrap items-center gap-2" aria-live="polite">
          {paso === "listo" && (
            <Button ref={empezar} size="lg" onClick={alTerminar}>
              Empezar
            </Button>
          )}
          {paso === "decidir" && (
            <>
              <Button size="lg" onClick={() => void destilar()}>
                Destilar con Claude
              </Button>
              {/* El foco cae acá, no en Destilar: un Enter de más no tiene que gastar cupo. */}
              <Button ref={empezar} variant="secondary" size="lg" onClick={saltear}>
                Seguir sin destilar
              </Button>
            </>
          )}
          {paso === "destilando" && (
            <Button variant="secondary" size="lg" onClick={saltear}>
              Seguir sin destilar
            </Button>
          )}
          {error?.en === "buscando" && (
            <Button variant="secondary" size="lg" onClick={alTerminar}>
              Seguir sin entrenar
            </Button>
          )}
        </div>
      </div>
      </div>
    </div>
  );
}

/** Un paso del entrenamiento: qué hace y en qué va. */
function PasoDe({
  estado,
  titulo,
  detalle,
}: {
  estado: "espera" | "andando" | "hecho" | "error" | "salteado";
  titulo: string;
  detalle: string;
}) {
  return (
    <li className="flex items-start gap-3">
      <span aria-hidden="true" className="mt-0.5 inline-flex size-5 flex-none items-center justify-center">
        {estado === "andando" ? (
          <Loader2 className="size-4 animate-spin" />
        ) : estado === "hecho" ? (
          <Check className="text-paso size-4" />
        ) : estado === "error" ? (
          <X className="text-murio size-4" />
        ) : (
          <span className="bg-foreground/20 size-2 rounded-full" />
        )}
      </span>
      <span className="min-w-0">
        <span className={cn("block text-[13px] font-medium", estado === "espera" && "text-muted-foreground")}>{titulo}</span>
        <span className="text-muted-foreground block text-[13px]">{detalle}</span>
      </span>
    </li>
  );
}

/** Una fuente encontrada: de qué herramienta, de dónde y cuánto. */
export function Fila({ fuente, className }: { fuente: FuenteDeMemoria; className?: string }) {
  const quien = DE_QUIEN[fuente.herramienta] ?? { nombre: fuente.herramienta };
  const cuanto = `${miles(fuente.lineas)} ${fuente.lineas === 1 ? "línea" : "líneas"}${fuente.archivos > 1 ? ` en ${fuente.archivos} archivos` : ""}`;
  const { titulo, detalle } =
    fuente.tipo === "conversaciones"
      ? {
          titulo: fuente.nombre,
          detalle: `${miles(fuente.lineas)} mensajes tuyos en ${fuente.archivos} ${fuente.archivos === 1 ? "conversación" : "conversaciones"}`,
        }
      : fuente.alcance === "otro-proyecto"
        ? {
            titulo: "Memoria de Claude Code",
            detalle: `anotada desde ${fuente.proyecto ? `«${fuente.proyecto}»` : "otro proyecto"} · ${cuanto}`,
          }
        : {
            titulo: fuente.nombre,
            detalle: `${quien.nombre} · ${fuente.alcance === "global" ? "para todos tus proyectos" : "de este proyecto"} · ${cuanto}`,
          };
  const Icono = fuente.tipo === "conversaciones" ? MessagesSquare : FileText;
  return (
    <li className={cn("animate-entra flex items-center gap-3 rounded-xl px-3 py-2.5", className)}>
      {quien.logo ? (
        <img src={quien.logo} alt="" className="size-[18px] flex-none" />
      ) : (
        <Icono aria-hidden="true" className="text-muted-foreground size-[18px] flex-none" />
      )}
      <span className="min-w-0 flex-1">
        <span className="block truncate text-[13px] font-medium" title={fuente.ruta}>
          {titulo}
        </span>
        <span className="text-muted-foreground block truncate text-xs" title={fuente.ruta}>
          {detalle}
        </span>
      </span>
      <Check aria-label="leída" className="text-paso size-4 flex-none" />
    </li>
  );
}

/** Una verdad aprendida, con de dónde salió y cómo tacharla. */
export function Verdad({ aprendido, alTachar }: { aprendido: Aprendido; alTachar: () => void }) {
  return (
    <li className="group hover:bg-card/70 flex items-start gap-3 rounded-xl px-3 py-2 transition-colors">
      <span className="bg-foreground/30 mt-[7px] size-1.5 flex-none rounded-full" aria-hidden="true" />
      {/* La fila usa el ancho que haya; el texto corta en la medida en que se lee. */}
      <span className="min-w-0 flex-1 [&>*]:max-w-[95ch]">
        <Leible texto={aprendido.texto} className="block text-[13px] leading-snug" />
        <span className="text-muted-foreground mt-0.5 block truncate text-[12px]">de {aprendido.fuente}</span>
      </span>
      <Button
        variant="ghost"
        size="icon-sm"
        onClick={alTachar}
        aria-label={`Tachar «${aprendido.texto}»`}
        title="Tachar: no va"
        className="hover:text-murio opacity-60 group-hover:opacity-100 focus-visible:opacity-100"
      >
        <X aria-hidden="true" className="size-3.5" />
      </Button>
    </li>
  );
}
