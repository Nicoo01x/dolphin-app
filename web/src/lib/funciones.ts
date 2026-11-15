/**
 * Todo lo que Dolphin hace, leído del código y no de la documentación (31/10/2026).
 *
 * Cada función de acá existe de verdad: `archivo` dice dónde está, para poder abrirla y
 * comprobarla. Lo que está escrito pero todavía no tiene por dónde usarse va marcado con
 * `enCamino` y se dice qué le falta: una lista que promete lo que no anda es peor que una
 * lista corta.
 *
 * Los grupos no son las carpetas del repo: son las ocho cosas que una persona viene a hacer
 * —escribir, probar, decidir, recordar, organizar, acompañar, mirar, cuidar—.
 */

/**
 * Por dónde se usa.
 *
 * - `terminal`: el comando `dolphin` y la app de terminal (`src/`).
 * - `consola`: la consola web que levanta `dolphin ui` (`ui/`). **La app de escritorio la trae
 *   adentro** (`escritorio/src/main/dolphin/dolphin-console.ts`), así que todo lo que dice
 *   `consola` también se usa desde ahí.
 * - `escritorio`: lo que SOLO suma la app de escritorio (la isla, X-ray, el dictado, el estudio).
 * - `bots`: los bots siempre prendidos, que viven en `~/.dolphin/bots` y no en un repo.
 *
 * El sitio público no corre nada: cuenta estas funciones, no es una de ellas.
 */
export type Superficie = 'terminal' | 'consola' | 'escritorio' | 'bots'

export interface Funcion {
  readonly id: string
  readonly nombre: string
  /** Una frase: qué resuelve para la persona. */
  readonly queHace: string
  /** La decisión o el dolor que hay detrás, cuando vale contarlo. */
  readonly porQueImporta?: string
  readonly donde: readonly Superficie[]
  /** El comando exacto, si tiene uno. */
  readonly comando?: string
  /** De dónde salió, relativo a la raíz del repo. */
  readonly archivo: string
  /** Está escrito y probado, pero todavía no hay por dónde usarlo. `queFalta` lo dice. */
  readonly enCamino?: true
  readonly queFalta?: string
}

export interface GrupoDeFunciones {
  readonly id: string
  readonly titulo: string
  readonly resumen: string
  readonly funciones: readonly Funcion[]
}

export const FUNCIONES: readonly GrupoDeFunciones[] = [
  {
    id: 'escribir',
    titulo: 'Escribir',
    resumen:
      'Le contás qué hay que hacer y se escribe en una rama propia, en una copia aparte del proyecto. Varias ramas a la vez, cada una encarando la tarea de otra manera, con el motor que te convenga.',
    funciones: [
      {
        id: 'sembrar',
        nombre: 'Sembrar en varias ramas',
        queHace:
          'Escribe la misma tarea en varias ramas a la vez, cada una en su copia del proyecto, y se queda con la que pasa las pruebas.',
        porQueImporta:
          'Ocho intentos tardan lo que tarda el más lento, no ocho veces: nadie espera a nadie, y el que se cae escribiendo queda afuera antes de llegar a las pruebas.',
        donde: ['terminal', 'consola'],
        comando: 'dolphin sembrar --tarea "…" --n 3',
        archivo: 'src/nucleo/sembrar.ts',
      },
      {
        id: 'enfoques',
        nombre: 'Un ángulo distinto por rama',
        queHace:
          'A cada rama le pide la tarea de otra manera: una busca el cambio más chico, otra la causa de raíz, otra escribe primero la prueba.',
        porQueImporta:
          'Pedirle ocho veces lo mismo al mismo modelo devuelve casi lo mismo ocho veces: la variedad sale de pedir cosas distintas, no de subir la temperatura. Los primeros ángulos son los que más seguido ganan, así que con tres ramas ya se prueban los tres más útiles.',
        donde: ['terminal', 'consola'],
        archivo: 'src/nucleo/enfoques.ts',
      },
      {
        id: 'router-de-modelos',
        nombre: 'Quién escribe y quién revisa',
        queHace:
          'Reparte el trabajo entre modelos: el bueno escribe, uno barato revisa, y el que revisa nunca es el que escribió.',
        porQueImporta:
          'Un modelo no ve sus propios errores. Y hay tres estrategias —calidad, equilibrada, economía— que no son una tabla fija: salen de lo que midió este repo.',
        donde: ['terminal', 'consola'],
        comando: 'dolphin sembrar --estrategia calidad|equilibrada|economia',
        archivo: 'src/nucleo/router.ts',
      },
      {
        id: 'motores',
        nombre: 'El motor que quieras',
        queHace:
          'Trabaja con Claude Code, Codex, Antigravity y los demás agentes de terminal, declarados en una tabla; `dolphin motores` dice cuáles están instalados y hasta dónde se probó cada uno.',
        porQueImporta:
          'Las banderas de estos comandos cambian seguido: es más honesto decir «esta la leí en la documentación pero no la corrí» que hacer como que todas valen lo mismo.',
        donde: ['terminal'],
        comando: 'dolphin motores',
        archivo: 'src/agentes/motores.ts',
      },
      {
        id: 'relevo-de-motor',
        nombre: 'Si un motor no puede, sigue otro',
        queHace:
          'Cuando el motor que venía trabajando no puede seguir —se le terminó el cupo, se le venció la sesión, falta la clave—, la rama la retoma otro en el MISMO worktree, con el traspaso de lo que ya se hizo: el pedido completo, por qué rebotó, qué fases ya pasan, qué archivos tocó y lo último que dijo.',
        porQueImporta:
          'Antes, un cupo agotado a mitad de camino era una rama perdida con trabajo adentro. El traspaso no lo escribe un modelo —eso cuesta una llamada más justo cuando estamos gastando menos, y un resumen inventa—: se selecciona texto que ya existe, y lo que no entra se dice. Y nunca rota entre cuentas del mismo proveedor: usar la segunda cuando la primera se agotó esquiva el límite que esa empresa puso.',
        donde: ['terminal', 'consola'],
        comando: 'dolphin sembrar --agente claude --relevo gemini,codex',
        archivo: 'src/nucleo/relevo.ts',
      },
      {
        id: 'acp',
        nombre: 'Sumar un motor sin escribir código',
        queHace:
          'Habla el protocolo abierto ACP, así que sumar un agente nuevo es decir con qué comando se lanza en `dolphin.config.json`.',
        porQueImporta:
          'Además, el agente va contando lo que hace mientras lo hace y, cuando lo sabe, cuánto gastó: con los comandos pelados eso era adivinar leyendo su salida.',
        donde: ['terminal'],
        comando: 'dolphin sembrar --agente acp',
        archivo: 'src/agentes/acp.ts',
      },
      {
        id: 'misma-memoria-todos',
        nombre: 'Todos reciben lo mismo',
        queHace:
          'Cualquier motor recibe el mismo pedido: la tarea, el perfil del proyecto, las reglas de la casa y qué tiene que declarar al terminar.',
        porQueImporta:
          'La memoria es del proyecto y no del modelo: por eso uno barato encara las cosas como uno caro, sin tener que adivinar lo que el repo ya aprendió.',
        donde: ['terminal', 'consola'],
        archivo: 'src/agentes/pedidos.ts',
      },
      {
        id: 'contrato-de-superficie',
        nombre: 'Qué parte del producto tocó',
        queHace:
          'Cada rama declara al terminar qué pantallas de la app cambió, qué hizo y qué quedó pendiente.',
        porQueImporta:
          'Sin eso, el que mira la pantalla prueba a ciegas y puede estar mirando una parte que no cambió.',
        donde: ['terminal', 'consola'],
        archivo: 'src/agentes/pedidos.ts',
      },
      {
        id: 'copia-aparte',
        nombre: 'Una copia del proyecto por rama',
        queHace:
          'Cada rama trabaja en su propia copia del repo, con lo que necesita para andar: las dependencias enlazadas, el `.env`, lo que no está versionado.',
        porQueImporta:
          'Así se juzga el código y no la máquina: sin dependencias, el chequeo de tipos falla por un paquete que no está; y lo que se escriba vive en una carpeta descartable, sin tocar tu proyecto.',
        donde: ['terminal', 'consola'],
        archivo: 'src/nucleo/entorno.ts',
      },
      {
        id: 'puerto-por-rama',
        nombre: 'Un puerto y una base por rama',
        queHace:
          'Reserva un puerto de verdad y una base de datos aparte para cada rama, así dos pueden levantar la app a la vez sin pisarse.',
        porQueImporta:
          'Dos ramas levantando la app en el mismo puerto se pisan, una falla, y las pruebas la matan culpando a su código. Un veredicto equivocado es peor que no tener veredicto.',
        donde: ['terminal', 'consola'],
        archivo: 'src/nucleo/puertos.ts',
      },
      {
        id: 'presupuesto',
        nombre: 'Un tope en dólares',
        queHace:
          'Le pones un tope de plata a toda la siembra —escribir, probar y corregir— y, alcanzado, no se corrige más.',
        donde: ['terminal', 'consola'],
        comando: 'dolphin sembrar --presupuesto 5',
        archivo: 'src/nucleo/sembrar.ts',
      },
      {
        id: 'cache-de-respuestas',
        nombre: 'Lo ya contestado no se vuelve a pagar',
        queHace:
          'Guarda lo que el modelo escribió para una tarea sobre un estado del código, y si le pedís lo mismo otra vez lo aplica directo: ni un token, ni la espera.',
        porQueImporta:
          'Si el código cambió de maneras que la llave no vio y el parche ya no entra, se cae al agente de verdad sin ruido.',
        donde: ['terminal', 'consola'],
        archivo: 'src/nucleo/cache.ts',
      },
      {
        id: 'turnos',
        nombre: 'Los turnos de un agente, con vuelta atrás',
        queHace:
          'Cada turno —escribir, y cada corrección después— deja guardado cómo estaba todo, y se puede volver a cualquiera sin perder los de después.',
        porQueImporta:
          'Volver no borra: suma un paso encima con el árbol de ese turno, así que si querés ir para adelante otra vez, está.',
        donde: ['terminal'],
        comando: '/turnos <compañero> · /volver <compañero> 1',
        archivo: 'src/nucleo/turnos.ts',
      },
      {
        id: 'puntos-de-control',
        nombre: 'Una corrección que empeora las cosas se descarta',
        queHace:
          'Antes de cada vuelta de corrección saca una foto, y si la vuelta arregla una prueba pero rompe otra que ya estaba en verde, vuelve a la foto.',
        porQueImporta: 'Si no, se corrige encima del lodo y cada vuelta deja el código peor.',
        donde: ['terminal', 'consola'],
        archivo: 'src/nucleo/puntos.ts',
      },
      {
        id: 'perseguir-un-objetivo',
        nombre: 'Perseguir un objetivo hasta lograrlo',
        queHace:
          'Reintenta con lo que falló como pista, sube de modelo cuando el error se repite igual, y recién te pide ayuda si se traba —con la evidencia y qué haría por defecto—.',
        porQueImporta:
          'La escalera distingue un error NUEVO (hubo progreso: reintentar) del MISMO error otra vez (no hay progreso: escalar). Y si lo que falta es una herramienta que no está, no reintenta a ciegas.',
        donde: ['terminal'],
        comando: '/objetivo <lo que hay que lograr>',
        archivo: 'src/nucleo/persistir.ts',
      },
      {
        id: 'agente-de-mentira',
        nombre: 'Probarlo todo sin gastar un peso',
        queHace:
          'Un agente de mentira que escribe cambios de verdad, para ver el circuito entero —copias, pruebas, elección, cola— sin gastar un token.',
        donde: ['terminal', 'consola'],
        comando: 'dolphin --demo · npm run demo',
        archivo: 'src/agentes/mentira.ts',
      },
    ],
  },

  {
    id: 'probar',
    titulo: 'Probar',
    resumen:
      'El portón: una escalera de pruebas ordenada por lo que cuesta cada una. Lo gratis corre primero y mata a la mayoría; el modelo caro recién decide entre los que quedaron vivos. Y la app se mira andando, no solo compilando.',
    funciones: [
      {
        id: 'porton',
        nombre: 'El portón, por escalones de costo',
        queHace:
          'Corre las pruebas en escalones de precio, y cada escalón se aplica a todas las ramas vivas antes de pasar al siguiente.',
        porQueImporta:
          'Es toda la idea del producto: si cada rama se probara de punta a punta, la primera gastaría el modelo caro antes de que el chequeo de tipos matara a la segunda. Esa diferencia es la que hace que ocho intentos no cuesten ocho veces.',
        donde: ['terminal', 'consola'],
        archivo: 'src/nucleo/porton.ts',
      },
      {
        id: 'verificadores-del-repo',
        nombre: 'Las pruebas que ya tenés',
        queHace:
          'Usa lo que ya está escrito en tu repo —tipos, lint, pruebas, construcción, el medidor de peso— como las fases del portón.',
        porQueImporta:
          'Por eso Dolphin no necesita inventar un juez: el repo ya lo tiene, solo que hoy lo corre una persona cuando se acuerda.',
        donde: ['terminal', 'consola'],
        comando: 'dolphin sembrar --verificar typecheck,test',
        archivo: 'src/nucleo/verificadores.ts',
      },
      {
        id: 'arranque',
        nombre: 'Arranque en 30 segundos',
        queHace:
          'La primera vez en un repo mira qué es (node, python, go, rust), con qué se instala y qué hay para probarlo, y propone la configuración.',
        porQueImporta:
          'Solo lee: lo escribe quien lo aprueba. Y si no hay nada para probar lo dice, en vez de fingir un portón vacío.',
        donde: ['terminal'],
        archivo: 'src/nucleo/arranque.ts',
      },
      {
        id: 'linea-base',
        nombre: '¿El repo ya estaba en rojo?',
        queHace:
          'Antes de gastar un peso corre las pruebas gratis sobre el repo como está, y avisa si ya fallaban.',
        porQueImporta:
          'Si los tests del repo fallan de entrada, todas las ramas mueren en la misma fase y parece culpa de los agentes.',
        donde: ['terminal', 'consola'],
        comando: 'dolphin sembrar --igual (para hacerlo igual)',
        archivo: 'src/nucleo/linea-base.ts',
      },
      {
        id: 'revision-cruzada',
        nombre: 'Otro modelo lee el cambio',
        queHace:
          'Un modelo distinto del que escribió lee lo que cambió contra la tarea y decide si se acepta, en una oración.',
        porQueImporta:
          'Atrapa lo que ninguna prueba atrapa: un cambio que compila y pasa todo pero no hace lo que se pidió, o que hace de más. No juzga estilo.',
        donde: ['terminal', 'consola'],
        archivo: 'src/agentes/revisor.ts',
      },
      {
        id: 'tests-intactos',
        nombre: 'No se ponen verdes tocando las pruebas',
        queHace:
          'Vigila que no se les saquen líneas ni se borren las pruebas que ya existían. Sumar pruebas está bien; tocar las de antes se avisa, se exige aprobación o se corta, según lo que elijas.',
        porQueImporta: 'Es el truco más viejo para ponerse verde: cambiar la prueba en vez del código.',
        donde: ['terminal', 'consola'],
        archivo: 'src/nucleo/tests-intactos.ts',
      },
      {
        id: 'trampas',
        nombre: 'Las trampas se buscan en el cambio',
        queHace:
          'Mira el cambio línea por línea buscando lo que silencia errores en vez de arreglarlos: comprobaciones quitadas, avisos tapados, umbrales aflojados.',
        porQueImporta:
          'Una rama que se puso verde haciendo trampa no le gana a una limpia, por simple que sea.',
        donde: ['terminal', 'consola'],
        archivo: 'src/nucleo/trampas.ts',
      },
      {
        id: 'memoria-como-fase',
        nombre: 'Tus correcciones, como una prueba más',
        queHace:
          'Una corrección tuya con patrón se vuelve una fase del portón: si una línea nueva lo cumple, la rama se corta ahí, gratis, con tu explicación original.',
        porQueImporta:
          'Funciona en cualquier lenguaje, porque mira el cambio y no la estructura del código.',
        donde: ['terminal', 'consola'],
        comando: 'dolphin recordar "los importes van con coma" --patron "toLocaleString\\(\'en"',
        archivo: 'src/nucleo/memoria.ts',
      },
      {
        id: 'specs',
        nombre: 'Los contratos escritos del repo',
        queHace:
          'Lee los documentos de especificación del repo, avisa los que quedaron sin actualizar después de un cambio y los pasa como contexto al agente.',
        porQueImporta:
          'El texto de una especificación es guía del repo, no una orden: va etiquetado como tal y nunca se ejecuta.',
        donde: ['terminal', 'consola'],
        archivo: 'src/nucleo/spec.ts',
      },
      {
        id: 'personas',
        nombre: 'Cinco personas usando la app',
        queHace:
          'Mira la pantalla como la miraría gente concreta: la del pulgar gordo, la que no toca el mouse, la que pega un importe de nueve cifras, la que está con una barra de señal.',
        porQueImporta:
          'Un tester que «cliquea todo» encuentra poco y reporta mucho. Lo que encuentra errores de verdad es alguien con una forma concreta de usarla, y el resultado se lee como lo diría una persona.',
        donde: ['terminal', 'consola'],
        comando: 'dolphin vigilar --personas pulgar,teclado',
        archivo: 'src/tester/personas.ts',
      },
      {
        id: 'auditoria-en-la-pagina',
        nombre: 'Lo que se mide adentro de la pantalla',
        queHace:
          'Mide sin gastar un token: cosas que se desbordan, texto cortado, botones más chicos que el dedo, esperas sin aviso, controles sin nombre y contraste flojo.',
        porQueImporta: 'Cuanto más se puede comprobar gratis, más barato sale el turno entero.',
        donde: ['terminal', 'consola'],
        archivo: 'src/tester/auditoria.ts',
      },
      {
        id: 'escalon-pantalla',
        nombre: 'La app de cada rama, levantada y mirada',
        queHace:
          'Levanta la app de cada rama con el comando de siempre del repo, la mira en las pantallas que la rama declaró, y la apaga.',
        porQueImporta:
          'Solo cortan los problemas NUEVOS: lo que el repo ya tenía antes no es culpa de la rama. Lo que falla queda grabado en video.',
        donde: ['terminal', 'consola'],
        archivo: 'src/tester/escalon-pantalla.ts',
      },
      {
        id: 'vision',
        nombre: 'Dolphin Vision',
        queHace:
          'Usa la app de la rama como alguien que recién llega —en la compu y en el teléfono—, toca lo que hay, manda los formularios vacíos y guarda capturas de todo.',
        donde: ['terminal', 'consola'],
        archivo: 'src/tester/vision.ts',
      },
      {
        id: 'juez-de-pantalla',
        nombre: 'Un juez que no vio el código',
        queHace:
          'Decide si la rama cumple la tarea mirando SOLO las capturas y lo que se encontró tocándola, nunca el código ni lo que cuenta el agente.',
        porQueImporta:
          'Tres reglas no las decide el modelo: un criterio sin evidencia no cuenta como cumplido, con un criterio sin cumplir se corta, y si el juez duda no hay nota —y sin nota la rama no pasa—.',
        donde: ['terminal', 'consola'],
        archivo: 'src/agentes/juez.ts',
      },
      {
        id: 'explorador',
        nombre: 'Recorrer la app como un usuario nuevo',
        queHace:
          'Toca cada cosa de la app de punta a punta y anota lo que no anduvo antes de que lo encuentre un usuario.',
        porQueImporta:
          'No cae en bucle: una pantalla ya revisada no se vuelve a revisar, y lo revisado se guarda entre corridas —se invalida solo cuando su código cambia—.',
        donde: ['terminal', 'consola'],
        comando: 'dolphin explorar --url http://127.0.0.1:3000',
        archivo: 'src/tester/explorador.ts',
      },
      {
        id: 'mirar-una-url',
        nombre: 'Auditar cualquier URL',
        queHace: 'Corre la fase de pantalla contra una dirección cualquiera, sin sembrar nada.',
        porQueImporta: 'Sirve para calibrar las personas y para auditar algo que ya existe.',
        donde: ['terminal'],
        comando: 'dolphin mirar http://localhost:3000',
        archivo: 'src/mirar.ts',
      },
      {
        id: 'vigia',
        nombre: 'El vigía: hasta que todo dé verde',
        queHace:
          'Mientras escribís vos o un agente, cada cambio vuelve a pasar por las fases y por la pantalla, hasta que todo da verde.',
        porQueImporta: 'El error aparece cuando todavía es barato arreglarlo. La app la levantás vos; el vigía solo mira.',
        donde: ['terminal'],
        comando: 'dolphin vigilar --url http://localhost:5173 --hasta-verde',
        archivo: 'src/nucleo/vigia.ts',
      },
      {
        id: 'porton-de-una-rama',
        nombre: 'El portón sin usar Dolphin',
        queHace:
          'Cruza una rama cualquiera por el mismo portón, sobre una copia descartable, y devuelve el resultado fase por fase con el motivo del rebote en voz humana.',
        donde: ['terminal', 'consola'],
        archivo: 'src/nucleo/porton-de-una-rama.ts',
      },
      {
        id: 'porton-a-mano',
        nombre: 'Las fases sobre lo que estás escribiendo ahora',
        queHace:
          'Corre las fases del repo sobre la carpeta donde estás trabajando, de la más barata a la más cara y cortando en la primera que falla.',
        porQueImporta:
          'Sin las fases que construyen: es para mirar mientras se trabaja, no para entregar.',
        donde: ['escritorio', 'consola'],
        archivo: 'src/nucleo/porton-a-mano.ts',
      },
      {
        id: 'bitacora',
        nombre: 'Lo que se corrió de verdad',
        queHace:
          'Anota cada comando que corrió sobre una rama, con su salida y su código de salida.',
        porQueImporta:
          'Un agente puede decir «corrí los tests y pasaron» sin haberlos corrido. Esto lo anota quien ejecuta, no quien narra: alcanza para revisar una rama sin creerle a nadie.',
        donde: ['terminal', 'consola'],
        comando: 'dolphin bitacora',
        archivo: 'src/nucleo/bitacora.ts',
      },
      {
        id: 'informe-verificable',
        nombre: 'Qué quedó SIN comprobar',
        queHace:
          'Dice qué se pidió, con qué se comprobó y —lo que nadie dice— qué quedó sin comprobar: una fase salteada, un repo sin pruebas, un cambio de pantalla que nadie miró andando.',
        porQueImporta: 'Va explícito en el PR, en el chat y en el parte. Una fase salteada deja pasar la rama, pero no es una fase pasada.',
        donde: ['terminal', 'consola'],
        archivo: 'src/nucleo/informe.ts',
      },
      {
        id: 'oraculo',
        nombre: 'Un comando tuyo que dice si está logrado',
        queHace:
          'Le pasás un comando que sale en 0 cuando el objetivo está cumplido, y «lo logré» deja de ser la palabra del agente.',
        porQueImporta:
          'El portón dice si la rama está sana; el oráculo dice si hace lo que pediste. Mientras no pase, el objetivo no está logrado y lo que imprimió es la pista del intento siguiente.',
        donde: ['terminal'],
        comando: '/objetivo que el importador lea los CSV del banco --oraculo npm test -- importador',
        archivo: 'src/nucleo/oraculo.ts',
      },
      {
        id: 'bug-con-prueba-primero',
        nombre: 'Del error que viste al arreglo',
        queHace:
          'Primero escribe una prueba que reproduce el error y la corre: tiene que fallar hoy. Después siembra el arreglo encima, y no está arreglado hasta que esa prueba pase.',
        porQueImporta:
          'Si la prueba pasa de entrada, el error no se reprodujo: se dice y se para, en vez de arreglar a ciegas.',
        donde: ['terminal', 'escritorio'],
        comando: 'dolphin bug --que "el cupón del 10 % no descuenta nada"',
        archivo: 'src/bug.ts',
      },
      {
        id: 'paridad',
        nombre: 'Migrar y poder probar que quedó igual',
        queHace:
          'Graba lo que contesta la app vieja en cada dirección, levanta la nueva, le pregunta lo mismo y sale en 0 solo si contesta igual.',
        porQueImporta:
          'Con eso, «pasá el backend de Express a Fastify» se persigue hasta lograrlo: la grabación es el oráculo. Lo que cambia solo (fechas, ids) se ignora por nombre.',
        donde: ['terminal'],
        comando: 'dolphin paridad grabar --url … · dolphin paridad comprobar --grabacion …',
        archivo: 'src/paridad.ts',
      },
    ],
  },

  {
    id: 'decidir',
    titulo: 'Decidir',
    resumen:
      'Entre las ramas que pasaron, gana la más simple: la que deja menos deuda. Después se ve qué cambió, se entrega con un commit tuyo y se abre el PR con la evidencia adentro.',
    funciones: [
      {
        id: 'elegir-la-mas-simple',
        nombre: 'Gana la más simple',
        queHace:
          'Entre las que pasaron todas las fases elige la que deja menos deuda, no la más rápida ni la más larga.',
        porQueImporta:
          'Una dependencia nueva pesa más que cien líneas, porque la vas a arrastrar para siempre. Y antes que todo eso está la confianza: una rama que se puso verde haciendo trampa no gana.',
        donde: ['terminal', 'consola'],
        archivo: 'src/nucleo/elegir.ts',
      },
      {
        id: 'forma',
        nombre: 'Qué significa «simple», en números',
        queHace:
          'Mide cuánto cambió cada rama: archivos tocados, líneas movidas, archivos nuevos y —sobre todo— dependencias agregadas.',
        donde: ['terminal', 'consola'],
        archivo: 'src/nucleo/forma.ts',
      },
      {
        id: 'cosechas',
        nombre: 'Todo queda en disco',
        queHace:
          'Cada siembra deja su resultado completo en el repo, así que la pantalla, el parte de la mañana y comparar dos turnos leen de ahí.',
        porQueImporta:
          'Es lo que separa a Dolphin de un comando que escupe texto y se olvida. Y las contraseñas del entorno se sacan antes de guardar.',
        donde: ['terminal', 'consola'],
        archivo: 'src/nucleo/archivo.ts',
      },
      {
        id: 'diff',
        nombre: 'Lo que cambió, como lo lee una persona',
        queHace:
          'Cada archivo con lo que sumó y sacó, los números de línea en su canaleta y cada línea agregada o quitada con su fondo.',
        porQueImporta:
          'Se lee en vivo de la copia de la rama y no se guarda en el resultado: un cambio grande por diez ramas convertiría cada archivo de resultado en megabytes que casi nadie mira.',
        donde: ['consola'],
        archivo: 'src/nucleo/diff.ts',
      },
      {
        id: 'preview-de-la-rama',
        nombre: 'Ver la app de la rama, y tocarla',
        queHace:
          'Levanta la app de esa rama en su propia copia del proyecto y la muestra adentro de la consola, en 1440, 768 o 390. Señalás un elemento, lo tocás, y pedís el cambio sobre ESE elemento: el pedido va con su selector, su HTML y sus estilos. También repite lo que la app escribió en la consola del navegador.',
        porQueImporta:
          'Mirar un diff no dice si la pantalla quedó bien. Se puede tocar porque la app se sirve por el origen de la consola: un iframe de otro origen no deja leer ni un nodo de su DOM. Y el proxy no acepta un puerto cualquiera —solo los que Dolphin levantó—, o desde la consola se podría leer cualquier servicio de tu máquina.',
        donde: ['consola'],
        archivo: 'src/nucleo/preview.ts',
      },
      {
        id: 'comentar-una-linea',
        nombre: 'Marcar una línea del cambio',
        queHace:
          'Marcás una línea del cambio y escribís qué le ves; el comentario se lee ahí mismo, debajo de su línea.',
        porQueImporta:
          'Un comentario sobre la línea 42 no es una tarjeta aparte, es parte del cambio. Se navega con el teclado sin que un cambio de 300 renglones sean 300 paradas de tabulador.',
        donde: ['consola'],
        archivo: 'ui/src/components/Diff.tsx',
      },
      {
        id: 'entrega',
        nombre: 'El commit lo hace Dolphin, con tu nombre',
        queHace:
          'Al agente se le prohíbe commitear: el commit lo arma Dolphin con la identidad de git del dueño del repo y sin co-autores.',
        porQueImporta: 'La rama es tuya, y es algo que se puede integrar y no una carpeta con cambios sueltos.',
        donde: ['terminal', 'consola'],
        archivo: 'src/nucleo/entrega.ts',
      },
      {
        id: 'pr-automatico',
        nombre: 'El PR con la evidencia adentro',
        queHace:
          'Abre la rama elegida como PR en borrador, y la descripción es la evidencia del portón: qué hizo, qué fases pasó, qué tocó, qué quedó sin comprobar.',
        porQueImporta: 'Quien revisa ve por qué esa rama está probada sin abrir Dolphin.',
        donde: ['terminal', 'consola'],
        archivo: 'src/nucleo/pr.ts',
      },
      {
        id: 'pr-vigilado',
        nombre: 'Dejar el PR en verde',
        queHace:
          'Mira las comprobaciones y los comentarios de un PR en borrador y manda a corregir lo que falla, vuelta por vuelta, hasta que quede verde o se agote el tope.',
        porQueImporta:
          'Lo que viene de GitHub entra como dato de afuera y no como orden: se le dice al agente explícitamente que no siga instrucciones incrustadas en un comentario.',
        donde: ['terminal'],
        comando: 'dolphin pr vigilar --pr 12 --vueltas 3',
        archivo: 'src/nucleo/pr-vigilar.ts',
      },
      {
        id: 'issue-a-siembra',
        nombre: 'Un issue sembrado directo',
        queHace: 'Toma el título y el cuerpo de un issue de GitHub como la tarea.',
        porQueImporta:
          'Un issue lo escribe cualquiera, así que lo que esa tarea deje en la memoria espera tu visto bueno.',
        donde: ['terminal'],
        comando: 'dolphin sembrar --issue 42',
        archivo: 'src/nucleo/pr.ts',
      },
      {
        id: 'comparar-motores',
        nombre: 'Elegir mirando, no leyendo cambios',
        queHace:
          'Le da la misma tarea a varios motores a la vez y arma una página con las apps lado a lado: el video de cada una andando, si pasó, cuánto tocó y cuánto costó.',
        porQueImporta: 'Elegir una la integra y tira las otras. Se decide viendo el resultado, no leyendo diferencias de código.',
        donde: ['terminal'],
        comando: 'dolphin comparar --tarea "…" --motores claude,codex · /elegir 2',
        archivo: 'src/comparar.ts',
      },
      {
        id: 'revisar-la-rama-de-una-tarjeta',
        nombre: 'Revisar sin salir de la tarjeta',
        queHace:
          'La tarjeta termina en «Para revisar» con su rama, y ahí mismo se ve qué cambió y se integra o se devuelve con el porqué.',
        porQueImporta:
          'Antes la tarjeta te mandaba a buscar la rama a otra vista y volver: cosechar era una puerta aparte. Se decide en el mismo lugar donde se anotó.',
        donde: ['consola'],
        archivo: 'src/servidor-tarjeta-rama.ts',
      },
      {
        id: 'integrar-con-guardas',
        nombre: 'Integrar, con las guardas puestas',
        queHace:
          'Integrar toca el repo de verdad, así que se niega si tenés cambios sin commitear o estás parado en otra rama, y si choca no toca nada.',
        donde: ['terminal', 'consola'],
        comando: '/integrar',
        archivo: 'src/nucleo/entrega.ts',
      },
      {
        id: 'volver-a-un-momento',
        nombre: 'Volver a cuando andaba',
        queHace:
          'Una lista de momentos en los que el proyecto andaba y un botón para volver a uno, sin saber git.',
        porQueImporta:
          'El miedo que frena a cualquiera que programa con agentes es «lo toqué y se rompió todo». Git ya lo resuelve, pero con palabras que no se entienden.',
        donde: ['terminal'],
        archivo: 'src/nucleo/volver.ts',
        enCamino: true,
        queFalta:
          'El módulo y su comando (src/volver-cli.ts) están escritos y probados, pero «volver» no está en la tabla de comandos de src/dolphin.ts ni en los scripts de package.json: hoy `dolphin volver` abre la app en vez de listar los momentos.',
      },
    ],
  },

  {
    id: 'recordar',
    titulo: 'Recordar',
    resumen:
      'Lo que el repo ya te corrigió una vez no se repite. Y lo que este proyecto ya les enseñó a otros modelos —en sus memorias, en sus conversaciones, en el CLAUDE.md— se busca, se destila y viaja a cualquier motor.',
    funciones: [
      {
        id: 'memoria-del-proyecto',
        nombre: 'La memoria del proyecto',
        queHace:
          'Cada corrección que escribís queda guardada y se aplica para siempre: con patrón frena sola en el portón, sin patrón viaja en el pedido de cada agente.',
        donde: ['terminal', 'consola'],
        comando: 'dolphin recordar "los importes van con coma decimal" · /memoria <regla>',
        archivo: 'src/nucleo/memoria.ts',
      },
      {
        id: 'perfil',
        nombre: 'El perfil del proyecto',
        queHace:
          'Las verdades del dominio que ninguna tarea puede olvidar, en un texto plano editable a mano que viaja ENTERO en todos los pedidos, a cualquier modelo.',
        porQueImporta:
          '«Acá hay monotributistas Y responsables inscriptos: todo lo nuevo cubre ambos» — ese tipo de cosa, que un agente sin contexto se olvida y el dueño del repo se cansa de repetir.',
        donde: ['terminal', 'consola'],
        comando: 'dolphin recordar --perfil "…"',
        archivo: 'src/nucleo/perfil.ts',
      },
      {
        id: 'notas-de-corto-plazo',
        nombre: 'La memoria de corto plazo',
        queHace:
          'Lo que se observa en cada siembra entra crudo y con su procedencia, y recién pasa a la memoria de verdad si se repite.',
        porQueImporta:
          'Así Dolphin se acuerda de todo sin ensuciarse: lo que pasó una vez queda anotado, pero no se vuelve regla por pasar una vez.',
        donde: ['terminal', 'consola'],
        archivo: 'src/nucleo/notas.ts',
      },
      {
        id: 'sueno',
        nombre: 'El sueño: qué merece ser regla',
        queHace:
          'Olvida lo que no se volvió a ver en 30 días, pasa a la memoria lo que se repitió en tareas distintas y deja esperando tu visto bueno lo que vino de afuera.',
        porQueImporta: 'Lo que pasó queda contado en `.dolphin/DREAMS.md`: se puede leer por qué se acordó de algo.',
        donde: ['terminal', 'consola'],
        comando: 'dolphin sonar',
        archivo: 'src/nucleo/sueno.ts',
      },
      {
        id: 'buscar-memorias',
        nombre: 'Lo que el proyecto ya les enseñó a otros modelos',
        queHace:
          'Busca lo que este repo ya le explicó a Claude Code, a Codex y a Gemini: su memoria, sus conversaciones enteras y las instrucciones globales de cada uno.',
        porQueImporta:
          'No alcanza con mirar el repo: lo que una persona le explicó a Claude vive en su carpeta, a veces en la de OTRO proyecto si la sesión arrancó desde ahí.',
        donde: ['consola'],
        archivo: 'src/nucleo/buscar-memorias.ts',
      },
      {
        id: 'entrenar',
        nombre: 'Entrenar al delfín',
        queHace:
          'Destila todo eso en las verdades del proyecto, te deja tachar lo que no va, y lo destilado viaja en cada siembra a cualquier modelo.',
        porQueImporta:
          'Buscar es gratis y corre solo; destilar usa tu cupo, así que se pregunta con un botón. Antes arrancaba solo al abrir un proyecto nuevo y gastaba sin que nadie lo pidiera.',
        donde: ['consola'],
        archivo: 'src/nucleo/entrenar.ts',
      },
      {
        id: 'importar-instrucciones',
        nombre: 'El CLAUDE.md del repo, a la memoria',
        queHace:
          'Cada viñeta del CLAUDE.md o del AGENTS.md entra como regla candidata esperando tu ok, con de dónde salió, sin gastar un token.',
        porQueImporta: 'Se importa una vez por versión del archivo, y lo repetido no entra dos veces.',
        donde: ['terminal'],
        archivo: 'src/nucleo/importar-instrucciones.ts',
      },
      {
        id: 'bitacora-compartida',
        nombre: 'Compartir lo aprendido, sin tu proyecto adentro',
        queHace:
          'Exporta las lecciones del repo sin nada que lo identifique —ni rutas, ni correos, ni claves, ni el título de tus tareas—, etiquetadas por los frameworks que usás.',
        porQueImporta:
          'Al importar, cada lección entra como candidata de afuera y no se usa hasta que le das el visto bueno; las de frameworks que no usás se saltean, y un patrón que podría colgar el portón no entra.',
        donde: ['terminal'],
        comando: 'dolphin bitacora exportar · dolphin bitacora importar <archivo o URL>',
        archivo: 'src/bitacora-compartida.ts',
      },
      {
        id: 'buscar-en-charlas',
        nombre: 'Buscar en todo lo que hablaste',
        queHace:
          'Busca en todas las charlas que tuviste con Dolphin en este proyecto, de cualquier sesión.',
        donde: ['terminal'],
        comando: '/buscar <palabras>',
        archivo: 'src/tui/charla-guardada.ts',
      },
      {
        id: 'preguntar-a-una-sesion',
        nombre: 'Preguntarle a una charla vieja',
        queHace:
          'Le pregunta a tu última sesión de Claude Code en ese repo —o a la que digas— algo que ella sí sabía: «¿por qué dejaste el pago único?».',
        porQueImporta:
          'Contesta en una copia y en solo lectura: no toca la charla original. Nació de pegar la misma visión tres veces porque no había cómo preguntarle a la sesión anterior.',
        donde: ['terminal'],
        comando: 'dolphin preguntar "¿por qué dejaste el pago único?"',
        archivo: 'src/preguntar.ts',
      },
      {
        id: 'desempeno',
        nombre: 'Qué modelo rinde en qué, acá',
        queHace:
          'Guarda una fila por rama escrita: qué modelo era, en qué tipo de tarea, si pasó el portón, cuánto costó y cuánto tardó.',
        porQueImporta:
          'No es un benchmark ajeno: es lo que el router consulta para repartir. Con esto, «calidad», «equilibrada» y «economía» dejan de ser una tabla fija.',
        donde: ['terminal', 'consola'],
        archivo: 'src/nucleo/desempeno.ts',
      },
      {
        id: 'mejorarse',
        nombre: 'Que Dolphin mejore cómo pide las cosas',
        queHace:
          'Encuentra dónde falla seguido, le pide a un modelo un ángulo nuevo, lo ensaya contra el de siempre en tareas reservadas y lo deja propuesto esperando tu ok.',
        porQueImporta:
          'Nunca aprende a romper su propio portón: un ángulo que diga saltear pruebas, borrarlas o poner un silenciador se rechaza antes de gastar un peso en probarlo. Y adoptar no es para siempre: se lo sigue midiendo.',
        donde: ['terminal'],
        archivo: 'src/nucleo/mejorarse.ts',
        enCamino: true,
        queFalta:
          'La parte que YA anda es que los ángulos adoptados se usen en cada siembra (enfoquesDelRepo, llamado desde src/siembra.ts). El ciclo que los propone —flaquezas, hipótesis, ensayo, decidir— está escrito y probado pero no lo llama ningún comando ni vista todavía: falta `dolphin mejorar` y verlo en la consola.',
      },
    ],
  },

  {
    id: 'organizar',
    titulo: 'Organizar',
    resumen:
      'El tablero es el centro: el equipo, el portón, la revisión y el turno de noche son cosas que le pasan a una tarjeta, no secciones aparte. Y lo que no llegás a hacer de día se hace mientras dormís.',
    funciones: [
      {
        id: 'tablero',
        nombre: 'El tablero del proyecto',
        queHace:
          'Lo que hay que hacer, en cinco columnas fijas: ideas, para hacer, haciendo, para revisar y hecho.',
        porQueImporta:
          'Un archivo por tarjeta, así dos cambios a tarjetas distintas nunca se pisan, y es lo que después se comparte con un equipo.',
        donde: ['terminal', 'consola'],
        comando: 'dolphin tarea · dolphin tarea nueva "título"',
        archivo: 'src/nucleo/tarjetas.ts',
      },
      {
        id: 'tarjetas-que-esperan',
        nombre: 'Una tarjeta que espera a otra',
        queHace:
          '«Los tests de la exportación» no arrancan hasta que «la exportación» esté en Hecho, y el tablero sabe qué se puede hacer ya.',
        porQueImporta:
          'Así el turno de noche (o el equipo) no toma algo que se va a romper porque le falta lo de abajo. Y borrar una tarjeta no deja a otra trabada para siempre.',
        donde: ['terminal', 'consola'],
        comando: 'dolphin tarea esperar <id> <otra> · dolphin tarea listas',
        archivo: 'src/nucleo/tarjetas-espera.ts',
      },
      {
        id: 'tarjetas-trabadas',
        nombre: 'Una tarjeta cuyo proceso murió no queda trabada',
        queHace:
          'Si se cerró la terminal o se apagó la máquina, la tarjeta que estaba en Haciendo vuelve sola a estar disponible.',
        porQueImporta:
          'Antes quedaba ahí para siempre: el «dale» la rechazaba diciendo «ya la está haciendo el equipo» y no había cómo retomarla más que moviéndola a mano.',
        donde: ['terminal', 'consola'],
        archivo: 'src/nucleo/tarjetas-trabadas.ts',
      },
      {
        id: 'parecidas',
        nombre: 'Esto ya está anotado',
        queHace:
          'Antes de anotar algo te dice qué tarjeta se le parece, comparando texto sin gastar un token.',
        porQueImporta:
          'Importa más desde que las tarjetas entran solas: sin esto, «el botón de guardar no avisa cuando falla» y «arreglar que guardar no avise si falla» son dos tarjetas, y el tablero se vuelve una lista de variantes que nadie limpia.',
        donde: ['terminal', 'consola'],
        archivo: 'src/nucleo/parecidas.ts',
      },
      {
        id: 'documento-a-tarjetas',
        nombre: 'Un PENDIENTES.md se vuelve tarjetas',
        queHace:
          'Cada ítem de la lista de un documento —las notas de una reunión, una especificación con su checklist— entra como tarjeta, sin gastar un token.',
        porQueImporta:
          'Entran los ítems de lista y no los párrafos: un párrafo es contexto, un ítem es algo que alguien quiere que pase.',
        donde: ['terminal'],
        comando: 'dolphin tarea desde PENDIENTES.md',
        archivo: 'src/nucleo/documento-a-tarjetas.ts',
      },
      {
        id: 'todo-del-codigo',
        nombre: 'Los TODO del código, al tablero',
        queHace: 'Junta los TODO que ya están en el código y los pone donde se deciden las cosas.',
        porQueImporta:
          'Un TODO es una tarea que alguien anotó donde la vio y después nadie volvió a leer: queda en una línea que solo mira quien abre ese archivo.',
        donde: ['terminal'],
        comando: 'dolphin tarea todos',
        archivo: 'src/nucleo/ideas-del-codigo.ts',
      },
      {
        id: 'tablero-compartido',
        nombre: 'El tablero, compartido por una rama de git',
        queHace:
          'Escribe las tarjetas en una rama aparte que no tiene el código, para compartirlas con otra máquina o con otra persona.',
        porQueImporta:
          'No toca tu árbol de trabajo ni tu rama, y el tablero sigue ignorado en los commits del proyecto: es tuyo y no ensucia nada.',
        donde: ['terminal'],
        comando: 'dolphin tarea compartir · dolphin tarea traer',
        archivo: 'src/nucleo/tablero-compartido.ts',
      },
      {
        id: 'cola-de-tareas',
        nombre: 'Varias tareas distintas a la vez',
        queHace:
          'Le das N tareas distintas y las trabaja a la vez, cada una en su copia; al terminar, compara cada rama con las ya entregadas.',
        porQueImporta:
          'Si se integran limpio, queda lista; si chocan, la tarea se vuelve a sembrar ENCIMA de la rama con la que chocó, una vez. Lo que te queda son ramas probadas que entran juntas.',
        donde: ['terminal', 'consola'],
        comando: 'dolphin cola --tarea "una" --tarea "otra"',
        archivo: 'src/nucleo/cola.ts',
      },
      {
        id: 'equipo',
        nombre: 'Un equipo para una tarea grande',
        queHace:
          'Un líder parte la tarea, los compañeros la hacen a la vez cada uno en su rama, se juntan en una rama de integración, otro modelo revisa el cambio entero y el portón decide.',
        porQueImporta:
          'No duplica nada: el plan es Thinking, el reparto es la cola, la revisión es la de siempre. Con el agente de mentira corre de punta a punta sin gastar.',
        donde: ['terminal', 'consola'],
        comando: 'dolphin equipo --tarea "algo grande" · /equipo <tarea>',
        archivo: 'src/equipo/equipo.ts',
      },
      {
        id: 'plan',
        nombre: 'Dolphin Thinking: el objetivo partido en tareas',
        queHace:
          'Un modelo lee el repo sin tocar nada y parte un objetivo grande en tareas chicas que se pueden probar solas, cada una con el modelo que le alcanza y un tope de plata.',
        porQueImporta: 'Pensar no gasta en escribir código: lo que gasta es aprobar.',
        donde: ['terminal', 'consola'],
        archivo: 'src/nucleo/plan.ts',
      },
      {
        id: 'editar-plan',
        nombre: 'Corregir el plan antes del «dale»',
        queHace:
          'Se le escribe como a una persona: «sacá 2», «sumá <tarea>», «cambiá 2: <tarea>», y la que esperaba a la que sacaste pasa a esperar lo que ella esperaba.',
        donde: ['terminal', 'consola'],
        archivo: 'src/equipo/editar-plan.ts',
      },
      {
        id: 'estimar',
        nombre: 'Cuánto va a costar, antes de gastar',
        queHace:
          'Estima el plan con lo que costó de verdad cada rama en ESTE repo: la mediana del mismo modelo en el mismo tipo de tarea.',
        porQueImporta:
          'Es lo que más frena a soltar un equipo. Y si no hay datos no se inventa un número: se usa el tope que el líder le puso y se dice que es eso, un tope.',
        donde: ['terminal', 'consola'],
        archivo: 'src/nucleo/estimar.ts',
      },
      {
        id: 'buzon-del-equipo',
        nombre: 'Los compañeros se hablan',
        queHace:
          'Un compañero le manda un mensaje a otro, lee los suyos o espera a que el otro esté libre o haya terminado.',
        donde: ['terminal'],
        comando: 'dolphin buzon enviar @backend "texto" · dolphin buzon esperar @backend --hasta terminado',
        archivo: 'src/equipo/buzon.ts',
      },
      {
        id: 'choques',
        nombre: 'Los choques, avisados mientras trabajan',
        queHace:
          'Cada tanto mira qué archivos tiene tocados cada compañero y avisa si dos que trabajan a la vez tocan el mismo.',
        porQueImporta:
          'Entre el 28 y el 42 % de los pares de ramas de agentes chocan al unirse: enterarse antes es lo que deja corregir el rumbo en vez de tirar trabajo. No frena a nadie: es la alarma temprana.',
        donde: ['terminal', 'escritorio'],
        archivo: 'src/equipo/choques.ts',
      },
      {
        id: 'integrar-con-conflictos',
        nombre: 'Un choque se resuelve en el lugar',
        queHace:
          'Si una rama choca al integrarse, un agente resuelve solo los archivos en conflicto ahí mismo, se comprueba que no quede ninguna marca y después el portón juzga la integración entera.',
        porQueImporta:
          'Antes se abortaba y ese trabajo —que había pasado su portón— se perdía. Resolver no es aprobar: lo resuelto se juzga como todo lo demás.',
        donde: ['terminal', 'consola'],
        archivo: 'src/equipo/integrar.ts',
      },
      {
        id: 'calendario',
        nombre: 'Agendar una tarea para una hora',
        queHace:
          'Anotás «mañana 09:00 → tal tarea» y se lanza sola a esa hora, corriendo sin nadie mirando, con la política encima, y deja el parte.',
        donde: ['terminal', 'consola'],
        comando: '/programar diario 02:00 <tarea>',
        archivo: 'src/nucleo/calendario.ts',
      },
      {
        id: 'noche',
        nombre: 'El turno de noche',
        queHace:
          'Hace tus pendientes mientras dormís, de a una tarea y con el portón, hasta la hora en que te despertás.',
        porQueImporta:
          'Si el motor se queda sin cupo, primero cambia de cuenta solo; si no queda ninguna, espera a que se reinicie la ventana y retoma la MISMA tarea.',
        donde: ['terminal'],
        comando: 'dolphin noche --hasta 07:00 · /noche <tarea>',
        archivo: 'src/noche.ts',
      },
      {
        id: 'autopiloto',
        nombre: 'El autopiloto nocturno',
        queHace:
          'Un turno diario que, en vez de una tarea fija, toma las ideas que marcaste «para esta noche» y las implementa de a una, lo que más vale primero.',
        porQueImporta:
          'De a una y esperando cada siembra, así cada idea deja su resultado antes de la siguiente. Entre ideas que valen lo mismo va la más vieja: lo que esperó más no se queda afuera noche tras noche.',
        donde: ['consola'],
        archivo: 'src/autopiloto.ts',
      },
      {
        id: 'parte-de-la-manana',
        nombre: 'El parte de la mañana',
        queHace:
          'Lo que hizo el turno de noche, una tarjeta por tarea —qué era, si pasó el portón, la rama, los videos— y cómo decidir cada una sin abrir la compu.',
        donde: ['terminal'],
        comando: '/parte · /aprobar 2 · /descartar 2',
        archivo: 'src/manana.ts',
      },
      {
        id: 'bandeja',
        nombre: 'La bandeja: lo que encontró sin que se lo pidieras',
        queHace:
          'Caen las ideas que vio en otros productos y los errores que encontró recorriendo tu app. Cada una se decide con un botón: rechazar —y no vuelve— o implementar, que siembra una rama con el pedido armado entero.',
        porQueImporta:
          'La firma es lo que impide el ruido: el mismo error encontrado en diez pasadas es UN asunto, y una idea rechazada no se vuelve a proponer.',
        donde: ['terminal', 'consola', 'escritorio'],
        archivo: 'src/nucleo/bandeja.ts',
      },
      {
        id: 'scout',
        nombre: 'El scout: qué hacen los otros',
        queHace:
          'Sale a mirar la competencia, los changelogs, los lanzamientos y los foros, y vuelve con ideas concretas para tu proyecto, cada una con dónde la vio.',
        porQueImporta:
          'Una idea sin una fuente que se pueda abrir no entra: el modelo no puede inventar «lo vi en tal lado», tiene que haberlo visitado.',
        donde: ['terminal', 'consola'],
        comando: 'dolphin ideas --tope 5',
        archivo: 'src/ideas/scout.ts',
      },
      {
        id: 'valorar-ideas',
        nombre: 'Cuál idea vale más',
        queHace:
          'Un juez compara las ideas entre sí —no una por una— mirando lo que el proyecto ya sabe de sí, y a cada una le pone cuánto vale de 1 a 5.',
        donde: ['consola'],
        archivo: 'src/nucleo/valorar.ts',
      },
      {
        id: 'issues-a-la-noche',
        nombre: 'Los issues etiquetados, al turno de noche',
        queHace: 'Toma los issues que abriste vos y los deja como pendientes de una noche automática.',
        porQueImporta:
          'Solo los tuyos, no los del dueño del repo: en uno de una organización el dueño es la organización, que nunca abre issues, y la noche no tomaba ninguno.',
        donde: ['terminal'],
        archivo: 'src/nucleo/issues-noche.ts',
      },
      {
        id: 'proyectos',
        nombre: 'Tus proyectos, para pasar de uno a otro',
        queHace:
          'Una lista con logo y nombre para cambiar de repo sin reiniciar nada: cada proyecto trae su memoria, su perfil y sus resultados.',
        porQueImporta: 'La lista es de la persona, no de un repo: vive en tu carpeta de usuario.',
        donde: ['terminal', 'consola'],
        comando: '/abrir <ruta>',
        archivo: 'src/nucleo/proyectos.ts',
      },
      {
        id: 'turno-en-el-vps',
        nombre: 'Un turno que corre en tu VPS y sobrevive al corte',
        queHace:
          'Lanza el turno en otra máquina por SSH, desprendido del proceso: si se corta el wifi o se suspende la compu, allá sigue y desde acá se lo vuelve a mirar.',
        porQueImporta:
          'Antes el turno corría dentro de la conexión: se cortaba la red, el turno se daba por fallado y allá quedaba un proceso a medias.',
        donde: ['terminal'],
        comando: 'dolphin turno adjuntar <id>',
        archivo: 'src/nucleo/turno-remoto.ts',
      },
      {
        id: 'atajos',
        nombre: 'Atajos: lo determinista no gasta cupo',
        queHace:
          'Un comando guardado con nombre —`juego`, `trabajo`— que corre siempre el mismo script, sin pasar por ningún modelo.',
        porQueImporta:
          'Salió de pedirle «cerrame todo menos Fortnite y Discord» cinco veces en cuatro días, casi siempre en una sesión nueva que volvía a descubrir qué cerrar. Un atajo que escribió un bot no corre hasta que una persona lo aprueba.',
        donde: ['terminal'],
        comando: 'dolphin atajo nuevo juego --archivo juego.ps1 · dolphin atajo juego',
        archivo: 'src/atajos.ts',
      },
    ],
  },

  {
    id: 'acompanar',
    titulo: 'Acompañar',
    resumen:
      'Dolphin te avisa donde estés, se le puede hablar por Telegram como a la terminal, y tiene bots siempre prendidos con sus rutinas. En la compu suma una isla, una lupa sobre cualquier app y el dictado.',
    funciones: [
      {
        id: 'bots',
        nombre: 'Bots siempre prendidos',
        queHace:
          'Agentes que viven en tu carpeta de usuario, no en un repo: cada uno con su alma, su motor, su carpeta de trabajo, su permiso y sus rutinas.',
        donde: ['bots', 'terminal', 'consola'],
        comando: 'dolphin bots · dolphin bots nuevo vigía --plantilla vigia',
        archivo: 'src/bots/almacen.ts',
      },
      {
        id: 'bots-plantillas',
        nombre: 'Bots listos para crear',
        queHace:
          'Cuatro plantillas con su alma y sus rutinas puestas: el Vigía (mira tus repos), el Parte (resume el día), el Investigador y el Escritor.',
        porQueImporta: 'Hablan con quien los usa y no con un nombre fijo: Dolphin es de cualquiera.',
        donde: ['bots', 'terminal', 'consola'],
        comando: 'dolphin bots nuevo <nombre> --plantilla vigia|parte|investigador|escritor',
        archivo: 'src/bots/plantillas.ts',
      },
      {
        id: 'bots-rutinas',
        nombre: 'Rutinas por reloj',
        queHace:
          'Cada bot se despierta a una hora o cada tantos minutos, con su zona horaria propia si hace falta.',
        porQueImporta:
          'La zona va en la rutina: así una rutina no depende de dónde esté corriendo Dolphin.',
        donde: ['bots', 'terminal', 'consola'],
        comando: 'dolphin bots rutina <bot> …',
        archivo: 'src/bots/rutinas.ts',
      },
      {
        id: 'bots-chequeo',
        nombre: 'Solo habla si algo cambió',
        queHace:
          'Antes de despertar al modelo corre un chequeo barato —el estado de git, por ejemplo— y si está igual que la última vez, no gasta nada.',
        porQueImporta:
          'Lo visto se guarda en la carpeta del bot y no en el repo: ahí era un archivo suelto que además aparecía en el propio estado de git que vigilaba.',
        donde: ['bots'],
        archivo: 'src/bots/chequeo.ts',
      },
      {
        id: 'bots-permisos',
        nombre: 'Cuatro niveles de permiso',
        queHace:
          'Cada bot corre con «preguntar», «leer», «carpeta» o «libre», y las herramientas de archivos se acotan a su carpeta vengan de donde vengan.',
        porQueImporta:
          'Leer, editar y escribir pelados valen para todo el disco. Y el bot hereda lo operativo del sistema, nunca los secretos del proceso que lo lanzó.',
        donde: ['bots', 'terminal', 'consola'],
        archivo: 'src/bots/pensar-motor.ts',
      },
      {
        id: 'bots-presupuesto',
        nombre: 'Un tope de plata y de corridas por mes',
        queHace:
          'Cada bot tiene su tope en dólares y en corridas por mes, con un aviso antes de llegar; alcanzado, se pausa.',
        porQueImporta:
          'Un pedido que se pausó vuelve a la cola sin contar para el tope: no se repite ni se pierde.',
        donde: ['bots', 'terminal', 'consola'],
        archivo: 'src/bots/presupuesto.ts',
      },
      {
        id: 'bots-habilidades',
        nombre: 'Habilidades propias de cada bot',
        queHace:
          'Instrucciones guardadas en la carpeta del bot, cada una con su nombre y su descripción, que el bot usa cuando corresponde.',
        donde: ['bots', 'terminal'],
        comando: 'dolphin bots nuevo <nombre> --habilidad <archivo.md>',
        archivo: 'src/bots/almacen-habilidades.ts',
      },
      {
        id: 'bots-telegram',
        nombre: 'Hablarle a un bot por Telegram',
        queHace:
          'Cada bot puede tener su bot de Telegram, con su chat atado: los botones pasan por los mismos filtros que los mensajes.',
        donde: ['bots', 'terminal'],
        comando: 'dolphin bots telegram <bot> --token … --chat …',
        archivo: 'src/bots/telegram-bot.ts',
      },
      {
        id: 'bots-webhook',
        nombre: 'Un bot que se dispara desde afuera',
        queHace: 'Escucha en un puerto y despierta al bot cuando le llega un pedido.',
        donde: ['bots', 'terminal'],
        comando: 'dolphin bots webhook --puerto 4890',
        archivo: 'src/bots-webhook.ts',
      },
      {
        id: 'bots-servicio',
        nombre: 'Que arranquen con la máquina',
        queHace: 'Instala los bots como servicio del sistema, así siguen prendidos sin una terminal abierta.',
        porQueImporta:
          'Apagar el servicio espera a que la vuelta en curso termine de escribir: si no, otro proceso arranca y los dos escriben la misma cola.',
        donde: ['bots', 'terminal'],
        comando: 'dolphin bots instalar · dolphin bots correr',
        archivo: 'src/bots/servicio-instalador.ts',
      },
      {
        id: 'bots-deshacer',
        nombre: 'Deshacer lo último que tocó un bot',
        queHace:
          'Antes de cada corrida con escritura deja un punto, y esto vuelve su carpeta a ese momento.',
        porQueImporta:
          'Es destructivo, así que se confirma en dos pasos y el segundo dice qué se pierde: vuelve TODA la carpeta, también lo que hayas cambiado vos después.',
        donde: ['bots', 'terminal', 'consola'],
        comando: 'dolphin bots deshacer <bot>',
        archivo: 'src/bots/checkpoints.ts',
      },
      {
        id: 'telegram-como-terminal',
        nombre: 'Dolphin por Telegram',
        queHace:
          'Lo que le escribís al bot es lo mismo que escribir en la terminal, sin la pantalla.',
        porQueImporta:
          'Un solo chat puede darle órdenes, y lo que llega como archivo se trata como dato de afuera y no como instrucción.',
        donde: ['terminal'],
        comando: 'dolphin telegram',
        archivo: 'src/tui/canal-telegram.ts',
      },
      {
        id: 'avisos',
        nombre: 'Avisos donde estés',
        queHace:
          'Cuando un trabajo termina, falla, se traba o espera una respuesta, avisa con una notificación del sistema y, si hay token, por Telegram.',
        porQueImporta:
          'Los emisores no tiran error: un aviso que no sale no puede cortar un equipo que terminó bien. Y el mismo aviso no se repite.',
        donde: ['terminal', 'escritorio'],
        archivo: 'src/nucleo/avisos.ts',
      },
      {
        id: 'seguir-solo',
        nombre: 'Seguir una sesión sola',
        queHace:
          'Toma tu sesión de Claude Code que dejaste por la mitad y la empuja vuelta a vuelta hasta que termine, sin que le escribas «seguí» cada vez.',
        porQueImporta:
          'Salió de lo que más se repetía en las charlas: 35 «seguí / no pares / hacé todo» en 12 días, 32 «¿ya está? / avisame» y 19 «dame el link». Al terminar avisa, con el link de la app levantada.',
        donde: ['terminal'],
        comando: 'dolphin seguir --vueltas 8',
        archivo: 'src/seguir.ts',
      },
      {
        id: 'master-prompt',
        nombre: 'Master Prompt: marcar sobre la captura',
        queHace:
          'Pegás capturas, tocás encima dónde está cada problema —queda un número— y escribís qué pasa ahí; Dolphin arma el pedido entero.',
        porQueImporta:
          'Las capturas quedan en el repo y el pedido las nombra por su ruta, con los números dibujados encima: el agente ve el ① donde vos lo pusiste. Armarlo no gasta nada; mejorarlo se lo pide a un modelo.',
        donde: ['consola'],
        archivo: 'src/nucleo/master-prompt.ts',
      },
      {
        id: 'xray',
        nombre: 'X-ray: señalar un control de cualquier app',
        queHace:
          'Con un atajo se prende una capa sobre todas las pantallas, el mouse va señalando el control de cualquier aplicación que tiene abajo, lo elegís y escribís qué hacer con él.',
        porQueImporta:
          'Al agente le llega todo lo que hace falta para encontrarlo: la app, la ventana, el tipo, el nombre, el camino, la posición y un recorte. La capa no sale en los recortes ni recibe el mouse mientras señala.',
        donde: ['escritorio'],
        comando: 'Ctrl+Alt+X',
        archivo: 'escritorio/src/main/dolphin/dolphin-xray.ts',
      },
      {
        id: 'isla',
        nombre: 'La isla: lo que importa ahora, siempre a la vista',
        queHace:
          'Una pastilla arriba de la pantalla con cuántos agentes trabajan y cuántos te esperan; cuando uno termina o te necesita se estira en un aviso y vuelve sola.',
        porQueImporta:
          'Al tocarla se abre en secciones que cada uno arma a gusto —los agentes, a los que se les puede contestar desde ahí, la bandeja y una nota—.',
        donde: ['escritorio'],
        archivo: 'escritorio/src/renderer/src/components/dolphin/isla/DolphinIsla.tsx',
      },
      {
        id: 'bucles',
        nombre: 'Avisar cuando el agente da vueltas',
        queHace:
          'Mira lo que el agente va haciendo y avisa cuando repite la misma herramienta con los mismos datos o insiste con un comando de pruebas que sigue fallando.',
        donde: ['escritorio'],
        archivo: 'escritorio/src/main/dolphin/dolphin-bucles.ts',
      },
      {
        id: 'sugerencia-de-respuesta',
        nombre: 'Lo que vas a contestar, antes de escribirlo',
        queHace:
          'Una sugerencia tinta-2 en el campo de texto que se acepta con Tab, solo cuando el agente está esperando algo tuyo.',
        porQueImporta:
          'Sale de reglas sobre lo último que dijo el agente y no de un modelo: tiene que estar ahí en el momento en que terminás de leer, y una que cuesta plata y tarda dos segundos no sirve para eso. Un campo con texto nunca la muestra.',
        donde: ['escritorio'],
        archivo:
          'escritorio/src/renderer/src/components/dolphin/chat/sugerencia-de-respuesta.ts',
      },
      {
        id: 'voz',
        nombre: 'Dictar en castellano, sin internet',
        queHace:
          'El micrófono baja un modelo de voz que corre en tu compu y entiende castellano; después se dicta sin conexión.',
        porQueImporta:
          'De respaldo solo elige uno local: uno de la nube estaría «listo» con la clave guardada y mandaría el audio afuera sin que nadie lo haya pedido.',
        donde: ['escritorio'],
        archivo: 'escritorio/src/renderer/src/components/dolphin/voz/preparar-voz.ts',
      },
      {
        id: 'mcp',
        nombre: 'Que otro asistente use la memoria y el portón',
        queHace:
          'Expone la memoria del proyecto, el perfil y el portón como herramientas para Claude, Cursor o cualquier asistente que hable MCP.',
        porQueImporta:
          'Puede buscar recuerdos, leer el perfil, ver contra qué se va a medir ANTES de escribir y cruzar una rama por el portón. Lo que propone a la memoria entra como candidata: nunca se activa solo.',
        donde: ['terminal'],
        comando: 'dolphin mcp instalar',
        archivo: 'src/mcp.ts',
      },
      {
        id: 'skills-de-dolphin',
        nombre: 'Las instrucciones para manejar Dolphin',
        queHace:
          'La app instala sola las instrucciones sin las cuales un agente no puede manejar Dolphin por comando.',
        donde: ['escritorio'],
        archivo: 'escritorio/src/main/skills/bundled-skill-install/bundled-skill-installation.ts',
      },
    ],
  },

  {
    id: 'mirar',
    titulo: 'Mirar',
    resumen:
      'Una consola con los números reales del repo: qué se sembró, dónde se cortan los intentos, qué modelo escribe, qué cambió cada rama y qué se corrió de verdad. Y la misma siembra en vivo en la terminal.',
    funciones: [
      {
        id: 'consola',
        nombre: 'La consola',
        queHace:
          'Una pantalla web sobre los resultados de un repo: las ramas, el portón, el cambio, la memoria, el tablero, los bots y git.',
        porQueImporta:
          'La trae adentro la app de escritorio, una por repo, con lo que haya lanzado; al salir se cierran todas.',
        donde: ['consola', 'escritorio'],
        comando: 'dolphin ui --abrir',
        archivo: 'src/servidor.ts',
      },
      {
        id: 'tunel-al-telefono',
        nombre: 'El tablero desde el teléfono',
        queHace:
          'Abre la misma consola en una dirección pública de Cloudflare —sin cuenta— e imprime el link con el pase adentro, para mirar el tablero desde el sillón.',
        porQueImporta:
          'Esa dirección la puede abrir cualquiera, así que la página NO sale con el pase: cada pedido tiene que traerlo, también los GET. Al entrar, el pase se cambia por una cookie y se saca de la dirección, y lo que escribe sigue pidiendo la cabecera —la cookie sola no alcanza, o cualquier sitio podría sembrar desde tu navegador—. El host permitido es uno solo: el del túnel abierto.',
        donde: ['consola'],
        comando: 'dolphin ui --tunel',
        archivo: 'src/nucleo/puerta.ts',
      },
      {
        id: 'mission-control',
        nombre: 'Mission Control',
        queHace:
          'Widgets arrastrables con los números reales del repo —siembras, costos, dónde se cortan los intentos, qué modelo escribe— y la siembra en curso primero.',
        porQueImporta: 'Un centro de control de ingeniería, no un chat agrandado. Cada widget es una lectura real del historial: nada de números de utilería.',
        donde: ['consola'],
        archivo: 'ui/src/components/MissionControl.tsx',
      },
      {
        id: 'en-vivo',
        nombre: 'La siembra, en vivo',
        queHace:
          'La lista de ramas llenándose en tiempo real: cada una escribe, pasa fase por fase, y la que se corta se apaga ahí mismo.',
        porQueImporta:
          'Va por un archivo y no por una conexión: la siembra y la pantalla son procesos distintos que pueden arrancar en cualquier orden, y un archivo sobrevive a los dos.',
        donde: ['consola'],
        archivo: 'src/nucleo/en-vivo.ts',
      },
      {
        id: 'tablero-de-la-terminal',
        nombre: 'La siembra en vivo, en la terminal',
        queHace:
          'Las ramas, el portón fase por fase, la línea de tiempo y la cola del registro, dibujados en cajas que se ven igual en cualquier terminal.',
        porQueImporta:
          'Lee el mismo canal en vivo, así que desde otra terminal podés mirar una siembra que lanzó la cola, el autopiloto o la app. Al terminar, la terminal vuelve como estaba.',
        donde: ['terminal'],
        comando: 'dolphin tablero --demo',
        archivo: 'src/tablero/en-vivo.ts',
      },
      {
        id: 'actividad',
        nombre: 'La actividad del proyecto',
        queHace:
          'Lo que hizo Dolphin y lo que hiciste vos, día por día: qué sembró, qué encontró, qué aprendió.',
        porQueImporta:
          'No se guarda aparte: se arma cada vez de lo que ya está en el repo, así que no puede contradecir a ninguna fuente ni quedarse vieja. Si algo no tiene hora, no se inventa una.',
        donde: ['consola'],
        archivo: 'src/nucleo/actividad.ts',
      },
      {
        id: 'git',
        nombre: 'Las ramas, los commits y los issues',
        queHace:
          'Una tabla con filtro, columnas a elegir y las caras de quién trabajó en cada cosa; se puede entrar a una rama y a un commit entero, con su mensaje, sus archivos y el cambio.',
        porQueImporta: 'Todo sale de git y de `gh`, leído en el momento: no se guarda nada aparte que pueda quedar viejo.',
        donde: ['terminal', 'consola'],
        comando: 'dolphin git ramas|commits|issues',
        archivo: 'src/nucleo/vista-git.ts',
      },
      {
        id: 'lo-que-corrio',
        nombre: 'Lo que se corrió sobre la rama',
        queHace:
          'Cada comando con su salida y su código de salida. Verde solo para lo que terminó bien, rojo para lo que falló y ámbar para lo que no llegó a terminar.',
        donde: ['consola'],
        archivo: 'ui/src/components/LoQueCorrio.tsx',
      },
      {
        id: 'porton-dibujado',
        nombre: 'El portón, dibujado',
        queHace:
          'Cada fase es un segmento con su nombre y lo que tardó, separadas por lo que cuestan; abajo, solo lo que hay que leer: por qué cortó o por qué no corrió.',
        donde: ['consola'],
        archivo: 'ui/src/components/Porton.tsx',
      },
      {
        id: 'visor',
        nombre: 'Ver el código en grande',
        queHace:
          'El cambio y el código en una ventana que se cierra arrastrándola: sigue al puntero, se achica como miniatura desde donde la agarraste y vuelve con rebote si no la soltás lejos.',
        donde: ['consola'],
        archivo: 'ui/src/components/Visor.tsx',
      },
      {
        id: 'parte-de-la-siembra',
        nombre: 'El parte de una siembra, en una página',
        queHace:
          'Las cifras arriba —cuántas ramas, cuántas pasaron, cuánto tardó, quién ganó— en una página que se abre sola al terminar.',
        donde: ['terminal'],
        archivo: 'src/nucleo/parte.ts',
      },
      {
        id: 'rendimiento',
        nombre: 'Lo que el router consulta, a la vista',
        queHace:
          'Cuánto pasa y cuánto cuesta cada modelo en cada tipo de tarea, y qué decidiría con esas cifras la próxima siembra.',
        porQueImporta: 'Es lo mismo que el router consulta, puesto a la vista: si el router cambia de opinión, acá se ve por qué.',
        donde: ['consola'],
        archivo: 'src/nucleo/rendimiento.ts',
      },
      {
        id: 'voces',
        nombre: 'La terminal de cada agente',
        queHace:
          'Lo que cada agente va diciendo mientras trabaja: qué archivo leyó, qué comando corrió, el cambio que editó, su lista de tareas y lo que piensa.',
        porQueImporta: 'No guarda nada: si nadie escucha, se pierde, como una terminal cerrada.',
        donde: ['terminal', 'escritorio'],
        archivo: 'src/nucleo/voces.ts',
      },
    ],
  },

  {
    id: 'cuidar',
    titulo: 'Cuidar',
    resumen:
      'Lo que corre solo escribe en una copia descartable y con una política encima: puede dejar una rama lista, no puede deployar ni empujar nada. Y cuando algo se corta a mitad de camino, hay quien lo levante.',
    funciones: [
      {
        id: 'politica',
        nombre: 'La política de lo que corre solo',
        queHace:
          'Un turno de noche o un «implementar» de la bandeja trabajan sin pedir permiso, pero no pueden deployar, tocar migraciones ni empujar nada a ningún lado.',
        porQueImporta:
          'Se aplica dos veces —antes y después— porque cada una tapa el agujero de la otra: puede escribir en su rama y dejarla lista para un PR, y nada más.',
        donde: ['terminal', 'consola'],
        archivo: 'src/nucleo/politica.ts',
      },
      {
        id: 'aislado',
        nombre: 'El modo aislado',
        queHace:
          'El agente corre en una caja donde lo único que ve es su copia del repo: sin tu carpeta de usuario, sin tus variables de entorno salvo la credencial de su motor, y sin red salvo que la pidas.',
        porQueImporta:
          'Si pediste modo aislado y en la máquina no hay ninguna caja, el agente NO corre sin caja: se dice qué instalar. Un modo que se apaga solo cuando falta algo no protege nada.',
        donde: ['terminal', 'consola'],
        archivo: 'src/nucleo/aislado.ts',
      },
      {
        id: 'red-filtrada',
        nombre: 'Una sola puerta de salida',
        queHace:
          'Con red, el agente solo alcanza un relevo que lo lleva a un portero que corre en tu máquina y deja pasar únicamente los servidores de su motor.',
        porQueImporta:
          'El túnel va cifrado de punta a punta: Dolphin no ve ni toca lo que viaja. Todo lo demás vuelve rechazado y queda anotado, así se ve qué intentó y no pudo.',
        donde: ['terminal', 'consola'],
        archivo: 'src/nucleo/proxy-salida.ts',
      },
      {
        id: 'config-ejecutable',
        nombre: 'La configuración que se ejecuta sola',
        queHace:
          'Un repo clonado o una tarea de afuera traen su propia configuración de hooks y servidores, que el agente carga sin preguntar: acá se neutraliza antes de que corra.',
        donde: ['terminal', 'consola'],
        archivo: 'src/nucleo/config-ejecutable.ts',
      },
      {
        id: 'firma',
        nombre: 'Nada corre solo sin tu firma',
        queHace:
          'La agenda y la cola viven en el repo, y un repo puede traerlas versionadas: las que no firmó esta máquina no se corren.',
        porQueImporta:
          'Sin esto, clonar un repo ajeno con un turno vencido en su calendario era correr SU tarea a los 30 segundos, sin que nadie tocara nada.',
        donde: ['terminal', 'consola'],
        archivo: 'src/nucleo/firma.ts',
      },
      {
        id: 'agentes-solo-lectura',
        nombre: 'Los que solo leen, solo leen',
        queHace:
          'El revisor, el juez, el planificador y el scout corren con la lista de herramientas limitada y sin heredar el modo de permisos que tengas puesto.',
        porQueImporta:
          'Prohibir de a una dejaba disponibles otras consolas, las búsquedas web y los subagentes; y sin fijar el modo, un «aceptar ediciones» en tu configuración los dejaba editar.',
        donde: ['terminal', 'consola'],
        archivo: 'src/agentes/leer-con-claude.ts',
      },
      {
        id: 'cuentas',
        nombre: 'Varias cuentas de Claude, y el cambio solo',
        queHace:
          'Lista las cuentas con las que puede trabajar y cuál usa; cuando una llega a su límite se marca agotada y la próxima corrida va con otra que tenga cupo.',
        porQueImporta: 'Acá solo se lee el correo de cada una: el login no se toca.',
        donde: ['terminal', 'escritorio'],
        comando: '/cuenta 2',
        archivo: 'src/nucleo/cuentas.ts',
      },
      {
        id: 'cupo',
        nombre: 'Cuánto cupo te queda',
        queHace:
          'Lee cuánto queda de cada ventana de uso de Claude, Codex y Gemini, para no quemar la noche a mitad de camino.',
        donde: ['terminal', 'consola', 'escritorio'],
        archivo: 'src/nucleo/cupo.ts',
      },
      {
        id: 'guardian',
        nombre: 'Guardian: la rama principal vigilada, a cero tokens',
        queHace:
          'Cada commit nuevo pasa por las fases gratis en una copia propia; lo que estaba en verde y ahora falla es una regresión, y `git bisect` encuentra el commit que la rompió.',
        porQueImporta:
          'Vuelve a correr antes de alarmar, para no culpar a una prueba inestable. No arregla nada solo: deja una tarjeta con el culpable, la evidencia y cómo reproducirlo, y la cierra sola cuando la fase vuelve a pasar.',
        donde: ['terminal', 'consola'],
        comando: 'dolphin guardian --cada 60',
        archivo: 'src/nucleo/guardian.ts',
      },
      {
        id: 'doctor',
        nombre: 'Doctor: lo que quedó roto, arreglado',
        queHace:
          'Encuentra y arregla lo que queda cuando algo se corta a mitad de camino: copias abandonadas, ramas ya integradas, enlaces rotos, asuntos colgados y agentes que siguen corriendo para nadie.',
        porQueImporta:
          'Nada de esto toca lo tuyo: solo lo que Dolphin creó y quedó abandonado. Cada revisión se protege sola: si una falla, las demás corren igual.',
        donde: ['terminal'],
        comando: 'dolphin doctor --solo-mirar',
        archivo: 'src/doctor.ts',
      },
      {
        id: 'podar',
        nombre: 'Lo que se acumula y nadie mira',
        queHace:
          'Borra los videos de lo que falló y las capturas de cada veredicto más viejos que unos días, dejando lo más nuevo.',
        porQueImporta: 'No se podaban nunca, y en un repo con muchas siembras eran gigas.',
        donde: ['terminal', 'consola'],
        archivo: 'src/nucleo/podar.ts',
      },
      {
        id: 'git-igual-para-todos',
        nombre: 'Un solo git para todo Dolphin',
        queHace:
          'Rutas con tildes y ñ tal cual, sin preguntar contraseñas en la madrugada, y sin tocar el índice del repo mientras la persona trabaja.',
        porQueImporta:
          'Antes había un git por archivo y cada uno tenía una parte de esto: un estado que refrescaba el índice le hacía fallar su propio commit a quien estaba programando.',
        donde: ['terminal', 'consola'],
        archivo: 'src/nucleo/git.ts',
      },
      {
        id: 'escritura-segura',
        nombre: 'Nadie lee un archivo a medio escribir',
        queHace:
          'Los archivos de estado se escriben completos y en fila, así dos cambios simultáneos no se pisan.',
        porQueImporta:
          'Con una escritura a secas, una lectura en el medio veía el archivo vacío: un turno «desaparecía» de la agenda, y agendar justo en ese momento borraba los demás.',
        donde: ['terminal', 'consola'],
        archivo: 'src/nucleo/escritura.ts',
      },
    ],
  },
]

/** Todas las funciones, sin los grupos. */
export const TODAS_LAS_FUNCIONES: readonly Funcion[] = FUNCIONES.flatMap((grupo) => grupo.funciones)

/** Cuántas hay en total: el número que se muestra en el sitio sale de acá, no de una constante a mano. */
export const CUANTAS_FUNCIONES: number = TODAS_LAS_FUNCIONES.length

/** Las que se usan en esa superficie. */
export function funcionesDe(donde: Superficie): readonly Funcion[] {
  return TODAS_LAS_FUNCIONES.filter((funcion) => funcion.donde.includes(donde))
}

/** Las que están escritas pero todavía no tienen por dónde usarse. */
export const EN_CAMINO: readonly Funcion[] = TODAS_LAS_FUNCIONES.filter((funcion) => funcion.enCamino === true)

export function buscarFuncion(id: string): Funcion | undefined {
  return TODAS_LAS_FUNCIONES.find((funcion) => funcion.id === id)
}

export function buscarGrupo(id: string): GrupoDeFunciones | undefined {
  return FUNCIONES.find((grupo) => grupo.id === id)
}
