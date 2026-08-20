using System.IO;
using System.Reflection;
using System.Text.Json;
using System.Windows;
using System.Windows.Input;
using Microsoft.Web.WebView2.Core;

namespace OracleConsultancy;

public partial class MainWindow : Window
{
    /// <summary>
    /// Where COS lives. Set the COS_URL environment variable to point the app at
    /// a local dev server or a preview deployment instead.
    /// </summary>
    private static readonly string AppUrl =
        Environment.GetEnvironmentVariable("COS_URL") ?? "https://oracleconsultancy.vercel.app";

    private static readonly Uri AppUri = new(AppUrl);

    /// <summary>The last COS page that actually loaded, so Retry goes back to it.</summary>
    private string _lastGoodUrl = AppUrl;

    private bool _showingOffline;

    public MainWindow()
    {
        InitializeComponent();
        RestoreWindowState();
        Loaded += async (_, _) => await StartWebViewAsync();
        Closing += (_, _) => SaveWindowState();
        KeyDown += OnKeyDown;
    }

    /* ------------------------------------------------------------------ *
     * Start-up
     * ------------------------------------------------------------------ */

    private async Task StartWebViewAsync()
    {
        try
        {
            // Keep the browser profile — cookies, and therefore the sign-in
            // session — in the user's own AppData, so it survives an update and
            // is never left inside Program Files.
            var dataFolder = Path.Combine(
                Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData),
                "OracleConsultancy",
                "WebView2");
            Directory.CreateDirectory(dataFolder);

            var env = await CoreWebView2Environment.CreateAsync(null, dataFolder);
            await Web.EnsureCoreWebView2Async(env);
        }
        catch (WebView2RuntimeNotFoundException)
        {
            // Windows 11 always has it; an old Windows 10 build might not. Say
            // what to do instead of dying with a stack trace.
            var answer = MessageBox.Show(
                "This app needs the Microsoft Edge WebView2 runtime, which is missing from this computer.\n\n" +
                "Open the download page now?",
                "One component is missing",
                MessageBoxButton.YesNo,
                MessageBoxImage.Information);
            if (answer == MessageBoxResult.Yes)
                OpenExternally("https://developer.microsoft.com/microsoft-edge/webview2/");
            Close();
            return;
        }

        var core = Web.CoreWebView2;

        // Chrome that makes no sense inside an app window.
        core.Settings.AreDefaultContextMenusEnabled = true;  // keep copy / paste
        core.Settings.IsStatusBarEnabled = false;
        core.Settings.AreBrowserAcceleratorKeysEnabled = true;
        core.Settings.IsPasswordAutosaveEnabled = false;     // COS has passkeys

        core.NavigationStarting += OnNavigationStarting;
        core.NavigationCompleted += OnNavigationCompleted;
        core.NewWindowRequested += OnNewWindowRequested;
        core.PermissionRequested += OnPermissionRequested;
        core.WebMessageReceived += OnWebMessageReceived;
        core.DocumentTitleChanged += (_, _) =>
            Title = string.IsNullOrWhiteSpace(core.DocumentTitle) ? "Oracle Consultancy" : core.DocumentTitle;

        core.Navigate(AppUrl);
    }

    /* ------------------------------------------------------------------ *
     * The security model. This window shows REMOTE code, so the rules below
     * are what keep it an app rather than an uncontrolled browser.
     * ------------------------------------------------------------------ */

    /// <summary>Is this one of ours? Compared on the ORIGIN, never on a prefix —
    /// a plain StartsWith would let "https://oracleconsultancy.vercel.app.evil.com"
    /// through.</summary>
    private static bool IsOurs(string url) =>
        Uri.TryCreate(url, UriKind.Absolute, out var u)
        && u.Scheme == AppUri.Scheme
        && string.Equals(u.Host, AppUri.Host, StringComparison.OrdinalIgnoreCase)
        && u.Port == AppUri.Port;

    private void OnNavigationStarting(object? sender, CoreWebView2NavigationStartingEventArgs e)
    {
        // Anything that is not COS opens in the real browser instead. That covers
        // a stray link in a note, and also means a signed document link lands
        // where the user expects it, with their own downloads folder.
        //
        // ⚠️ Only EXTERNAL http(s) is redirected. An earlier version cancelled
        // anything that was not the COS origin, which silently cancelled the
        // app's OWN offline screen — NavigateToString loads through a data: URI,
        // so the offline page was being "sent to the browser" and the user was
        // left looking at Chromium's error page instead. about:, data: and
        // blob: are the app talking to itself and must pass through.
        bool isWeb = e.Uri.StartsWith("http://", StringComparison.OrdinalIgnoreCase)
                  || e.Uri.StartsWith("https://", StringComparison.OrdinalIgnoreCase);
        if (!isWeb) return;
        if (IsOurs(e.Uri)) return;

        e.Cancel = true;
        OpenExternally(e.Uri);
    }

    private void OnNewWindowRequested(object? sender, CoreWebView2NewWindowRequestedEventArgs e)
    {
        // Never open a second, chrome-less window: send it to the browser.
        e.Handled = true;
        OpenExternally(e.Uri);
    }

    private void OnPermissionRequested(object? sender, CoreWebView2PermissionRequestedEventArgs e)
    {
        // Deny by default. COS genuinely uses the microphone (voice notes),
        // notifications (reminders) and location (the weather chip) — and only
        // COS is allowed to ask.
        bool allowed = IsOurs(e.Uri) && e.PermissionKind is
            CoreWebView2PermissionKind.Microphone or
            CoreWebView2PermissionKind.Camera or
            CoreWebView2PermissionKind.Notifications or
            CoreWebView2PermissionKind.Geolocation or
            CoreWebView2PermissionKind.ClipboardRead;

        e.State = allowed ? CoreWebView2PermissionState.Allow : CoreWebView2PermissionState.Deny;
    }

    /* ------------------------------------------------------------------ *
     * Offline handling
     * ------------------------------------------------------------------ */

    private void OnNavigationCompleted(object? sender, CoreWebView2NavigationCompletedEventArgs e)
    {
        if (e.IsSuccess)
        {
            _showingOffline = false;
            var url = Web.CoreWebView2.Source;
            if (IsOurs(url)) _lastGoodUrl = url;
            return;
        }

        // A cancelled navigation is not a failure — it is what happens every time
        // we send an off-site link to the browser above.
        if (e.WebErrorStatus == CoreWebView2WebErrorStatus.OperationCanceled) return;

        ShowOffline();
    }

    private void ShowOffline()
    {
        if (_showingOffline) return;
        _showingOffline = true;

        Web.CoreWebView2.NavigateToString(OfflineHtml());
    }

    /// <summary>
    /// The offline page, compiled into the .exe so it is guaranteed to be there
    /// at the one moment it is needed — when there is no network.
    ///
    /// ⚠️ Looked up by SUFFIX, not by a hard-coded manifest name. The name is
    /// derived from the root namespace and the file path, and getting it wrong
    /// fails SILENTLY: GetManifestResourceStream returns null, nothing throws,
    /// and the user is left looking at Chromium's own error page. That is
    /// exactly what happened the first time. The csproj also pins LogicalName,
    /// so this is belt and braces.
    /// </summary>
    private static string OfflineHtml()
    {
        try
        {
            var asm = Assembly.GetExecutingAssembly();
            var name = Array.Find(asm.GetManifestResourceNames(),
                n => n.EndsWith("Offline.html", StringComparison.OrdinalIgnoreCase));
            if (name is not null)
            {
                using var stream = asm.GetManifestResourceStream(name);
                if (stream is not null)
                {
                    using var reader = new StreamReader(stream);
                    return reader.ReadToEnd();
                }
            }
        }
        catch
        {
            // Fall through to the built-in below.
        }

        // Last resort, so there is ALWAYS something readable rather than a
        // browser error page.
        return "<!doctype html><html><head><meta charset=\"utf-8\"><title>No connection — Oracle Consultancy</title>"
             + "<style>body{margin:0;min-height:100vh;display:grid;place-items:center;background:#f4f5f6;color:#1f272e;"
             + "font:400 14px/1.55 'Segoe UI',system-ui,sans-serif}div{text-align:center}"
             + "button{border:0;border-radius:6px;background:#2490ef;color:#fff;font:inherit;padding:9px 20px;cursor:pointer}</style>"
             + "</head><body><div><h1 style=\"font-size:17px\">No connection</h1>"
             + "<p>Oracle Consultancy could not be reached. Check your internet, then try again.</p>"
             + "<button onclick=\"window.chrome&&window.chrome.webview&&window.chrome.webview.postMessage('retry')\">Try again</button>"
             + "</div></body></html>";
    }

    private void OnWebMessageReceived(object? sender, CoreWebView2WebMessageReceivedEventArgs e)
    {
        // The offline screen's Retry button, and nothing else. Messages from the
        // COS site itself are ignored — the website is an ordinary website and
        // must never depend on being inside this shell.
        string message;
        try { message = e.TryGetWebMessageAsString(); }
        catch { return; }

        if (message == "retry" && _showingOffline)
        {
            _showingOffline = false;
            Web.CoreWebView2.Navigate(string.IsNullOrEmpty(_lastGoodUrl) ? AppUrl : _lastGoodUrl);
        }
    }

    /* ------------------------------------------------------------------ *
     * Keyboard
     * ------------------------------------------------------------------ */

    private void OnKeyDown(object sender, KeyEventArgs e)
    {
        if (e.Key == Key.F5 || (e.Key == Key.R && Keyboard.Modifiers == ModifierKeys.Control))
        {
            Web.CoreWebView2?.Reload();
            e.Handled = true;
        }
        else if (e.Key == Key.F11)
        {
            WindowState = WindowState == WindowState.Maximized ? WindowState.Normal : WindowState.Maximized;
            WindowStyle = WindowState == WindowState.Maximized ? WindowStyle.None : WindowStyle.SingleBorderWindow;
            e.Handled = true;
        }
        else if (e.Key == Key.Home && Keyboard.Modifiers == ModifierKeys.Alt)
        {
            Web.CoreWebView2?.Navigate(AppUrl);
            e.Handled = true;
        }
    }

    /* ------------------------------------------------------------------ *
     * Window size and position, remembered between launches.
     * ------------------------------------------------------------------ */

    private record WindowState_(double Left, double Top, double Width, double Height, bool Maximized);

    private static string StatePath => Path.Combine(
        Environment.GetFolderPath(Environment.SpecialFolder.ApplicationData),
        "OracleConsultancy", "window.json");

    private void RestoreWindowState()
    {
        try
        {
            if (!File.Exists(StatePath)) return;
            var s = JsonSerializer.Deserialize<WindowState_>(File.ReadAllText(StatePath));
            if (s is null || s.Width < 380 || s.Height < 560) return;

            // Only restore a position that is still on a screen that exists —
            // otherwise unplugging a second monitor hides the window off-canvas.
            var virtualLeft = SystemParameters.VirtualScreenLeft;
            var virtualTop = SystemParameters.VirtualScreenTop;
            var virtualRight = virtualLeft + SystemParameters.VirtualScreenWidth;
            var virtualBottom = virtualTop + SystemParameters.VirtualScreenHeight;
            bool onScreen = s.Left >= virtualLeft && s.Top >= virtualTop
                         && s.Left + 200 <= virtualRight && s.Top + 100 <= virtualBottom;

            Width = s.Width;
            Height = s.Height;
            if (onScreen)
            {
                WindowStartupLocation = WindowStartupLocation.Manual;
                Left = s.Left;
                Top = s.Top;
            }
            if (s.Maximized) WindowState = System.Windows.WindowState.Maximized;
        }
        catch
        {
            // A corrupted state file just means default size. Never fatal.
        }
    }

    private void SaveWindowState()
    {
        try
        {
            Directory.CreateDirectory(Path.GetDirectoryName(StatePath)!);
            var maximized = WindowState == System.Windows.WindowState.Maximized;
            var r = maximized ? RestoreBounds : new Rect(Left, Top, Width, Height);
            File.WriteAllText(StatePath,
                JsonSerializer.Serialize(new WindowState_(r.Left, r.Top, r.Width, r.Height, maximized)));
        }
        catch
        {
            // Losing the window position is not worth an error dialog.
        }
    }

    /* ------------------------------------------------------------------ *
     * Helpers
     * ------------------------------------------------------------------ */

    private static void OpenExternally(string url)
    {
        // Only ever hand http(s) to the shell. Without this check a page could
        // ask the operating system to open a file: or a custom scheme.
        if (!Uri.TryCreate(url, UriKind.Absolute, out var u)) return;
        if (u.Scheme != Uri.UriSchemeHttp && u.Scheme != Uri.UriSchemeHttps) return;

        try
        {
            System.Diagnostics.Process.Start(new System.Diagnostics.ProcessStartInfo
            {
                FileName = u.ToString(),
                UseShellExecute = true,
            });
        }
        catch
        {
            // No default browser, or the user cancelled. Nothing to do.
        }
    }
}
