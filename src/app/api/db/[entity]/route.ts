import { NextRequest, NextResponse } from "next/server";
import { sql, initDb } from "@/lib/db";

const VALID_ENTITIES = new Set([
  "apartments",
  "comparable_rules",
  "comparable_apartments",
  "transactions",
  "listings",
  "inventory_signals",
  "price_estimates",
  "settings",
]);

// 엔티티별 추가 컬럼 추출
function extraCols(entity: string, data: Record<string, unknown>) {
  switch (entity) {
    case "apartments":
      return { role: String(data.role ?? "comparable") };
    case "comparable_rules":
    case "comparable_apartments":
      return { target_apartment_id: String(data.targetApartmentId ?? "") };
    case "transactions":
      return {
        apartment_id: String(data.apartmentId ?? ""),
        contract_date: String(data.contractDate ?? ""),
      };
    case "listings":
    case "inventory_signals":
      return { apartment_id: String(data.apartmentId ?? "") };
    case "price_estimates":
      return { apartment_id: String(data.apartmentId ?? "") };
    default:
      return {};
  }
}

// 엔티티별 정렬 컬럼 — 테이블마다 시간 컬럼이 달라서 고정 ORDER BY는 42703 유발
// (transactions: 시간컬럼 없음 → contract_date, price_estimates: created_at, settings: key)
const ORDER_COL: Record<string, string> = {
  apartments: "updated_at",
  comparable_rules: "updated_at",
  comparable_apartments: "updated_at",
  transactions: "contract_date",
  listings: "updated_at",
  inventory_signals: "updated_at",
  price_estimates: "created_at",
  settings: "key",
};

let dbInitialized = false;
async function ensureDb() {
  if (!dbInitialized) {
    await initDb();
    dbInitialized = true;
  }
}

export async function GET(
  _req: NextRequest,
  { params }: { params: { entity: string } },
) {
  const { entity } = params;
  if (!VALID_ENTITIES.has(entity)) {
    return NextResponse.json({ error: "unknown entity" }, { status: 400 });
  }
  try {
    await ensureDb();
    // settings 테이블만 컬럼명이 다름(key/value) — 그 외는 모두 id/data
    const selectExpr = entity === "settings" ? "value AS data" : "data";
    const orderCol = ORDER_COL[entity] ?? "id";
    const result = await sql.query(`SELECT ${selectExpr} FROM ${entity} ORDER BY ${orderCol} DESC`);
    const items = result.rows.map((r) => r.data as Record<string, unknown>);
    return NextResponse.json({ items });
  } catch (err) {
    console.error(`[db/${entity}]`, err);
    return NextResponse.json({ error: "서버 오류" }, { status: 500 });
  }
}

export async function POST(
  req: NextRequest,
  { params }: { params: { entity: string } },
) {
  const { entity } = params;
  if (!VALID_ENTITIES.has(entity)) {
    return NextResponse.json({ error: "unknown entity" }, { status: 400 });
  }
  try {
    await ensureDb();
    const { items } = (await req.json()) as { items: Record<string, unknown>[] };

    for (const item of items) {
      const id = String(item.id ?? item.key ?? "");
      if (!id) continue;
      const extra = extraCols(entity, item);
      const extraKeys = Object.keys(extra);

      if (extraKeys.length > 0) {
        const cols = ["id", ...extraKeys, "data"].join(", ");
        const placeholders = ["$1", ...extraKeys.map((_, i) => `$${i + 2}`), `$${extraKeys.length + 2}`].join(", ");
        const updateSet = [...extraKeys.map((k, i) => `${k} = $${i + 2}`), `data = $${extraKeys.length + 2}`].join(", ");
        const values = [id, ...Object.values(extra), item];
        await sql.query(
          `INSERT INTO ${entity} (${cols}) VALUES (${placeholders}) ON CONFLICT (id) DO UPDATE SET ${updateSet}`,
          values,
        );
      } else {
        await sql.query(
          `INSERT INTO ${entity} (id, data) VALUES ($1, $2) ON CONFLICT (id) DO UPDATE SET data = $2`,
          [id, item],
        );
      }
    }
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error(`[db/${entity}]`, err);
    return NextResponse.json({ error: "서버 오류" }, { status: 500 });
  }
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: { entity: string } },
) {
  const { entity } = params;
  if (!VALID_ENTITIES.has(entity)) {
    return NextResponse.json({ error: "unknown entity" }, { status: 400 });
  }
  try {
    const id = new URL(req.url).searchParams.get("id");
    if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });
    await sql.query(`DELETE FROM ${entity} WHERE id = $1`, [id]);
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error(`[db/${entity}]`, err);
    return NextResponse.json({ error: "서버 오류" }, { status: 500 });
  }
}
