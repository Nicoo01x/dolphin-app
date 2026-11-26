import { describe, expect, it } from 'vitest'
import {
  caminoDelControl,
  controlEnPunto,
  lineasDelControl,
  referenciaDeControl
} from './winforms-controls'
import type { WinFormsControl } from './winforms-preview-types'

const control = (c: Partial<WinFormsControl> & Pick<WinFormsControl, 'id'>): WinFormsControl => ({
  padre: -1,
  nivel: 0,
  nombre: `c${c.id}`,
  tipo: 'System.Windows.Forms.Button',
  texto: '',
  x: 0,
  y: 0,
  w: 10,
  h: 10,
  ...c
})

// Un panel con dos botones adentro, y un label suelto que tapa al panel en una esquina.
const mapa: WinFormsControl[] = [
  control({
    id: 0,
    nombre: 'lblAviso',
    tipo: 'System.Windows.Forms.Label',
    x: 90,
    y: 90,
    w: 40,
    h: 20
  }),
  control({
    id: 1,
    nombre: 'panel',
    tipo: 'System.Windows.Forms.Panel',
    x: 10,
    y: 10,
    w: 100,
    h: 100
  }),
  control({ id: 2, padre: 1, nivel: 1, nombre: 'btnGuardar', x: 20, y: 20, w: 30, h: 20 }),
  control({ id: 3, padre: 1, nivel: 1, nombre: 'btnCerrar', x: 60, y: 20, w: 30, h: 20 }),
  control({ id: 4, padre: 1, nivel: 1, nombre: 'oculto', x: 0, y: 0, w: 0, h: 0 })
]

describe('controlEnPunto', () => {
  it('baja hasta el control más profundo', () => {
    expect(controlEnPunto(mapa, 25, 25)?.nombre).toBe('btnGuardar')
    expect(controlEnPunto(mapa, 70, 30)?.nombre).toBe('btnCerrar')
  })

  it('se queda en el contenedor cuando no hay hijo debajo', () => {
    expect(controlEnPunto(mapa, 15, 80)?.nombre).toBe('panel')
  })

  it('entre hermanos superpuestos gana el primero, como en WinForms', () => {
    expect(controlEnPunto(mapa, 95, 95)?.nombre).toBe('lblAviso')
  })

  it('el borde derecho e inferior quedan afuera', () => {
    expect(controlEnPunto(mapa, 50, 25)?.nombre).toBe('panel')
    expect(controlEnPunto(mapa, 49, 25)?.nombre).toBe('btnGuardar')
  })

  it('devuelve null sobre el fondo del formulario', () => {
    expect(controlEnPunto(mapa, 200, 200)).toBeNull()
    expect(controlEnPunto([], 1, 1)).toBeNull()
  })

  it('ignora controles sin tamaño', () => {
    expect(controlEnPunto(mapa, 0, 0)).toBeNull()
  })
})

describe('caminoDelControl', () => {
  it('va del formulario al control y nombra por tipo al que no tiene nombre', () => {
    expect(caminoDelControl(mapa, 2)).toEqual(['panel', 'btnGuardar'])
    const sinNombre = [...mapa, control({ id: 5, padre: 1, nombre: '', tipo: 'A.B.Grid' })]
    expect(caminoDelControl(sinNombre, 5)).toEqual(['panel', 'Grid'])
  })
})

const designer = `namespace A
{
    partial class frmClientes
    {
        private void InitializeComponent()
        {
            this.btnGuardar = new DevExpress.XtraEditors.SimpleButton();
            //
            // btnGuardar
            //
            this.btnGuardar.Location = new System.Drawing.Point(20, 20);
            this.btnGuardar.Name = "btnGuardar";
        }

        private DevExpress.XtraEditors.SimpleButton btnGuardar;
        public System.Windows.Forms.Label lblTitulo;
    }
}`

describe('lineasDelControl', () => {
  it('encuentra la declaración y el bloque de configuración', () => {
    expect(lineasDelControl(designer, 'btnGuardar')).toEqual({ declaracion: 15, configuracion: 9 })
  })

  it('cae al primer uso si no hay comentario del diseñador', () => {
    expect(lineasDelControl(designer, 'lblTitulo')).toEqual({
      declaracion: 16,
      configuracion: null
    })
  })

  it('no acepta nombres que romperían la búsqueda', () => {
    expect(lineasDelControl(designer, 'a.*')).toEqual({ declaracion: null, configuracion: null })
  })
})

describe('referenciaDeControl', () => {
  it('arma el texto con archivo y línea', () => {
    const texto = referenciaDeControl({
      control: mapa[2]!,
      camino: ['panel', 'btnGuardar'],
      formulario: 'A.frmClientes',
      titulo: 'Clientes',
      designer: 'C:\\p\\frmClientes.Designer.cs',
      designerVisible: 'Forms/frmClientes.Designer.cs',
      lineas: { declaracion: 15, configuracion: 9 }
    })
    expect(texto).toContain('Control «btnGuardar» del formulario A.frmClientes («Clientes»)')
    expect(texto).toContain('- Dónde: panel › btnGuardar')
    expect(texto).toContain('- Declarado en: Forms/frmClientes.Designer.cs:15')
    expect(texto).toContain('- Configurado en: Forms/frmClientes.Designer.cs:9')
    expect(texto).toContain('- Tamaño: 30×20 px')
  })
})
