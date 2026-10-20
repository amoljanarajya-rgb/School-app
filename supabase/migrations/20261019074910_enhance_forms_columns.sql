/*
# Enhance forms: photo, voucher, local language, payment modes

## Changes
1. `students` — add `photo_url` (text, nullable) for profile photo storage path.
2. `students` — add `local_name` (text, nullable) for Devanagari/local language name.
3. `guardians` — add `local_name` (text, nullable) for local language guardian name.
4. `fee_collections` — expand payment_method check to include UPI, NetBanking.
5. `expense_entries` — add `voucher_url` (text, nullable) for payment voucher upload.
6. `income_entries` — add `voucher_url` (text, nullable).
7. `staff` — add `local_name` (text, nullable) for local language staff name.
8. `staff` — add `photo_url` (text, nullable) for staff photo.

## Security
- No new tables; RLS already enabled on all affected tables.
- Storage bucket `erp-uploads` created separately for file uploads.
*/

alter table students add column if not exists photo_url text;
alter table students add column if not exists local_name text;
alter table guardians add column if not exists local_name text;
alter table staff add column if not exists photo_url text;
alter table staff add column if not exists local_name text;
alter table expense_entries add column if not exists voucher_url text;
alter table income_entries add column if not exists voucher_url text;

-- Expand payment_method check on fee_collections to include UPI and NetBanking
alter table fee_collections drop constraint if exists fee_collections_payment_method_check;
alter table fee_collections add constraint fee_collections_payment_method_check
  check (payment_method in ('Cash','Card','Bank Transfer','Cheque','Online','UPI','NetBanking'));
