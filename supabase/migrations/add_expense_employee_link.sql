-- Adds a real employee link to expenses, so a "Salaries and Wages" expense paid to a tailor
-- can be identified reliably instead of matching the free-text Customer Link mobile number
-- against the employees table (fragile — depends on that number being typed in and matching
-- exactly). Nullable and on delete set null: an expense should survive an employee record
-- being removed, just losing the link.
alter table expenses
  add column if not exists employee_id uuid references employees(id) on delete set null;

create index if not exists idx_expenses_employee_id on expenses(employee_id) where employee_id is not null;
