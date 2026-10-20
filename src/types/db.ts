// Database row types — mirrors the PostgreSQL schema in Supabase.
// Kept minimal (only the columns the UI reads/writes) but typed end-to-end.

export type Class = {
  id: string;
  name: string;
  level: number;
  created_at?: string;
  updated_at?: string;
};

export type Section = {
  id: string;
  class_id: string;
  name: string;
  capacity: number;
  created_at?: string;
  updated_at?: string;
};

export type Department = {
  id: string;
  name: string;
  type: "Teaching" | "Non-Teaching";
  created_at?: string;
  updated_at?: string;
};

export type FeeCategory = {
  id: string;
  name: string;
  description?: string | null;
  created_at?: string;
  updated_at?: string;
};

export type AssetCategory = {
  id: string;
  name: string;
  useful_life_years: number;
  created_at?: string;
  updated_at?: string;
};

export type Guardian = {
  id: string;
  full_name: string;
  relationship: string;
  phone?: string | null;
  email?: string | null;
  occupation?: string | null;
  local_name?: string | null;
  created_at?: string;
  updated_at?: string;
};

export type Student = {
  id: string;
  admission_no: string;
  full_name: string;
  roll_no?: number | null;
  class_id: string;
  section_id?: string | null;
  gender: "Male" | "Female" | "Other";
  date_of_birth: string;
  admission_date: string;
  blood_group?: string | null;
  address?: string | null;
  city?: string | null;
  state?: string | null;
  postal_code?: string | null;
  guardian_id?: string | null;
  photo_url?: string | null;
  local_name?: string | null;
  enrollment_status:
    | "Active"
    | "Inactive"
    | "Graduated"
    | "Transferred"
    | "Suspended";
  created_at?: string;
  updated_at?: string;
};

export type FeeStructure = {
  id: string;
  class_id: string;
  category_id: string;
  academic_year: string;
  amount: number;
  due_date?: string | null;
  created_at?: string;
  updated_at?: string;
};

export type FeeCollection = {
  id: string;
  student_id: string;
  fee_structure_id?: string | null;
  category_id?: string | null;
  amount: number;
  payment_date: string;
  payment_method?: string | null;
  receipt_no?: string | null;
  remarks?: string | null;
  created_at?: string;
  updated_at?: string;
};

export type IncomeEntry = {
  id: string;
  source: string;
  amount: number;
  entry_date: string;
  description?: string | null;
  payment_method?: string | null;
  voucher_url?: string | null;
  created_at?: string;
  updated_at?: string;
};

export type ExpenseEntry = {
  id: string;
  category: string;
  amount: number;
  entry_date: string;
  description?: string | null;
  payment_method?: string | null;
  voucher_url?: string | null;
  created_at?: string;
  updated_at?: string;
};

export type Staff = {
  id: string;
  employee_no: string;
  full_name: string;
  department_id?: string | null;
  designation?: string | null;
  staff_type: "Teaching" | "Non-Teaching";
  gender?: "Male" | "Female" | "Other" | null;
  date_of_birth?: string | null;
  hire_date: string;
  phone?: string | null;
  email?: string | null;
  address?: string | null;
  salary: number;
  photo_url?: string | null;
  local_name?: string | null;
  status: "Active" | "Inactive" | "On Leave" | "Terminated" | "Retired";
  created_at?: string;
  updated_at?: string;
};

export type StaffAttendance = {
  id: string;
  staff_id: string;
  attendance_date: string;
  status: "Present" | "Absent" | "Half Day" | "Late";
  check_in_time?: string | null;
  check_out_time?: string | null;
  remarks?: string | null;
  created_at?: string;
  updated_at?: string;
};

export type StaffLeave = {
  id: string;
  staff_id: string;
  leave_type: "Casual" | "Sick" | "Earned" | "Maternity" | "Unpaid";
  start_date: string;
  end_date: string;
  reason?: string | null;
  status: "Pending" | "Approved" | "Rejected" | "Cancelled";
  created_at?: string;
  updated_at?: string;
};

export type Payroll = {
  id: string;
  staff_id: string;
  pay_period_month: number;
  pay_period_year: number;
  basic_salary: number;
  allowances: number;
  deductions: number;
  net_salary: number;
  payment_date?: string | null;
  status: "Pending" | "Processed" | "Paid";
  created_at?: string;
  updated_at?: string;
};

export type Room = {
  id: string;
  room_no: string;
  room_type:
    | "Classroom"
    | "Lab"
    | "Library"
    | "Office"
    | "Staff Room"
    | "Store"
    | "Other";
  floor: number;
  capacity: number;
  current_usage: number;
  is_occupied: boolean;
  created_at?: string;
  updated_at?: string;
};

export type LibraryBook = {
  id: string;
  isbn?: string | null;
  title: string;
  author?: string | null;
  publisher?: string | null;
  category?: string | null;
  total_copies: number;
  available_copies: number;
  shelf_location?: string | null;
  created_at?: string;
  updated_at?: string;
};

export type LibraryCheckout = {
  id: string;
  book_id: string;
  student_id?: string | null;
  staff_id?: string | null;
  borrower_name: string;
  checkout_date: string;
  due_date: string;
  return_date?: string | null;
  status: "Issued" | "Returned" | "Overdue" | "Lost";
  fine: number;
  created_at?: string;
  updated_at?: string;
};

export type Asset = {
  id: string;
  asset_code: string;
  name: string;
  category_id?: string | null;
  purchase_date: string;
  purchase_cost: number;
  salvage_value: number;
  current_value?: number | null;
  location?: string | null;
  status: "In Use" | "Under Maintenance" | "Disposed" | "Lost";
  created_at?: string;
  updated_at?: string;
};

export type EnergyLog = {
  id: string;
  reading_date: string;
  room_id?: string | null;
  consumption_kwh: number;
  cost: number;
  source?: "Grid" | "Solar" | "Generator" | "Other" | null;
  created_at?: string;
  updated_at?: string;
};

export type Bus = {
  id: string;
  bus_no: string;
  capacity: number;
  driver_name: string;
  driver_phone?: string | null;
  driver_license?: string | null;
  status: "Active" | "Maintenance" | "Retired";
  created_at?: string;
  updated_at?: string;
};

export type BusRoute = {
  id: string;
  bus_id: string;
  route_name: string;
  pickup_points?: string | null;
  start_time?: string | null;
  end_time?: string | null;
  created_at?: string;
  updated_at?: string;
};

export type StudentBusMapping = {
  id: string;
  student_id: string;
  bus_id: string;
  route_id?: string | null;
  pickup_point?: string | null;
  created_at?: string;
  updated_at?: string;
};

export type StudentAttendance = {
  id: string;
  student_id: string;
  class_id: string;
  section_id?: string | null;
  attendance_date: string;
  status: "Present" | "Absent" | "Late" | "Leave";
  remarks?: string | null;
  created_at?: string;
  updated_at?: string;
};

export type ExternalExam = {
  id: string;
  name: string;
  exam_code: string;
  exam_type: "Scholarship" | "Olympiad" | "NTSE" | "Drawing" | "Other";
  exam_date: string;
  registration_deadline?: string | null;
  exam_center?: string | null;
  description?: string | null;
  created_at?: string;
  updated_at?: string;
};

export type ExamEnrollment = {
  id: string;
  exam_id: string;
  student_id: string;
  hall_ticket_no?: string | null;
  exam_center?: string | null;
  enrollment_status: "Registered" | "Confirmed" | "Cancelled";
  marks?: number | null;
  result_status?: "Pending" | "Pass" | "Fail" | "Absent" | null;
  created_at?: string;
  updated_at?: string;
};

export type ParentNotification = {
  id: string;
  student_id?: string | null;
  channel: "SMS" | "WhatsApp" | "Push";
  template: "Absenteeism" | "FeeDue" | "Emergency" | "ExamNotice" | "Custom";
  subject: string;
  body: string;
  recipient_phone?: string | null;
  status: "Queued" | "Sent" | "Failed";
  sent_at?: string | null;
  created_at?: string;
  updated_at?: string;
};
