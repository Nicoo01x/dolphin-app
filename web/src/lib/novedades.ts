// Generado por scripts/novedades.mjs desde git log (c5cd0204dd). No se edita a mano: se vuelve a correr.

export interface DiaDeNovedades {
  readonly fecha: string;
  readonly cambios: readonly { readonly texto: string; readonly hash: string }[];
  /** Los arreglos de ese día: se cuentan, no se listan. */
  readonly arreglos: number;
}

export const NOVEDADES: readonly DiaDeNovedades[] = [
  {
    "fecha": "2026-11-18",
    "cambios": [
      {
        "texto": "Si la app se cierra de golpe, ofrece mandar un reporte; «Enviar comentarios» vuelve al menú de Ayuda",
        "hash": "3325d1c634"
      }
    ],
    "arreglos": 2
  },
  {
    "fecha": "2026-11-17",
    "cambios": [
      {
        "texto": "La página «Delfines», con tus bots y «Correr en tu servidor»",
        "hash": "e68c1061d0"
      },
      {
        "texto": "La app le habla a tus bots, en tu compu y en tu servidor",
        "hash": "51b734a4e2"
      },
      {
        "texto": "Salida --json y mudanza de un bot a otra máquina",
        "hash": "0d40c50bbd"
      },
      {
        "texto": "El cartel «Te queda poca RAM», que manda lo pesado a tu servidor",
        "hash": "c10715c3b3"
      },
      {
        "texto": "El vigía de poca RAM, que avisa a tiempo y acorta la espera de los chats quietos",
        "hash": "8e1514aa59"
      },
      {
        "texto": "Todas las páginas sobre el vidrio, no sólo la de tareas",
        "hash": "5414a098cc"
      },
      {
        "texto": "«Lo que hizo» un poco traslúcida sobre el vidrio",
        "hash": "62c14cb94f"
      },
      {
        "texto": "La página de GitHub y el archivo al costado, sobre el vidrio",
        "hash": "a38d48bcd0"
      },
      {
        "texto": "Ctrl+K contesta preguntas en markdown y muestra el cambio como diff",
        "hash": "9c18aa9715"
      },
      {
        "texto": "«Arreglarlo con un agente» y probar el host antes de guardarlo",
        "hash": "6701cb1639"
      }
    ],
    "arreglos": 7
  },
  {
    "fecha": "2026-11-16",
    "cambios": [
      {
        "texto": "El vidrio va de borde a borde, sin la ventana flotante",
        "hash": "90d5ab8ef1"
      }
    ],
    "arreglos": 0
  },
  {
    "fecha": "2026-11-15",
    "cambios": [
      {
        "texto": "La ventana flota sobre la pintura",
        "hash": "27342d874e"
      },
      {
        "texto": "La pintura detrás de toda la ventana, con paneles de vidrio",
        "hash": "cef2229628"
      },
      {
        "texto": "Cada espacio de trabajo muestra dónde corre, en tu computadora o en un servidor",
        "hash": "b9ff4750e6"
      },
      {
        "texto": "Las terminales también saben dónde está el CLI de esta app",
        "hash": "7bf8ab9455"
      },
      {
        "texto": "Chatgpt, gpt y openai son Codex en --agent",
        "hash": "e83e193021"
      },
      {
        "texto": "La tarjeta «Lo que hizo», el turno de un agente de un vistazo",
        "hash": "d1067ad5c7"
      },
      {
        "texto": "El chat con paisaje, la ventana translúcida sobre un óleo",
        "hash": "cb24f66b3c"
      }
    ],
    "arreglos": 22
  },
  {
    "fecha": "2026-11-14",
    "cambios": [
      {
        "texto": "Codex se ve con su propio logo y no con el de OpenAI",
        "hash": "b4621b59c7"
      },
      {
        "texto": "En macOS sin firma el aviso de actualización lleva a bajar la versión nueva",
        "hash": "157a2c2119"
      }
    ],
    "arreglos": 6
  },
  {
    "fecha": "2026-11-12",
    "cambios": [
      {
        "texto": "Ajustes en castellano, el inicio no salta al cargar y los e2e sin la carpeta «~»",
        "hash": "563cac74cd"
      },
      {
        "texto": "La ola se queda con el espacio libre del inicio y un perfil nuevo no siembra «~»",
        "hash": "f3629c9b00"
      },
      {
        "texto": "El inicio sin cajas, la ola sin delfín y el arrastre que avisa y reintenta",
        "hash": "1879aa0721"
      }
    ],
    "arreglos": 2
  },
  {
    "fecha": "2026-11-11",
    "cambios": [
      {
        "texto": "El mundo del inicio es La gran ola de Hokusai, y se reconoce",
        "hash": "74a1a7d5ff"
      },
      {
        "texto": "El inicio tiene un mundo, cifras grandes y el portón a la vista",
        "hash": "886702f039"
      },
      {
        "texto": "Los mensajes en cola del chat se pueden enviar ahora o borrar",
        "hash": "979084dbc7"
      },
      {
        "texto": "El inicio muestra datos reales en vez de un saludo",
        "hash": "e723a21d9f"
      },
      {
        "texto": "El menú + elige modelo, esfuerzo y primer prompt al lanzar un agente",
        "hash": "8eaab5bb8e"
      },
      {
        "texto": "El menú + abre cada agente en un clic",
        "hash": "ad77fbd39a"
      }
    ],
    "arreglos": 4
  },
  {
    "fecha": "2026-11-10",
    "cambios": [
      {
        "texto": "Tocar una tarjeta del tablero la carga en el prompt, y la app ya no reabre en negro",
        "hash": "81c82170bc"
      },
      {
        "texto": "El escritorio muestra el tablero del proyecto en el inicio, y ya no abre en negro",
        "hash": "5bf44de8bd"
      },
      {
        "texto": "El portón usa la app, hace cola para verificar y los universos nacen con sus dependencias",
        "hash": "7575bc50ef"
      },
      {
        "texto": "El menú + lista cada agente una vez, y muestra los que faltan instalar",
        "hash": "d3f70fbeaf"
      },
      {
        "texto": "El interruptor de Orquestación vive en el compositor, junto a «Delegar»",
        "hash": "575cce66f2"
      },
      {
        "texto": "Cada check dice cuánto tardó y hace cuánto terminó",
        "hash": "5144f652c3"
      },
      {
        "texto": "La hora de un mensaje dice de qué día es al pasarle el puntero",
        "hash": "dc27a2899c"
      },
      {
        "texto": "El tema de íconos se elige en Apariencia, con la muestra al lado",
        "hash": "0cfaee1713"
      },
      {
        "texto": "Un plugin puede cambiar los íconos de archivo, y viaja uno que lo hace",
        "hash": "cfd42e3ee3"
      },
      {
        "texto": "Un link a un PR o a un issue muestra de qué se trata",
        "hash": "07a007e1af"
      },
      {
        "texto": "Elegir el modelo al lanzar un agente desde el menú +",
        "hash": "cadfd828f4"
      },
      {
        "texto": "Poner el tema de un plugin desde su ficha, con su paleta a la vista",
        "hash": "45288cd101"
      },
      {
        "texto": "Previsualizar en el chat lo que una página dice de sí misma",
        "hash": "d667c0106a"
      },
      {
        "texto": "Usar el tema de terminal que trae un plugin",
        "hash": "4514a82cb6"
      },
      {
        "texto": "Probar desde Ajustes el archivo que agrega un plugin",
        "hash": "f6d89a612d"
      },
      {
        "texto": "La ficha de un plugin dice qué tipos de archivo agrega",
        "hash": "e219dd2727"
      },
      {
        "texto": "El menú + crea los tipos de archivo que traen los plugins",
        "hash": "66efd83732"
      },
      {
        "texto": "Empezar una rama en un commit del historial",
        "hash": "ae26c68913"
      },
      {
        "texto": "Traer un commit de otra rama, y deshacer uno, desde el historial",
        "hash": "3ae64b6af0"
      },
      {
        "texto": "Un plugin puede sumar sus tipos de archivo al menú + de la barra",
        "hash": "93fe12835c"
      },
      {
        "texto": "La ficha de un plugin dice qué agrega",
        "hash": "107b573ff9"
      }
    ],
    "arreglos": 16
  },
  {
    "fecha": "2026-11-09",
    "cambios": [
      {
        "texto": "El fondo de un tema se ve, bajando «Background Opacity»",
        "hash": "bd5234a1b3"
      },
      {
        "texto": "La barra del CLI dice qué está pasando, no sólo qué teclas hay",
        "hash": "6d12bf104f"
      },
      {
        "texto": "La pantalla de inicio del CLI dice qué se puede pedir, y tiene jerarquía",
        "hash": "1a072f4dcc"
      },
      {
        "texto": "El fondo de un tema de plugin",
        "hash": "2f2b494bb0"
      },
      {
        "texto": "Un plugin puede traer temas de la app y de la terminal",
        "hash": "03059e4c7e"
      },
      {
        "texto": "El teclado de Vim y el de Emacs, a elección",
        "hash": "83b0402e23"
      },
      {
        "texto": "Las marcas del chat salen en verde y la tarjeta sobre paisaje vuelve a su lugar",
        "hash": "3da0f7446c"
      },
      {
        "texto": "Intelligent Orchestration se prende y se apaga desde el chat",
        "hash": "5dd1138b7c"
      },
      {
        "texto": "/imagen pega lo que tengas copiado y se lo pasa al agente",
        "hash": "b93ab995d4"
      },
      {
        "texto": "Avisar cuando el agente se queda sin contexto y resume",
        "hash": "8ba65b5479"
      },
      {
        "texto": "El borde de git, con sus pedazos y revertir uno",
        "hash": "a8db33647a"
      },
      {
        "texto": "Los tildes de la captura y lo que escribís mientras trabaja",
        "hash": "a9dba48354"
      },
      {
        "texto": "Formatear al guardar, reemplazar en todo el proyecto y tus máquinas desde el CLI",
        "hash": "b264b9231f"
      },
      {
        "texto": "El editor entiende tu código: errores, definiciones y autocompletado por LSP",
        "hash": "831e4eccfa"
      },
      {
        "texto": "El CLI deja elegir tres cosas y nada más",
        "hash": "973bf000aa"
      },
      {
        "texto": "La pantalla de inicio muestra tu actividad, y las filas de herramienta dicen si salieron",
        "hash": "e3b81fa42b"
      },
      {
        "texto": "El editor acepta un tema de VS Code, pegando su archivo",
        "hash": "410af638a5"
      },
      {
        "texto": "Un chat o una terminal se sacan a la ventana flotante arrastrándolos",
        "hash": "5ee0a19cde"
      },
      {
        "texto": "El chat dice cuando se está compactando, en vez de quedarse duro",
        "hash": "92ff0851ce"
      }
    ],
    "arreglos": 4
  },
  {
    "fecha": "2026-11-08",
    "cambios": [
      {
        "texto": "Instaladores para macOS y Linux",
        "hash": "2442c80209"
      },
      {
        "texto": "Un editor se puede sacar del layout a la ventana flotante",
        "hash": "d724538737"
      },
      {
        "texto": "Cursor y Copilot se leen como conversación, no como terminal cruda",
        "hash": "a9099f6edf"
      },
      {
        "texto": "El interruptor de la delegación automática, en la barra del chat",
        "hash": "2294a5574f"
      }
    ],
    "arreglos": 3
  },
  {
    "fecha": "2026-11-07",
    "cambios": [
      {
        "texto": "El color de una sección pinta todo su botón, no sólo el ícono",
        "hash": "c7852fa287"
      },
      {
        "texto": "El chat marca el tamaño de un commit y los colores de una paleta",
        "hash": "d759bb6a85"
      }
    ],
    "arreglos": 4
  },
  {
    "fecha": "2026-11-05",
    "cambios": [
      {
        "texto": "La sangría la decide el proyecto, no el editor",
        "hash": "34d9732f4d"
      },
      {
        "texto": "El túnel puede tener nombre propio y dirección fija",
        "hash": "a14e085ddb"
      },
      {
        "texto": "El editor tiene tema propio, y es tuyo",
        "hash": "8aa8fdde39"
      },
      {
        "texto": "El Tab predictivo ahora puede preguntarle a un modelo",
        "hash": "09038c2745"
      },
      {
        "texto": "Instalar el agente desde el asistente, sin irse a leer documentación",
        "hash": "8dea45871a"
      }
    ],
    "arreglos": 7
  },
  {
    "fecha": "2026-11-04",
    "cambios": [
      {
        "texto": "El castellano queda completo: 274 textos que salían en inglés",
        "hash": "14a4097807"
      },
      {
        "texto": "Apply mete un bloque del chat en el archivo abierto",
        "hash": "59ba35a34f"
      },
      {
        "texto": "Cmd+K edita con IA adentro del editor",
        "hash": "236ada112e"
      },
      {
        "texto": "La interfaz se pinta con los colores que elija la persona",
        "hash": "d057aedbf8"
      },
      {
        "texto": "Tab te lleva a la próxima edición, no sólo la acepta donde estás",
        "hash": "6cc56dbf29"
      },
      {
        "texto": "Aplicar un bloque del chat adentro del archivo abierto",
        "hash": "86699c7191"
      },
      {
        "texto": "El Tab predictivo, andando sobre el texto fantasma de Monaco",
        "hash": "3278e834a5"
      },
      {
        "texto": "El tema propio como ajuste, sin cambiar nada hasta que alguien lo elija",
        "hash": "df13d49324"
      },
      {
        "texto": "Cmd+K: editar con IA adentro del archivo",
        "hash": "d9635142d5"
      },
      {
        "texto": "Checkpoints de código — volver al estado de antes de un pedido",
        "hash": "15c192dffc"
      },
      {
        "texto": "La tira de compañeros, para volver a los que delegaste",
        "hash": "27e4e1020f"
      },
      {
        "texto": "La delegación automática, con su interruptor y su aviso",
        "hash": "c9884f437c"
      }
    ],
    "arreglos": 16
  },
  {
    "fecha": "2026-11-03",
    "cambios": [
      {
        "texto": "Cada función se muestra en un video y se prende ahí mismo",
        "hash": "bdfbba547b"
      },
      {
        "texto": "Los archivos se ven con su extensión y el color de su lenguaje",
        "hash": "4e76d3b212"
      },
      {
        "texto": "Conectar una máquina en un paso, desde donde se elige dónde corre",
        "hash": "4169525710"
      },
      {
        "texto": "La pantalla de inicio es el compositor, no dos botones",
        "hash": "5813dd4227"
      }
    ],
    "arreglos": 3
  },
  {
    "fecha": "2026-11-02",
    "cambios": [
      {
        "texto": "Cambiar de proyecto desde la isla del lienzo",
        "hash": "0c3ce97b35"
      },
      {
        "texto": "El lienzo te lleva hasta la ventana, y el árbol de archivos carga",
        "hash": "1e30940f47"
      },
      {
        "texto": "Los archivos del proyecto, en una ventana del plano",
        "hash": "9430d75bb9"
      }
    ],
    "arreglos": 2
  },
  {
    "fecha": "2026-11-01",
    "cambios": [
      {
        "texto": "Agrandar una ventana del lienzo a toda la vista",
        "hash": "ed49e34dea"
      },
      {
        "texto": "Las referencias vivas también en los textos de la consola",
        "hash": "33f7ad7c9b"
      },
      {
        "texto": "Lo que el chat nombra del proyecto, se toca",
        "hash": "c6cb21c31c"
      },
      {
        "texto": "El diff con la sintaxis en colores, y la lista de archivos legible",
        "hash": "8b85099120"
      },
      {
        "texto": "El lienzo pasa a usar el canvas de Tallow",
        "hash": "d8bd4acb16"
      },
      {
        "texto": "El lienzo, un modo de pantalla completa con las ventanas sobre un plano",
        "hash": "24748d8e78"
      },
      {
        "texto": "«Comenzar» en un issue lo lleva al compositor",
        "hash": "53a856625e"
      },
      {
        "texto": "El mar en píxeles con los delfines saltando, en la portada",
        "hash": "d156b6e772"
      },
      {
        "texto": "La consola desde el teléfono, con el pase como única llave",
        "hash": "e10ebc4b92"
      },
      {
        "texto": "La app de la rama, adentro de la consola, y se la puede tocar",
        "hash": "c9cc978696"
      },
      {
        "texto": "Cambiar de motor a mitad de tarea, en el mismo worktree",
        "hash": "4e80228e70"
      },
      {
        "texto": "El traspaso de una rama de un motor a otro",
        "hash": "b1f3161ad8"
      }
    ],
    "arreglos": 1
  },
  {
    "fecha": "2026-10-31",
    "cambios": [
      {
        "texto": "Las páginas internas, al sistema nuevo",
        "hash": "67d4f138c7"
      },
      {
        "texto": "Las láminas pesan la mitad: se muestran en gris, se guardan en gris",
        "hash": "4aac5952d8"
      },
      {
        "texto": "El marco fantasma de las láminas y el haz duro del faro",
        "hash": "78df22d245"
      },
      {
        "texto": "Los bots, la carta, el ciclo, las preguntas y el pie, al sistema nuevo",
        "hash": "493dcd2b38"
      },
      {
        "texto": "Producto, Formas, el delfín y el índice, al sistema nuevo",
        "hash": "1a64fb14f8"
      },
      {
        "texto": "El mar adentro del delfín: la pieza que no puede tener nadie más",
        "hash": "967be168b1"
      },
      {
        "texto": "Las láminas, tratadas como el grabado de la portada",
        "hash": "27c1d45744"
      },
      {
        "texto": "La portada, al modo de hermes-agent: azul noche, marco celeste y el grabado",
        "hash": "e60fa04a98"
      },
      {
        "texto": "El mar deja de ser el fondo y pasa a ser una estampa",
        "hash": "e351d34616"
      },
      {
        "texto": "El ciclo de mejorarse, que estaba sin quien lo llamara",
        "hash": "86a15d23f9"
      },
      {
        "texto": "Probar la rama de una tarjeta antes de integrarla",
        "hash": "a6710d8a42"
      },
      {
        "texto": "Lo que encuentra un robot se puede anotar en el tablero",
        "hash": "aa03b4ad01"
      },
      {
        "texto": "El tablero por MCP: el agente anota lo que descubre de paso",
        "hash": "2aadbda269"
      },
      {
        "texto": "El índice de las 137 funciones, en la home",
        "hash": "c5f7832d47"
      },
      {
        "texto": "Una litografía de 1844 encabeza las novedades",
        "hash": "51c3890f2f"
      },
      {
        "texto": "Los tests esperan a que algo pase, no a que pase un rato",
        "hash": "908becf146"
      },
      {
        "texto": "Cada rama corre en su propia caja, y el portón acepta fases del repo",
        "hash": "26286b5eaa"
      },
      {
        "texto": "La corrección sigue la misma conversación, no empieza de cero",
        "hash": "7c1f12a609"
      },
      {
        "texto": "Cuántas veces le corregiste lo mismo a tu agente este mes",
        "hash": "573479374d"
      },
      {
        "texto": "Una fase que busca lo que se filtra de las apps hechas con IA",
        "hash": "aab623b1cc"
      },
      {
        "texto": "Los issues de GitHub entran como ideas",
        "hash": "7a60315244"
      },
      {
        "texto": "Volver a cuando andaba, sin saber git",
        "hash": "19c87ae0d3"
      },
      {
        "texto": "Tab escribe lo que conviene contestarle al agente",
        "hash": "f84a866e23"
      },
      {
        "texto": "Avisa cuando lo que estás anotando ya está anotado",
        "hash": "7a0506692e"
      },
      {
        "texto": "Lo que ya está escrito entra al tablero solo, sin gastar un token",
        "hash": "db0d527a8f"
      },
      {
        "texto": "Lo que se corrió de verdad sobre una rama, con su código de salida",
        "hash": "bb1575ceec"
      },
      {
        "texto": "El tablero como sección propia, con las flechas para mover",
        "hash": "0069ecf8cd"
      },
      {
        "texto": "Compartirlo por una rama de git, sin tocar tu árbol de trabajo",
        "hash": "abcea1ef57"
      },
      {
        "texto": "La noche toma la columna Para hacer y deja las tarjetas en Para revisar",
        "hash": "042ff260e1"
      },
      {
        "texto": "Tocar una línea del diff y marcarla, sin salir de la tarjeta",
        "hash": "5ea40f6bee"
      },
      {
        "texto": "Marcar una línea del diff, y que la marca le llegue al agente",
        "hash": "5f24e5835f"
      },
      {
        "texto": "Siete agentes de terminal más, declarados en una tabla",
        "hash": "b268251618"
      },
      {
        "texto": "Revisar la rama adentro de la tarjeta, sin pasar por Cosechas",
        "hash": "17691cd370"
      },
      {
        "texto": "Un ángulo adoptado entra de verdad en la rotación de las siembras",
        "hash": "920626562a"
      }
    ],
    "arreglos": 7
  },
  {
    "fecha": "2026-10-30",
    "cambios": [
      {
        "texto": "Nombrar a Claude, a Gemini o a GPT en el chat trae su logo",
        "hash": "ab2f58219d"
      },
      {
        "texto": "Master Prompt: capturas marcadas con números que se vuelven un pedido para Claude",
        "hash": "3a034fac79"
      }
    ],
    "arreglos": 1
  },
  {
    "fecha": "2026-10-29",
    "cambios": [
      {
        "texto": "Soltar una tarjeta en Haciendo le da «dale» al equipo, y una tarjeta puede esperar a otra",
        "hash": "50c6de4a29"
      },
      {
        "texto": "El equipo mueve la tarjeta que trabaja",
        "hash": "ecc9521303"
      }
    ],
    "arreglos": 0
  },
  {
    "fecha": "2026-10-28",
    "cambios": [
      {
        "texto": "El tablero en la consola, con anotar, arrastrar, abrir y comentar",
        "hash": "fcde648c28"
      },
      {
        "texto": "Se entra de la rama a sus commits, al commit y a su diff, en la terminal y en la consola",
        "hash": "a90dd4d63c"
      },
      {
        "texto": "Pausa por umbral de gasto",
        "hash": "238cea241a"
      },
      {
        "texto": "Permite cambiar el motor de los bots",
        "hash": "8474923859"
      },
      {
        "texto": "Agrega botones de permiso en Telegram",
        "hash": "a1704f153e"
      },
      {
        "texto": "Agrega disparadores locales durables",
        "hash": "8eafbcf958"
      },
      {
        "texto": "Persiste la salida de Telegram",
        "hash": "d6fb2991ab"
      },
      {
        "texto": "Correr issues propios durante la noche",
        "hash": "7a508b20e2"
      },
      {
        "texto": "Validar contratos vivos del repo",
        "hash": "a4f5f35937"
      },
      {
        "texto": "Retomar agentes después del silencio",
        "hash": "2e210b0731"
      },
      {
        "texto": "Los turnos en el VPS corren desprendidos y sobreviven al corte",
        "hash": "1a5feffb46"
      },
      {
        "texto": "La sección Git, como lazygit: ramas, el grafo de commits e issues",
        "hash": "d8db46f8e9"
      },
      {
        "texto": "Suma buzón, estados y memoria por MCP",
        "hash": "e83c9998b6"
      },
      {
        "texto": "Sumar rutinas disparadas por eventos",
        "hash": "672ab40bad"
      },
      {
        "texto": "Limitar presupuesto y entorno de bots",
        "hash": "e022b50758"
      },
      {
        "texto": "Controlar el cupo antes de arrancar",
        "hash": "ce6ce1fa10"
      },
      {
        "texto": "Completa los canales de Telegram",
        "hash": "b7471a1057"
      },
      {
        "texto": "Vigila y corrige PRs draft",
        "hash": "6cfd529991"
      },
      {
        "texto": "Traspasa sesiones sin cupo",
        "hash": "227e1fe8b8"
      },
      {
        "texto": "La vista Git: ramas, commits e issues del repo, con quién trabajó en cada cosa",
        "hash": "f6b00be915"
      },
      {
        "texto": "La consola muestra el permiso, el respaldo y las rutinas nuevas de cada bot, con un botón para deshacer",
        "hash": "f7c4b1b63a"
      },
      {
        "texto": "dolphin bots instalar deja a los bots prendidos como servicio, y un chequeo sin modelo decide si un latido despierta al bot",
        "hash": "8ed84ad8de"
      },
      {
        "texto": "Permiso «carpeta» con foto para deshacer, motor de respaldo y una memoria con tope que se consolida y se busca",
        "hash": "7c0b09bca3"
      },
      {
        "texto": "La pantalla Bots, y Bots en el menú del escritorio",
        "hash": "b5284853d1"
      },
      {
        "texto": "Los bots, también en la consola",
        "hash": "fc3fc38f1f"
      },
      {
        "texto": "Cada bot con su Telegram, y dolphin bots correr los prende",
        "hash": "98598e0baa"
      },
      {
        "texto": "Los bots tienen rutinas y dejan su parte",
        "hash": "aa46970656"
      },
      {
        "texto": "Un bot le pide trabajo a otro, con un límite de dos saltos",
        "hash": "c8bcfe94a5"
      },
      {
        "texto": "Un bot puede quedar solo para leer",
        "hash": "0d3477a271"
      },
      {
        "texto": "Los bots piensan con Claude Code o Codex, con su memoria y sus habilidades",
        "hash": "e02b8e3aed"
      },
      {
        "texto": "Dolphin bots: cada bot es una carpeta, y hay cuatro plantillas para empezar",
        "hash": "6d8839a6be"
      },
      {
        "texto": "El tablero sin líneas y con estados vacíos que dicen qué falta",
        "hash": "54f88307eb"
      }
    ],
    "arreglos": 59
  },
  {
    "fecha": "2026-10-27",
    "cambios": [
      {
        "texto": "Las ediciones del agente se ven en el chat como en Claude Code",
        "hash": "d691c9ae0b"
      },
      {
        "texto": "La marca del agente, tenue, en el fondo del chat",
        "hash": "179307d1c1"
      },
      {
        "texto": "El agente puede correr en una caja que solo ve su worktree, y sin caja no corre",
        "hash": "ceb791acc7"
      },
      {
        "texto": "Cada turno del agente queda en git y se puede volver a cualquiera",
        "hash": "e21c7aaff6"
      },
      {
        "texto": "Reportar bugs desde X-ray",
        "hash": "87d1573a9d"
      },
      {
        "texto": "Rota cuentas cuando se agota el cupo",
        "hash": "8e2e44acce"
      },
      {
        "texto": "Cada entrega dice con qué se comprobó y qué quedó sin comprobar",
        "hash": "cd015b7f30"
      },
      {
        "texto": "Compartir lo que aprendió el agente, sin nada del proyecto",
        "hash": "34bbc973ae"
      },
      {
        "texto": "Migrar y probar que la app nueva contesta igual que la vieja",
        "hash": "a65a139e22"
      },
      {
        "texto": "Del bug que viste al arreglo, con la prueba primero",
        "hash": "6728be4ac8"
      },
      {
        "texto": "La misma tarea a varios motores y elegís mirando las apps lado a lado",
        "hash": "66c593f7b1"
      },
      {
        "texto": "Un video por rama de la app andando con el cambio, para el parte de la mañana",
        "hash": "5c3d689d3d"
      },
      {
        "texto": "El parte de la mañana, y aprobar o descartar desde el celular",
        "hash": "e3b73e6d35"
      },
      {
        "texto": "El equipo aprende de lo que falla y de lo que deshacés",
        "hash": "fd51db7649"
      },
      {
        "texto": "El plan del líder se corrige antes del «dale»",
        "hash": "53ee5027c8"
      },
      {
        "texto": "Cada worktree prepara con su puerto y su base, y ya no comparten la base",
        "hash": "6901122842"
      },
      {
        "texto": "La integración resuelve los choques en vez de tirar el trabajo",
        "hash": "0e5108b68d"
      },
      {
        "texto": "Un oráculo tuyo decide si el objetivo quedó logrado",
        "hash": "58a1987ed4"
      },
      {
        "texto": "El líder asigna archivos y el equipo avisa los choques antes de integrar",
        "hash": "10445a6359"
      },
      {
        "texto": "Memoria rediseñada: se ve qué frena solo, qué va en el pedido y qué espera tu OK",
        "hash": "c1ce35a6b1"
      },
      {
        "texto": "El chat del escritorio sin lo que se veía roto, y el botón de modelo dice cuál se usa",
        "hash": "263297063e"
      },
      {
        "texto": "Gemini abre en chat sobre su CLI, por ACP, como Grok y OpenCode",
        "hash": "c5ef4875c4"
      },
      {
        "texto": "La terminal usa las cuentas de Claude del escritorio y cambia sola si una se queda sin cupo",
        "hash": "4f9712bb60"
      },
      {
        "texto": "La terminal ya no siembra: una tarea chica es un equipo de uno",
        "hash": "af96c5407e"
      },
      {
        "texto": "La terminal de cada agente y el chat se dibujan como Claude Code",
        "hash": "7118c36cf1"
      },
      {
        "texto": "La charla se anota solo desde la app y el canal de Telegram: una sesión suelta no escribe en el repo por su cuenta",
        "hash": "64b83fe747"
      },
      {
        "texto": "Candados y línea de tiempo en el equipo: qué archivos toca cada compañero, dónde chocan y cuándo trabajó cada uno",
        "hash": "fc422e71b4"
      },
      {
        "texto": "Memoria que se gana la confianza: CLAUDE.md y AGENTS.md entran como reglas que esperan tu ok, y cada respuesta dice qué reglas usó",
        "hash": "965fe1705a"
      },
      {
        "texto": "Avisos donde estés: notificación del sistema (y Telegram) cuando un trabajo termina, espera tu «dale» o se traba",
        "hash": "7e142da2c7"
      },
      {
        "texto": "Revisar rápido: la rama del equipo agrupada por compañero, y se integra o se descarta desde ahí",
        "hash": "5c7787a5a7"
      },
      {
        "texto": "Deshacer por partes: el trabajo de un compañero se deshace en la rama del equipo sin perder el de los otros",
        "hash": "21f7a751b6"
      },
      {
        "texto": "Cuánto cuesta antes de arrancar: el plan del líder trae su estimación y espera tu «dale»",
        "hash": "67acb839b3"
      },
      {
        "texto": "La orquestación se ve: un cuadradito por agente con su mascota y su terminal en vivo",
        "hash": "45b019ac87"
      },
      {
        "texto": "Sin permisos, el delfín es rojo: --dangerously-skip-permissions se ve siempre (el delfín, la barra de arriba y el costado del chat)",
        "hash": "f5a06d66af"
      },
      {
        "texto": "El delfín del logo saltando sobre el mar, en braille y truecolor",
        "hash": "a7620feab0"
      }
    ],
    "arreglos": 8
  },
  {
    "fecha": "2026-10-26",
    "cambios": [
      {
        "texto": "«Recordar esto» desde un mensaje del chat guarda una regla activa en la memoria del proyecto",
        "hash": "3a22662d87"
      },
      {
        "texto": "Revisión cruzada en el portón a mano: con la tarea del agente, otro modelo lee el diff en solo lectura y su «cortar» frena el portón",
        "hash": "eb5a5b1930"
      },
      {
        "texto": "Los controles del PR, en el panel de la sesión",
        "hash": "2acdd0902b"
      },
      {
        "texto": "El autopiloto de la noche respeta el cupo",
        "hash": "c0d96b2597"
      },
      {
        "texto": "La memoria del proyecto llega a los agentes de la app",
        "hash": "915ea83699"
      },
      {
        "texto": "Las reglas candidatas se aprueban desde la consola",
        "hash": "cf4da7c6ba"
      },
      {
        "texto": "Al pedido va primero la memoria que tiene que ver",
        "hash": "fe8a2621e0"
      },
      {
        "texto": "Avisa cuando un agente se queda dando vueltas",
        "hash": "53d06b2395"
      },
      {
        "texto": "Avisa cuando dos worktrees tocan lo mismo",
        "hash": "77f29c024d"
      },
      {
        "texto": "Detecta las ramas que hacen trampa para pasar el portón",
        "hash": "fd4763e309"
      }
    ],
    "arreglos": 11
  },
  {
    "fecha": "2026-10-25",
    "cambios": [
      {
        "texto": "El chat sobre el CLI también tiene el panel de la sesión; sin pedidos de estrella ni links a un repo privado",
        "hash": "29f88bf8a5"
      },
      {
        "texto": "Las vistas de la consola, en la barra lateral de la app",
        "hash": "40c8d3ad24"
      },
      {
        "texto": "Elegir chat o terminal al abrir agentes",
        "hash": "07c6ac5fe0"
      }
    ],
    "arreglos": 12
  },
  {
    "fecha": "2026-10-24",
    "cambios": [
      {
        "texto": "El tablero de la orquestación",
        "hash": "0228c5c31c"
      },
      {
        "texto": "El autopiloto de la noche toma lo de la bandeja",
        "hash": "54a431d56d"
      },
      {
        "texto": "La orquestación viene lista sola",
        "hash": "63f8f27dd1"
      },
      {
        "texto": "El estudio, en la isla",
        "hash": "d34c8faf45"
      }
    ],
    "arreglos": 35
  },
  {
    "fecha": "2026-10-23",
    "cambios": [
      {
        "texto": "La isla se mueve y recuerda dónde la dejaste",
        "hash": "e830df7666"
      },
      {
        "texto": "La barra del chat dice cuánto del plan llevás o, con clave de API, cuánto lleva la sesión",
        "hash": "4f852860bb"
      },
      {
        "texto": "La isla se mueve como la Dynamic Island y avisa cuando un agente termina o te necesita",
        "hash": "881d1aba98"
      },
      {
        "texto": "La isla v2 — secciones a gusto y responderle a un agente desde ahí",
        "hash": "8ca39dcd21"
      },
      {
        "texto": "La isla, una pastilla arriba de la pantalla con los agentes",
        "hash": "459cfe8e4c"
      },
      {
        "texto": "La consola adentro de la app usa su misma letra",
        "hash": "aefd2ba239"
      },
      {
        "texto": "Lo que escribe el agente se lee con insignias de color",
        "hash": "e7bc10e299"
      },
      {
        "texto": "La barra del chat dice con qué modelo responde el agente y cuánto contexto lleva",
        "hash": "e06669de73"
      },
      {
        "texto": "El chat del agente muestra al costado los archivos que toca, como VS Code",
        "hash": "b3c3980b74"
      },
      {
        "texto": "Abrir un agente es ver el chat, con el CLI de verdad abajo",
        "hash": "2219b13cc1"
      },
      {
        "texto": "Los textos de los agentes se leen con insignias",
        "hash": "efd75fa1db"
      }
    ],
    "arreglos": 22
  },
  {
    "fecha": "2026-10-22",
    "cambios": [
      {
        "texto": "El estudio de Claude, al lado de la terminal",
        "hash": "851286c0d8"
      },
      {
        "texto": "El portón a mano, para el estudio de la app de escritorio",
        "hash": "aaa873ee65"
      },
      {
        "texto": "Valorar las ideas: el color dice cuál vale más",
        "hash": "cb5e4c8981"
      },
      {
        "texto": "Tableros de vidrio, la Bandeja como bandeja de trabajo y sin acento azul",
        "hash": "d411df433f"
      },
      {
        "texto": "Entrenar al delfín con todo lo que el proyecto ya les enseñó a otros modelos",
        "hash": "dc7596f160"
      },
      {
        "texto": "Adentro de la app, con su tema y sin repetir la marca",
        "hash": "a6e03037cf"
      },
      {
        "texto": "La consola es una pantalla más de la app",
        "hash": "b09868d291"
      },
      {
        "texto": "La app de la rama, explorada como alguien nuevo y juzgada por otro modelo",
        "hash": "e51ec5a175"
      },
      {
        "texto": "La rama principal, vigilada a cero tokens",
        "hash": "1ddc4c8595"
      },
      {
        "texto": "La corrección retoma la sesión en la que el agente escribió",
        "hash": "17e0c6c03d"
      },
      {
        "texto": "La consola piensa, muestra y aprueba el plan",
        "hash": "07b7852710"
      },
      {
        "texto": "El plan de un objetivo y la cola con dependencias",
        "hash": "27121b892a"
      },
      {
        "texto": "El delfín de símbolos nada por toda la pantalla",
        "hash": "b8c4fda8a3"
      },
      {
        "texto": "Los proyectos en la barra: cambiar de repo, sumar o clonar",
        "hash": "bfcd956153"
      },
      {
        "texto": "Se acuerda de todo sin ensuciarse — corto plazo, sueño a la OpenClaw y DREAMS.md",
        "hash": "4fd48cf32e"
      }
    ],
    "arreglos": 30
  },
  {
    "fecha": "2026-10-21",
    "cambios": [
      {
        "texto": "El bucle de corrección vuelve al último verde — una corrección que rompe otra fase se deshace",
        "hash": "70263f1730"
      },
      {
        "texto": "Quién rinde y el portón fase por fase — lo que consulta el router, a la vista",
        "hash": "0c6c5f056a"
      },
      {
        "texto": "El router aprende de las siembras del repo — cifras propias por tipo de tarea, y una rama que sale a medir",
        "hash": "f745647327"
      },
      {
        "texto": "Ponerse verde cambiando la prueba ya no pasa callado — se mide, se marca, y la política decide",
        "hash": "363fddef88"
      },
      {
        "texto": "El parte de cada siembra — cifras, la escalera, la elegida con su diff y los fallos en video",
        "hash": "b5a20f095d"
      },
      {
        "texto": "La fase de pantalla en las siembras de verdad, con video de lo que falla",
        "hash": "14d663b5ac"
      },
      {
        "texto": "El router de modelos — el caro escribe, el barato revisa, y la cosecha dice quién hizo qué",
        "hash": "d003f2ae88"
      },
      {
        "texto": "La consola pasa las 5 personas del tester en sus cinco vistas, y el tester mide mejor",
        "hash": "ccd642f33f"
      },
      {
        "texto": "Cada estado dice qué pasó y qué hacer: cargando, vacío, sin red, sin ramas, código limpiado",
        "hash": "7dd5fc16f1"
      },
      {
        "texto": "La actividad del proyecto y vacíos que dicen qué hacer, con dos componentes de 21st.dev",
        "hash": "b108187f57"
      },
      {
        "texto": "Cada error del explorador trae su momento en video, y el explorador hace menos ruido",
        "hash": "62d067cbc1"
      },
      {
        "texto": "Un turno puede correr en tu VPS por SSH, y la cosecha vuelve",
        "hash": "3b4d249172"
      },
      {
        "texto": "PR automático con la evidencia del portón, y de issue a siembra",
        "hash": "fa8858efd9"
      },
      {
        "texto": "La rama elegida se entrega y se mergea desde la consola",
        "hash": "3db713f1f8"
      },
      {
        "texto": "La cola de tareas en paralelo — varias tareas a la vez, ramas que entran juntas",
        "hash": "0159be1682"
      },
      {
        "texto": "La memoria es del proyecto, no del modelo — Antigravity y Codex como motores",
        "hash": "ae2cc02938"
      },
      {
        "texto": "La Bandeja en la consola, y dos botones que no respondían",
        "hash": "c3afb0f6b6"
      },
      {
        "texto": "El scout de ideas — sale a mirar qué hacen otros y vuelve con ideas concretas",
        "hash": "eb83411f80"
      },
      {
        "texto": "El explorador — recorre la app como una persona y no revisa dos veces lo mismo",
        "hash": "57d4c00386"
      },
      {
        "texto": "El CLI habla de ramas",
        "hash": "41b78f8487"
      },
      {
        "texto": "La barra lateral por secciones — hoy, ayer, la semana — y una tarea es UNA entrada",
        "hash": "44786007f0"
      },
      {
        "texto": "El perfil del proyecto viaja entero a cualquier modelo, y con suscripción no se muestra plata",
        "hash": "e4fbd5d07c"
      },
      {
        "texto": "Las ramas, como una lista de trabajo",
        "hash": "5ab0a08927"
      },
      {
        "texto": "La memoria de respuestas — lo que el modelo ya contestó no se vuelve a pagar",
        "hash": "7c5a0713e7"
      },
      {
        "texto": "La cosecha se cuenta por RAMAS, como se trabaja",
        "hash": "5329767068"
      },
      {
        "texto": "La memoria se acuerda de todo — y aprende sola de los fracasos",
        "hash": "73903f1fff"
      },
      {
        "texto": "Code → Test → Fix → Prove — el intento rebotado corrige y se re-prueba",
        "hash": "b3beae3db1"
      },
      {
        "texto": "La grilla manda y nadie pelea — intentos × fases, sin timeline",
        "hash": "d3016164a2"
      },
      {
        "texto": "La consola nueva, con la corrida reproducible",
        "hash": "86f88aa44a"
      },
      {
        "texto": "Una sola pantalla — la grilla es el portón y el código va abierto",
        "hash": "545fb98c04"
      }
    ],
    "arreglos": 6
  },
  {
    "fecha": "2026-10-20",
    "cambios": [
      {
        "texto": "La primera consola, leyendo las cosechas",
        "hash": "fd711b7bf3"
      },
      {
        "texto": "Varias ramas con enfoques distintos, cada una aislada",
        "hash": "724ae7e9fb"
      }
    ],
    "arreglos": 1
  }
];
