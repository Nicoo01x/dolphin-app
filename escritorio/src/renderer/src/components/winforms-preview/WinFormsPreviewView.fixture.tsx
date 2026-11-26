import { defineFixture } from '../../component-fixtures/component-fixture'
import type { WinFormsControl } from '../../../../shared/winforms/winforms-preview-types'
import type { EstadoDeSesion } from './winforms-session-state'
import { ESTADO_INICIAL } from './winforms-session-state'
import { WinFormsPreviewView, type AccionesDeVistaPrevia } from './WinFormsPreviewView'

// Un formulario genérico dibujado en SVG, del tamaño que mandaría el host (píxeles del cuadro).
const ANCHO = 520
const ALTO = 300
const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${ANCHO}" height="${ALTO}" font-family="Segoe UI, sans-serif" font-size="12">
<rect width="${ANCHO}" height="${ALTO}" fill="#f0f0f0"/>
<rect width="${ANCHO}" height="30" fill="#ffffff"/>
<text x="12" y="20" fill="#222">Clientes</text>
<text x="490" y="20" fill="#444">✕</text>
<rect x="10" y="40" width="500" height="200" fill="#e9e9e9" stroke="#c8c8c8"/>
<text x="24" y="70" fill="#222">Razón social</text>
<rect x="120" y="56" width="370" height="22" fill="#fff" stroke="#a9a9a9"/>
<text x="126" y="71" fill="#222">Molinos del Sur S.A.</text>
<text x="24" y="104" fill="#222">CUIT</text>
<rect x="120" y="90" width="180" height="22" fill="#fff" stroke="#a9a9a9"/>
<text x="126" y="105" fill="#222">30-12345678-9</text>
<text x="24" y="138" fill="#222">Condición IVA</text>
<rect x="120" y="124" width="180" height="22" fill="#fff" stroke="#a9a9a9"/>
<text x="126" y="139" fill="#222">Responsable inscripto</text>
<rect x="337" y="256" width="80" height="26" fill="#fdfdfd" stroke="#8a8a8a"/>
<text x="356" y="273" fill="#222">Guardar</text>
<rect x="425" y="256" width="80" height="26" fill="#fdfdfd" stroke="#8a8a8a"/>
<text x="443" y="273" fill="#222">Cancelar</text>
</svg>`

const control = (c: Partial<WinFormsControl> & Pick<WinFormsControl, 'id' | 'nombre'>) =>
  ({
    padre: -1,
    nivel: 0,
    tipo: 'System.Windows.Forms.Button',
    texto: '',
    x: 0,
    y: 0,
    w: 0,
    h: 0,
    ...c
  }) as WinFormsControl

const controles: WinFormsControl[] = [
  control({
    id: 0,
    nombre: 'btnGuardar',
    tipo: 'DevExpress.XtraEditors.SimpleButton',
    texto: 'Guardar',
    x: 337,
    y: 256,
    w: 80,
    h: 26
  }),
  control({
    id: 1,
    nombre: 'btnCancelar',
    tipo: 'DevExpress.XtraEditors.SimpleButton',
    texto: 'Cancelar',
    x: 425,
    y: 256,
    w: 80,
    h: 26
  }),
  control({
    id: 2,
    nombre: 'grpDatos',
    tipo: 'DevExpress.XtraEditors.GroupControl',
    x: 10,
    y: 40,
    w: 500,
    h: 200
  }),
  control({
    id: 3,
    padre: 2,
    nivel: 1,
    nombre: 'txtRazonSocial',
    tipo: 'DevExpress.XtraEditors.TextEdit',
    texto: 'Molinos del Sur S.A.',
    x: 120,
    y: 56,
    w: 370,
    h: 22
  }),
  control({
    id: 4,
    padre: 2,
    nivel: 1,
    nombre: 'txtCuit',
    tipo: 'DevExpress.XtraEditors.TextEdit',
    texto: '30-12345678-9',
    x: 120,
    y: 90,
    w: 180,
    h: 22
  }),
  control({
    id: 5,
    padre: 2,
    nivel: 1,
    nombre: 'cmbCondicionIva',
    tipo: 'DevExpress.XtraEditors.LookUpEdit',
    x: 120,
    y: 124,
    w: 180,
    h: 22
  })
]

const build = {
  ruta: 'C:\\repo\\Ventas\\bin\\Debug\\Ventas.dll',
  modificado: Date.UTC(2026, 0, 22, 15, 4),
  origen: 'proyecto' as const
}

const listo: EstadoDeSesion = {
  ...ESTADO_INICIAL,
  fase: 'listo',
  plan: {
    archivo: 'C:\\repo\\Ventas\\Forms\\frmClientes.cs',
    designer: 'C:\\repo\\Ventas\\Forms\\frmClientes.Designer.cs',
    clase: 'frmClientes',
    nombreCompleto: 'Ventas.Forms.frmClientes',
    tipo: 'formulario',
    proyecto: 'C:\\repo\\Ventas\\Ventas.csproj',
    ensambladoEsperado: 'Ventas.dll',
    builds: [
      build,
      {
        ...build,
        ruta: 'C:\\repo\\Deploy\\Ventas.dll',
        modificado: Date.UTC(2025, 10, 3),
        origen: 'repositorio'
      }
    ]
  },
  build: { build, arquitectura: 'x86', desactualizado: null },
  titulo: 'Clientes',
  cuadro: { src: `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`, ancho: ANCHO, alto: ALTO },
  controles
}

const acciones: AccionesDeVistaPrevia = {
  onRecargar: () => undefined,
  onUsarBuild: () => undefined,
  onElegirEnsamblado: () => undefined,
  onCerrarDialogo: () => undefined,
  onAbrirDesigner: () => undefined,
  onEnviar: () => undefined,
  onCopiar: () => undefined,
  ubicar: async () => ({ declaracion: 212, configuracion: 88 })
}

const vista = (estado: EstadoDeSesion) => () => (
  <div style={{ height: 520 }}>
    <WinFormsPreviewView
      estado={estado}
      clase="frmClientes"
      designerVisible="Ventas/Forms/frmClientes.Designer.cs"
      acciones={acciones}
    />
  </div>
)

/** Hover sobre un TextEdit y un botón seleccionado: las dos marcas a la vez. */
export const seleccion = defineFixture({
  width: 760,
  render: vista(listo),
  interact: async (frame) => {
    const imagen = frame.querySelector('img')
    if (!imagen) {
      return
    }
    await imagen.decode().catch(() => undefined)
    const r = imagen.getBoundingClientRect()
    const punto = (x: number, y: number) => ({
      clientX: r.left + (x / ANCHO) * r.width,
      clientY: r.top + (y / ALTO) * r.height,
      bubbles: true
    })
    imagen.dispatchEvent(new MouseEvent('click', punto(370, 268)))
    await new Promise((listo) => setTimeout(listo, 50))
    imagen.dispatchEvent(new MouseEvent('mousemove', punto(200, 66)))
    await new Promise((listo) => setTimeout(listo, 50))
  }
})

export const desactualizado = defineFixture({
  width: 760,
  render: vista({
    ...listo,
    build: {
      build,
      arquitectura: 'x86',
      desactualizado: {
        fuente: 'C:\\repo\\Ventas\\Forms\\frmClientes.Designer.cs',
        modificado: Date.UTC(2026, 2, 3, 10, 30)
      }
    }
  })
})

export const cargando = defineFixture({
  width: 760,
  render: vista({ ...listo, fase: 'creando-formulario', cuadro: null, controles: [] })
})

export const error = defineFixture({
  width: 760,
  render: vista({
    ...listo,
    fase: 'error',
    cuadro: null,
    controles: [],
    descartados: [
      {
        build: { ...build, ruta: 'C:\\repo\\Deploy\\Ventas.dll' },
        motivo: "No se puede cargar el archivo o ensamblado 'DevExpress.XtraEditors.v20.1'."
      }
    ],
    error: {
      codigo: 'constructor',
      mensaje:
        'SqlException: No se puede abrir la base de datos "Ventas" solicitada por el inicio de sesión.',
      detalle:
        'System.Data.SqlClient.SqlException (0x80131904): No se puede abrir la base de datos…\n   en Ventas.Datos.Conexion.Abrir()\n   en Ventas.Forms.frmClientes..ctor()'
    }
  })
})
