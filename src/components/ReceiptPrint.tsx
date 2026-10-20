import { useRef } from "react";
import { Printer, Check } from "lucide-react";
import { Button } from "@/components/Button";
import { formatCurrency, formatDate } from "@/lib/format";

export type ReceiptData = {
  receipt_no: string;
  student_name: string;
  admission_no: string;
  class_name?: string;
  items: { label: string; amount: number }[];
  payment_method: string;
  payment_date: string;
  total: number;
  remarks?: string | null;
};

export function ReceiptPrint({ data, onDone }: { data: ReceiptData; onDone?: () => void }) {
  const receiptRef = useRef<HTMLDivElement>(null);

  const handlePrint = () => {
    const html = receiptRef.current?.innerHTML ?? "";
    const win = window.open("", "_blank", "width=480,height=640");
    if (!win) {
      alert("Please allow popups to print the receipt.");
      return;
    }
    win.document.write(`<!doctype html><html><head><title>Receipt ${data.receipt_no}</title>
    <style>
      * { font-family: 'Inter', system-ui, sans-serif; box-sizing: border-box; }
      body { margin: 0; padding: 24px; color: #0f172a; }
      .receipt { max-width: 420px; margin: 0 auto; }
      .header { text-align: center; border-bottom: 2px dashed #cbd5e1; padding-bottom: 16px; margin-bottom: 16px; }
      .school { font-size: 20px; font-weight: 700; color: #0c4a6e; }
      .sub { font-size: 12px; color: #64748b; margin-top: 2px; }
      .receipt-title { text-align: center; font-size: 14px; font-weight: 600; letter-spacing: 0.1em; text-transform: uppercase; margin: 16px 0; color: #0369a1; }
      .meta { display: flex; justify-content: space-between; font-size: 13px; margin-bottom: 4px; }
      .meta strong { color: #334155; }
      table { width: 100%; border-collapse: collapse; margin: 16px 0; font-size: 13px; }
      th { text-align: left; padding: 8px 0; border-bottom: 1px solid #e2e8f0; color: #64748b; font-size: 11px; text-transform: uppercase; }
      td { padding: 8px 0; border-bottom: 1px solid #f1f5f9; }
      .amt { text-align: right; font-variant-numeric: tabular-nums; }
      .total-row { display: flex; justify-content: space-between; padding: 12px 0; border-top: 2px solid #0f172a; margin-top: 8px; font-size: 16px; font-weight: 700; }
      .footer { text-align: center; font-size: 11px; color: #94a3b8; margin-top: 24px; border-top: 1px dashed #cbd5e1; padding-top: 12px; }
      .stamp { display: inline-block; border: 2px solid #16a34a; color: #16a34a; padding: 4px 12px; border-radius: 4px; font-size: 11px; font-weight: 600; transform: rotate(-8deg); margin-top: 12px; }
    </style></head><body><div class="receipt">${html}</div>
    <script>window.onload = function() { window.print(); setTimeout(function() { window.close(); }, 300); }</script>
    </body></html>`);
    win.document.close();
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2 text-emerald-600">
          <Check size={18} />
          <span className="text-sm font-medium">Payment recorded successfully</span>
        </div>
        <Button variant="secondary" onClick={handlePrint}>
          <Printer size={16} /> Print Receipt
        </Button>
      </div>

      <div ref={receiptRef} className="rounded-xl border border-slate-200 bg-white p-5">
        <div className="header text-center border-b-2 border-dashed border-slate-300 pb-4 mb-4">
          <p className="text-xl font-bold text-sky-800">Yug International School</p>
          <p className="text-xs text-slate-500 mt-0.5">Fee Payment Receipt</p>
        </div>

        <div className="receipt-title text-center text-sm font-semibold tracking-wide uppercase text-sky-700 my-4">
          Receipt
        </div>

        <div className="space-y-1.5 text-[13px]">
          <div className="flex justify-between"><strong className="text-slate-700">Receipt No:</strong> {data.receipt_no}</div>
          <div className="flex justify-between"><strong className="text-slate-700">Student:</strong> {data.student_name}</div>
          <div className="flex justify-between"><strong className="text-slate-700">Admission No:</strong> {data.admission_no}</div>
          {data.class_name && <div className="flex justify-between"><strong className="text-slate-700">Class:</strong> {data.class_name}</div>}
          <div className="flex justify-between"><strong className="text-slate-700">Date:</strong> {formatDate(data.payment_date)}</div>
          <div className="flex justify-between"><strong className="text-slate-700">Method:</strong> {data.payment_method}</div>
        </div>

        <table className="w-full my-4 text-[13px]">
          <thead>
            <tr className="border-b border-slate-200 text-slate-500 text-[11px] uppercase">
              <th className="text-left py-2">Description</th>
              <th className="text-right py-2">Amount</th>
            </tr>
          </thead>
          <tbody>
            {data.items.map((item, i) => (
              <tr key={i} className="border-b border-slate-100">
                <td className="py-2">{item.label}</td>
                <td className="py-2 text-right tabular-nums">{formatCurrency(item.amount)}</td>
              </tr>
            ))}
          </tbody>
        </table>

        <div className="flex justify-between border-t-2 border-slate-900 pt-3 text-base font-bold">
          <span>Total</span>
          <span className="tabular-nums">{formatCurrency(data.total)}</span>
        </div>

        {data.remarks && (
          <p className="mt-3 text-xs text-slate-500">Remarks: {data.remarks}</p>
        )}

        <div className="footer text-center text-[11px] text-slate-400 mt-6 border-t border-dashed border-slate-300 pt-3">
          <p>This is a computer-generated receipt.</p>
          <div className="stamp inline-block border-2 border-emerald-500 text-emerald-600 px-3 py-1 rounded text-[11px] font-semibold -rotate-6 mt-3">PAID</div>
        </div>
      </div>

      {onDone && (
        <div className="mt-4 text-right">
          <Button variant="ghost" onClick={onDone}>Close</Button>
        </div>
      )}
    </div>
  );
}
