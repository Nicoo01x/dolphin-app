# Dolphin X-ray (Windows): dice qué control de cualquier app está debajo del mouse.
#
# Modo normal: instala un gancho de mouse de bajo nivel. Cada movimiento sale como una línea JSON
# {"type":"hover",...} con el control de UI Automation que hay en ese punto; un clic izquierdo NO
# llega a la app: se lo come el gancho y sale {"type":"pick",...} con un recorte de pantalla del
# control; un clic derecho sale {"type":"cancel"}. Por stdin se le manda "pause", "resume" o "stop".
#
# Modo -Probe X Y: describe el control en ese punto (coordenadas físicas), una sola vez, sin gancho.
# Sirve para probarlo sin mover el mouse de nadie.
param(
    [switch]$Probe,
    [int]$X = 0,
    [int]$Y = 0,
    [string]$CropDir = '',
    # El pid de Dolphin: un control suyo sale con own=true (el agente sabe que es la propia app).
    [int]$AppPid = 0
)

$ErrorActionPreference = 'Stop'

Add-Type -ReferencedAssemblies UIAutomationClient, UIAutomationTypes, WindowsBase, System.Windows.Forms, System.Drawing -TypeDefinition @'
using System;
using System.Collections.Generic;
using System.Diagnostics;
using System.Drawing;
using System.Drawing.Imaging;
using System.IO;
using System.Runtime.InteropServices;
using System.Text;
using System.Threading;
using System.Windows.Automation;
using System.Windows.Forms;

public static class DolphinXray
{
    [StructLayout(LayoutKind.Sequential)]
    private struct POINT { public int x; public int y; }

    [StructLayout(LayoutKind.Sequential)]
    private struct MSLLHOOKSTRUCT { public POINT pt; public uint mouseData; public uint flags; public uint time; public IntPtr extra; }

    private delegate IntPtr HookProc(int code, IntPtr wParam, IntPtr lParam);

    [DllImport("user32.dll")] private static extern IntPtr SetWindowsHookEx(int id, HookProc proc, IntPtr mod, uint thread);
    [DllImport("user32.dll")] private static extern bool UnhookWindowsHookEx(IntPtr hook);
    [DllImport("user32.dll")] private static extern IntPtr CallNextHookEx(IntPtr hook, int code, IntPtr wParam, IntPtr lParam);
    [DllImport("kernel32.dll")] private static extern IntPtr GetModuleHandle(string name);
    [DllImport("user32.dll")] private static extern bool SetProcessDpiAwarenessContext(IntPtr value);

    private const int WH_MOUSE_LL = 14;
    private const int WM_MOUSEMOVE = 0x0200;
    private const int WM_LBUTTONDOWN = 0x0201;
    private const int WM_LBUTTONUP = 0x0202;
    private const int WM_RBUTTONDOWN = 0x0204;
    private const int WM_RBUTTONUP = 0x0205;

    private static readonly object Gate = new object();
    private static HookProc hookProc;
    private static IntPtr hook = IntPtr.Zero;
    private static volatile bool paused;
    private static volatile bool stopping;
    private static int mouseX;
    private static int mouseY;
    private static bool moved;
    private static bool swallowNextLeftUp;
    private static bool swallowNextRightUp;
    private static readonly Queue<string> events = new Queue<string>();
    private static readonly AutoResetEvent wake = new AutoResetEvent(false);
    private static string cropDir = "";
    private static int ownPid;

    public static void EnablePerMonitorDpi()
    {
        // Why: con DPI por monitor, UI Automation y CopyFromScreen hablan en píxeles físicos, los
        // mismos que Electron convierte con screen.screenToDipRect.
        try { SetProcessDpiAwarenessContext(new IntPtr(-4)); } catch { }
    }

    public static string Probe(int x, int y, string dir, int appPid)
    {
        EnablePerMonitorDpi();
        ownPid = appPid;
        cropDir = dir;
        return Describe(x, y, "probe", !string.IsNullOrEmpty(dir));
    }

    public static void Run(string dir, int appPid)
    {
        EnablePerMonitorDpi();
        cropDir = dir;
        ownPid = appPid;
        Thread stdin = new Thread(ReadCommands);
        stdin.IsBackground = true;
        stdin.Start();
        Thread worker = new Thread(Work);
        worker.IsBackground = true;
        worker.Start();
        hookProc = OnMouse;
        hook = SetWindowsHookEx(WH_MOUSE_LL, hookProc, GetModuleHandle(null), 0);
        if (hook == IntPtr.Zero)
        {
            Emit("{\"type\":\"error\",\"message\":\"hook_failed\"}");
            return;
        }
        Emit("{\"type\":\"ready\"}");
        Application.Run();
        UnhookWindowsHookEx(hook);
    }

    private static void ReadCommands()
    {
        string line;
        while ((line = Console.In.ReadLine()) != null)
        {
            line = line.Trim();
            if (line == "pause") { paused = true; }
            else if (line == "resume") { paused = false; }
            else if (line == "stop") { break; }
        }
        // Why: si Dolphin se cierra, stdin se corta y el gancho no puede quedar comiéndose clics.
        stopping = true;
        wake.Set();
        Application.Exit();
    }

    private static IntPtr OnMouse(int code, IntPtr wParam, IntPtr lParam)
    {
        if (code < 0 || paused || stopping)
        {
            return CallNextHookEx(hook, code, wParam, lParam);
        }
        int message = wParam.ToInt32();
        MSLLHOOKSTRUCT info = (MSLLHOOKSTRUCT)Marshal.PtrToStructure(lParam, typeof(MSLLHOOKSTRUCT));
        // Why rápido: Windows saca un gancho que tarda más de ~300 ms. Acá solo se anota y se avisa.
        if (message == WM_MOUSEMOVE)
        {
            lock (Gate) { mouseX = info.pt.x; mouseY = info.pt.y; moved = true; }
            wake.Set();
            return CallNextHookEx(hook, code, wParam, lParam);
        }
        if (message == WM_LBUTTONDOWN)
        {
            lock (Gate) { events.Enqueue("pick:" + info.pt.x + ":" + info.pt.y); swallowNextLeftUp = true; }
            wake.Set();
            return new IntPtr(1);
        }
        if (message == WM_LBUTTONUP && swallowNextLeftUp)
        {
            swallowNextLeftUp = false;
            return new IntPtr(1);
        }
        if (message == WM_RBUTTONDOWN)
        {
            lock (Gate) { events.Enqueue("cancel"); swallowNextRightUp = true; }
            wake.Set();
            return new IntPtr(1);
        }
        if (message == WM_RBUTTONUP && swallowNextRightUp)
        {
            swallowNextRightUp = false;
            return new IntPtr(1);
        }
        return CallNextHookEx(hook, code, wParam, lParam);
    }

    private static void Work()
    {
        int lastX = int.MinValue;
        int lastY = int.MinValue;
        while (!stopping)
        {
            wake.WaitOne(60);
            string next = null;
            int x = 0;
            int y = 0;
            bool hover = false;
            lock (Gate)
            {
                if (events.Count > 0) { next = events.Dequeue(); }
                else if (moved) { moved = false; x = mouseX; y = mouseY; hover = true; }
            }
            if (next == "cancel")
            {
                Emit("{\"type\":\"cancel\"}");
                continue;
            }
            if (next != null && next.StartsWith("pick:"))
            {
                string[] parts = next.Split(':');
                Emit(Describe(int.Parse(parts[1]), int.Parse(parts[2]), "pick", true));
                continue;
            }
            if (hover && (x != lastX || y != lastY))
            {
                lastX = x;
                lastY = y;
                Emit(Describe(x, y, "hover", false));
            }
        }
    }

    private static void Emit(string json)
    {
        lock (Console.Out)
        {
            Console.Out.WriteLine(json);
            Console.Out.Flush();
        }
    }

    public static string Describe(int x, int y, string type, bool withCrop)
    {
        StringBuilder json = new StringBuilder();
        json.Append("{\"type\":").Append(Quote(type));
        json.Append(",\"point\":{\"x\":").Append(x).Append(",\"y\":").Append(y).Append("}");
        AutomationElement element = null;
        try { element = AutomationElement.FromPoint(new System.Windows.Point(x, y)); } catch { }
        if (element == null)
        {
            json.Append(",\"element\":null");
            if (withCrop) { AppendCrop(json, new Rectangle(x - 60, y - 40, 120, 80)); }
            return json.Append("}").ToString();
        }
        Rectangle rect = Rectangle.Empty;
        try
        {
            System.Windows.Rect r = element.Current.BoundingRectangle;
            if (!r.IsEmpty) { rect = new Rectangle((int)r.X, (int)r.Y, (int)r.Width, (int)r.Height); }
        }
        catch { }
        int pid = 0;
        try { pid = element.Current.ProcessId; } catch { }
        json.Append(",\"element\":{");
        json.Append("\"name\":").Append(Quote(Safe(delegate { return element.Current.Name; })));
        json.Append(",\"role\":").Append(Quote(Role(element)));
        json.Append(",\"localizedRole\":").Append(Quote(Safe(delegate { return element.Current.LocalizedControlType; })));
        json.Append(",\"automationId\":").Append(Quote(Safe(delegate { return element.Current.AutomationId; })));
        json.Append(",\"className\":").Append(Quote(Safe(delegate { return element.Current.ClassName; })));
        json.Append(",\"helpText\":").Append(Quote(Safe(delegate { return element.Current.HelpText; })));
        json.Append(",\"value\":").Append(Quote(ValueOf(element)));
        json.Append(",\"enabled\":").Append(Safe(delegate { return element.Current.IsEnabled ? "true" : "false"; }) == "false" ? "false" : "true");
        json.Append(",\"rect\":{\"x\":").Append(rect.X).Append(",\"y\":").Append(rect.Y)
            .Append(",\"width\":").Append(rect.Width).Append(",\"height\":").Append(rect.Height).Append("}");
        json.Append(",\"path\":").Append(PathOf(element));
        json.Append("}");
        AppendApp(json, pid, element);
        if (withCrop)
        {
            Rectangle area = rect.IsEmpty ? new Rectangle(x - 60, y - 40, 120, 80) : rect;
            AppendCrop(json, area);
        }
        return json.Append("}").ToString();
    }

    private delegate string Getter();

    private static string Safe(Getter getter)
    {
        try
        {
            string value = getter();
            return value ?? "";
        }
        catch { return ""; }
    }

    private static string Role(AutomationElement element)
    {
        string name = Safe(delegate { return element.Current.ControlType.ProgrammaticName; });
        return name.StartsWith("ControlType.") ? name.Substring("ControlType.".Length) : name;
    }

    private static string ValueOf(AutomationElement element)
    {
        // Why: un campo de contraseña nunca sale, ni siquiera a Dolphin.
        if (Safe(delegate { return element.Current.IsPassword ? "1" : "0"; }) == "1") { return ""; }
        object pattern;
        if (!element.TryGetCurrentPattern(ValuePattern.Pattern, out pattern)) { return ""; }
        string value = Safe(delegate { return ((ValuePattern)pattern).Current.Value; });
        return value.Length > 200 ? value.Substring(0, 200) + "…" : value;
    }

    private static string PathOf(AutomationElement element)
    {
        // Los ancestros con nombre, de la ventana hacia el control (sin el control mismo).
        List<string> names = new List<string>();
        TreeWalker walker = TreeWalker.ControlViewWalker;
        AutomationElement current = null;
        try { current = walker.GetParent(element); } catch { }
        int guard = 0;
        while (current != null && guard < 12 && !Automation.Compare(current, AutomationElement.RootElement))
        {
            string name = Safe(delegate { return current.Current.Name; });
            if (name.Length > 0 && name.Length <= 80) { names.Insert(0, name); }
            try { current = walker.GetParent(current); } catch { current = null; }
            guard++;
        }
        StringBuilder json = new StringBuilder("[");
        for (int i = 0; i < names.Count; i++)
        {
            if (i > 0) { json.Append(","); }
            json.Append(Quote(names[i]));
        }
        return json.Append("]").ToString();
    }

    private static void AppendApp(StringBuilder json, int pid, AutomationElement element)
    {
        string process = "";
        string title = "";
        try
        {
            Process owner = Process.GetProcessById(pid);
            process = owner.ProcessName;
            title = owner.MainWindowTitle;
        }
        catch { }
        // La ventana de arriba de todo del control dice más que el título principal del proceso.
        try
        {
            TreeWalker walker = TreeWalker.ControlViewWalker;
            AutomationElement current = element;
            AutomationElement parent = walker.GetParent(current);
            int guard = 0;
            while (parent != null && !Automation.Compare(parent, AutomationElement.RootElement) && guard < 40)
            {
                current = parent;
                parent = walker.GetParent(current);
                guard++;
            }
            string top = Safe(delegate { return current.Current.Name; });
            if (top.Length > 0) { title = top; }
        }
        catch { }
        json.Append(",\"app\":{\"pid\":").Append(pid)
            .Append(",\"process\":").Append(Quote(process))
            .Append(",\"window\":").Append(Quote(title))
            .Append(",\"own\":").Append(pid != 0 && pid == ownPid ? "true" : "false")
            .Append("}");
    }

    private static void AppendCrop(StringBuilder json, Rectangle area)
    {
        string path = "";
        try
        {
            // Con contexto alrededor: un botón solo, sin lo que lo rodea, no dice dónde está.
            int margin = Math.Max(40, Math.Max(area.Width, area.Height) / 3);
            Rectangle screen = SystemInformation.VirtualScreen;
            Rectangle crop = Rectangle.Intersect(Rectangle.Inflate(area, margin, margin), screen);
            if (crop.Width > 1600) { crop.Width = 1600; }
            if (crop.Height > 1200) { crop.Height = 1200; }
            if (crop.Width > 0 && crop.Height > 0 && cropDir.Length > 0)
            {
                Directory.CreateDirectory(cropDir);
                path = Path.Combine(cropDir, "xray-" + DateTime.Now.ToString("yyyyMMdd-HHmmss-fff") + ".png");
                using (Bitmap bitmap = new Bitmap(crop.Width, crop.Height))
                {
                    using (Graphics graphics = Graphics.FromImage(bitmap))
                    {
                        graphics.CopyFromScreen(crop.Location, Point.Empty, crop.Size);
                    }
                    bitmap.Save(path, ImageFormat.Png);
                }
            }
        }
        catch { path = ""; }
        json.Append(",\"crop\":").Append(Quote(path));
    }

    public static string Quote(string value)
    {
        if (value == null) { return "\"\""; }
        StringBuilder text = new StringBuilder("\"");
        foreach (char c in value)
        {
            if (c == '"') { text.Append("\\\""); }
            else if (c == '\\') { text.Append("\\\\"); }
            else if (c < 0x20) { text.Append("\\u").Append(((int)c).ToString("x4")); }
            else { text.Append(c); }
        }
        return text.Append("\"").ToString();
    }
}
'@

[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
if ($CropDir -eq '') {
    $CropDir = Join-Path ([System.IO.Path]::GetTempPath()) 'dolphin-xray'
}
if ($Probe) {
    [Console]::Out.WriteLine([DolphinXray]::Probe($X, $Y, $CropDir, $AppPid))
    exit 0
}
[DolphinXray]::Run($CropDir, $AppPid)
