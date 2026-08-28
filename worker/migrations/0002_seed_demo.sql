INSERT OR IGNORE INTO customers (id, name, email, address, amount_cents, billing_status, source)
VALUES
  ('cust_marlborough_dental', 'Marlborough Dental', 'office@example.com', '14 Main St, Marlborough', 18500, 'auto_pay', 'demo'),
  ('cust_hearthstone', 'Hearthstone Apartments', 'manager@example.com', '88 Lincoln Rd, Hudson', 42000, 'due_sep_1', 'demo'),
  ('cust_corner_market', 'The Corner Market', 'owner@example.com', '3 Broad St, Maynard', 9500, 'paid', 'demo');
