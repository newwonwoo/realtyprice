import { sql } from "@vercel/postgres";

// 테이블 초기화 (idempotent) — 앱 시작 시 한 번 호출
export async function initDb() {
  await sql`
    CREATE TABLE IF NOT EXISTS apartments (
      id TEXT PRIMARY KEY,
      role TEXT NOT NULL,
      data JSONB NOT NULL,
      updated_at TIMESTAMPTZ DEFAULT NOW()
    )
  `;
  await sql`
    CREATE TABLE IF NOT EXISTS comparable_rules (
      id TEXT PRIMARY KEY,
      target_apartment_id TEXT NOT NULL,
      data JSONB NOT NULL,
      updated_at TIMESTAMPTZ DEFAULT NOW()
    )
  `;
  await sql`
    CREATE TABLE IF NOT EXISTS comparable_apartments (
      id TEXT PRIMARY KEY,
      target_apartment_id TEXT NOT NULL,
      apartment_id TEXT NOT NULL,
      data JSONB NOT NULL,
      updated_at TIMESTAMPTZ DEFAULT NOW()
    )
  `;
  await sql`
    CREATE TABLE IF NOT EXISTS transactions (
      id TEXT PRIMARY KEY,
      apartment_id TEXT NOT NULL,
      contract_date TEXT NOT NULL,
      data JSONB NOT NULL
    )
  `;
  await sql`
    CREATE TABLE IF NOT EXISTS listings (
      id TEXT PRIMARY KEY,
      apartment_id TEXT NOT NULL,
      data JSONB NOT NULL,
      updated_at TIMESTAMPTZ DEFAULT NOW()
    )
  `;
  await sql`
    CREATE TABLE IF NOT EXISTS inventory_signals (
      id TEXT PRIMARY KEY,
      apartment_id TEXT NOT NULL,
      data JSONB NOT NULL,
      updated_at TIMESTAMPTZ DEFAULT NOW()
    )
  `;
  await sql`
    CREATE TABLE IF NOT EXISTS price_estimates (
      id TEXT PRIMARY KEY,
      apartment_id TEXT NOT NULL,
      data JSONB NOT NULL,
      created_at TIMESTAMPTZ DEFAULT NOW()
    )
  `;
  await sql`
    CREATE TABLE IF NOT EXISTS settings (
      key TEXT PRIMARY KEY,
      value JSONB NOT NULL
    )
  `;
}

export { sql };
