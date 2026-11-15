# De dónde salió lo que no escribimos

La consola no le pide nada a internet, así que todo lo de terceros está acá
adentro. Esto es lo que es cada cosa y bajo qué licencia viene.

| Qué | De dónde | Licencia |
|---|---|---|
| `src/components/ui/*` (button, card, dialog…) | [shadcn/ui](https://ui.shadcn.com), vendorizado con `npx shadcn add` | MIT |
| `gsap` (npm) | GreenSock 3.15; Draggable e InertiaPlugin son gratuitos desde la 3.13 | [GreenSock estándar, sin cargo](https://gsap.com/community/standard-license/) |
| `react`, `radix-ui`, `lucide-react`, Tailwind 4 | npm, empaquetado por Vite en `dist/` | MIT / ISC |
| `public/fuentes/satoshi-*.woff2` | Satoshi, de Indian Type Foundry vía [Fontshare](https://www.fontshare.com/fonts/satoshi) | gratis para uso comercial, self-hosting permitido |
| `public/fuentes/inter-*.woff2` | Inter variable v20, subsets latin y latin-ext | [SIL OFL 1.1](https://github.com/rsms/inter/blob/master/LICENSE.txt) |
| `public/logos/*.svg` | Logos reales de cada modelo, de [svgl](https://svgl.app) (claude, openai, gemini, deepseek, qwen, mistral, grok, ollama, copilot) | cada marca es de su dueño; svgl los distribuye para identificación |

La física del visor que se cierra arrastrándolo (`src/components/Visor.tsx`)
es la de `/nico-mockup`, copiada sin reinterpretar: los números de escala,
distancia y velocidad son esos y no otros.

## Lo que viene de 21st.dev

Cada componente entró como materia prima: se vendorizó en `src/components/ui/`
y se adaptó al tema hasta que pareciera nacido acá. Lo que cambió de cada uno
está anotado al principio de su archivo.

| Componente | De dónde | Dónde se usa | Qué se adaptó |
|---|---|---|---|
| ~~`timeline.tsx`~~ | ~~[«Timeline» de @kuratlielia](https://21st.dev/@kuratlielia/components/timeline)~~ | Se sacó el 22/10: Nico no quiere líneas de tiempo. La Actividad es una lista por día (`components/Actividad.tsx`). | — |
| `empty.tsx` | [«Empty» de @cnippet-dev](https://21st.dev/@cnippet-dev/components/cnippet-empty) | Todos los vacíos: Cosechas, Bandeja, Memoria, Actividad, el tablero de primer uso | Tokens del tema, sin sombras internas, título que puede ser el `h1` de la página. |
| `draggable-widget-grid.tsx` | «Draggable Widget Grid» de 21st.dev | Mission Control | Textos y accesibilidad en español, proporción de filas. La física y el tiler, intactos. |
| `dotted-surface.tsx` | «Dotted Surface» de 21st.dev | Fondo del tablero y de Nueva | Three se carga perezoso, se apaga con `prefers-reduced-motion` y con la pestaña oculta. |
| `widgets.tsx` (Shell/Grande/Fila) | Un tablero de observabilidad de 21st.dev | El molde de cada widget | Tokens del tema y texto en español; los números son siempre del historial real. |
