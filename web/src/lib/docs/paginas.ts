import type { PaginaDeDoc } from "./tipos";

/**
 * La documentación de Dolphin. Cada afirmación sale del código (las `fuentes` de cada página) o del
 * README del repo, leído el 28/10/2026. Si algo de acá deja de ser cierto, se cambia acá: la doc no
 * promete lo que el producto no hace.
 */

export const PAGINAS: readonly PaginaDeDoc[] = [
  {
    slug: "",
    titulo: "Qué es Dolphin",
    resumen: "Un orquestador de agentes de código y un lugar donde viven tus bots. Open source, en tu máquina, con tus cuentas.",
    grupo: "Empezar",
    fuentes: ["README.md", "src/dolphin.ts"],
    bloques: [
      {
        t: "p",
        texto:
          "Con agentes, escribir código dejó de ser lo difícil. Lo caro ahora es verificar: leer diffs enormes, levantar la app para ver si anda, descubrir a la semana que un cambio que pasaba todo no hacía lo que se pidió. Dolphin saca tu atención de ese camino.",
      },
      {
        t: "p",
        texto:
          "Le pedís algo y un agente (Claude Code, Codex o Antigravity) lo hace en una rama propia. Esa rama cruza un portón que corre solo, de lo gratis a lo caro: tus tests, tus tipos, la app usada por cinco personas, y recién después un revisor de otro modelo. Lo que rebota vuelve al agente con el motivo. A vos te llega una rama ya probada, o el motivo exacto por el que no.",
      },
      { t: "h2", texto: "Las piezas", id: "piezas" },
      {
        t: "tabla",
        columnas: ["Pieza", "Qué es", "Cómo se abre"],
        filas: [
          ["La app de terminal", "Le escribís como a un colega: contesta, lo hace un agente o arma un equipo.", "`dolphin`"],
          ["La flota", "Un líder parte el pedido y cada compañero lo hace en su rama, a la vez.", "`/equipo` o `dolphin equipo`"],
          ["El portón", "Las fases que tiene que pasar una rama antes de llegar a la tuya.", "corre solo"],
          ["La memoria", "Lo que corregiste una vez: una regla en cada pedido o un chequeo gratis.", "`/memoria` o `dolphin recordar`"],
          ["Dolphin bots", "Agentes siempre prendidos, cada uno una carpeta, que te escriben por Telegram.", "`dolphin bots`"],
          ["La consola", "La versión web, servida desde tu máquina.", "`dolphin ui`"],
          ["La app de escritorio", "Con la consola adentro, el editor, el chat sobre el CLI y X-ray.", "el instalador de tu sistema"],
          ["Git", "Las ramas, los commits y los issues del repo, con quién trabajó en cada cosa. En las tres apps.", "la sección 7 o `dolphin git`"],
        ],
      },
      { t: "h2", texto: "Por dónde seguir", id: "seguir" },
      {
        t: "lista",
        items: [
          "[Instalación](/docs/instalacion): Node 22.12, git y el CLI de tu agente.",
          "[Primeros pasos](/docs/primeros-pasos): la demo sin gastar un token y después tu repo.",
          "[Referencia de la CLI](/docs/cli): todos los comandos y sus flags.",
          "[Dolphin bots](/docs/bots): crear uno, darle alma, rutinas y Telegram.",
          "[La app de escritorio](/escritorio): cada vista, con capturas, y la vista Git.",
        ],
      },
    ],
  },
  {
    slug: "instalacion",
    titulo: "Instalación",
    resumen: "La app de escritorio tiene instalador para Windows, macOS y Linux. La terminal y la CLI se instalan desde el código, con Node 22.12 o más y git. En los dos casos, el CLI del agente lo ponés vos.",
    grupo: "Empezar",
    fuentes: ["package.json", "bin/dolphin.mjs", "README.md"],
    bloques: [
      { t: "h2", texto: "Requisitos", id: "requisitos" },
      {
        t: "tabla",
        columnas: ["Qué", "Para qué", "¿Hace falta?"],
        filas: [
          ["Node 22.12 o más", "el núcleo corre en Node, con tsx, sin paso de build", "sí"],
          ["git", "cada rama es un worktree", "sí"],
          ["Claude Code, Codex o Antigravity", "el CLI que escribe, en el PATH y con tu sesión iniciada", "para trabajo de verdad; la demo no lo usa"],
          ["Chrome o Edge", "las fases de pantalla, Vision y el explorador", "opcional: sin navegador se saltean y queda dicho"],
          ["ffmpeg", "el video compilado de los partes", "opcional"],
          ["gh", "abrir PRs en borrador y sembrar issues", "opcional"],
        ],
      },
      { t: "h2", texto: "La app de escritorio", id: "instalador" },
      {
        t: "p",
        texto:
          "Bajá el instalador de tu sistema desde la última versión en GitHub: [Windows](https://github.com/Nicoo01x/dolphin-app/releases/latest/download/dolphin-windows-setup.exe), [macOS](https://github.com/Nicoo01x/dolphin-app/releases/latest/download/dolphin-macos-arm64.dmg) o [Linux](https://github.com/Nicoo01x/dolphin-app/releases/latest/download/dolphin-linux.AppImage).",
      },
      {
        t: "nota",
        texto: "Los instaladores todavía no están firmados. En Windows, si SmartScreen lo frena: «Más información» → «Ejecutar de todas formas». En macOS, la primera vez: clic derecho sobre la app → «Abrir». En Linux, `chmod +x dolphin-linux.AppImage` y abrirlo.",
      },
      { t: "h2", texto: "Desde el código", id: "desde-el-codigo" },
      {
        t: "codigo",
        titulo: "terminal",
        codigo: "git clone https://github.com/Nicoo01x/dolphin-app\ncd dolphin-app\nnpm install      # instala todo y construye la consola\nnpm link         # deja el comando dolphin en el PATH",
      },
      {
        t: "p",
        texto:
          "`npm link` deja en el PATH `bin/dolphin.mjs`, que carga el núcleo en TypeScript con tsx: no hay que compilar nada. Desde ahí, `dolphin` anda en cualquier carpeta.",
      },
      {
        t: "nota",
        texto: "El paquete de npm todavía no está publicado. Cuando lo esté, alcanza con `npm install -g` y el nombre que figure en la portada.",
      },
      { t: "h2", texto: "Comprobar que quedó", id: "comprobar" },
      { t: "codigo", titulo: "terminal", codigo: "dolphin --ayuda\ndolphin --demo   # la app con el agente de mentira: no gasta nada" },
      { t: "p", texto: "La app de escritorio tiene instalador para Windows, macOS y Linux: mirá [App de escritorio](/docs/escritorio)." },
    ],
  },
  {
    slug: "primeros-pasos",
    titulo: "Primeros pasos",
    resumen: "Primero la demo, que no gasta un token. Después, dolphin adentro de tu repo.",
    grupo: "Empezar",
    fuentes: ["scripts/demo.ts", "src/dolphin.ts", "src/tui/pensar.ts", "src/nucleo/arranque.ts"],
    bloques: [
      {
        t: "ruta",
        pasos: [
          {
            titulo: "La demo",
            texto:
              "Arma un repo de ejemplo con un bug real (una función de IVA que suma la alícuota en vez de aplicarla), siembra siete ramas con enfoques distintos y las pasa por un portón de tres fases que corren de verdad: sintaxis, tests y peso. Después abre la consola. El agente es de mentira: no hace falta ninguna cuenta.",
            codigo: "npm run demo",
          },
          {
            titulo: "Dolphin en tu repo",
            texto:
              "Entrá a la carpeta de tu proyecto y escribí `dolphin`. La primera vez detecta qué es (Node, Python, Go, Rust), con qué se instala y qué hay para probarlo, y propone el `dolphin.config.json`. También trae las viñetas de tu `CLAUDE.md` y tu `AGENTS.md` a la memoria, como reglas que esperan tu ok. Eso no gasta un token.",
            codigo: "cd mi-proyecto\ndolphin",
          },
          {
            titulo: "Pedile algo",
            texto:
              "Escribile como a un colega. Un saludo o una duda se contesta; un cambio chico lo hace un agente en una rama; algo grande primero se mejora y te hace solo las preguntas que cambian el resultado. Para algo grande arma un plan con lo que cuesta cada tarea y espera tu «dale».",
          },
          {
            titulo: "Revisá y entregá",
            texto:
              "La rama del equipo aparece agrupada por compañero. Con `r` la revisás, con `i` la integrás a tu rama y con `d` deshacés lo de un compañero y el portón vuelve a correr sobre lo que queda. La rama queda commiteada a tu nombre, sin co-autores.",
          },
        ],
      },
      { t: "h2", texto: "Sin la app de terminal", id: "sin-la-app" },
      {
        t: "p",
        texto:
          "Todo lo que hace la app también se puede correr como comando, por ejemplo para un log o un script. `dolphin sembrar` usa el agente de mentira si no le decís otro, así que podés probar el circuito sobre tu repo sin gastar nada:",
      },
      { t: "codigo", titulo: "terminal", codigo: 'dolphin sembrar --tarea "el total del carrito cobra el IVA dos veces" --verificar typecheck,test\ndolphin sembrar --tarea "…" --verificar typecheck,test --agente claude' },
      { t: "p", texto: "Seguí por [La app de terminal](/docs/terminal) para los comandos con barra, o por [La flota](/docs/equipo) para ver cómo se reparte el trabajo." },
    ],
  },
  {
    slug: "equipo",
    titulo: "La flota",
    resumen: "Un líder parte el pedido, cada compañero lo hace en su propia rama y al final se integra todo, revisado y probado.",
    grupo: "Orquestar",
    fuentes: ["src/equipo-cli.ts", "src/equipo/equipo.ts", "src/equipo/choques.ts", "src/equipo/integrar.ts", "src/nucleo/entorno.ts", "src/cola-cli.ts"],
    bloques: [
      { t: "diagrama", cual: "equipo" },
      {
        t: "p",
        texto:
          "El modelo principal (el que elegís con `/lider`) lee el pedido y lo parte en tareas, cada una con su escalón de modelo y los archivos que le tocan. Dolphin estima cada tarea con lo que costaron de verdad las ramas de tu repo y espera tu «dale». Si el peor caso pasa el tope del proyecto, no arranca.",
      },
      { t: "h2", texto: "Corregir el plan escribiendo", id: "corregir-el-plan" },
      {
        t: "p",
        texto: "Antes del «dale» lo corregís como a una persona: «sacá 2», «sumá documentar el CSV», «cambiá 3: tests con 10.000 filas». El «dale» arranca el corregido.",
      },
      { t: "h2", texto: "Cada compañero en sus aguas", id: "aislamiento" },
      {
        t: "p",
        texto:
          "Cada compañero trabaja en su propio worktree, con su puerto y su base, las dependencias enlazadas y los `.env` copiados: dos compañeros levantan la app a la vez sin pisarse. Si dos van a tocar el mismo archivo, Dolphin te avisa antes de integrar.",
      },
      { t: "h2", texto: "Integrar", id: "integrar" },
      {
        t: "lista",
        items: [
          "Las ramas se juntan en una rama de integración. Si chocan, un agente resuelve el conflicto y se prueba todo junto.",
          "Otro modelo lee el diff entero contra la tarea, y el portón decide.",
          "Cada turno de un compañero queda guardado en git: `/turnos backend` los lista y `/volver backend 2` lleva a ese compañero a ese turno sin tocar lo de los demás.",
          "`/deshacer backend` hace un `git revert` de su merge y el portón vuelve a correr sobre lo que queda.",
        ],
      },
      { t: "h2", texto: "Desde la línea de comandos", id: "cli" },
      { t: "codigo", titulo: "terminal", codigo: 'dolphin equipo --tarea "exportar los pedidos a CSV" --verificar test --agente claude' },
      {
        t: "p",
        texto:
          "Sin `--agente claude`, `dolphin equipo` usa el líder de mentira: un plan fijo de tres tareas (la lógica, la pantalla y sus tests) que recorre el circuito entero sin gastar nada.",
      },
      { t: "h2", texto: "Varias tareas distintas: la cola", id: "cola" },
      {
        t: "p",
        texto:
          "`dolphin cola` trabaja tareas que no tienen nada que ver entre sí, cada una en su rama, varias a la vez. Las entrega de a una; si dos chocan, la segunda se vuelve a sembrar encima de la primera.",
      },
      { t: "codigo", titulo: "terminal", codigo: 'dolphin cola --tarea "que el carrito acepte cupones" --tarea "exportar pedidos a CSV" --agente claude\ndolphin cola --archivo tareas.txt --concurrencia 2' },
      { t: "p", texto: "Para mirar una siembra desde otra terminal: `dolphin tablero`." },
    ],
  },
  {
    slug: "porton",
    titulo: "El portón",
    resumen: "Nada llega a tu rama sin pasar tus tests, tus tipos, la pantalla y la revisión de otro modelo. Primero lo gratis.",
    grupo: "Orquestar",
    fuentes: ["src/nucleo/porton.ts", "src/nucleo/politica.ts", "src/nucleo/elegir.ts", "src/cli.ts", "README.md"],
    bloques: [
      { t: "diagrama", cual: "portón" },
      {
        t: "p",
        texto: "El portón está ordenado por costo, y cada escalón corre solo sobre las ramas que pasaron el anterior. Lo que cuesta plata corre recién cuando lo gratis ya pasó.",
      },
      {
        t: "tabla",
        columnas: ["Fase", "Cuesta", "Qué mira"],
        filas: [
          ["configuración", "gratis", "que la rama no toque lo que el repo ejecuta solo: `.claude/`, `.mcp.json`, hooks"],
          ["política", "gratis", "lo que corre solo no deploya ni toca migraciones"],
          ["memoria", "gratis", "tus correcciones de siempre, como chequeos"],
          ["tus scripts", "gratis", "lo que pases en `--verificar`: typecheck, test, lint…"],
          ["pantalla", "gratis", "la app de la rama, usada por cinco personas"],
          ["vision", "barato", "un juez que mira la app andando, nunca el código"],
          ["revisión", "barato", "otro modelo lee el diff contra la tarea"],
        ],
      },
      { t: "h2", texto: "Lo que rebota", id: "rebota" },
      {
        t: "p",
        texto:
          "Lo que no pasa vuelve al agente con el veredicto. El agente corrige retomando su propia sesión (se paga solo la vuelta) y la misma fase se vuelve a correr. Si la corrección rompe una fase que ya pasaba, se deshace. `--reintentos` dice cuántas vueltas por fase (por defecto, una).",
      },
      { t: "h2", texto: "Varias ramas, una elegida", id: "elegida" },
      {
        t: "p",
        texto:
          "Con `--n 3` se abren tres ramas, cada una con un enfoque distinto: la mínima, la de raíz, test primero, la defensiva. Entre las que pasan gana la más simple: la que no cambió tests existentes, después la que no suma dependencias, después la que toca menos.",
      },
      {
        t: "nota",
        texto:
          "Si una fase no pudo correr (no hay Chrome, el revisor no contestó en el formato pedido), la rama no se castiga por un problema de la máquina, pero tampoco se dice que pasó: queda «elegida, sin revisión», con el motivo.",
      },
      { t: "h2", texto: "Fases que no son npm", id: "otras-fases" },
      {
        t: "p",
        texto:
          "Para pytest, go test o cargo test se suman en `porton.comandos` del [dolphin.config.json](/docs/configuracion). Un repo clonado de afuera no los corre: su configuración no se ejecuta sin tu permiso.",
      },
      { t: "codigo", titulo: "dolphin.config.json", codigo: '{\n  "porton": {\n    "comandos": [{ "nombre": "test", "cmd": "python", "args": ["-m", "pytest", "-q"] }]\n  }\n}' },
    ],
  },
  {
    slug: "memoria",
    titulo: "Memoria y bitácora",
    resumen: "Lo que corregiste una vez no se repite: con un patrón se vuelve un chequeo gratis del portón; sin patrón, viaja en cada pedido.",
    grupo: "Orquestar",
    fuentes: ["src/recordar-cli.ts", "src/nucleo/memoria.ts", "src/nucleo/sueno.ts", "src/bitacora-cli.ts", "src/bitacora-compartida.ts"],
    bloques: [
      { t: "h2", texto: "Enseñarle algo", id: "ensenar" },
      { t: "codigo", titulo: "terminal", codigo: 'dolphin recordar "los importes van con coma decimal, nunca punto"\ndolphin recordar "nada de console.log en src" --patron "console\\.log"' },
      {
        t: "p",
        texto:
          "Con `--patron`, la corrección entra al portón: una línea nueva que lo cumpla corta la rama sin gastar un token, con tu frase como motivo, escriba quien escriba. Sin patrón, es una regla que viaja en el pedido de cada agente. En la app de terminal es `/memoria <regla>`.",
      },
      {
        t: "p",
        texto: "La memoria es del proyecto, no del modelo: Claude, Codex y Antigravity reciben la misma. Cada respuesta de la terminal dice qué reglas usó.",
      },
      { t: "h2", texto: "El perfil del proyecto", id: "perfil" },
      {
        t: "p",
        texto:
          "`dolphin recordar --perfil \"hay monotributistas y responsables inscriptos\"` lo suma a `.dolphin/PERFIL.md`, que viaja entero en todos los pedidos, siempre, con cualquier modelo. Sin texto, `--perfil` lo muestra.",
      },
      { t: "h2", texto: "Lo que aprende sola", id: "aprende" },
      {
        t: "p",
        texto:
          "Lo que las siembras aprenden del repo (de lo que falla y de lo que deshacés) entra en observación. El sueño lo pasa a la memoria si se repite en tareas distintas y olvida lo que no se volvió a ver en 30 días. Sueña solo después de cada siembra, o cuando le pedís:",
      },
      { t: "codigo", titulo: "terminal", codigo: "dolphin sonar" },
      { t: "p", texto: "El porqué de cada decisión queda en `.dolphin/DREAMS.md`. Lo que vino de afuera (un issue de otro, una tarea de la web) espera tu visto bueno en la Memoria de la consola." },
      { t: "h2", texto: "Administrarla", id: "administrar" },
      {
        t: "tabla",
        columnas: ["Comando", "Qué hace"],
        filas: [
          ["`dolphin recordar --listar`", "todo lo que sabe, con su id y si es chequeo o regla"],
          ["`dolphin recordar --apagar <id>`", "la deja sin efecto, sin borrarla"],
          ["`dolphin recordar --prender <id>`", "la vuelve a prender"],
          ["`dolphin recordar --olvidar <id>`", "la borra"],
        ],
      },
      { t: "h2", texto: "La bitácora compartida", id: "bitacora" },
      {
        t: "p",
        texto:
          "Lo que aprendió tu agente le sirve al de otro. `exportar` deja las reglas y los errores confirmados, con su patrón, sin nada del proyecto: ni rutas, ni URLs, ni correos, ni claves, ni el nombre del repo, ni el título de tus tareas. Van etiquetadas por framework (`next@16`, `prisma@6`).",
      },
      { t: "codigo", titulo: "terminal", codigo: "dolphin bitacora exportar --salida dolphin-bitacora.json\ndolphin bitacora importar https://ejemplo.com/bitacora-next16.json" },
      {
        t: "p",
        texto:
          "Lo importado llega como candidatas de afuera: no se usan hasta que les das el visto bueno. Las de un stack que no usás se saltean y un patrón que podría colgar el portón no entra. Leé el archivo antes de compartirlo: es lo que va a ver otra persona.",
      },
    ],
  },
  {
    slug: "pantalla",
    titulo: "Pantalla y Vision",
    resumen: "Antes de llegar a tu rama, cinco personas distintas usan la app y lo que falla queda grabado.",
    grupo: "Orquestar",
    fuentes: ["src/tester/personas.ts", "src/tester/escalon-pantalla.ts", "src/tester/vision.ts", "src/explorar-cli.ts", "src/vigilar-cli.ts", "src/mirar.ts"],
    bloques: [
      {
        t: "p",
        texto:
          "La fase de pantalla no cliquea todo: usa la app de la rama como cinco personas concretas. Solo cuenta lo nuevo: lo que ya estaba roto en la rama principal no es culpa de la rama. Lo que falla queda grabado en video.",
      },
      {
        t: "tabla",
        columnas: ["Persona", "Cómo es", "Qué le molesta"],
        filas: [
          ["pulgar", "390 px, táctil, una mano", "desbordes, botones de menos de 44 px, texto cortado"],
          ["teclado", "no usa el mouse", "foco invisible, botones sin nombre accesible"],
          ["desconfiado", "pega razones sociales de 90 caracteres e importes de nueve cifras", "lo que revienta las cajas"],
          ["apurado", "doble click en todo", "errores de consola, pedidos que se caen"],
          ["subte", "una barra de señal", "esperas sin aviso"],
        ],
      },
      { t: "h2", texto: "Prenderla", id: "prender" },
      { t: "p", texto: "Necesita saber cómo se levanta tu app. Cada rama la levanta en su propio puerto:" },
      { t: "codigo", titulo: "dolphin.config.json", codigo: '{\n  "pantalla": {\n    "levantar": "npm run dev -- --port {PUERTO}",\n    "url": "http://127.0.0.1:{PUERTO}/"\n  }\n}' },
      {
        t: "p",
        texto:
          "Además guarda un video por rama de la app andando con el cambio, que es el que muestra el parte de la mañana. Con `videoDeLoQueAnda: false` quedan solo los de lo que falló.",
      },
      { t: "h2", texto: "Vision", id: "vision" },
      {
        t: "p",
        texto:
          "Vision recorre la app de la rama como alguien que recién llega, en la compu y en el teléfono: toca lo que hay y manda los formularios vacíos y con datos malos. Después un juez de otro modelo decide si la tarea está cumplida mirando solo las capturas y lo que encontró. Sin evidencia no hay nota, y sin nota la rama no pasa. Paga un juez por rama, por eso se prende a mano con `\"vision\": true`.",
      },
      { t: "h2", texto: "Sin sembrar nada", id: "sin-sembrar" },
      {
        t: "tabla",
        columnas: ["Comando", "Para qué"],
        filas: [
          ["`dolphin mirar http://localhost:3000`", "las cinco personas sobre cualquier URL"],
          ["`dolphin vigilar --url http://localhost:5173 --verificar test`", "mientras escribís, cada cambio vuelve a pasar por las fases y la pantalla"],
          ["`dolphin explorar --url http://127.0.0.1:3000`", "recorre tu app como una persona y anota en la bandeja lo que no anda"],
        ],
      },
      {
        t: "p",
        texto:
          "El explorador guarda lo que ya revisó en `.dolphin/cobertura.json` y no lo vuelve a tocar mientras su código no cambie. Un error que vuelve a probar y ya no pasa se cierra solo. Nunca toca «Borrar», «Pagar» y compañía; sumás tus propios textos en `explorar.noTocar`.",
      },
    ],
  },
  {
    slug: "noche",
    titulo: "Noche y parte",
    resumen: "Dejás pendientes antes de dormir y a la mañana tenés una página con una tarjeta por tarea, lista para aprobar o tirar.",
    grupo: "Orquestar",
    fuentes: ["src/noche-cli.ts", "src/noche.ts", "src/manana.ts", "src/nucleo/parte.ts", "src/tui/sesion.ts"],
    bloques: [
      {
        t: "ruta",
        pasos: [
          { titulo: "Antes de dormir, anotás", texto: "En la terminal, `/noche <tarea>` la deja en la bandeja marcada para esta noche. Desde la consola, cualquier idea o error de la bandeja se marca igual.", codigo: "/noche que el carrito acepte cupones" },
          { titulo: "Lo largás", texto: "Hace las tareas de a una, cada una en su rama y con el portón, con el cupo que ya pagaste. A la hora que dijiste no arranca nada más.", codigo: "dolphin noche --hasta 07:00" },
          { titulo: "A la mañana, decidís", texto: "`/parte` muestra el resumen; `/aprobar 2` mergea esa tarea en tu rama y `/descartar 2` la tira. Funciona igual desde Telegram." },
        ],
      },
      { t: "h2", texto: "El cupo", id: "cupo" },
      {
        t: "p",
        texto:
          "Si una cuenta se queda sin cupo pasa a la otra; si no queda ninguna, espera la ventana siguiente y retoma la misma tarea. Corre sin pedir permisos porque no hay nadie mirando, pero con la política encima: no deploya ni toca migraciones.",
      },
      { t: "h2", texto: "El parte de la mañana", id: "parte" },
      {
        t: "p",
        texto:
          "Una página con una tarjeta por tarea: qué hizo, el portón, la rama y los videos de la app andando. Llega con un aviso del sistema y, si configuraste `DOLPHIN_TELEGRAM_TOKEN` y `DOLPHIN_TELEGRAM_CHAT`, también por Telegram.",
      },
      {
        t: "p",
        texto:
          "Cada siembra deja además su propio parte HTML en `.dolphin/partes/`: la escalera de fases con quién se cortó dónde y por qué, quién escribió y revisó, lo que costó, el diff de la elegida y los videos de lo que falló. No pide nada a internet: se abre en cualquier navegador.",
      },
      { t: "codigo", titulo: "terminal", codigo: 'dolphin noche --tarea "que el carrito acepte cupones" --tarea "exportar pedidos a CSV" --hasta 07:00' },
    ],
  },
  {
    slug: "calendario",
    titulo: "Calendario y Guardian",
    resumen: "Lo que corre solo: tareas agendadas a una hora y la rama principal vigilada sin gastar un token.",
    grupo: "Orquestar",
    fuentes: ["src/nucleo/calendario.ts", "src/tui/sesion.ts", "src/guardian-cli.ts", "src/nucleo/guardian.ts", "docs/ssh.md"],
    bloques: [
      { t: "h2", texto: "Agendar una tarea", id: "agendar" },
      { t: "codigo", titulo: "en la app de terminal", codigo: "/programar 02:00 actualizar las dependencias menores\n/programar mañana 9:30 revisar los textos del alta\n/programar diario 03:00 correr la limpieza de imágenes" },
      {
        t: "p",
        texto:
          "Cada turno corre en una rama, con el portón y con la política de lo que corre solo, y deja su parte en el historial. Lo corren la consola (`dolphin ui`) o la app de escritorio mientras estén abiertas. Desde la pantalla Nueva de la consola también se agenda, para una vez o todos los días.",
      },
      {
        t: "p",
        texto:
          "Un turno puede correr en tu VPS por SSH y la cosecha vuelve: se declaran las máquinas en `hosts` del [dolphin.config.json](/docs/configuracion).",
      },
      { t: "h2", texto: "Guardian", id: "guardian" },
      {
        t: "p",
        texto:
          "Guardian mira la rama principal: cada commit nuevo pasa por las fases autorizadas en un worktree propio. Repite la que se rompe para saber si es inestable, busca el commit culpable con `git bisect` y deja una tarjeta en la bandeja que se cierra sola cuando la fase vuelve a pasar. No toca el repo y no arregla nada: la tarjeta propone, vos decidís.",
      },
      { t: "codigo", titulo: "terminal", codigo: "dolphin guardian --cada 60\ndolphin guardian --una-vez   # para un hook o un CI: 1 si hay una regresión nueva, 2 si no pudo revisar" },
      {
        t: "p",
        texto:
          "Corre las fases de `guardian.fases` o, si no hay, los scripts sintaxis, typecheck, lint y test que tenga el repo. En un repo clonado, solo lo que autorices con `--autorizar test,lint`.",
      },
    ],
  },
  {
    slug: "seguir",
    titulo: "Seguir y preguntar a una sesión",
    resumen: "dolphin seguir toma tu última sesión de Claude Code y la sigue sola, sin que tengas que escribirle «seguí». dolphin preguntar le hace una pregunta sin tocarla.",
    grupo: "Orquestar",
    fuentes: ["src/seguir-cli.ts", "src/seguir.ts", "src/preguntar-cli.ts", "src/preguntar.ts"],
    bloques: [
      { t: "h2", texto: "Seguir", id: "seguir" },
      { t: "codigo", titulo: "terminal", codigo: "dolphin seguir                 # la última sesión de Claude Code en este repo\ndolphin seguir --lista         # las últimas 15, con lo último que le pediste\ndolphin seguir --sesion 3f2a   # otra (alcanza el principio del id)" },
      {
        t: "p",
        texto:
          "La primera vuelta bifurca tu sesión (`--fork-session`): la original queda como estaba y Dolphin sigue la copia. En cada vuelta le pide que siga y que termine su respuesta con una línea de estado: `ESTADO: TERMINADO`, `ESTADO: NECESITO <qué>` o `ESTADO: SIGO`.",
      },
      {
        t: "tabla",
        columnas: ["Si dice", "Dolphin"],
        filas: [
          ["TERMINADO", "levanta la app si el repo dice cómo (la sección `pantalla`) y te avisa con el link"],
          ["NECESITO …", "para y te avisa qué hace falta"],
          ["SIGO", "otra vuelta, hasta el tope de `--vueltas` (8 por defecto, 30 como mucho)"],
        ],
      },
      {
        t: "p",
        texto:
          "Los avisos salen por el sistema y por Telegram si están `DOLPHIN_TELEGRAM_TOKEN` y `DOLPHIN_TELEGRAM_CHAT`. Corre con la política de lo que corre solo: sin push, sin deploy, sin ssh; los commits locales sí, que se deshacen.",
      },
      { t: "nota", texto: "Gasta tu cupo: cada vuelta es un turno entero de Claude. Ctrl+C corta en cualquier momento." },
      { t: "h2", texto: "Preguntar", id: "preguntar" },
      {
        t: "p",
        texto:
          "A veces no querés que siga: querés saber algo de lo que hizo. «¿Por qué dejaste el pago único?», «¿qué probaste para el bug del CUIT?». La sesión contesta con todo lo que sabía.",
      },
      { t: "codigo", titulo: "terminal", codigo: 'dolphin preguntar "¿qué quedó a medias?"\ndolphin preguntar "¿por qué dejaste el pago único?" --sesion 3f2a' },
      {
        t: "p",
        texto:
          "Contesta en una copia de la sesión (`--fork-session`) y solo con herramientas de lectura (Read, Grep y Glob): no toca la charla original ni escribe nada. Gasta un turno de tu cupo.",
      },
    ],
  },
  {
    slug: "herramientas",
    titulo: "Bug, comparar, paridad y doctor",
    resumen: "Cuatro comandos para casos puntuales: arreglar con la prueba primero, elegir entre motores mirando, migrar con paridad y arreglar lo que quedó roto.",
    grupo: "Orquestar",
    fuentes: ["src/bug-cli.ts", "src/bug.ts", "src/comparar-cli.ts", "src/paridad-cli.ts", "src/doctor-cli.ts", "src/doctor.ts"],
    bloques: [
      { t: "h2", texto: "Del bug al arreglo", id: "bug" },
      {
        t: "p",
        texto:
          "Primero un agente escribe una prueba que reproduce el bug y Dolphin comprueba que falla hoy: si no falla, no lo reprodujo y no lo arregla a ciegas. Después el arreglo se siembra encima, y no está arreglado hasta que la prueba pase. Hasta tres intentos; si no sale, la prueba queda en su rama.",
      },
      { t: "codigo", titulo: "terminal", codigo: 'dolphin bug --que "el cupón del 10 % no descuenta nada"\n/bug el cupón del 10 % no descuenta nada        # en la app de terminal' },
      { t: "h2", texto: "Comparar motores", id: "comparar" },
      {
        t: "p",
        texto:
          "La misma tarea a Claude, Codex y Antigravity a la vez, cada uno en su rama y con el portón. Al final, una página con las apps lado a lado: el video de cada una andando, si pasó, cuánto tocó y cuánto costó. `/elegir 2` mergea esa y tira las otras.",
      },
      { t: "codigo", titulo: "terminal", codigo: 'dolphin comparar --tarea "un buscador en la lista de pedidos" --motores claude,codex' },
      { t: "h2", texto: "Migrar con paridad", id: "paridad" },
      {
        t: "p",
        texto:
          "`grabar` le pregunta a la app vieja por cada ruta y guarda lo que contesta. `comprobar` levanta la nueva y sale en 0 solo si contesta igual, así que sirve de oráculo para `/objetivo`: el equipo no para hasta lograrlo. Mira rutas HTTP: APIs y páginas que arma el servidor.",
      },
      {
        t: "codigo",
        titulo: "terminal",
        codigo:
          'dolphin paridad grabar --url http://localhost:3000 --ruta / --ruta /api/pedidos --ignorar fecha,id\n/objetivo pasar el backend de Express a Fastify --oraculo dolphin paridad comprobar --grabacion "<lo que imprimió grabar>" --levantar "npm start -- --port {PUERTO}"',
      },
      { t: "h2", texto: "Doctor", id: "doctor" },
      {
        t: "p",
        texto:
          "Busca lo que quedó roto cuando algo se cortó a mitad de camino y lo arregla: worktrees que dejó un Dolphin que ya no corre, worktrees que git recuerda sin carpeta, ramas que ya están en la tuya, `node_modules` enlazados a nada, asuntos colgados y agentes que siguen corriendo para nadie. Corre solo al abrir un proyecto y avisa únicamente si arregló algo.",
      },
      { t: "codigo", titulo: "terminal", codigo: "dolphin doctor\ndolphin doctor --solo-mirar   # dice qué arreglaría, sin tocar nada" },
    ],
  },
  {
    slug: "bots",
    titulo: "Dolphin bots",
    resumen: "Agentes siempre prendidos. Cada uno es una carpeta con su alma, su memoria, sus habilidades y sus rutinas, y te habla por Telegram.",
    grupo: "Bots",
    fuentes: [
      "src/bots-cli.ts",
      "src/bots/almacen.ts",
      "src/bots/pensar.ts",
      "src/bots/pensar-bloques.ts",
      "src/bots/pensar-motor.ts",
      "src/bots/memoria.ts",
      "src/bots/checkpoints.ts",
      "src/bots/chequeo.ts",
      "src/bots/rutinas.ts",
      "src/bots/horarios.ts",
      "src/bots/servicio.ts",
      "src/bots/servicio-instalador.ts",
      "src/bots/telegram-bot.ts",
      "src/bots/plantillas.ts",
    ],
    bloques: [
      { t: "h2", texto: "Crear uno", id: "crear" },
      { t: "codigo", titulo: "terminal", codigo: "dolphin bots nuevo Vigía --plantilla vigia --carpeta D:/proyectos/tienda\ndolphin bots            # la lista, y si el servicio está prendido\ndolphin bots correr     # los prende: rutinas y Telegram\ndolphin bots instalar   # que arranquen solos al iniciar sesión" },
      {
        t: "p",
        texto:
          "El id sale del nombre (`Vigía` queda `vigia`). Si no le das una plantilla, nace con un alma corta que podés reescribir y con permiso `preguntar`. Piensa con el CLI de Claude Code o de Codex que ya tenés, con tu sesión: no hace falta una clave de API. Con `--demo` (o `--motor mentira`) contesta de mentira y no gasta nada.",
      },
      { t: "h2", texto: "La carpeta", id: "carpeta" },
      {
        t: "arbol",
        filas: [
          { nombre: "~/.dolphin/bots/vigia/", nivel: 0, nota: "o donde diga DOLPHIN_BOTS_DIR" },
          { nombre: "bot.json", nivel: 1, nota: "motor, respaldo, modelo, carpeta de trabajo, permiso, herramientas, rutinas y Telegram" },
          { nombre: "alma.md", nivel: 1, nota: "quién es y cómo te habla" },
          { nombre: "memoria.md", nivel: 1, nota: "lo que aprendió de vos, hasta 2.200 caracteres" },
          { nombre: "habilidades/", nivel: 1 },
          { nombre: "comparar-proveedores.md", nivel: 2, nota: "un procedimiento, con name y description arriba" },
          { nombre: "historial.jsonl", nivel: 1, nota: "la charla: quién dijo qué y cuándo" },
          { nombre: "partes/", nivel: 1, nota: "lo que dejó cada rutina, un archivo por vez" },
          { nombre: "pendiente.json", nivel: 1, nota: "solo mientras espera tu «dale»" },
          { nombre: "checkpoint.json", nivel: 1, nota: "con permiso carpeta: la foto de antes del último cambio" },
          { nombre: "vigia.json", nivel: 1, nota: "con el chequeo del Vigía: lo que vio la última vez" },
        ],
      },
      { t: "p", texto: "Todo es texto. Abrís la carpeta y ves lo que es y lo que aprendió; cambiás `alma.md` o el permiso en `bot.json` y el bot lo usa en el próximo mensaje, sin reiniciar nada." },
      { t: "h2", texto: "Qué lee en cada mensaje", id: "contexto" },
      {
        t: "lista",
        items: [
          "Su alma.",
          "Su memoria entera, que nunca pasa de 2.200 caracteres.",
          "El índice de sus habilidades y, enteros, hasta tres procedimientos que tengan palabras en común con tu mensaje (en una rutina, además, los que esa rutina pida con `--habilidad`).",
          "Los últimos 12 mensajes de la charla.",
          "Tu mensaje.",
        ],
      },
      { t: "h2", texto: "Memoria y habilidades", id: "memoria" },
      {
        t: "p",
        texto:
          "El bot decide qué guardar. Cuando aprende algo de vos lo anota en `memoria.md`, una línea con fecha; cuando resuelve algo que va a volver a pedirse, escribe el procedimiento en `habilidades/`. Solo guarda cuando puede escribir: con permiso `carpeta` o `libre`, o en la vuelta que corre después de tu «dale».",
      },
      {
        t: "p",
        texto:
          "La memoria viaja en cada pedido, así que tiene un tope: 2.200 caracteres. Cuando se acerca, el bot la reescribe entera en un resumen más corto (consolidar). Lo viejo no se pierde: el bot puede buscar por palabras en toda su charla y en sus partes, y le vuelven los cinco fragmentos que más coinciden.",
      },
      {
        t: "p",
        texto: "Por Telegram, `/memoria` y `/habilidades` te muestran lo que tiene y `/olvidar <línea>` borra un recuerdo.",
      },
      { t: "h2", texto: "Permisos", id: "permisos" },
      { t: "diagrama", cual: "permiso" },
      {
        t: "tabla",
        columnas: ["Permiso", "Qué puede"],
        filas: [
          ["leer", "solo lee, con las herramientas que tenga: ni pide permiso ni guarda memoria o habilidades"],
          ["preguntar", "(el de siempre) lee solo; para escribir o ejecutar te pide permiso y espera tu «dale»"],
          ["carpeta", "edita sin preguntar, pero antes de cada vuelta saca una foto de su carpeta; la deshacés con `dolphin bots deshacer`"],
          ["libre", "escribe y ejecuta sin preguntar: lo autorizaste vos"],
        ],
      },
      {
        t: "p",
        texto:
          "Con `preguntar`, el bot corre de solo lectura. Si para cumplir tu pedido necesita cambiar algo, te dice qué quiere hacer y por qué, y deja el pedido en `pendiente.json`, con su propio id. Hay uno solo por vez: si ya hay uno esperando, no lo reemplaza. Contestás «dale», «sí» o «hacelo» (o `dolphin bots dale <id>`) y recién ahí lo vuelve a correr con permisos, para hacer solo eso.",
      },
      {
        t: "p",
        texto:
          "Con `carpeta`, Claude corre en el modo que acepta cambios de archivos sin preguntar, solo con las herramientas del bot, leyendo únicamente dentro de su carpeta y sin los comandos que prohíbe la política del repo (Codex corre con escritura en esa carpeta). Antes de cada vuelta saca la foto: un `git stash create`, que no toca tu rama ni tu índice. `dolphin bots deshacer <id>` te pide que escribas «sí» y deja la carpeta como estaba. La consola tiene el mismo botón.",
      },
      { t: "h2", texto: "Rutinas y latido", id: "rutinas" },
      {
        t: "codigo",
        titulo: "terminal",
        codigo:
          'dolphin bots rutina parte agregar "diario 08:00" "Prepará el resumen de ayer" --tz America/Argentina/Buenos_Aires\ndolphin bots rutina vigia agregar "cada 30" "Revisá el repo y avisá si algo se rompió" --latido --chequeo vigia\ndolphin bots rutina escritor agregar "diario 06:00" "La nota del día" --modelo sonnet --vueltas 4 --habilidad tono-del-blog\ndolphin bots rutina vigia sacar rutina-2',
      },
      {
        t: "p",
        texto:
          "Una rutina corre a una hora todos los días o cada tantos minutos. Lo que deja va a `partes/` y te llega como aviso. Cada rutina puede tener su propio modelo, su tope de vueltas, sus habilidades y su zona horaria: «08:00» con `--tz` es esa hora allá, corra donde corra Dolphin.",
      },
      {
        t: "p",
        texto:
          "Un latido es una rutina que solo avisa si hay algo: si no hay novedad, no deja nada y no te molesta. Si hay un pedido esperando tu «dale», el latido no vuelve a correr hasta que contestes.",
      },
      { t: "h3", texto: "El chequeo, antes del modelo" },
      {
        t: "p",
        texto:
          "Despertar al modelo cada 30 minutos para ver que no pasó nada gasta cupo. Con `--chequeo`, antes corre un script sin modelo que decide si vale la pena. `--chequeo vigia` compara el último commit y el `git status` de la carpeta con lo que vio la vez anterior (lo guarda en `vigia.json`, en la carpeta del bot, no en tu repo): si no cambió nada, la rutina pasa sin gastar un token; si cambió, el bot recibe lo que vio.",
      },
      {
        t: "p",
        texto:
          "También podés escribir tu propio chequeo: un script de PowerShell o sh que termina imprimiendo `{\"despertar\": true|false, \"datos\": …}`. Tiene 30 segundos. Si falla, la rutina corre igual. Los chequeos los escribís vos: si un bot intenta crear o cambiar uno, se ignora y queda anotado.",
      },
      {
        t: "p",
        texto:
          "Una rutina que falla no se relanza en loop: se reintenta a los 5, 15 y 30 minutos y después en su hora de siempre, y el aviso sale una vez por racha.",
      },
      { t: "h2", texto: "Siempre prendidos", id: "servicio" },
      {
        t: "p",
        texto:
          "`dolphin bots correr` mira cada 30 segundos qué rutina toca y atiende Telegram. Un solo proceso a la vez: si ya hay otro prendido, no arranca. Para no tener que dejar una terminal abierta, `dolphin bots instalar` lo deja como servicio que arranca al iniciar sesión, y `dolphin bots desinstalar` lo saca.",
      },
      {
        t: "tabla",
        columnas: ["Sistema", "Cómo se instala"],
        filas: [
          ["Windows", "una tarea programada «Dolphin Bots» al iniciar sesión (`schtasks`)"],
          ["macOS", "un LaunchAgent en `~/Library/LaunchAgents/com.dolphin.bots.plist`"],
          ["Linux", "un servicio de usuario de systemd, `dolphin-bots.service`, que se reinicia si falla"],
        ],
      },
      {
        t: "p",
        texto:
          "Con `--respaldo codex` (o `claude`), si el motor del bot se queda sin cupo, reintenta una vez con el otro y lo anota en la charla.",
      },
      { t: "h2", texto: "Telegram", id: "telegram" },
      { t: "codigo", titulo: "terminal", codigo: "dolphin bots telegram vigia --token <el de @BotFather> --chat <tu chat>" },
      {
        t: "p",
        texto:
          "Cada bot tiene su propio bot de Telegram. Solo atiende al chat que le diste, descarta lo que llegó antes de prenderse y contesta los mensajes en el orden en que llegaron. Además de hablarle, entiende `/memoria`, `/habilidades`, `/rutinas` y `/olvidar <línea>`. Si cambiás el token o el chat, el servicio cierra el canal viejo y abre el nuevo solo.",
      },
      { t: "h2", texto: "La manada", id: "manada" },
      {
        t: "p",
        texto:
          "Un bot le puede pasar trabajo a otro y usar lo que le devuelve: el Escritor le pide datos al Investigador y escribe con eso. La delegación tiene un límite de dos saltos y nadie se consulta a sí mismo ni vuelve a uno que ya está en la cadena. El que recibe el pedido trabaja con el permiso más bajo de los dos, y no puede pedirte permiso en nombre del otro.",
      },
      { t: "h2", texto: "Plantillas", id: "plantillas" },
      {
        t: "tabla",
        columnas: ["Plantilla", "Qué hace", "Permiso", "Rutina"],
        filas: [
          ["vigia", "mira los repos de su carpeta y solo avisa si algo pide atención", "leer", "latido cada 30 minutos, con `--chequeo vigia`"],
          ["parte", "resume qué pasó ayer y qué merece atención hoy", "preguntar", "todos los días, 08:00"],
          ["investigador", "busca fuentes, separa hechos de inferencias y devuelve un informe", "preguntar", "ninguna: cuando le pedís"],
          ["escritor", "escribe una pieza según el tema y el tono que le des", "preguntar", "todos los días, 06:00"],
        ],
      },
      {
        t: "p",
        texto:
          "Cada plantilla trae además sus herramientas: el Vigía y el Parte leen archivos y pueden correr `git status` y `git log`; el Investigador puede buscar y leer en la web; el Escritor lee y busca en su carpeta.",
      },
      { t: "p", texto: "Más contexto y la comparación con otros agentes personales, en [la página de los bots](/bots)." },
    ],
  },
  {
    slug: "atajos",
    titulo: "Atajos",
    resumen: "Un script con nombre que corre siempre igual, sin pasar por ningún modelo. Desde la terminal o desde Telegram con /nombre.",
    grupo: "Bots",
    fuentes: ["src/atajos-cli.ts", "src/atajos.ts", "src/tui/canal-telegram.ts"],
    bloques: [
      {
        t: "p",
        texto:
          "Lo determinista no tiene por qué gastar cupo ni salir distinto cada vez. «Cerrá todo menos el juego y Discord» es un script: lo guardás una vez y lo disparás con un nombre.",
      },
      { t: "codigo", titulo: "terminal", codigo: 'dolphin atajo nuevo juego --archivo juego.ps1 --descripcion "cierra todo menos el juego y Discord"\ndolphin atajo juego          # lo corre\ndolphin atajo                # la lista' },
      {
        t: "p",
        texto:
          "Se guardan en `~/.dolphin/atajos/` (o donde diga `DOLPHIN_ATAJOS_DIR`). Corren con PowerShell en Windows y con sh en el resto, salvo que digas otra cosa con `--consola`. El script entra por la entrada estándar, así no hay comillas que escapar, y tiene dos minutos para terminar.",
      },
      { t: "h2", texto: "Desde Telegram", id: "telegram" },
      {
        t: "p",
        texto:
          "Con `dolphin telegram` prendido, mandarle `/juego` al bot corre ese atajo tal cual y te contesta con el final de lo que escribió. Si no existe un atajo con ese nombre, el mensaje sigue su camino de siempre.",
      },
      { t: "h2", texto: "Revisados", id: "revisados" },
      {
        t: "p",
        texto:
          "Un atajo que creás vos desde la terminal ya está revisado. Uno que propuso un bot nace sin revisar y no corre hasta que lo mirás y lo aprobás: del otro lado de Telegram hay un script que se ejecuta en tu máquina.",
      },
      { t: "codigo", titulo: "terminal", codigo: "dolphin atajo ver juego\ndolphin atajo aprobar juego\ndolphin atajo borrar juego" },
    ],
  },
  {
    slug: "terminal",
    titulo: "La app de terminal",
    resumen: "Escribís dolphin y le hablás como a un colega. Contesta, lo hace un agente o arma un equipo, según lo que haga falta.",
    grupo: "Dónde se usa",
    fuentes: ["src/dolphin.ts", "src/tui/sesion.ts", "src/tui/pensar.ts", "src/tui/cromo.ts", "src/tui/canal-telegram.ts", "src/tui/app.ts", "src/tui/vistas-git.ts", "src/git-cli.ts"],
    bloques: [
      { t: "codigo", titulo: "terminal", codigo: 'dolphin                          # sobre el repo donde estás\ndolphin --repo "D:/mi-proyecto"  # sobre otro\ndolphin --demo                   # con el agente de mentira' },
      {
        t: "p",
        texto:
          "Ves un cuadradito por agente (el líder, cada compañero, el revisor) con su mascota, y entrás a cualquiera para ver su terminal en vivo: lo que lee, lo que edita, lo que corre y lo que le contesta el portón. Usa los mismos datos que la app de escritorio, así que podés pasar de una a otra.",
      },
      { t: "h2", texto: "Comandos con barra", id: "comandos" },
      {
        t: "tabla",
        columnas: ["Comando", "Qué hace"],
        filas: [
          ["`/equipo <tarea>`", "arma el equipo directo"],
          ["`/hacer <tarjeta>`", "el equipo toma una tarjeta del tablero y la va moviendo: Haciendo, y Para revisar si pasa el portón"],
          ["`/objetivo <objetivo>`", "lo persigue hasta lograrlo: reintenta, escala de modelo y te pide ayuda solo si se traba"],
          ["`/objetivo … --oraculo <comando>`", "no está logrado hasta que tu comando salga en 0 sobre la rama del equipo"],
          ["`/lider opus`", "el modelo principal: opus, sonnet o haiku"],
          ["`/memoria <regla>` · `/idea <idea>`", "a la memoria del proyecto · a la bandeja"],
          ["`/integrar` · `/descartar` · `/deshacer <compañero>`", "lo de la rama del equipo"],
          ["`/turnos <compañero>` · `/volver <compañero> <n>`", "cada turno guardado en git, y volver a uno"],
          ["`/programar [diario] 02:00 <tarea>`", "al calendario"],
          ["`/noche <tarea>` · `/parte` · `/aprobar n` · `/descartar n`", "el turno de noche"],
          ["`/bug <lo que viste>` · `/comparar <tarea>` · `/elegir n`", "arreglar con la prueba primero · comparar motores"],
          ["`/buscar <palabras>`", "en todo lo que hablaste con Dolphin en el proyecto"],
          ["`/cuenta` · `/cuenta 2`", "tus cuentas de Claude; si una se queda sin cupo pasa sola a la siguiente"],
          ["`/doctor` · `/abrir <ruta>` · `/ayuda` · `/salir`", "lo demás"],
        ],
      },
      { t: "h2", texto: "Teclas", id: "teclas" },
      {
        t: "tabla",
        columnas: ["Tecla", "Qué hace"],
        filas: [
          ["números", "con el prompt vacío, cambian de sección (alt + número, siempre)"],
          ["ctrl + k", "busca secciones, comandos y proyectos"],
          ["tab", "pasa del prompt a la lista y vuelve"],
          ["r · i · d", "en Equipo: revisar por compañero · integrar · deshacer un compañero"],
          ["← → · o · r", "en Git: ramas, commits e issues · abrir lo elegido en GitHub · releer"],
          ["enter · esc", "en Git: entrar a la rama, al commit o al archivo · volver un paso"],
          ["ctrl + c", "borra el prompt, corta lo que corre o sale"],
        ],
      },
      { t: "h2", texto: "La sección Git", id: "git" },
      {
        t: "p",
        texto:
          "La sección 7, como lazygit: a la izquierda una lista y a la derecha el detalle de lo elegido. Las flechas ← → pasan entre tres pestañas, `o` abre lo elegido en GitHub y `r` relee todo.",
      },
      {
        t: "p",
        texto:
          "Con `enter` se entra: de una rama a sus commits, de un commit a sus archivos (con el diff del elegido al lado) y de un archivo a su diff entero, que se recorre con ↑ ↓. `esc` vuelve un paso, a la fila de donde entraste. Un merge se lee contra su primer padre: se ve lo que trajo.",
      },
      {
        t: "tabla",
        columnas: ["Pestaña", "La lista", "El detalle"],
        filas: [
          ["Ramas", "cada rama con cuántos commits tiene adelante y atrás de la base, su PR, quiénes la tocaron y hace cuánto; las mergeadas, con una tilde", "los commits que la base no tiene"],
          ["Commits", "el grafo de la rama actual, con un color por carril y las ramas que apuntan a cada commit", "el mensaje entero y los archivos que tocó, con lo que sumó y lo que sacó"],
          ["Issues", "los de GitHub, abiertos y cerrados", "quién lo abrió, las etiquetas, los asignados y el enlace"],
        ],
      },
      {
        t: "p",
        texto:
          "Cada persona aparece con sus iniciales en un color propio. Lo de GitHub (los PR y los issues) sale de `gh`. Es la misma información que la [vista Git de la consola](/docs/consola#git) y la de la [app de escritorio](/escritorio#git).",
      },
      {
        t: "codigo",
        titulo: "terminal",
        codigo: "dolphin git                            # un resumen de las tres, sin abrir la app\ndolphin git ramas --todas              # también las mergeadas\ndolphin git commits --rama main -n 30\ndolphin git issues --todas             # también los cerrados",
      },
      { t: "p", texto: "Los flags de `dolphin git` están en la [referencia de la CLI](/docs/cli#cmd-git)." },
      { t: "h2", texto: "Cómo decide", id: "decide" },
      {
        t: "p",
        texto:
          "Cada proyecto lo ajusta en `terminal` del [dolphin.config.json](/docs/configuracion): `modo` (`pensar`, `equipo`, `agente` o `charla`), el `modelo` que decide, si `preguntar` antes de un proyecto serio, si `aprobarPlan` espera tu «dale», el `tope` en dólares y los scripts de `verificar`.",
      },
      { t: "h2", texto: "Desde el celular", id: "telegram" },
      { t: "codigo", titulo: "terminal", codigo: 'DOLPHIN_TELEGRAM_TOKEN=<el de @BotFather> DOLPHIN_TELEGRAM_CHAT=<tu chat> dolphin telegram --repo "D:/mi-proyecto"' },
      {
        t: "p",
        texto:
          "Lo que le escribís al bot es lo mismo que escribir en la terminal: la misma memoria, el mismo «dale» para un plan. Solo atiende al chat de `DOLPHIN_TELEGRAM_CHAT`, porque un bot lo puede encontrar cualquiera.",
      },
      {
        t: "nota",
        texto: "Con `--dangerously-skip-permissions` el agente no pide permisos. El delfín se pone rojo para que se note, y el portón y la política siguen encima.",
      },
    ],
  },
  {
    slug: "consola",
    titulo: "La consola",
    resumen: "La versión web de Dolphin, servida desde tu máquina en 127.0.0.1: tareas, bandeja, tablero, cosechas, memoria, bots y git.",
    grupo: "Dónde se usa",
    fuentes: ["src/ui-cli.ts", "src/servidor.ts", "src/servidor-bots.ts", "src/servidor-git.ts", "src/nucleo/vista-git.ts", "ui/src/components/Git.tsx", "README.md"],
    bloques: [
      { t: "codigo", titulo: "terminal", codigo: "dolphin ui --abrir" },
      {
        t: "tabla",
        columnas: ["Pantalla", "Qué hay"],
        filas: [
          ["Nueva", "una tarea, un objetivo o varias a la cola, ahora o agendadas"],
          ["Bandeja", "ideas y errores que Dolphin encontró solo; se implementan o se rechazan con un toque"],
          ["Tablero", "lo último, la actividad, quién rinde, lo que cuesta y Guardian"],
          ["Cosechas", "cada rama con su diff, sus fases y los botones para mergear o abrir un PR en borrador"],
          ["Memoria", "lo que frena solo, lo que va en el pedido y lo que espera tu ok"],
          ["Bots", "tus bots, su charla, sus rutinas, sus pedidos de permiso y el botón para deshacer lo que cambió uno con permiso carpeta"],
          ["Git", "las ramas, los commits y los issues del repo, con quién trabajó en cada cosa"],
        ],
      },
      { t: "h2", texto: "La vista Git", id: "git" },
      {
        t: "p",
        texto:
          "Tres tablas, con filtro y columnas a elegir. Ramas: el último commit, quiénes trabajaron, cuántos commits tiene adelante y atrás de la base, si ya está mergeada y su PR. Commits: el mensaje, el autor y las ramas que apuntan a cada uno. Issues: etiquetas, asignados, quién lo abrió y si sigue abierto.",
      },
      {
        t: "tabla",
        columnas: ["Tabla", "Filtros rápidos (además, todas se filtran escribiendo)"],
        filas: [
          ["Ramas", "todas · por integrar · mergeadas · las que abrió Dolphin"],
          ["Commits", "ninguno: se filtran escribiendo"],
          ["Issues", "abiertos · cerrados · todos"],
        ],
      },
      {
        t: "p",
        texto:
          "Todo sale de git y, si el repo es de GitHub y tenés `gh`, de GitHub (los PR y los issues), leído en el momento: no guarda nada aparte. Es de solo lectura. Las caras son las fotos de GitHub y aparecen solo cuando se sabe el usuario.",
      },
      {
        t: "p",
        texto:
          "Tocá una rama para ver sus commits (los que la base no tiene arriba, los compartidos debajo) y un commit para verlo entero: el mensaje, sus archivos y el diff. Un clic en un archivo te lleva a su parte del diff. La flecha de arriba, las migas o `esc` vuelven.",
      },
      {
        t: "p",
        texto:
          "Varios proyectos en la misma consola, la siembra en vivo mientras corre y todo servido desde tu máquina: ni una fuente ni un ícono de un CDN.",
      },
      { t: "h2", texto: "Un objetivo en vez de una tarea", id: "objetivo" },
      {
        t: "p",
        texto:
          "En Nueva, «un objetivo» hace que Dolphin lea el repo y lo parta en un plan de tareas, cada una con su modelo y su tope de plata. Lo editás, lo aprobás y va a la cola.",
      },
      { t: "h2", texto: "La bandeja se llena sola", id: "bandeja" },
      { t: "codigo", titulo: "terminal", codigo: "dolphin explorar --url http://127.0.0.1:3000   # errores de tu app\ndolphin ideas                                  # ideas vistas en otros productos" },
      {
        t: "nota",
        texto: "Escucha solo en 127.0.0.1, y todo lo que cambia algo (sembrar, mergear, el modo live) pide su pase y un Host local.",
      },
    ],
  },
  {
    slug: "escritorio",
    titulo: "App de escritorio",
    resumen: "Con la consola adentro: tablero, cosechas, memoria, bots y git, el chat sobre el CLI de verdad, la isla, X-ray y el modo live.",
    grupo: "Dónde se usa",
    fuentes: ["escritorio/README.md", "escritorio/src/main/dolphin/dolphin-xray.ts", "ui/src/components/Git.tsx", "README.md"],
    bloques: [
      {
        t: "lista",
        items: [
          "El chat sobre el CLI: cada agente abre en una vista de chat con el CLI interactivo de verdad abajo. Arriba, una barra con el modelo, en qué anda, cuánto del plan te queda y el contexto.",
          "Los archivos al costado: lo que el agente escribe se abre a la derecha en modo cambios, sin robarte el foco.",
          "La isla: una pastilla arriba de la pantalla, encima de cualquier app, que dice qué agente te necesita o terminó. Le respondés desde ahí.",
          "Dictado local: el micrófono baja un modelo de voz que corre en tu compu.",
          "La consola de Dolphin adentro, con el calendario corriendo mientras la app está abierta.",
        ],
      },
      { t: "h2", texto: "Las vistas", id: "vistas" },
      {
        t: "tabla",
        columnas: ["Vista", "Qué hay"],
        filas: [
          ["Tablero", "lo último, la actividad, quién rinde, lo que cuesta y Guardian"],
          ["Tareas", "los issues y los PR de GitHub del proyecto, con filtros"],
          ["Cosechas", "cada rama con su diff, sus fases y los botones para mergear o abrir un PR en borrador"],
          ["Bandeja", "ideas y errores que Dolphin encontró solo"],
          ["Memoria", "lo que ya sabe, lo que está en observación y lo que espera tu ok"],
          ["Bots", "tus bots, su charla, su alma, su memoria, sus habilidades y sus rutinas"],
          ["Git", "las ramas, los commits y los issues del repo, con quién trabajó en cada cosa: la misma [vista Git de la consola](/docs/consola#git)"],
          ["Automatizaciones", "el trabajo del agente, programado"],
          ["Orquestación", "los trabajos que un agente repartió entre varios: quién espera a quién, qué terminó y qué falló"],
          ["Delfines", "tus bots: si corren, cuándo les toca, lo que gastaron contra su tope y lo último que dijeron; [«Correr en tu servidor»](/docs/servidor#bots) los lleva a tu VPS"],
        ],
      },
      {
        t: "p",
        texto:
          "Para repartir trabajo no hace falta una vista: pedile a Claude «delegá las tareas» y lo reparte en agentes de Dolphin que ves trabajar en la app. Ctrl+K en el editor edita o contesta sobre lo que seleccionaste, con el cambio como diff antes de aplicarlo. Y si a la compu le falta RAM, avisa antes de colgarse: [tu servidor](/docs/servidor#poca-ram).",
      },
      { t: "p", texto: "Cada una, con su captura, en la [página de la app de escritorio](/escritorio)." },
      { t: "h2", texto: "X-ray", id: "xray" },
      {
        t: "p",
        texto:
          "Con Ctrl + Alt + X se prende una capa sobre todas las pantallas. Señalás un control de cualquier app y el agente recibe la app, la ventana, el rol, el nombre, el texto y un recorte, leídos de la accesibilidad del sistema. Desde ahí también se reporta un bug (`dolphin bug --elemento`). Por ahora es solo de Windows.",
      },
      { t: "h2", texto: "El modo live", id: "live" },
      {
        t: "p",
        texto:
          "En el navegador integrado tocás un elemento de tu app, decís qué cambiarle («hacé este botón amarillo»), Dolphin siembra la rama, la pasa por el portón y la mergeás desde ahí. Tu dev server muestra el cambio.",
      },
      { t: "h2", texto: "Correrla", id: "correr" },
      { t: "codigo", titulo: "terminal", codigo: "cd escritorio\npnpm install\npnpm dev" },
      {
        t: "p",
        texto:
          "Lo más simple es el instalador de tu sistema, que baja de la última versión en GitHub: `dolphin-windows-setup.exe` (Windows), `dolphin-macos-arm64.dmg` (macOS con Apple Silicon; `dolphin-macos-x64.dmg` para Intel) o `dolphin-linux.AppImage` (Linux). Todavía no están firmados: en Windows, SmartScreen pide «Más información → Ejecutar de todas formas»; en macOS, clic derecho → Abrir. Desde el código, la app busca el núcleo de Dolphin en la carpeta de arriba, o donde diga `DOLPHIN_APP_DIR`.",
      },
    ],
  },
  {
    slug: "servidor",
    titulo: "Tu servidor",
    resumen: "Conectar un VPS a la app en un paso, qué hacer si no conecta, y llevar ahí a tus bots y el trabajo pesado.",
    grupo: "Dónde se usa",
    fuentes: [
      "escritorio/src/cli/specs/host-setup.ts",
      "escritorio/src/cli/handlers/host-setup.ts",
      "escritorio/skills/dolphin-delegar/SKILL.md",
      "escritorio/src/renderer/src/components/dolphin/delfines/LlevarAlServidor.tsx",
      "escritorio/src/main/memoria-baja/vigia-de-memoria-baja.ts",
    ],
    bloques: [
      {
        t: "p",
        texto:
          "Cualquier máquina Linux a la que llegues por SSH sirve: un VPS, una compu vieja en tu casa. La app le instala su servidor la primera vez que se conecta; los instaladores ya lo traen, así que el servidor no baja nada más.",
      },
      { t: "h2", texto: "Conectarlo", id: "conectar" },
      {
        t: "ruta",
        pasos: [
          {
            titulo: "Desde la app",
            texto:
              "«Conectar una máquina», donde elegís dónde corre un espacio de trabajo. Ponés la dirección, el usuario y tu llave SSH. Antes de guardarlo lo prueba: si no conecta, no queda guardado a medias.",
          },
          {
            titulo: "O desde la terminal",
            texto: "Lo mismo, para hacerlo de una o para que lo haga un agente.",
            codigo: "dolphin host add --address 203.0.113.10 --user root --label mi-vps --install-server\ndolphin host connect mi-vps",
          },
        ],
      },
      {
        t: "nota",
        texto:
          "Ninguno de los dos comandos recibe una contraseña: usá una llave (`--identity-file`) o ssh-agent. Si el servidor pide contraseña, la app te la pregunta al conectar.",
      },
      { t: "h2", texto: "Si no conecta", id: "si-no-conecta" },
      {
        t: "p",
        texto:
          "La app dice por qué y ofrece «Arreglarlo con un agente». Desde la terminal, `dolphin host doctor` da el mismo diagnóstico: si conecta, si el servidor de Dolphin corre allá, el motivo con un código fijo y el paso que sigue.",
      },
      { t: "codigo", titulo: "terminal", codigo: "dolphin host doctor mi-vps\ndolphin host doctor mi-vps --json" },
      {
        t: "tabla",
        columnas: ["Motivo", "Qué suele ser"],
        filas: [
          ["`auth`", "ninguna llave entra: instalá la tuya con `ssh-copy-id usuario@servidor` (escribís la contraseña una vez) o revisá el usuario"],
          ["`passphrase`", "la llave tiene clave: cargala en ssh-agent con `ssh-add`"],
          ["`timeout`, `refused`", "el puerto no está abierto: el firewall del proveedor y `ufw status` en el servidor tienen que dejarlo pasar, y sshd tiene que estar corriendo"],
          ["`host-key`", "la huella del servidor cambió (lo reinstalaste): sacá la vieja con `ssh-keygen -R <dirección>`"],
          ["`server:…`", "conectó, pero el servidor de Dolphin no arrancó allá: poco disco, la carpeta de usuario montada sin permiso de ejecutar o una red que no deja bajar Node; lo que sigue de los dos puntos dice cuál"],
        ],
      },
      {
        t: "p",
        texto:
          "`doctor` sale con error mientras algo falle, así que un agente puede corregir y volver a probar hasta que conecte. Es lo que pasa si abrís un Claude en Dolphin y le decís «necesito tener esto trabajando en mi VPS»: trae la guía (`dolphin skills get dolphin-vps`) y lo que sólo podés hacer vos —iniciar una sesión, dar un permiso— te lo deja escrito con el comando para copiar.",
      },
      { t: "h2", texto: "Tus bots, en el servidor", id: "bots" },
      {
        t: "p",
        texto:
          "En Delfines, «Correr en tu servidor» lleva un bot a tu VPS como un servicio de usuario de systemd: sigue andando con tu compu apagada. Antes de tocar nada revisa que haya Linux con systemd, Node 22.12 o más nuevo, Claude Code con la sesión iniciada allá y que los servicios sigan corriendo sin una sesión abierta. Si falta algo, lo dice y no instala nada.",
      },
      { t: "h2", texto: "Cuando a tu compu le falta RAM", id: "poca-ram" },
      {
        t: "p",
        texto:
          "Con un servidor conectado, el aviso de poca memoria ofrece abrir un espacio igual allá y dormir el de tu compu: lo que no subiste a git se queda donde estaba. Sin servidor, ofrece dormirlo. Se maneja en Ajustes → General → Memoria.",
      },
      { t: "h2", texto: "Repartir trabajo", id: "delegar" },
      {
        t: "p",
        texto:
          "Pedile a Claude «delegá las tareas», «pasale esto a Codex» o «hacelo en paralelo»: reparte el trabajo en agentes de Dolphin —en tu compu o en el servidor—, cada uno en su espacio y su rama. Lo enseña la skill `dolphin-delegar`, que viene instalada.",
      },
    ],
  },
  {
    slug: "cli",
    titulo: "Referencia de la CLI",
    resumen: "Todos los comandos de dolphin, con sus flags, leídos del código.",
    grupo: "Referencia",
    fuentes: ["src/dolphin.ts", "src/*-cli.ts"],
    bloques: [],
  },
  {
    slug: "configuracion",
    titulo: "Configuración",
    resumen: "Todo es opcional. Cada repo decide cómo trabaja en un dolphin.config.json versionado con el código.",
    grupo: "Referencia",
    fuentes: ["src/nucleo/config.ts", "src/nucleo/router.ts", "src/nucleo/entorno.ts", "src/nucleo/guardian.ts", "src/tester/escalon-pantalla.ts", "src/tui/pensar.ts", "src/nucleo/aislado.ts"],
    bloques: [
      {
        t: "codigo",
        titulo: "dolphin.config.json",
        codigo:
          '{\n  "modelos": { "estrategia": "equilibrada", "escribir": "sonnet", "revisar": "haiku" },\n  "pantalla": { "levantar": "npm run dev -- --port {PUERTO}", "url": "http://127.0.0.1:{PUERTO}/" },\n  "vision": true,\n  "entorno": {\n    "dependencias": "enlazar",\n    "copiar": ["config/local.json"],\n    "preparar": ["npm run db:migrar", "npm run db:semilla"],\n    "puerto": { "variable": "APP_PORT", "desde": 4100 }\n  },\n  "testsExistentes": "aprobar",\n  "guardian": { "fases": ["typecheck", "test"], "repetir": 2 },\n  "terminal": { "modo": "pensar", "tope": 5, "verificar": ["typecheck", "test"] }\n}',
      },
      { t: "h2", texto: "Las claves", id: "claves" },
      {
        t: "tabla",
        columnas: ["Clave", "Qué decide"],
        filas: [
          ["`modelos`", "`estrategia` (`calidad`, `equilibrada`, `economia`) y quién hace cada cosa: `escribir`, `corregir`, `revisar` (`false` la apaga) y `planificar`"],
          ["`pantalla`", "cómo se levanta la app de cada rama: `levantar` y `url` con `{PUERTO}`, `espera` (ms), `personas`, `superficies`, `videoDeLoQueAnda`"],
          ["`vision`", "`true`, o `{ \"juez\": \"sonnet\", \"anchos\": [1440, 390] }`; necesita `pantalla`"],
          ["`entorno`", "`dependencias` (`enlazar`, `instalar` o `nada`), `copiar`, `preparar` (corre con el `PORT` y la `DATABASE_URL` de ese worktree) y `puerto`"],
          ["`testsExistentes`", "si una rama cambia tests que ya existían: `avisar`, `aprobar` o `cortar`"],
          ["`politica`", "`archivosProhibidos` y `comandosProhibidos` para lo que corre solo; cada una reemplaza la lista de siempre"],
          ["`porton`", "`comandos`: fases que no son npm (pytest, go test…)"],
          ["`guardian`", "`fases`, cuántas veces `repetir` una que se rompió, la `rama` y el `tope` en segundos"],
          ["`terminal`", "`modo`, `modelo`, `preguntar`, `aprobarPlan`, `tope` (dólares) y `verificar`"],
          ["`explorar`", "`noTocar`: textos que el explorador nunca toca"],
          ["`hosts`", "máquinas para los turnos por SSH: `destino`, `repo` y `dolphin`"],
          ["`aislado`", "el agente corre en una caja que solo ve su worktree; sin caja en la máquina, no corre"],
          ["`autopiloto`", "`topeCupoPct`: el uso que hace pausar el trabajo de la noche"],
          ["`suscripcion`", "`true` si el agente corre con una suscripción: no se muestran montos"],
        ],
      },
      { t: "h2", texto: "Dónde guarda las cosas", id: "datos" },
      {
        t: "arbol",
        filas: [
          { nombre: "tu-repo/.dolphin/", nivel: 0, nota: "se ignora a sí misma: no ensucia tu git" },
          { nombre: "cosechas, partes/, videos/", nivel: 1, nota: "cada siembra, su parte HTML y lo que falló" },
          { nombre: "memoria, PERFIL.md, DREAMS.md", nivel: 1, nota: "lo que sabe del proyecto y por qué" },
          { nombre: "bandeja, calendario, noches/", nivel: 1 },
          { nombre: "~/.dolphin/", nivel: 0, nota: "o DOLPHIN_HOME" },
          { nombre: "bots/", nivel: 1, nota: "o DOLPHIN_BOTS_DIR" },
          { nombre: "atajos/", nivel: 1, nota: "o DOLPHIN_ATAJOS_DIR" },
        ],
      },
      { t: "h2", texto: "Variables de entorno", id: "entorno" },
      {
        t: "tabla",
        columnas: ["Variable", "Para qué"],
        filas: [
          ["`DOLPHIN_TELEGRAM_TOKEN` · `DOLPHIN_TELEGRAM_CHAT`", "avisos y `dolphin telegram`"],
          ["`DOLPHIN_HOME`", "la lista de proyectos y la memoria que no es de un repo"],
          ["`DOLPHIN_BOTS_DIR` · `DOLPHIN_ATAJOS_DIR`", "dónde viven los bots y los atajos"],
          ["`DOLPHIN_APP_DIR`", "para la app de escritorio: dónde está el núcleo"],
        ],
      },
      { t: "p", texto: "Y `.worktreeinclude`: archivos sin versionar que cada rama necesita, uno por línea. Los `.env` de siempre se copian solos." },
    ],
  },
];

export function paginaDe(slug: string): PaginaDeDoc | undefined {
  return PAGINAS.find((p) => p.slug === slug);
}

export const rutaDe = (slug: string) => (slug ? `/docs/${slug}` : "/docs");
