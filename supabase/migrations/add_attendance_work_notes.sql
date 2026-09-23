-- Daily "what did you do today" note, required from every self-service check-out except
-- tailors (their output is already tracked via order stage moves — see
-- day-book.ts buildTailorStageProgress). Written once at check-out and never edited after
-- (src/app/api/attendance/checkout/route.ts), read back by the Daily Employee Activity report
-- (src/app/(app)/reports/daily-employee-activity).
ALTER TABLE employee_attendance
  ADD COLUMN IF NOT EXISTS work_notes TEXT NOT NULL DEFAULT '';
