-- Manual bonus/deduction adjustments on a draft payslip (e.g. a one-off bonus, a fine, a
-- correction the attendance-based math can't express) — previously net_pay was purely a
-- function of attendance/piece-rate/overtime/advances with no way to nudge one employee's
-- payslip without editing raw DB rows. Positive = bonus, negative = deduction; the existing
-- `notes` column (already on payslips, previously unused by the app) doubles as the adjustment
-- reason. Only ever applied to a payslip while its run is still "draft" — see
-- src/app/api/payroll/payslips/[id]/route.ts.
ALTER TABLE payslips ADD COLUMN IF NOT EXISTS adjustment_amount numeric NOT NULL DEFAULT 0;
