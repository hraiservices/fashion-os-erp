-- One personal scratchpad note per logged-in user — the desktop utility rail's "Notes" icon.
-- Saved to the account (not just the browser) so it follows the user across devices, same as
-- their role/permissions already do via this table.
ALTER TABLE user_roles ADD COLUMN IF NOT EXISTS scratchpad_note text NOT NULL DEFAULT '';
