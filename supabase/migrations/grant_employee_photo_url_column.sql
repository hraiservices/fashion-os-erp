-- lockdown_employee_salary_columns.sql revoked table-wide SELECT on `employees` and granted it
-- back column-by-column, computed from whatever columns existed at the time it ran. `photo_url`
-- (add_employee_photo_url.sql) was added afterward, so it was never included in that grant —
-- `authenticated` has no SELECT privilege on it at all. Postgres denies a query outright if ANY
-- requested column lacks privilege, so every browser read that lists photo_url alongside other
-- employees columns (the staff directory, and the "my name/photo" lookup in use-current-user.ts)
-- was failing silently and returning nothing — not just the photo, the whole row.
GRANT SELECT (photo_url) ON public.employees TO authenticated;
