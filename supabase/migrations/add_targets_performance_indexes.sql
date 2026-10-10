-- Targets module speed: indexes for the queries the lead list, summary and task lists run most.
-- Safe to run more than once (IF NOT EXISTS) and does not change any data.

-- Lead list and summary read leads newest-first; visibility checks match on who created the lead.
CREATE INDEX IF NOT EXISTS idx_leads_created_at ON leads (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_leads_created_by ON leads (created_by);

-- Open-task lists and the summary filter on status first, then order by due date.
CREATE INDEX IF NOT EXISTS idx_work_tasks_status_due ON work_tasks (status, due_date);

-- Sales facts for target progress are read by date range.
CREATE INDEX IF NOT EXISTS idx_orders_in_date ON orders (in_date);
CREATE INDEX IF NOT EXISTS idx_sales_invoices_invoice_date ON sales_invoices (invoice_date);
