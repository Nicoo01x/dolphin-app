import { join } from 'node:path'

/**
 * Sin imports del repo, y eso es a propósito: los scripts que arman el servidor remoto cargan
 * estos módulos con el stripping de tipos de Node, que no completa extensiones. Un `import
 * './dolphin-env'` acá cortaba el build del template entero con «Cannot find module», así que
 * quién sabe leer el entorno es quien llama.
 */

export function getTarProgram(): string {
  return process.platform === 'win32'
    ? join(process.env.SystemRoot || 'C:\\Windows', 'System32', 'tar.exe')
    : 'tar'
}

/**
 * The destination must already exist; callers extract only checksum-verified archives.
 *
 * `unzipBin` is the `UNZIP_BIN` override, read by the caller: on Windows, with no override, the
 * bundled `tar.exe` does the job and no unzip has to be installed.
 */
export function getZipExtractorCommand(
  zipPath: string,
  extractDir: string,
  unzipBin?: string | null
): { file: string; args: string[]; label: string } {
  if (process.platform === 'win32' && !unzipBin) {
    return {
      file: getTarProgram(),
      args: ['-xf', zipPath, '-C', extractDir],
      label: 'tar'
    }
  }
  return {
    file: unzipBin || 'unzip',
    args: ['-q', zipPath, '-d', extractDir],
    label: 'unzip'
  }
}
