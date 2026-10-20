// C# Thermal / POS Printer Service for .NET MAUI / WPF / WinForms
// Supports USB (via RawPrinterHelper / PrintDocument) and Network (RAW 9100) thermal printers.
// Uses ESC/POS command set for 58mm / 80mm receipt printers (Epson, Bixolon, Star, etc.)
//
// Usage:
//   var printer = new ThermalPrinterService();
//   await printer.PrintAsync(payload);  // payload is the PrintPayload JSON from the web app
//
// Wire up in Program.cs / MauiProgram.cs:
//   builder.Services.AddSingleton<ThermalPrinterService>();
//
// Environment variables for configuration:
//   ERP_PRINTER_MODE   = "network" | "usb" | "windows"  (default: "windows")
//   ERP_PRINTER_HOST   = network printer IP             (default: 192.168.1.87)
//   ERP_PRINTER_PORT   = network printer port           (default: 9100)
//   ERP_PRINTER_NAME   = Windows printer name           (default: first available)

using System;
using System.Collections.Generic;
using System.IO;
using System.Net.Sockets;
using System.Runtime.InteropServices;
using System.Text;
using System.Text.Json;
using System.Text.Json.Serialization;
using System.Threading.Tasks;

namespace SchoolErp.Desktop;

public class ThermalPrinterService
{
    private readonly PrinterConfig _config;

    public ThermalPrinterService()
    {
        _config = LoadConfig();
    }

    // ── Public API ──────────────────────────────────────────────────

    public async Task<PrintResult> PrintAsync(PrintPayload payload)
    {
        try
        {
            var commands = EscPosBuilder.Build(payload);
            return _config.Mode switch
            {
                "network" => await PrintToNetworkAsync(commands),
                "usb" => PrintToUsb(commands),
                "windows" => PrintViaWindowsSpooler(commands),
                _ => new PrintResult(false, "Unknown printer mode"),
            };
        }
        catch (Exception ex)
        {
            return new PrintResult(false, ex.Message);
        }
    }

    public async Task<PrinterStatus> GetStatusAsync()
    {
        return _config.Mode switch
        {
            "network" => await CheckNetworkAsync(),
            "usb" => CheckUsb(),
            "windows" => CheckWindows(),
            _ => new PrinterStatus(false, "No printer configured"),
        };
    }

    // ── Network printer (RAW 9100) ──────────────────────────────────

    private async Task<PrintResult> PrintToNetworkAsync(byte[] data)
    {
        using var client = new TcpClient();
        await client.ConnectAsync(_config.Host, _config.Port);
        using var stream = client.GetStream();
        await stream.WriteAsync(data);
        await stream.FlushAsync();
        return new PrintResult(true);
    }

    private async Task<PrinterStatus> CheckNetworkAsync()
    {
        try
        {
            using var client = new TcpClient();
            await client.ConnectAsync(_config.Host, _config.Port);
            return new PrinterStatus(true, _config.Name);
        }
        catch (Exception ex)
        {
            return new PrinterStatus(false, ex.Message);
        }
    }

    // ── USB printer (raw device write on Linux / direct on Windows) ─

    private PrintResult PrintToUsb(byte[] data)
    {
        // On Windows, USB thermal printers are typically accessed via the spooler
        // (see PrintViaWindowsSpooler). On Linux/Mac, write to /dev/usb/lp0 directly.
        if (OperatingSystem.IsWindows())
            return PrintViaWindowsSpooler(data);

        File.WriteAllBytes(_config.Device, data);
        return new PrintResult(true);
    }

    private PrinterStatus CheckUsb()
    {
        if (OperatingSystem.IsWindows())
            return CheckWindows();
        return File.Exists(_config.Device)
            ? new PrinterStatus(true, _config.Name)
            : new PrinterStatus(false, $"Device not found: {_config.Device}");
    }

    // ── Windows spooler (PrintDocument / RawPrinterHelper) ──────────

    private PrintResult PrintViaWindowsSpooler(byte[] data)
    {
        if (!OperatingSystem.IsWindows())
            return new PrintResult(false, "Windows spooler only available on Windows");

        var printerName = _config.Name;
        if (string.IsNullOrEmpty(printerName) || printerName == "Thermal Printer")
        {
            // Fall back to the default printer
            printerName = RawPrinterHelper.GetDefaultPrinterName();
        }

        if (string.IsNullOrEmpty(printerName))
            return new PrintResult(false, "No Windows printer found");

        RawPrinterHelper.SendRawData(printerName, data);
        return new PrintResult(true);
    }

    private PrinterStatus CheckWindows()
    {
        if (!OperatingSystem.IsWindows())
            return new PrinterStatus(false, "Windows-only");
        var name = RawPrinterHelper.GetDefaultPrinterName();
        return string.IsNullOrEmpty(name)
            ? new PrinterStatus(false, "No printer installed")
            : new PrinterStatus(true, name);
    }

    // ── Config ──────────────────────────────────────────────────────

    private static PrinterConfig LoadConfig()
    {
        return new PrinterConfig
        {
            Mode = Environment.GetEnvironmentVariable("ERP_PRINTER_MODE") ?? "windows",
            Host = Environment.GetEnvironmentVariable("ERP_PRINTER_HOST") ?? "192.168.1.87",
            Port = int.TryParse(Environment.GetEnvironmentVariable("ERP_PRINTER_PORT"), out var p) ? p : 9100,
            Device = Environment.GetEnvironmentVariable("ERP_PRINTER_DEVICE") ?? "/dev/usb/lp0",
            Name = Environment.GetEnvironmentVariable("ERP_PRINTER_NAME") ?? "Thermal Printer",
        };
    }
}

// ── ESC/POS command builder ──────────────────────────────────────────────

public static class EscPosBuilder
{
    private const byte ESC = 0x1b;
    private const byte GS = 0x1d;

    public static byte[] Build(PrintPayload payload)
    {
        using var ms = new MemoryStream();
        Init(ms);

        foreach (var line in payload.Lines)
        {
            switch (line.Type)
            {
                case "text":
                    SetAlign(ms, line.Align ?? "left");
                    if (line.Bold == true) BoldOn(ms);
                    if (line.Size == "wide") DoubleWidth(ms);
                    WriteText(ms, line.Value ?? "");
                    WriteNewLine(ms);
                    if (line.Size == "wide") NormalWidth(ms);
                    if (line.Bold == true) BoldOff(ms);
                    break;

                case "divider":
                    SetAlign(ms, "center");
                    var ch = string.IsNullOrEmpty(line.Char) ? '-' : line.Char[0];
                    WriteText(ms, new string(ch, 32));
                    WriteNewLine(ms);
                    break;

                case "blank":
                    WriteNewLine(ms);
                    break;

                case "kv":
                    SetAlign(ms, "left");
                    WriteText(ms, $"{line.Key}: {line.Value}");
                    WriteNewLine(ms);
                    break;

                case "items":
                    SetAlign(ms, "left");
                    var left = "";
                    var right = "";
                    foreach (var col in line.Columns ?? new List<PrintColumn>())
                    {
                        if (col.Align == "right") right = col.Header ?? "";
                        else left = col.Header ?? "";
                    }
                    var padCount = Math.Max(2, 32 - left.Length - right.Length);
                    WriteText(ms, left + new string(' ', padCount) + right);
                    WriteNewLine(ms);
                    break;

                case "total":
                    BoldOn(ms);
                    SetAlign(ms, "left");
                    var tPad = Math.Max(2, 32 - (line.Label ?? "").Length - (line.Value ?? "").Length);
                    WriteText(ms, (line.Label ?? "") + new string(' ', tPad) + (line.Value ?? ""));
                    WriteNewLine(ms);
                    BoldOff(ms);
                    break;

                case "qr":
                    SetAlign(ms, "center");
                    WriteQr(ms, line.Value ?? "");
                    WriteNewLine(ms);
                    break;
            }
        }

        FeedLines(ms, 3);
        Cut(ms);
        return ms.ToArray();
    }

    private static void Init(MemoryStream ms) { ms.WriteByte(ESC); ms.WriteByte(0x40); }
    private static void SetAlign(MemoryStream ms, string align)
    {
        ms.WriteByte(ESC); ms.WriteByte(0x61);
        ms.WriteByte(align switch { "center" => (byte)1, "right" => (byte)2, _ => (byte)0 });
    }
    private static void BoldOn(MemoryStream ms) { ms.WriteByte(ESC); ms.WriteByte(0x45); ms.WriteByte(0x01); }
    private static void BoldOff(MemoryStream ms) { ms.WriteByte(ESC); ms.WriteByte(0x45); ms.WriteByte(0x00); }
    private static void DoubleWidth(MemoryStream ms) { ms.WriteByte(GS); ms.WriteByte(0x21); ms.WriteByte(0x10); }
    private static void NormalWidth(MemoryStream ms) { ms.WriteByte(GS); ms.WriteByte(0x21); ms.WriteByte(0x00); }
    private static void WriteText(MemoryStream ms, string text)
    {
        var bytes = Encoding.UTF8.GetBytes(text);
        ms.Write(bytes, 0, bytes.Length);
    }
    private static void WriteNewLine(MemoryStream ms) { ms.WriteByte(0x0a); }
    private static void FeedLines(MemoryStream ms, int n) { ms.WriteByte(ESC); ms.WriteByte(0x64); ms.WriteByte((byte)n); }
    private static void Cut(MemoryStream ms) { ms.WriteByte(GS); ms.WriteByte(0x56); ms.WriteByte(0x01); }

    private static void WriteQr(MemoryStream ms, string data)
    {
        // ESC/POS QR code: GS ( k ...
        var dataBytes = Encoding.UTF8.GetBytes(data);
        int len = dataBytes.Length + 3;
        ms.WriteByte(GS); ms.WriteByte(0x28); ms.WriteByte(0x6b);
        ms.WriteByte((byte)(len & 0xff)); ms.WriteByte((byte)((len >> 8) & 0xff));
        ms.WriteByte(0x31); ms.WriteByte(0x41); ms.WriteByte(0x20);
        ms.WriteByte((byte)(dataBytes.Length & 0xff)); ms.WriteByte((byte)((dataBytes.Length >> 8) & 0xff));
        ms.Write(dataBytes, 0, dataBytes.Length);
        // Print the QR symbol
        ms.WriteByte(GS); ms.WriteByte(0x28); ms.WriteByte(0x6b);
        ms.WriteByte(0x03); ms.WriteByte(0x00);
        ms.WriteByte(0x31); ms.WriteByte(0x45); ms.WriteByte(0x20);
    }
}

// ── Windows RawPrinterHelper (P/Invoke) ──────────────────────────────────

public static class RawPrinterHelper
{
    [DllImport("winspool.drv", CharSet = CharSet.Auto, SetLastError = true)]
    private static extern bool OpenPrinter(string pPrinterName, out IntPtr hPrinter, IntPtr pDefault);

    [DllImport("winspool.drv", SetLastError = true)]
    private static extern bool ClosePrinter(IntPtr hPrinter);

    [DllImport("winspool.drv", SetLastError = true)]
    private static extern bool StartDocPrinter(IntPtr hPrinter, int level, ref DOCINFO di);

    [DllImport("winspool.drv", SetLastError = true)]
    private static extern bool EndDocPrinter(IntPtr hPrinter);

    [DllImport("winspool.drv", SetLastError = true)]
    private static extern bool StartPagePrinter(IntPtr hPrinter);

    [DllImport("winspool.drv", SetLastError = true)]
    private static extern bool EndPagePrinter(IntPtr hPrinter);

    [DllImport("winspool.drv", SetLastError = true)]
    private static extern bool WritePrinter(IntPtr hPrinter, byte[] pBuf, int bufLen, out int pcWritten);

    [DllImport("winspool.drv", CharSet = CharSet.Auto, SetLastError = true)]
    private static extern bool GetDefaultPrinter(StringBuilder pszBuffer, ref int pcchBuffer);

    [StructLayout(LayoutKind.Sequential)]
    private struct DOCINFO
    {
        [MarshalAs(UnmanagedType.LPTStr)] public string DocName;
        [MarshalAs(UnmanagedType.LPTStr)] public string OutputFile;
        [MarshalAs(UnmanagedType.LPTStr)] public string DataType;
    }

    public static void SendRawData(string printerName, byte[] data)
    {
        IntPtr hPrinter;
        var pDefault = IntPtr.Zero;
        if (!OpenPrinter(printerName.Normalize(), out hPrinter, pDefault))
            throw new Exception($"Cannot open printer '{printerName}'");

        try
        {
            var di = new DOCINFO { DocName = "School ERP Receipt", DataType = "RAW", OutputFile = null };
            if (!StartDocPrinter(hPrinter, 1, ref di))
                throw new Exception("StartDocPrinter failed");
            try
            {
                StartPagePrinter(hPrinter);
                WritePrinter(hPrinter, data, data.Length, out _);
                EndPagePrinter(hPrinter);
            }
            finally
            {
                EndDocPrinter(hPrinter);
            }
        }
        finally
        {
            ClosePrinter(hPrinter);
        }
    }

    public static string GetDefaultPrinterName()
    {
        int size = 256;
        var sb = new StringBuilder(size);
        return GetDefaultPrinter(sb, ref size) ? sb.ToString() : null!;
    }
}

// ── Data models (match the TypeScript PrintPayload) ──────────────────────

public class PrintPayload
{
    [JsonPropertyName("kind")] public string Kind { get; set; } = "";
    [JsonPropertyName("title")] public string Title { get; set; } = "";
    [JsonPropertyName("schoolName")] public string SchoolName { get; set; } = "";
    [JsonPropertyName("lines")] public List<PrintLine> Lines { get; set; } = new();
}

public class PrintLine
{
    [JsonPropertyName("type")] public string Type { get; set; } = "";
    [JsonPropertyName("value")] public string? Value { get; set; }
    [JsonPropertyName("align")] public string? Align { get; set; }
    [JsonPropertyName("bold")] public bool? Bold { get; set; }
    [JsonPropertyName("size")] public string? Size { get; set; }
    [JsonPropertyName("char")] public string? Char { get; set; }
    [JsonPropertyName("key")] public string? Key { get; set; }
    [JsonPropertyName("label")] public string? Label { get; set; }
    [JsonPropertyName("columns")] public List<PrintColumn>? Columns { get; set; }
}

public class PrintColumn
{
    [JsonPropertyName("header")] public string? Header { get; set; }
    [JsonPropertyName("value")] public string? Value { get; set; }
    [JsonPropertyName("align")] public string? Align { get; set; }
}

public class PrinterConfig
{
    public string Mode { get; set; } = "windows";
    public string Host { get; set; } = "";
    public int Port { get; set; } = 9100;
    public string Device { get; set; } = "";
    public string Name { get; set; } = "";
}

public record PrintResult(bool Ok, string? Error = null);
public record PrinterStatus(bool Connected, string? Name = null, string? Error = null);
