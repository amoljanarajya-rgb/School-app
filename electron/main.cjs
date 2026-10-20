const { app, BrowserWindow, Menu, ipcMain, shell } = require("electron");
const path = require("node:path");
const { startThermalPrinterServer } = require("./thermal-printer-bridge");

let mainWindow = null;
let thermalPrinter = null;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 1024,
    minHeight: 700,
    backgroundColor: "#0f172a",
    title: "Yug International — School ERP Desktop",
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
      spellcheck: false,
    },
    show: false,
  });

  // Load the built Vite app. In dev, load the dev server instead.
  const isDev = !!process.env.VITE_DEV_SERVER_URL;
  if (isDev) {
    mainWindow.loadURL(process.env.VITE_DEV_SERVER_URL);
    mainWindow.webContents.openDevTools({ mode: "detach" });
  } else {
    mainWindow.loadFile(path.join(__dirname, "..", "dist", "index.html"));
  }

  mainWindow.once("ready-to-show", () => mainWindow.show());

  // Open external links in the system browser, not inside the app
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith("http")) {
      shell.openExternal(url);
      return { action: "deny" };
    }
    return { action: "allow" };
  });

  // Intercept Ctrl+P and forward to renderer for receipt/hall-ticket printing
  mainWindow.webContents.on("before-input-event", (event, input) => {
    if (input.type !== "keyDown") return;
    const mod = input.control || input.meta;
    if (mod && input.shift && ["a", "A", "f", "F", "m", "M"].includes(input.key)) {
      // Let renderer handle via window keydown — don't block here
      return;
    }
    if (mod && !input.shift && (input.key === "p" || input.key === "P")) {
      event.preventDefault();
      mainWindow.webContents.send("desktop-ctrl-print");
    }
  });
}

function buildMenu() {
  const isMac = process.platform === "darwin";
  const template = [
    ...(isMac ? [{ role: "appMenu" }] : []),
    {
      label: "File",
      submenu: [
        {
          label: "Print Receipt / Hall Ticket / Report",
          accelerator: "CmdOrCtrl+P",
          click: () => mainWindow?.webContents.send("desktop-ctrl-print"),
        },
        { type: "separator" },
        isMac ? { role: "close" } : { role: "quit" },
      ],
    },
    {
      label: "Navigate",
      submenu: [
        {
          label: "Class Attendance Entry",
          accelerator: "CmdOrCtrl+Shift+A",
          click: () => mainWindow?.webContents.send("desktop-shortcut", { action: "goto-attendance" }),
        },
        {
          label: "Fee Collection Form",
          accelerator: "CmdOrCtrl+Shift+F",
          click: () => mainWindow?.webContents.send("desktop-shortcut", { action: "goto-fees" }),
        },
        {
          label: "Parent Broadcast Message",
          accelerator: "CmdOrCtrl+Shift+M",
          click: () => mainWindow?.webContents.send("desktop-shortcut", { action: "goto-communication" }),
        },
      ],
    },
    { role: "editMenu" },
    {
      label: "View",
      submenu: [
        { role: "reload" },
        { role: "toggledevtools" },
        { type: "separator" },
        { role: "resetzoom" },
        { role: "zoomin" },
        { role: "zoomout" },
        { type: "separator" },
        { role: "togglefullscreen" },
      ],
    },
    { role: "windowMenu" },
  ];
  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}

// IPC: thermal printing from renderer
ipcMain.handle("thermal:print", async (_event, payload) => {
  if (!thermalPrinter) return { ok: false, error: "Thermal printer bridge not initialized" };
  try {
    return await thermalPrinter.print(payload);
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
});

ipcMain.handle("thermal:status", async () => {
  if (!thermalPrinter) return { connected: false, error: "Bridge not initialized" };
  try {
    return await thermalPrinter.getStatus();
  } catch (e) {
    return { connected: false, error: e instanceof Error ? e.message : String(e) };
  }
});

app.whenReady().then(() => {
  thermalPrinter = startThermalPrinterServer();
  createWindow();
  buildMenu();

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});
