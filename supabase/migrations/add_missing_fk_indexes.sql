-- Forensic Supabase audit (2026-09-19/20): 17 foreign key columns had no covering index,
-- confirmed via a live sweep of information_schema + pg_index. Every FK delete/update on the
-- referenced table forces a full sequential scan of the referencing table to check for
-- dependents, and every join/filter on these columns in the app's own queries does the same.
-- Performance-only finding, not a security or correctness issue -- plain CREATE INDEX
-- IF NOT EXISTS is safe to run as-is on this database's current size. If any of these tables
-- have grown very large by the time this runs, prefer running the individual statements with
-- CREATE INDEX CONCURRENTLY outside a transaction instead (this file's statements are ordinary,
-- transactional CREATE INDEX and will briefly lock writes on their table while building).

CREATE INDEX IF NOT EXISTS idx_bill_of_materials_raw_material_id ON public.bill_of_materials (raw_material_id);
CREATE INDEX IF NOT EXISTS idx_customer_recommendations_product_id ON public.customer_recommendations (product_id);
CREATE INDEX IF NOT EXISTS idx_customers_price_list_id ON public.customers (price_list_id);
CREATE INDEX IF NOT EXISTS idx_employee_advances_payslip_id ON public.employee_advances (payslip_id);
CREATE INDEX IF NOT EXISTS idx_employees_location_id ON public.employees (location_id);
CREATE INDEX IF NOT EXISTS idx_employees_manager_id ON public.employees (manager_id);
CREATE INDEX IF NOT EXISTS idx_inventory_ledger_warehouse_id ON public.inventory_ledger (warehouse_id);
CREATE INDEX IF NOT EXISTS idx_leave_balance_adjustments_leave_type_id ON public.leave_balance_adjustments (leave_type_id);
CREATE INDEX IF NOT EXISTS idx_leave_balance_adjustments_employee_id ON public.leave_balance_adjustments (employee_id);
CREATE INDEX IF NOT EXISTS idx_leave_balances_leave_type_id ON public.leave_balances (leave_type_id);
CREATE INDEX IF NOT EXISTS idx_leave_requests_leave_type_id ON public.leave_requests (leave_type_id);
CREATE INDEX IF NOT EXISTS idx_price_list_items_product_id ON public.price_list_items (product_id);
CREATE INDEX IF NOT EXISTS idx_purchase_bills_po_id ON public.purchase_bills (po_id);
CREATE INDEX IF NOT EXISTS idx_raw_materials_unit_id ON public.raw_materials (unit_id);
-- Note: atomic_sales_invoice_save.sql (elsewhere in this audit pass) adds a partial UNIQUE index
-- on sales_invoices(quote_id) WHERE quote_id IS NOT NULL, which already covers every row this FK
-- check needs (a null quote_id is never checked against sales_quotations). Harmless if both end
-- up applied -- just a few KB of redundant index -- but skip this one if that migration already ran.
CREATE INDEX IF NOT EXISTS idx_sales_invoices_quote_id ON public.sales_invoices (quote_id);
CREATE INDEX IF NOT EXISTS idx_sales_payments_pos_session_id ON public.sales_payments (pos_session_id);
CREATE INDEX IF NOT EXISTS idx_vendor_payments_vendor_id ON public.vendor_payments (vendor_id);
