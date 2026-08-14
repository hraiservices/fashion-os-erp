-- Phase 1 of self-service attendance (selfie + GPS check-in/out) and hour/overtime-based
-- payroll. Additive only — existing manual attendance marking (status/check_in/check_out TIME)
-- keeps working exactly as before; self-check-in rows are distinguished by source='self_service'
-- and carry the new precise timestamp/location/photo columns alongside it.

-- Multiple shop locations, each with its own geofence — an employee is assigned to one.
CREATE TABLE IF NOT EXISTS shop_locations (
  id                 UUID          DEFAULT gen_random_uuid() PRIMARY KEY,
  name               TEXT          NOT NULL,
  address            TEXT          NOT NULL DEFAULT '',
  latitude           NUMERIC(10,7) NOT NULL,
  longitude          NUMERIC(10,7) NOT NULL,
  geofence_radius_m  INTEGER       NOT NULL DEFAULT 200,
  active             BOOLEAN       NOT NULL DEFAULT true,
  created_at         TIMESTAMPTZ   DEFAULT NOW()
);

ALTER TABLE shop_locations ENABLE ROW LEVEL SECURITY;
CREATE POLICY "authenticated_all" ON shop_locations FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- pin_hash is a bcrypt hash, never the plain PIN — verified only server-side (see
-- /api/attendance/checkin's PIN-login route). Deliberately excluded from the client-side
-- employees SELECT in use-employees.ts even though RLS would technically allow reading it.
ALTER TABLE employees
  ADD COLUMN IF NOT EXISTS pin_hash    TEXT,
  ADD COLUMN IF NOT EXISTS location_id UUID REFERENCES shop_locations(id) ON DELETE SET NULL;

ALTER TABLE employee_attendance
  ADD COLUMN IF NOT EXISTS source                   TEXT    NOT NULL DEFAULT 'manual' CHECK (source IN ('manual', 'self_service')),
  ADD COLUMN IF NOT EXISTS check_in_at               TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS check_out_at              TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS check_in_lat              NUMERIC(10,7),
  ADD COLUMN IF NOT EXISTS check_in_lng              NUMERIC(10,7),
  ADD COLUMN IF NOT EXISTS check_in_accuracy_m       NUMERIC(8,2),
  ADD COLUMN IF NOT EXISTS check_out_lat             NUMERIC(10,7),
  ADD COLUMN IF NOT EXISTS check_out_lng             NUMERIC(10,7),
  ADD COLUMN IF NOT EXISTS check_out_accuracy_m      NUMERIC(8,2),
  ADD COLUMN IF NOT EXISTS check_in_photo            TEXT,
  ADD COLUMN IF NOT EXISTS check_out_photo           TEXT,
  ADD COLUMN IF NOT EXISTS check_in_within_geofence  BOOLEAN,
  ADD COLUMN IF NOT EXISTS check_out_within_geofence BOOLEAN,
  ADD COLUMN IF NOT EXISTS check_in_distance_m       NUMERIC(10,2),
  ADD COLUMN IF NOT EXISTS check_out_distance_m      NUMERIC(10,2),
  ADD COLUMN IF NOT EXISTS hours_worked              NUMERIC(5,2),
  ADD COLUMN IF NOT EXISTS overtime_hours            NUMERIC(5,2) NOT NULL DEFAULT 0;

-- Payslips gain hours/OT breakdown (per feature decision: shown as a separate line item, not
-- folded into gross_pay). Advances-deducted is intentionally NOT a new column here — it's
-- already queryable via employee_advances.payslip_id, so the payslip PDF reads that directly
-- rather than duplicating the total.
ALTER TABLE payslips
  ADD COLUMN IF NOT EXISTS hours_worked   NUMERIC(7,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS overtime_hours NUMERIC(7,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS overtime_pay   NUMERIC(10,2) NOT NULL DEFAULT 0;
