-- Adds an optional vendor reference number (their own invoice/document number) to purchase bills,
-- matching the field expenses already have. Additive only — safe to run multiple times.
alter table purchase_bills add column if not exists reference_number text not null default '';
