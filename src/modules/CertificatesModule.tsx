import { useEffect, useState } from "react";
import { FileText, Award, IdCard, Printer, ScrollText, Plus, Check } from "lucide-react";
import { supabase } from "@/lib/supabase";
import type { CertificateRequest, IdCardRequest } from "@/types/db";
import { useLookups } from "@/lib/useLookups";
import { Button } from "@/components/Button";
import { Badge } from "@/components/Badge";
import { SelectField } from "@/components/Field";
import { StudentSearchBar, type StudentSearchResult } from "@/components/StudentSearchBar";
import { formatDate } from "@/lib/format";
import { cn } from "@/lib/cn";

const CERT_TYPES = [
  { value: "TransferCertificate", label: "Transfer Certificate (TC)", prefix: "TC" },
  { value: "BonafideCertificate", label: "Bonafide Certificate", prefix: "BON" },
  { value: "CharacterCertificate", label: "Character Certificate", prefix: "CHAR" },
];

const CARD_TYPES = [
  { value: "IdentityCard", label: "Identity Card" },
  { value: "BusPass", label: "Bus Pass" },
  { value: "LibraryCard", label: "Library Card" },
];

export function CertificatesModule() {
  const { data: lookups } = useLookups();
  const [tab, setTab] = useState<"certificates" | "idcards">("certificates");
  const [selectedStudent, setSelectedStudent] = useState<StudentSearchResult | null>(null);
  const [certType, setCertType] = useState("TransferCertificate");
  const [reason, setReason] = useState("");
  const [issuedBy, setIssuedBy] = useState("Principal");
  const [certs, setCerts] = useState<(CertificateRequest & { students?: { full_name: string; admission_no: string; date_of_birth: string; class_id: string } | null })[]>([]);
  const [idCards, setIdCards] = useState<(IdCardRequest & { students?: { full_name: string; admission_no: string } | null; staff?: { full_name: string; employee_no: string } | null })[]>([]);
  const [personType, setPersonType] = useState<"Student" | "Staff">("Student");
  const [selectedStaffId, setSelectedStaffId] = useState("");
  const [cardType, setCardType] = useState("IdentityCard");
  const [generatedCert, setGeneratedCert] = useState<CertificateRequest | null>(null);

  const tabs = [
    { key: "certificates" as const, label: "Certificates", icon: <ScrollText size={16} /> },
    { key: "idcards" as const, label: "ID Cards", icon: <IdCard size={16} /> },
  ];

  const loadCerts = () => {
    supabase.from("certificate_requests").select("*, students(full_name, admission_no, date_of_birth, class_id)").order("created_at", { ascending: false }).limit(20).then(({ data }) => setCerts((data ?? []) as typeof certs));
  };
  const loadIdCards = () => {
    supabase.from("id_card_requests").select("*, students(full_name, admission_no), staff(full_name, employee_no)").order("created_at", { ascending: false }).limit(20).then(({ data }) => setIdCards((data ?? []) as typeof idCards));
  };

  useEffect(() => { loadCerts(); loadIdCards(); }, []);

  const generateCertNo = (prefix: string) => {
    const year = new Date().getFullYear();
    const seq = String(certs.length + 1).padStart(4, "0");
    return `${prefix}-${year}-${seq}`;
  };

  const generateCertificate = async () => {
    if (!selectedStudent) return;
    const prefix = CERT_TYPES.find((c) => c.value === certType)?.prefix ?? "CERT";
    const certNo = generateCertNo(prefix);
    const { data } = await supabase.from("certificate_requests").insert({
      student_id: selectedStudent.id,
      certificate_type: certType as CertificateRequest["certificate_type"],
      reason: reason || null,
      issued_by: issuedBy,
      certificate_no: certNo,
      status: "Generated",
    }).select().single();
    if (data) {
      setGeneratedCert(data as CertificateRequest);
      loadCerts();
    }
  };

  const printCertificate = (cert: typeof certs[number]) => {
    const student = cert.students;
    const certLabel = CERT_TYPES.find((c) => c.value === cert.certificate_type)?.label ?? cert.certificate_type;
    const certText = cert.certificate_type === "TransferCertificate"
      ? `This is to certify that <b>${student?.full_name ?? "—"}</b> was a bonafide student of this institution. His/Her admission number is ${student?.admission_no ?? "—"}. He/She is being issued a Transfer Certificate on ${formatDate(cert.issued_date)}. His/Her conduct during the stay was satisfactory.`
      : cert.certificate_type === "BonafideCertificate"
      ? `This is to certify that <b>${student?.full_name ?? "—"}</b> is a bonafide student of Yug International School. His/Her admission number is ${student?.admission_no ?? "—"}. This certificate is issued on request.`
      : `This is to certify that <b>${student?.full_name ?? "—"}</b> has been a student of this institution. During this period, he/she has shown good conduct and character. This certificate is issued on ${formatDate(cert.issued_date)}.`;

    const w = window.open("", "_blank");
    if (!w) return;
    w.document.write(`<html><head><title>${cert.certificate_no}</title>
      <style>
        body{font-family:Georgia,serif;max-width:700px;margin:40px auto;padding:20px;color:#1e293b;}
        .header{text-align:center;border-bottom:3px double #0c4a6e;padding-bottom:20px;margin-bottom:30px;}
        .school-name{font-size:28px;font-weight:bold;color:#0c4a6e;}
        .school-sub{font-size:14px;color:#64748b;}
        .cert-title{text-align:center;font-size:22px;font-weight:bold;margin:30px 0;text-decoration:underline;text-transform:uppercase;}
        .cert-body{font-size:16px;line-height:1.8;text-align:justify;margin:20px 0;}
        .cert-no{float:right;font-size:12px;color:#64748b;}
        .details{margin:20px 0;padding:15px;border:1px solid #cbd5e1;border-radius:8px;background:#f8fafc;}
        .sign{margin-top:60px;display:flex;justify-content:space-between;}
        .sign-line{border-top:1px solid #475569;padding-top:5px;text-align:center;font-size:14px;width:200px;}
      </style></head><body>
      <div class="cert-no">No: ${cert.certificate_no}</div>
      <div class="header">
        <div class="school-name">Yug International School</div>
        <div class="school-sub">Affiliated to CBSE · Estd. 1995</div>
      </div>
      <div class="cert-title">${certLabel}</div>
      <div class="details">
        <p><b>Name:</b> ${student?.full_name ?? "—"}</p>
        <p><b>Admission No:</b> ${student?.admission_no ?? "—"}</p>
        <p><b>Date of Birth:</b> ${student?.date_of_birth ? formatDate(student.date_of_birth) : "—"}</p>
      </div>
      <div class="cert-body">${certText}</div>
      <div class="sign">
        <div class="sign-line">Clerk</div>
        <div class="sign-line">${cert.issued_by ?? "Principal"}</div>
      </div>
      <p style="text-align:center;margin-top:30px;font-size:11px;color:#94a3b8;">Date: ${formatDate(cert.issued_date)}</p>
      </body></html>`);
    w.document.close();
    w.print();
  };

  const generateIdCard = async () => {
    if (personType === "Student" && !selectedStudent) return;
    if (personType === "Staff" && !selectedStaffId) return;
    const payload = {
      person_type: personType,
      student_id: personType === "Student" ? selectedStudent?.id ?? null : null,
      staff_id: personType === "Staff" ? selectedStaffId || null : null,
      card_type: cardType as IdCardRequest["card_type"],
      status: "Generated",
    };
    const { data } = await supabase.from("id_card_requests").insert(payload).select().single();
    if (data) {
      printIdCard(data as IdCardRequest);
      loadIdCards();
    }
  };

  const printIdCard = (card: IdCardRequest) => {
    const name = personType === "Student" ? selectedStudent?.full_name : lookups?.staff.find((s) => s.id === selectedStaffId)?.full_name;
    const idNo = personType === "Student" ? selectedStudent?.admission_no : lookups?.staff.find((s) => s.id === selectedStaffId)?.employee_no;
    const role = personType === "Student" ? selectedStudent?.class_name ?? "Student" : lookups?.staff.find((s) => s.id === selectedStaffId)?.designation ?? "Staff";
    const cardLabel = CARD_TYPES.find((c) => c.value === cardType)?.label ?? "ID Card";
    const w = window.open("", "_blank");
    if (!w) return;
    w.document.write(`<html><head><title>ID Card - ${name}</title>
      <style>
        body{font-family:Arial,sans-serif;display:flex;justify-content:center;align-items:center;min-height:100vh;margin:0;background:#e2e8f0;}
        .card{width:340px;height:480px;border-radius:16px;overflow:hidden;box-shadow:0 4px 20px rgba(0,0,0,.15);background:#fff;}
        .card-header{background:linear-gradient(135deg,#0284c7,#0c4a6e);padding:16px;text-align:center;color:#fff;}
        .card-header h2{font-size:16px;margin:0;}
        .card-header p{font-size:10px;margin:2px 0 0;opacity:.8;}
        .card-body{padding:20px;text-align:center;}
        .photo{width:90px;height:90px;border-radius:50%;background:#e2e8f0;margin:10px auto;border:3px solid #0284c7;display:flex;align-items:center;justify-content:center;font-size:32px;font-weight:bold;color:#0284c7;}
        .name{font-size:18px;font-weight:bold;color:#1e293b;margin:8px 0 4px;}
        .role{font-size:12px;color:#64748b;}
        .info{margin-top:12px;text-align:left;font-size:11px;color:#475569;}
        .info-row{display:flex;justify-content:space-between;padding:4px 0;border-bottom:1px solid #f1f5f9;}
        .qr{width:60px;height:60px;background:#f1f5f9;border:1px dashed #94a3b8;margin:10px auto;display:flex;align-items:center;justify-content:center;font-size:8px;color:#94a3b8;}
        .footer{background:#f8fafc;padding:8px;text-align:center;font-size:9px;color:#64748b;border-top:1px solid #e2e8f0;}
      </style></head><body>
      <div class="card">
        <div class="card-header">
          <h2>Yug International School</h2>
          <p>${cardLabel}</p>
        </div>
        <div class="card-body">
          <div class="photo">${name?.charAt(0).toUpperCase() ?? "?"}</div>
          <div class="name">${name ?? "—"}</div>
          <div class="role">${role}</div>
          <div class="info">
            <div class="info-row"><span>ID No:</span><b>${idNo ?? "—"}</b></div>
            <div class="info-row"><span>Type:</span><b>${personType}</b></div>
            <div class="info-row"><span>Valid Till:</span><b>2027-03-31</b></div>
          </div>
          <div class="qr">QR CODE</div>
        </div>
        <div class="footer">If found, please return to Yug International School · Phone: +91-123-456-7890</div>
      </div>
      <script>window.print();</script>
      </body></html>`);
    w.document.close();
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

      {tab === "certificates" && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
          <div className="rounded-2xl bg-white ring-1 ring-slate-200 shadow-sm p-5 space-y-4">
            <h3 className="font-semibold text-slate-900 flex items-center gap-2"><FileText size={18} /> Generate Certificate</h3>
            <StudentSearchBar selected={selectedStudent} onSelect={setSelectedStudent} />
            <SelectField label="Certificate Type" value={certType} onChange={(e) => setCertType(e.target.value)}
              options={CERT_TYPES.map((c) => ({ value: c.value, label: c.label }))} />
            <div>
              <span className="block text-sm font-medium text-slate-700 mb-1">Reason</span>
              <textarea value={reason} onChange={(e) => setReason(e.target.value)} rows={2} placeholder="Reason for certificate…"
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-sky-500 focus:ring-2 focus:ring-sky-200 outline-none" />
            </div>
            <SelectField label="Issued By" value={issuedBy} onChange={(e) => setIssuedBy(e.target.value)}
              options={[{ value: "Principal", label: "Principal" }, { value: "Vice Principal", label: "Vice Principal" }, { value: "Office Clerk", label: "Office Clerk" }]} />
            <Button onClick={generateCertificate} disabled={!selectedStudent}><Plus size={14} /> Generate Certificate</Button>
            {generatedCert && (
              <div className="rounded-lg bg-emerald-50 ring-1 ring-emerald-200 px-4 py-3 text-sm text-emerald-700 flex items-center gap-2">
                <Check size={16} /> Generated: {generatedCert.certificate_no}
                <button onClick={() => printCertificate(generatedCert as typeof certs[number])} className="ml-auto text-emerald-700 hover:text-emerald-900 font-medium flex items-center gap-1">
                  <Printer size={14} /> Print
                </button>
              </div>
            )}
          </div>

          <div className="rounded-2xl bg-white ring-1 ring-slate-200 shadow-sm overflow-hidden">
            <div className="px-4 py-3 border-b border-slate-100"><h3 className="font-semibold text-slate-900">Recent Certificates</h3></div>
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-100">
                  <th className="text-left px-4 py-2 font-semibold text-slate-600">Certificate No</th>
                  <th className="text-left px-4 py-2 font-semibold text-slate-600">Student</th>
                  <th className="text-left px-4 py-2 font-semibold text-slate-600">Type</th>
                  <th className="text-left px-4 py-2 font-semibold text-slate-600">Date</th>
                  <th className="text-right px-4 py-2 font-semibold text-slate-600">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {certs.length === 0 ? <tr><td colSpan={5} className="px-4 py-6 text-center text-slate-400">No certificates yet.</td></tr> :
                 certs.map((c) => (
                  <tr key={c.id} className="hover:bg-slate-50">
                    <td className="px-4 py-2.5 font-mono text-xs text-slate-600">{c.certificate_no}</td>
                    <td className="px-4 py-2.5 text-slate-800">{c.students?.full_name ?? "—"}</td>
                    <td className="px-4 py-2.5 text-slate-500 text-xs">{CERT_TYPES.find((t) => t.value === c.certificate_type)?.label ?? c.certificate_type}</td>
                    <td className="px-4 py-2.5 text-slate-500 text-xs">{formatDate(c.issued_date)}</td>
                    <td className="px-4 py-2.5 text-right">
                      <button onClick={() => printCertificate(c)} className="text-sky-600 hover:text-sky-800"><Printer size={15} /></button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {tab === "idcards" && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
          <div className="rounded-2xl bg-white ring-1 ring-slate-200 shadow-sm p-5 space-y-4">
            <h3 className="font-semibold text-slate-900 flex items-center gap-2"><IdCard size={18} /> Generate ID Card</h3>
            <SelectField label="Person Type" value={personType} onChange={(e) => { setPersonType(e.target.value as "Student" | "Staff"); setSelectedStudent(null); setSelectedStaffId(""); }}
              options={[{ value: "Student", label: "Student" }, { value: "Staff", label: "Staff" }]} />
            {personType === "Student" ? (
              <StudentSearchBar selected={selectedStudent} onSelect={setSelectedStudent} />
            ) : (
              <SelectField label="Staff" placeholder="Select staff" value={selectedStaffId} onChange={(e) => setSelectedStaffId(e.target.value)}
                options={(lookups?.staff ?? []).map((s) => ({ value: s.id, label: `${s.full_name} (${s.employee_no})` }))} />
            )}
            <SelectField label="Card Type" value={cardType} onChange={(e) => setCardType(e.target.value)}
              options={CARD_TYPES.map((c) => ({ value: c.value, label: c.label }))} />
            <Button onClick={generateIdCard} disabled={personType === "Student" ? !selectedStudent : !selectedStaffId}>
              <Printer size={14} /> Generate & Print
            </Button>
          </div>

          <div className="rounded-2xl bg-white ring-1 ring-slate-200 shadow-sm overflow-hidden">
            <div className="px-4 py-3 border-b border-slate-100"><h3 className="font-semibold text-slate-900">Recent ID Cards</h3></div>
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-100">
                  <th className="text-left px-4 py-2 font-semibold text-slate-600">Name</th>
                  <th className="text-left px-4 py-2 font-semibold text-slate-600">Type</th>
                  <th className="text-left px-4 py-2 font-semibold text-slate-600">Card</th>
                  <th className="text-left px-4 py-2 font-semibold text-slate-600">Date</th>
                  <th className="text-left px-4 py-2 font-semibold text-slate-600">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {idCards.length === 0 ? <tr><td colSpan={5} className="px-4 py-6 text-center text-slate-400">No ID cards generated yet.</td></tr> :
                 idCards.map((c) => (
                  <tr key={c.id} className="hover:bg-slate-50">
                    <td className="px-4 py-2.5 text-slate-800">{c.students?.full_name ?? c.staff?.full_name ?? "—"}</td>
                    <td className="px-4 py-2.5 text-slate-500 text-xs">{c.person_type}</td>
                    <td className="px-4 py-2.5 text-slate-500 text-xs">{CARD_TYPES.find((t) => t.value === c.card_type)?.label ?? c.card_type}</td>
                    <td className="px-4 py-2.5 text-slate-500 text-xs">{formatDate(c.generated_date)}</td>
                    <td className="px-4 py-2.5"><Badge tone={c.status === "Printed" ? "success" : "info"}>{c.status}</Badge></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
