-- Demo schema for a fictional fintech customer, used for local dev/tests.

CREATE TABLE IF NOT EXISTS customers (
    id SERIAL PRIMARY KEY,
    full_name TEXT NOT NULL,
    email TEXT NOT NULL,
    national_id TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS transactions (
    id SERIAL PRIMARY KEY,
    customer_id INTEGER REFERENCES customers(id),
    amount_aed NUMERIC(12, 2) NOT NULL,
    occurred_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS products (
    id SERIAL PRIMARY KEY,
    name TEXT NOT NULL,
    category TEXT NOT NULL
);

INSERT INTO customers (full_name, email, national_id) VALUES
    ('Amina Al Farsi', 'amina@example.com', '784-1234-5678901-1'),
    ('Yusuf Khan', 'yusuf@example.com', '784-1234-5678901-2');

INSERT INTO transactions (customer_id, amount_aed) VALUES
    (1, 1500.00),
    (2, 320.50);

INSERT INTO products (name, category) VALUES
    ('Savings Account', 'banking'),
    ('FX Wallet', 'payments');

-- Scoped read-only role: what a customer *should* hand Traceline. The
-- backend's read-only validation check flags data sources whose credentials
-- carry write privileges instead of this.
CREATE ROLE traceline_readonly WITH LOGIN PASSWORD 'traceline_readonly_password';
GRANT CONNECT ON DATABASE demo_customer TO traceline_readonly;
GRANT USAGE ON SCHEMA public TO traceline_readonly;
GRANT SELECT ON ALL TABLES IN SCHEMA public TO traceline_readonly;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT ON TABLES TO traceline_readonly;
