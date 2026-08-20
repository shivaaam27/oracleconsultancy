using System.Diagnostics;
using System.Runtime.InteropServices;
using System.Threading;
using System.Windows;

// WinForms (referenced for the tray icon) also defines Application.
using Application = System.Windows.Application;

namespace OracleConsultancy;

public partial class App : Application
{
    /// <summary>
    /// One window, always. A second launch brings the open one to the front
    /// rather than starting a second copy with its own cookie store — which
    /// would look like being signed out.
    /// </summary>
    private static Mutex? _single;

    protected override void OnStartup(StartupEventArgs e)
    {
        _single = new Mutex(initiallyOwned: true, name: @"Local\OracleConsultancy.SingleInstance", out bool isFirst);
        if (!isFirst)
        {
            FocusExistingWindow();
            Shutdown();
            return;
        }

        base.OnStartup(e);
    }

    private static void FocusExistingWindow()
    {
        try
        {
            var me = Process.GetCurrentProcess();
            foreach (var p in Process.GetProcessesByName(me.ProcessName))
            {
                if (p.Id == me.Id || p.MainWindowHandle == IntPtr.Zero) continue;
                if (IsIconic(p.MainWindowHandle)) ShowWindow(p.MainWindowHandle, SW_RESTORE);
                SetForegroundWindow(p.MainWindowHandle);
                return;
            }
        }
        catch
        {
            // Failing to focus the other window is not worth an error dialog —
            // the user simply clicks the taskbar instead.
        }
    }

    private const int SW_RESTORE = 9;

    [DllImport("user32.dll")]
    private static extern bool SetForegroundWindow(IntPtr hWnd);

    [DllImport("user32.dll")]
    private static extern bool ShowWindow(IntPtr hWnd, int nCmdShow);

    [DllImport("user32.dll")]
    private static extern bool IsIconic(IntPtr hWnd);
}
