import { afterEach, describe, expect, it, vi } from 'vitest'

vi.mock('@/i18n/i18n', () => ({
  translate: (_clave: string, texto: string, valores?: Record<string, string>) =>
    texto.replace(/\{\{(\w+)\}\}/g, (_todo, nombre: string) => valores?.[nombre] ?? '')
}))
const info = vi.fn()
vi.mock('sonner', () => ({ toast: { info: (...args: unknown[]) => info(...args) } }))

import {
  __olvidarAvisosSinServidorParaTests,
  avisarSinServidor,
  avisoSinServidor
} from './lsp-aviso-sin-servidor'

const NO_INSTALADO = {
  sinServidor: true,
  motivo: 'no-instalado',
  comando: 'typescript-language-server',
  comoSeInstala: 'npm i -g typescript-language-server typescript'
}

afterEach(() => {
  __olvidarAvisosSinServidorParaTests()
  info.mockClear()
})

describe('el aviso de que falta el servidor de lenguaje', () => {
  it('sin instalar dice cuál falta y cómo se instala', () => {
    const aviso = avisoSinServidor(NO_INSTALADO)
    expect(aviso?.titulo).toBe('typescript-language-server is not installed')
    expect(aviso?.detalle).toContain('npm i -g typescript-language-server typescript')
  })

  it('instalado y sin arrancar dice el motivo que dio el servidor', () => {
    const aviso = avisoSinServidor({
      sinServidor: true,
      motivo: 'no-arranco',
      comando: 'pyright-langserver',
      detalle: 'el servidor de lenguaje se cerró (1)'
    })
    expect(aviso?.titulo).toBe('pyright-langserver did not start')
    expect(aviso?.detalle).toBe('el servidor de lenguaje se cerró (1)')
  })

  it('sin tsserver.js (TypeScript 7) lo dice con lo que hay que hacer, no con el error crudo', () => {
    const aviso = avisoSinServidor({
      sinServidor: true,
      motivo: 'no-arranco',
      comando: 'typescript-language-server',
      detalle:
        'Request initialize failed with message: Could not find a valid TypeScript installation. Please ensure that the "typescript" dependency is installed in the workspace or that a valid `tsserver.path` is specified. Exiting.'
    })
    expect(aviso?.detalle).toContain('TypeScript 7')
    expect(aviso?.detalle).toContain('typescript@6')
  })

  it('lo que no tiene arreglo no se avisa: un lenguaje sin servidor, un archivo sin proyecto, uno con servidor', () => {
    expect(
      avisoSinServidor({ sinServidor: true, motivo: 'sin-servidor-para-el-lenguaje' })
    ).toBeNull()
    expect(avisoSinServidor({ sinServidor: true, motivo: 'sin-raiz', comando: 'gopls' })).toBeNull()
    expect(avisoSinServidor({ sinServidor: false, servidor: 'typescript', raiz: '/r' })).toBeNull()
  })

  it('veinte archivos sin servidor son un solo aviso', () => {
    for (let vez = 0; vez < 20; vez += 1) {
      avisarSinServidor(NO_INSTALADO)
    }
    expect(info).toHaveBeenCalledTimes(1)
    expect(info).toHaveBeenCalledWith('typescript-language-server is not installed', {
      description: expect.stringContaining('npm i -g')
    })
  })
})
