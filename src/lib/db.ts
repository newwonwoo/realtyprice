import { Pool } from "pg";

const pool = new Pool({
  connectionString: process.env.POSTGRES_DATABASE_URL ?? process.env.POSTGRES_URL,
  ssl: { rejectUnauthorized: false },
});

export const sql = {
  query: (text: string, values?: unknown[]) => pool.query(text, values),
};

export async function initDb() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS apartments (
      id TEXT PRIMARY KEY,
      role TEXT NOT NULL,
      data JSONB NOT NULL,
      updated_at TIMESTAMPTZ DEFAULT NOW()
    )
  `);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS comparable_rules (
      id TEXT PRIMARY KEY,
      target_apartment_id TEXT NOT NULL,
      data JSONB NOT NULL,
      updated_at TIMESTAMPTZ DEFAULT NOW()
    )
  `);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS comparable_apartments (
      id TEXT PRIMARY KEY,
      target_apartment_id TEXT NOT NULL,
      apartment_id TEXT NOT NULL,
      data JSONB NOT NULL,
      updated_at TIMESTAMPTZ DEFAULT NOW()
    )
  `);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS transactions (
      id TEXT PRIMARY KEY,
      apartment_id TEXT NOT NULL,
      contract_date TEXT NOT NULL,
      data JSONB NOT NULL
    )
  `);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS listings (
      id TEXT PRIMARY KEY,
      apartment_id TEXT NOT NULL,
      data JSONB NOT NULL,
      updated_at TIMESTAMPTZ DEFAULT NOW()
    )
  `);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS inventory_signals (
      id TEXT PRIMARY KEY,
      apartment_id TEXT NOT NULL,
      data JSONB NOT NULL,
      updated_at TIMESTAMPTZ DEFAULT NOW()
    )
  `);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS price_estimates (
      id TEXT PRIMARY KEY,
      apartment_id TEXT NOT NULL,
      data JSONB NOT NULL,
      created_at TIMESTAMPTZ DEFAULT NOW()
    )
  `);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS settings (
      key TEXT PRIMARY KEY,
      value JSONB NOT NULL
    )
  `);
}
