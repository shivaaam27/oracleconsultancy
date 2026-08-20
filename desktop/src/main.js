// The Oracle Consultancy desktop shell.
//
// WHAT THIS IS, AND WHAT IT DELIBERATELY IS NOT.
// It is a window around the live COS site — nothing more. It holds no keys, no
// database connection and no copy of your data. That is the whole design:
//
//   • Push to master → Vercel builds → the app is new the next time it opens.
//     There is no installer to reissue and nothing for staff to do.
//   • The installer only ever needs updating when THIS file changes — the
//     window, the menu, the tray — which is rare. electron-updater handles that.
//
// It also means the shell can never leak anything, because it never holds
// anything. Bundling the Next.js server in here would mean shipping the Supabase
// service-role key onto every laptop. Do not do that.

const { app, BrowserWindow, shell, dialog, Menu, session, ipcMain } = require("electron");
const path = require("node:path");
const fs = require("node:fs");
const { autoUpdater } = require("electron-updater");

/** Where COS lives. Override with COS_URL to point the shell at a local dev
 *  server (`npm run dev` in this folder does exactly that). */
const APP_URL = process.env.COS_URL || "https://oracleconsultancy.vercel.app";
const APP_ORIGIN = new URL(APP_URL).origin;

/** Windows needs this for notifications and taskbar grouping to attribute
 *  themselves to the app rather than to "electron.exe". Must match the appId in
 *  electron-builder.yml. */
const APP_ID = "tz.co.oracle.cos";

let mainWindow = null;
/** Set while the offline screen is showing, so we know what to go back to. */
let lastGoodUrl = APP_URL;

/* ------------------------------------------------------------------ *
 * Window size and position, remembered between launches.
 * ------------------------------------------------------------------ */

const stateFile = () => path.join(app.getPath("userData"), "window-state.json");

function readWindowState() {
  try {
    const s = JSON.parse(fs.readFileSync(stateFile(), "utf8"));
    if (typeof s.width === "number" && typeof s.height === "number") return s;
  } catch {
    /* first run, or the file was corrupted — fall through to defaults */
  }
  return { width: 1440, height: 900 };
}

function saveWindowState() {
  if (!mainWindow || mainWindow.isDestroyed()) return;
  try {
    const bounds = mainWindow.isMaximized() ? mainWindow.getNormalBounds() : mainWindow.getBounds();
    fs.writeFileSync(
      stateFile(),
      JSON.stringify({ ...bounds, maximized: mainWindow.isMaximized() })
    );
  } catch {
    /* losing the window position is not worth an error dialog */
  }
}

/* ------------------------------------------------------------------ *
 * Offline screen. A shell with no internet would otherwise show a blank white
 * page and a Chromium error — this shows something the owner can act on.
 * ------------------------------------------------------------------ */

function showOffline() {
  if (!mainWindow || mainWindow.isDestroyed()) return;
  mainWindow.loadFile(path.join(__dirname, "offline.html"));
}

/* ------------------------------------------------------------------ *
 * The window.
 * ------------------------------------------------------------------ */

function createWindow() {
  const state = readWindowState();

  mainWindow = new BrowserWindow({
    width: state.width,
    height: state.height,
    x: state.x,
    y: state.y,
    minWidth: 380,
    minHeight: 560,
    show: false,
    backgroundColor: "#f4f5f6", // the Desk page colour, so there is no white flash
    title: "Oracle Consultancy",
    icon: path.join(__dirname, "..", "build", "icon.png"),
    webPreferences: {
      // ⚠️ These five lines are the security model. This window loads REMOTE
      // code, so it gets no access to Node or to the file system. Do not relax
      // any of them to make a feature work — put the feature in the website.
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: true,
      webSecurity: true,
      allowRunningInsecureContent: false,
      preload: path.join(__dirname, "preload.js"),
      spellcheck: true,
    },
  });

  if (state.maximized) mainWindow.maximize();

  // Show only once there is something to look at.
  mainWindow.once("ready-to-show", () => mainWindow.show());

  mainWindow.on("close", saveWindowState);
  mainWindow.on("closed", () => {
    mainWindow = null;
  });

  // A failed top-level load means no internet (or the site is down). Sub-frame
  // failures are ignored: a PDF preview that will not load must not replace the
  // whole app with an offline screen. -3 is ABORTED, which Chromium reports for
  // an ordinary cancelled navigation.
  mainWindow.webContents.on("did-fail-load", (_e, errorCode, _desc, _url, isMainFrame) => {
    if (isMainFrame && errorCode !== -3) showOffline();
  });

  mainWindow.webContents.on("did-navigate", (_e, url) => {
    if (url.startsWith(APP_ORIGIN)) lastGoodUrl = url;
  });

  // Anything that is not COS opens in the real browser. This is what stops a
  // stray link turning the app into an uncontrolled browser — and it means a
  // signed document link opens where the user expects it, with their own
  // downloads folder and PDF viewer.
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith("http://") || url.startsWith("https://")) shell.openExternal(url);
    return { action: "deny" };
  });

  mainWindow.webContents.on("will-navigate", (event, url) => {
    if (new URL(url).origin !== APP_ORIGIN) {
      event.preventDefault();
      shell.openExternal(url);
    }
  });

  mainWindow.loadURL(APP_URL);
}

/* ------------------------------------------------------------------ *
 * Permissions. Deny by default; allow only what COS actually uses, and only to
 * COS itself.
 * ------------------------------------------------------------------ */

function lockDownPermissions() {
  // Voice dictation needs the microphone; the weather chip needs location;
  // reminders need notifications. Nothing here needs the camera on desktop, but
  // it is allowed so a document photo can be taken on a touchscreen laptop.
  const ALLOWED = new Set(["media", "notifications", "geolocation", "clipboard-sanitized-write"]);

  session.defaultSession.setPermissionRequestHandler((webContents, permission, callback) => {
    const from = webContents.getURL();
    callback(from.startsWith(APP_ORIGIN) && ALLOWED.has(permission));
  });

  // The synchronous twin of the handler above — Electron consults this one for
  // checks that cannot wait for a callback.
  session.defaultSession.setPermissionCheckHandler((_wc, permission, origin) =>
    origin === APP_ORIGIN && ALLOWED.has(permission)
  );

  // A certificate error must never be clickable-through. Leaving this out would
  // be fine (the default rejects) — it is here so nobody "fixes" a proxy problem
  // by adding an allow-all handler later.
  app.on("certificate-error", (event, _wc, _url, _error, _cert, callback) => {
    event.preventDefault();
    callback(false);
  });
}

/* ------------------------------------------------------------------ *
 * Menu. The default Electron menu names Electron and offers things that make no
 * sense here. This one keeps only what a person actually presses.
 * ------------------------------------------------------------------ */

function buildMenu() {
  const template = [
    {
      label: "File",
      submenu: [
        {
          label: "Home",
          accelerator: "Alt+Home",
          click: () => mainWindow?.loadURL(APP_URL),
        },
        { type: "separator" },
        { role: "quit", label: "Quit Oracle Consultancy" },
      ],
    },
    {
      label: "Edit",
      submenu: [
        { role: "undo" },
        { role: "redo" },
        { type: "separator" },
        { role: "cut" },
        { role: "copy" },
        { role: "paste" },
        { role: "selectAll" },
      ],
    },
    {
      label: "View",
      submenu: [
        { role: "reload" },
        { role: "forceReload" },
        { type: "separator" },
        { role: "resetZoom" },
        { role: "zoomIn" },
        { role: "zoomOut" },
        { type: "separator" },
        { role: "togglefullscreen" },
      ],
    },
    {
      label: "Help",
      submenu: [
        {
          label: "Check for updates",
          click: () => checkForUpdates({ silent: false }),
        },
        {
          label: "About",
          click: () => {
            dialog.showMessageBox(mainWindow, {
              type: "info",
              title: "Oracle Consultancy",
              message: "Oracle Consultancy",
              detail: `Version ${app.getVersion()}\n${APP_URL}\n\nThis app shows the live system. It updates itself.`,
              buttons: ["Close"],
            });
          },
        },
        { type: "separator" },
        { role: "toggleDevTools", label: "Developer tools" },
      ],
    },
  ];
  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}

/* ------------------------------------------------------------------ *
 * Updates — the SHELL's updates. The contents of the app update themselves the
 * moment anything is pushed, because the contents are the website.
 * ------------------------------------------------------------------ */

let updateCheckInFlight = false;

function checkForUpdates({ silent }) {
  // In development there is no update feed and no packaged app to replace.
  if (!app.isPackaged) {
    if (!silent) {
      dialog.showMessageBox(mainWindow, {
        type: "info",
        message: "Updates are only checked in the installed app.",
        buttons: ["OK"],
      });
    }
    return;
  }
  if (updateCheckInFlight) return;
  updateCheckInFlight = true;

  autoUpdater
    .checkForUpdates()
    .catch((err) => {
      if (!silent) {
        dialog.showMessageBox(mainWindow, {
          type: "warning",
          title: "Could not check for updates",
          message: "Could not check for updates just now.",
          detail: String(err && err.message ? err.message : err),
          buttons: ["OK"],
        });
      }
    })
    .finally(() => {
      updateCheckInFlight = false;
    });
}

function wireUpdater() {
  autoUpdater.autoDownload = true;
  // Never restart under someone mid-sentence. The new version is installed when
  // they close the app themselves.
  autoUpdater.autoInstallOnAppQuit = true;

  autoUpdater.on("update-downloaded", async (info) => {
    if (!mainWindow || mainWindow.isDestroyed()) return;
    const { response } = await dialog.showMessageBox(mainWindow, {
      type: "info",
      title: "Update ready",
      message: `Version ${info.version} is ready.`,
      detail: "It will be applied next time you close the app. Restart now?",
      buttons: ["Later", "Restart now"],
      defaultId: 0,
      cancelId: 0,
    });
    if (response === 1) {
      saveWindowState();
      autoUpdater.quitAndInstall();
    }
  });

  // A broken or unreachable update feed must never interrupt the work. It is
  // logged and forgotten; the next launch tries again.
  autoUpdater.on("error", (err) => {
    console.error("[updater]", err && err.message ? err.message : err);
  });
}

/* ------------------------------------------------------------------ *
 * Start-up.
 * ------------------------------------------------------------------ */

// One window, always. A second launch focuses the one that is open rather than
// starting a second copy with its own session.
if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on("second-instance", () => {
    if (!mainWindow) return;
    if (mainWindow.isMinimized()) mainWindow.restore();
    mainWindow.focus();
  });

  app.whenReady().then(() => {
    app.setAppUserModelId(APP_ID);
    lockDownPermissions();
    buildMenu();
    createWindow();
    wireUpdater();

    // On launch, then every six hours for a machine that is left running.
    checkForUpdates({ silent: true });
    setInterval(() => checkForUpdates({ silent: true }), 6 * 60 * 60 * 1000);

    app.on("activate", () => {
      if (BrowserWindow.getAllWindows().length === 0) createWindow();
    });
  });

  app.on("window-all-closed", () => {
    // Windows and Linux: closing the window closes the app.
    if (process.platform !== "darwin") app.quit();
  });
}

// The offline screen's Retry button, and nothing else, comes through here.
ipcMain.on("cos:retry", () => {
  if (mainWindow && !mainWindow.isDestroyed()) mainWindow.loadURL(lastGoodUrl || APP_URL);
});
