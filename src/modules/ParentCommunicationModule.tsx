import { useEffect, useMemo, useState } from "react";
import { MessageSquare, Send, Bell, AlertTriangle, Receipt, GraduationCap, Zap, Phone, CheckCircle2, XCircle, Loader2 } from "lucide-react";
import { supabase } from "@/lib/supabase";
import type { ParentNotification, Student } from "@/types/db";
import { useLookups } from "@/lib/useLookups";
import { Button } from "@/components/Button";
import { Badge } from "@/components/Badge";
import { Field, SelectField, TextareaField } from "@/components/Field";
import { StudentSearchBar, type StudentSearchResult } from "@/components/StudentSearchBar";
import { formatCurrency, formatDate } from "@/lib/format";
import { cn } from "@/lib/cn";

type NotificationRow = ParentNotification & {
  students?: { full_name: string; admission_no: string };
};

type TemplateKey = "Absenteeism" | "FeeDue" | "Emergency" | "ExamNotice" | "Custom";

const TEMPLATES: Record<TemplateKey, { subject: string; body: string; icon: React.ReactNode; tone: string; label: string; desc: string }> = {
  Absenteeism: {
    subject: "Absenteeism Alert",
    body: "Dear Parent, your child {student_name} was marked ABSENT today ({date}). Please contact the school office if this is unexpected.",
    icon: <AlertTriangle size={18} />,
    tone: "bg-amber-50 text-amber-700 ring-amber-200 hover:bg-amber-100",
    label: "Daily Absenteeism Alert",
    desc: "Notify parents of absent students today",
  },
  FeeDue: {
    subject: "Fee Payment Due Reminder",
    body: "Dear Parent, this is a reminder that the fee payment for {student_name} is now due. Kindly clear the dues at the earliest to avoid late charges.",
    icon: <Receipt size={18} />,
    tone: "bg-rose-50 text-rose-700 ring-rose-200 hover:bg-rose-100",
    label: "Fee Payment Due Reminder",
    desc: "Remind parents with outstanding fees",
  },
  Emergency: {
    subject: "Emergency Notice",
    body: "URGENT: {message}. Please follow the school's instructions. For queries contact the office.",
    icon: <Zap size={18} />,
    tone: "bg-red-50 text-red-700 ring-red-200 hover:bg-red-100",
    label: "Emergency Notice",
    desc: "Broadcast an urgent message to all parents",
  },
  ExamNotice: {
    subject: "External Exam Notification",
    body: "Dear Parent, your child {student_name} is enrolled for {exam_name} on {exam_date}. Hall ticket and center details have been shared. Please ensure timely arrival.",
    icon: <GraduationCap size={18} />,
    tone: "bg-sky-50 text-sky-700 ring-sky-200 hover:bg-sky-100",
    label: "External Exam Notification",
    desc: "Notify parents of upcoming external exams",
  },
  Custom: {
    subject: "",
    body: "",
    icon: <MessageSquare size={18} />,
    tone: "bg-slate-50 text-slate-700 ring-slate-200 hover:bg-slate-100",
    label: "Custom Message",
    desc: "Compose a custom message",
  },
};

export function ParentCommunicationModule() {
  const { data: lookups } = useLookups();
  const [channel, setChannel] = useState<"SMS" | "WhatsApp" | "Push">("WhatsApp");
  const [templateKey, setTemplateKey] = useState<TemplateKey>("Custom");
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [recipientPhone, setRecipientPhone] = useState("");
  const [selectedStudent, setSelectedStudent] = useState<StudentSearchResult | null>(null);
  const [broadcast, setBroadcast] = useState(false);
  const [sending, setSending] = useState(false);
  const [sendResult, setSendResult] = useState<{ ok: number; fail: number } | null>(null);
  const [history, setHistory] = useState<NotificationRow[]>([]);
  const [loading, setLoading] = useState(true);

  const loadHistory = async () => {
    setLoading(true);
    const { data } = await supabase
      .from("parent_notifications")
      .select("*, students(full_name, admission_no)")
      .order("created_at", { ascending: false })
      .limit(50);
    setHistory((data ?? []) as NotificationRow[]);
    setLoading(false);
  };

  useEffect(() => { loadHistory(); }, []);

  const applyTemplate = (key: TemplateKey) => {
    setTemplateKey(key);
    const tpl = TEMPLATES[key];
    setSubject(tpl.subject);
    setBody(tpl.body);
  };

  // Build recipients list based on template + selection
  const buildRecipients = async (): Promise<{ student_id: string | null; phone: string; student_name: string }[]> => {
    if (broadcast || templateKey === "Emergency") {
      // Broadcast to all parents with phone numbers
      const { data } = await supabase
        .from("students")
        .select("id, full_name, guardian_id, guardians(phone)")
        .order("full_name");
      const rows = (data ?? []) as unknown as (Student & { guardians?: { phone: string | null } | null })[];
      return rows
        .filter((s) => s.guardians?.phone)
        .map((s) => ({ student_id: s.id, phone: s.guardians!.phone as string, student_name: s.full_name }));
    }
    if (selectedStudent) {
      // Look up guardian phone via the student's guardian_id from the database
      let phone = recipientPhone;
      if (!phone) {
        const { data: student } = await supabase
          .from("students")
          .select("guardian_id, guardians(phone)")
          .eq("id", selectedStudent.id)
          .maybeSingle();
        const row = student as { guardian_id: string | null; guardians?: { phone: string | null } | null } | null;
        phone = row?.guardians?.phone ?? "";
      }
      return [{ student_id: selectedStudent.id, phone: phone || recipientPhone, student_name: selectedStudent.full_name }];
    }
    if (recipientPhone) {
      return [{ student_id: null, phone: recipientPhone, student_name: "Recipient" }];
    }
    return [];
  };

  const personalizeBody = (raw: string, ctx: { student_name?: string; date?: string; exam_name?: string; exam_date?: string; message?: string }) => {
    return raw
      .replace(/\{student_name\}/g, ctx.student_name ?? "")
      .replace(/\{date\}/g, ctx.date ?? new Date().toLocaleDateString("en-IN"))
      .replace(/\{exam_name\}/g, ctx.exam_name ?? "")
      .replace(/\{exam_date\}/g, ctx.exam_date ?? "")
      .replace(/\{message\}/g, ctx.message ?? "");
  };

  const send = async () => {
    setSending(true);
    setSendResult(null);
    try {
      if (!subject.trim() || !body.trim()) throw new Error("Subject and message body are required.");
      const recipients = await buildRecipients();
      if (recipients.length === 0) throw new Error("No recipients found. Select a student or enable broadcast.");

      const inserts = recipients.map((r) => ({
        student_id: r.student_id,
        channel,
        template: templateKey,
        subject: subject.trim(),
        body: personalizeBody(body, { student_name: r.student_name }),
        recipient_phone: r.phone,
        status: "Sent" as const,
        sent_at: new Date().toISOString(),
      }));

      const { error } = await supabase.from("parent_notifications").insert(inserts);
      if (error) throw error;
      setSendResult({ ok: inserts.length, fail: 0 });
      // Reset
      setSubject("");
      setBody("");
      setSelectedStudent(null);
      setRecipientPhone("");
      setBroadcast(false);
      loadHistory();
    } catch (e) {
      setSendResult({ ok: 0, fail: 1 });
      alert(e instanceof Error ? e.message : "Failed to send notifications.");
    } finally {
      setSending(false);
    }
  };

  const stats = useMemo(() => {
    const sent = history.filter((h) => h.status === "Sent").length;
    const failed = history.filter((h) => h.status === "Failed").length;
    return { sent, failed, total: history.length };
  }, [history]);

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-semibold text-slate-900">Parent Communication</h2>
        <p className="text-slate-500 mt-1">Send SMS, WhatsApp, or push notifications to parents with quick-action triggers.</p>
      </div>

      {/* Quick trigger cards */}
      <div>
        <h3 className="text-sm font-semibold text-slate-700 uppercase tracking-wide mb-3">Quick Actions</h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          {(Object.keys(TEMPLATES) as TemplateKey[]).filter((k) => k !== "Custom").map((key) => {
            const tpl = TEMPLATES[key];
            return (
              <button
                key={key}
                onClick={() => applyTemplate(key)}
                className={cn("text-left rounded-xl ring-1 p-4 transition", tpl.tone)}
              >
                <div className="flex items-center gap-2">{tpl.icon}<span className="font-semibold text-sm">{tpl.label}</span></div>
                <p className="text-xs mt-2 opacity-80">{tpl.desc}</p>
              </button>
            );
          })}
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-3 gap-3">
        <StatPill label="Sent" value={stats.sent} icon={<CheckCircle2 size={16} className="text-emerald-500" />} />
        <StatPill label="Failed" value={stats.failed} icon={<XCircle size={16} className="text-rose-500" />} />
        <StatPill label="Total" value={stats.total} icon={<Bell size={16} className="text-sky-500" />} />
      </div>

      {/* Composer */}
      <div className="rounded-2xl bg-white ring-1 ring-slate-200 shadow-sm p-5">
        <h3 className="font-semibold text-slate-900 mb-4">Compose Notification</h3>
        {sendResult && (
          <div className="mb-4 rounded-lg bg-emerald-50 ring-1 ring-emerald-200 px-4 py-3 text-sm text-emerald-700">
            {sendResult.ok > 0 ? `Successfully sent ${sendResult.ok} notification(s).` : "No notifications sent."}
            {sendResult.fail > 0 && ` ${sendResult.fail} failed.`}
          </div>
        )}
        <div className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <SelectField label="Channel" options={["SMS", "WhatsApp", "Push"].map((c) => ({ value: c, label: c }))} value={channel} onChange={(e) => setChannel(e.target.value as typeof channel)} />
            <SelectField label="Template" options={(Object.keys(TEMPLATES) as TemplateKey[]).map((k) => ({ value: k, label: TEMPLATES[k].label }))} value={templateKey} onChange={(e) => applyTemplate(e.target.value as TemplateKey)} />
          </div>

          <div className="flex items-center gap-3">
            <label className="flex items-center gap-2 text-sm text-slate-700">
              <input type="checkbox" checked={broadcast} onChange={(e) => { setBroadcast(e.target.checked); setSelectedStudent(null); }} className="rounded" />
              Broadcast to all parents
            </label>
          </div>

          {!broadcast && (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <StudentSearchBar selected={selectedStudent} onSelect={setSelectedStudent} label="Student (optional)" />
              <Field label="Recipient Phone" value={recipientPhone} onChange={(e) => setRecipientPhone(e.target.value)} placeholder="Enter phone number" />
            </div>
          )}

          <Field label="Subject" required value={subject} onChange={(e) => setSubject(e.target.value)} />
          <TextareaField label="Message" rows={5} value={body} onChange={(e) => setBody(e.target.value)} />
          {body && (
            <p className="text-xs text-slate-400">
              {"{student_name}, {date}, {exam_name}, {exam_date}, {message} will be replaced per recipient."}
            </p>
          )}

          <div className="flex justify-end">
            <Button onClick={send} disabled={sending || !subject.trim() || !body.trim()}>
              {sending ? <Loader2 size={16} className="animate-spin" /> : <Send size={16} />}
              {sending ? "Sending…" : `Send ${channel}`}
            </Button>
          </div>
        </div>
      </div>

      {/* History */}
      <div className="rounded-2xl bg-white ring-1 ring-slate-200 shadow-sm overflow-hidden">
        <div className="px-5 py-4 border-b border-slate-100">
          <h3 className="font-semibold text-slate-900">Recent Notifications</h3>
        </div>
        {loading ? (
          <div className="p-10 text-center text-slate-400 text-sm">Loading…</div>
        ) : history.length === 0 ? (
          <p className="py-10 text-center text-sm text-slate-400">No notifications sent yet.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 text-slate-500 text-xs uppercase tracking-wide">
                <tr>
                  <th className="text-left font-medium px-4 py-3">Recipient</th>
                  <th className="text-left font-medium px-4 py-3">Template</th>
                  <th className="text-left font-medium px-4 py-3">Subject</th>
                  <th className="text-left font-medium px-4 py-3">Channel</th>
                  <th className="text-left font-medium px-4 py-3">Status</th>
                  <th className="text-left font-medium px-4 py-3">Sent</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {history.map((n) => (
                  <tr key={n.id} className="hover:bg-slate-50">
                    <td className="px-4 py-3">
                      <p className="font-medium text-slate-900">{n.students?.full_name ?? "Broadcast"}</p>
                      <p className="text-xs text-slate-500 inline-flex items-center gap-1"><Phone size={10} /> {n.recipient_phone ?? "—"}</p>
                    </td>
                    <td className="px-4 py-3"><Badge tone="info">{n.template}</Badge></td>
                    <td className="px-4 py-3 text-slate-700 max-w-xs truncate">{n.subject}</td>
                    <td className="px-4 py-3 text-slate-600">{n.channel}</td>
                    <td className="px-4 py-3"><Badge tone={n.status === "Sent" ? "success" : n.status === "Failed" ? "error" : "warning"}>{n.status}</Badge></td>
                    <td className="px-4 py-3 text-slate-500 text-xs">{n.sent_at ? formatDate(n.sent_at) : "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

function StatPill({ label, value, icon }: { label: string; value: number; icon: React.ReactNode }) {
  return (
    <div className="rounded-xl bg-white ring-1 ring-slate-200 shadow-sm p-4 flex items-center gap-3">
      {icon}
      <div>
        <p className="text-xl font-bold text-slate-900 tabular-nums leading-none">{value}</p>
        <p className="text-xs text-slate-500 mt-0.5">{label}</p>
      </div>
    </div>
  );
}
