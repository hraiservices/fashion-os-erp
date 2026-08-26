-- Optional link between a user_roles row (dashboard login/permissions) and an employees row
-- (staff record: attendance, payroll, PIN check-in) — previously two completely unrelated
-- tables, keyed differently (email vs mobile), with no way to tell "this manager IS this
-- employee" anywhere in the app.
--
-- UNIQUE allows unlimited NULLs but enforces uniqueness among non-null values — this alone
-- gives "optional, strictly one-to-one when set" with no extra application logic. The plain FK
-- (default NO ACTION) blocks deleting a referenced employee at the DB level as a safety net;
-- the app layer (src/app/api/employees/[id]/route.ts) gives the actual friendly error first.
ALTER TABLE user_roles ADD COLUMN IF NOT EXISTS linked_employee_id UUID REFERENCES employees(id);
ALTER TABLE user_roles ADD CONSTRAINT user_roles_linked_employee_id_key UNIQUE (linked_employee_id);
