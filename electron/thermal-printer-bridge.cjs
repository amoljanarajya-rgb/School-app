// Node.js Thermal / POS Printer Bridge
// Supports USB-connected (via raw device file / escpos) and Network (RAW 9100) thermal printers.
// Generates ESC/POS commands for 58mm and 80mm printers.
// In the Electron main process this is required directly (CommonJS).

const net = require("node:net");
const fs = require("node:fs");

// ── ESC/POS command helpers ──────────────────────────────────────────────

const ESC = "\x1b";
const GS = "\x1d";
const LF = "\n";

const CMD = {
  init: ESC + "@",
  alignLeft: ESC + "a0",
  alignCenter: ESC + "a1",
  alignRight: ESC + "a2",
  boldOn: ESC + "E1",
  boldOff: ESC + "E0",
  doubleWidth: GS + "!0x10",
  normalWidth: GS + "!0x00",
  cut: GS + "V1",
  feedLines: (n) => ESC + "d" + String.fromCharCode(n),
  beep: ESC + "B" + String.fromCharCode(3) + String.fromCharCode(2),
  qr: (data) => GS + "(k" + escPosQrParams(data),
};

function escPosQrParams(data) {
  const d = Buffer.from(data, "utf8");
  const len = d.length + 3;
  const pL = String.fromCharCode(len & 0xff);
  const pH = String.fromCharCode((len >> 8) & 0xff);
  // 1: model, 2: size(n), 3: error-correction-level, 4: store, 5: data, 6: print
  return (
    pL + pH +
    String.fromCharCode(0x31) +       // model
    String.fromCharCode(0x41) +       // function 148 — set QR data
    String.fromCharCode(d.length & 0xff) +
    String.fromCharCode((d.length >> 8) & 0xff) +
    d.toString("latin1") +
    // Print the symbol
    String.fromCharCode(0x1d) + "(k" +
    String.fromCharCode(0x03) + String.fromCharCode(0x00) +
    String.fromCharCode(0x31) + String.fromCharCode(0x45) + String.fromCharCode(0x20)
  );
}

function buildEscPos(payload) {
  const parts = [];
  parts.push(CMD.init);

  for (const line of payload.lines) {
    switch (line.type) {
      case "text": {
        parts.push(line.align === "center" ? CMD.alignCenter : line.align === "right" ? CMD.alignRight : CMD.alignLeft);
        if (line.bold) parts.push(CMD.boldOn);
        if (line.size === "wide") parts.push(CMD.doubleWidth);
        parts.push(line.value + LF);
        if (line.size === "wide") parts.push(CMD.normalWidth);
        if (line.bold) parts.push(CMD.boldOff);
        break;
      }
      case "divider": {
        parts.push(CMD.alignCenter);
        const ch = (line.char || "-")[0] || "-";
        parts.push(ch.repeat(32) + LF);
        break;
      }
      case "blank": {
        parts.push(LF);
        break;
      }
      case "kv": {
        parts.push(CMD.alignLeft);
        const txt = `${line.key}: ${line.value}`;
        parts.push(txt + LF);
        break;
      }
      case "items": {
        parts.push(CMD.alignLeft);
        const left = line.columns.find((c) => c.align !== "right")?.header ?? "";
        const right = line.columns.find((c) => c.align === "right")?.header ?? "";
        const pad = Math.max(2, 32 - left.length - right.length);
        parts.push(left + " ".repeat(pad) + right + LF);
        break;
      }
      case "total": {
        parts.push(CMD.boldOn);
        parts.push(CMD.alignLeft);
        const txt = `${line.label}`;
        const val = line.value;
        const pad = Math.max(2, 32 - txt.length - val.length);
        parts.push(txt + " ".repeat(pad) + val + LF);
        parts.push(CMD.boldOff);
        break;
      }
      case "qr": {
        parts.push(CMD.alignCenter);
        parts.push(CMD.qr(line.value));
        parts.push(LF);
        break;
      }
    }
  }

  parts.push(CMD.feedLines(3));
  parts.push(CMD.beep);
  parts.push(CMD.cut);
  return Buffer.from(parts.join(""), "latin1");
}

// ── Printer backends ─────────────────────────────────────────────────────

async function printToNetwork(host, port, data) {
  return new Promise((resolve, reject) => {
    const sock = net.createConnection({ host, port: port || 9100 }, () => {
      sock.end(data, () => resolve({ ok: true }));
    });
    sock.setTimeout(5000);
    sock.on("timeout", () => { sock.destroy(); reject(new Error(`Printer ${host}:${port} timed out`)); });
    sock.on("error", (err) => reject(new Error(`Network printer error: ${err.message}`)));
  });
}

async function printToUsb(devicePath, data) {
  return new Promise((resolve, reject) => {
    fs.writeFile(devicePath, data, (err) => {
      if (err) reject(new Error(`USB printer write failed: ${err.message}`));
      else resolve({ ok: true });
    });
  });
}

// ── Public API ───────────────────────────────────────────────────────────

function loadConfig() {
  // Config via env vars: ERP_PRINTER_MODE, ERP_PRINTER_HOST, ERP_PRINTER_PORT, ERP_PRINTER_DEVICE
  const mode = process.env.ERP_PRINTER_MODE || "network"; // "network" | "usb" | "none"
  return {
    mode,
    host: process.env.ERP_PRINTER_HOST || "192.168.1.87",
    port: Number(process.env.ERP_PRINTER_PORT) || 9100,
    device: process.env.ERP_PRINTER_DEVICE || "/dev/usb/lp0",
    name: process.env.ERP_PRINTER_NAME || "Thermal Printer",
  };
}

function startThermalPrinterServer() {
  const config = loadConfig();

  return {
    config,

    async print(payload) {
      if (config.mode === "none") {
        return { ok: false, error: "No printer configured (ERP_PRINTER_MODE=none)" };
      }
      const data = buildEscPos(payload);
      try {
        if (config.mode === "usb") {
          await printToUsb(config.device, data);
        } else {
          await printToNetwork(config.host, config.port, data);
        }
        return { ok: true };
      } catch (e) {
        return { ok: false, error: e instanceof Error ? e.message : String(e) };
      }
    },

    async getStatus() {
      if (config.mode === "none") return { connected: false, error: "No printer configured" };
      if (config.mode === "usb") {
        try {
          fs.accessSync(config.device, fs.constants.W_OK);
          return { connected: true, name: config.name };
        } catch {
          return { connected: false, error: `USB device ${config.device} not writable` };
        }
      }
      // Network — try a quick TCP connect
      return new Promise((resolve) => {
        const sock = net.createConnection({ host: config.host, port: config.port }, () => {
          sock.destroy();
          resolve({ connected: true, name: config.name });
        });
        sock.setTimeout(2000);
        sock.on("timeout", () => { sock.destroy(); resolve({ connected: false, error: "Timeout" }); });
        sock.on("error", (e) => resolve({ connected: false, error: e.message }));
      });
    },
  };
}

module.exports = { startThermalPrinterServer, buildEscPos, loadConfig };

// CLI entry:  node electron/thermal-printer-bridge.cjs --test fee
if (require.main === module) {
  const printer = startThermalPrinterServer();
  const kind = process.argv[3] || "fee";
  const sample = {
    kind: "fee-receipt",
    title: "Test Receipt",
    schoolName: "Yug International School",
    lines: [
      { type: "text", value: "Yug International School", align: "center", bold: true, size: "wide" },
      { type: "text", value: kind === "fee" ? "Fee Receipt" : kind === "hall" ? "Hall Ticket" : "Bus Pass", align: "center", bold: true },
      { type: "divider", char: "-" },
      { type: "kv", key: "Receipt No", value: "RCP-000001" },
      { type: "kv", key: "Student", value: "Test Student" },
      { type: "divider", char: "-" },
      { type: "items", columns: [{ header: "Tuition Fee", value: "", align: "left" }, { header: "Rs 5000", value: "", align: "right" }] },
      { type: "total", label: "TOTAL", value: "Rs 5000" },
      { type: "divider", char: "=" },
      { type: "text", value: "** PAID **", align: "center", bold: true },
      { type: "blank" },
      { type: "qr", value: "RECEIPT:RCP-000001:5000" },
    ],
  };
  printer.print(sample).then((r) => {
    console.log(r.ok ? "Print sent successfully." : `Print failed: ${r.error}`);
    process.exit(r.ok ? 0 : 1);
  });
}
