PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS customers (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  email TEXT,
  phone TEXT,
  address TEXT NOT NULL DEFAULT '',
  amount_cents INTEGER NOT NULL DEFAULT 0,
  billing_status TEXT NOT NULL DEFAULT 'not_configured',
  stripe_customer_id TEXT,
  source TEXT NOT NULL DEFAULT 'manual',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_customers_name ON customers(name);
CREATE UNIQUE INDEX IF NOT EXISTS idx_customers_email ON customers(email) WHERE email IS NOT NULL AND email <> '';

CREATE TABLE IF NOT EXISTS estimates (
  id TEXT PRIMARY KEY,
  customer_id TEXT REFERENCES customers(id),
  transcript TEXT NOT NULL,
  summary TEXT NOT NULL,
  total_cents INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'draft',
  approved_at TEXT,
  emailed_at TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_estimates_status ON estimates(status, created_at);

CREATE TABLE IF NOT EXISTS recurring_billing (
  id TEXT PRIMARY KEY,
  customer_id TEXT NOT NULL REFERENCES customers(id),
  amount_cents INTEGER NOT NULL,
  interval TEXT NOT NULL DEFAULT 'monthly',
  next_bill_at TEXT,
  stripe_subscription_id TEXT,
  status TEXT NOT NULL DEFAULT 'pending',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS call_records (
  id TEXT PRIMARY KEY,
  customer_id TEXT REFERENCES customers(id),
  provider_call_id TEXT,
  direction TEXT NOT NULL DEFAULT 'inbound',
  purpose TEXT,
  summary TEXT,
  status TEXT NOT NULL DEFAULT 'answered',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS settings (
  key TEXT PRIMARY KEY,
  value_json TEXT NOT NULL,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS imports (
  id TEXT PRIMARY KEY,
  file_name TEXT,
  imported_count INTEGER NOT NULL DEFAULT 0,
  rejected_count INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS audit_events (
  id TEXT PRIMARY KEY,
  actor TEXT NOT NULL,
  action TEXT NOT NULL,
  entity_type TEXT NOT NULL,
  entity_id TEXT,
  details_json TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

