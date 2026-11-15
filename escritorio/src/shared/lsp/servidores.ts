/**
 * Qué servidor de lenguaje le corresponde a un archivo, y cuál es la raíz de su proyecto.
 *
 * Dolphin NO instala ninguno: usa el que ya está en el PATH. Why: un servidor de lenguaje es una
 * herramienta del proyecto —la versión de TypeScript que usa, el entorno de Python en el que vive—
 * y bajar uno nuestro al costado daría respuestas de otro proyecto. Si no está, el editor sigue
 * andando y lo dice; no se cae ni se queda esperando.
 *
 * La raíz importa tanto como el comando: un servidor arrancado en la carpeta equivocada no
 * encuentra el `tsconfig.json` ni los tipos instalados, y contesta que todo está mal.
 */

export type ServidorDeLenguaje = {
  readonly id: string
  /** Los lenguajes de Monaco que atiende. */
  readonly lenguajes: readonly string[]
  /**
   * El ejecutable, tal como se lo busca en el PATH. En Windows se busca también con `.cmd`, `.exe`
   * y `.bat` (`main/lsp/ejecutable-del-servidor.ts`): npm instala los servidores como `.cmd`.
   */
  readonly comando: string
  readonly argumentos: readonly string[]
  /**
   * Los archivos que marcan la raíz del proyecto, del más específico al más general. El primero
   * que aparezca subiendo desde el archivo gana.
   */
  readonly marcasDeRaiz: readonly string[]
  /** Cómo se llama para decirlo en pantalla cuando no está instalado. */
  readonly comoSeInstala: string
}

export const SERVIDORES: readonly ServidorDeLenguaje[] = [
  {
    id: 'typescript',
    lenguajes: ['typescript', 'typescriptreact', 'javascript', 'javascriptreact'],
    comando: 'typescript-language-server',
    argumentos: ['--stdio'],
    marcasDeRaiz: ['tsconfig.json', 'jsconfig.json', 'package.json'],
    comoSeInstala: 'npm i -g typescript-language-server typescript'
  },
  {
    id: 'python',
    lenguajes: ['python'],
    comando: 'pyright-langserver',
    argumentos: ['--stdio'],
    marcasDeRaiz: ['pyproject.toml', 'setup.py', 'requirements.txt'],
    comoSeInstala: 'npm i -g pyright'
  },
  {
    id: 'rust',
    lenguajes: ['rust'],
    comando: 'rust-analyzer',
    argumentos: [],
    marcasDeRaiz: ['Cargo.toml'],
    comoSeInstala: 'rustup component add rust-analyzer'
  },
  {
    id: 'go',
    lenguajes: ['go'],
    comando: 'gopls',
    argumentos: [],
    marcasDeRaiz: ['go.mod'],
    comoSeInstala: 'go install golang.org/x/tools/gopls@latest'
  }
]

/** El servidor que atiende ese lenguaje de Monaco, si hay uno. */
export function servidorDe(lenguaje: string): ServidorDeLenguaje | null {
  const buscado = lenguaje.toLowerCase()
  return SERVIDORES.find((s) => s.lenguajes.includes(buscado)) ?? null
}

/**
 * La raíz del proyecto para un archivo: la carpeta más CERCANA que tenga una marca.
 *
 * Why la más cercana y no la más alta: en un monorepo, el `package.json` de la raíz y el del
 * paquete existen los dos, y el servidor tiene que arrancar en el del paquete —ahí están su
 * `tsconfig` y sus dependencias—. Y why el orden de las marcas manda sobre la distancia: un
 * `tsconfig.json` tres carpetas más arriba describe mejor el proyecto que un `package.json` al
 * lado del archivo, que puede ser sólo el de un ejemplo.
 */
export function raizDelProyecto(
  rutaDelArchivo: string,
  servidor: ServidorDeLenguaje,
  existe: (ruta: string) => boolean
): string | null {
  const partes = rutaDelArchivo.replace(/\\/g, '/').split('/')
  partes.pop()
  const carpetas: string[] = []
  while (partes.length > 0) {
    carpetas.push(partes.join('/'))
    partes.pop()
  }
  for (const marca of servidor.marcasDeRaiz) {
    const encontrada = carpetas.find((carpeta) => existe(`${carpeta}/${marca}`))
    if (encontrada !== undefined) {
      return encontrada
    }
  }
  return null
}
