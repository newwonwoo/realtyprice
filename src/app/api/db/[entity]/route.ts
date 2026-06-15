import { NextRequest, NextResponse } from "next/server";
import db from "@/lib/db";

const TABLES = [
  "apartments",
  "comparable_rules",
  "comparable_apartments",
  "transactions",
  "listings",
  "inventory_signals",
  "price_estimates",
  "settings",
] as const;
type Entity = (typeof TABLES)[number];

function isEntity(s: string): s is Entity {
  return (TABLES as readonly string[]).includes(s);
}

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ entity: string }> },
) {
  const { entity } = await params;
  if (!isEntity(entity))
    return NextResponse.json({ error: "unknown entity" }, { status: 400 });

  if (entity === "settings") {
    const rows = db
      .prepare(`SELECT key, value FROM settings`)
      .all() as { key: string; value: string }[];
    const obj: Record<string, unknown> = {};
    for (const r of rows) obj[r.key] = JSON.parse(r.value);
    return NextResponse.json({ items: [obj] });
  }

  const rows = db
    .prepare(`SELECT data FROM ${entity}`)
    .all() as { data: string }[];
  return NextResponse.json({ items: rows.map((r) => JSON.parse(r.data)) });
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ entity: string }> },
) {
  const { entity } = await params;
  if (!isEntity(entity))
    return NextResponse.json({ error: "unknown entity" }, { status: 400 });
  const { items } = (await req.json()) as { items: Record<string, unknown>[] };
  const now = new Date().toISOString();

  const tx = db.transaction(() => {
    for (const item of items) {
      const data = JSON.stringify(item);
      if (entity === "apartments") {
        db.prepare(
          `INSERT OR REPLACE INTO apartments (id, data, role, updated_at) VALUES (?, ?, ?, ?)`,
        ).run(item.id, data, item.role, now);
      } else if (entity === "comparable_rules") {
        db.prepare(
          `INSERT OR REPLACE INTO comparable_rules (id, target_apartment_id, data, updated_at) VALUES (?, ?, ?, ?)`,
        ).run(item.id, item.targetApartmentId, data, now);
      } else if (entity === "comparable_apartments") {
        db.prepare(
          `INSERT OR REPLACE INTO comparable_apartments (id, target_apartment_id, apartment_id, data, updated_at) VALUES (?, ?, ?, ?, ?)`,
        ).run(item.id, item.targetApartmentId, item.apartmentId, data, now);
      } else if (entity === "transactions") {
        db.prepare(
          `INSERT OR REPLACE INTO transactions (id, apartment_id, data, contract_date) VALUES (?, ?, ?, ?)`,
        ).run(item.id, item.apartmentId, data, (item.contractDate as string) ?? now);
      } else if (entity === "listings") {
        db.prepare(
          `INSERT OR REPLACE INTO listings (id, apartment_id, data, updated_at) VALUES (?, ?, ?, ?)`,
        ).run(item.id, item.apartmentId, data, now);
      } else if (entity === "inventory_signals") {
        db.prepare(
          `INSERT OR REPLACE INTO inventory_signals (id, apartment_id, data, updated_at) VALUES (?, ?, ?, ?)`,
        ).run(item.id, item.apartmentId, data, now);
      } else if (entity === "price_estimates") {
        db.prepare(
          `INSERT OR REPLACE INTO price_estimates (id, apartment_id, data, created_at) VALUES (?, ?, ?, ?)`,
        ).run(item.id, item.apartmentId, data, (item.createdAt as string) ?? now);
      } else if (entity === "settings") {
        db.prepare(
          `INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)`,
        ).run(item.key, JSON.stringify(item.value));
      }
    }
  });
  tx();
  return NextResponse.json({ ok: true });
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ entity: string }> },
) {
  const { entity } = await params;
  if (!isEntity(entity))
    return NextResponse.json({ error: "unknown entity" }, { status: 400 });
  const id = new URL(req.url).searchParams.get("id");
  if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });

  if (entity === "settings") {
    db.prepare(`DELETE FROM settings WHERE key = ?`).run(id);
  } else {
    db.prepare(`DELETE FROM ${entity} WHERE id = ?`).run(id);
  }
  return NextResponse.json({ ok: true });
}
