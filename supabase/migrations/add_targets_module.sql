-- Sales Targets module (licensed as `targets`): sales targets, leads with a light pipeline,
-- follow-ups, and team tasks/projects.
--
-- Access model: every table below is read and written ONLY through the /api/targets/** routes
-- (service-role client, after a permission check) — RLS is on with deliberately no policy for
-- `authenticated`, so the browser can never read or change these rows directly. Per-person
-- visibility ("staff see only their own leads/tasks/targets") is enforced in those routes, not
-- by RLS, because it depends on the caller's linked employee.
--
-- Idempotent (IF NOT EXISTS throughout). Migrations run in filename order: `leads` is created
-- before the ALTER on `orders` that references it.

-- ── Sales targets ──────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS sales_targets (
  id              UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  title           TEXT NOT NULL,
  -- sales_value: ₹ of orders + invoices credited · order_count: number of orders credited ·
  -- units: pieces of the chosen products/garments · leads_won: leads marked Won
  metric          TEXT NOT NULL CHECK (metric IN ('sales_value', 'order_count', 'units', 'leads_won')),
  target_value    NUMERIC(14,2) NOT NULL CHECK (target_value > 0),
  start_date      DATE NOT NULL,
  end_date        DATE NOT NULL,
  -- shop = everything counts · person = only sales credited to assignee_ids (shared total)
  scope           TEXT NOT NULL DEFAULT 'person' CHECK (scope IN ('shop', 'person')),
  assignee_ids    UUID[] NOT NULL DEFAULT '{}',
  product_ids     UUID[] NOT NULL DEFAULT '{}',
  garment_types   TEXT[] NOT NULL DEFAULT '{}',
  status_override TEXT CHECK (status_override IS NULL OR status_override IN ('draft', 'cancelled')),
  notes           TEXT NOT NULL DEFAULT '',
  created_by      TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CHECK (end_date >= start_date)
);
CREATE INDEX IF NOT EXISTS idx_sales_targets_dates ON sales_targets (start_date, end_date);

-- ── Leads ──────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS leads (
  id                    UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  name                  TEXT NOT NULL,
  mobile                TEXT NOT NULL DEFAULT '',
  customer_id           TEXT,
  source                TEXT NOT NULL DEFAULT '',
  product_interest      TEXT NOT NULL DEFAULT '',
  expected_value        NUMERIC(14,2) NOT NULL DEFAULT 0,
  stage                 TEXT NOT NULL DEFAULT 'new' CHECK (stage IN ('new', 'talking', 'visit', 'quoted', 'won', 'lost')),
  likely_to_close       BOOLEAN NOT NULL DEFAULT FALSE,
  assigned_employee_id  UUID REFERENCES employees(id) ON DELETE SET NULL,
  lost_reason           TEXT NOT NULL DEFAULT '',
  won_value             NUMERIC(14,2) NOT NULL DEFAULT 0,
  notes                 TEXT NOT NULL DEFAULT '',
  won_at                TIMESTAMPTZ,
  lost_at               TIMESTAMPTZ,
  order_id              TEXT,
  invoice_id            UUID,
  created_by            TEXT,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_leads_stage ON leads (stage);
CREATE INDEX IF NOT EXISTS idx_leads_assigned ON leads (assigned_employee_id);
CREATE INDEX IF NOT EXISTS idx_leads_mobile ON leads (mobile);

CREATE TABLE IF NOT EXISTS lead_activities (
  id          UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  lead_id     UUID NOT NULL REFERENCES leads(id) ON DELETE CASCADE,
  kind        TEXT NOT NULL CHECK (kind IN ('note', 'call', 'meeting', 'stage_change')),
  body        TEXT NOT NULL DEFAULT '',
  created_by  TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_lead_activities_lead ON lead_activities (lead_id, created_at DESC);

-- ── Projects and tasks ─────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS work_projects (
  id           UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  name         TEXT NOT NULL,
  description  TEXT NOT NULL DEFAULT '',
  owner_id     UUID REFERENCES employees(id) ON DELETE SET NULL,
  start_date   DATE,
  end_date     DATE,
  status       TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('planned', 'active', 'on_hold', 'done', 'cancelled')),
  target_id    UUID REFERENCES sales_targets(id) ON DELETE SET NULL,
  created_by   TEXT,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS work_tasks (
  id              UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  title           TEXT NOT NULL,
  description     TEXT NOT NULL DEFAULT '',
  project_id      UUID REFERENCES work_projects(id) ON DELETE SET NULL,
  parent_task_id  UUID REFERENCES work_tasks(id) ON DELETE CASCADE,
  group_name      TEXT NOT NULL DEFAULT '',
  assignee_id     UUID REFERENCES employees(id) ON DELETE SET NULL,
  priority        TEXT NOT NULL DEFAULT 'medium' CHECK (priority IN ('low', 'medium', 'high', 'urgent')),
  status          TEXT NOT NULL DEFAULT 'todo' CHECK (status IN ('todo', 'in_progress', 'blocked', 'done', 'cancelled')),
  start_date      DATE,
  due_date        DATE,
  completed_at    TIMESTAMPTZ,
  checklist       JSONB NOT NULL DEFAULT '[]',
  -- A follow-up is just a task linked to a lead. link_id is TEXT because orders/customers use text ids.
  link_type       TEXT CHECK (link_type IS NULL OR link_type IN ('lead', 'target', 'customer', 'order', 'invoice')),
  link_id         TEXT,
  created_by      TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_work_tasks_assignee_status ON work_tasks (assignee_id, status);
CREATE INDEX IF NOT EXISTS idx_work_tasks_due ON work_tasks (due_date);
CREATE INDEX IF NOT EXISTS idx_work_tasks_link ON work_tasks (link_type, link_id);
CREATE INDEX IF NOT EXISTS idx_work_tasks_project ON work_tasks (project_id);

-- ── Attribution columns on existing tables ─────────────────────────────────
-- Invoices record who made the sale (set by the invoice form / the "Create invoice" button on a
-- lead). Orders record the lead they came from — the only way a per-person target credits a
-- stitching order, since orders carry no "sold by" field of their own.
ALTER TABLE sales_invoices ADD COLUMN IF NOT EXISTS sales_person_id UUID REFERENCES employees(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_sales_invoices_sales_person ON sales_invoices (sales_person_id);

ALTER TABLE orders ADD COLUMN IF NOT EXISTS lead_id UUID REFERENCES leads(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_orders_lead ON orders (lead_id);

-- ── Lock the new tables to the service role ────────────────────────────────
ALTER TABLE sales_targets   ENABLE ROW LEVEL SECURITY;
ALTER TABLE leads           ENABLE ROW LEVEL SECURITY;
ALTER TABLE lead_activities ENABLE ROW LEVEL SECURITY;
ALTER TABLE work_projects   ENABLE ROW LEVEL SECURITY;
ALTER TABLE work_tasks      ENABLE ROW LEVEL SECURITY;
