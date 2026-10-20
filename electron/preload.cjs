const { contextBridge, ipcRenderer } = require("electron");

// Expose a safe, minimal bridge to the renderer so the React app can
// send thermal-print payloads and query printer status without getting
// direct Node.js access.
contextBridge.exposeInMainWorld("desktopBridge", {
  thermalPrint: (payload) => ipcRenderer.invoke("thermal:print", payload),
  getPrinterStatus: () => ipcRenderer.invoke("thermal:status"),

  // Listen for menu/accelerator-driven shortcuts forwarded from the main process
  onShortcut: (callback) => {
    const handler = (_e, data) => callback(data);
    ipcRenderer.on("desktop-shortcut", handler);
    ipcRenderer.on("desktop-ctrl-print", () => callback({ action: "print" }));
    return () => {
      ipcRenderer.removeListener("desktop-shortcut", handler);
      ipcRenderer.removeListener("desktop-ctrl-print", handler);
    };
  },
});
