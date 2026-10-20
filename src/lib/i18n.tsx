import { createContext, useContext, useEffect, useState } from "react";

export type Lang = "en" | "hi";

type Dict = Record<string, { en: string; hi: string }>;

const DICT: Dict = {
  // Student form
  student_personal: { en: "Student Personal Details", hi: "विद्यार्थी व्यक्तिगत विवरण" },
  student_information: { en: "Student Information", hi: "विद्यार्थी जानकारी" },
  admission_no: { en: "Admission No", hi: "प्रवेश क्रमांक" },
  full_name: { en: "Full Name", hi: "पूरा नाम" },
  local_name: { en: "Name (Local Language)", hi: "नाम (स्थानीय भाषा)" },
  roll_no: { en: "Roll No", hi: "क्रमांक" },
  class: { en: "Class", hi: "वर्ग" },
  section: { en: "Section", hi: "विभाग" },
  gender: { en: "Gender", hi: "लिंग" },
  date_of_birth: { en: "Date of Birth", hi: "जन्म तिथि" },
  admission_date: { en: "Admission Date", hi: "प्रवेश तिथि" },
  blood_group: { en: "Blood Group", hi: "रक्त समूह" },
  enrollment_status: { en: "Enrollment Status", hi: "नामांकन स्थिति" },
  guardian_info: { en: "Parent / Guardian Details", hi: "अभिभावक विवरण" },
  guardian_name: { en: "Guardian Name", hi: "अभिभावक का नाम" },
  relationship: { en: "Relationship", hi: "संबंध" },
  phone: { en: "Phone", hi: "फ़ोन" },
  email: { en: "Email", hi: "ईमेल" },
  occupation: { en: "Occupation", hi: "व्यवसाय" },
  address: { en: "Address", hi: "पता" },
  city: { en: "City", hi: "शहर" },
  state: { en: "State", hi: "राज्य" },
  postal_code: { en: "Postal Code", hi: "पिन कोड" },
  profile_photo: { en: "Profile Photo", hi: "प्रोफ़ाइल फ़ोटो" },
  fee_tier: { en: "Fee Tier Assignment", hi: "शुल्क स्तर निर्धारण" },
  // Finance
  fee_collection: { en: "Fee Collection Entry", hi: "शुल्क संग्रह प्रविष्टि" },
  student_search: { en: "Search student by name or admission no…", hi: "नाम या प्रवेश क्रमांक से खोजें…" },
  fee_breakdown: { en: "Fee Breakdown", hi: "शुल्क विवरण" },
  payment_mode: { en: "Payment Mode", hi: "भुगतान विधि" },
  receipt_no: { en: "Receipt No", hi: "रसीद क्रमांक" },
  print_receipt: { en: "Print Receipt", hi: "रसीद प्रिंट करें" },
  amount: { en: "Amount", hi: "राशि" },
  remarks: { en: "Remarks", hi: "टिप्पणी" },
  // HR
  attendance: { en: "Attendance", hi: "उपस्थिति" },
  present: { en: "Present", hi: "उपस्थित" },
  absent: { en: "Absent", hi: "अनुपस्थित" },
  leave: { en: "Leave", hi: "अवकाश" },
  payroll: { en: "Payroll", hi: "वेतन" },
  basic_salary: { en: "Basic Salary", hi: "मूल वेतन" },
  allowances: { en: "Allowances", hi: "भत्ते" },
  deductions: { en: "Deductions", hi: "कटौती" },
  net_salary: { en: "Net Salary", hi: "शुद्ध वेतन" },
  // Income/Expense
  category: { en: "Category", hi: "श्रेणी" },
  source: { en: "Source", hi: "स्रोत" },
  payment_voucher: { en: "Payment Voucher", hi: "भुगतान वाउचर" },
  // Actions
  save: { en: "Save", hi: "सहेजें" },
  cancel: { en: "Cancel", hi: "रद्द करें" },
  record: { en: "Record", hi: "दर्ज करें" },
  submit: { en: "Submit", hi: "जमा करें" },
  approve: { en: "Approve", hi: "स्वीकृत करें" },
  reject: { en: "Reject", hi: "अस्वीकृत करें" },
};

type Ctx = { lang: Lang; setLang: (l: Lang) => void; t: (key: string) => string };

const LangContext = createContext<Ctx>({
  lang: "en",
  setLang: () => {},
  t: (k) => k,
});

export function LanguageProvider({ children }: { children: React.ReactNode }) {
  const [lang, setLang] = useState<Lang>("en");
  useEffect(() => {
    const saved = localStorage.getItem("erp-lang") as Lang | null;
    if (saved) setLang(saved);
  }, []);
  const setAndPersist = (l: Lang) => {
    setLang(l);
    localStorage.setItem("erp-lang", l);
  };
  const t = (key: string) => DICT[key]?.[lang] ?? key;
  return (
    <LangContext.Provider value={{ lang, setLang: setAndPersist, t }}>{children}</LangContext.Provider>
  );
}

export function useLang() {
  return useContext(LangContext);
}
