/** El ayudante nativo de X-ray: dónde está y cómo se lanza (una línea JSON por evento). */
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { createInterface } from 'node:readline'
import type { ChildProcess } from 'node:child_process'
import { app } from 'electron'
import { spawnProcess } from '@dolphin/process-host'
import { windowsPowerShellPath } from '@dolphin/process-host/windows-system-binary'
import {
  PREFERRED_WINDOWS_EXECUTION_POLICY,
  isExecutionPolicyBlocked,
  windowsPowerShellRuntimeArgs,
  type WindowsExecutionPolicy
} from '../computer/windows-powershell-execution-policy'
import { leerEventoXray, type XrayEvent } from '../../shared/dolphin-xray-types'
import { rutaExiste } from './ruta-existe'

export async function rutaDelAyudanteXray(): Promise<string | null> {
  const candidatos = [
    ...(process.resourcesPath ? [join(process.resourcesPath, 'xray-windows', 'xray.ps1')] : []),
    join(app.getAppPath(), 'native', 'xray-windows', 'xray.ps1'),
    join(process.cwd(), 'native', 'xray-windows', 'xray.ps1')
  ]
  const existen = await Promise.all(candidatos.map(rutaExiste))
  return candidatos.find((_, indice) => existen[indice]) ?? null
}

export function lanzarAyudante(
  script: string,
  politica: WindowsExecutionPolicy,
  alEvento: (evento: XrayEvent) => void,
  alBloqueo: () => void
): ChildProcess {
  const ayudante = spawnProcess({
    program: windowsPowerShellPath(),
    args: windowsPowerShellRuntimeArgs(script, politica, [
      '-AppPid',
      String(process.pid),
      '-CropDir',
      join(tmpdir(), 'dolphin-xray')
    ]),
    stdio: ['pipe', 'pipe', 'pipe'],
    timeoutMs: null
  })
  ayudante.once('error', () => undefined)
  if (ayudante.stdout) {
    createInterface({ input: ayudante.stdout }).on('line', (linea) => {
      const evento = leerEventoXray(linea)
      if (evento) {
        alEvento(evento)
      }
    })
  }
  let errores = ''
  ayudante.stderr?.on('data', (chunk: Buffer) => {
    errores = (errores + chunk.toString('utf8')).slice(-4000)
    if (politica === PREFERRED_WINDOWS_EXECUTION_POLICY && isExecutionPolicyBlocked(errores)) {
      alBloqueo()
    }
  })
  return ayudante
}
