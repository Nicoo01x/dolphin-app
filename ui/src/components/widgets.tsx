import type { ReactNode } from "react";
import { ArrowUpRight, CalendarClock, FileText, Sprout, X } from "lucide-react";
import type { Turno } from "@/lib/tipos";
import type { Metricas } from "@/lib/metricas";
import type { Vivo } from "@/lib/vivo";
import { cuandoFue, plata, plataDe, reloj, tituloDeTarea } from "@/lib/datos";
import { resumenDeVivo } from "@/lib/vivo";
import { conProyecto, type EstadoDeGuardian, type TareaDeCola, type TurnoAgendado } from "@/lib/api";
import { cuandoCorre } from "@/lib/cuando";
import { resumenDe } from "@/lib/secciones";
import { BotonCopiar } from "./BotonCopiar";
import { conTono } from "./Pagina";
import { Button } from "@/components/ui/button";

/**
 * Los widgets de Mission Control. Cada uno es una lectura REAL del
 * historial: nada de números de utilería. El molde (Shell/Grande/Fila)
 * está adaptado del tablero de observabilidad de 21st.dev que eligió
 * Nico, con los tokens del tema y el texto en español.
 */

export function Shell({ titulo, meta, children }: { titulo: string; meta?: ReactNode; children: ReactNode }) {
  return (
    <section className="@container flex h-full flex-col gap-4 p-4 sm:p-5">
      <header className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2 text-[13px] leading-none">
        <h2 className="titulo-seccion truncate" title={titulo}>
          {titulo}
        </h2>
        {meta && <span className="text-muted-foreground shrink-0">{meta}</span>}
      </header>
      <div className="flex min-h-0 flex-1 flex-col">{children}</div>
    </section>
  );
}

export function Grande({ children, unidad }: { children: ReactNode; unidad?: string }) {
  return (
    <p className="titulo-vista leading-none tabular-nums">
      {children}
      {unidad && <span className="text-muted-foreground font-sans text-[13px] font-normal tracking-normal"> {unidad}</span>}
    </p>
  );
}

/** Un enlace a otra vista desde un widget: siempre el mismo botón, al pie. */
function Ir({ children, onClick }: { children: ReactNode; onClick: () => void }) {
  return (
    <Button variant="secondary" size="sm" onClick={onClick} className="mt-auto self-start">
      {children}
      <ArrowUpRight aria-hidden="true" />
    </Button>
  );
}

export function Fila({ children, valor }: { children: ReactNode; valor: ReactNode }) {
  return (
    <div className="flex items-center gap-2 text-[13px]">
      <dt className="flex min-w-0 items-center gap-2 truncate">{children}</dt>
      <dd className="text-muted-foreground ml-auto tabular-nums">{valor}</dd>
    </div>
  );
}

/**
 * Lo que dice una tarjeta que todavía no tiene nada: qué va a aparecer y, si
 * hay, el paso que lo trae. Un renglón gris en el medio de una tarjeta vacía
 * no se leía como un estado, se leía como algo roto.
 */
export function Vacio({
  icono,
  titulo,
  children,
  accion,
}: {
  icono: ReactNode;
  titulo: string;
  children?: ReactNode;
  accion?: ReactNode;
}) {
  return (
    <div className="my-auto flex flex-col items-start gap-3">
      <span aria-hidden="true" className="bg-secondary text-muted-foreground inline-flex size-10 items-center justify-center rounded-full [&_svg]:size-[18px]">
        {icono}
      </span>
      <div className="space-y-1">
        <p className="text-[13px] leading-snug font-semibold">{titulo}</p>
        {children && <p className="text-muted-foreground max-w-[44ch] text-[13px] leading-snug">{children}</p>}
      </div>
      {accion}
    </div>
  );
}

// «Sembrar», como el botón de la barra: lanza agentes ya. Una tarjeta se anota en el Tablero.
export function BotonNueva({ alNueva, texto = "Sembrar" }: { alNueva: () => void; texto?: string }) {
  return (
    <Button size="lg" onClick={alNueva}>
      <Sprout aria-hidden="true" className="size-3.5" />
      {texto}
    </Button>
  );
}

/**
 * Con tareas en la cola o agendadas pero ninguna siembra terminada, la
 * vista no muestra diez tarjetas en cero: muestra esta, que dice qué va a
 * pasar y lleva a escribir una tarea.
 */
export function WidgetPrimera({ alNueva }: { alNueva?: () => void }) {
  return (
    <Shell titulo="Tu primera siembra">
      <Vacio
        icono={<Sprout />}
        titulo="Los números llegan con la primera siembra terminada"
        accion={alNueva && <BotonNueva alNueva={alNueva} />}
      />
    </Shell>
  );
}

/* ── los widgets ─────────────────────────────────────── */

const DIAS_DE_SERIE = 14;

/** Cuántas siembras hubo cada uno de los últimos 14 días, del más viejo a hoy. */
function siembrasPorDia(turnos: readonly Turno[], hoy = new Date()): { dia: Date; cuantas: number }[] {
  const inicio = new Date(hoy.getFullYear(), hoy.getMonth(), hoy.getDate() - (DIAS_DE_SERIE - 1));
  const serie = Array.from({ length: DIAS_DE_SERIE }, (_, i) => ({
    dia: new Date(inicio.getFullYear(), inicio.getMonth(), inicio.getDate() + i),
    cuantas: 0,
  }));
  for (const t of turnos) {
    if (!t.cuando) continue;
    const f = new Date(t.cuando);
    const i = Math.round(
      (new Date(f.getFullYear(), f.getMonth(), f.getDate()).getTime() - inicio.getTime()) / 86_400_000,
    );
    if (i >= 0 && i < DIAS_DE_SERIE) serie[i]!.cuantas += 1;
  }
  return serie;
}

export function WidgetSiembras({ m, turnos }: { m: Metricas; turnos: readonly Turno[] }) {
  const serie = siembrasPorDia(turnos);
  const max = Math.max(...serie.map((d) => d.cuantas), 1);
  const enLaSerie = serie.reduce((n, d) => n + d.cuantas, 0);
  return (
    <Shell titulo="Siembras" meta={turnos[0]?.cuando ? cuandoFue(turnos[0].cuando) : undefined}>
      <Grande unidad={`${m.intentos} ${m.intentos === 1 ? "rama" : "ramas"}`}>{m.siembras}</Grande>
      {/* Gráfico antes que texto: cuántas por día en las dos últimas semanas; hoy, la marcada. */}
      <div
        role="img"
        aria-label={`Siembras por día en los últimos ${DIAS_DE_SERIE} días: ${enLaSerie}.`}
        className="mt-auto flex h-10 items-end gap-[3px]"
      >
        {serie.map((d, i) => (
          <span
            key={i}
            title={`${d.dia.toLocaleDateString("es-AR", { day: "2-digit", month: "2-digit" })}: ${d.cuantas}`}
            className={`min-w-0 flex-1 rounded-full ${
              d.cuantas === 0 ? "bg-foreground/8" : i === serie.length - 1 ? "bg-foreground/70" : "bg-foreground/25"
            }`}
            style={{ height: d.cuantas === 0 ? "3px" : `${Math.max((d.cuantas / max) * 100, 12)}%` }}
          />
        ))}
      </div>
    </Shell>
  );
}

export function WidgetTasa({ m }: { m: Metricas }) {
  const tasa = Number.isNaN(m.tasaDePaso) ? "—" : `${Math.round(m.tasaDePaso * 100)}%`;
  return (
    <Shell titulo="Pasan todas las fases">
      <Grande>{tasa}</Grande>
      <p className="text-muted-foreground mt-auto text-[13px] tabular-nums">
        {m.intentos === 0
          ? "todavía no hay ramas"
          : m.intentos - m.sinProbar > 0
            ? `${m.pasaron} de ${m.intentos - m.sinProbar} ramas`
            : "ninguna rama tenía fases"}
        {m.sinProbar > 0 && <span className="block">{m.sinProbar} sin probar</span>}
      </p>
    </Shell>
  );
}

export function WidgetCosto({ m }: { m: Metricas }) {
  const max = Math.max(...m.gastoPorSiembra, 0.0001);
  // Todo corrió con suscripción: no hay gasto por uso que mostrar.
  if (m.todoSuscripcion) {
    return (
      <Shell titulo="Costo" meta="con suscripción">
        <Grande>—</Grande>
        <p className="text-muted-foreground mt-auto text-[13px]">
          Las siembras corren con tu suscripción: acá no se paga por uso.
        </p>
      </Shell>
    );
  }
  return (
    <Shell titulo="Costo" meta="todas las siembras">
      <Grande>{plataDe(m.gastado, m.costoDesconocido)}</Grande>
      {m.gastoPorSiembra.length < 2 ? (
        <p className="text-muted-foreground mt-auto text-[13px]">la comparación aparece con la segunda siembra</p>
      ) : (
      <div
        role="img"
        aria-label={`Gasto por siembra, de la más vieja a la más nueva. Total ${plata(m.gastado)}.`}
        className="mt-auto flex h-10 items-end gap-[3px]"
      >
        {m.gastoPorSiembra.map((g, i) => (
          <span
            key={i}
            className={`w-2 rounded-full ${i === m.gastoPorSiembra.length - 1 ? "bg-foreground/70" : "bg-foreground/15"}`}
            style={{ height: `${Math.max((g / max) * 100, 8)}%` }}
          />
        ))}
      </div>
      )}
    </Shell>
  );
}

/**
 * Guardian: la rama principal, vigilada a cero tokens. En rojo, qué fase se
 * rompió, en qué commit y de quién; en verde, contra qué commit se compara.
 * La tarjeta para arreglarlo está en la Bandeja: acá solo se avisa.
 */
export function WidgetGuardian({ estado, alAbrirBandeja }: { estado: EstadoDeGuardian; alAbrirBandeja: () => void }) {
  const ultima = estado.ultima;
  if (!ultima) return null;
  const rojo = estado.regresiones.length > 0;
  return (
    <Shell
      titulo="Guardian"
      meta={
        <span className={rojo ? "text-murio" : "text-paso"}>
          {rojo ? `${estado.regresiones.length} ${estado.regresiones.length === 1 ? "fase rota" : "fases rotas"}` : "en verde"} · {cuandoFue(ultima.cuando)}
        </span>
      }
    >
      {rojo ? (
        <ul className="space-y-2">
          {estado.regresiones.map((g) => (
            <li key={g.fase} className="text-[13px] leading-snug">
              <span className="font-semibold">«{g.fase}»</span> se rompió en{" "}
              <code className="bg-secondary rounded-xl px-1.5 py-0.5 text-[12px]">{(g.culpable?.sha ?? g.vista).slice(0, 7)}</code>
              {g.culpable && (
                <span className="text-muted-foreground">
                  {" "}
                  · {g.culpable.autor}: «{g.culpable.mensaje}»
                </span>
              )}
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-[13px] leading-snug">
          La rama pasa todas sus fases en{" "}
          <code className="bg-secondary rounded-xl px-1.5 py-0.5 text-[12px]">{ultima.sha.slice(0, 7)}</code>.
        </p>
      )}
      <dl className="mt-3 space-y-2">
        {ultima.fases.map((f) => (
          <Fila key={f.nombre} valor={f.inestable ? "inestable" : reloj(f.ms)}>
            <span aria-hidden="true" className={`size-1.5 flex-none rounded-full ${f.paso ? "bg-paso" : "bg-murio"}`} />
            {f.nombre}
          </Fila>
        ))}
      </dl>
      {rojo && (
        <div className="mt-auto pt-3">
          <Ir onClick={alAbrirBandeja}>Ver la tarjeta en la Bandeja</Ir>
        </div>
      )}
    </Shell>
  );
}

export function WidgetUltima({ turno, alAbrir }: { turno: Turno | null; alAbrir: () => void }) {
  if (!turno) {
    return (
      <Shell titulo="Última siembra">
        <Vacio icono={<Sprout />} titulo="Todavía no sembraste nada acá">
          Cuando lo hagas, esta tarjeta muestra la última cosecha.
        </Vacio>
      </Shell>
    );
  }
  return (
    <Shell titulo="Última siembra" meta={cuandoFue(turno.cuando)}>
      <p className="line-clamp-2 text-[15px] leading-snug font-semibold break-words">{tituloDeTarea(turno.tarea)}</p>
      <dl className="mt-3 space-y-2">
        {turno.universos <= 1 ? (
          <Fila valor={resumenDe(turno)}>resultado</Fila>
        ) : (
          <Fila valor={`${turno.vivos} de ${turno.universos}`}>pasaron todas las fases</Fila>
        )}
        {!turno.suscripcion && <Fila valor={plataDe(turno.gastado, turno.costoDesconocido)}>costó</Fila>}
        <Fila valor={reloj(turno.ms)}>tardó</Fila>
      </dl>
      <Ir onClick={alAbrir}>Ver la cosecha</Ir>

    </Shell>
  );
}

export function WidgetVivo({ vivo, alAbrir }: { vivo: Vivo; alAbrir: () => void }) {
  return (
    <Shell
      titulo="Sembrando ahora"
      meta={
        <span className="text-corriendo flex items-center gap-1.5">
          <span aria-hidden="true" className="bg-corriendo animate-pulso-vivo size-1.5 rounded-full" />
          en vivo
        </span>
      }
    >
      <p className="line-clamp-2 text-[15px] leading-snug font-semibold break-words">{tituloDeTarea(vivo.tarea) || "…"}</p>
      <p className="text-muted-foreground mt-3 text-[13px] tabular-nums">{resumenDeVivo(vivo)}</p>
      <Ir onClick={alAbrir}>Mirarla en vivo</Ir>

    </Shell>
  );
}

export function WidgetVelocidad({ turnos }: { turnos: readonly Turno[] }) {
  const ultimo = turnos[0] ?? null;
  const max = Math.max(...turnos.map((t) => t.ms), 1);
  return (
    <Shell titulo="Cuánto tarda" meta="por siembra">
      <Grande>{ultimo ? reloj(ultimo.ms) : "—"}</Grande>
      {/* Con una sola siembra no hay nada que comparar: una barra suelta no dice nada. */}
      {turnos.length < 2 ? (
        <p className="text-muted-foreground mt-auto text-[13px]">la comparación aparece con la segunda siembra</p>
      ) : (
      <div
        role="img"
        aria-label="Duración de cada siembra, de la más vieja a la más nueva."
        className="mt-auto flex h-10 items-end gap-[3px]"
      >
        {[...turnos].reverse().map((t, i, lista) => (
          <span
            key={t.id}
            className={`w-2 rounded-full ${i === lista.length - 1 ? "bg-foreground/70" : "bg-foreground/15"}`}
            style={{ height: `${Math.max((t.ms / max) * 100, 8)}%` }}
          />
        ))}
      </div>
      )}
    </Shell>
  );
}

export function WidgetGratis({ m }: { m: Metricas }) {
  const cortados = m.intentos - m.pasaron;
  return (
    <Shell titulo="Cortes sin gastar">
      <Grande>{cortados > 0 ? `${m.cortadosGratis} de ${cortados}` : "—"}</Grande>
      <p className="text-muted-foreground mt-auto max-w-[24ch] text-[13px]">
        {cortados > 0
          ? "ramas frenadas en fases gratis, antes de la revisión con modelo"
          : "cuando una rama se corte, acá se ve si costó algo"}
      </p>
    </Shell>
  );
}

/**
 * El estado de algo, en su color (ver app.css): corriendo en ámbar, salió bien en verde, falló
 * en rojo, esperando su turno en azul, esperándote a vos en turquesa. Sin estado, sin color.
 */
type Tono = "hacer" | "corriendo" | "paso" | "murio" | "revisar" | null;

function Estado({ tono, children, pulso = false }: { tono: Tono; children: ReactNode; pulso?: boolean }) {
  return (
    <span
      className={`inline-flex flex-none items-center gap-1 rounded-full px-2 py-0.5 text-[12px] leading-4 font-semibold ${
        tono ? "con-tono" : "bg-secondary text-muted-foreground"
      }`}
      style={tono ? conTono(`var(--${tono})`) : undefined}
    >
      {pulso && <span aria-hidden="true" className="punto-tono size-1 animate-pulse rounded-full" />}
      {children}
    </span>
  );
}

const ESTADO_DE_TAREA: Record<TareaDeCola["estado"], { texto: string; tono: Tono }> = {
  esperando: { texto: "en fila", tono: "hacer" },
  trabajando: { texto: "trabajando", tono: "corriendo" },
  lista: { texto: "lista", tono: "paso" },
  "no-salio": { texto: "no salió", tono: "murio" },
  // Un choque con otra rama no es una falla: lo tenés que mirar vos.
  "en-conflicto": { texto: "en conflicto", tono: "revisar" },
};

/**
 * La cola: varias tareas a la vez, cada una en su rama. Lo que importa de
 * un vistazo es cuáles quedaron listas y en qué orden se mergean; por eso
 * el botón copia los git merge tal cual.
 */
export function WidgetCola({ tareas }: { tareas: readonly TareaDeCola[] }) {
  const recientes = [...tareas].slice(-6).reverse();
  const listas = tareas.filter((t) => t.estado === "lista");
  // Las que se sembraron encima de otra (por un choque o porque dependían de ella) van después de esa.
  const encima = (t: TareaDeCola) => t.sobre ?? t.dependeDe;
  const orden = [...listas].sort((a, b) => (encima(a) === b.id ? 1 : encima(b) === a.id ? -1 : 0));
  const comandos = orden.map((t) => `git merge ${t.rama}`).join("\n");

  return (
    <Shell titulo="Cola" meta={`${listas.length} de ${tareas.length} listas`}>
      <ul className="space-y-3">
        {recientes.map((t) => {
          const estado = ESTADO_DE_TAREA[t.estado];
          return (
            // El nombre se lleva todo el ancho y el estado con su motivo va abajo: en el
            // teléfono no hay hover que muestre el title de lo que se cortaba.
            <li key={t.id} className="min-w-0 text-[13px]">
              <p className="line-clamp-2 font-medium break-words" title={t.tarea}>
                {t.titulo ?? tituloDeTarea(t.tarea)}
              </p>
              <div className="mt-1 flex min-w-0 items-start gap-2">
                <Estado tono={estado.tono} pulso={t.estado === "trabajando"}>
                  {estado.texto}
                </Estado>
                {t.estado === "lista" && t.rama ? (
                  <span className="text-muted-foreground min-w-0 truncate font-mono text-[12px] leading-5" title={t.porQue ?? t.rama}>
                    {encima(t) ? "↳ " : ""}
                    {t.rama.split("/").slice(-2).join("/")}
                  </span>
                ) : t.porQue ? (
                  <span className="text-muted-foreground line-clamp-2 min-w-0 text-[12px] leading-5 break-words">{t.porQue}</span>
                ) : null}
              </div>
            </li>
          );
        })}
      </ul>
      {listas.length > 0 && (
        <div className="mt-auto flex items-center justify-between gap-3 pt-3">
          <p className="text-muted-foreground text-[12px]">
            {listas.length === 1 ? "Una rama lista para mergear." : `Las ${listas.length} entran juntas${orden.some((t) => encima(t)) ? ", en este orden" : ""}.`}
          </p>
          <BotonCopiar alCopiar={() => navigator.clipboard.writeText(comandos).then(() => true, () => false)} rotulo="Copiar los git merge" chico />
        </div>
      )}
    </Shell>
  );
}

const ESTADO_DE_TURNO: Record<TurnoAgendado["estado"], { texto: string; tono: Tono }> = {
  agendado: { texto: "agendado", tono: "hacer" },
  corriendo: { texto: "corriendo", tono: "corriendo" },
  hecho: { texto: "hecho", tono: "paso" },
  fallo: { texto: "no salió", tono: "murio" },
  cancelado: { texto: "cancelado", tono: null },
};

/**
 * La agenda: lo que Dolphin va a correr solo, y lo último que corrió. Lo
 * agendado se cancela desde acá.
 */
export function WidgetAgenda({ turnos, alCancelar }: { turnos: readonly TurnoAgendado[]; alCancelar: (id: string) => void }) {
  const ahora = new Date();
  const proximos = turnos
    .filter((t) => t.estado === "agendado" || t.estado === "corriendo")
    .sort((a, b) => a.cuando.localeCompare(b.cuando));
  const recientes = turnos
    .filter((t) => t.estado === "hecho" || t.estado === "fallo")
    .sort((a, b) => (b.corrio ?? "").localeCompare(a.corrio ?? ""))
    .slice(0, 3);
  const filas = [...proximos, ...recientes].slice(0, 6);

  return (
    <Shell titulo="Agenda" meta={proximos.length === 0 ? "nada por correr" : `${proximos.length} por correr`}>
      {filas.length === 0 ? (
        <Vacio icono={<CalendarClock />} titulo="Nada agendado">
          En Nueva, «Cuándo» deja una tarea para más tarde.
        </Vacio>
      ) : (
        <ul className="space-y-2">
          {filas.map((t) => {
            const estado = ESTADO_DE_TURNO[t.estado];
            const cuando = t.estado === "hecho" || t.estado === "fallo" ? new Date(t.corrio ?? t.cuando) : new Date(t.cuando);
            return (
              <li key={t.id} className="flex min-w-0 items-start gap-2.5 text-[13px] leading-5">
                <span className="text-muted-foreground w-[92px] flex-none text-[12px] leading-5 tabular-nums">{cuandoCorre(cuando, ahora)}</span>
                <span className="min-w-0 flex-1" title={t.tareas.join("\n")}>
                  <span className="block truncate">
                    {t.tareas[0]?.split("\n")[0]}
                    {t.tareas.length > 1 && <span className="text-muted-foreground"> +{t.tareas.length - 1}</span>}
                  </span>
                  {/* Por qué no salió, a la vista: en el teléfono no hay hover que muestre el title. */}
                  {t.estado === "fallo" && t.porQue && <span className="text-murio line-clamp-2 block text-[12px] break-words">{t.porQue}</span>}
                </span>
                {t.repetir === "diario" && t.estado === "agendado" && <span className="text-muted-foreground flex-none text-[12px]">diario</span>}
                <Estado tono={estado.tono} pulso={t.estado === "corriendo"}>
                  {estado.texto}
                </Estado>
                {(t.estado === "hecho" || t.estado === "fallo") && t.parte && (
                  // Lo que corrió solo, contado: el parte de esa corrida.
                  <Button asChild variant="ghost" size="icon-sm" className="-my-1">
                    <a
                      href={conProyecto(`/partes/${encodeURIComponent(t.parte)}`)}
                      target="_blank"
                      rel="noreferrer"
                      aria-label={`Ver el parte de «${t.tareas[0]?.split("\n")[0] ?? "el turno"}»`}
                      title="Ver el parte"
                    >
                      <FileText aria-hidden="true" className="size-3.5" />
                    </a>
                  </Button>
                )}
                {t.estado === "agendado" && (
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    aria-label={`Cancelar «${t.tareas[0]?.split("\n")[0] ?? "el turno"}»`}
                    onClick={() => alCancelar(t.id)}
                    className="hover:text-murio -my-1"
                  >
                    <X aria-hidden="true" className="size-3.5" />
                  </Button>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </Shell>
  );
}
