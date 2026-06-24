import { NextRequest, NextResponse } from "next/server";

const ZIGBANG_BASE = "https://apis.zigbang.com";

const HEADERS = {
  "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
  "Accept": "application/json, text/plain, */*",
  "Accept-Language": "ko-KR,ko;q=0.9",
  "Origin": "https://www.zigbang.com",
  "Referer": "https://www.zigbang.com/",
};

export type ZigbangListing = {
  itemId: string;
  tradeType: string;      // 매매/전세/월세
  price: number;          // 만원
  depositPrice?: number;  // 보증금 (월세)
  area: number;           // 전용면적 m²
  floor: number;
  description: string;
};

export type ZigbangComplex = {
  complexId: string;
  complexName: string;
  address: string;
};

// 수집 결과 사유 코드 — "없음"으로 끝내지 않고 원인을 명시하기 위함
export type ZigbangReasonCode =
  | "ok"               // 매물 수집됨
  | "disambiguation"   // 유사 단지 다수 → 선택 필요
  | "complex_not_found"// 검색 결과 없음 (검색어 불일치/미등록)
  | "no_listings"      // 단지는 찾았으나 등록 매물 0건 (분양권/신축 등)
  | "blocked"          // 직방이 (서버 IP) 차단/요청제한 (403/429)
  | "upstream_error"   // 직방 서버 오류 (5xx)
  | "error";           // 네트워크/타임아웃/예외

type FetchJson = { ok: boolean; status: number; json: unknown };

async function fetchJson(url: string): Promise<FetchJson> {
  const res = await fetch(url, { headers: HEADERS, next: { revalidate: 0 }, signal: AbortSignal.timeout(8000) });
  let json: unknown = null;
  try { json = await res.json(); } catch { json = null; }
  return { ok: res.ok, status: res.status, json };
}

function classifyHttp(status: number): "blocked" | "upstream_error" | "error" {
  if (status === 401 || status === 403 || status === 429) return "blocked";
  if (status >= 500) return "upstream_error";
  return "error";
}

function httpReason(code: "blocked" | "upstream_error" | "error", status: number, stage: string): string {
  if (code === "blocked")
    return `직방이 서버 IP의 ${stage} 요청을 차단했습니다 (HTTP ${status}). Vercel 서버에서 직방 접근이 제한된 상태입니다. 브라우저에서 직접 수집해야 합니다.`;
  if (code === "upstream_error")
    return `직방 ${stage} 서버 오류 (HTTP ${status}). 잠시 후 다시 시도하세요.`;
  return `직방 ${stage} 요청 실패 (HTTP ${status}).`;
}

function parseComplexes(json: unknown): ZigbangComplex[] {
  const root = (json ?? {}) as Record<string, unknown>;
  const items = (root.items ?? root.data ?? []) as Record<string, unknown>[];
  return items
    .filter((x) => x.itemType === "complex" || x.type === "complex" || x.complex_id || x.complexId)
    .map((x) => ({
      complexId: String(x.complex_id ?? x.complexId ?? x.id ?? ""),
      complexName: String(x.name ?? x.complexName ?? x.complex_name ?? ""),
      address: String(x.address ?? x.roadAddress ?? ""),
    }))
    .filter((c) => c.complexId);
}

function parseListings(json: unknown, tradeType: string): ZigbangListing[] {
  const root = (json ?? {}) as Record<string, unknown>;
  const items = (root.items ?? root.data ?? []) as Record<string, unknown>[];
  return items.map((a) => ({
    itemId: String(a.itemId ?? a.id ?? ""),
    tradeType: String(a.tradeType ?? tradeType),
    price: Number(a.price ?? 0),
    depositPrice: a.deposit ? Number(a.deposit) : undefined,
    area: Number(a.area ?? a.supplyArea ?? 0),
    floor: Number(a.floor ?? 0),
    description: String(a.description ?? a.memo ?? ""),
  }));
}

function empty(reasonCode: ZigbangReasonCode, reason: string, extra: Record<string, unknown> = {}) {
  return NextResponse.json({
    complexList: [],
    saleListings: [],
    jeonseListings: [],
    total: 0,
    reasonCode,
    reason,
    ...extra,
  });
}

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const aptName = searchParams.get("aptName");
  const complexId = searchParams.get("complexId");
  const type = searchParams.get("type") ?? "all"; // sale | jeonse | all

  if (!aptName && !complexId) {
    return NextResponse.json({ error: "aptName 또는 complexId가 필요합니다.", reasonCode: "error", reason: "검색어가 없습니다." }, { status: 400 });
  }

  try {
    let resolvedId = complexId ?? "";
    let complexList: ZigbangComplex[] = [];

    if (!resolvedId && aptName) {
      const s = await fetchJson(`${ZIGBANG_BASE}/v2/search?serviceType=아파트&q=${encodeURIComponent(aptName)}`);
      if (!s.ok) {
        const code = classifyHttp(s.status);
        return empty(code, httpReason(code, s.status, "단지검색"), { httpStatus: s.status });
      }
      complexList = parseComplexes(s.json);
      if (!complexList.length) {
        return empty(
          "complex_not_found",
          `직방 검색에서 "${aptName}" 단지를 찾지 못했습니다. 검색어가 직방 등록명과 다르거나(긴 이름·특수문자·동/지번 포함) 미등록일 수 있습니다. 검색어를 짧게 줄여 다시 시도하세요.`,
        );
      }
      if (complexList.length > 1 && !complexId) {
        return NextResponse.json({
          complexList,
          saleListings: [],
          jeonseListings: [],
          total: 0,
          reasonCode: "disambiguation",
          reason: `유사 단지 ${complexList.length}곳이 검색됐습니다. 단지를 선택하세요.`,
        });
      }
      resolvedId = complexList[0].complexId;
    }

    const wantSale = type === "sale" || type === "all";
    const wantJeonse = type === "jeonse" || type === "all";
    const [saleRes, jeonseRes] = await Promise.all([
      wantSale ? fetchJson(`${ZIGBANG_BASE}/v2/complex/${resolvedId}/items?tradeType=${encodeURIComponent("매매")}&serviceType=아파트`) : Promise.resolve(null),
      wantJeonse ? fetchJson(`${ZIGBANG_BASE}/v2/complex/${resolvedId}/items?tradeType=${encodeURIComponent("전세")}&serviceType=아파트`) : Promise.resolve(null),
    ]);

    // 매물조회 단계 차단/오류 감지 — 빈 배열로 삼키지 않고 사유 반환
    const bad = [saleRes, jeonseRes].find((r): r is FetchJson => r != null && !r.ok);
    if (bad) {
      const code = classifyHttp(bad.status);
      return NextResponse.json({
        complexId: resolvedId,
        complexList,
        saleListings: [],
        jeonseListings: [],
        total: 0,
        reasonCode: code,
        reason: httpReason(code, bad.status, "매물조회"),
        httpStatus: bad.status,
      });
    }

    const saleListings = saleRes ? parseListings(saleRes.json, "매매") : [];
    const jeonseListings = jeonseRes ? parseListings(jeonseRes.json, "전세") : [];
    const total = saleListings.length + jeonseListings.length;

    return NextResponse.json({
      complexId: resolvedId,
      complexList,
      saleListings,
      jeonseListings,
      total,
      reasonCode: total > 0 ? "ok" : "no_listings",
      reason: total > 0
        ? undefined
        : "단지는 찾았으나 직방에 현재 등록된 매물이 0건입니다. 분양권/신축 입주 전이거나 실제 매물이 없는 상태일 수 있습니다.",
    });
  } catch (err) {
    const msg = String(err);
    const isTimeout = /timeout|aborted|abort/i.test(msg);
    return NextResponse.json({
      complexList: [],
      saleListings: [],
      jeonseListings: [],
      total: 0,
      reasonCode: "error",
      reason: isTimeout
        ? "직방 응답 시간 초과 — 서버에서 직방 접근이 지연·차단되는 상태일 수 있습니다."
        : `직방 요청 실패: ${msg}`,
    });
  }
}
