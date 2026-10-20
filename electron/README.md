# Yug International School ERP — Desktop Application

This folder contains the native desktop wrapper (Electron) and thermal printer integration code that wraps the web-based School ERP dashboard, attendance, transport, and exam modules into a native Windows desktop application.

## Architecture

```
┌─────────────────────────────────────────────┐
│  Electron BrowserWindow (Chromium)          │
│  ┌───────────────────────────────────────┐  │
│  │  React + Vite App (renderer)          │  │
│  │  - Dashboard / Attendance / Finance   │  │
│  │  - Exams / Transport / Communication  │  │
│  │  - useDesktopShortcuts hook           │  │
│  │  - desktopPrinter.ts bridge client    │  │
│  └──────────────┬────────────────────────┘  │
│                 │ IPC (contextBridge)        │
│  ┌──────────────▼────────────────────────┐  │
│  │  preload.cjs (sandboxed bridge)       │  │
│  └──────────────┬────────────────────────┘  │
│  ┌──────────────▼────────────────────────┐  │
│  │  main.cjs (Node.js main process)      │  │
│  │  - Window management + native menu    │  │
│  │  - Keyboard accelerator handling      │  │
│  │  - thermal-printer-bridge.cjs         │  │
│  └──────────────┬────────────────────────┘  │
└─────────────────┼───────────────────────────┘
                  │ ESC/POS raw commands
          ┌───────▼───────┐
          │  Thermal/POS  │  USB or Network (RAW 9100)
          │  Printer      │  58mm / 80mm
          └───────────────┘
```

## Keyboard Shortcuts

| Shortcut         | Action                        |
|------------------|-------------------------------|
| Ctrl+Shift+A     | Open Class Attendance Entry   |
| Ctrl+Shift+F     | Open Fee Collection Form      |
| Ctrl+Shift+M     | Open Parent Broadcast Message |
| Ctrl+P           | Print Receipt / Hall Ticket   |

Shortcuts are wired in both the Electron native menu (accelerators) and the React renderer (`useDesktopShortcuts` hook). In the browser (dev mode) they work via `window.addEventListener('keydown')`.

## Thermal Printer Configuration

Set environment variables before launching the desktop app:

### Network printer (default)
```bash
ERP_PRINTER_MODE=network
ERP_PRINTER_HOST=192.168.1.87   # printer IP
ERP_PRINTER_PORT=9100            # RAW port (standard for ESC/POS)
ERP_PRINTER_NAME="EPSON-TM-T82"
```

### USB printer (Linux/macOS)
```bash
ERP_PRINTER_MODE=usb
ERP_PRINTER_DEVICE=/dev/usb/lp0
```

### Windows spooler
```bash
ERP_PRINTER_MODE=windows
ERP_PRINTER_NAME="EPSON TM-T82"  # must match Windows printer name
```

### Test the printer from CLI
```bash
node electron/thermal-printer-bridge.cjs --test fee
node electron/thermal-printer-bridge.cjs --test hall
node electron/thermal-printer-bridge.cjs --test bus
```

## Running in Dev Mode

```bash
# Terminal 1 — start the Vite dev server
npm run dev

# Terminal 2 — launch Electron pointing at the dev server
VITE_DEV_SERVER_URL=http://localhost:5173 npx electron electron/main.cjs
```

## Building the Desktop App

```bash
# Build the web app first
npm run build

# Package with electron-builder (install separately)
npx electron-builder --win --x64
```

## C# / .NET MAUI Alternative

For teams preferring .NET, `csharp/ThermalPrinterService.cs` provides a drop-in
equivalent of the Node.js bridge. It supports:

- **Network** printers via raw TCP socket (port 9100)
- **USB** printers via direct device file write (Linux) or Windows spooler
- **Windows spooler** via `RawPrinterHelper` (P/Invoke `winspool.drv`)

Register in `MauiProgram.cs` / `Program.cs`:

```csharp
builder.Services.AddSingleton<SchoolErp.Desktop.ThermalPrinterService>();
```

Then call from your .NET MAUI / WPF page:

```csharp
var printer = handler.Services.GetRequiredService<ThermalPrinterService>();
var payload = JsonSerializer.Deserialize<PrintPayload>(jsonFromWebView);
await printer.PrintAsync(payload);
```

The JSON payload shape is identical to the TypeScript `PrintPayload` — the .NET MAUI
app can host the built Vite app in a `BlazorWebView` or `WebView` and receive print
requests via a JS-to-C# bridge channel.

## What Gets Printed

| Document     | Trigger                                   |
|--------------|-------------------------------------------|
| Fee Receipt  | Finance → Record Payment → Receipt modal  |
| Hall Ticket  | Exams → Enrollments → Generate Ticket     |
| Bus Pass     | Transport → Student Mapping → Print Pass  |
| Report Card  | Ctrl+P on any report view                 |
