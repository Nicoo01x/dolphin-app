// @vitest-environment happy-dom
import { cleanup, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  issueAbierto,
  issueNoPlaneado,
  linkDeIssue,
  linkDePr,
  prAbierto,
  prBorradorConConflictos,
  prDatosParciales
} from './datos-de-ejemplo.test-fixture'
import { VistaDeTarjeta } from './VistaDeTarjeta'

afterEach(cleanup)

const nada = () => {}

describe('VistaDeTarjeta', () => {
  it('un PR muestra estado, rama, tamaño, checks con el que falló y la revisión', () => {
    render(
      <VistaDeTarjeta
        link={linkDePr}
        estado={{ status: 'ready', value: prAbierto }}
        reintentar={nada}
      />
    )
    expect(screen.getByText('Open')).toBeTruthy()
    expect(screen.getByText('dolphin/redondeo-iva')).toBeTruthy()
    expect(screen.getByText('14 files')).toBeTruthy()
    expect(screen.getByText('Failed: test (ubuntu-latest, node 20)')).toBeTruthy()
    expect(screen.getByText('Changes requested')).toBeTruthy()
    expect(screen.getByText('Updated', { exact: false })).toBeTruthy()
  })

  it('un borrador con conflictos lo avisa con el nombre de la base', () => {
    render(
      <VistaDeTarjeta
        link={linkDePr}
        estado={{ status: 'ready', value: prBorradorConConflictos }}
        reintentar={nada}
      />
    )
    expect(screen.getByText('Draft')).toBeTruthy()
    expect(screen.getByText('Conflicts with main')).toBeTruthy()
  })

  it('un issue muestra etiquetas, hito y el PR que lo va a cerrar', () => {
    render(
      <VistaDeTarjeta
        link={linkDeIssue}
        estado={{ status: 'ready', value: issueAbierto }}
        reintentar={nada}
      />
    )
    expect(screen.getByText('idea')).toBeTruthy()
    expect(screen.getByText('Black Friday')).toBeTruthy()
    expect(screen.getByText('#52 will close it')).toBeTruthy()
  })

  it('un issue cerrado como no planeado lo dice en la pastilla', () => {
    render(
      <VistaDeTarjeta
        link={linkDeIssue}
        estado={{ status: 'ready', value: issueNoPlaneado }}
        reintentar={nada}
      />
    )
    expect(screen.getByText('Not planned')).toBeTruthy()
  })

  it('con datos a medias no dibuja lo que no llegó: ni ceros ni undefined', () => {
    const { container } = render(
      <VistaDeTarjeta
        link={{ ...linkDePr, number: 53 }}
        estado={{ status: 'ready', value: prDatosParciales }}
        reintentar={nada}
      />
    )
    expect(container.textContent).not.toMatch(/undefined|NaN/)
    expect(screen.queryByText('Changes')).toBeNull()
    expect(screen.queryByText('Checks')).toBeNull()
    expect(screen.queryByText('Updated', { exact: false })).toBeNull()
  })

  it('cargando: el esqueleto ocupa el lugar y el lector oye que está cargando', async () => {
    const { container } = render(
      <VistaDeTarjeta link={linkDePr} estado={{ status: 'loading' }} reintentar={nada} />
    )
    expect(container.querySelectorAll('.dolphin-tg-hueso').length).toBeGreaterThan(5)
    expect(await screen.findByText('Loading details from GitHub')).toBeTruthy()
  })

  it('sin acceso dice qué pasó y deja reintentar sin abrir el link', async () => {
    const reintentar = vi.fn()
    render(
      <VistaDeTarjeta link={linkDeIssue} estado={{ status: 'failed' }} reintentar={reintentar} />
    )
    expect(screen.getByText(/your gh session can't see it/)).toBeTruthy()
    await userEvent.click(screen.getByRole('button', { name: 'Retry' }))
    expect(reintentar).toHaveBeenCalledOnce()
  })

  it('sin conexión lo dice en vez de culpar al acceso', () => {
    render(
      <VistaDeTarjeta
        link={linkDeIssue}
        estado={{ status: 'failed' }}
        sinConexion
        reintentar={nada}
      />
    )
    expect(screen.getByText(/You're offline/)).toBeTruthy()
  })

  it('el lector recibe estado, título y resumen del PR', async () => {
    render(
      <VistaDeTarjeta
        link={linkDePr}
        estado={{ status: 'ready', value: prAbierto }}
        reintentar={nada}
      />
    )
    const estado = await screen.findByText(/^Pull request #52 in tienda-ejemplo\/tienda-web, Open:/)
    expect(estado.getAttribute('role')).toBe('status')
    expect(estado.textContent).toMatch(/1.?240 lines added, 380 removed, 14 files\./)
    expect(estado.textContent).toContain('Changes requested')
  })
})
