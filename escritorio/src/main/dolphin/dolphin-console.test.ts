import { existsSync } from 'node:fs'
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import {
  closeDolphinConsoles,
  openDolphinConsole,
  resolveDolphinAppDir,
  runningConsole,
  sendDolphinLive,
  tokenFromConsolePage
} from './dolphin-console'
import { readDolphinPorton, startDolphinPorton } from './dolphin-porton'

// Los procesos son de verdad: matar uno o terminar una pasada tarda lo que tarde el sistema, así
// que se espera a que pase (con margen) en vez de dormir un tiempo fijo.
const ESPERA = { timeout: 10_000, interval: 50 }

/** Los cuerpos que la consola falsa anotó, uno por pedido. */
async function cuerposAnotados(registro: string): Promise<unknown[]> {
  return (await readFile(registro, 'utf8'))
    .trim()
    .split('\n')
    .map((line) => JSON.parse(line))
}

// Un Dolphin falso, construido: una consola que escucha donde le dicen (0: donde diga el sistema),
// avisa su URL por la salida y sirve su página con el pase, como la de verdad (JavaScript que también
// es TypeScript válido). /api/live anota lo que le llega con el pase correcto en DOLPHIN_REGISTRO_LIVE,
// y /pid devuelve su pid. Más un paquete «tsx» vacío para el --import.
const FAKE_UI_CLI = `import http from 'node:http'
import { appendFileSync } from 'node:fs'
const port = Number(process.argv[process.argv.indexOf('--puerto') + 1])
const repo = process.argv[process.argv.indexOf('--repo') + 1]
let porton = { corriendo: false, pasada: null }
const server = http.createServer((req, res) => {
  if (req.url === '/api/porton') {
    res.setHeader('content-type', 'application/json')
    if (req.method !== 'POST') return res.end(JSON.stringify(porton))
    let cuerpo = ''
    req.on('data', (trozo) => (cuerpo += trozo))
    req.on('end', () => {
      if (req.headers['x-dolphin-token'] !== 'abc123') { res.writeHead(403); return res.end('{}') }
      if (process.env.DOLPHIN_REGISTRO_PORTON) appendFileSync(process.env.DOLPHIN_REGISTRO_PORTON, cuerpo + '\\n')
      if (porton.corriendo) { res.writeHead(409); return res.end('{"ok":false,"porQue":"ya está pasando por el portón"}') }
      porton = { corriendo: true, pasada: { desde: 'antes', fases: [{ nombre: 'typecheck', estado: 'corriendo' }] } }
      setTimeout(() => {
        porton = { corriendo: false, pasada: { desde: 'antes', hasta: 'después', fases: [
          { nombre: 'typecheck', estado: 'paso', ms: 12 },
          { nombre: 'test', estado: 'fallo', detalle: 'test: ✖ suma con negativos' }
        ] } }
      }, 300)
      res.writeHead(202)
      return res.end('{"ok":true}')
    })
    return
  }
  if (req.method === 'POST' && req.url === '/api/live') {
    let cuerpo = ''
    req.on('data', (trozo) => (cuerpo += trozo))
    req.on('end', () => {
      if (req.headers['x-dolphin-token'] !== 'abc123') { res.writeHead(403); return res.end('no') }
      const datos = JSON.parse(cuerpo)
      if (!datos.pedido) {
        res.writeHead(400, { 'content-type': 'application/json' })
        return res.end(JSON.stringify({ ok: false, porQue: 'contá qué querés cambiarle' }))
      }
      appendFileSync(process.env.DOLPHIN_REGISTRO_LIVE, cuerpo + '\\n')
      res.writeHead(202, { 'content-type': 'application/json' })
      res.end('{"ok":true}')
    })
    return
  }
  if (req.url === '/pid') return res.end(String(process.pid))
  res.writeHead(200, { 'content-type': 'text/html' })
  res.end('<html><head><meta name="dolphin-token" content="abc123"></head><body>dolphin de prueba ' + repo + '</body></html>')
})
server.listen(port, '127.0.0.1', () => console.log('  http://127.0.0.1:' + server.address().port))
`

// Sin construir, la consola de verdad contesta 503 a todo: esperar no lo arregla.
const FAKE_UI_CLI_SIN_CONSTRUIR = `import http from 'node:http'
const port = Number(process.argv[process.argv.indexOf('--puerto') + 1])
const server = http.createServer((_req, res) => { res.writeHead(503); res.end('La consola no está construida todavía') })
server.listen(port, '127.0.0.1', () => console.log('  http://127.0.0.1:' + server.address().port))
`

describe('dolphin console', () => {
  let base = ''
  let dolphinDir = ''

  beforeEach(async () => {
    base = await mkdtemp(join(tmpdir(), 'dolphin-console-'))
    dolphinDir = join(base, 'dolphin-app')
    await mkdir(join(dolphinDir, 'src'), { recursive: true })
    await mkdir(join(dolphinDir, 'node_modules', 'tsx'), { recursive: true })
    await writeFile(join(dolphinDir, 'src', 'ui-cli.ts'), FAKE_UI_CLI)
    await writeFile(join(dolphinDir, 'package.json'), '{"type":"module"}\n')
    await writeFile(
      join(dolphinDir, 'node_modules', 'tsx', 'package.json'),
      '{"name":"tsx","type":"module","exports":"./index.js"}\n'
    )
    await writeFile(
      join(dolphinDir, 'node_modules', 'tsx', 'index.js'),
      '// sin cargador: la consola falsa ya es JavaScript\n'
    )
  })

  afterEach(async () => {
    // Why esperar: en Windows la carpeta donde corre la consola no se borra hasta que la consola sale.
    await closeDolphinConsoles()
    await rm(base, { recursive: true, force: true })
  })

  const options = () => ({
    appPath: join(base, 'dolphin-escritorio'),
    nodeProgram: process.execPath,
    env: { ...process.env, DOLPHIN_APP_DIR: dolphinDir }
  })

  it('finds Dolphin next to the app, or where DOLPHIN_APP_DIR says', async () => {
    await expect(resolveDolphinAppDir(resolve('/repos/dolphin-escritorio'), {})).resolves.toBe(
      resolve('/repos/dolphin-app')
    )
    await expect(resolveDolphinAppDir('/x/app', { DOLPHIN_APP_DIR: dolphinDir })).resolves.toBe(
      dolphinDir
    )
  })

  it('finds Dolphin one folder up when the app lives inside its repo', async () => {
    const nucleo = join(base, 'un-repo')
    await mkdir(join(nucleo, 'escritorio'), { recursive: true })
    await writeFile(join(nucleo, 'dolphin.config.json'), '{}')
    await expect(resolveDolphinAppDir(join(nucleo, 'escritorio'), {})).resolves.toBe(nucleo)
  })

  it('starts the console for a repo, serves it, and reuses it on the next open', async () => {
    const repo = join(base, 'mi-repo')
    const first = await openDolphinConsole(repo, options())
    // Con el objeto entero: si no arranca, el mensaje del test dice por qué.
    expect(first).toMatchObject({ ok: true })
    if (!first.ok) {
      return
    }
    const response = await fetch(first.url)
    expect(await response.text()).toContain('mi-repo')

    const second = await openDolphinConsole(repo, options())
    expect(second).toEqual(first)
  })

  it('a console that died is started again, not handed out dead', async () => {
    const repo = join(base, 'repo-que-muere')
    const first = await openDolphinConsole(repo, options())
    expect(first).toMatchObject({ ok: true })
    if (!first.ok) {
      return
    }
    // La mata alguien de afuera (el administrador de tareas, el sistema).
    process.kill(Number(await (await fetch(`${first.url}/pid`)).text()))
    await expect.poll(() => runningConsole(repo), ESPERA).toBeNull()
    const second = await openDolphinConsole(repo, options())
    expect(second).toMatchObject({ ok: true })
    if (second.ok) {
      expect(second.url).not.toBe(first.url)
      expect((await fetch(second.url)).ok).toBe(true)
    }
  })

  it('a console that closes before saying where it listens is reported with its last error line', async () => {
    await writeFile(
      join(dolphinDir, 'src', 'ui-cli.ts'),
      "console.error('Error: no encuentro el repo'); process.exit(3)\n"
    )
    const result = await openDolphinConsole(join(base, 'repo-que-se-cae'), options())
    expect(result).toEqual({ ok: false, code: 'exited', detail: '3 · Error: no encuentro el repo' })
  })

  it('a console that is not built says so at once instead of waiting for the timeout', async () => {
    await writeFile(join(dolphinDir, 'src', 'ui-cli.ts'), FAKE_UI_CLI_SIN_CONSTRUIR)
    const result = await openDolphinConsole(join(base, 'repo-sin-build'), {
      ...options(),
      timeoutMs: 15_000
    })
    // Why sin cronómetro: si esperara el tope, el resultado sería `timeout` y no `not-built`.
    expect(result).toEqual({ ok: false, code: 'not-built' })
  })

  it('reads the console pass from its page', () => {
    expect(tokenFromConsolePage('<head><meta name="dolphin-token" content="9f0a"></head>')).toBe(
      '9f0a'
    )
    expect(tokenFromConsolePage('dolphin de prueba')).toBeUndefined()
  })

  it("live mode: sends the touched element with the console pass, and passes Dolphin's reason on", async () => {
    const registro = join(base, 'live.jsonl')
    const conRegistro = { ...options(), env: { ...options().env, DOLPHIN_REGISTRO_LIVE: registro } }
    const elemento = { url: 'http://127.0.0.1:5173/', selector: 'form > button', texto: 'Comprar' }

    const result = await sendDolphinLive(
      { repoPath: join(base, 'repo-live'), pedido: 'hacelo amarillo', elemento },
      conRegistro
    )
    expect(result.ok).toBe(true)
    const [enviado] = (await readFile(registro, 'utf8')).trim().split('\n')
    expect(JSON.parse(enviado!)).toEqual({ pedido: 'hacelo amarillo', elemento })

    // Lo que contesta Dolphin cuando no puede, llega tal cual a quien lo pidió.
    const sinPedido = await sendDolphinLive(
      { repoPath: join(base, 'repo-live'), pedido: '', elemento },
      conRegistro
    )
    expect(sinPedido).toEqual({ ok: false, code: 'rejected', detail: 'contá qué querés cambiarle' })
  })

  it('the porton: starts a run with the console pass, answers the one running, and reads how it ended', async () => {
    const repo = join(base, 'repo-porton')
    // Preguntar no levanta la consola: sin una corriendo, no hay a quién preguntarle.
    expect(await readDolphinPorton(repo, options())).toEqual({
      ok: false,
      code: 'unreachable',
      detail: 'la consola de Dolphin no está corriendo'
    })
    expect(await startDolphinPorton(repo, options())).toMatchObject({
      ok: true,
      corriendo: true,
      pasada: { fases: [{ nombre: 'typecheck', estado: 'corriendo' }] }
    })
    // Otra vez mientras corre: no arranca una segunda, contesta la que corre.
    expect(await startDolphinPorton(repo, options())).toMatchObject({ ok: true, corriendo: true })
    await expect
      .poll(() => readDolphinPorton(repo, options()), ESPERA)
      .toMatchObject({ corriendo: false })
    expect(await readDolphinPorton(repo, options())).toEqual({
      ok: true,
      corriendo: false,
      pasada: {
        desde: 'antes',
        hasta: 'después',
        fases: [
          { nombre: 'typecheck', estado: 'paso', ms: 12 },
          { nombre: 'test', estado: 'fallo', detalle: 'test: ✖ suma con negativos' }
        ]
      }
    })
  })

  it('the porton: a console that died mid-run is not replaced by a fresh one that knows nothing', async () => {
    const repo = join(base, 'repo-porton-cortado')
    const started = await startDolphinPorton(repo, options())
    expect(started).toMatchObject({ ok: true, corriendo: true })
    const opened = await openDolphinConsole(repo, options())
    if (!opened.ok) {
      return
    }
    process.kill(Number(await (await fetch(`${opened.url}/pid`)).text()))
    await expect.poll(() => runningConsole(repo), ESPERA).toBeNull()
    expect(await readDolphinPorton(repo, options())).toMatchObject({
      ok: false,
      code: 'unreachable'
    })
  })

  it('the porton: sends the optional cross-review body and keeps the legacy empty body', async () => {
    const registro = join(base, 'porton.jsonl')
    const conRegistro = {
      ...options(),
      env: { ...options().env, DOLPHIN_REGISTRO_PORTON: registro }
    }
    const repo = join(base, 'repo-porton-revision')
    await startDolphinPorton(repo, conRegistro, {
      tarea: 'Arreglá el botón',
      escribio: 'sonnet',
      base: 'origin/main'
    })
    await expect.poll(() => cuerposAnotados(registro), ESPERA).toHaveLength(1)
    const cuerpos = await cuerposAnotados(registro)
    expect(cuerpos[0]).toEqual({
      tarea: 'Arreglá el botón',
      escribio: 'sonnet',
      base: 'origin/main'
    })

    // La pasada anterior termina antes de pedir otra, como haría quien la mira.
    await expect
      .poll(() => readDolphinPorton(repo, conRegistro), ESPERA)
      .toMatchObject({ corriendo: false })
    await startDolphinPorton(repo, conRegistro)
    await expect.poll(() => cuerposAnotados(registro), ESPERA).toHaveLength(2)
    const updated = await cuerposAnotados(registro)
    expect(updated[1]).toEqual({})

    await expect
      .poll(() => readDolphinPorton(repo, conRegistro), ESPERA)
      .toMatchObject({ corriendo: false })
    await startDolphinPorton(repo, conRegistro, { tarea: 'x'.repeat(5_000) })
    await expect.poll(() => cuerposAnotados(registro), ESPERA).toHaveLength(3)
    const truncated = await cuerposAnotados(registro)
    expect(truncated[2]).toMatchObject({ tarea: 'x'.repeat(4_000) })
  })

  it('says where it looked when Dolphin is not there, instead of failing silently', async () => {
    const result = await openDolphinConsole(join(base, 'repo'), {
      ...options(),
      env: { ...process.env, DOLPHIN_APP_DIR: join(base, 'no-existe') }
    })
    expect(result).toMatchObject({ ok: false, code: 'not-found' })
    if (!result.ok) {
      expect(result.detail).toContain('no-existe')
    }
  })

  it('starts the built core that travels in the installer: dist/ only, without src or tsx', async () => {
    // Como queda en resources/dolphin-app: dist/, ui/ y package.json, sin código fuente ni node_modules.
    const instalado = join(base, 'Dolphin', 'resources', 'dolphin-app')
    await mkdir(join(instalado, 'dist'), { recursive: true })
    await writeFile(join(instalado, 'dist', 'ui-cli.js'), FAKE_UI_CLI)
    await writeFile(join(instalado, 'package.json'), '{"type":"module"}\n')
    const sinDolphin = { ...process.env }
    delete sinDolphin.DOLPHIN_APP_DIR
    const result = await openDolphinConsole(join(base, 'repo-instalado'), {
      ...options(),
      appPath: join(base, 'Dolphin', 'resources', 'app.asar'),
      env: sinDolphin
    })
    expect(result).toMatchObject({ ok: true })
    if (result.ok) {
      expect(await (await fetch(result.url)).text()).toContain('repo-instalado')
    }
  })

  it('the installed app without the Dolphin core says so, instead of asking for npm install in its resources', async () => {
    const sinDolphin = { ...process.env }
    delete sinDolphin.DOLPHIN_APP_DIR
    const result = await openDolphinConsole(join(base, 'repo'), {
      ...options(),
      appPath: join(base, 'Dolphin', 'resources', 'app.asar'),
      env: sinDolphin
    })
    expect(result).toMatchObject({ ok: false, code: 'not-installed' })
    if (!result.ok) {
      expect(result.detail).toBe(join(base, 'Dolphin', 'resources', 'dolphin-app'))
    }
  })

  it('a program that cannot be launched fails at once, not at the end of the wait', async () => {
    const started = Date.now()
    const result = await openDolphinConsole(join(base, 'repo-sin-node'), {
      ...options(),
      nodeProgram: join(base, 'no-hay-node', 'node.exe'),
      timeoutMs: 60_000
    })
    expect(result).toMatchObject({ ok: false, code: 'exited' })
    expect(Date.now() - started).toBeLessThan(15_000)
  })

  it('a console that says where it listens but never answers ends within one budget, not two', async () => {
    // Avisa la URL y acepta conexiones, pero no contesta nunca: antes eran dos topes seguidos.
    await writeFile(
      join(dolphinDir, 'src', 'ui-cli.ts'),
      "import http from 'node:http'\n" +
        'const server = http.createServer(() => {})\n' +
        "server.listen(0, '127.0.0.1', () => console.log('  http://127.0.0.1:' + server.address().port))\n"
    )
    const started = Date.now()
    const result = await openDolphinConsole(join(base, 'repo-mudo'), {
      ...options(),
      timeoutMs: 3_000
    })
    expect(result).toEqual({ ok: false, code: 'timeout', detail: '3' })
    expect(Date.now() - started).toBeLessThan(5_500)
  })

  it('closing the app also stops a console that is still starting', async () => {
    // Una consola que nunca dice dónde escucha: se queda arrancando. Deja una marca al arrancar,
    // para cerrar la app recién cuando el proceso existe.
    const marca = join(base, 'arranco')
    await writeFile(
      join(dolphinDir, 'src', 'ui-cli.ts'),
      "import { writeFileSync } from 'node:fs'\n" +
        "writeFileSync(process.env.DOLPHIN_MARCA_ARRANQUE, 'si')\n" +
        'setInterval(() => {}, 1000)\n'
    )
    const pending = openDolphinConsole(join(base, 'repo-lento'), {
      ...options(),
      env: { ...options().env, DOLPHIN_MARCA_ARRANQUE: marca },
      timeoutMs: 60_000
    })
    await expect.poll(() => existsSync(marca), ESPERA).toBe(true)
    await closeDolphinConsoles()
    // Se cortó por el cierre y no por los 60 s del tope: por el tope sería `timeout`.
    expect(await pending).toMatchObject({ ok: false, code: 'exited' })
  })
})
