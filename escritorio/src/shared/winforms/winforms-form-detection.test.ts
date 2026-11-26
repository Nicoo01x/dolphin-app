import { describe, expect, it } from 'vitest'
import {
  analizarFuenteWinForms,
  archivoPrincipal,
  clasesDeclaradas,
  esCandidatoWinForms,
  rutaDelDesigner,
  sinComentarios
} from './winforms-form-detection'

const designerDeFormulario = `namespace Ventas.Forms
{
    partial class frmClientes
    {
        private System.ComponentModel.IContainer components = null;
        private void InitializeComponent()
        {
            this.btnGuardar = new DevExpress.XtraEditors.SimpleButton();
            this.SuspendLayout();
            this.ClientSize = new System.Drawing.Size(640, 480);
            this.Name = "frmClientes";
            this.Text = "Clientes";
        }
        private DevExpress.XtraEditors.SimpleButton btnGuardar;
    }
}`

describe('analizarFuenteWinForms', () => {
  it('reconoce un XtraForm con su namespace', () => {
    const codigo = `using System;
namespace Ventas.Forms
{
    public partial class frmClientes : DevExpress.XtraEditors.XtraForm
    {
        public frmClientes() { InitializeComponent(); }
    }
}`
    expect(analizarFuenteWinForms(codigo, designerDeFormulario, 'frmClientes.cs')).toEqual({
      tipo: 'formulario',
      clase: 'frmClientes',
      espacio: 'Ventas.Forms',
      nombreCompleto: 'Ventas.Forms.frmClientes',
      base: 'DevExpress.XtraEditors.XtraForm'
    })
  })

  it('reconoce Form, RibbonForm y SplashScreen aunque no haya Designer', () => {
    for (const base of ['Form', 'System.Windows.Forms.Form', 'RibbonForm', 'SplashScreen']) {
      const codigo = `namespace A { public partial class frmX : ${base} { } }`
      expect(analizarFuenteWinForms(codigo, null, 'frmX.cs')?.tipo).toBe('formulario')
    }
  })

  it('usa el Designer cuando la base es propia del proyecto', () => {
    const codigo = `namespace Ventas.Forms {
  public partial class frmClientes : XtraEditors.XtraFormEditionBase //DevExpress.XtraEditors.XtraForm
  { }
}`
    expect(analizarFuenteWinForms(codigo, designerDeFormulario, 'frmClientes.cs')?.tipo).toBe(
      'formulario'
    )
    expect(analizarFuenteWinForms(codigo, null, 'frmClientes.cs')).toBeNull()
  })

  it('ignora la base que está en un comentario', () => {
    const codigo = `namespace A { public partial class rptVentas : ERP.Reports.Base.rptBase // : Form
{ } }`
    expect(analizarFuenteWinForms(codigo, null, 'rptVentas.cs')).toBeNull()
  })

  it('no confunde un reporte con designer con un formulario', () => {
    const codigo = 'namespace A { public partial class rptVentas : XtraReport { } }'
    expect(analizarFuenteWinForms(codigo, designerDeFormulario, 'rptVentas.cs')).toBeNull()
    const designerDeReporte = `partial class rptVentas { private void InitializeComponent() {
  this.Bands.AddRange(new DevExpress.XtraReports.UI.Band[] { this.Detail }); } }`
    const propio = 'namespace A { public partial class rptVentas : ERP.Reports.Base.rptBase { } }'
    expect(analizarFuenteWinForms(propio, designerDeReporte, 'rptVentas.cs')).toBeNull()
  })

  it('distingue un control de usuario', () => {
    const codigo =
      'namespace A { public partial class ucFiltro : DevExpress.XtraEditors.XtraUserControl { } }'
    expect(analizarFuenteWinForms(codigo, null, 'ucFiltro.cs')?.tipo).toBe('control')
  })

  it('toma la base declarada en la otra mitad de la clase parcial', () => {
    const codigo = 'namespace A { public partial class frmX { public frmX() { } } }'
    const designer = 'namespace A { partial class frmX : Form { void InitializeComponent() { } } }'
    expect(analizarFuenteWinForms(codigo, designer, 'frmX.cs')?.nombreCompleto).toBe('A.frmX')
  })

  it('elige la clase que se llama como el archivo', () => {
    const codigo = `namespace A {
  public class Ayuda : EventArgs { }
  public partial class frmPedido : Form { }
}`
    expect(analizarFuenteWinForms(codigo, null, 'frmPedido.cs')?.clase).toBe('frmPedido')
  })

  it('devuelve null para una clase común', () => {
    expect(
      analizarFuenteWinForms('namespace A { public class Cliente { } }', null, 'Cliente.cs')
    ).toBeNull()
  })
})

describe('clasesDeclaradas', () => {
  it('arma el namespace de bloques anidados y de archivo', () => {
    expect(
      clasesDeclaradas('namespace A { namespace B { class C : Form { } } class D : Form { } }').map(
        (c) => `${c.espacio}.${c.nombre}`
      )
    ).toEqual(['A.B.C', 'A.D'])
    expect(clasesDeclaradas('namespace A.B;\nclass C : Form { }')[0]?.espacio).toBe('A.B')
  })

  it('no lee clases dentro de textos', () => {
    expect(clasesDeclaradas('var s = "class Falsa : Form {";').length).toBe(0)
  })
})

describe('sinComentarios', () => {
  it('conserva los saltos de línea de un comentario de bloque', () => {
    expect(sinComentarios('a /* x\ny */ b').split('\n').length).toBe(2)
  })

  it('no corta una URL dentro de un texto', () => {
    expect(sinComentarios('var u = "http://x"; class A : Form {}')).toContain('class A : Form')
  })
})

describe('rutas del explorador', () => {
  it('detecta candidatos por el Designer hermano', () => {
    const hermanos = new Set(['frma.cs', 'frma.designer.cs', 'frmb.designer.cs', 'util.cs'])
    expect(esCandidatoWinForms('frmA.cs', hermanos)).toBe(true)
    // Visual Studio a veces escribe el Designer en minúsculas.
    expect(esCandidatoWinForms('frmB.cs', hermanos)).toBe(true)
    expect(esCandidatoWinForms('Util.cs', hermanos)).toBe(false)
    expect(esCandidatoWinForms('frmA.Designer.cs', hermanos)).toBe(false)
  })

  it('pasa del archivo al Designer y vuelta', () => {
    expect(rutaDelDesigner('C:\\p\\frmA.cs')).toBe('C:\\p\\frmA.Designer.cs')
    expect(rutaDelDesigner('C:\\p\\frmA.Designer.cs')).toBeNull()
    expect(archivoPrincipal('C:\\p\\frmA.Designer.cs')).toBe('C:\\p\\frmA.cs')
  })
})
