import type { ReceiptData } from "@/components/ReceiptPrint";
import { formatCurrency, formatDate } from "@/lib/format";

export type PrintKind = "fee-receipt" | "hall-ticket" | "bus-pass" | "report-card" | "generic";

export type PrintPayload = {
  kind: PrintKind;
  title: string;
  schoolName: string;
  lines: PrintLine[];
};

export type PrintLine =
  | { type: "text"; value: string; align?: "left" | "center" | "right"; bold?: boolean; size?: "normal" | "wide" }
  | { type: "divider"; char?: string }
  | { type: "blank" }
  | { type: "kv"; key: string; value: string }
  | { type: "items"; columns: { header: string; value: string; align?: "left" | "right" }[] }
  | { type: "total"; label: string; value: string }
  | { type: "qr"; value: string };

type DesktopBridge = {
  thermalPrint?: (payload: PrintPayload) => Promise<{ ok: boolean; error?: string }>;
  getPrinterStatus?: () => Promise<{ connected: boolean; name?: string; error?: string }>;
};

declare global {
  interface Window {
    desktopBridge?: DesktopBridge;
  }
}

export function isDesktop(): boolean {
  return typeof window !== "undefined" && !!window.desktopBridge?.thermalPrint;
}

export function buildFeeReceiptPayload(data: ReceiptData): PrintPayload {
  const lines: PrintLine[] = [
    { type: "text", value: "Yug International School", align: "center", bold: true, size: "wide" },
    { type: "text", value: "Fee Payment Receipt", align: "center", bold: true },
    { type: "divider", char: "-" },
    { type: "kv", key: "Receipt No", value: data.receipt_no },
    { type: "kv", key: "Student", value: data.student_name },
    { type: "kv", key: "Admission No", value: data.admission_no },
    ...(data.class_name ? [{ type: "kv" as const, key: "Class", value: data.class_name }] : []),
    { type: "kv", key: "Date", value: formatDate(data.payment_date) },
    { type: "kv", key: "Method", value: data.payment_method },
    { type: "divider", char: "-" },
    ...data.items.flatMap((item) => [
      { type: "items" as const, columns: [
        { header: item.label, value: "", align: "left" as const },
        { header: formatCurrency(item.amount), value: "", align: "right" as const },
      ] },
    ]),
    { type: "divider", char: "-" },
    { type: "total", label: "TOTAL", value: formatCurrency(data.total) },
    { type: "divider", char: "=" },
    { type: "text", value: "** PAID **", align: "center", bold: true },
    { type: "blank" },
    { type: "text", value: "Computer-generated receipt", align: "center" },
    { type: "qr", value: `RECEIPT:${data.receipt_no}:${data.total}` },
  ];
  return { kind: "fee-receipt", title: `Fee Receipt ${data.receipt_no}`, schoolName: "Yug International School", lines };
}

export function buildHallTicketPayload(row: {
  studentName: string;
  admissionNo: string;
  hallTicketNo: string;
  examName: string;
  examCode: string;
  examDate: string;
  examCenter: string;
}): PrintPayload {
  return {
    kind: "hall-ticket",
    title: `Hall Ticket ${row.hallTicketNo}`,
    schoolName: "Yug International School",
    lines: [
      { type: "text", value: "Yug International School", align: "center", bold: true, size: "wide" },
      { type: "text", value: "Examination Hall Ticket", align: "center", bold: true },
      { type: "divider", char: "=" },
      { type: "kv", key: "Hall Ticket No", value: row.hallTicketNo },
      { type: "kv", key: "Student", value: row.studentName },
      { type: "kv", key: "Admission No", value: row.admissionNo },
      { type: "divider", char: "-" },
      { type: "kv", key: "Exam", value: row.examName },
      { type: "kv", key: "Exam Code", value: row.examCode },
      { type: "kv", key: "Exam Date", value: formatDate(row.examDate) },
      { type: "kv", key: "Center", value: row.examCenter || "TBA" },
      { type: "divider", char: "=" },
      { type: "text", value: "Please carry this ticket to the exam hall.", align: "center" },
      { type: "text", value: "Report 30 min before start time.", align: "center" },
      { type: "blank" },
      { type: "qr", value: `HALLTICKET:${row.hallTicketNo}:${row.admissionNo}` },
    ],
  };
}

export function buildBusPassPayload(row: {
  studentName: string;
  admissionNo: string;
  busNo: string;
  routeName: string;
  pickupPoint: string;
  validTill: string;
}): PrintPayload {
  return {
    kind: "bus-pass",
    title: `Bus Pass ${row.admissionNo}`,
    schoolName: "Yug International School",
    lines: [
      { type: "text", value: "Yug International School", align: "center", bold: true, size: "wide" },
      { type: "text", value: "Bus Pass", align: "center", bold: true },
      { type: "divider", char: "=" },
      { type: "kv", key: "Student", value: row.studentName },
      { type: "kv", key: "Admission No", value: row.admissionNo },
      { type: "divider", char: "-" },
      { type: "kv", key: "Bus No", value: row.busNo },
      { type: "kv", key: "Route", value: row.routeName },
      { type: "kv", key: "Pickup Point", value: row.pickupPoint || "—" },
      { type: "kv", key: "Valid Till", value: formatDate(row.validTill) },
      { type: "divider", char: "=" },
      { type: "text", value: "Show this pass while boarding the bus.", align: "center" },
      { type: "blank" },
      { type: "qr", value: `BUSPASS:${row.admissionNo}:${row.busNo}` },
    ],
  };
}

export async function thermalPrint(payload: PrintPayload): Promise<{ ok: boolean; error?: string }> {
  if (isDesktop() && window.desktopBridge?.thermalPrint) {
    try {
      return await window.desktopBridge.thermalPrint(payload);
    } catch (e) {
      return { ok: false, error: e instanceof Error ? e.message : "Thermal print failed" };
    }
  }
  return { ok: false, error: "Desktop printer bridge not available — running in browser mode. Use Ctrl+P or the Print button for browser printing." };
}

export async function getPrinterStatus(): Promise<{ connected: boolean; name?: string; error?: string }> {
  if (isDesktop() && window.desktopBridge?.getPrinterStatus) {
    try {
      return await window.desktopBridge.getPrinterStatus();
    } catch (e) {
      return { connected: false, error: e instanceof Error ? e.message : "Status check failed" };
    }
  }
  return { connected: false, error: "No desktop bridge" };
}
