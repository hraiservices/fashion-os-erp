-- Shipping and other charges on purchase bills and purchase orders. Added to the total AFTER GST (no GST on them).
ALTER TABLE purchase_bills  ADD COLUMN IF NOT EXISTS shipping_charges NUMERIC(12,2) NOT NULL DEFAULT 0 CHECK (shipping_charges >= 0);
ALTER TABLE purchase_bills  ADD COLUMN IF NOT EXISTS other_charges    NUMERIC(12,2) NOT NULL DEFAULT 0 CHECK (other_charges >= 0);
ALTER TABLE purchase_orders ADD COLUMN IF NOT EXISTS shipping_charges NUMERIC(12,2) NOT NULL DEFAULT 0 CHECK (shipping_charges >= 0);
ALTER TABLE purchase_orders ADD COLUMN IF NOT EXISTS other_charges    NUMERIC(12,2) NOT NULL DEFAULT 0 CHECK (other_charges >= 0);
