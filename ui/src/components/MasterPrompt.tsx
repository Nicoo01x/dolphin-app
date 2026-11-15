import { useCallback, useEffect, useRef, useState } from "react";
import { Camera, ImagePlus, Sparkles, X } from "lucide-react";
import { prepararPrompt, proyectoActivo, subirCaptura, urlDeCaptura } from "@/lib/api";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { BotonCopiar } from "./BotonCopiar";
import { Aviso, Seccion } from "./Pagina";
import { Visor } from "./Visor";

/**
 * Master Prompt (ver src/nucleo/master-prompt.ts): sacás o pegás capturas, tocás sobre cada una
 * dónde está el problema —queda un número— y escribís qué pasa ahí; Dolphin arma el pedido entero
 * para mandárselo a Claude. Las capturas quedan en el repo (`.dolphin/prompts/`) y el prompt las
 * nombra por su ruta, con los puntos y, dibujados encima, los números: así Claude Code ve el ① donde
 * vos lo pusiste. No es «subir una imagen y escribirle al lado» (Nico, 30/10: «lo de la captura es
 * muy genérico»): la captura es la protagonista y se marca encima, como se marca una pantalla.
 *
 * Es una ventana que flota sobre cualquier vista («como 3d, flotante»): se abre desde la barra o
 * con P, y se cierra arrastrándola, con la física de /nico-mockup (la del Visor).
 *
 * «Mejorar y copiar» se lo pide a un modelo que mira las capturas y el repo; «Copiar sin mejorar» lo
 * arma tal cual y no gasta nada. El borrador sobrevive a cerrar la ventana y a un refresco (es por
 * proyecto).
 */

interface Pin {
  readonly clave: string;
  /** En % del ancho y del alto de la imagen: vale en cualquier tamaño. */
  readonly x: number;
  readonly y: number;
  readonly nota: string;
}

interface Captura {
  readonly clave: string;
  /** Lo que se muestra: la imagen recién sacada, o la guardada. */
  readonly vista: string;
  readonly ruta?: string;
  /** Qué es esta pantalla (opcional). */
  readonly nota: string;
  readonly pines: readonly Pin[];
  /** La misma captura con los números dibujados encima, ya guardada. */
  readonly marcada?: string;
  readonly error?: string;
}

interface Guardado {
  readonly id: string;
  readonly pedido: string;
  readonly capturas: readonly { readonly ruta: string; readonly nota: string; readonly pines?: readonly Omit<Pin, "clave">[]; readonly marcada?: string }[];
}

const nuevoId = () => `${new Date().toISOString().slice(0, 19).replace(/[:T]/g, "-")}-${Math.random().toString(36).slice(2, 6)}`;
const claveSuelta = () => `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
const claveDelBorrador = () => `dolphin:master-prompt:${proyectoActivo() ?? "local"}`;

function leerBorrador(): Guardado | null {
  try {
    const crudo = window.localStorage.getItem(claveDelBorrador());
    return crudo ? (JSON.parse(crudo) as Guardado) : null;
  } catch {
    return null;
  }
}

function guardarBorrador(b: Guardado): void {
  try {
    if (!b.pedido && b.capturas.length === 0) window.localStorage.removeItem(claveDelBorrador());
    else window.localStorage.setItem(claveDelBorrador(), JSON.stringify(b));
  } catch {
    // Sin almacenamiento (ventana privada): el borrador vive mientras la ventana esté abierta.
  }
}

/** Cualquier imagen (un JPG elegido, lo que trae el portapapeles, un cuadro de video) pasa a PNG. */
async function aPng(fuente: Blob | HTMLVideoElement): Promise<string> {
  const imagen = fuente instanceof Blob ? await createImageBitmap(fuente) : fuente;
  const ancho = imagen instanceof HTMLVideoElement ? imagen.videoWidth : imagen.width;
  const alto = imagen instanceof HTMLVideoElement ? imagen.videoHeight : imagen.height;
  const lienzo = document.createElement("canvas");
  lienzo.width = ancho;
  lienzo.height = alto;
  lienzo.getContext("2d")?.drawImage(imagen, 0, 0, ancho, alto);
  return lienzo.toDataURL("image/png");
}

/** Un cuadro de la pantalla o la ventana que elijas, con el selector del sistema. */
async function sacarCaptura(): Promise<string> {
  const flujo = await navigator.mediaDevices.getDisplayMedia({ video: true, audio: false });
  try {
    const video = document.createElement("video");
    video.srcObject = flujo;
    video.muted = true;
    await video.play();
    // El primer cuadro a veces llega negro: se espera uno más.
    await new Promise((listo) => requestAnimationFrame(() => requestAnimationFrame(listo)));
    return await aPng(video);
  } finally {
    flujo.getTracks().forEach((pista) => pista.stop());
  }
}

const puedeCapturar = typeof navigator !== "undefined" && typeof navigator.mediaDevices?.getDisplayMedia === "function";

/**
 * El color de los puntos, acá y dibujados en la captura: el rojo de marcar, que se ve sobre cualquier
 * pantalla y no es el de ningún estado de la consola (una captura no es la consola).
 */
const COLOR_DEL_PIN = "#e5484d";

/** La captura con los números dibujados donde están los puntos: lo que Claude va a ver. */
async function dibujarPines(vista: string, pines: readonly Pin[]): Promise<string> {
  const imagen = new Image();
  imagen.src = vista;
  await imagen.decode();
  const lienzo = document.createElement("canvas");
  lienzo.width = imagen.naturalWidth;
  lienzo.height = imagen.naturalHeight;
  const g = lienzo.getContext("2d");
  if (!g) throw new Error("no pude dibujar los puntos");
  g.drawImage(imagen, 0, 0);
  // Del tamaño de la imagen: en una de 4K un punto de 14 px no se ve.
  const radio = Math.max(14, Math.round(lienzo.width * 0.016));
  pines.forEach((p, i) => {
    const cx = (p.x / 100) * lienzo.width;
    const cy = (p.y / 100) * lienzo.height;
    g.beginPath();
    g.arc(cx, cy, radio, 0, Math.PI * 2);
    g.fillStyle = COLOR_DEL_PIN;
    g.fill();
    g.lineWidth = Math.max(2, radio * 0.18);
    g.strokeStyle = "#ffffff";
    g.stroke();
    g.fillStyle = "#ffffff";
    g.font = `700 ${Math.round(radio * 1.15)}px system-ui, sans-serif`;
    g.textAlign = "center";
    g.textBaseline = "middle";
    g.fillText(String(i + 1), cx, cy + radio * 0.05);
  });
  return lienzo.toDataURL("image/png");
}

const clavar = (n: number) => Math.min(100, Math.max(0, n));
/** La firma de los puntos de una captura: si no cambió, la marcada guardada sigue valiendo. */
const firmaDe = (pines: readonly Pin[]) => JSON.stringify(pines.map((p) => [Math.round(p.x * 10), Math.round(p.y * 10)]));

export function MasterPrompt({ quienAbrio, alCerrado }: { quienAbrio: HTMLElement | null; alCerrado: () => void }) {
  const inicial = useRef(leerBorrador());
  const [id, setId] = useState(() => inicial.current?.id ?? nuevoId());
  const [pedido, setPedido] = useState(inicial.current?.pedido ?? "");
  const [capturas, setCapturas] = useState<Captura[]>(() =>
    // La clave es propia, no la ruta: dos fichas nunca comparten clave aunque apunten al mismo archivo.
    (inicial.current?.capturas ?? []).map((c) => ({
      clave: claveSuelta(),
      vista: urlDeCaptura(c.ruta),
      ruta: c.ruta,
      nota: c.nota,
      pines: (c.pines ?? []).map((p) => ({ ...p, clave: claveSuelta() })),
      ...(c.marcada ? { marcada: c.marcada } : {}),
    })),
  );
  const [elegida, setElegida] = useState<string | null>(null);
  const [arrastrando, setArrastrando] = useState(false);
  const [aviso, setAviso] = useState<string | null>(null);
  const [preparando, setPreparando] = useState<"mejorar" | "armar" | null>(null);
  const [resultado, setResultado] = useState<{ texto: string; gastado: number; copiado: boolean } | null>(null);
  const [pinAEnfocar, setPinAEnfocar] = useState<string | null>(null);
  const corte = useRef<AbortController | null>(null);
  const elegir = useRef<HTMLInputElement>(null);
  // Qué puntos ya tienen su marcada guardada, por captura: las que vuelven del borrador ya la tienen.
  const firmas = useRef<Map<string, string> | null>(null);
  if (!firmas.current) firmas.current = new Map(capturas.flatMap((c) => (c.marcada ? [[c.clave, firmaDe(c.pines)] as const] : [])));
  const arrastrePin = useRef<{ clave: string; x0: number; y0: number; movio: boolean } | null>(null);

  useEffect(() => {
    guardarBorrador({
      id,
      pedido,
      capturas: capturas.flatMap((c) =>
        c.ruta ? [{ ruta: c.ruta, nota: c.nota, pines: c.pines.map(({ x, y, nota }) => ({ x, y, nota })), ...(c.marcada ? { marcada: c.marcada } : {}) }] : [],
      ),
    });
  }, [id, pedido, capturas]);
  useEffect(() => () => corte.current?.abort(), []);

  const cambiarCaptura = (clave: string, cambio: (c: Captura) => Captura) => setCapturas((cs) => cs.map((c) => (c.clave === clave ? cambio(c) : c)));

  // Cuando cambian los puntos de una captura guardada, se dibujan encima y se guarda esa versión al
  // lado de la original. Con medio segundo de calma: mientras arrastrás un número no se sube nada.
  useEffect(() => {
    const guardadas = firmas.current!;
    const vivas = new Set(capturas.map((c) => c.clave));
    for (const clave of [...guardadas.keys()]) if (!vivas.has(clave)) guardadas.delete(clave);
    const temporizador = window.setTimeout(() => {
      for (const c of capturas) {
        if (!c.ruta) continue;
        const firma = firmaDe(c.pines);
        if (guardadas.get(c.clave) === firma) continue;
        guardadas.set(c.clave, firma);
        const { clave, ruta, vista, pines } = c;
        if (pines.length === 0) {
          cambiarCaptura(clave, ({ marcada, ...sinMarcada }) => {
            void marcada;
            return sinMarcada;
          });
          continue;
        }
        void dibujarPines(vista, pines)
          .then((png) => subirCaptura(id, png, ruta))
          .then(
            (marcada) => cambiarCaptura(clave, (x) => ({ ...x, marcada })),
            // Se vuelve a intentar con el próximo cambio; sin marcada, el prompt lleva igual los puntos.
            () => guardadas.delete(clave),
          );
      }
    }, 500);
    return () => window.clearTimeout(temporizador);
  }, [capturas, id]);

  // El punto recién puesto: el foco va a su nota, para escribir qué pasa ahí sin buscar el campo.
  useEffect(() => {
    if (!pinAEnfocar) return;
    document.querySelector<HTMLTextAreaElement>(`[data-pin-nota="${pinAEnfocar}"]`)?.focus();
    setPinAEnfocar(null);
  }, [pinAEnfocar]);

  const sumar = useCallback(
    async (png: string) => {
      const clave = claveSuelta();
      setAviso(null);
      setCapturas((cs) => [...cs, { clave, vista: png, nota: "", pines: [] }]);
      setElegida(clave);
      try {
        const ruta = await subirCaptura(id, png);
        setCapturas((cs) => cs.map((c) => (c.clave === clave ? { ...c, ruta } : c)));
      } catch (e) {
        setCapturas((cs) => cs.map((c) => (c.clave === clave ? { ...c, error: e instanceof Error ? e.message : String(e) } : c)));
      }
    },
    [id],
  );

  const sumarArchivos = useCallback(
    async (archivos: Iterable<Blob>) => {
      for (const archivo of archivos) {
        if (!archivo.type.startsWith("image/")) continue;
        try {
          await sumar(await aPng(archivo));
        } catch {
          setAviso("No pude leer esa imagen. Probá con un PNG o un JPG.");
        }
      }
    },
    [sumar],
  );

  // Pegar una captura con la ventana abierta: Win+Shift+S y Ctrl+V es lo más rápido.
  useEffect(() => {
    const alPegar = (ev: ClipboardEvent) => {
      const imagenes = [...(ev.clipboardData?.items ?? [])].filter((i) => i.type.startsWith("image/")).flatMap((i) => i.getAsFile() ?? []);
      if (imagenes.length === 0) return;
      ev.preventDefault();
      void sumarArchivos(imagenes);
    };
    document.addEventListener("paste", alPegar);
    return () => document.removeEventListener("paste", alPegar);
  }, [sumarArchivos]);

  const capturar = async () => {
    setAviso(null);
    try {
      await sumar(await sacarCaptura());
    } catch (e) {
      // Cerrar el selector sin elegir nada no es un error.
      if (e instanceof DOMException && e.name === "NotAllowedError") return;
      setAviso(`No pude sacar la captura (${e instanceof Error ? e.message : String(e)}). Sacala con Win+Shift+S y pegala acá con Ctrl+V.`);
    }
  };

  /** Copia la versión con los números, si la hay: pegada en claude.ai, se entiende sola. */
  const copiarImagen = async (c: Captura) => {
    const imagen = await (await fetch(c.marcada ? urlDeCaptura(c.marcada) : c.vista)).blob();
    await navigator.clipboard.write([new ClipboardItem({ "image/png": imagen })]);
    return true;
  };

  const quitarCaptura = (clave: string) => setCapturas((cs) => cs.filter((c) => c.clave !== clave));

  const actual = capturas.find((c) => c.clave === elegida) ?? capturas[capturas.length - 1];
  const indiceActual = actual ? capturas.indexOf(actual) : -1;

  const agregarPin = (ev: React.MouseEvent<HTMLDivElement>) => {
    if (!actual) return;
    const caja = ev.currentTarget.getBoundingClientRect();
    const pin: Pin = { clave: claveSuelta(), x: clavar(((ev.clientX - caja.left) / caja.width) * 100), y: clavar(((ev.clientY - caja.top) / caja.height) * 100), nota: "" };
    cambiarCaptura(actual.clave, (c) => ({ ...c, pines: [...c.pines, pin] }));
    setPinAEnfocar(pin.clave);
  };
  const cambiarPin = (captura: string, clave: string, cambio: Partial<Omit<Pin, "clave">>) =>
    cambiarCaptura(captura, (c) => ({ ...c, pines: c.pines.map((p) => (p.clave === clave ? { ...p, ...cambio } : p)) }));
  const quitarPin = (captura: string, clave: string) => cambiarCaptura(captura, (c) => ({ ...c, pines: c.pines.filter((p) => p.clave !== clave) }));

  /** Una captura que no se guardó, o cuya imagen ya no está, no va en el prompt: se avisa y se saca. */
  const marcarPerdida = (clave: string) => cambiarCaptura(clave, (c) => ({ ...c, error: "la imagen ya no está en el disco: sacala y volvé a sumarla" }));
  const listas = capturas.filter((c) => c.ruta && !c.error);
  const subiendo = capturas.some((c) => !c.ruta && !c.error);
  const vacio = !pedido.trim() && listas.length === 0;

  const preparar = async (mejorar: boolean) => {
    corte.current?.abort();
    const controlador = new AbortController();
    corte.current = controlador;
    setPreparando(mejorar ? "mejorar" : "armar");
    setAviso(null);
    setResultado(null);
    try {
      const listo = await prepararPrompt(
        {
          pedido,
          capturas: listas.map((c) => ({ ruta: c.ruta!, nota: c.nota, pines: c.pines.map(({ x, y, nota }) => ({ x, y, nota })), ...(c.marcada ? { marcada: c.marcada } : {}) })),
        },
        mejorar,
        controlador.signal,
      );
      const copiado = await navigator.clipboard.writeText(listo.texto).then(
        () => true,
        () => false,
      );
      setResultado({ ...listo, copiado });
    } catch (e) {
      if (!controlador.signal.aborted) setAviso(`No pude ${mejorar ? "mejorarlo" : "armarlo"}: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      if (corte.current === controlador) setPreparando(null);
    }
  };

  const empezarOtro = () => {
    corte.current?.abort();
    setId(nuevoId());
    setPedido("");
    setCapturas([]);
    setResultado(null);
    setAviso(null);
  };

  const TILE = "presionable bg-background hover:bg-secondary text-muted-foreground hover:text-foreground flex flex-none cursor-pointer items-center justify-center rounded-xl transition-colors";

  return (
    <Visor quienAbrio={quienAbrio} titulo="Master Prompt" sub="Marcá en la captura dónde está el problema: el pedido sale listo para Claude." onCerrado={alCerrado} ancho={860} variante="formulario" flotante>
      <div
        onDragOver={(ev) => {
          if (![...ev.dataTransfer.types].includes("Files")) return;
          ev.preventDefault();
          setArrastrando(true);
        }}
        onDragLeave={(ev) => {
          if (!ev.currentTarget.contains(ev.relatedTarget as Node | null)) setArrastrando(false);
        }}
        onDrop={(ev) => {
          if (ev.dataTransfer.files.length === 0) return;
          ev.preventDefault();
          setArrastrando(false);
          void sumarArchivos(ev.dataTransfer.files);
        }}
        className={cn("flex flex-col gap-4 rounded-2xl", arrastrando && "ring-foreground/30 ring-2 ring-inset")}
      >
        {/* Un escalón más hondo que la ventana, como todo control sobre una superficie. */}
        <div className="bg-background focus-within:ring-foreground/40 rounded-2xl transition-shadow duration-150 focus-within:ring-2">
          <textarea
            data-sin-anillo
            value={pedido}
            onChange={(ev) => setPedido(ev.target.value)}
            rows={2}
            maxLength={20_000}
            placeholder="Qué querés lograr, con tus palabras: que el chat se vea como el resto de la app…"
            aria-label="Qué querés lograr"
            className="placeholder:text-muted-foreground max-h-[12rem] min-h-[3.75rem] w-full resize-none bg-transparent px-4 py-3 text-sm outline-none [field-sizing:content]"
          />
        </div>

        {aviso && <Aviso>{aviso}</Aviso>}

        {!actual ? (
          <div className="bg-background flex flex-col items-center gap-3 rounded-2xl px-6 py-10 text-center">
            <Camera aria-hidden="true" className="text-muted-foreground size-8" strokeWidth={1.5} />
            <p className="text-[13px]">Sacá una captura de lo que hay que cambiar. Después tocás dónde y escribís qué.</p>
            <div className="flex flex-wrap justify-center gap-2">
              {puedeCapturar && (
                <Button size="lg" onClick={() => void capturar()}>
                  <Camera aria-hidden="true" /> Sacar captura
                </Button>
              )}
              <Button variant="secondary" size="lg" onClick={() => elegir.current?.click()}>
                <ImagePlus aria-hidden="true" /> Elegir imagen
              </Button>
            </div>
            <p className="text-muted-foreground text-[12px]">o pegala con Ctrl+V, o soltala acá</p>
          </div>
        ) : (
          <>
            {/* La tira: todas las capturas, y al final cómo sumar otra. */}
            <div className="flex items-center gap-2 overflow-x-auto pb-1">
              {capturas.map((c, i) => (
                <button
                  key={c.clave}
                  type="button"
                  aria-pressed={c === actual}
                  aria-label={`Captura ${i + 1}${c.pines.length > 0 ? `, ${c.pines.length} ${c.pines.length === 1 ? "punto" : "puntos"}` : ""}`}
                  onClick={() => setElegida(c.clave)}
                  className={cn("bg-background relative h-14 w-24 flex-none overflow-hidden rounded-xl transition-opacity", c === actual ? "ring-foreground ring-2" : "opacity-60 hover:opacity-100")}
                >
                  <img src={c.vista} alt="" onError={() => marcarPerdida(c.clave)} className="size-full object-cover" />
                  <span className="absolute top-1.5 left-1.5 rounded-full bg-black/65 px-1.5 text-[11px] font-semibold text-white tabular-nums">
                    {i + 1}
                    {c.pines.length > 0 && <span className="font-normal opacity-80"> · {c.pines.length}</span>}
                  </span>
                </button>
              ))}
              {puedeCapturar && (
                <button type="button" onClick={() => void capturar()} aria-label="Sacar otra captura" title="Sacar otra captura" className={cn(TILE, "size-14")}>
                  <Camera aria-hidden="true" className="size-5" />
                </button>
              )}
              <button type="button" onClick={() => elegir.current?.click()} aria-label="Elegir otra imagen" title="Elegir otra imagen (o pegala con Ctrl+V)" className={cn(TILE, "size-14")}>
                <ImagePlus aria-hidden="true" className="size-5" />
              </button>
            </div>

            {/* La captura, grande: se marca encima. Los números van sobre la imagen, no sobre el marco. */}
            <figure className="bg-background flex flex-col gap-2 rounded-2xl p-2">
              {actual.error ? (
                <p role="alert" className="text-murio px-1 py-8 text-center text-[13px]">
                  Esta captura no se puede usar: {actual.error}
                </p>
              ) : (
              <div className="flex justify-center">
                <div onClick={agregarPin} className="relative inline-block max-w-full cursor-crosshair select-none">
                  <img
                    src={actual.vista}
                    alt={`Captura ${indiceActual + 1}`}
                    draggable={false}
                    onError={() => marcarPerdida(actual.clave)}
                    className={cn("block h-auto max-h-[48vh] w-auto max-w-full rounded-xl", !actual.ruta && "opacity-60")}
                  />
                  {actual.pines.map((p, j) => (
                    <button
                      key={p.clave}
                      type="button"
                      aria-label={`Punto ${j + 1}${p.nota ? `: ${p.nota}` : ""}. Arrastralo para moverlo.`}
                      style={{ left: `${p.x}%`, top: `${p.y}%`, background: COLOR_DEL_PIN }}
                      className="absolute flex size-6 -translate-x-1/2 -translate-y-1/2 cursor-move touch-none items-center justify-center rounded-full text-[12px] font-bold text-white shadow-[0_0_0_2px_#fff,0_2px_6px_rgba(0,0,0,.45)]"
                      onClick={(ev) => ev.stopPropagation()}
                      onPointerDown={(ev) => {
                        ev.stopPropagation();
                        ev.currentTarget.setPointerCapture(ev.pointerId);
                        arrastrePin.current = { clave: p.clave, x0: ev.clientX, y0: ev.clientY, movio: false };
                      }}
                      onPointerMove={(ev) => {
                        const a = arrastrePin.current;
                        if (!a || a.clave !== p.clave) return;
                        if (!a.movio && Math.hypot(ev.clientX - a.x0, ev.clientY - a.y0) < 3) return;
                        a.movio = true;
                        const caja = ev.currentTarget.parentElement!.getBoundingClientRect();
                        cambiarPin(actual.clave, p.clave, { x: clavar(((ev.clientX - caja.left) / caja.width) * 100), y: clavar(((ev.clientY - caja.top) / caja.height) * 100) });
                      }}
                      onPointerUp={() => {
                        const a = arrastrePin.current;
                        arrastrePin.current = null;
                        // Un toque sin mover: a escribir su nota.
                        if (a && !a.movio) setPinAEnfocar(p.clave);
                      }}
                    >
                      {j + 1}
                    </button>
                  ))}
                </div>
              </div>
              )}
              <figcaption className="flex flex-col gap-1 px-1">
                <div className="flex items-center gap-3">
                  <span className="flex-none text-[13px] font-semibold">Captura {indiceActual + 1}</span>
                  <input
                    value={actual.nota}
                    onChange={(ev) => cambiarCaptura(actual.clave, (c) => ({ ...c, nota: ev.target.value }))}
                    maxLength={4000}
                    placeholder="qué es esta pantalla (opcional)"
                    aria-label={`Qué es la captura ${indiceActual + 1}`}
                    className="placeholder:text-muted-foreground min-w-0 flex-1 bg-transparent text-[13px] outline-none"
                  />
                  <span className="flex flex-none items-center gap-1">
                    {actual.ruta && <BotonCopiar chico rotulo="Copiar imagen" alCopiar={() => copiarImagen(actual)} />}
                    <Button variant="ghost" size="icon" aria-label={`Sacar la captura ${indiceActual + 1}`} onClick={() => quitarCaptura(actual.clave)}>
                      <X aria-hidden="true" />
                    </Button>
                  </span>
                </div>
                {!actual.error && (
                  <p className="text-muted-foreground text-[12px]">
                    {actual.pines.length === 0 ? "Tocá la imagen donde está el problema: queda un número." : "Tocá otro lugar para sumar un punto; arrastrá un número para moverlo."}
                  </p>
                )}
              </figcaption>
            </figure>

            {!actual.error && actual.pines.length > 0 && (
              <ol className="flex flex-col gap-2">
                {actual.pines.map((p, j) => (
                  <li key={p.clave} className="flex items-start gap-2.5">
                    <span aria-hidden="true" style={{ background: COLOR_DEL_PIN }} className="mt-1.5 flex size-5 flex-none items-center justify-center rounded-full text-[11px] font-bold text-white">
                      {j + 1}
                    </span>
                    <textarea
                      data-pin-nota={p.clave}
                      value={p.nota}
                      onChange={(ev) => cambiarPin(actual.clave, p.clave, { nota: ev.target.value })}
                      rows={1}
                      maxLength={2000}
                      aria-label={`Qué pasa en el punto ${j + 1}`}
                      placeholder="Qué pasa acá y qué hay que cambiar…"
                      className="bg-background placeholder:text-muted-foreground min-w-0 flex-1 resize-none rounded-xl px-3 py-1.5 text-[13px] leading-relaxed [field-sizing:content]"
                    />
                    <Button variant="ghost" size="icon" aria-label={`Sacar el punto ${j + 1}`} onClick={() => quitarPin(actual.clave, p.clave)}>
                      <X aria-hidden="true" />
                    </Button>
                  </li>
                ))}
              </ol>
            )}
          </>
        )}

        <input
          ref={elegir}
          type="file"
          accept="image/*"
          multiple
          hidden
          onChange={(ev) => {
            if (ev.target.files) void sumarArchivos([...ev.target.files]);
            ev.target.value = "";
          }}
        />

        <footer className="flex flex-wrap items-center gap-2">
          <Button size="lg" onClick={() => void preparar(true)} disabled={vacio || subiendo || preparando !== null}>
            <Sparkles aria-hidden="true" /> {preparando === "mejorar" ? "Mejorando…" : "Mejorar y copiar"}
          </Button>
          <Button variant="ghost" size="lg" onClick={() => void preparar(false)} disabled={vacio || subiendo || preparando !== null}>
            Copiar sin mejorar
          </Button>
          {preparando === "mejorar" && (
            <>
              <span role="status" className="text-muted-foreground text-[12px]">
                Claude mira las capturas y el repo, y lo reescribe. No cambia nada.
              </span>
              <Button variant="ghost" size="sm" onClick={() => corte.current?.abort()}>
                Cortar
              </Button>
            </>
          )}
          {!vacio && (
            <Button variant="ghost" size="sm" onClick={empezarOtro} className="ml-auto">
              Empezar otro
            </Button>
          )}
        </footer>

        {resultado && (
          <Seccion
            titulo="Listo para mandar"
            extra={`${resultado.copiado ? "ya está copiado" : "copialo con el botón"}${resultado.gastado > 0 ? ` · costó US$ ${resultado.gastado.toFixed(2).replace(".", ",")}` : ""}`}
          >
            <div className="bg-background rounded-2xl p-3">
              <textarea
                value={resultado.texto}
                onChange={(ev) => setResultado({ ...resultado, texto: ev.target.value })}
                aria-label="El prompt para mandarle a Claude"
                className="max-h-[24rem] min-h-[8rem] w-full resize-none bg-transparent px-1 font-mono text-[12.5px] leading-relaxed outline-none [field-sizing:content]"
              />
              <div className="flex flex-wrap items-center gap-2 pt-2">
                <BotonCopiar rotulo="Copiar el prompt" alCopiar={() => navigator.clipboard.writeText(resultado.texto).then(() => true)} />
                <span className="text-muted-foreground text-[12px]">Las capturas van por su ruta, con los números dibujados: Claude Code las abre solo. En claude.ai, pegá cada una con «Copiar imagen».</span>
              </div>
            </div>
          </Seccion>
        )}
      </div>
    </Visor>
  );
}
