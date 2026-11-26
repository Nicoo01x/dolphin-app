// Abre UN formulario WinForms de un ensamblado ya compilado, sin pasar por el Main de la app, y lo
// transmite a Dolphin: cuadros PNG del formulario y el mapa de sus controles, una línea JSON por evento.
//
// Uso: DolphinFormHost.exe <ensamblado.exe|dll> <Namespace.Clase> [--config <archivo.config>]
// Stdin (una orden por línea): "refrescar" fuerza cuadro y controles, "cerrar-dialogos", "cerrar".
//
// Se compila en la máquina del usuario con el csc del .NET Framework (C# 5: sin interpolación ni ?.),
// en x86 y x64, porque la arquitectura del host tiene que coincidir con la del ensamblado.
using System;
using System.Collections.Generic;
using System.Drawing;
using System.Drawing.Imaging;
using System.Globalization;
using System.IO;
using System.Reflection;
using System.Runtime.InteropServices;
using System.Text;
using System.Threading;
using System.Windows.Forms;

public static class DolphinFormHost
{
    static readonly object Cerrojo = new object();
    static Form formulario;
    static IntPtr ventanaPrevia = IntPtr.Zero;
    static string ultimoMapa = "";
    static long ultimaHuella = 0;
    static bool reubicando = false;
    static readonly HashSet<long> dialogosVistos = new HashSet<long>();

    [STAThread]
    public static int Main(string[] args)
    {
        // Sin consola (winexe) no se puede cambiar Console.OutputEncoding: se escribe UTF-8 a mano.
        var salida = new StreamWriter(Console.OpenStandardOutput(), new UTF8Encoding(false));
        salida.AutoFlush = true;
        Console.SetOut(salida);
        if (args.Length < 2)
        {
            Emitir("{\"evento\":\"error\",\"codigo\":\"uso\",\"mensaje\":" +
                Json("uso: DolphinFormHost <ensamblado> <Clase> [--config <archivo>]") + "}");
            return 2;
        }
        string ruta = Path.GetFullPath(args[0]);
        if (AppDomain.CurrentDomain.IsDefaultAppDomain())
        {
            return EnDominioPropio(ruta, args);
        }
        return Abrir(ruta, args[1]);
    }

    // El formulario corre en un AppDomain cuya base es la carpeta del ensamblado: así resuelve sus
    // dependencias como la app real y lee su .config (cadenas de conexión, appSettings). Sin copia en
    // sombra: con ella, abrir un ensamblado de 50 MB tardaba 40 s en vez de 2 (el antivirus revisa cada
    // copia). A cambio, mientras la pestaña está abierta los .dll del build quedan en uso.
    static int EnDominioPropio(string ruta, string[] args)
    {
        if (!File.Exists(ruta))
        {
            Error("sin-ensamblado", "No existe el ensamblado " + ruta, "");
            return 1;
        }
        SetProcessDPIAware();
        ventanaPrevia = GetForegroundWindow();
        string carpeta = Path.GetDirectoryName(ruta);
        var setup = new AppDomainSetup();
        setup.ApplicationBase = carpeta;
        setup.ApplicationName = "DolphinFormHost";
        string config = ArgumentoConfig(args);
        if (config != null && File.Exists(config))
        {
            setup.ConfigurationFile = config;
        }
        AppDomain dominio = AppDomain.CreateDomain("formulario", null, setup);
        dominio.SetData("dolphin.ventanaPrevia", ventanaPrevia.ToInt64());
        try
        {
            return dominio.ExecuteAssembly(Assembly.GetExecutingAssembly().Location, args);
        }
        catch (Exception ex)
        {
            Error("dominio", Raiz(ex).Message, Raiz(ex).ToString());
            return 1;
        }
    }

    static string ArgumentoConfig(string[] args)
    {
        for (int i = 2; i < args.Length - 1; i++)
        {
            if (args[i] == "--config")
            {
                return args[i + 1];
            }
        }
        return null;
    }

    static int Abrir(string ruta, string nombreTipo)
    {
        object previa = AppDomain.CurrentDomain.GetData("dolphin.ventanaPrevia");
        if (previa is long)
        {
            ventanaPrevia = new IntPtr((long)previa);
        }
        string carpeta = Path.GetDirectoryName(ruta);
        AppDomain.CurrentDomain.AssemblyResolve += delegate (object s, ResolveEventArgs e)
        {
            string nombre = new AssemblyName(e.Name).Name;
            foreach (string ext in new[] { ".dll", ".exe" })
            {
                string candidato = Path.Combine(carpeta, nombre + ext);
                if (File.Exists(candidato))
                {
                    return Assembly.LoadFrom(candidato);
                }
            }
            return null;
        };
        AppDomain.CurrentDomain.UnhandledException += delegate (object s, UnhandledExceptionEventArgs e)
        {
            Exception ex = e.ExceptionObject as Exception;
            Error("excepcion", ex != null ? Raiz(ex).Message : "Excepción no controlada", ex != null ? Raiz(ex).ToString() : "");
        };
        Directory.SetCurrentDirectory(carpeta);
        Application.EnableVisualStyles();
        Application.SetCompatibleTextRenderingDefault(false);
        Application.SetUnhandledExceptionMode(UnhandledExceptionMode.CatchException);
        Application.ThreadException += delegate (object s, ThreadExceptionEventArgs e)
        {
            Exception raiz = Raiz(e.Exception);
            Emitir("{\"evento\":\"aviso\",\"mensaje\":" + Json(raiz.GetType().Name + ": " + raiz.Message) +
                ",\"detalle\":" + Json(raiz.ToString()) + "}");
        };
        var vigia = new System.Threading.Timer(delegate { VigilarDialogos(); }, null, 700, 700);

        // Las órdenes se escuchan desde el principio: un constructor puede quedar esperando un diálogo
        // modal, y «cerrar-dialogos» o «cerrar» tienen que llegar igual.
        var lector = new Thread(LeerOrdenes);
        lector.IsBackground = true;
        lector.Start();
        Fase("cargando-ensamblado");
        Assembly asm;
        try
        {
            asm = CargarEnsamblado(ruta);
        }
        catch (BadImageFormatException ex)
        {
            // COR_E_ASSEMBLYEXPECTED: el archivo no es .NET (un lanzador nativo, un instalador...).
            if (ex.HResult == unchecked((int)0x80131018))
            {
                Error("no-es-net", Path.GetFileName(ruta) + " no es un ensamblado .NET.", ex.ToString());
                return 1;
            }
            Error("arquitectura", "El ensamblado no se puede cargar en un proceso de " + Arquitectura() + ".", ex.ToString());
            return 3;
        }
        catch (Exception ex)
        {
            Error("ensamblado", Raiz(ex).Message, Raiz(ex).ToString());
            return 1;
        }

        Type tipo;
        try
        {
            tipo = BuscarTipo(asm, nombreTipo);
        }
        catch (Exception ex)
        {
            Error("dependencia", Raiz(ex).Message, Raiz(ex).ToString());
            return 1;
        }
        if (tipo == null)
        {
            Error("tipo-no-encontrado", "No hay una clase " + nombreTipo + " en " + Path.GetFileName(ruta) + ".", "");
            return 1;
        }
        if (!typeof(Control).IsAssignableFrom(tipo))
        {
            Error("no-es-formulario", tipo.FullName + " no es un formulario ni un control de WinForms.", "");
            return 1;
        }
        if (tipo.IsAbstract || tipo.GetConstructor(Type.EmptyTypes) == null)
        {
            Error("sin-constructor", tipo.FullName + " no tiene un constructor público sin parámetros.", "");
            return 1;
        }

        PrepararDevExpress();
        Fase("creando-formulario");
        try
        {
            object instancia = Activator.CreateInstance(tipo);
            formulario = instancia as Form ?? EnvolverControl((Control)instancia);
        }
        catch (Exception ex)
        {
            Exception raiz = Raiz(ex);
            Error("constructor", raiz.GetType().Name + ": " + raiz.Message, raiz.ToString());
            return 1;
        }

        Fase("mostrando");
        PrepararFueraDePantalla(formulario);
        // Se transmite apenas el formulario se hace visible, antes de su propio Shown: muchos
        // formularios cargan datos en Shown (con DoEvents), y el nuestro correría después.
        bool transmitiendo = false;
        EventHandler empezar = delegate
        {
            if (transmitiendo || !formulario.Visible)
            {
                return;
            }
            transmitiendo = true;
            DevolverFoco();
            Emitir("{\"evento\":\"listo\",\"pid\":" + System.Diagnostics.Process.GetCurrentProcess().Id +
                ",\"titulo\":" + Json(formulario.Text) + ",\"clase\":" + Json(tipo.FullName) +
                ",\"arquitectura\":\"" + Arquitectura() + "\",\"clr\":" + Json(Environment.Version.ToString()) + "}");
            var reloj = new System.Windows.Forms.Timer();
            reloj.Interval = 400;
            reloj.Tick += delegate { Transmitir(false); };
            reloj.Start();
            // El primer cuadro cuando el formulario ya pintó una vez.
            formulario.BeginInvoke((MethodInvoker)delegate { Transmitir(true); });
        };
        formulario.VisibleChanged += empezar;
        formulario.Shown += empezar;
        formulario.FormClosed += delegate
        {
            Emitir("{\"evento\":\"cerrado\"}");
        };
        try
        {
            Application.Run(formulario);
        }
        catch (Exception ex)
        {
            Exception raiz = Raiz(ex);
            Error("excepcion", raiz.GetType().Name + ": " + raiz.Message, raiz.ToString());
            return 1;
        }
        vigia.Dispose();
        return 0;
    }

    static Assembly CargarEnsamblado(string ruta)
    {
        // Por nombre, como lo cargaría la app desde su carpeta; si el nombre no resuelve, por ruta.
        try
        {
            return Assembly.Load(AssemblyName.GetAssemblyName(ruta));
        }
        catch (BadImageFormatException)
        {
            throw;
        }
        catch (FileNotFoundException)
        {
            return Assembly.LoadFrom(ruta);
        }
        catch (FileLoadException)
        {
            return Assembly.LoadFrom(ruta);
        }
    }

    static Type BuscarTipo(Assembly asm, string nombre)
    {
        // Con el nombre completo falla rápido y con la dependencia que falta; recorrer GetTypes() de un
        // ensamblado de 50 MB tarda decenas de segundos, así que queda sólo para el nombre corto.
        if (nombre.Contains("."))
        {
            try
            {
                Type directo = asm.GetType(nombre, true);
                if (directo != null)
                {
                    return directo;
                }
            }
            catch (TypeLoadException ex)
            {
                if (ex.TypeName != nombre)
                {
                    throw;
                }
                // La clase no está en este build (más nuevo que el build, o es de otro ensamblado).
                return null;
            }
        }
        Type[] tipos;
        Exception primerFallo = null;
        try
        {
            tipos = asm.GetTypes();
        }
        catch (ReflectionTypeLoadException ex)
        {
            tipos = ex.Types;
            if (ex.LoaderExceptions.Length > 0)
            {
                primerFallo = ex.LoaderExceptions[0];
            }
        }
        string corto = nombre.Contains(".") ? nombre.Substring(nombre.LastIndexOf('.') + 1) : nombre;
        foreach (Type t in tipos)
        {
            if (t != null && (t.FullName == nombre || t.Name == corto) && typeof(Control).IsAssignableFrom(t))
            {
                return t;
            }
        }
        if (primerFallo != null)
        {
            throw new TypeLoadException("No se pudo cargar " + nombre + ": falta una dependencia. " + primerFallo.Message, primerFallo);
        }
        return null;
    }

    // Un UserControl también se puede mirar: se lo pone en un formulario de su mismo tamaño.
    static Form EnvolverControl(Control control)
    {
        var marco = new Form();
        marco.Text = control.GetType().Name;
        marco.ClientSize = control.Size.IsEmpty ? new Size(640, 480) : control.Size;
        control.Dock = DockStyle.Fill;
        marco.Controls.Add(control);
        return marco;
    }

    // DevExpress pinta los bordes y skins de sus formularios sólo si la app lo habilitó en su Main,
    // que acá no corre. Es lo mínimo para que se vea como en la app; si no hay DevExpress, no hace nada.
    static void PrepararDevExpress()
    {
        foreach (Assembly a in AppDomain.CurrentDomain.GetAssemblies())
        {
            string nombre = a.GetName().Name;
            if (nombre.StartsWith("DevExpress.Utils.v", StringComparison.Ordinal) && !nombre.EndsWith(".UI", StringComparison.Ordinal))
            {
                try
                {
                    Type skins = a.GetType("DevExpress.Skins.SkinManager", false);
                    if (skins != null)
                    {
                        MethodInfo habilitar = skins.GetMethod("EnableFormSkins", Type.EmptyTypes);
                        if (habilitar != null)
                        {
                            habilitar.Invoke(null, null);
                        }
                    }
                }
                catch (Exception)
                {
                    // Best effort: sin skins el formulario igual se ve, con el borde de Windows.
                }
                return;
            }
        }
    }

    // El formulario real vive fuera de todas las pantallas: PrintWindow lo dibuja igual (DWM mantiene
    // su superficie), no lo tapa ninguna ventana, el usuario no lo ve ni lo clickea por error.
    static void PrepararFueraDePantalla(Form f)
    {
        f.StartPosition = FormStartPosition.Manual;
        f.WindowState = FormWindowState.Normal;
        f.ShowInTaskbar = false;
        f.TopMost = false;
        f.Location = PuntoFuera(f);
        f.HandleCreated += delegate
        {
            int estilo = GetWindowLong(f.Handle, GWL_EXSTYLE);
            SetWindowLong(f.Handle, GWL_EXSTYLE, estilo | WS_EX_NOACTIVATE);
        };
        f.LocationChanged += delegate
        {
            if (reubicando)
            {
                return;
            }
            Point destino = PuntoFuera(f);
            if (f.Location != destino)
            {
                reubicando = true;
                f.Location = destino;
                reubicando = false;
            }
        };
        f.Resize += delegate
        {
            if (f.WindowState != FormWindowState.Normal)
            {
                f.WindowState = FormWindowState.Normal;
            }
        };
    }

    static Point PuntoFuera(Form f)
    {
        Rectangle virtualScreen = SystemInformation.VirtualScreen;
        return new Point(virtualScreen.Left - Math.Max(f.Width, 200) - 400, virtualScreen.Top);
    }

    static void DevolverFoco()
    {
        if (ventanaPrevia != IntPtr.Zero && GetForegroundWindow() == formulario.Handle)
        {
            SetForegroundWindow(ventanaPrevia);
        }
    }

    static void Transmitir(bool forzar)
    {
        if (formulario == null || formulario.IsDisposed)
        {
            return;
        }
        Rectangle marco = MarcoVisible(formulario.Handle);
        try
        {
            using (Bitmap cuadro = Capturar(formulario.Handle, marco))
            {
                long huella = Huella(cuadro);
                if (forzar || huella != ultimaHuella)
                {
                    ultimaHuella = huella;
                    using (var ms = new MemoryStream())
                    {
                        cuadro.Save(ms, ImageFormat.Png);
                        Emitir("{\"evento\":\"cuadro\",\"ancho\":" + cuadro.Width + ",\"alto\":" + cuadro.Height +
                            ",\"titulo\":" + Json(formulario.Text) + ",\"png\":\"" + Convert.ToBase64String(ms.ToArray()) + "\"}");
                    }
                }
            }
        }
        catch (Exception ex)
        {
            Emitir("{\"evento\":\"aviso\",\"mensaje\":" + Json("No se pudo capturar el formulario: " + ex.Message) + "}");
        }
        string mapa = MapaDeControles(formulario, marco);
        if (forzar || mapa != ultimoMapa)
        {
            ultimoMapa = mapa;
            Emitir("{\"evento\":\"controles\",\"ancho\":" + marco.Width + ",\"alto\":" + marco.Height + ",\"controles\":" + mapa + "}");
        }
    }

    // El rectángulo que se ve de la ventana: sin los bordes invisibles de redimensionado de Windows 10+.
    static Rectangle MarcoVisible(IntPtr hwnd)
    {
        RECT r;
        if (DwmGetWindowAttribute(hwnd, DWMWA_EXTENDED_FRAME_BOUNDS, out r, Marshal.SizeOf(typeof(RECT))) == 0 && r.Right > r.Left)
        {
            return Rectangle.FromLTRB(r.Left, r.Top, r.Right, r.Bottom);
        }
        GetWindowRect(hwnd, out r);
        return Rectangle.FromLTRB(r.Left, r.Top, r.Right, r.Bottom);
    }

    static Bitmap Capturar(IntPtr hwnd, Rectangle marco)
    {
        RECT ventana;
        GetWindowRect(hwnd, out ventana);
        int ancho = Math.Max(1, ventana.Right - ventana.Left);
        int alto = Math.Max(1, ventana.Bottom - ventana.Top);
        using (var completo = new Bitmap(ancho, alto, PixelFormat.Format32bppArgb))
        {
            using (Graphics g = Graphics.FromImage(completo))
            {
                IntPtr hdc = g.GetHdc();
                try
                {
                    if (!PrintWindow(hwnd, hdc, PW_RENDERFULLCONTENT))
                    {
                        PrintWindow(hwnd, hdc, 0);
                    }
                }
                finally
                {
                    g.ReleaseHdc(hdc);
                }
            }
            var recorte = new Rectangle(marco.Left - ventana.Left, marco.Top - ventana.Top, marco.Width, marco.Height);
            recorte.Intersect(new Rectangle(0, 0, ancho, alto));
            if (recorte.Width <= 0 || recorte.Height <= 0)
            {
                recorte = new Rectangle(0, 0, ancho, alto);
            }
            return completo.Clone(recorte, PixelFormat.Format32bppArgb);
        }
    }

    static long Huella(Bitmap b)
    {
        BitmapData datos = b.LockBits(new Rectangle(0, 0, b.Width, b.Height), ImageLockMode.ReadOnly, PixelFormat.Format32bppArgb);
        try
        {
            int largo = datos.Stride * datos.Height;
            byte[] bytes = new byte[largo];
            Marshal.Copy(datos.Scan0, bytes, 0, largo);
            unchecked
            {
                long h = (long)14695981039346656037UL;
                for (int i = 0; i < largo; i += 4)
                {
                    h = (h ^ BitConverter.ToInt32(bytes, i)) * 1099511628211L;
                }
                return h ^ b.Width ^ ((long)b.Height << 32);
            }
        }
        finally
        {
            b.UnlockBits(datos);
        }
    }

    // Un control por objeto, con coordenadas relativas al marco visible del formulario (las del PNG).
    static string MapaDeControles(Form f, Rectangle marco)
    {
        var sb = new StringBuilder("[");
        int siguiente = 0;
        Volcar(f, -1, 0, marco, sb, ref siguiente);
        sb.Append("]");
        return sb.ToString();
    }

    static void Volcar(Control padre, int idPadre, int nivel, Rectangle marco, StringBuilder sb, ref int siguiente)
    {
        foreach (Control c in padre.Controls)
        {
            if (!c.Visible)
            {
                continue;
            }
            Rectangle b = padre.RectangleToScreen(c.Bounds);
            int id = siguiente++;
            if (sb.Length > 1)
            {
                sb.Append(',');
            }
            string texto = "";
            try
            {
                texto = c.Text ?? "";
            }
            catch (Exception)
            {
                texto = "";
            }
            if (texto.Length > 80)
            {
                texto = texto.Substring(0, 80);
            }
            sb.Append("{\"id\":").Append(id)
                .Append(",\"padre\":").Append(idPadre)
                .Append(",\"nivel\":").Append(nivel)
                .Append(",\"nombre\":").Append(Json(c.Name ?? ""))
                .Append(",\"tipo\":").Append(Json(c.GetType().FullName))
                .Append(",\"texto\":").Append(Json(texto))
                .Append(",\"x\":").Append(b.X - marco.Left)
                .Append(",\"y\":").Append(b.Y - marco.Top)
                .Append(",\"w\":").Append(b.Width)
                .Append(",\"h\":").Append(b.Height)
                .Append('}');
            Volcar(c, id, nivel + 1, marco, sb, ref siguiente);
        }
    }

    static void LeerOrdenes()
    {
        string linea;
        while ((linea = Console.In.ReadLine()) != null)
        {
            string orden = linea.Trim();
            if (formulario == null || !formulario.IsHandleCreated)
            {
                if (orden == "cerrar")
                {
                    Environment.Exit(0);
                }
                if (orden == "cerrar-dialogos")
                {
                    CerrarDialogos();
                }
                continue;
            }
            if (orden == "refrescar")
            {
                formulario.BeginInvoke((MethodInvoker)delegate { Transmitir(true); });
            }
            else if (orden == "cerrar-dialogos")
            {
                CerrarDialogos();
            }
            else if (orden == "cerrar")
            {
                formulario.BeginInvoke((MethodInvoker)delegate { Environment.Exit(0); });
            }
        }
        // Dolphin cerró la tubería: el host no debe quedar huérfano.
        Environment.Exit(0);
    }

    // Un MessageBox o el diálogo de error propio de la app (desde el constructor, el Load...) aparecería
    // en el medio de la pantalla del usuario. Toda ventana del host que caiga en pantalla se manda afuera,
    // y la que tiene título (un diálogo, no un WaitForm sin texto) se le cuenta a Dolphin con sus textos.
    static void VigilarDialogos()
    {
        uint pid = (uint)System.Diagnostics.Process.GetCurrentProcess().Id;
        IntPtr propio = formulario != null && formulario.IsHandleCreated ? formulario.Handle : IntPtr.Zero;
        Rectangle vs = SystemInformation.VirtualScreen;
        EnumWindows(delegate (IntPtr hwnd, IntPtr l)
        {
            uint duenio;
            GetWindowThreadProcessId(hwnd, out duenio);
            if (duenio != pid || hwnd == propio || !IsWindowVisible(hwnd))
            {
                return true;
            }
            RECT r;
            GetWindowRect(hwnd, out r);
            if (!Rectangle.FromLTRB(r.Left, r.Top, r.Right, r.Bottom).IntersectsWith(vs))
            {
                return true;
            }
            SetWindowPos(hwnd, IntPtr.Zero, vs.Left - (r.Right - r.Left) - 400, vs.Top + 800, 0, 0, SWP_NOSIZE | SWP_NOZORDER | SWP_NOACTIVATE);
            string titulo = TextoDe(hwnd);
            lock (Cerrojo)
            {
                if (titulo.Length == 0 || dialogosVistos.Contains(hwnd.ToInt64()))
                {
                    return true;
                }
                dialogosVistos.Add(hwnd.ToInt64());
            }
            var textos = new List<string>();
            EnumChildWindows(hwnd, delegate (IntPtr hijo, IntPtr l2)
            {
                string t = TextoDe(hijo).Trim();
                if (t.Length > 0 && !textos.Contains(t) && textos.Count < 8)
                {
                    textos.Add(t.Length > 300 ? t.Substring(0, 300) : t);
                }
                return true;
            }, IntPtr.Zero);
            Emitir("{\"evento\":\"dialogo\",\"titulo\":" + Json(titulo) + ",\"texto\":" + Json(string.Join("\n", textos.ToArray())) + "}");
            return true;
        }, IntPtr.Zero);
    }

    // Cerrar un diálogo como lo haría la persona: con su botón de cerrar o aceptar. Muchos diálogos
    // propios (formularios de error de la app) ignoran WM_CLOSE, y sus botones de DevExpress no son
    // botones de Win32: se les manda un clic de mouse en el centro.
    static readonly string[] BotonesDeCierre = { "cerrar", "aceptar", "ok", "cancelar", "close", "cancel", "no", "salir" };

    static void CerrarDialogos()
    {
        long[] dialogos;
        lock (Cerrojo)
        {
            dialogos = new long[dialogosVistos.Count];
            dialogosVistos.CopyTo(dialogos);
            dialogosVistos.Clear();
        }
        foreach (long h in dialogos)
        {
            IntPtr dialogo = new IntPtr(h);
            IntPtr boton = IntPtr.Zero;
            EnumChildWindows(dialogo, delegate (IntPtr hijo, IntPtr l)
            {
                string t = TextoDe(hijo).Replace("&", "").Trim().ToLowerInvariant();
                if (Array.IndexOf(BotonesDeCierre, t) >= 0 && IsWindowVisible(hijo))
                {
                    boton = hijo;
                    return false;
                }
                return true;
            }, IntPtr.Zero);
            if (boton != IntPtr.Zero)
            {
                RECT r;
                GetClientRect(boton, out r);
                IntPtr centro = new IntPtr(((r.Bottom / 2) << 16) | (r.Right / 2 & 0xFFFF));
                PostMessage(boton, WM_LBUTTONDOWN, new IntPtr(1), centro);
                PostMessage(boton, WM_LBUTTONUP, IntPtr.Zero, centro);
            }
            else
            {
                PostMessage(dialogo, WM_CLOSE, IntPtr.Zero, IntPtr.Zero);
            }
        }
    }

    static string TextoDe(IntPtr hwnd)
    {
        int largo = GetWindowTextLength(hwnd);
        var sb = new StringBuilder(largo + 1);
        GetWindowText(hwnd, sb, sb.Capacity);
        return sb.ToString();
    }

    static Exception Raiz(Exception ex)
    {
        while ((ex is TargetInvocationException || ex is TypeInitializationException) && ex.InnerException != null)
        {
            ex = ex.InnerException;
        }
        return ex;
    }

    static string Arquitectura()
    {
        return IntPtr.Size == 8 ? "x64" : "x86";
    }

    static void Fase(string fase)
    {
        Emitir("{\"evento\":\"fase\",\"fase\":\"" + fase + "\"}");
    }

    static void Error(string codigo, string mensaje, string detalle)
    {
        Emitir("{\"evento\":\"error\",\"codigo\":\"" + codigo + "\",\"mensaje\":" + Json(mensaje) + ",\"detalle\":" + Json(detalle) + "}");
    }

    static void Emitir(string linea)
    {
        lock (Cerrojo)
        {
            Console.Out.WriteLine(linea);
            Console.Out.Flush();
        }
    }

    static string Json(string s)
    {
        if (s == null)
        {
            return "null";
        }
        var sb = new StringBuilder(s.Length + 2);
        sb.Append('"');
        foreach (char c in s)
        {
            switch (c)
            {
                case '"': sb.Append("\\\""); break;
                case '\\': sb.Append("\\\\"); break;
                case '\n': sb.Append("\\n"); break;
                case '\r': sb.Append("\\r"); break;
                case '\t': sb.Append("\\t"); break;
                default:
                    if (c < 0x20)
                    {
                        sb.Append("\\u").Append(((int)c).ToString("x4", CultureInfo.InvariantCulture));
                    }
                    else
                    {
                        sb.Append(c);
                    }
                    break;
            }
        }
        sb.Append('"');
        return sb.ToString();
    }

    const int GWL_EXSTYLE = -20;
    const int WS_EX_NOACTIVATE = 0x08000000;
    const uint PW_RENDERFULLCONTENT = 2;
    const int DWMWA_EXTENDED_FRAME_BOUNDS = 9;
    const uint SWP_NOSIZE = 0x1;
    const uint SWP_NOZORDER = 0x4;
    const uint SWP_NOACTIVATE = 0x10;
    const uint WM_CLOSE = 0x10;
    const uint WM_LBUTTONDOWN = 0x201;
    const uint WM_LBUTTONUP = 0x202;

    [StructLayout(LayoutKind.Sequential)]
    struct RECT { public int Left, Top, Right, Bottom; }

    delegate bool EnumProc(IntPtr hwnd, IntPtr lParam);

    [DllImport("user32.dll")] static extern bool SetProcessDPIAware();
    [DllImport("user32.dll")] static extern IntPtr GetForegroundWindow();
    [DllImport("user32.dll")] static extern bool SetForegroundWindow(IntPtr hwnd);
    [DllImport("user32.dll")] static extern int GetWindowLong(IntPtr hwnd, int index);
    [DllImport("user32.dll")] static extern int SetWindowLong(IntPtr hwnd, int index, int value);
    [DllImport("user32.dll")] static extern bool GetWindowRect(IntPtr hwnd, out RECT rect);
    [DllImport("user32.dll")] static extern bool GetClientRect(IntPtr hwnd, out RECT rect);
    [DllImport("user32.dll")] static extern bool PrintWindow(IntPtr hwnd, IntPtr hdc, uint flags);
    [DllImport("dwmapi.dll")] static extern int DwmGetWindowAttribute(IntPtr hwnd, int attr, out RECT value, int size);
    [DllImport("user32.dll")] static extern bool EnumWindows(EnumProc proc, IntPtr lParam);
    [DllImport("user32.dll")] static extern bool EnumChildWindows(IntPtr parent, EnumProc proc, IntPtr lParam);
    [DllImport("user32.dll")] static extern uint GetWindowThreadProcessId(IntPtr hwnd, out uint pid);
    [DllImport("user32.dll")] static extern bool IsWindowVisible(IntPtr hwnd);
    [DllImport("user32.dll", CharSet = CharSet.Unicode)] static extern int GetClassName(IntPtr hwnd, StringBuilder name, int max);
    [DllImport("user32.dll", CharSet = CharSet.Unicode)] static extern int GetWindowText(IntPtr hwnd, StringBuilder text, int max);
    [DllImport("user32.dll")] static extern int GetWindowTextLength(IntPtr hwnd);
    [DllImport("user32.dll")] static extern bool SetWindowPos(IntPtr hwnd, IntPtr after, int x, int y, int cx, int cy, uint flags);
    [DllImport("user32.dll")] static extern bool PostMessage(IntPtr hwnd, uint msg, IntPtr w, IntPtr l);
}
