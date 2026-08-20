// The ONLY bridge between the window and the machine.
//
// It exposes exactly one function, to exactly one page: the Retry button on the
// offline screen. The COS website itself neither needs nor gets anything from
// here — it is an ordinary website and must keep working in an ordinary browser.
//
// ⚠️ Do not grow this file to "make something easier". Every function added here
// is reachable by whatever is running in the window, which is remote code. If a
// feature needs the machine, the question to ask first is whether the website
// could do it in a normal browser instead.

const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("cosShell", {
  retry: () => ipcRenderer.send("cos:retry"),
});
