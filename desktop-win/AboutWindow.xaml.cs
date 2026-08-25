using System.Windows;
using System.Windows.Media;
using Color = System.Windows.Media.Color;
// WinForms is referenced for the tray icon and brings its own Clipboard.
using Clipboard = System.Windows.Clipboard;

namespace OracleConsultancy;

/// <summary>
/// The version panel, off the tray icon.
///
/// It exists because of a real failure: an installed copy turned out to predate
/// the update checker itself, so it had never asked COS anything and never
/// would — and there was no way to see that from inside the app. Half an hour
/// went on working out what was actually installed. This answers it in one
/// glance: what you have, what COS publishes, and when it last managed to ask.
///
/// ⚠️ "COULD NOT ASK" AND "UP TO DATE" MUST READ DIFFERENTLY. They are opposite
/// facts and the older, quieter one is the dangerous one. A panel that shows a
/// reassuring version number after a failed check is worse than no panel.
/// </summary>
public partial class AboutWindow : Window
{
    private readonly MainWindow _main;

    public AboutWindow(MainWindow main, bool dark)
    {
        InitializeComponent();
        _main = main;
        Owner = main;
        Paint(dark);
        Fill();
    }

    /// <summary>Follow the theme the main window is wearing.</summary>
    private void Paint(bool dark)
    {
        var bg     = dark ? Rgb(0x19, 0x1d, 0x1b) : Rgb(0xff, 0xff, 0xff);
        var ink    = dark ? Rgb(0xe9, 0xec, 0xe8) : Rgb(0x14, 0x18, 0x1a);
        var muted  = dark ? Rgb(0x9a, 0xa3, 0x9e) : Rgb(0x5a, 0x64, 0x72);
        var faint  = dark ? Rgb(0x73, 0x7c, 0x78) : Rgb(0x8d, 0x97, 0xa5);
        var line   = dark ? Rgb(0x2b, 0x31, 0x2e) : Rgb(0xe4, 0xe8, 0xef);

        Background = new SolidColorBrush(bg);
        Root.Background = new SolidColorBrush(bg);
        Divider.Background = new SolidColorBrush(line);
        Divider2.Background = new SolidColorBrush(line);

        AppName.Foreground = new SolidColorBrush(ink);
        YouHave.Foreground = new SolidColorBrush(ink);
        Published.Foreground = new SolidColorBrush(ink);
        Tagline.Foreground = new SolidColorBrush(muted);
        Checked.Foreground = new SolidColorBrush(muted);
        Notes.Foreground = new SolidColorBrush(muted);

        YouHaveLabel.Foreground = new SolidColorBrush(faint);
        PublishedLabel.Foreground = new SolidColorBrush(faint);
        NotesLabel.Foreground = new SolidColorBrush(faint);
    }

    private static Color Rgb(byte r, byte g, byte b) => Color.FromRgb(r, g, b);

    /// <summary>Rewrite the figures. Called again after a manual check.</summary>
    public void Fill()
    {
        YouHave.Text = $"Version {MainWindow.MyVersion}";

        switch (_main.LastCheck)
        {
            case MainWindow.CheckOutcome.NewerAvailable:
                Published.Text = $"Version {_main.PublishedVersion}" + Released();
                Checked.Text = $"An update is ready to install. {When()}";
                break;

            case MainWindow.CheckOutcome.UpToDate:
                Published.Text = $"Version {_main.PublishedVersion}" + Released();
                Checked.Text = $"You are up to date. {When()}";
                break;

            // ⚠️ No version number here on purpose — showing the last one we
            // happen to remember would look like a successful check.
            case MainWindow.CheckOutcome.CouldNotAsk:
                Published.Text = "Could not ask";
                Checked.Text = $"COS could not be reached, so this may not be the newest version. {When()}";
                break;

            default:
                Published.Text = "Not checked yet";
                Checked.Text = "The check runs a moment after the app opens.";
                break;
        }

        bool any = _main.PublishedNotes.Length > 0 && _main.LastCheck != MainWindow.CheckOutcome.CouldNotAsk;
        NotesLabel.Visibility = any ? Visibility.Visible : Visibility.Collapsed;
        Notes.Visibility = any ? Visibility.Visible : Visibility.Collapsed;
        Notes.ItemsSource = any ? _main.PublishedNotes : null;
    }

    private string Released() =>
        string.IsNullOrWhiteSpace(_main.PublishedOn) ? "" : $"  ·  released {_main.PublishedOn}";

    private string When() =>
        _main.LastCheckedAt is null ? "" : $"Checked {_main.LastCheckedAt:HH:mm} today.";

    private async void CheckNow_Click(object sender, RoutedEventArgs e)
    {
        CheckNow.IsEnabled = false;
        CheckNow.Content = "Checking…";
        await _main.CheckNowAsync();
        Fill();
        CheckNow.Content = "Check for updates";
        CheckNow.IsEnabled = true;
    }

    /// <summary>
    /// Everything somebody would otherwise have to be talked through on the
    /// phone, in one paste.
    /// </summary>
    private void CopyDiag_Click(object sender, RoutedEventArgs e)
    {
        var text = string.Join("\n", new[]
        {
            $"Oracle Consultancy desktop",
            $"installed:  {MainWindow.MyVersion}",
            $"published:  {_main.PublishedVersion ?? "unknown"}",
            $"last check: {_main.LastCheck} at {(_main.LastCheckedAt?.ToString("s") ?? "never")}",
            $"site:       {MainWindow.SiteUrl}",
            $"webview2:   {MainWindow.WebViewRuntimeVersion()}",
            $"windows:    {System.Environment.OSVersion.Version}",
        });

        try
        {
            Clipboard.SetText(text);
            CopyDiag.Content = "Copied";
        }
        catch
        {
            // The clipboard can be held by another process. Say so rather than
            // pretending it worked.
            CopyDiag.Content = "Could not copy";
        }
    }

    private void CloseBtn_Click(object sender, RoutedEventArgs e) => Close();
}
