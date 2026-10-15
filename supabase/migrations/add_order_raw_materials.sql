-- Raw-material tracking per stitching order: which bought materials (lining, buttons, reels, other) the order
-- needs and whether each has arrived, plus a short note. See src/lib/order-materials.ts.
alter table public.orders add column if not exists materials jsonb not null default '[]'::jsonb;
alter table public.orders add column if not exists materials_note text not null default '';
