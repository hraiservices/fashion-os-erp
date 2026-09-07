-- Named measurement profiles: a customer can now have several saved sets of measurements
-- ("Regular fit", "Loose fit", "Wedding suit") instead of just one, which used to get silently
-- overwritten every time an order was saved with different numbers — losing whichever fit
-- wasn't the most recent. Staff name profiles themselves; nothing here is auto-generated.
--
-- Deliberately additive: the existing flat `customers.measurements` column is untouched and
-- keeps working exactly as before for every customer who never engages with profiles. The new
-- array is read by the application as a purely optional enhancement layered on top — see
-- src/lib/measurement-profiles.ts for the shape and the legacy-fallback logic.
alter table public.customers add column if not exists measurement_profiles jsonb not null default '[]'::jsonb;

-- Which profile (if any) an order's measurements were taken from — a snapshot label, not a
-- live foreign key, so it stays meaningful even if the profile is later renamed or archived.
alter table public.orders add column if not exists measurement_profile_id text null;
alter table public.orders add column if not exists measurement_profile_name text null;
