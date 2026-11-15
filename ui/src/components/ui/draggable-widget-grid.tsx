/**
 * Draggable Widget Grid — vendor adaptado.
 *
 * Origen: «Draggable Widget Grid» de 21st.dev (Motion): un tablero de
 * widgets que se reacomodan arrastrando, con un tiler exacto que arma un
 * rectángulo sin huecos a cualquier cantidad de columnas. Mouse y lápiz
 * arrastran directo; el touch usa presión larga (la página sigue
 * scrolleando); con teclado, Alt + flechas. Adaptación nuestra: textos y
 * accesibilidad en español. La física y el tiler no se tocan.
 */

import {
  memo,
  useCallback,
  useEffect,
  useId,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type KeyboardEvent as ReactKeyboardEvent,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
} from "react";
import { MotionConfig, motion, useDragControls } from "motion/react";

/** Columnas × filas que ocupa: `sm` 1×1, `wide` 2×1, `tall` 1×2, `lg` 2×2. */
export type WidgetSize = "sm" | "wide" | "tall" | "lg";

export interface WidgetItem {
  id: string;
  size: WidgetSize;
  label?: string;
}

export interface DraggableWidgetGridProps {
  items?: WidgetItem[];
  onChange?: (items: WidgetItem[]) => void;
  renderItem?: (item: WidgetItem, size: WidgetSize) => ReactNode;
  editable?: boolean;
  maxColumns?: number;
  cellSize?: number;
  gap?: number;
  radius?: number;
  /** Alto de fila como fracción del ancho de columna (1 = celdas cuadradas).
   *  Adaptación nuestra: nuestros widgets son más anchos que altos. */
  rowRatio?: number;
  /** Alto mínimo de fila en px. Adaptación nuestra: en el teléfono, con dos
   *  columnas angostas, la fila quedaba en 132 px y el contenido se cortaba. */
  minRowHeight?: number;
  /** Si los widgets entran con su animación. Adaptación nuestra: cuando la grilla
   *  se rearma (aparece la cola, una siembra en vivo) no repiten la entrada. */
  animateEntrance?: boolean;
  /** Por debajo de este ancho (px de la grilla) los widgets se apilan: lo ancho y lo
   *  grande a todo el ancho, lo chico de a dos, cada fila del alto de su contenido y
   *  sin arrastrar. Adaptación nuestra: a 719 px (la consola embebida) la disposición
   *  del ancho grande dejaba una fila vacía y columnas huecas. */
  stackBelow?: number;
  /** El orden de los widgets apilados. Sin él, el de `items`. Adaptación nuestra: el
   *  orden que se arrastró en la pantalla ancha no tiene por qué servir apilado. */
  stackItems?: WidgetItem[];
  className?: string;
}

const SPANS: { [K in WidgetSize]: { col: number; row: number } } = {
  sm: { col: 1, row: 1 },
  wide: { col: 2, row: 1 },
  tall: { col: 1, row: 2 },
  lg: { col: 2, row: 2 },
};

const SIZE_LABELS: { [K in WidgetSize]: string } = {
  sm: "chico",
  wide: "ancho",
  tall: "alto",
  lg: "grande",
};

const DEFAULT_ITEMS: WidgetItem[] = [
  { id: "widget-1", size: "wide" },
  { id: "widget-2", size: "sm" },
  { id: "widget-3", size: "sm" },
];

const useIsoLayoutEffect = typeof window === "undefined" ? useEffect : useLayoutEffect;

function sizeOf(w: number, h: number): WidgetSize {
  if (w >= 2 && h >= 2) return "lg";
  if (w >= 2) return "wide";
  if (h >= 2) return "tall";
  return "sm";
}

interface Placement {
  id: string;
  col: number;
  row: number;
  w: number;
  h: number;
}

interface Box {
  col: number;
  row: number;
  w: number;
  h: number;
}

const overlaps = (a: Box, b: Box) =>
  a.col < b.col + b.w && b.col < a.col + a.w && a.row < b.row + b.h && b.row < a.row + a.h;

const contains = (outer: Box, inner: Box) =>
  inner.col >= outer.col &&
  inner.row >= outer.row &&
  inner.col + inner.w <= outer.col + outer.w &&
  inner.row + inner.h <= outer.row + outer.h;

function spanOf(item: WidgetItem, columns: number) {
  return { w: Math.min(SPANS[item.size].col, columns), h: SPANS[item.size].row };
}

/** Apilado: todo ocupa una fila (del alto de su contenido); lo chico, media. */
function stackedSpanOf(item: WidgetItem, columns: number) {
  return { w: item.size === "sm" ? 1 : columns, h: 1 };
}

/** Ubica todo: primero un tiling exacto (sin huecos); si no, un empaquetador por filas. */
function layout(items: WidgetItem[], columns: number, stacked = false): Placement[] {
  if (columns < 1 || items.length === 0) return [];
  // Apilado se respeta el orden tal cual: el tiler podría subir un chico por encima de uno ancho.
  if (stacked) return pack(items, columns, stackedSpanOf);
  return tile(items, columns) ?? pack(items, columns);
}

const TILING_BUDGET = 20000;

function tile(items: WidgetItem[], columns: number): Placement[] | null {
  const spans = items.map((item) => spanOf(item, columns));
  const area = spans.reduce((n, s) => n + s.w * s.h, 0);
  const rows = Math.ceil(area / columns);
  const grid: boolean[] = new Array(rows * columns).fill(false);
  const used: boolean[] = new Array(items.length).fill(false);
  const out: Placement[] = [];
  let budget = TILING_BUDGET;

  const fits = (w: number, h: number, r: number, c: number) => {
    if (c + w > columns || r + h > rows) return false;
    for (let y = r; y < r + h; y++) for (let x = c; x < c + w; x++) if (grid[y * columns + x]) return false;
    return true;
  };
  const mark = (w: number, h: number, r: number, c: number, v: boolean) => {
    for (let y = r; y < r + h; y++) for (let x = c; x < c + w; x++) grid[y * columns + x] = v;
  };

  const place = (count: number): boolean => {
    if (count === items.length) return true;
    if (--budget < 0) return false;
    const i = grid.indexOf(false);
    if (i < 0) return false;
    const r = Math.floor(i / columns);
    const c = i % columns;
    const tried = new Set<string>();
    for (let k = 0; k < items.length; k++) {
      if (used[k]) continue;
      const { w, h } = spans[k]!;
      const shape = `${w}x${h}`;
      if (tried.has(shape) || !fits(w, h, r, c)) continue;
      tried.add(shape);
      used[k] = true;
      mark(w, h, r, c, true);
      out.push({ id: items[k]!.id, col: c, row: r, w, h });
      if (place(count + 1)) return true;
      out.pop();
      mark(w, h, r, c, false);
      used[k] = false;
    }
    return false;
  };

  return place(0) ? out : null;
}

function pack(items: WidgetItem[], columns: number, spanFor = spanOf): Placement[] {
  const out: Placement[] = [];
  let row = 0;
  let queue = items.map((item) => ({ id: item.id, ...spanFor(item, columns) }));

  while (queue.length > 0) {
    const height = Math.max(...queue.slice(0, columns).map((q) => q.h));
    const cells: boolean[] = new Array(height * columns).fill(false);
    const band: Placement[] = [];
    const rest: typeof queue = [];

    for (const q of queue) {
      let spot = -1;
      for (let i = 0; i < cells.length && spot < 0; i++) {
        const r = Math.floor(i / columns);
        const c = i % columns;
        if (c + q.w > columns || r + q.h > height) continue;
        let free = true;
        for (let y = r; y < r + q.h && free; y++)
          for (let x = c; x < c + q.w && free; x++) if (cells[y * columns + x]) free = false;
        if (free) spot = i;
      }
      // Adaptación nuestra: un widget que no entra en la banda ya no la cierra; los que vienen
      // detrás y sí entran rellenan el hueco. A 768 px quedaba una columna vacía de 372 px.
      if (spot < 0) {
        rest.push(q);
        continue;
      }
      const r = Math.floor(spot / columns);
      const c = spot % columns;
      for (let y = r; y < r + q.h; y++) for (let x = c; x < c + q.w; x++) cells[y * columns + x] = true;
      band.push({ id: q.id, col: c, row: r, w: q.w, h: q.h });
    }

    // Adaptación nuestra: la banda mide lo que de verdad ocupa. Con un ancho arriba y dos
    // grandes que no entraban al lado, la banda medía 2 y su segunda fila quedaba vacía.
    const used = Math.max(...band.map((p) => p.row + p.h));
    const free = (r: number, c: number) => r < used && c < columns && !cells[r * columns + c];

    // Adaptación nuestra: lo que tiene la columna de al lado libre en todas sus filas se
    // estira hasta ocuparla, sea del alto que sea. A 3 columnas, un grande dejaba una
    // columna entera vacía a su derecha.
    for (const p of band) {
      while (p.col + p.w < columns) {
        let ok = true;
        for (let y = p.row; y < p.row + p.h && ok; y++) if (!free(y, p.col + p.w)) ok = false;
        if (!ok) break;
        for (let y = p.row; y < p.row + p.h; y++) cells[y * columns + p.col + p.w] = true;
        p.w += 1;
      }
    }

    for (let i = 0; i < used * columns; i++) {
      if (cells[i]) continue;
      const r = Math.floor(i / columns);
      const c = i % columns;
      const above = band.find((p) => p.row + p.h === r && p.col === c && p.w === 1);
      if (!above) continue;
      above.h += 1;
      cells[i] = true;
    }

    out.push(...band.map((p) => ({ ...p, row: p.row + row })));
    row += used;
    queue = rest;
  }
  return out;
}

/** Reordena `items` al orden de lectura de su layout, si produce el mismo layout. */
function canonical(items: WidgetItem[], columns: number): WidgetItem[] {
  const places = layout(items, columns);
  if (places.length !== items.length) return items;
  const byId = new Map(items.map((item) => [item.id, item]));
  const sorted = [...places]
    .sort((a, b) => a.row - b.row || a.col - b.col)
    .map((p) => byId.get(p.id) as WidgetItem);
  if (sorted.every((item, i) => item === items[i])) return items;
  const at = new Map(places.map((p) => [p.id, p]));
  const same = layout(sorted, columns).every((p) => {
    const q = at.get(p.id);
    return q && q.col === p.col && q.row === p.row && q.w === p.w && q.h === p.h;
  });
  return same ? sorted : items;
}

function moveTo(items: WidgetItem[], id: string, index: number) {
  const from = items.findIndex((item) => item.id === id);
  if (from < 0 || from === index || index < 0 || index >= items.length) return items;
  const next = [...items];
  const [moved] = next.splice(from, 1);
  next.splice(index, 0, moved!);
  return next;
}

const sameOrder = (a: WidgetItem[], b: WidgetItem[]) =>
  a.length === b.length && a.every((item, i) => item.id === b[i]!.id);

interface Slot {
  left: number;
  top: number;
  right: number;
  bottom: number;
}

interface Candidate {
  order: WidgetItem[];
  slot: Slot;
}

/** Fracción del slot que el centro arrastrado tiene que invadir para tomarlo. */
const ENTER = 0.18;

function choose(home: Slot, candidates: Candidate[], cx: number, cy: number): WidgetItem[] | null {
  const distance = (s: Slot, inset: number) => {
    const ix = (s.right - s.left) * inset;
    const iy = (s.bottom - s.top) * inset;
    const dx = Math.max(s.left + ix - cx, 0, cx - (s.right - ix));
    const dy = Math.max(s.top + iy - cy, 0, cy - (s.bottom - iy));
    return Math.hypot(dx, dy);
  };
  const toCentre = (s: Slot) => Math.hypot((s.left + s.right) / 2 - cx, (s.top + s.bottom) / 2 - cy);

  let best = distance(home, 0);
  if (best === 0) return null;
  let pick: WidgetItem[] | null = null;
  let bestCentre = Infinity;
  for (const { order, slot } of candidates) {
    const d = distance(slot, ENTER);
    const c = toCentre(slot);
    if (d < best || (d === best && pick && c < bestCentre)) {
      best = d;
      bestCentre = c;
      pick = order;
    }
  }
  return pick;
}

function candidatesFor(
  items: WidgetItem[],
  id: string,
  columns: number,
  toSlot: (box: Box) => Slot,
): Candidate[] {
  const places = layout(items, columns);
  const me = places.find((p) => p.id === id);
  if (!me) return [];
  const byId = new Map(items.map((item) => [item.id, item]));
  const rows = Math.max(...places.map((p) => p.row + p.h));
  const out: Candidate[] = [];

  for (let row = 0; row + me.h <= rows; row++) {
    for (let col = 0; col + me.w <= columns; col++) {
      const area = { col, row, w: me.w, h: me.h };
      if (overlaps(area, me)) continue;
      const group = places.filter((p) => overlaps(p, area));
      if (group.length < 2 || !group.every((p) => contains(area, p))) continue;
      const moved = places.map((p) =>
        p.id === id
          ? { ...p, col, row }
          : group.includes(p)
            ? { ...p, col: p.col - col + me.col, row: p.row - row + me.row }
            : p,
      );
      moved.sort((a, b) => a.row - b.row || a.col - b.col);
      out.push({
        order: moved.map((p) => byId.get(p.id) as WidgetItem),
        slot: toSlot(area),
      });
    }
  }

  const from = items.findIndex((item) => item.id === id);
  for (let i = 0; i < items.length; i++) {
    if (i === from) continue;
    const order = moveTo(items, id, i);
    const p = layout(order, columns).find((q) => q.id === id);
    if (p) out.push({ order, slot: toSlot(p) });
  }
  return out;
}

const SPRING = { type: "spring", visualDuration: 0.38, bounce: 0.16 } as const;
const LIFT = { type: "spring", visualDuration: 0.26, bounce: 0.32 } as const;
const LIFT_SCALE = 1.06;
const SETTLE_MS = 40;
const LANDED_MS = 620;
const LONG_PRESS_MS = 350;
const PRESS_SLOP = 8;
const SHADOW_REST = "0px 1px 2px 0px rgba(0,0,0,0.12), 0px 0px 0px 0px rgba(0,0,0,0)";
const SHADOW_LIFTED = "0px 28px 60px -16px rgba(0,0,0,0.45), 0px 10px 24px -8px rgba(0,0,0,0.3)";

interface Press {
  timer: number;
  pointerId: number;
  x: number;
  y: number;
}

type Phase = "idle" | "holding" | "lifted";

interface WidgetHandlers {
  start: (id: string) => void;
  drag: () => void;
  end: (id: string) => void;
  key: (e: ReactKeyboardEvent, id: string) => void;
  swallow: () => boolean;
  suppressClick: () => void;
}

const Widget = memo(function Widget({
  item,
  col,
  row,
  w,
  h,
  columns,
  rows,
  editable,
  held,
  raised,
  landed,
  handlers,
  hintId,
  position,
  count,
  renderItem,
  entrar,
}: {
  item: WidgetItem;
  col: number;
  row: number;
  w: number;
  h: number;
  columns: number;
  rows: number;
  editable: boolean;
  held: boolean;
  raised: boolean;
  landed: boolean;
  handlers: WidgetHandlers;
  hintId: string;
  position: number;
  count: number;
  renderItem?: (item: never, size: WidgetSize) => ReactNode;
  entrar: boolean;
}) {
  const controls = useDragControls();
  const node = useRef(null as HTMLDivElement | null);
  const press = useRef(null as Press | null);
  const lifted = useRef(false);
  const cleanup = useRef(null as (() => void) | null);
  const [phase, setPhase] = useState("idle" as Phase);

  const release = useCallback(() => {
    if (press.current) window.clearTimeout(press.current.timer);
    press.current = null;
    lifted.current = false;
    cleanup.current?.();
    cleanup.current = null;
    setPhase("idle");
  }, []);

  useEffect(() => {
    const el = node.current;
    if (!el) return;
    const block = (e: TouchEvent) => {
      if (lifted.current) e.preventDefault();
    };
    el.addEventListener("touchmove", block, { passive: false });
    return () => {
      el.removeEventListener("touchmove", block);
      if (press.current) window.clearTimeout(press.current.timer);
      cleanup.current?.();
    };
  }, []);

  const onPointerDown = (e: ReactPointerEvent) => {
    if (!editable || e.button !== 0 || !e.isPrimary) return;
    if (e.pointerType !== "touch") {
      controls.start(e);
      return;
    }
    if (press.current || lifted.current) return;
    const origin = e.nativeEvent;
    const pointerId = e.pointerId;
    setPhase("holding");
    press.current = {
      pointerId,
      x: e.clientX,
      y: e.clientY,
      timer: window.setTimeout(() => {
        press.current = null;
        lifted.current = true;
        setPhase("lifted");
        navigator.vibrate?.(10);
        controls.start(origin);
        const done = (ev: PointerEvent) => {
          if (ev.pointerId !== pointerId) return;
          handlers.suppressClick();
          release();
        };
        window.addEventListener("pointerup", done);
        window.addEventListener("pointercancel", done);
        cleanup.current = () => {
          window.removeEventListener("pointerup", done);
          window.removeEventListener("pointercancel", done);
        };
      }, LONG_PRESS_MS),
    };
  };

  const onPointerMove = (e: ReactPointerEvent) => {
    const p = press.current;
    if (p && e.pointerId === p.pointerId && Math.hypot(e.clientX - p.x, e.clientY - p.y) > PRESS_SLOP) release();
  };

  const onPointerEnd = (e: ReactPointerEvent) => {
    if (press.current?.pointerId === e.pointerId) release();
  };

  const delay = (col / Math.max(columns, 1) + row / Math.max(rows, 1)) * 0.26;

  return (
    <motion.div
      ref={node}
      role="listitem"
      data-slot="widget"
      data-widget-id={item.id}
      tabIndex={editable ? 0 : undefined}
      aria-label={item.label ?? `widget ${SIZE_LABELS[item.size]}`}
      aria-describedby={editable ? hintId : undefined}
      aria-posinset={position}
      aria-setsize={count}
      layout="position"
      drag={editable}
      dragListener={false}
      dragControls={controls}
      dragSnapToOrigin
      dragMomentum={false}
      onDragStart={() => handlers.start(item.id)}
      onDrag={handlers.drag}
      onDragEnd={() => handlers.end(item.id)}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerEnd}
      onPointerCancel={onPointerEnd}
      onContextMenu={(e) => {
        if (phase !== "idle") e.preventDefault();
      }}
      onKeyDown={(e) => handlers.key(e, item.id)}
      onClickCapture={(e) => {
        // Solo el clic que cierra un arrastre se traga: antes cualquier enlace de un widget
        // («Ver el parte» de la Agenda) quedaba muerto mientras el tablero se podía ordenar.
        if (handlers.swallow()) {
          e.preventDefault();
          e.stopPropagation();
        }
      }}
      animate={{
        scale: phase === "holding" ? 0.97 : phase === "lifted" ? LIFT_SCALE : 1,
        boxShadow: phase === "lifted" ? SHADOW_LIFTED : SHADOW_REST,
      }}
      whileDrag={{
        scale: LIFT_SCALE,
        boxShadow: SHADOW_LIFTED,
        transition: LIFT,
      }}
      transition={SPRING}
      // Why outline y no ring: el ring es un box-shadow, y motion pisa boxShadow inline (la sombra de reposo): el foco no se veía.
      className={`relative min-w-0 rounded-[var(--widget-radius)] outline-none focus-visible:outline-2 focus-visible:outline-solid focus-visible:outline-offset-2 focus-visible:outline-foreground/70 [&_a]:[-webkit-user-drag:none] [&_img]:[-webkit-user-drag:none] ${
        editable
          ? "cursor-grab touch-pan-y touch-pinch-zoom select-none [-webkit-touch-callout:none] active:cursor-grabbing"
          : ""
      }`}
      style={{
        gridColumn: `${col + 1} / span ${w}`,
        gridRow: `${row + 1} / span ${h}`,
        zIndex: held ? 20 : raised ? 10 : 0,
      }}
    >
      <motion.div
        initial={entrar ? { opacity: 0, y: 18, scale: 0.97 } : false}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={{
          type: "spring",
          visualDuration: 0.6,
          bounce: 0.12,
          delay,
        }}
        // En claro el vidrio es blanco sobre blanco y solo la sombra lo separaba: la tarjeta va un
        // escalón más honda que el lienzo, como en el oscuro va uno más clara.
        className={`relative isolate flex h-full w-full flex-col overflow-hidden rounded-[var(--widget-radius)] vidrio in-data-[tema=claro]:bg-card/95! text-card-foreground ring-inset transition-shadow duration-300 ${
          landed ? "ring-2 ring-foreground/40" : ""
        }`}
      >
        {renderItem?.(item as never, sizeOf(w, h))}
      </motion.div>
    </motion.div>
  );
});

export function DraggableWidgetGrid({
  items: initialItems,
  onChange,
  renderItem,
  editable: editableProp = true,
  maxColumns = 4,
  cellSize = 215,
  gap = 12,
  radius = 24,
  rowRatio = 1,
  minRowHeight = 0,
  animateEntrance = true,
  stackBelow = 0,
  stackItems,
  className = "",
}: DraggableWidgetGridProps) {
  const altoDeFila = (unit: number) => Math.max(Math.round(unit * rowRatio), minRowHeight);
  const [items, setItems] = useState(() => initialItems ?? DEFAULT_ITEMS);
  const grid = useRef(null as HTMLDivElement | null);
  const hintId = useId();
  const minColumns = Math.min(2, Math.max(1, maxColumns));

  const [metrics, setMetrics] = useState({ unit: 0, columns: 0, stacked: false });
  useIsoLayoutEffect(() => {
    const el = grid.current;
    if (!el) return;
    const measure = () => {
      const width = el.getBoundingClientRect().width;
      if (width < 1) return;
      const stacked = width < stackBelow;
      const columns = stacked ? minColumns : Math.max(minColumns, Math.min(maxColumns, Math.round(width / cellSize)));
      const unit = (width - gap * (columns - 1)) / columns;
      setMetrics((was) =>
        was.columns === columns && was.stacked === stacked && Math.abs(was.unit - unit) < 0.5
          ? was
          : { unit, columns, stacked },
      );
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    return () => observer.disconnect();
  }, [maxColumns, minColumns, cellSize, gap, stackBelow]);

  const columns = metrics.columns || Math.max(minColumns, maxColumns);
  const stacked = metrics.stacked;
  // Apilado no se arrastra: el orden que se guardara serviría para la pantalla ancha, no para esta.
  const editable = editableProp && !stacked;
  const visible = useMemo(() => {
    if (!stacked || !stackItems) return items;
    const ids = new Set(items.map((item) => item.id));
    return stackItems.filter((item) => ids.has(item.id));
  }, [stacked, stackItems, items]);
  const placements = useMemo(() => layout(visible, columns, stacked), [visible, columns, stacked]);
  const rows = placements.reduce((n, p) => Math.max(n, p.row + p.h), 0);

  const latest = useRef({ items, metrics, onChange });
  latest.current.metrics = metrics;
  latest.current.onChange = onChange;
  useIsoLayoutEffect(() => {
    latest.current.items = items;
  }, [items]);

  const commit = useCallback((next: WidgetItem[]) => {
    latest.current.items = next;
    setItems(next);
  }, []);

  const toSlot = useCallback(
    (box: Box): Slot => {
      const el = grid.current;
      const { unit } = latest.current.metrics;
      const rect = el?.getBoundingClientRect();
      const colStep = unit + gap;
      // Adaptación nuestra: las filas crecen con su contenido, así que no miden todas lo
      // mismo. Se leen del navegador; las que todavía no existen, con el alto mínimo.
      const tracks = el
        ? getComputedStyle(el).gridTemplateRows.split(" ").map(parseFloat).filter((n) => !Number.isNaN(n))
        : [];
      const alto = (i: number) => tracks[i] ?? altoDeFila(unit);
      let top = rect?.top ?? 0;
      for (let i = 0; i < box.row; i++) top += alto(i) + gap;
      let bottom = top - gap;
      for (let i = box.row; i < box.row + box.h; i++) bottom += alto(i) + gap;
      const left = (rect?.left ?? 0) + box.col * colStep;
      return {
        left,
        top,
        right: left + box.w * colStep - gap,
        bottom,
      };
    },
    [gap, rowRatio, minRowHeight],
  );

  const [held, setHeld] = useState(null as string | null);
  const [raised, setRaised] = useState(null as string | null);
  const [landed, setLanded] = useState(null as string | null);
  const dragging = useRef(null as string | null);
  const startOrder = useRef(null as WidgetItem[] | null);
  const frame = useRef(0);
  const lastMove = useRef(0);
  const swallowUntil = useRef(0);
  const ring = useRef(0);
  const refocus = useRef(null as string | null);

  const step = useCallback(
    (force = false) => {
      frame.current = 0;
      const id = dragging.current;
      const { items: current, metrics: m } = latest.current;
      const el = id
        ? (grid.current?.querySelector(`[data-widget-id="${CSS.escape(id)}"]`) as HTMLElement | null)
        : null;
      if (!id || !el || !m.columns) return;
      const now = performance.now();
      if (!force && now - lastMove.current < SETTLE_MS) {
        frame.current = requestAnimationFrame(() => step());
        return;
      }
      const me = layout(current, m.columns).find((p) => p.id === id);
      if (!me) return;
      const r = el.getBoundingClientRect();
      const order = choose(
        toSlot(me),
        candidatesFor(current, id, m.columns, toSlot),
        r.left + r.width / 2,
        r.top + r.height / 2,
      );
      if (!order) return;
      lastMove.current = now;
      commit(canonical(order, m.columns));
    },
    [toSlot, commit],
  );

  useEffect(
    () => () => {
      cancelAnimationFrame(frame.current);
      window.clearTimeout(ring.current);
    },
    [],
  );

  useIsoLayoutEffect(() => {
    const id = refocus.current;
    if (!id) return;
    refocus.current = null;
    const el = grid.current?.querySelector(`[data-widget-id="${CSS.escape(id)}"]`) as HTMLElement | null;
    el?.focus();
  }, [items]);

  const handlers: WidgetHandlers = useMemo(
    () => ({
      start: (id) => {
        dragging.current = id;
        startOrder.current = latest.current.items;
        lastMove.current = 0;
        setHeld(id);
        setRaised(id);
        window.addEventListener(
          "pointerup",
          () => {
            swallowUntil.current = performance.now() + 300;
          },
          { once: true, capture: true },
        );
      },
      drag: () => {
        if (!frame.current) frame.current = requestAnimationFrame(() => step());
      },
      end: (id) => {
        cancelAnimationFrame(frame.current);
        step(true);
        frame.current = 0;
        dragging.current = null;
        setHeld(null);
        setLanded(id);
        window.clearTimeout(ring.current);
        ring.current = window.setTimeout(() => {
          setLanded(null);
          setRaised(null);
        }, LANDED_MS);
        const before = startOrder.current;
        startOrder.current = null;
        const after = latest.current.items;
        if (before && !sameOrder(before, after)) latest.current.onChange?.(after);
      },
      key: (e, id) => {
        if (!editable || !e.altKey) return;
        if ((e.target as HTMLElement).closest("input, textarea, select")) return;
        const delta =
          e.key === "ArrowRight" || e.key === "ArrowDown"
            ? 1
            : e.key === "ArrowLeft" || e.key === "ArrowUp"
              ? -1
              : 0;
        if (!delta) return;
        e.preventDefault();
        const { items: current, metrics: m } = latest.current;
        const cols = m.columns || maxColumns;
        const from = current.findIndex((item) => item.id === id);
        for (let to = from + delta; to >= 0 && to < current.length; to += delta) {
          const next = canonical(moveTo(current, id, to), cols);
          if (sameOrder(next, current)) continue;
          refocus.current = id;
          commit(next);
          latest.current.onChange?.(next);
          return;
        }
      },
      swallow: () => performance.now() < swallowUntil.current,
      suppressClick: () => {
        swallowUntil.current = performance.now() + 300;
      },
    }),
    [step, commit, editable, maxColumns],
  );

  const byId = useMemo(() => new Map(items.map((item) => [item.id, item])), [items]);

  // El orden del DOM no cambia; solo cambia la ubicación en la grilla.
  const domOrder = useRef(items.map((item) => item.id));
  for (const item of items) if (!domOrder.current.includes(item.id)) domOrder.current.push(item.id);
  const placementById = new Map(placements.map((p) => [p.id, p]));
  const visualIndex = new Map(
    [...placements].sort((a, b) => a.row - b.row || a.col - b.col).map((p, i) => [p.id, i]),
  );

  return (
    <MotionConfig reducedMotion="user">
      <div
        className={`relative w-full ${className}`}
        style={{ "--widget-radius": `${radius}px` } as CSSProperties}
        // Para que un widget sepa que está apilado (la página scrollea: no hace falta que él también).
        data-apilada={stacked ? "" : undefined}
      >
        {editable && (
          <p id={hintId} className="sr-only">
            Arrastrá para reacomodar. En pantallas táctiles, mantené presionado primero. Con teclado,
            mantené Alt y usá las flechas.
          </p>
        )}
        <div
          ref={grid}
          role="list"
          data-slot="widget-grid"
          className="grid w-full"
          style={{
            gap,
            gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))`,
            // Adaptación nuestra: la fila tiene un alto mínimo pero crece con lo que lleva
            // adentro (la Actividad, la Cola): cortado al pie no se lee. Apilado, del alto
            // del contenido nomás.
            gridAutoRows: stacked
              ? "auto"
              : `minmax(${metrics.unit ? altoDeFila(metrics.unit) : Math.max(cellSize * 0.75 * rowRatio, minRowHeight)}px, auto)`,
          }}
        >
          {domOrder.current.map((id) => {
            const item = byId.get(id);
            const p = placementById.get(id);
            if (!item || !p) return null;
            return (
              <Widget
                key={id}
                position={(visualIndex.get(id) ?? 0) + 1}
                count={placements.length}
                item={item}
                col={p.col}
                row={p.row}
                w={p.w}
                h={p.h}
                columns={columns}
                rows={rows}
                editable={editable}
                held={held === p.id}
                raised={raised === p.id}
                landed={landed === p.id}
                handlers={handlers}
                hintId={hintId}
                renderItem={renderItem as (item: never, size: WidgetSize) => ReactNode}
                entrar={animateEntrance}
              />
            );
          })}
        </div>
      </div>
    </MotionConfig>
  );
}

export default DraggableWidgetGrid;
