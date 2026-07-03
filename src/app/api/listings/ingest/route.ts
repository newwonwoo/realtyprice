import { NextRequest, NextResponse } from "next/server";
import { sql, initDb } from "@/lib/db";
import { naverArticlesToListings, type NaverArticle } from "@/lib/naverListings";
import type { Listing } from "@/types/listing";

// 사용자 브라우저(북마클릿/크롬확장)가 네이버 /api/articles 결과를 보내면
// 여기서 Listing[]으로 정규화해 저장한다. 수집은 전적으로 사용자 디바이스에서 일어나고
// 서버는 저장만 한다(운영사가 능동 수집주체가 되지 않도록 — 사용자 트리거 원칙).
//
// 인증(선택): env INGEST_SECRET 설정 시 Authorization: Bearer <secret> 필요.
//   미설정이면 기존 /api/db 처럼 오픈(개인용 도구 가정, 하위호환).
// CORS: 확장/북마클릿이 다른 오리진(new.land.naver.com 등)에서 호출할 수 있어 허용.

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
};

export function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: CORS });
}

let dbReady = false;
async function ensureDb() {
  if (!dbReady) { await initDb(); dbReady = true; }
}

type Body = {
  apartmentId?: string;
  complexNo?: string;
  articles?: NaverArticle[];
  targetArea?: number;
  areaTol?: number;
  capturedAt?: string;
};

export async function POST(req: NextRequest) {
  const secret = process.env.INGEST_SECRET;
  if (secret) {
    const auth = req.headers.get("authorization") ?? "";
    if (auth !== `Bearer ${secret}`) {
      return NextResponse.json({ error: "unauthorized" }, { status: 401, headers: CORS });
    }
  }

  let body: Body;
  try { body = (await req.json()) as Body; }
  catch { return NextResponse.json({ error: "invalid json" }, { status: 400, headers: CORS }); }

  const { apartmentId, complexNo, articles } = body;
  if (!apartmentId || !complexNo || !Array.isArray(articles)) {
    return NextResponse.json({ error: "apartmentId, complexNo, articles[] 필요" }, { status: 400, headers: CORS });
  }

  const capturedAt = body.capturedAt || new Date().toISOString().slice(0, 10);
  const listings: Listing[] = naverArticlesToListings({
    apartmentId, complexNo, articles, targetArea: body.targetArea, areaTol: body.areaTol, capturedAt,
  });

  try {
    await ensureDb();
    // 현재 호가 스냅샷: 이 단지의 기존 네이버 매물을 교체(삭제 후 삽입)해 stale 누적 방지.
    await sql.query(
      `DELETE FROM listings WHERE apartment_id = $1 AND data->>'source' = 'naver'`,
      [apartmentId],
    );
    for (const l of listings) {
      await sql.query(
        `INSERT INTO listings (id, apartment_id, data) VALUES ($1, $2, $3)
         ON CONFLICT (id) DO UPDATE SET apartment_id = $2, data = $3`,
        [l.id, apartmentId, l],
      );
    }
    const sale = listings.filter((l) => l.listingType === "sale").length;
    const jeonse = listings.filter((l) => l.listingType === "jeonse").length;
    return NextResponse.json(
      { ok: true, saved: listings.length, sale, jeonse, capturedAt },
      { headers: CORS },
    );
  } catch (err) {
    console.error("[listings/ingest]", err);
    return NextResponse.json({ error: "서버 오류" }, { status: 500, headers: CORS });
  }
}
