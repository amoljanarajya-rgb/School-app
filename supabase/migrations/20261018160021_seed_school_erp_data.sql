/*
# Seed: reference data + representative sample rows

Populates lookup tables (classes, sections, departments, fee categories, asset
categories) and inserts representative rows across all modules so the dashboard
has data to display on first load. Safe to re-run (idempotent-ish via ON CONFLICT
for unique natural keys).
*/

-- Classes (Grade 1..10)
insert into classes (name, level)
select 'Grade ' || g, g from generate_series(1,10) g
on conflict (name) do nothing;

-- Sections for each class (A, B)
insert into sections (class_id, name, capacity)
select c.id, s.letter, 40
from classes c
cross join (values ('A'), ('B')) as s(letter)
on conflict (class_id, name) do nothing;

-- Departments
insert into departments (name, type) values
  ('Science','Teaching'),
  ('Mathematics','Teaching'),
  ('English','Teaching'),
  ('Social Studies','Teaching'),
  ('Physical Education','Teaching'),
  ('Administration','Non-Teaching'),
  ('Finance','Non-Teaching'),
  ('Maintenance','Non-Teaching'),
  ('IT Support','Non-Teaching')
on conflict (name) do nothing;

-- Fee categories
insert into fee_categories (name, description) values
  ('Tuition','Annual tuition fee'),
  ('Transport','School bus service'),
  ('Lab','Laboratory usage fee'),
  ('Library','Library fee'),
  ('Sports','Sports and physical education'),
  ('Examination','Examination and assessment fee')
on conflict (name) do nothing;

-- Asset categories
insert into asset_categories (name, useful_life_years) values
  ('Furniture',10),
  ('Computers',5),
  ('Lab Equipment',8),
  ('Vehicles',15),
  ('Buildings',40),
  ('Sports Equipment',6)
on conflict (name) do nothing;

-- Rooms
insert into rooms (room_no, room_type, floor, capacity, current_usage, is_occupied) values
  ('101','Classroom',1,40,38,true),
  ('102','Classroom',1,40,35,true),
  ('103','Classroom',1,40,0,false),
  ('201','Classroom',2,40,40,true),
  ('202','Lab',2,30,24,true),
  ('203','Library',2,60,18,true),
  ('301','Staff Room',3,20,12,true),
  ('302','Office',3,10,8,true)
on conflict (room_no) do nothing;

-- Sample guardians + students
insert into guardians (full_name, relationship, phone, email, occupation) values
  ('Robert Smith','Father','555-0101','robert.s@email.com','Engineer'),
  ('Maria Johnson','Mother','555-0102','maria.j@email.com','Doctor'),
  ('David Lee','Father','555-0103','david.lee@email.com','Teacher'),
  ('Sarah Brown','Mother','555-0104','sarah.b@email.com','Accountant')
on conflict do nothing;

insert into students (admission_no, full_name, roll_no, class_id, section_id, gender, date_of_birth, admission_date, blood_group, address, city, state, postal_code, guardian_id, enrollment_status)
select
  'ADM-' || lpad(g::text,4,'0'),
  (array['Emma Smith','Liam Johnson','Olivia Lee','Noah Brown','Ava Davis','Sophia Wilson','William Moore','Isabella Taylor','James Anderson','Mia Thomas'])[g],
  g,
  (select id from classes where name='Grade ' || ((g % 10) + 1)),
  (select id from sections where class_id=(select id from classes where name='Grade ' || ((g % 10) + 1)) and name='A'),
  case when g % 2 = 0 then 'Female' else 'Male' end,
  (current_date - (10 + (g % 5)) * interval '1 year')::date,
  current_date - (g * interval '30 days'),
  (array['A+','B+','O+','AB+','A-'])[1 + (g % 5)],
  (array['123 Main St','456 Oak Ave','789 Pine Rd','321 Elm St','654 Maple Dr'])[1 + (g % 5)],
  'Springfield','IL','62704',
  (select id from guardians limit 1 offset (g % 4)),
  case when g < 9 then 'Active' else 'Active' end
from generate_series(1,10) g
on conflict (admission_no) do nothing;

-- Fee structures for current academic year (Grade 1..10, Tuition)
insert into fee_structures (class_id, category_id, academic_year, amount, due_date)
select c.id, fc.id, '2026-2027', 12000 + (c.level * 500), '2026-12-31'::date
from classes c
cross join (select id from fee_categories where name='Tuition') fc
on conflict (class_id, category_id, academic_year) do nothing;

-- Fee collections
insert into fee_collections (student_id, fee_structure_id, category_id, amount, payment_date, payment_method, receipt_no, remarks)
select s.id, fs.id, fc.id, 5000, current_date - (g * interval '5 days'), 'Cash', 'RCP-' || lpad(g::text,5,'0'), 'Term 1 installment'
from students s
cross join (select id from fee_categories where name='Tuition') fc
cross join (select id from fee_structures where academic_year='2026-2027' limit 1) fs
cross join generate_series(1,6) g
where s.admission_no = 'ADM-' || lpad(g::text,4,'0')
on conflict (receipt_no) do nothing;

-- Income / expense entries
insert into income_entries (source, amount, entry_date, description, payment_method) values
  ('Donation', 25000, current_date - interval '3 days', 'Annual fund donation from alumni', 'Cheque'),
  ('Fundraiser', 12500, current_date - interval '8 days', 'Spring carnival proceeds', 'Cash'),
  ('Uniform Sales', 8200, current_date - interval '15 days', 'Uniform shop revenue', 'Card')
on conflict do nothing;

insert into expense_entries (category, amount, entry_date, description, payment_method) values
  ('Salary', 145000, current_date - interval '2 days', 'Staff salaries - October', 'Bank Transfer'),
  ('Maintenance', 4800, current_date - interval '5 days', 'Plumbing repair - Block A', 'Cash'),
  ('Supplies', 3200, current_date - interval '9 days', 'Stationery and lab supplies', 'Card'),
  ('Utility', 5600, current_date - interval '12 days', 'Electricity bill', 'Online')
on conflict do nothing;

-- Staff
insert into staff (employee_no, full_name, department_id, designation, staff_type, gender, date_of_birth, hire_date, phone, email, address, salary, status)
select
  'EMP-' || lpad(g::text,4,'0'),
  (array['Dr. Alan Grant','Ms. Diana Prince','Mr. Bruce Wayne','Mrs. Lois Lane','Mr. Clark Kent','Ms. Jean Grey','Mr. Peter Parker','Mrs. Mary Jane','Dr. Stephen Strange','Ms. Natasha R.'])[g],
  (select id from departments limit 1 offset (g % 9)),
  (array['Principal','Vice Principal','Teacher','Teacher','Teacher','Librarian','Lab Assistant','Accountant','IT Manager','Clerk'])[g],
  case when g % 3 = 0 then 'Non-Teaching' else 'Teaching' end,
  case when g % 2 = 0 then 'Female' else 'Male' end,
  (current_date - (30 + g) * interval '1 year')::date,
  current_date - (g * interval '200 days'),
  '555-0' || lpad(g::text,3,'0'),
  'staff' || g || '@school.edu',
  (array['10 Faculty Row','20 Education Ln','30 Scholar Way','40 Campus Dr'])[1 + (g % 4)],
  35000 + (g * 2500),
  'Active'
from generate_series(1,10) g
on conflict (employee_no) do nothing;

-- Staff attendance (today)
insert into staff_attendance (staff_id, attendance_date, status, check_in_time, check_out_time)
select id, current_date, case when g % 10 = 0 then 'Late' else 'Present' end, '08:00'::time, '16:00'::time
from staff, generate_series(1,1) g
on conflict (staff_id, attendance_date) do nothing;

-- Leaves
insert into staff_leaves (staff_id, leave_type, start_date, end_date, reason, status)
select (select id from staff limit 1 offset 0), 'Sick', current_date + 2, current_date + 4, 'Flu', 'Approved'
on conflict do nothing;
insert into staff_leaves (staff_id, leave_type, start_date, end_date, reason, status)
select (select id from staff limit 1 offset 1), 'Casual', current_date + 7, current_date + 8, 'Personal', 'Pending'
on conflict do nothing;

-- Payroll (last month)
insert into payroll (staff_id, pay_period_month, pay_period_year, basic_salary, allowances, deductions, payment_date, status)
select id, extract(month from current_date)::int, extract(year from current_date)::int,
  salary, salary * 0.15, salary * 0.08, current_date - interval '2 days', 'Paid'
from staff
on conflict (staff_id, pay_period_month, pay_period_year) do nothing;

-- Library books
insert into library_books (isbn, title, author, publisher, category, total_copies, available_copies, shelf_location) values
  ('978-0-1','To Kill a Mockingbird','Harper Lee','J.B. Lippincott','Fiction',5,3,'A-12'),
  ('978-0-2','A Brief History of Time','Stephen Hawking','Bantam','Science',4,4,'B-05'),
  ('978-0-3','The Great Gatsby','F. Scott Fitzgerald','Scribner','Fiction',3,1,'A-14'),
  ('978-0-4','Calculus','James Stewart','Cengage','Mathematics',6,5,'C-02'),
  ('978-0-5','Principles of Physics','Halliday & Resnick','Wiley','Science',4,2,'B-08')
on conflict do nothing;

-- Library checkouts
insert into library_checkouts (book_id, student_id, borrower_name, checkout_date, due_date, return_date, status, fine)
select (select id from library_books where title='To Kill a Mockingbird' limit 1),
       (select id from students limit 1 offset 0),
       'Emma Smith',
       current_date - 10, current_date - 3, null, 'Overdue', 20.00
on conflict do nothing;

-- Assets
insert into assets (asset_code, name, category_id, purchase_date, purchase_cost, salvage_value, current_value, location, status)
select 'AST-' || lpad(g::text,4,'0'),
  (array['Dell Desktop PC','Student Desk','Microscope','School Bus','Building Block A','Basketball Hoop'])[g],
  (select id from asset_categories limit 1 offset (g % 6)),
  current_date - ((g * 365) || ' days')::interval,
  (array[1200,120,850,45000,500000,300])[g],
  (array[100,10,50,5000,50000,0])[g],
  (array[800,90,600,38000,490000,150])[g],
  (array['Room 202','Room 101','Lab 202','Garage','Campus','Gym'])[g],
  'In Use'
from generate_series(1,6) g
on conflict (asset_code) do nothing;

-- Energy logs (last 7 days per occupied room)
insert into energy_logs (reading_date, room_id, consumption_kwh, cost, source)
select
  current_date - d * interval '1 day',
  r.id,
  (random() * 30 + 10)::numeric(10,2),
  ((random() * 30 + 10) * 0.15)::numeric(12,2),
  case when random() > 0.3 then 'Grid' else 'Solar' end
from rooms r
cross join generate_series(0,6) d
where r.is_occupied = true
on conflict do nothing;
