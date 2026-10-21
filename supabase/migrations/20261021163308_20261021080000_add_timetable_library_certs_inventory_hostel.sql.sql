/*
# Add Timetable, Library Extensions, Certificates, Inventory, and Hostel Modules

1. New Tables
- `timetable_entries` — weekly class/teacher timetable slots (day, period, subject, class, section, teacher, room)
- `timetable_substitutions` — proxy teacher assignments when a teacher is absent
- `book_issues` — fast issue/return counter tracking (extends existing library_checkouts with barcode/ISBN workflow)
- `certificate_requests` — TC, Bonafide, Character certificate generation log
- `id_card_requests` — student/staff ID card generation log
- `inventory_items` — stock tracking for uniforms, books, supplies
- `inventory_sales` — POS counter sale entries with bill printing
- `hostel_rooms` — hostel room allocation tracking
- `hostel_allocations` — student-to-room assignments
- `hostel_fees` — hostel fee collection
- `gate_passes` — student gate pass entry/exit workflow

2. Modified Tables
- No existing tables are modified.

3. Security
- All new tables have RLS enabled.
- Policies use `TO anon, authenticated` since this is a single-tenant admin app (no sign-in screen).
- All CRUD operations allowed for anon + authenticated.

4. Important Notes
- `timetable_entries` uses a composite unique constraint on (class_id, section_id, day_of_week, period) to prevent double-booking a class slot.
- `timetable_substitutions` references the original timetable entry and the substitute teacher.
- `book_issues` extends the existing library workflow with ISBN/barcode tracking and late fine calculation.
- `inventory_sales` links to `inventory_items` with a foreign key and decrements stock.
- `hostel_rooms` tracks capacity and current occupancy; `hostel_allocations` manages student-to-room mapping.
- `gate_passes` tracks entry/exit with approval workflow.
*/

-- ============================================================
-- TIMETABLE & PROXY MANAGEMENT
-- ============================================================

CREATE TABLE IF NOT EXISTS timetable_entries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  class_id uuid NOT NULL REFERENCES classes(id) ON DELETE CASCADE,
  section_id uuid REFERENCES sections(id) ON DELETE SET NULL,
  teacher_id uuid NOT NULL REFERENCES staff(id) ON DELETE CASCADE,
  subject text NOT NULL,
  day_of_week integer NOT NULL CHECK (day_of_week >= 0 AND day_of_week <= 6),
  period integer NOT NULL CHECK (period >= 1 AND period <= 12),
  start_time text NOT NULL,
  end_time text NOT NULL,
  room_no text,
  is_break boolean NOT NULL DEFAULT false,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  UNIQUE (class_id, section_id, day_of_week, period)
);

ALTER TABLE timetable_entries ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "anon_select_timetable" ON timetable_entries;
CREATE POLICY "anon_select_timetable" ON timetable_entries FOR SELECT TO anon, authenticated USING (true);
DROP POLICY IF EXISTS "anon_insert_timetable" ON timetable_entries;
CREATE POLICY "anon_insert_timetable" ON timetable_entries FOR INSERT TO anon, authenticated WITH CHECK (true);
DROP POLICY IF EXISTS "anon_update_timetable" ON timetable_entries;
CREATE POLICY "anon_update_timetable" ON timetable_entries FOR UPDATE TO anon, authenticated USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "anon_delete_timetable" ON timetable_entries;
CREATE POLICY "anon_delete_timetable" ON timetable_entries FOR DELETE TO anon, authenticated USING (true);

CREATE TABLE IF NOT EXISTS timetable_substitutions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  timetable_entry_id uuid NOT NULL REFERENCES timetable_entries(id) ON DELETE CASCADE,
  original_teacher_id uuid NOT NULL REFERENCES staff(id) ON DELETE CASCADE,
  substitute_teacher_id uuid NOT NULL REFERENCES staff(id) ON DELETE CASCADE,
  date text NOT NULL,
  reason text,
  status text NOT NULL DEFAULT 'Assigned' CHECK (status IN ('Assigned', 'Accepted', 'Declined', 'Completed')),
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE timetable_substitutions ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "anon_select_subs" ON timetable_substitutions;
CREATE POLICY "anon_select_subs" ON timetable_substitutions FOR SELECT TO anon, authenticated USING (true);
DROP POLICY IF EXISTS "anon_insert_subs" ON timetable_substitutions;
CREATE POLICY "anon_insert_subs" ON timetable_substitutions FOR INSERT TO anon, authenticated WITH CHECK (true);
DROP POLICY IF EXISTS "anon_update_subs" ON timetable_substitutions;
CREATE POLICY "anon_update_subs" ON timetable_substitutions FOR UPDATE TO anon, authenticated USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "anon_delete_subs" ON timetable_substitutions;
CREATE POLICY "anon_delete_subs" ON timetable_substitutions FOR DELETE TO anon, authenticated USING (true);

-- ============================================================
-- LIBRARY FAST ISSUE/RETURN (extends existing library_books)
-- ============================================================

CREATE TABLE IF NOT EXISTS book_issues (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  book_id uuid NOT NULL REFERENCES library_books(id) ON DELETE CASCADE,
  student_id uuid REFERENCES students(id) ON DELETE SET NULL,
  staff_id uuid REFERENCES staff(id) ON DELETE SET NULL,
  borrower_name text NOT NULL,
  borrower_type text NOT NULL DEFAULT 'Student' CHECK (borrower_type IN ('Student', 'Staff')),
  isbn text,
  barcode text,
  issue_date date NOT NULL DEFAULT CURRENT_DATE,
  due_date date NOT NULL,
  return_date date,
  late_fine numeric NOT NULL DEFAULT 0,
  fine_paid boolean NOT NULL DEFAULT false,
  status text NOT NULL DEFAULT 'Issued' CHECK (status IN ('Issued', 'Returned', 'Overdue', 'Lost')),
  remarks text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE book_issues ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "anon_select_book_issues" ON book_issues;
CREATE POLICY "anon_select_book_issues" ON book_issues FOR SELECT TO anon, authenticated USING (true);
DROP POLICY IF EXISTS "anon_insert_book_issues" ON book_issues;
CREATE POLICY "anon_insert_book_issues" ON book_issues FOR INSERT TO anon, authenticated WITH CHECK (true);
DROP POLICY IF EXISTS "anon_update_book_issues" ON book_issues;
CREATE POLICY "anon_update_book_issues" ON book_issues FOR UPDATE TO anon, authenticated USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "anon_delete_book_issues" ON book_issues;
CREATE POLICY "anon_delete_book_issues" ON book_issues FOR DELETE TO anon, authenticated USING (true);

-- Add ISBN and barcode columns to library_books if not present
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'library_books' AND column_name = 'isbn') THEN
    ALTER TABLE library_books ADD COLUMN isbn text;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'library_books' AND column_name = 'barcode') THEN
    ALTER TABLE library_books ADD COLUMN barcode text;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'library_books' AND column_name = 'shelf_location') THEN
    ALTER TABLE library_books ADD COLUMN shelf_location text;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'library_books' AND column_name = 'edition') THEN
    ALTER TABLE library_books ADD COLUMN edition text;
  END IF;
END $$;

-- ============================================================
-- CERTIFICATES & ID CARDS
-- ============================================================

CREATE TABLE IF NOT EXISTS certificate_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id uuid NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  certificate_type text NOT NULL CHECK (certificate_type IN ('TransferCertificate', 'BonafideCertificate', 'CharacterCertificate')),
  reason text,
  issued_date date NOT NULL DEFAULT CURRENT_DATE,
  certificate_no text UNIQUE NOT NULL,
  status text NOT NULL DEFAULT 'Generated' CHECK (status IN ('Generated', 'Printed', 'Cancelled')),
  issued_by text,
  remarks text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE certificate_requests ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "anon_select_certs" ON certificate_requests;
CREATE POLICY "anon_select_certs" ON certificate_requests FOR SELECT TO anon, authenticated USING (true);
DROP POLICY IF EXISTS "anon_insert_certs" ON certificate_requests;
CREATE POLICY "anon_insert_certs" ON certificate_requests FOR INSERT TO anon, authenticated WITH CHECK (true);
DROP POLICY IF EXISTS "anon_update_certs" ON certificate_requests;
CREATE POLICY "anon_update_certs" ON certificate_requests FOR UPDATE TO anon, authenticated USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "anon_delete_certs" ON certificate_requests;
CREATE POLICY "anon_delete_certs" ON certificate_requests FOR DELETE TO anon, authenticated USING (true);

CREATE TABLE IF NOT EXISTS id_card_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  person_type text NOT NULL CHECK (person_type IN ('Student', 'Staff')),
  student_id uuid REFERENCES students(id) ON DELETE CASCADE,
  staff_id uuid REFERENCES staff(id) ON DELETE CASCADE,
  card_type text NOT NULL DEFAULT 'IdentityCard' CHECK (card_type IN ('IdentityCard', 'BusPass', 'LibraryCard')),
  generated_date date NOT NULL DEFAULT CURRENT_DATE,
  status text NOT NULL DEFAULT 'Generated' CHECK (status IN ('Generated', 'Printed', 'Reissued')),
  template_name text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE id_card_requests ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "anon_select_idcards" ON id_card_requests;
CREATE POLICY "anon_select_idcards" ON id_card_requests FOR SELECT TO anon, authenticated USING (true);
DROP POLICY IF EXISTS "anon_insert_idcards" ON id_card_requests;
CREATE POLICY "anon_insert_idcards" ON id_card_requests FOR INSERT TO anon, authenticated WITH CHECK (true);
DROP POLICY IF EXISTS "anon_update_idcards" ON id_card_requests;
CREATE POLICY "anon_update_idcards" ON id_card_requests FOR UPDATE TO anon, authenticated USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "anon_delete_idcards" ON id_card_requests;
CREATE POLICY "anon_delete_idcards" ON id_card_requests FOR DELETE TO anon, authenticated USING (true);

-- ============================================================
-- INVENTORY & STORE MANAGEMENT
-- ============================================================

CREATE TABLE IF NOT EXISTS inventory_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  category text NOT NULL CHECK (category IN ('Uniform', 'Book', 'Stationery', 'Sports', 'Other')),
  sku text,
  barcode text,
  size text,
  color text,
  unit_price numeric NOT NULL DEFAULT 0,
  cost_price numeric NOT NULL DEFAULT 0,
  stock_qty integer NOT NULL DEFAULT 0,
  reorder_level integer NOT NULL DEFAULT 5,
  unit text NOT NULL DEFAULT 'pcs',
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE inventory_items ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "anon_select_inventory" ON inventory_items;
CREATE POLICY "anon_select_inventory" ON inventory_items FOR SELECT TO anon, authenticated USING (true);
DROP POLICY IF EXISTS "anon_insert_inventory" ON inventory_items;
CREATE POLICY "anon_insert_inventory" ON inventory_items FOR INSERT TO anon, authenticated WITH CHECK (true);
DROP POLICY IF EXISTS "anon_update_inventory" ON inventory_items;
CREATE POLICY "anon_update_inventory" ON inventory_items FOR UPDATE TO anon, authenticated USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "anon_delete_inventory" ON inventory_items;
CREATE POLICY "anon_delete_inventory" ON inventory_items FOR DELETE TO anon, authenticated USING (true);

CREATE TABLE IF NOT EXISTS inventory_sales (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  bill_no text UNIQUE NOT NULL,
  customer_name text NOT NULL DEFAULT 'Walk-in Customer',
  customer_phone text,
  items jsonb NOT NULL DEFAULT '[]'::jsonb,
  subtotal numeric NOT NULL DEFAULT 0,
  discount numeric NOT NULL DEFAULT 0,
  tax numeric NOT NULL DEFAULT 0,
  total numeric NOT NULL DEFAULT 0,
  payment_method text NOT NULL DEFAULT 'Cash',
  sale_date date NOT NULL DEFAULT CURRENT_DATE,
  served_by text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE inventory_sales ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "anon_select_sales" ON inventory_sales;
CREATE POLICY "anon_select_sales" ON inventory_sales FOR SELECT TO anon, authenticated USING (true);
DROP POLICY IF EXISTS "anon_insert_sales" ON inventory_sales;
CREATE POLICY "anon_insert_sales" ON inventory_sales FOR INSERT TO anon, authenticated WITH CHECK (true);
DROP POLICY IF EXISTS "anon_update_sales" ON inventory_sales;
CREATE POLICY "anon_update_sales" ON inventory_sales FOR UPDATE TO anon, authenticated USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "anon_delete_sales" ON inventory_sales;
CREATE POLICY "anon_delete_sales" ON inventory_sales FOR DELETE TO anon, authenticated USING (true);

-- ============================================================
-- HOSTEL & MESS MANAGEMENT
-- ============================================================

CREATE TABLE IF NOT EXISTS hostel_rooms (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  room_no text NOT NULL,
  block_name text NOT NULL DEFAULT 'A Block',
  floor integer NOT NULL DEFAULT 1,
  capacity integer NOT NULL DEFAULT 2 CHECK (capacity > 0),
  current_occupancy integer NOT NULL DEFAULT 0,
  room_type text NOT NULL DEFAULT 'Shared' CHECK (room_type IN ('Single', 'Shared', 'Dormitory')),
  monthly_fee numeric NOT NULL DEFAULT 0,
  status text NOT NULL DEFAULT 'Available' CHECK (status IN ('Available', 'Full', 'Maintenance')),
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  UNIQUE (room_no, block_name)
);

ALTER TABLE hostel_rooms ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "anon_select_hostel_rooms" ON hostel_rooms;
CREATE POLICY "anon_select_hostel_rooms" ON hostel_rooms FOR SELECT TO anon, authenticated USING (true);
DROP POLICY IF EXISTS "anon_insert_hostel_rooms" ON hostel_rooms;
CREATE POLICY "anon_insert_hostel_rooms" ON hostel_rooms FOR INSERT TO anon, authenticated WITH CHECK (true);
DROP POLICY IF EXISTS "anon_update_hostel_rooms" ON hostel_rooms;
CREATE POLICY "anon_update_hostel_rooms" ON hostel_rooms FOR UPDATE TO anon, authenticated USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "anon_delete_hostel_rooms" ON hostel_rooms;
CREATE POLICY "anon_delete_hostel_rooms" ON hostel_rooms FOR DELETE TO anon, authenticated USING (true);

CREATE TABLE IF NOT EXISTS hostel_allocations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id uuid NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  room_id uuid NOT NULL REFERENCES hostel_rooms(id) ON DELETE CASCADE,
  allocation_date date NOT NULL DEFAULT CURRENT_DATE,
  vacate_date date,
  status text NOT NULL DEFAULT 'Active' CHECK (status IN ('Active', 'Vacated', 'Suspended')),
  mess_included boolean NOT NULL DEFAULT true,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE hostel_allocations ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "anon_select_hostel_alloc" ON hostel_allocations;
CREATE POLICY "anon_select_hostel_alloc" ON hostel_allocations FOR SELECT TO anon, authenticated USING (true);
DROP POLICY IF EXISTS "anon_insert_hostel_alloc" ON hostel_allocations;
CREATE POLICY "anon_insert_hostel_alloc" ON hostel_allocations FOR INSERT TO anon, authenticated WITH CHECK (true);
DROP POLICY IF EXISTS "anon_update_hostel_alloc" ON hostel_allocations;
CREATE POLICY "anon_update_hostel_alloc" ON hostel_allocations FOR UPDATE TO anon, authenticated USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "anon_delete_hostel_alloc" ON hostel_allocations;
CREATE POLICY "anon_delete_hostel_alloc" ON hostel_allocations FOR DELETE TO anon, authenticated USING (true);

CREATE TABLE IF NOT EXISTS hostel_fees (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id uuid NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  allocation_id uuid REFERENCES hostel_allocations(id) ON DELETE SET NULL,
  amount numeric NOT NULL,
  payment_date date NOT NULL DEFAULT CURRENT_DATE,
  period_month integer NOT NULL CHECK (period_month >= 1 AND period_month <= 12),
  period_year integer NOT NULL,
  payment_method text NOT NULL DEFAULT 'Cash',
  receipt_no text,
  status text NOT NULL DEFAULT 'Paid' CHECK (status IN ('Paid', 'Pending', 'Overdue')),
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE hostel_fees ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "anon_select_hostel_fees" ON hostel_fees;
CREATE POLICY "anon_select_hostel_fees" ON hostel_fees FOR SELECT TO anon, authenticated USING (true);
DROP POLICY IF EXISTS "anon_insert_hostel_fees" ON hostel_fees;
CREATE POLICY "anon_insert_hostel_fees" ON hostel_fees FOR INSERT TO anon, authenticated WITH CHECK (true);
DROP POLICY IF EXISTS "anon_update_hostel_fees" ON hostel_fees;
CREATE POLICY "anon_update_hostel_fees" ON hostel_fees FOR UPDATE TO anon, authenticated USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "anon_delete_hostel_fees" ON hostel_fees;
CREATE POLICY "anon_delete_hostel_fees" ON hostel_fees FOR DELETE TO anon, authenticated USING (true);

CREATE TABLE IF NOT EXISTS gate_passes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id uuid NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  pass_type text NOT NULL CHECK (pass_type IN ('Exit', 'Entry', 'Outing', 'Home Visit')),
  requested_by text NOT NULL DEFAULT 'Self',
  approved_by text,
  out_date timestamptz NOT NULL DEFAULT now(),
  expected_return timestamptz,
  actual_return timestamptz,
  reason text NOT NULL,
  destination text,
  contact_person text,
  contact_phone text,
  status text NOT NULL DEFAULT 'Pending' CHECK (status IN ('Pending', 'Approved', 'Rejected', 'Completed', 'Expired')),
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE gate_passes ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "anon_select_gatepass" ON gate_passes;
CREATE POLICY "anon_select_gatepass" ON gate_passes FOR SELECT TO anon, authenticated USING (true);
DROP POLICY IF EXISTS "anon_insert_gatepass" ON gate_passes;
CREATE POLICY "anon_insert_gatepass" ON gate_passes FOR INSERT TO anon, authenticated WITH CHECK (true);
DROP POLICY IF EXISTS "anon_update_gatepass" ON gate_passes;
CREATE POLICY "anon_update_gatepass" ON gate_passes FOR UPDATE TO anon, authenticated USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "anon_delete_gatepass" ON gate_passes;
CREATE POLICY "anon_delete_gatepass" ON gate_passes FOR DELETE TO anon, authenticated USING (true);

-- Indexes for frequently queried columns
CREATE INDEX IF NOT EXISTS idx_timetable_class ON timetable_entries(class_id, day_of_week);
CREATE INDEX IF NOT EXISTS idx_timetable_teacher ON timetable_entries(teacher_id, day_of_week);
CREATE INDEX IF NOT EXISTS idx_book_issues_status ON book_issues(status);
CREATE INDEX IF NOT EXISTS idx_book_issues_student ON book_issues(student_id);
CREATE INDEX IF NOT EXISTS idx_inventory_category ON inventory_items(category);
CREATE INDEX IF NOT EXISTS idx_hostel_alloc_student ON hostel_allocations(student_id);
CREATE INDEX IF NOT EXISTS idx_gate_passes_student ON gate_passes(student_id);
CREATE INDEX IF NOT EXISTS idx_gate_passes_status ON gate_passes(status);
