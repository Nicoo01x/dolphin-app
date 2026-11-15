import { execFile } from 'node:child_process'
import { mkdtemp, readFile, rm, writeFile, mkdir } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { promisify } from 'node:util'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import {
  cambiosDesde,
  checkpointsGuardados,
  crearCheckpoint,
  olvidarCheckpoint,
  restaurarCheckpoint,
  type EjecutarGit
} from './checkpoint-de-codigo'

/**
 * Contra un repo git de verdad y no contra un mock: lo que puede salir mal acá es justamente cómo
 * se porta git —el índice, el .gitignore, los archivos que aparecen después—, y un mock contestaría
 * lo que yo quiera oír. Es lo único que prueba que restaurar no se lleva trabajo puesto.
 */

const ejecutar = promisify(execFile)

const git: EjecutarGit = async (args, opciones) => {
  const { stdout } = await ejecutar('git', [...args], {
    cwd: opciones.cwd,
    env: { ...process.env, ...opciones.env },
    encoding: 'utf8',
    maxBuffer: 10 * 1024 * 1024
  })
  return { stdout }
}

let repo: string

async function escribir(ruta: string, contenido: string): Promise<void> {
  const completa = join(repo, ruta)
  await mkdir(join(completa, '..'), { recursive: true })
  await writeFile(completa, contenido, 'utf8')
}

async function leer(ruta: string): Promise<string> {
  return readFile(join(repo, ruta), 'utf8')
}

beforeEach(async () => {
  repo = await mkdtemp(join(tmpdir(), 'dolphin-checkpoint-test-'))
  await git(['init', '-b', 'main'], { cwd: repo })
  await git(['config', 'user.email', 'prueba@dolphin.test'], { cwd: repo })
  await git(['config', 'user.name', 'Prueba'], { cwd: repo })
  await git(['config', 'commit.gpgsign', 'false'], { cwd: repo })
  await escribir('motor.ts', 'export const uno = 1\n')
  await escribir('.gitignore', 'node_modules/\n')
  await git(['add', '-A'], { cwd: repo })
  await git(['commit', '-m', 'inicial'], { cwd: repo })
})

afterEach(async () => {
  await rm(repo, { recursive: true, force: true }).catch(() => {})
})

describe('crear un checkpoint', () => {
  it('guarda el estado de ahora, con lo que todavía no está commiteado', async () => {
    await escribir('motor.ts', 'export const uno = 999\n')
    const checkpoint = await crearCheckpoint(git, repo)
    expect(checkpoint).not.toBeNull()

    const { stdout } = await git(['show', `${checkpoint!.sha}:motor.ts`], { cwd: repo })
    expect(stdout).toContain('999')
  })

  it('no mueve HEAD ni crea una rama', async () => {
    const antes = (await git(['rev-parse', 'HEAD'], { cwd: repo })).stdout.trim()
    const ramasAntes = (await git(['branch', '--format=%(refname:short)'], { cwd: repo })).stdout
    await crearCheckpoint(git, repo)
    expect((await git(['rev-parse', 'HEAD'], { cwd: repo })).stdout.trim()).toBe(antes)
    expect((await git(['branch', '--format=%(refname:short)'], { cwd: repo })).stdout).toBe(
      ramasAntes
    )
  })

  /**
   * La que importa de verdad: `git add -A` sobre el índice real le borra a la persona lo que tenía
   * preparado para commitear. Eso es trabajo suyo y nadie pidió entregarlo.
   */
  it('no toca lo que la persona tenía preparado para commitear', async () => {
    await escribir('preparado.ts', 'export const listo = true\n')
    await escribir('suelto.ts', 'export const suelto = true\n')
    await git(['add', 'preparado.ts'], { cwd: repo })
    const indiceAntes = (await git(['diff', '--cached', '--name-only'], { cwd: repo })).stdout

    await crearCheckpoint(git, repo)

    expect((await git(['diff', '--cached', '--name-only'], { cwd: repo })).stdout).toBe(indiceAntes)
    expect(indiceAntes.trim()).toBe('preparado.ts')
  })

  it('no mete nada en el stash', async () => {
    await escribir('motor.ts', 'cambiado\n')
    await crearCheckpoint(git, repo)
    const { stdout } = await git(['stash', 'list'], { cwd: repo })
    expect(stdout.trim()).toBe('')
  })

  it('lo que .gitignore excluye no entra', async () => {
    await escribir('node_modules/paquete/index.js', 'basura\n')
    const checkpoint = await crearCheckpoint(git, repo)
    const { stdout } = await git(['ls-tree', '-r', '--name-only', checkpoint!.sha], { cwd: repo })
    expect(stdout).not.toContain('node_modules')
  })

  it('queda sostenido por su ref, así el recolector no se lo lleva', async () => {
    const checkpoint = await crearCheckpoint(git, repo)
    const guardados = await checkpointsGuardados(git, repo)
    expect(guardados.map((g) => g.sha)).toContain(checkpoint!.sha)
  })

  // Sin HEAD no hay padre, y un checkpoint que no se puede comparar no sirve para nada.
  it('un repo sin un solo commit no da checkpoint', async () => {
    const vacio = await mkdtemp(join(tmpdir(), 'dolphin-checkpoint-vacio-'))
    try {
      await git(['init', '-b', 'main'], { cwd: vacio })
      expect(await crearCheckpoint(git, vacio)).toBeNull()
    } finally {
      await rm(vacio, { recursive: true, force: true }).catch(() => {})
    }
  })
})

describe('restaurar', () => {
  it('devuelve un archivo modificado a como estaba', async () => {
    const checkpoint = await crearCheckpoint(git, repo)
    await escribir('motor.ts', 'export const uno = 999\n')
    await restaurarCheckpoint(git, repo, checkpoint!.sha)
    expect(await leer('motor.ts')).toContain('const uno = 1')
  })

  it('trae de vuelta un archivo que se había borrado', async () => {
    const checkpoint = await crearCheckpoint(git, repo)
    await rm(join(repo, 'motor.ts'))
    await restaurarCheckpoint(git, repo, checkpoint!.sha)
    expect(existsSync(join(repo, 'motor.ts'))).toBe(true)
  })

  /**
   * Si los archivos nuevos quedaran, el proyecto terminaría con piezas de dos momentos distintos
   * conviviendo: justo el estado del que la persona quería salir.
   */
  it('saca los archivos que aparecieron después', async () => {
    const checkpoint = await crearCheckpoint(git, repo)
    await escribir('inventado.ts', 'export const nuevo = true\n')
    const resultado = await restaurarCheckpoint(git, repo, checkpoint!.sha)
    expect(existsSync(join(repo, 'inventado.ts'))).toBe(false)
    expect(resultado.archivosBorrados).toContain('inventado.ts')
  })

  it('no borra lo que .gitignore excluye', async () => {
    const checkpoint = await crearCheckpoint(git, repo)
    await escribir('node_modules/paquete/index.js', 'no me toques\n')
    await restaurarCheckpoint(git, repo, checkpoint!.sha)
    expect(existsSync(join(repo, 'node_modules/paquete/index.js'))).toBe(true)
  })

  /** La propiedad que hace que esto se pueda ofrecer: restaurar es reversible. */
  it('deja un checkpoint para deshacer la restauración', async () => {
    const primero = await crearCheckpoint(git, repo)
    await escribir('motor.ts', 'export const uno = 999\n')
    const restauracion = await restaurarCheckpoint(git, repo, primero!.sha)
    expect(await leer('motor.ts')).toContain('const uno = 1')

    await restaurarCheckpoint(git, repo, restauracion.deshacer.sha)
    expect(await leer('motor.ts')).toContain('999')
  })

  it('tampoco al restaurar se toca el índice', async () => {
    const checkpoint = await crearCheckpoint(git, repo)
    await escribir('preparado.ts', 'export const listo = true\n')
    await git(['add', 'preparado.ts'], { cwd: repo })
    const indiceAntes = (
      await git(['diff', '--cached', '--name-only'], { cwd: repo })
    ).stdout.trim()
    await escribir('motor.ts', 'otra cosa\n')

    await restaurarCheckpoint(git, repo, checkpoint!.sha)

    expect((await git(['diff', '--cached', '--name-only'], { cwd: repo })).stdout.trim()).toBe(
      indiceAntes
    )
  })
})

describe('qué cambió desde un checkpoint', () => {
  it('nombra el archivo y qué le pasó', async () => {
    const checkpoint = await crearCheckpoint(git, repo)
    await escribir('motor.ts', 'cambiado\n')
    await escribir('agregado.ts', 'nuevo\n')
    const cambios = await cambiosDesde(git, repo, checkpoint!.sha)
    expect(cambios).toEqual(
      expect.arrayContaining([
        { archivo: 'motor.ts', estado: 'M' },
        { archivo: 'agregado.ts', estado: 'A' }
      ])
    )
  })

  it('sin cambios no devuelve nada', async () => {
    const checkpoint = await crearCheckpoint(git, repo)
    expect(await cambiosDesde(git, repo, checkpoint!.sha)).toEqual([])
  })

  // La comparación crea un checkpoint auxiliar: si no lo suelta, la lista se llena de ruido.
  it('comparar no deja checkpoints de más', async () => {
    const checkpoint = await crearCheckpoint(git, repo)
    await escribir('motor.ts', 'cambiado\n')
    await cambiosDesde(git, repo, checkpoint!.sha)
    const guardados = await checkpointsGuardados(git, repo)
    expect(guardados).toHaveLength(1)
    expect(guardados[0]?.sha).toBe(checkpoint!.sha)
  })
})

describe('olvidar un checkpoint', () => {
  it('suelta la ref y no toca ningún archivo', async () => {
    await escribir('motor.ts', 'cambiado\n')
    const checkpoint = await crearCheckpoint(git, repo)
    await olvidarCheckpoint(git, repo, checkpoint!)
    expect(await checkpointsGuardados(git, repo)).toHaveLength(0)
    expect(await leer('motor.ts')).toContain('cambiado')
  })
})
