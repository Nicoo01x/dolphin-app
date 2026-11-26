import { createHash } from 'node:crypto'
import { mkdir, readFile, stat } from 'node:fs/promises'
import { join } from 'node:path'
import { app } from 'electron'
import { runProcess } from '@dolphin/process-host'

/**
 * El host nativo se distribuye como fuente (native/winforms-host/DolphinFormHost.cs) y se compila en
 * la máquina del usuario al primer uso, con el csc que trae el .NET Framework 4.x de Windows. Así no
 * hay un .exe más que firmar, y si el .NET Framework no está, tampoco podría correr el formulario.
 */

export type Arquitectura = 'x86' | 'x64'

async function existe(ruta: string): Promise<boolean> {
  try {
    await stat(ruta)
    return true
  } catch {
    return false
  }
}

export async function rutaDeLaFuenteDelHost(): Promise<string | null> {
  const candidatos = [
    ...(process.resourcesPath
      ? [join(process.resourcesPath, 'winforms-host', 'DolphinFormHost.cs')]
      : []),
    join(app.getAppPath(), 'native', 'winforms-host', 'DolphinFormHost.cs'),
    join(process.cwd(), 'native', 'winforms-host', 'DolphinFormHost.cs')
  ]
  for (const candidato of candidatos) {
    if (await existe(candidato)) {
      return candidato
    }
  }
  return null
}

export function rutaDelCompilador(arquitectura: Arquitectura): string {
  const windows = process.env.WINDIR ?? process.env.SystemRoot ?? 'C:\\Windows'
  const framework = arquitectura === 'x64' ? 'Framework64' : 'Framework'
  return join(windows, 'Microsoft.NET', framework, 'v4.0.30319', 'csc.exe')
}

export class ErrorDelHost extends Error {}

const compilando = new Map<string, Promise<string>>()

/**
 * El .exe del host para esa arquitectura, compilándolo si hace falta. La carpeta lleva la huella de la
 * fuente: una versión nueva de Dolphin compila su propio host sin pisar el anterior.
 */
export async function asegurarHost(
  arquitectura: Arquitectura,
  alCompilar: () => void
): Promise<string> {
  const fuente = await rutaDeLaFuenteDelHost()
  if (!fuente) {
    throw new ErrorDelHost('Falta la fuente del host de vista previa en la instalación de Dolphin.')
  }
  const codigo = await readFile(fuente)
  const huella = createHash('sha256').update(codigo).digest('hex').slice(0, 12)
  const carpeta = join(app.getPath('userData'), 'winforms-host', huella)
  const exe = join(carpeta, `DolphinFormHost-${arquitectura}.exe`)
  if (await existe(exe)) {
    return exe
  }
  const clave = exe.toLowerCase()
  const enCurso = compilando.get(clave)
  if (enCurso) {
    return enCurso
  }
  const tarea = (async (): Promise<string> => {
    const csc = rutaDelCompilador(arquitectura)
    if (!(await existe(csc))) {
      throw new ErrorDelHost(
        `No encontré el compilador del .NET Framework 4 (${csc}). La vista previa necesita el .NET Framework 4.x instalado.`
      )
    }
    alCompilar()
    await mkdir(carpeta, { recursive: true })
    const resultado = await runProcess(
      {
        program: csc,
        args: [
          '-nologo',
          `-platform:${arquitectura}`,
          '-target:winexe',
          '-optimize',
          '-codepage:65001',
          `-out:${exe}`,
          '-r:System.Windows.Forms.dll',
          '-r:System.Drawing.dll',
          fuente
        ],
        timeoutMs: 60_000
      },
      'tail'
    )
    if (resultado.code !== 0 || !(await existe(exe))) {
      throw new ErrorDelHost(
        `No se pudo compilar el host de vista previa: ${(resultado.stdout + resultado.stderr).trim().slice(-600)}`
      )
    }
    return exe
  })().finally(() => compilando.delete(clave))
  compilando.set(clave, tarea)
  return tarea
}
