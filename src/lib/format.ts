export function formatCurrency(n: number | null | undefined): string {
  if (n === null || n === undefined) return "—";
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 0,
  }).format(n);
}

export function formatINRShort(n: number | null | undefined): string {
  if (n === null || n === undefined) return "—";
  const abs = Math.abs(n);
  if (abs >= 10000000) return `₹${(n / 10000000).toFixed(2)} Cr`;
  if (abs >= 100000) return `₹${(n / 100000).toFixed(2)} L`;
  if (abs >= 1000) return `₹${(n / 1000).toFixed(1)}K`;
  return `₹${n}`;
}

export function formatDate(d: string | null | undefined): string {
  if (!d) return "—";
  const date = new Date(d);
  if (isNaN(date.getTime())) return "—";
  return date.toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric" });
}

export function formatNumber(n: number | null | undefined): string {
  if (n === null || n === undefined) return "—";
  return new Intl.NumberFormat("en-US").format(n);
}

export function formatTime(t: string | null | undefined): string {
  if (!t) return "—";
  // Accept "HH:MM" or "HH:MM:SS"
  const parts = t.slice(0, 5).split(":");
  if (parts.length < 2) return t;
  let h = Number(parts[0]);
  const m = parts[1];
  if (isNaN(h) || !m) return t;
  const ampm = h >= 12 ? "PM" : "AM";
  h = h % 12 || 12;
  return `${h}:${m} ${ampm}`;
}

export function classNamesForStatus(status: string): "success" | "warning" | "error" | "info" | "neutral" | "default" {
  const s = status.toLowerCase();
  if (["active", "present", "paid", "approved", "in use", "returned"].includes(s)) return "success";
  if (["pending", "on leave", "late", "under maintenance", "issued", "half day"].includes(s)) return "warning";
  if (["suspended", "terminated", "rejected", "overdue", "lost", "disposed", "absent", "inactive"].includes(s))
    return "error";
  if (["processed", "transferred"].includes(s)) return "info";
  if (["graduated"].includes(s)) return "neutral";
  return "default";
}
