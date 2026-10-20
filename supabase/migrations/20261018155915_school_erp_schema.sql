/*
# School ERP System — Core Schema

## Overview
Complete PostgreSQL schema for a School ERP System supporting four modules:
1. Student Management (admission, classes, sections, guardians)
2. Finance & Fees (annual fee structure, category fees, collections, dues, income/expenses)
3. Human Resource (staff profiles, departments, attendance, leaves, payroll)
4. Campus Analytics (rooms, library checkouts, assets, energy consumption)

Single-tenant design (no auth screen) — all data is intentionally shared within a school.
RLS is enabled on every table with anon+authenticated CRUD policies.

## Tables Created (grouped by module)

### Reference / Lookup
- `classes`        — grades (e.g. Grade 1..12)
- `sections`       — section letters per class (A/B/C)
- `departments`    — HR departments (Science, Maths, Administration…)
- `fee_categories` — types of fees (Tuition, Transport, Lab, Library…)
- `asset_categories` — asset classification for depreciation

### Student Management
- `students`       — admission form details
- `guardians`      — parent/guardian profiles (1:N with students)

### Finance & Fees
- `fee_structures`     — annual fee per class/category
- `fee_collections`    — fee payment entries
- `income_entries`     — daily income
- `expense_entries`    — daily expenses

### Human Resource
- `staff`              — teaching & non-teaching staff profiles
- `staff_attendance`   — daily attendance
- `staff_leaves`       — leave applications
- `payroll`            — salary distribution records

### Campus Analytics
- `rooms`              — classrooms & facilities
- `library_books`      — book catalog
- `library_checkouts`  — checkout transactions
- `assets`             — school assets with depreciation tracking
- `energy_logs`        — energy consumption readings

## Security
- RLS enabled on every table.
- Policies: SELECT/INSERT/UPDATE/DELETE for `anon, authenticated` (single-tenant, shared data).
- `USING (true)` is acceptable here because the app has no sign-in and all data is shared.

## Notes
- All PKs are `uuid DEFAULT gen_random_uuid()`.
- All tables have `created_at`/`updated_at` timestamps.
- Numeric money fields use `numeric(12,2)`.
- `updated_at` auto-maintained via triggers.
*/

-- ============================================================
-- EXTENSIONS
-- ============================================================
create extension if not exists "pgcrypto";

-- ============================================================
-- HELPER: auto updated_at trigger
-- ============================================================
create or replace function set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- ============================================================
-- REFERENCE TABLES
-- ============================================================

create table if not exists classes (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,           -- e.g. "Grade 10"
  level int not null check (level between 1 and 12),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists sections (
  id uuid primary key default gen_random_uuid(),
  class_id uuid not null references classes(id) on delete cascade,
  name text not null,                  -- e.g. "A"
  capacity int not null default 40 check (capacity > 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (class_id, name)
);

create table if not exists departments (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  type text not null check (type in ('Teaching','Non-Teaching')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists fee_categories (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,           -- Tuition, Transport, Lab…
  description text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists asset_categories (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  useful_life_years int not null check (useful_life_years > 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ============================================================
-- STUDENT MANAGEMENT
-- ============================================================

create table if not exists guardians (
  id uuid primary key default gen_random_uuid(),
  full_name text not null,
  relationship text not null,          -- Father, Mother, Guardian
  phone text,
  email text,
  occupation text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists students (
  id uuid primary key default gen_random_uuid(),
  admission_no text not null unique,
  full_name text not null,
  roll_no int,
  class_id uuid not null references classes(id) on delete restrict,
  section_id uuid references sections(id) on delete set null,
  gender text not null check (gender in ('Male','Female','Other')),
  date_of_birth date not null,
  admission_date date not null default current_date,
  blood_group text,
  address text,
  city text,
  state text,
  postal_code text,
  guardian_id uuid references guardians(id) on delete set null,
  enrollment_status text not null default 'Active'
    check (enrollment_status in ('Active','Inactive','Graduated','Transferred','Suspended')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ============================================================
-- FINANCE & FEES
-- ============================================================

create table if not exists fee_structures (
  id uuid primary key default gen_random_uuid(),
  class_id uuid not null references classes(id) on delete cascade,
  category_id uuid not null references fee_categories(id) on delete restrict,
  academic_year text not null,         -- e.g. "2026-2027"
  amount numeric(12,2) not null check (amount >= 0),
  due_date date,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (class_id, category_id, academic_year)
);

create table if not exists fee_collections (
  id uuid primary key default gen_random_uuid(),
  student_id uuid not null references students(id) on delete restrict,
  fee_structure_id uuid references fee_structures(id) on delete set null,
  category_id uuid references fee_categories(id) on delete set null,
  amount numeric(12,2) not null check (amount > 0),
  payment_date date not null default current_date,
  payment_method text check (payment_method in ('Cash','Card','Bank Transfer','Cheque','Online')),
  receipt_no text unique,
  remarks text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists income_entries (
  id uuid primary key default gen_random_uuid(),
  source text not null,                -- Donations, Fundraiser, Misc
  amount numeric(12,2) not null check (amount > 0),
  entry_date date not null default current_date,
  description text,
  payment_method text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists expense_entries (
  id uuid primary key default gen_random_uuid(),
  category text not null,              -- Salary, Maintenance, Supplies, Utility
  amount numeric(12,2) not null check (amount > 0),
  entry_date date not null default current_date,
  description text,
  payment_method text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ============================================================
-- HUMAN RESOURCE
-- ============================================================

create table if not exists staff (
  id uuid primary key default gen_random_uuid(),
  employee_no text not null unique,
  full_name text not null,
  department_id uuid references departments(id) on delete set null,
  designation text,
  staff_type text not null check (staff_type in ('Teaching','Non-Teaching')),
  gender text check (gender in ('Male','Female','Other')),
  date_of_birth date,
  hire_date date not null default current_date,
  phone text,
  email text,
  address text,
  salary numeric(12,2) not null default 0 check (salary >= 0),
  status text not null default 'Active'
    check (status in ('Active','Inactive','On Leave','Terminated','Retired')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists staff_attendance (
  id uuid primary key default gen_random_uuid(),
  staff_id uuid not null references staff(id) on delete cascade,
  attendance_date date not null default current_date,
  status text not null check (status in ('Present','Absent','Half Day','Late')),
  check_in_time time,
  check_out_time time,
  remarks text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (staff_id, attendance_date)
);

create table if not exists staff_leaves (
  id uuid primary key default gen_random_uuid(),
  staff_id uuid not null references staff(id) on delete cascade,
  leave_type text not null check (leave_type in ('Casual','Sick','Earned','Maternity','Unpaid')),
  start_date date not null,
  end_date date not null,
  reason text,
  status text not null default 'Pending'
    check (status in ('Pending','Approved','Rejected','Cancelled')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (end_date >= start_date)
);

create table if not exists payroll (
  id uuid primary key default gen_random_uuid(),
  staff_id uuid not null references staff(id) on delete restrict,
  pay_period_month int not null check (pay_period_month between 1 and 12),
  pay_period_year int not null,
  basic_salary numeric(12,2) not null check (basic_salary >= 0),
  allowances numeric(12,2) not null default 0 check (allowances >= 0),
  deductions numeric(12,2) not null default 0 check (deductions >= 0),
  net_salary numeric(12,2) generated always as (basic_salary + allowances - deductions) stored,
  payment_date date,
  status text not null default 'Pending'
    check (status in ('Pending','Processed','Paid')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (staff_id, pay_period_month, pay_period_year)
);

-- ============================================================
-- CAMPUS ANALYTICS
-- ============================================================

create table if not exists rooms (
  id uuid primary key default gen_random_uuid(),
  room_no text not null unique,
  room_type text not null check (room_type in ('Classroom','Lab','Library','Office','Staff Room','Store','Other')),
  floor int not null default 1,
  capacity int not null default 0 check (capacity >= 0),
  current_usage int not null default 0 check (current_usage >= 0),
  is_occupied boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists library_books (
  id uuid primary key default gen_random_uuid(),
  isbn text,
  title text not null,
  author text,
  publisher text,
  category text,
  total_copies int not null default 1 check (total_copies >= 0),
  available_copies int not null default 1 check (available_copies >= 0),
  shelf_location text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (available_copies <= total_copies)
);

create table if not exists library_checkouts (
  id uuid primary key default gen_random_uuid(),
  book_id uuid not null references library_books(id) on delete restrict,
  student_id uuid references students(id) on delete set null,
  staff_id uuid references staff(id) on delete set null,
  borrower_name text not null,
  checkout_date date not null default current_date,
  due_date date not null,
  return_date date,
  status text not null default 'Issued'
    check (status in ('Issued','Returned','Overdue','Lost')),
  fine numeric(12,2) not null default 0 check (fine >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (due_date >= checkout_date),
  check (student_id is not null or staff_id is not null)
);

create table if not exists assets (
  id uuid primary key default gen_random_uuid(),
  asset_code text not null unique,
  name text not null,
  category_id uuid references asset_categories(id) on delete set null,
  purchase_date date not null default current_date,
  purchase_cost numeric(12,2) not null check (purchase_cost >= 0),
  salvage_value numeric(12,2) not null default 0 check (salvage_value >= 0),
  current_value numeric(12,2),
  location text,
  status text not null default 'In Use'
    check (status in ('In Use','Under Maintenance','Disposed','Lost')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists energy_logs (
  id uuid primary key default gen_random_uuid(),
  reading_date date not null default current_date,
  room_id uuid references rooms(id) on delete set null,
  consumption_kwh numeric(10,2) not null check (consumption_kwh >= 0),
  cost numeric(12,2) not null check (cost >= 0),
  source text check (source in ('Grid','Solar','Generator','Other')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ============================================================
-- INDEXES
-- ============================================================
create index if not exists idx_sections_class on sections(class_id);
create index if not exists idx_students_class on students(class_id);
create index if not exists idx_students_section on students(section_id);
create index if not exists idx_students_guardian on students(guardian_id);
create index if not exists idx_students_status on students(enrollment_status);
create index if not exists idx_fee_collections_student on fee_collections(student_id);
create index if not exists idx_fee_collections_date on fee_collections(payment_date);
create index if not exists idx_income_date on income_entries(entry_date);
create index if not exists idx_expense_date on expense_entries(entry_date);
create index if not exists idx_staff_department on staff(department_id);
create index if not exists idx_staff_type on staff(staff_type);
create index if not exists idx_staff_attendance_date on staff_attendance(attendance_date);
create index if not exists idx_staff_leaves_staff on staff_leaves(staff_id);
create index if not exists idx_payroll_staff on payroll(staff_id);
create index if not exists idx_library_checkouts_book on library_checkouts(book_id);
create index if not exists idx_library_checkouts_status on library_checkouts(status);
create index if not exists idx_assets_category on assets(category_id);
create index if not exists idx_energy_logs_date on energy_logs(reading_date);

-- ============================================================
-- updated_at triggers
-- ============================================================
do $$
declare t text;
begin
  for t in select unnest(array[
    'classes','sections','departments','fee_categories','asset_categories',
    'guardians','students','fee_structures','fee_collections','income_entries',
    'expense_entries','staff','staff_attendance','staff_leaves','payroll',
    'rooms','library_books','library_checkouts','assets','energy_logs'
  ])
  loop
    execute format('drop trigger if exists trg_%1$s_updated on %1$I;', t);
    execute format('create trigger trg_%1$s_updated before update on %1$I for each row execute function set_updated_at();', t);
  end loop;
end$$;

-- ============================================================
-- RLS — single-tenant (no auth). All tables shared/public.
-- Helper to apply the 4 standard policies per table.
-- ============================================================
do $$
declare
  tbl text;
  arr text[] := array[
    'classes','sections','departments','fee_categories','asset_categories',
    'guardians','students','fee_structures','fee_collections','income_entries',
    'expense_entries','staff','staff_attendance','staff_leaves','payroll',
    'rooms','library_books','library_checkouts','assets','energy_logs'
  ];
begin
  foreach tbl in array arr
  loop
    execute format('alter table %I enable row level security;', tbl);

    execute format('drop policy if exists %I on %I;', tbl || '_select', tbl);
    execute format('create policy %I on %I for select to anon, authenticated using (true);', tbl || '_select', tbl);

    execute format('drop policy if exists %I on %I;', tbl || '_insert', tbl);
    execute format('create policy %I on %I for insert to anon, authenticated with check (true);', tbl || '_insert', tbl);

    execute format('drop policy if exists %I on %I;', tbl || '_update', tbl);
    execute format('create policy %I on %I for update to anon, authenticated using (true) with check (true);', tbl || '_update', tbl);

    execute format('drop policy if exists %I on %I;', tbl || '_delete', tbl);
    execute format('create policy %I on %I for delete to anon, authenticated using (true);', tbl || '_delete', tbl);
  end loop;
end$$;
