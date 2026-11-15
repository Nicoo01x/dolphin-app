/**
 * La barra de agentes que pasa sola: dos filas que se corren en sentidos opuestos, con los logos
 * de la app de escritorio (`public/agentes/`, ver su LEEME.md) y el nombre al lado.
 *
 * Adaptada de «Logo Cloud Marquee» de 21st.dev (olewandowski1/logo-cloud-3): CSS puro, sin JS.
 * Cambios: dos filas en sentidos opuestos, la duración sale de la cantidad de logos (así las dos
 * filas van a la misma velocidad aunque una tenga el triple), la copia que cierra el bucle es una
 * segunda lista `aria-hidden` (el lector de pantalla lee cada agente una vez), se frena con el
 * mouse y con el foco, y con movimiento reducido queda quieta y se corre a mano.
 */

import type { CSSProperties } from "react";

type Agente = { nombre: string; logo: string };

/** Los diez que arman equipo (docs/motores.md), en el orden de esa página. */
const MOTORES: Agente[] = [
  { nombre: "Claude Code", logo: "claude.svg" },
  { nombre: "Codex", logo: "codex.webp" },
  { nombre: "Antigravity", logo: "antigravity.png" },
  { nombre: "Gemini CLI", logo: "gemini.png" },
  { nombre: "OpenCode", logo: "opencode.svg" },
  { nombre: "GitHub Copilot", logo: "copilot.svg" },
  { nombre: "Cursor", logo: "cursor.png" },
  { nombre: "Droid", logo: "droid.svg" },
  { nombre: "Amp", logo: "amp.png" },
  { nombre: "Qwen Code", logo: "qwen-code.png" },
];

/** Los que la app abre en su terminal (agent-favicon-assets.ts + los glifos de AgentIcon). */
const OTROS: Agente[] = [
  { nombre: "Aider", logo: "aider.svg" },
  { nombre: "Goose", logo: "goose.png" },
  { nombre: "Kimi", logo: "kimi.png" },
  { nombre: "Kiro", logo: "kiro.png" },
  { nombre: "Cline", logo: "cline.png" },
  { nombre: "Crush", logo: "crush.webp" },
  { nombre: "Kilo Code", logo: "kilo.svg" },
  { nombre: "Grok", logo: "grok.png" },
  { nombre: "Mistral Vibe", logo: "mistral-vibe.png" },
  { nombre: "Codebuff", logo: "codebuff.png" },
  { nombre: "Auggie", logo: "aug.png" },
  { nombre: "Continue", logo: "continue.png" },
  { nombre: "Devin", logo: "devin.png" },
  { nombre: "Rovo Dev", logo: "rovo.png" },
  { nombre: "Qoder", logo: "qoder.webp" },
  { nombre: "Trae", logo: "trae.png" },
  { nombre: "CodeBuddy", logo: "codebuddy.webp" },
  { nombre: "Hermes", logo: "hermes.png" },
  { nombre: "OpenClaw", logo: "openclaw.png" },
  { nombre: "Pi", logo: "pi.svg" },
  { nombre: "OMP", logo: "omp.svg" },
  { nombre: "DeepSeek Harness", logo: "dsh.png" },
  { nombre: "MiMo Code", logo: "mimo-code.png" },
  { nombre: "Command Code", logo: "command-code.png" },
  { nombre: "Freebuff", logo: "freebuff.webp" },
  { nombre: "Autohand Code", logo: "autohand.png" },
  { nombre: "Ante", logo: "ante.png" },
  { nombre: "Prime Agent", logo: "prime-agent.png" },
  { nombre: "Muse", logo: "muse.webp" },
  { nombre: "ZCode", logo: "zcode.webp" },
  { nombre: "Jcode", logo: "jcode.png" },
];

/** Segundos que tarda en pasar cada logo: la vuelta entera es esto por la cantidad. */
const SEGUNDOS_POR_LOGO = 3.6;

const ESTILOS = `
@keyframes marquesina-izquierda { from { transform: translate3d(0,0,0); } to { transform: translate3d(-50%,0,0); } }
@keyframes marquesina-derecha { from { transform: translate3d(-50%,0,0); } to { transform: translate3d(0,0,0); } }
.marquesina-fila {
  overflow: hidden;
  -webkit-mask-image: linear-gradient(to right, transparent, #000 12%, #000 88%, transparent);
  mask-image: linear-gradient(to right, transparent, #000 12%, #000 88%, transparent);
}
.marquesina-fila:focus-visible { outline: 2px solid var(--color-electrico); outline-offset: 4px; border-radius: 12px; }
.marquesina-pista {
  display: flex;
  width: max-content;
  animation: var(--marquesina-sentido) var(--marquesina-duracion) linear infinite;
  will-change: transform;
}
.marquesina-fila:hover .marquesina-pista,
.marquesina-fila:focus-within .marquesina-pista { animation-play-state: paused; }
@media (prefers-reduced-motion: reduce) {
  .marquesina-fila { overflow-x: auto; scrollbar-width: none; }
  .marquesina-fila::-webkit-scrollbar { display: none; }
  .marquesina-pista { animation: none; will-change: auto; padding-inline: 10%; }
  .marquesina-copia { display: none; }
}
`;

function Lista({ agentes, copia = false }: { agentes: Agente[]; copia?: boolean }) {
  return (
    <ul
      className={`flex shrink-0 items-center ${copia ? "marquesina-copia" : ""}`}
      aria-hidden={copia || undefined}
    >
      {agentes.map((a) => (
        <li key={a.nombre} className="flex shrink-0 items-center gap-2.5 px-5 md:px-6">
          <img
            src={`/agentes/${a.logo}`}
            width={22}
            height={22}
            alt=""
            loading="lazy"
            decoding="async"
            className="size-[22px] rounded-[5px] object-contain"
          />
          <span className="whitespace-nowrap text-[15px] font-medium tracking-[-0.011em] text-tinta">
            {a.nombre}
          </span>
        </li>
      ))}
    </ul>
  );
}

function Fila({ agentes, etiqueta, sentido }: { agentes: Agente[]; etiqueta: string; sentido: "izquierda" | "derecha" }) {
  const estilo = {
    "--marquesina-sentido": `marquesina-${sentido}`,
    "--marquesina-duracion": `${(agentes.length * SEGUNDOS_POR_LOGO).toFixed(1)}s`,
  } as CSSProperties;
  return (
    <div role="region" aria-label={etiqueta} tabIndex={0} className="marquesina-fila py-3.5">
      <div className="marquesina-pista" style={estilo}>
        <Lista agentes={agentes} />
        <Lista agentes={agentes} copia />
      </div>
    </div>
  );
}

export function Marquesina() {
  return (
    <div className="w-full">
      <style>{ESTILOS}</style>
      <Fila agentes={MOTORES} etiqueta="Los diez agentes que arman equipo" sentido="izquierda" />
      <Fila agentes={OTROS} etiqueta="Otros agentes que la app abre en su terminal" sentido="derecha" />
    </div>
  );
}
