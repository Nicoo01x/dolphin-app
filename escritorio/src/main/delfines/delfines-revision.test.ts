import { describe, expect, it } from 'vitest'
import { leerRevision, revisionPublica, scriptDeRevision } from './delfines-revision'

const SERVIDOR = { hostId: 'ssh:vps-ana' as const, nombre: 'vps-ana' }

function salida(campos: Record<string, string>): string {
  return Object.entries(campos)
    .map(([clave, valor]) => `${clave}=${valor}`)
    .join('\n')
}

const TODO_BIEN = {
  sistema: 'Linux',
  home: '/home/ana',
  usuario: 'ana',
  node: '/home/ana/.dolphin-remote/runtimes/node-ab/bin/node',
  nodeVersion: '24.22.1',
  systemd: '0',
  linger: 'yes',
  huella: '',
  motorEsta: '1',
  motorLogin: '0'
}

describe('la revisión del servidor', () => {
  it('con todo en su lugar está lista y sugiere una carpeta propia del bot', () => {
    const revision = leerRevision(SERVIDOR, 'claude', 'vigia', salida(TODO_BIEN))
    expect(revision.listo).toBe(true)
    expect(revision.carpetaSugerida).toBe('/home/ana/dolphin-bots/vigia')
    expect(revision.pasos.map((paso) => paso.estado)).toEqual(['ok', 'ok', 'ok', 'ok', 'ok'])
    expect(revisionPublica(revision)).not.toHaveProperty('home')
  })

  it('si el repo ya está en la casa del servidor, el bot trabaja ahí', () => {
    const revision = leerRevision(
      SERVIDOR,
      'claude',
      'vigia',
      salida({ ...TODO_BIEN, carpetaExiste: 'tienda' })
    )
    expect(revision.carpetaSugerida).toBe('/home/ana/tienda')
  })

  it('el motor sin sesión frena con el comando para iniciarla', () => {
    const revision = leerRevision(
      SERVIDOR,
      'claude',
      'vigia',
      salida({ ...TODO_BIEN, motorLogin: '1' })
    )
    expect(revision.listo).toBe(false)
    expect(revision.pasos.find((paso) => paso.paso === 'motor')).toEqual({
      paso: 'motor',
      estado: 'falta',
      detalle: 'sin-sesion',
      comando: 'claude auth login'
    })
  })

  it('codex sin instalar dice cómo instalarlo', () => {
    const revision = leerRevision(
      SERVIDOR,
      'codex',
      'parte',
      salida({ ...TODO_BIEN, motorEsta: '0' })
    )
    expect(revision.pasos.find((paso) => paso.paso === 'motor')).toMatchObject({
      estado: 'falta',
      detalle: 'sin-instalar',
      comando: 'npm install -g @openai/codex'
    })
  })

  it('sin linger avisa pero no frena: el bot corre, aunque se apaga al cerrar la sesión', () => {
    const revision = leerRevision(
      SERVIDOR,
      'claude',
      'vigia',
      salida({ ...TODO_BIEN, linger: 'no' })
    )
    expect(revision.listo).toBe(true)
    expect(revision.pasos.find((paso) => paso.paso === 'linger')).toEqual({
      paso: 'linger',
      estado: 'aviso',
      comando: 'sudo loginctl enable-linger ana'
    })
  })

  it('sin Node ni Linux no está listo', () => {
    const { node: _node, ...sinNode } = TODO_BIEN
    const revision = leerRevision(
      SERVIDOR,
      'mentira',
      'x',
      salida({ ...sinNode, sistema: 'Darwin' })
    )
    expect(revision.listo).toBe(false)
    expect(
      revision.pasos.filter((paso) => paso.estado === 'falta').map((paso) => paso.paso)
    ).toEqual(['sistema', 'node'])
  })

  it('el script busca primero el Node de dolphind y prueba la sesión del motor del bot', () => {
    const script = scriptDeRevision('claude', 'D:\\proyectos\\tienda')
    expect(script).toContain('.dolphin-remote/runtimes/node-')
    expect(script.indexOf('runtimes/node-')).toBeLessThan(script.indexOf('command -v node'))
    expect(script).toContain('claude auth status')
    expect(script).toContain('"$HOME"/\'tienda\'')
    expect(scriptDeRevision('mentira', '/x')).not.toContain('auth status')
  })
})
