import { useState } from "react";
import { ChevronDown, ChevronRight, Database, Code2, Copy, Check } from "lucide-react";
import { cn } from "@/lib/cn";

type Method = "GET" | "POST" | "PUT" | "DELETE";

type Endpoint = {
  method: Method;
  path: string;
  description: string;
  params?: { name: string; type: string; required: boolean; description: string }[];
  body?: string;
  exampleResponse?: string;
};

type Module = {
  name: string;
  table: string;
  description: string;
  endpoints: Endpoint[];
};

const MODULES: Module[] = [
  {
    name: "Students",
    table: "students",
    description: "Student admission, profiles, enrollment status, and guardian details.",
    endpoints: [
      { method: "GET", path: "/rest/v1/students?select=*,classes(*),sections(*),guardians(*)", description: "List all students with joined class, section, and guardian." },
      { method: "GET", path: "/rest/v1/students?id=eq.{id}", description: "Fetch a single student by ID." },
      { method: "GET", path: "/rest/v1/students?enrollment_status=eq.Active", description: "Filter students by enrollment status." },
      {
        method: "POST",
        path: "/rest/v1/students",
        description: "Admit a new student.",
        body: `{
  "admission_no": "ADM-0011",
  "full_name": "Jane Doe",
  "class_id": "uuid",
  "section_id": "uuid",
  "gender": "Female",
  "date_of_birth": "2012-05-14",
  "guardian_id": "uuid",
  "enrollment_status": "Active"
}`,
        exampleResponse: `{ "id": "uuid", "admission_no": "ADM-0011", ... }`,
      },
      {
        method: "PUT",
        path: "/rest/v1/students?id=eq.{id}",
        description: "Update an existing student record.",
        body: `{ "enrollment_status": "Graduated", "roll_no": 15 }`,
      },
      { method: "DELETE", path: "/rest/v1/students?id=eq.{id}", description: "Delete a student (cascades to guardian if FK set)." },
    ],
  },
  {
    name: "Guardians",
    table: "guardians",
    description: "Parent / guardian profiles linked to students.",
    endpoints: [
      { method: "GET", path: "/rest/v1/guardians", description: "List all guardians." },
      { method: "POST", path: "/rest/v1/guardians", description: "Create a guardian record.", body: `{ "full_name": "Robert Smith", "relationship": "Father", "phone": "555-0101" }` },
      { method: "PUT", path: "/rest/v1/guardians?id=eq.{id}", description: "Update a guardian.", body: `{ "phone": "555-9999" }` },
      { method: "DELETE", path: "/rest/v1/guardians?id=eq.{id}", description: "Delete a guardian." },
    ],
  },
  {
    name: "Fee Structures",
    table: "fee_structures",
    description: "Annual fee structure per class and category.",
    endpoints: [
      { method: "GET", path: "/rest/v1/fee_structures?academic_year=eq.2026-2027", description: "List fee structures for an academic year." },
      { method: "POST", path: "/rest/v1/fee_structures", description: "Define a new fee structure.", body: `{ "class_id": "uuid", "category_id": "uuid", "academic_year": "2026-2027", "amount": 15000, "due_date": "2026-12-31" }` },
      { method: "PUT", path: "/rest/v1/fee_structures?id=eq.{id}", description: "Update fee amount or due date.", body: `{ "amount": 16000 }` },
      { method: "DELETE", path: "/rest/v1/fee_structures?id=eq.{id}", description: "Delete a fee structure." },
    ],
  },
  {
    name: "Fee Collections",
    table: "fee_collections",
    description: "Fee payment collection entries with receipts.",
    endpoints: [
      { method: "GET", path: "/rest/v1/fee_collections?student_id=eq.{id}", description: "List collections for a student." },
      { method: "GET", path: "/rest/v1/rpc/fee_summary", description: "RPC: aggregate collected vs pending dues (custom function)." },
      { method: "POST", path: "/rest/v1/fee_collections", description: "Record a fee payment.", body: `{ "student_id": "uuid", "category_id": "uuid", "amount": 5000, "payment_method": "Cash", "receipt_no": "RCP-00007" }` },
      { method: "PUT", path: "/rest/v1/fee_collections?id=eq.{id}", description: "Update a collection entry.", body: `{ "amount": 5500 }` },
      { method: "DELETE", path: "/rest/v1/fee_collections?id=eq.{id}", description: "Delete a collection entry." },
    ],
  },
  {
    name: "Income & Expenses",
    table: "income_entries / expense_entries",
    description: "Daily income and expense entries for the school.",
    endpoints: [
      { method: "GET", path: "/rest/v1/income_entries?order=entry_date.desc", description: "List income entries." },
      { method: "POST", path: "/rest/v1/income_entries", description: "Record income.", body: `{ "source": "Donation", "amount": 25000, "payment_method": "Cheque" }` },
      { method: "GET", path: "/rest/v1/expense_entries?order=entry_date.desc", description: "List expense entries." },
      { method: "POST", path: "/rest/v1/expense_entries", description: "Record an expense.", body: `{ "category": "Utility", "amount": 5600, "payment_method": "Online" }` },
      { method: "DELETE", path: "/rest/v1/income_entries?id=eq.{id}", description: "Delete an income entry." },
      { method: "DELETE", path: "/rest/v1/expense_entries?id=eq.{id}", description: "Delete an expense entry." },
    ],
  },
  {
    name: "Staff (HR)",
    table: "staff",
    description: "Teaching and non-teaching staff profiles.",
    endpoints: [
      { method: "GET", path: "/rest/v1/staff?select=*,departments(*)", description: "List staff with department." },
      { method: "GET", path: "/rest/v1/staff?staff_type=eq.Teaching", description: "Filter by staff type." },
      { method: "POST", path: "/rest/v1/staff", description: "Add a staff member.", body: `{ "employee_no": "EMP-0011", "full_name": "Dr. New Hire", "department_id": "uuid", "staff_type": "Teaching", "salary": 50000 }` },
      { method: "PUT", path: "/rest/v1/staff?id=eq.{id}", description: "Update a staff record.", body: `{ "status": "On Leave" }` },
      { method: "DELETE", path: "/rest/v1/staff?id=eq.{id}", description: "Delete a staff record." },
    ],
  },
  {
    name: "Staff Attendance",
    table: "staff_attendance",
    description: "Daily staff attendance with check-in / check-out.",
    endpoints: [
      { method: "GET", path: "/rest/v1/staff_attendance?attendance_date=eq.{date}", description: "Attendance for a given date." },
      { method: "POST", path: "/rest/v1/staff_attendance", description: "Mark attendance.", body: `{ "staff_id": "uuid", "attendance_date": "2026-10-18", "status": "Present", "check_in_time": "08:00" }` },
      { method: "PUT", path: "/rest/v1/staff_attendance?id=eq.{id}", description: "Update attendance.", body: `{ "status": "Late" }` },
      { method: "DELETE", path: "/rest/v1/staff_attendance?id=eq.{id}", description: "Delete an attendance record." },
    ],
  },
  {
    name: "Staff Leaves",
    table: "staff_leaves",
    description: "Leave applications and approvals.",
    endpoints: [
      { method: "GET", path: "/rest/v1/staff_leaves?status=eq.Pending", description: "List pending leave requests." },
      { method: "POST", path: "/rest/v1/staff_leaves", description: "Apply for leave.", body: `{ "staff_id": "uuid", "leave_type": "Sick", "start_date": "2026-10-20", "end_date": "2026-10-22", "reason": "Flu" }` },
      { method: "PUT", path: "/rest/v1/staff_leaves?id=eq.{id}", description: "Approve / reject leave.", body: `{ "status": "Approved" }` },
      { method: "DELETE", path: "/rest/v1/staff_leaves?id=eq.{id}", description: "Delete a leave request." },
    ],
  },
  {
    name: "Payroll",
    table: "payroll",
    description: "Salary distribution records. net_salary is a generated stored column.",
    endpoints: [
      { method: "GET", path: "/rest/v1/payroll?pay_period_year=eq.2026", description: "List payroll for a year." },
      { method: "POST", path: "/rest/v1/payroll", description: "Create a payroll record.", body: `{ "staff_id": "uuid", "pay_period_month": 10, "pay_period_year": 2026, "basic_salary": 50000, "allowances": 7500, "deductions": 4000 }` },
      { method: "PUT", path: "/rest/v1/payroll?id=eq.{id}", description: "Mark payroll as paid.", body: `{ "status": "Paid", "payment_date": "2026-10-31" }` },
      { method: "DELETE", path: "/rest/v1/payroll?id=eq.{id}", description: "Delete a payroll record." },
    ],
  },
  {
    name: "Rooms",
    table: "rooms",
    description: "Classroom and facility utilization tracking.",
    endpoints: [
      { method: "GET", path: "/rest/v1/rooms?is_occupied=eq.true", description: "List occupied rooms." },
      { method: "POST", path: "/rest/v1/rooms", description: "Add a room.", body: `{ "room_no": "401", "room_type": "Classroom", "floor": 4, "capacity": 40 }` },
      { method: "PUT", path: "/rest/v1/rooms?id=eq.{id}", description: "Update room usage.", body: `{ "current_usage": 35, "is_occupied": true }` },
      { method: "DELETE", path: "/rest/v1/rooms?id=eq.{id}", description: "Delete a room." },
    ],
  },
  {
    name: "Library Books",
    table: "library_books",
    description: "Library catalog with copy tracking.",
    endpoints: [
      { method: "GET", path: "/rest/v1/library_books?available_copies=gt.0", description: "List books with available copies." },
      { method: "POST", path: "/rest/v1/library_books", description: "Add a book.", body: `{ "title": "New Title", "author": "Author", "total_copies": 3, "available_copies": 3 }` },
      { method: "PUT", path: "/rest/v1/library_books?id=eq.{id}", description: "Update copies.", body: `{ "available_copies": 2 }` },
      { method: "DELETE", path: "/rest/v1/library_books?id=eq.{id}", description: "Delete a book." },
    ],
  },
  {
    name: "Library Checkouts",
    table: "library_checkouts",
    description: "Book checkout transactions and returns.",
    endpoints: [
      { method: "GET", path: "/rest/v1/library_checkouts?status=eq.Overdue", description: "List overdue checkouts." },
      { method: "POST", path: "/rest/v1/library_checkouts", description: "Issue a book.", body: `{ "book_id": "uuid", "borrower_name": "Emma Smith", "due_date": "2026-11-01" }` },
      { method: "PUT", path: "/rest/v1/library_checkouts?id=eq.{id}", description: "Mark return.", body: `{ "return_date": "2026-10-25", "status": "Returned" }` },
      { method: "DELETE", path: "/rest/v1/library_checkouts?id=eq.{id}", description: "Delete a checkout record." },
    ],
  },
  {
    name: "Assets",
    table: "assets",
    description: "Asset register with depreciation tracking.",
    endpoints: [
      { method: "GET", path: "/rest/v1/assets?select=*,asset_categories(*)", description: "List assets with category." },
      { method: "POST", path: "/rest/v1/assets", description: "Add an asset.", body: `{ "asset_code": "AST-0007", "name": "Projector", "purchase_cost": 800, "current_value": 600 }` },
      { method: "PUT", path: "/rest/v1/assets?id=eq.{id}", description: "Update asset value or status.", body: `{ "current_value": 500, "status": "Under Maintenance" }` },
      { method: "DELETE", path: "/rest/v1/assets?id=eq.{id}", description: "Delete an asset." },
    ],
  },
  {
    name: "Energy Logs",
    table: "energy_logs",
    description: "Energy consumption readings per room.",
    endpoints: [
      { method: "GET", path: "/rest/v1/energy_logs?order=reading_date.desc&limit=30", description: "Recent energy readings." },
      { method: "POST", path: "/rest/v1/energy_logs", description: "Log a reading.", body: `{ "room_id": "uuid", "consumption_kwh": 25.5, "cost": 3.82, "source": "Grid" }` },
      { method: "PUT", path: "/rest/v1/energy_logs?id=eq.{id}", description: "Update a reading.", body: `{ "consumption_kwh": 26.0 }` },
      { method: "DELETE", path: "/rest/v1/energy_logs?id=eq.{id}", description: "Delete a reading." },
    ],
  },
];

const methodColor: Record<Method, string> = {
  GET: "bg-emerald-100 text-emerald-700",
  POST: "bg-sky-100 text-sky-700",
  PUT: "bg-amber-100 text-amber-700",
  DELETE: "bg-rose-100 text-rose-700",
};

export function ApiDocsModule() {
  const [openModule, setOpenModule] = useState<string | null>("Students");
  const [copied, setCopied] = useState<string | null>(null);

  const copy = (text: string, key: string) => {
    navigator.clipboard.writeText(text);
    setCopied(key);
    setTimeout(() => setCopied(null), 1500);
  };

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-semibold text-slate-900">REST API Reference</h2>
        <p className="text-slate-500 mt-1">
          Supabase auto-generates REST endpoints for every table. Base URL is your project URL prefix.
        </p>
      </div>

      <div className="rounded-2xl bg-slate-900 text-slate-100 p-5 ring-1 ring-slate-800">
        <div className="flex items-center gap-2 text-xs text-slate-400 mb-2">
          <Code2 size={14} /> Base URL
        </div>
        <div className="flex items-center justify-between gap-3">
          <code className="text-sm font-mono text-emerald-300">https://&lt;project-ref&gt;.supabase.co</code>
          <button onClick={() => copy("https://<project-ref>.supabase.co", "base")} className="text-slate-400 hover:text-white">
            {copied === "base" ? <Check size={16} /> : <Copy size={16} />}
          </button>
        </div>
        <div className="mt-4 grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
          <div className="rounded-lg bg-slate-800 px-3 py-2">
            <p className="text-slate-400">Headers required</p>
            <code className="block mt-1 text-emerald-300">apikey: &lt;anon-key&gt;</code>
            <code className="block text-emerald-300">Authorization: Bearer &lt;anon-key&gt;</code>
          </div>
          <div className="rounded-lg bg-slate-800 px-3 py-2">
            <p className="text-slate-400">Content-Type</p>
            <code className="block mt-1 text-emerald-300">application/json</code>
          </div>
        </div>
      </div>

      <div className="space-y-3">
        {MODULES.map((mod) => {
          const isOpen = openModule === mod.name;
          return (
            <div key={mod.name} className="rounded-xl bg-white ring-1 ring-slate-200 shadow-sm overflow-hidden">
              <button
                onClick={() => setOpenModule(isOpen ? null : mod.name)}
                className="w-full flex items-center gap-3 px-5 py-4 text-left hover:bg-slate-50 transition"
              >
                <div className="rounded-lg bg-sky-50 text-sky-600 p-2">
                  <Database size={18} />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="font-semibold text-slate-900">{mod.name}</p>
                  <p className="text-sm text-slate-500 truncate">{mod.description}</p>
                </div>
                <code className="hidden sm:inline text-xs font-mono text-slate-400">{mod.table}</code>
                {isOpen ? <ChevronDown size={18} className="text-slate-400" /> : <ChevronRight size={18} className="text-slate-400" />}
              </button>

              {isOpen && (
                <div className="border-t border-slate-100 divide-y divide-slate-100">
                  {mod.endpoints.map((ep, i) => (
                    <div key={i} className="px-5 py-4">
                      <div className="flex items-center gap-3 flex-wrap">
                        <span className={cn("inline-flex items-center rounded-md px-2 py-0.5 text-xs font-bold font-mono w-16 justify-center", methodColor[ep.method])}>
                          {ep.method}
                        </span>
                        <code className="text-sm font-mono text-slate-700 break-all">{ep.path}</code>
                      </div>
                      <p className="mt-2 text-sm text-slate-600">{ep.description}</p>

                      {ep.body && (
                        <div className="mt-3">
                          <p className="text-xs font-medium text-slate-500 mb-1">Request Body</p>
                          <pre className="rounded-lg bg-slate-900 text-slate-100 p-3 text-xs font-mono overflow-x-auto">
                            {ep.body}
                          </pre>
                        </div>
                      )}
                      {ep.exampleResponse && (
                        <div className="mt-3">
                          <p className="text-xs font-medium text-slate-500 mb-1">Example Response</p>
                          <pre className="rounded-lg bg-slate-50 ring-1 ring-slate-200 text-slate-700 p-3 text-xs font-mono overflow-x-auto">
                            {ep.exampleResponse}
                          </pre>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>

      <div className="rounded-xl bg-sky-50 ring-1 ring-sky-200 p-5 text-sm text-sky-900">
        <p className="font-semibold">Entity Framework Core Mapping (C#)</p>
        <p className="mt-1 text-sky-800">
          The PostgreSQL schema maps directly to EF Core entities: each table becomes a <code className="font-mono">DbSet&lt;T&gt;</code>,
          foreign keys become navigation properties, <code className="font-mono">net_salary</code> is a computed column
          (<code className="font-mono">HasComputedColumnSql</code>), and check constraints map to enum conversions.
          Use <code className="font-mono">Npgsql.EntityFrameworkCore.PostgreSQL</code> as the provider.
        </p>
      </div>
    </div>
  );
}
