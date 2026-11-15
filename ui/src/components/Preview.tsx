import { useEffect, useRef, useState } from "react";
import { Monitor, MousePointerClick, Smartphone, Tablet, X } from "lucide-react";
import { abrirPreview, cerrarPreview, pedirSobreElElemento, type ElementoTocado, type PreviewAbierto } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Aviso } from "./Pagina";

/**
 * La app de la rama, adentro de la consola.
 *
 * Mirar un diff no dice si la pantalla quedó bien. Acá se ve andando, en el tamaño que importe, y
 * se puede tocar un elemento para pedir el cambio sobre ESE elemento: el pedido va con su selector,
 * su HTML y sus estilos, así el agente no sale a explorar el repo (es el mismo camino del modo en
 * vivo del escritorio, `POST /api/live`).
 *
 * Puede tocarse porque la app se sirve por el origen de la consola (`/preview/<id>/`, ver
 * nucleo/preview.ts): un iframe de otro origen no deja leer ni un nodo de su DOM.
 */

/** Los tamaños que se miran de verdad. El de escritorio es el ancho de diseño más común. */
const TAMANOS = [
  { nombre: "escritorio", ancho: 1440, alto: 900, Icono: Monitor },
  { nombre: "tablet", ancho: 768, alto: 1024, Icono: Tablet },
  { nombre: "celular", ancho: 390, alto: 780, Icono: Smartphone },
] as const;

export function Preview({ rama }: { readonly rama: string }) {
  const [preview, setPreview] = useState<PreviewAbierto | null>(null);
  const [abriendo, setAbriendo] = useState(false);
  const [porQueNo, setPorQueNo] = useState<string | null>(null);
  const [tamano, setTamano] = useState<(typeof TAMANOS)[number]>(TAMANOS[0]);
  const [inspeccionando, setInspeccionando] = useState(false);
  const [tocado, setTocado] = useState<ElementoTocado | null>(null);
  const [ruta, setRuta] = useState("/");
  const [pedido, setPedido] = useState("");
  const [pidiendo, setPidiendo] = useState(false);
  const [pedida, setPedida] = useState(false);
  // Lo que la app escribió en la consola del navegador: una pantalla en blanco casi siempre tiene
  // el motivo acá, y abrir F12 sobre un iframe para encontrarlo es justo lo que queremos evitar.
  const [consola, setConsola] = useState<readonly { nivel: string; texto: string }[]>([]);
  const [verConsola, setVerConsola] = useState(false);
  // Cuánto se encoge el iframe para que su ancho de diseño entre en el panel.
  const [escala, setEscala] = useState(1);
  const caja = useRef<HTMLDivElement>(null);
  const marco = useRef<HTMLIFrameElement>(null);

  // El panel es más angosto que 1440: el iframe se dibuja a su ancho real y se encoge, que es lo
  // que deja ver el layout de escritorio de verdad en vez de la versión angosta.
  //
  // `preview` va en las dependencias y no sobra: el hueco recién existe cuando hay un preview
  // abierto, así que sin eso el efecto corría con `caja` todavía en null, dejaba la escala en 1 y
  // el iframe de 1440 se salía del panel sin que nada lo volviera a medir.
  useEffect(() => {
    const hueco = caja.current;
    if (!hueco) return;
    const medir = () => setEscala(Math.min(1, (hueco.clientWidth || tamano.ancho) / tamano.ancho));
    medir();
    const observador = new ResizeObserver(medir);
    observador.observe(hueco);
    return () => observador.disconnect();
  }, [tamano, preview]);

  // Lo que el inspector manda desde adentro del iframe.
  useEffect(() => {
    const escuchar = (evento: MessageEvent) => {
      const datos = evento.data as { dolphin?: string; elemento?: ElementoTocado; ruta?: string; nivel?: string; texto?: string } | null;
      if (!datos || typeof datos !== "object") return;
      if (datos.dolphin === "consola" && typeof datos.texto === "string") {
        // Las últimas 50: una app en loop llena esto en segundos y no se gana nada guardándolas.
        setConsola((antes) => [...antes, { nivel: datos.nivel ?? "error", texto: datos.texto! }].slice(-50));
      }
      if (datos.dolphin === "elemento" && datos.elemento) {
        setTocado(datos.elemento);
        setPedida(false);
        // Tocaste uno: ahora toca describir el cambio, no seguir señalando.
        setInspeccionando(false);
      }
      if (datos.dolphin === "ruta" && typeof datos.ruta === "string") setRuta(datos.ruta);
    };
    window.addEventListener("message", escuchar);
    return () => window.removeEventListener("message", escuchar);
  }, []);

  // Prender y apagar el modo señalar adentro del iframe.
  useEffect(() => {
    marco.current?.contentWindow?.postMessage({ dolphin: "inspeccionar", prendido: inspeccionando }, "*");
  }, [inspeccionando, preview]);

  const abrir = async () => {
    setAbriendo(true);
    setPorQueNo(null);
    try {
      setPreview(await abrirPreview(rama));
    } catch (error) {
      setPorQueNo(error instanceof Error ? error.message : String(error));
    } finally {
      setAbriendo(false);
    }
  };

  const cerrar = async () => {
    const abierto = preview;
    setPreview(null);
    setTocado(null);
    setInspeccionando(false);
    setConsola([]);
    if (abierto) await cerrarPreview(abierto.id).catch(() => {});
  };

  const pedir = async () => {
    if (!tocado || pedido.trim() === "") return;
    setPidiendo(true);
    setPorQueNo(null);
    try {
      await pedirSobreElElemento(pedido.trim(), tocado);
      setPedida(true);
      setPedido("");
    } catch (error) {
      setPorQueNo(error instanceof Error ? error.message : String(error));
    } finally {
      setPidiendo(false);
    }
  };

  if (!preview) {
    return (
      <div className="flex flex-col gap-2">
        <div className="flex flex-wrap items-center gap-2">
          <Button variant="secondary" onClick={() => void abrir()} disabled={abriendo}>
            <Monitor aria-hidden="true" /> {abriendo ? "Levantando la app…" : "Ver cómo quedó"}
          </Button>
          <span className="text-muted-foreground text-[12px]">Levanta la app de esta rama en su propio worktree, sin tocar el tuyo.</span>
        </div>
        {porQueNo && <Aviso>{porQueNo}</Aviso>}
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-2">
        {/* Los tamaños: el mismo grupo que un selector de dispositivo, con el ancho a la vista. */}
        <div className="bg-background flex items-center gap-0.5 rounded-xl p-0.5" role="group" aria-label="Tamaño de la pantalla">
          {TAMANOS.map((t) => (
            <button
              key={t.nombre}
              type="button"
              onClick={() => setTamano(t)}
              aria-pressed={t.nombre === tamano.nombre}
              title={`${t.nombre} · ${t.ancho} px`}
              className={`presionable flex items-center gap-1.5 rounded-[10px] px-2.5 py-1.5 text-[12px] ${
                t.nombre === tamano.nombre ? "bg-secondary text-foreground" : "text-muted-foreground hover:text-foreground"
              }`}
            >
              <t.Icono aria-hidden="true" className="size-3.5" />
              {t.ancho}
            </button>
          ))}
        </div>

        <Button variant={inspeccionando ? "default" : "secondary"} onClick={() => setInspeccionando((x) => !x)}>
          <MousePointerClick aria-hidden="true" /> {inspeccionando ? "Tocá lo que quieras cambiar" : "Señalar un elemento"}
        </Button>

        <code className="text-muted-foreground min-w-0 flex-1 truncate font-mono text-[12px]" title={ruta}>
          {ruta}
        </code>

        <Button variant="ghost" onClick={() => void cerrar()} title="Apagar la app y devolver su worktree">
          <X aria-hidden="true" /> Cerrar
        </Button>
      </div>

      <div ref={caja} className="bg-background overflow-hidden rounded-2xl">
        {/* El hueco mide lo que mide el iframe YA encogido, y va centrado: con el ancho del panel
            entero, un celular de 390 quedaba pegado a la izquierda con medio panel negro al lado. */}
        <div style={{ width: tamano.ancho * escala, height: tamano.alto * escala }} className="relative mx-auto" aria-live="off">
          <iframe
            ref={marco}
            src={preview.enLaConsola}
            title={`La app de ${preview.rama}`}
            // Mismo origen a propósito: es lo que permite inspeccionarla. La app es la de la rama
            // que vos sembraste y corre en tu máquina, igual que si abrieras su puerto a mano.
            className="absolute top-0 left-0 origin-top-left border-0 bg-white"
            style={{ width: tamano.ancho, height: tamano.alto, transform: `scale(${escala})` }}
          />
        </div>
      </div>

      {porQueNo && <Aviso>{porQueNo}</Aviso>}

      {/* Lo que la app tiró en la consola del navegador. Solo aparece si hay algo: una tira vacía
          en cada rama sería ruido, y acá «3 errores» es lo que explica una pantalla en blanco. */}
      {consola.length > 0 && (
        <div className="bg-secondary/60 flex flex-col gap-2 rounded-2xl p-3.5">
          <button
            type="button"
            onClick={() => setVerConsola((x) => !x)}
            aria-expanded={verConsola}
            className="presionable flex items-center gap-2 self-start text-[13px]"
          >
            <span className={consola.some((c) => c.nivel === "error") ? "text-murio font-medium" : "font-medium"}>
              {consola.length} {consola.length === 1 ? "mensaje" : "mensajes"} en la consola de la app
            </span>
            <span className="text-muted-foreground text-[12px]">{verConsola ? "ocultar" : "ver"}</span>
          </button>
          {verConsola && (
            <ul className="bg-background max-h-48 overflow-auto rounded-xl p-3 font-mono text-[12px] leading-relaxed">
              {consola.map((c, i) => (
                <li key={i} className={c.nivel === "error" ? "text-murio" : "text-muted-foreground"}>
                  {c.texto}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      {tocado && (
        <div className="bg-secondary/60 flex flex-col gap-2 rounded-2xl p-3.5">
          <p className="text-[13px]">
            {tocado.texto ? <b className="font-medium">«{tocado.texto.slice(0, 80)}»</b> : "Ese elemento"}{" "}
            <code className="text-muted-foreground font-mono text-[12px]">{tocado.selector}</code>
          </p>
          {pedida ? (
            <p className="text-paso text-[13px]">Listo: se está escribiendo la rama con ese cambio.</p>
          ) : (
            <>
              <textarea
                value={pedido}
                onChange={(ev) => setPedido(ev.target.value)}
                rows={2}
                maxLength={1000}
                autoFocus
                aria-label="Qué le cambiarías"
                placeholder="Qué le cambiarías: que el botón sea del color de la marca y diga «Guardar los cambios»…"
                className="bg-background placeholder:text-muted-foreground w-full resize-none rounded-xl px-3 py-2 text-[13px] [field-sizing:content]"
              />
              <div className="flex flex-wrap items-center gap-2">
                <Button onClick={() => void pedir()} disabled={pidiendo || pedido.trim() === ""}>
                  {pidiendo ? "Sembrando…" : "Pedir ese cambio"}
                </Button>
                <Button variant="ghost" onClick={() => setTocado(null)} disabled={pidiendo}>
                  Dejarlo
                </Button>
                <span className="text-muted-foreground text-[12px]">Va con su selector, su HTML y sus estilos: el agente no sale a buscarlo.</span>
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}
