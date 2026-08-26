-- admin_notifications already carries order_id for order-type notifications (stage_change) —
-- this adds the analogous link for employee-related notification types (leave_request,
-- attendance) so the notification bell can navigate straight to the employee, same as it
-- already does for orders. Nullable, no FK: this table predates tracked migrations and every
-- other column here is already a plain nullable reference for the same reason.
ALTER TABLE admin_notifications ADD COLUMN IF NOT EXISTS employee_id UUID;
