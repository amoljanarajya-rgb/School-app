/*
# Add transport, exams, student attendance, and parent notifications modules

## Summary
Adds 7 new tables to support: (1) class-wise student attendance, (2) transport & bus fleet
management with student-to-bus mapping, (3) external competitive examinations with
enrollments and results, and (4) parent communication notifications log.

## New Tables

1. `buses` — Bus fleet registry.
   - id (uuid PK), bus_no (text, unique), capacity (int), driver_name (text),
     driver_phone (text), driver_license (text), status (text: Active/Maintenance/Retired),
     created_at, updated_at.

2. `bus_routes` — Route definitions tied to a bus.
   - id (uuid PK), bus_id (uuid FK→buses), route_name (text), pickup_points (text, newline-separated list),
     start_time (time), end_time (time), created_at, updated_at.

3. `student_bus_mappings` — Student-to-bus assignment with pickup point.
   - id (uuid PK), student_id (uuid FK→students), bus_id (uuid FK→buses), route_id (uuid FK→bus_routes, nullable),
     pickup_point (text), created_at, updated_at.
   - UNIQUE on student_id (one bus per student).

4. `student_attendance` — Daily class-wise student attendance.
   - id (uuid PK), student_id (uuid FK→students), class_id (uuid FK→classes), section_id (uuid FK→sections, nullable),
     attendance_date (date), status (text: Present/Absent/Late/Leave), remarks (text, nullable),
     created_at, updated_at.
   - UNIQUE on (student_id, attendance_date) to prevent duplicates.

5. `external_exams` — External competitive exam catalog.
   - id (uuid PK), name (text), exam_code (text, unique), exam_type (text: Scholarship/Olympiad/NTSE/Drawing/Other),
     exam_date (date), registration_deadline (date, nullable), exam_center (text, nullable),
     description (text, nullable), created_at, updated_at.

6. `exam_enrollments` — Student enrollment in external exams with hall ticket + results.
   - id (uuid PK), exam_id (uuid FK→external_exams), student_id (uuid FK→students),
     hall_ticket_no (text, nullable), exam_center (text, nullable), enrollment_status (text: Registered/Confirmed/Cancelled),
     marks (numeric, nullable), result_status (text: Pending/Pass/Fail/Absent, nullable),
     created_at, updated_at.
   - UNIQUE on (exam_id, student_id).

7. `parent_notifications` — Log of messages sent to parents.
   - id (uuid PK), student_id (uuid FK→students, nullable for broadcast), channel (text: SMS/WhatsApp/Push),
     template (text: Absenteeism/FeeDue/Emergency/ExamNotice/Custom), subject (text), body (text),
     recipient_phone (text), status (text: Queued/Sent/Failed), sent_at (timestamptz, nullable),
     created_at, updated_at.

## Security
- Single-tenant app (no sign-in). RLS enabled on all new tables with anon+authenticated full CRUD
  using USING(true) / WITH CHECK(true) since data is intentionally shared across staff users.

## Important Notes
1. All FKs use ON DELETE CASCADE for child tables so removing a student cleans up mappings.
2. UNIQUE constraints prevent duplicate attendance rows and duplicate exam enrollments.
3. No user_id columns — this is a shared staff ERP, not per-user data.
*/

-- 1. Buses
CREATE TABLE IF NOT EXISTS buses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  bus_no text UNIQUE NOT NULL,
  capacity integer NOT NULL DEFAULT 30 CHECK (capacity > 0),
  driver_name text NOT NULL,
  driver_phone text,
  driver_license text,
  status text NOT NULL DEFAULT 'Active' CHECK (status IN ('Active','Maintenance','Retired')),
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);
ALTER TABLE buses ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "anon_crud_buses" ON buses;
CREATE POLICY "anon_crud_buses" ON buses FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY "anon_insert_buses" ON buses FOR INSERT TO anon, authenticated WITH CHECK (true);
CREATE POLICY "anon_update_buses" ON buses FOR UPDATE TO anon, authenticated USING (true) WITH CHECK (true);
CREATE POLICY "anon_delete_buses" ON buses FOR DELETE TO anon, authenticated USING (true);

-- 2. Bus Routes
CREATE TABLE IF NOT EXISTS bus_routes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  bus_id uuid NOT NULL REFERENCES buses(id) ON DELETE CASCADE,
  route_name text NOT NULL,
  pickup_points text,
  start_time time,
  end_time time,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);
ALTER TABLE bus_routes ENABLE ROW LEVEL SECURITY;
CREATE POLICY "anon_crud_bus_routes_sel" ON bus_routes FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY "anon_crud_bus_routes_ins" ON bus_routes FOR INSERT TO anon, authenticated WITH CHECK (true);
CREATE POLICY "anon_crud_bus_routes_upd" ON bus_routes FOR UPDATE TO anon, authenticated USING (true) WITH CHECK (true);
CREATE POLICY "anon_crud_bus_routes_del" ON bus_routes FOR DELETE TO anon, authenticated USING (true);

-- 3. Student-Bus Mappings
CREATE TABLE IF NOT EXISTS student_bus_mappings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id uuid NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  bus_id uuid NOT NULL REFERENCES buses(id) ON DELETE CASCADE,
  route_id uuid REFERENCES bus_routes(id) ON DELETE SET NULL,
  pickup_point text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  UNIQUE (student_id)
);
ALTER TABLE student_bus_mappings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "anon_crud_sbm_sel" ON student_bus_mappings FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY "anon_crud_sbm_ins" ON student_bus_mappings FOR INSERT TO anon, authenticated WITH CHECK (true);
CREATE POLICY "anon_crud_sbm_upd" ON student_bus_mappings FOR UPDATE TO anon, authenticated USING (true) WITH CHECK (true);
CREATE POLICY "anon_crud_sbm_del" ON student_bus_mappings FOR DELETE TO anon, authenticated USING (true);

-- 4. Student Attendance
CREATE TABLE IF NOT EXISTS student_attendance (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id uuid NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  class_id uuid NOT NULL REFERENCES classes(id) ON DELETE CASCADE,
  section_id uuid REFERENCES sections(id) ON DELETE SET NULL,
  attendance_date date NOT NULL,
  status text NOT NULL DEFAULT 'Present' CHECK (status IN ('Present','Absent','Late','Leave')),
  remarks text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  UNIQUE (student_id, attendance_date)
);
ALTER TABLE student_attendance ENABLE ROW LEVEL SECURITY;
CREATE POLICY "anon_crud_sa_sel" ON student_attendance FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY "anon_crud_sa_ins" ON student_attendance FOR INSERT TO anon, authenticated WITH CHECK (true);
CREATE POLICY "anon_crud_sa_upd" ON student_attendance FOR UPDATE TO anon, authenticated USING (true) WITH CHECK (true);
CREATE POLICY "anon_crud_sa_del" ON student_attendance FOR DELETE TO anon, authenticated USING (true);

-- 5. External Exams
CREATE TABLE IF NOT EXISTS external_exams (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  exam_code text UNIQUE NOT NULL,
  exam_type text NOT NULL DEFAULT 'Other' CHECK (exam_type IN ('Scholarship','Olympiad','NTSE','Drawing','Other')),
  exam_date date NOT NULL,
  registration_deadline date,
  exam_center text,
  description text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);
ALTER TABLE external_exams ENABLE ROW LEVEL SECURITY;
CREATE POLICY "anon_crud_ee_sel" ON external_exams FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY "anon_crud_ee_ins" ON external_exams FOR INSERT TO anon, authenticated WITH CHECK (true);
CREATE POLICY "anon_crud_ee_upd" ON external_exams FOR UPDATE TO anon, authenticated USING (true) WITH CHECK (true);
CREATE POLICY "anon_crud_ee_del" ON external_exams FOR DELETE TO anon, authenticated USING (true);

-- 6. Exam Enrollments
CREATE TABLE IF NOT EXISTS exam_enrollments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  exam_id uuid NOT NULL REFERENCES external_exams(id) ON DELETE CASCADE,
  student_id uuid NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  hall_ticket_no text,
  exam_center text,
  enrollment_status text NOT NULL DEFAULT 'Registered' CHECK (enrollment_status IN ('Registered','Confirmed','Cancelled')),
  marks numeric,
  result_status text CHECK (result_status IN ('Pending','Pass','Fail','Absent')),
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  UNIQUE (exam_id, student_id)
);
ALTER TABLE exam_enrollments ENABLE ROW LEVEL SECURITY;
CREATE POLICY "anon_crud_exr_sel" ON exam_enrollments FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY "anon_crud_exr_ins" ON exam_enrollments FOR INSERT TO anon, authenticated WITH CHECK (true);
CREATE POLICY "anon_crud_exr_upd" ON exam_enrollments FOR UPDATE TO anon, authenticated USING (true) WITH CHECK (true);
CREATE POLICY "anon_crud_exr_del" ON exam_enrollments FOR DELETE TO anon, authenticated USING (true);

-- 7. Parent Notifications
CREATE TABLE IF NOT EXISTS parent_notifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id uuid REFERENCES students(id) ON DELETE SET NULL,
  channel text NOT NULL DEFAULT 'SMS' CHECK (channel IN ('SMS','WhatsApp','Push')),
  template text NOT NULL DEFAULT 'Custom' CHECK (template IN ('Absenteeism','FeeDue','Emergency','ExamNotice','Custom')),
  subject text NOT NULL,
  body text NOT NULL,
  recipient_phone text,
  status text NOT NULL DEFAULT 'Queued' CHECK (status IN ('Queued','Sent','Failed')),
  sent_at timestamptz,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);
ALTER TABLE parent_notifications ENABLE ROW LEVEL SECURITY;
CREATE POLICY "anon_crud_pn_sel" ON parent_notifications FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY "anon_crud_pn_ins" ON parent_notifications FOR INSERT TO anon, authenticated WITH CHECK (true);
CREATE POLICY "anon_crud_pn_upd" ON parent_notifications FOR UPDATE TO anon, authenticated USING (true) WITH CHECK (true);
CREATE POLICY "anon_crud_pn_del" ON parent_notifications FOR DELETE TO anon, authenticated USING (true);
