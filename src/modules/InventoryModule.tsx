import { useEffect, useMemo, useState } from "react";
import { Package, Plus, Trash2, ShoppingCart, Search, Printer, AlertTriangle, Boxes, IndianRupee, Minus, Edit3 } from "lucide-react";
import { supabase } from "@/lib/supabase";
import type { InventoryItem, InventorySale } from "@/types/db";
import { Button } from "@/components/Button";
import { Modal } from "@/components/Modal";
import { Badge } from "@/components/Badge";
import { Field, SelectField } from "@/components/Field";
import { formatCurrency, formatDate } from "@/lib/format";
import { cn } from "@/lib/cn";

type CartItem = { item_id: string; name: string; qty: number; price: number; stock: number };

export function InventoryModule() {
  const [tab, setTab] = useState<"stock" | "pos">("stock");
  const [items, setItems] = useState<InventoryItem[]>([]);
  const [sales, setSales] = useState<InventorySale[]>([]);
  const [loading, setLoading] = useState(false);
  const [addOpen, setAddOpen] = useState(false);
  const [editItem, setEditItem] = useState<InventoryItem | null>(null);
  const [search, setSearch] = useState("");
  const [cart, setCart] = useState<CartItem[]>([]);
  const [discount, setDiscount] = useState("0");
  const [taxPct, setTaxPct] = useState("0");
  const [customerName, setCustomerName] = useState("Walk-in Customer");
  const [customerPhone, setCustomerPhone] = useState("");
  const [paymentMethod, setPaymentMethod] = useState("Cash");
  const [billSale, setBillSale] = useState<InventorySale | null>(null);

  const tabs = [
    { key: "stock" as const, label: "Stock", icon: <Package size={16} /> },
    { key: "pos" as const, label: "Counter Sale", icon: <ShoppingCart size={16} /> },
  ];

  const loadItems = () => {
    setLoading(true);
    supabase.from("inventory_items").select("*").order("name").then(({ data, error }) => {
      if (!error) setItems((data ?? []) as InventoryItem[]);
      setLoading(false);
    });
  };

  const loadSales = () => {
    supabase.from("inventory_sales").select("*").order("created_at", { ascending: false }).limit(20).then(({ data }) => {
      setSales((data ?? []) as InventorySale[]);
    });
  };

  useEffect(() => { loadItems(); loadSales(); }, []);

  const filteredItems = useMemo(() => {
    if (!search.trim()) return items;
    const q = search.toLowerCase();
    return items.filter((i) => i.name.toLowerCase().includes(q) || (i.sku ?? "").toLowerCase().includes(q) || (i.barcode ?? "").toLowerCase().includes(q));
  }, [items, search]);

  const lowStock = items.filter((i) => i.stock_qty <= i.reorder_level);
  const stockValue = items.reduce((sum, i) => sum + i.cost_price * i.stock_qty, 0);

  const summary = [
    { label: "Total Items", value: items.length, icon: <Boxes size={16} />, tone: "info" },
    { label: "Low Stock", value: lowStock.length, icon: <AlertTriangle size={16} />, tone: lowStock.length > 0 ? "warning" : "success" },
    { label: "Stock Value", value: formatCurrency(stockValue), icon: <IndianRupee size={16} />, tone: "neutral" },
  ];

  const deleteItem = async (id: string) => { await supabase.from("inventory_items").delete().eq("id", id); loadItems(); };

  const addToCart = (item: InventoryItem) => {
    setCart((prev) => {
      const existing = prev.find((c) => c.item_id === item.id);
      if (existing) return prev.map((c) => c.item_id === item.id ? { ...c, qty: Math.min(c.qty + 1, item.stock_qty) } : c);
      return [...prev, { item_id: item.id, name: item.name, qty: 1, price: item.unit_price, stock: item.stock_qty }];
    });
  };

  const updateQty = (id: string, delta: number) => {
    setCart((prev) => prev.map((c) => c.item_id === id ? { ...c, qty: Math.max(1, Math.min(c.qty + delta, c.stock)) } : c));
  };

  const removeFromCart = (id: string) => setCart((prev) => prev.filter((c) => c.item_id !== id));

  const subtotal = cart.reduce((sum, c) => sum + c.price * c.qty, 0);
  const discountAmt = Number(discount) || 0;
  const taxAmt = (subtotal - discountAmt) * (Number(taxPct) || 0) / 100;
  const total = subtotal - discountAmt + taxAmt;

  const completeSale = async () => {
    if (cart.length === 0) return;
    const today = new Date();
    const billNo = `INV-${today.getFullYear()}${String(today.getMonth() + 1).padStart(2, "0")}${String(today.getDate()).padStart(2, "0")}-${String(sales.length + 1).padStart(3, "0")}`;
    const sale = {
      bill_no: billNo, customer_name: customerName, customer_phone: customerPhone || null,
      items: cart.map((c) => ({ item_id: c.item_id, name: c.name, qty: c.qty, price: c.price })),
      subtotal, discount: discountAmt, tax: taxAmt, total, payment_method: paymentMethod, served_by: "Admin",
    };
    const { data } = await supabase.from("inventory_sales").insert(sale).select().single();
    for (const c of cart) {
      const item = items.find((i) => i.id === c.item_id);
      if (item) await supabase.from("inventory_items").update({ stock_qty: Math.max(0, item.stock_qty - c.qty) }).eq("id", item.id);
    }
    if (data) { setBillSale(data as InventorySale); setCart([]); setDiscount("0"); setTaxPct("0"); }
    loadItems(); loadSales();
  };

  const printBill = (sale: InventorySale) => {
    const w = window.open("", "_blank");
    if (!w) return;
    const itemsHtml = (sale.items as CartItem[]).map((i) => `<tr><td>${i.name}</td><td style="text-align:center">${i.qty}</td><td style="text-align:right">₹${i.price}</td><td style="text-align:right">₹${i.price * i.qty}</td></tr>`).join("");
    w.document.write(`<html><head><title>${sale.bill_no}</title>
      <style>
        body{font-family:monospace;max-width:320px;margin:0 auto;padding:10px;font-size:12px;color:#1e293b;}
        h2{text-align:center;font-size:16px;margin:5px 0;}
        .sub{text-align:center;font-size:10px;color:#64748b;margin-bottom:10px;}
        table{width:100%;border-collapse:collapse;margin:8px 0;}
        th,td{padding:3px 4px;border-bottom:1px dashed #cbd5e1;font-size:11px;}
        th{text-align:left;font-weight:bold;}
        .total{font-weight:bold;font-size:14px;border-top:2px solid #1e293b;padding-top:5px;margin-top:5px;}
        .right{text-align:right;}
        .center{text-align:center;margin-top:10px;font-size:10px;color:#64748b;}
      </style></head><body>
      <h2>Yug International School</h2>
      <div class="sub">School Store · ${sale.bill_no}</div>
      <div class="sub">Date: ${formatDate(sale.sale_date)}</div>
      <div>Customer: ${sale.customer_name}</div>
      <hr>
      <table><thead><tr><th>Item</th><th style="text-align:center">Qty</th><th style="text-align:right">Price</th><th style="text-align:right">Amt</th></tr></thead><tbody>${itemsHtml}</tbody></table>
      <div class="right">Subtotal: ₹${sale.subtotal}</div>
      ${sale.discount > 0 ? `<div class="right">Discount: -₹${sale.discount}</div>` : ""}
      ${sale.tax > 0 ? `<div class="right">Tax: ₹${sale.tax}</div>` : ""}
      <div class="total right">Total: ₹${sale.total}</div>
      <div class="right">Paid by: ${sale.payment_method}</div>
      <div class="center">Thank you for your purchase!</div>
      </body></html>`);
    w.document.close();
    w.print();
  };

  return (
    <div className="space-y-5">
      <div className="flex items-center gap-1 rounded-xl bg-slate-100 p-1 w-fit">
        {tabs.map((t) => (
          <button key={t.key} onClick={() => setTab(t.key)}
            className={cn("flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium transition", tab === t.key ? "bg-white text-slate-900 shadow-sm" : "text-slate-500 hover:text-slate-700")}>
            {t.icon} {t.label}
          </button>
        ))}
      </div>

      {tab === "stock" && (
        <>
          <div className="grid grid-cols-3 gap-2">
            {summary.map((s, i) => (
              <div key={i} className={cn("rounded-xl ring-1 px-4 py-3 flex items-center gap-3",
                s.tone === "warning" ? "bg-amber-50 ring-amber-200 text-amber-700" : s.tone === "info" ? "bg-sky-50 ring-sky-200 text-sky-700" : "bg-slate-50 ring-slate-200 text-slate-700")}>
                {s.icon}<div><p className="text-lg font-bold">{s.value}</p><p className="text-xs opacity-80">{s.label}</p></div>
              </div>
            ))}
          </div>

          <div className="flex items-center gap-3">
            <div className="relative flex-1 max-w-sm">
              <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search by name, SKU, barcode…"
                className="w-full rounded-lg border border-slate-300 pl-9 pr-3 py-2 text-sm focus:border-sky-500 focus:ring-2 focus:ring-sky-200 outline-none" />
            </div>
            <Button onClick={() => { setEditItem(null); setAddOpen(true); }}><Plus size={14} /> Add Item</Button>
          </div>

          <div className="rounded-2xl bg-white ring-1 ring-slate-200 shadow-sm overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50">
                  <th className="text-left px-4 py-2.5 font-semibold text-slate-600">Name</th>
                  <th className="text-left px-4 py-2.5 font-semibold text-slate-600">Category</th>
                  <th className="text-left px-4 py-2.5 font-semibold text-slate-600">SKU/Barcode</th>
                  <th className="text-right px-4 py-2.5 font-semibold text-slate-600">Price</th>
                  <th className="text-center px-4 py-2.5 font-semibold text-slate-600">Stock</th>
                  <th className="text-right px-4 py-2.5 font-semibold text-slate-600">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {loading ? <tr><td colSpan={6} className="px-4 py-8 text-center text-slate-400">Loading…</td></tr> :
                 filteredItems.length === 0 ? <tr><td colSpan={6} className="px-4 py-8 text-center text-slate-400">No items found.</td></tr> :
                 filteredItems.map((item) => (
                  <tr key={item.id} className="hover:bg-slate-50">
                    <td className="px-4 py-3 font-medium text-slate-900">{item.name}{item.size && <span className="text-xs text-slate-400 ml-1">({item.size})</span>}</td>
                    <td className="px-4 py-3"><Badge tone="info">{item.category}</Badge></td>
                    <td className="px-4 py-3 text-xs font-mono text-slate-500">{item.sku ?? item.barcode ?? "—"}</td>
                    <td className="px-4 py-3 text-right text-slate-700">{formatCurrency(item.unit_price)}</td>
                    <td className="px-4 py-3 text-center">
                      <span className={cn("font-medium", item.stock_qty <= item.reorder_level ? "text-rose-600" : "text-emerald-600")}>
                        {item.stock_qty} {item.unit}
                      </span>
                      {item.stock_qty <= item.reorder_level && <AlertTriangle size={11} className="inline ml-1 text-rose-500" />}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <button onClick={() => { setEditItem(item); setAddOpen(true); }} className="text-slate-400 hover:text-sky-600 mr-2"><Edit3 size={15} /></button>
                      <button onClick={() => deleteItem(item.id)} className="text-slate-400 hover:text-rose-600"><Trash2 size={15} /></button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}

      {tab === "pos" && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
          {/* Item search */}
          <div className="lg:col-span-2 rounded-2xl bg-white ring-1 ring-slate-200 shadow-sm p-4 space-y-3">
            <div className="relative">
              <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search items to add to cart…"
                className="w-full rounded-lg border border-slate-300 pl-9 pr-3 py-2 text-sm focus:border-sky-500 focus:ring-2 focus:ring-sky-200 outline-none" />
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 max-h-[400px] overflow-y-auto">
              {filteredItems.map((item) => (
                <button key={item.id} onClick={() => addToCart(item)} disabled={item.stock_qty === 0}
                  className={cn("rounded-xl ring-1 p-3 text-left transition disabled:opacity-40", "ring-slate-200 hover:ring-sky-300 hover:bg-sky-50")}>
                  <p className="text-sm font-medium text-slate-900 truncate">{item.name}</p>
                  <p className="text-xs text-slate-500">{formatCurrency(item.unit_price)}</p>
                  <p className="text-xs mt-1 text-slate-400">Stock: {item.stock_qty}</p>
                </button>
              ))}
            </div>
          </div>

          {/* Cart */}
          <div className="rounded-2xl bg-white ring-1 ring-slate-200 shadow-sm p-4 space-y-3">
            <h3 className="font-semibold text-slate-900 flex items-center gap-2"><ShoppingCart size={18} /> Cart ({cart.length})</h3>
            {cart.length === 0 ? (
              <p className="text-sm text-slate-400 py-6 text-center">Click items to add.</p>
            ) : (
              <div className="space-y-2 max-h-48 overflow-y-auto">
                {cart.map((c) => (
                  <div key={c.item_id} className="flex items-center gap-2 text-sm">
                    <div className="min-w-0 flex-1"><p className="font-medium text-slate-800 truncate">{c.name}</p><p className="text-xs text-slate-500">{formatCurrency(c.price)}</p></div>
                    <button onClick={() => updateQty(c.item_id, -1)} className="rounded p-1 bg-slate-100 hover:bg-slate-200"><Minus size={12} /></button>
                    <span className="w-6 text-center font-medium">{c.qty}</span>
                    <button onClick={() => updateQty(c.item_id, 1)} className="rounded p-1 bg-slate-100 hover:bg-slate-200"><Plus size={12} /></button>
                    <button onClick={() => removeFromCart(c.item_id)} className="text-slate-400 hover:text-rose-600"><Trash2 size={14} /></button>
                  </div>
                ))}
              </div>
            )}
            <Field label="Customer Name" value={customerName} onChange={(e) => setCustomerName(e.target.value)} />
            <Field label="Phone" value={customerPhone} onChange={(e) => setCustomerPhone(e.target.value)} />
            <SelectField label="Payment Method" value={paymentMethod} onChange={(e) => setPaymentMethod(e.target.value)}
              options={["Cash", "UPI", "Card", "Cheque"].map((m) => ({ value: m, label: m }))} />
            <div className="grid grid-cols-2 gap-2">
              <Field label="Discount (₹)" type="number" value={discount} onChange={(e) => setDiscount(e.target.value)} />
              <Field label="Tax (%)" type="number" value={taxPct} onChange={(e) => setTaxPct(e.target.value)} />
            </div>
            <div className="border-t border-slate-100 pt-2 space-y-1 text-sm">
              <div className="flex justify-between text-slate-500"><span>Subtotal</span><span>{formatCurrency(subtotal)}</span></div>
              {discountAmt > 0 && <div className="flex justify-between text-slate-500"><span>Discount</span><span>-{formatCurrency(discountAmt)}</span></div>}
              {taxAmt > 0 && <div className="flex justify-between text-slate-500"><span>Tax</span><span>{formatCurrency(taxAmt)}</span></div>}
              <div className="flex justify-between font-bold text-slate-900 text-base"><span>Total</span><span>{formatCurrency(total)}</span></div>
            </div>
            <Button onClick={completeSale} disabled={cart.length === 0} className="w-full"><ShoppingCart size={14} /> Complete Sale</Button>
            {billSale && <Button variant="secondary" onClick={() => printBill(billSale)} className="w-full"><Printer size={14} /> Print Bill</Button>}
          </div>

          {/* Recent sales */}
          <div className="lg:col-span-3 rounded-2xl bg-white ring-1 ring-slate-200 shadow-sm overflow-hidden">
            <div className="px-4 py-3 border-b border-slate-100"><h3 className="font-semibold text-slate-900">Recent Sales</h3></div>
            <table className="w-full text-sm">
              <thead><tr className="border-b border-slate-100">
                <th className="text-left px-4 py-2 font-semibold text-slate-600">Bill No</th>
                <th className="text-left px-4 py-2 font-semibold text-slate-600">Customer</th>
                <th className="text-center px-4 py-2 font-semibold text-slate-600">Items</th>
                <th className="text-right px-4 py-2 font-semibold text-slate-600">Total</th>
                <th className="text-left px-4 py-2 font-semibold text-slate-600">Date</th>
                <th className="text-right px-4 py-2 font-semibold text-slate-600">Action</th>
              </tr></thead>
              <tbody className="divide-y divide-slate-100">
                {sales.length === 0 ? <tr><td colSpan={6} className="px-4 py-6 text-center text-slate-400">No sales yet.</td></tr> :
                 sales.map((s) => (
                  <tr key={s.id} className="hover:bg-slate-50">
                    <td className="px-4 py-2.5 font-mono text-xs text-slate-600">{s.bill_no}</td>
                    <td className="px-4 py-2.5 text-slate-800">{s.customer_name}</td>
                    <td className="px-4 py-2.5 text-center text-slate-500">{(s.items as CartItem[]).length}</td>
                    <td className="px-4 py-2.5 text-right font-medium text-slate-800">{formatCurrency(s.total)}</td>
                    <td className="px-4 py-2.5 text-slate-500 text-xs">{formatDate(s.sale_date)}</td>
                    <td className="px-4 py-2.5 text-right"><button onClick={() => printBill(s)} className="text-sky-600 hover:text-sky-800"><Printer size={15} /></button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <ItemFormModal open={addOpen} onClose={() => setAddOpen(false)} editItem={editItem} onSaved={() => { setAddOpen(false); loadItems(); }} />
    </div>
  );
}

function ItemFormModal({ open, onClose, editItem, onSaved }: {
  open: boolean; onClose: () => void; editItem: InventoryItem | null; onSaved: () => void;
}) {
  const [form, setForm] = useState({ name: "", category: "Uniform", sku: "", barcode: "", size: "", color: "", unit_price: "0", cost_price: "0", stock_qty: "0", reorder_level: "5", unit: "pcs" });

  useEffect(() => {
    if (editItem) setForm({
      name: editItem.name, category: editItem.category, sku: editItem.sku ?? "", barcode: editItem.barcode ?? "",
      size: editItem.size ?? "", color: editItem.color ?? "", unit_price: String(editItem.unit_price),
      cost_price: String(editItem.cost_price), stock_qty: String(editItem.stock_qty),
      reorder_level: String(editItem.reorder_level), unit: editItem.unit,
    });
    else setForm({ name: "", category: "Uniform", sku: "", barcode: "", size: "", color: "", unit_price: "0", cost_price: "0", stock_qty: "0", reorder_level: "5", unit: "pcs" });
  }, [editItem, open]);

  const save = async () => {
    const payload = { ...form, unit_price: Number(form.unit_price), cost_price: Number(form.cost_price), stock_qty: Number(form.stock_qty), reorder_level: Number(form.reorder_level) };
    if (editItem) await supabase.from("inventory_items").update(payload).eq("id", editItem.id);
    else await supabase.from("inventory_items").insert(payload);
    onSaved();
  };

  return (
    <Modal open={open} onClose={onClose} title={editItem ? "Edit Item" : "Add Item"} size="lg"
      footer={<div className="flex justify-end gap-2"><Button variant="secondary" onClick={onClose}>Cancel</Button><Button onClick={save}>Save</Button></div>}>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <Field label="Name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
        <SelectField label="Category" value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })}
          options={["Uniform", "Book", "Stationery", "Sports", "Other"].map((c) => ({ value: c, label: c }))} />
        <Field label="SKU" value={form.sku} onChange={(e) => setForm({ ...form, sku: e.target.value })} />
        <Field label="Barcode" value={form.barcode} onChange={(e) => setForm({ ...form, barcode: e.target.value })} />
        <Field label="Size" value={form.size} onChange={(e) => setForm({ ...form, size: e.target.value })} />
        <Field label="Color" value={form.color} onChange={(e) => setForm({ ...form, color: e.target.value })} />
        <Field label="Selling Price (₹)" type="number" value={form.unit_price} onChange={(e) => setForm({ ...form, unit_price: e.target.value })} />
        <Field label="Cost Price (₹)" type="number" value={form.cost_price} onChange={(e) => setForm({ ...form, cost_price: e.target.value })} />
        <Field label="Stock Qty" type="number" value={form.stock_qty} onChange={(e) => setForm({ ...form, stock_qty: e.target.value })} />
        <Field label="Reorder Level" type="number" value={form.reorder_level} onChange={(e) => setForm({ ...form, reorder_level: e.target.value })} />
      </div>
    </Modal>
  );
}
