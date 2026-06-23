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

async function searchComplex(query: string): Promise<ZigbangComplex[]> {
  const res = await fetch(
    `${ZIGBANG_BASE}/v2/search?serviceType=아파트&q=${encodeURIComponent(query)}`,
    { headers: HEADERS, next: { revalidate: 0 } }
  );
  if (!res.ok) return [];
  const data = await res.json();
  const items = data?.items ?? data?.data ?? [];
  return items
    .filter((x: Record<string, unknown>) => x.itemType === "complex" || x.type === "complex" || x.complex_id || x.complexId)
    .map((x: Record<string, unknown>) => ({
      complexId: String(x.complex_id ?? x.complexId ?? x.id ?? ""),
      complexName: String(x.name ?? x.complexName ?? x.complex_name ?? ""),
      address: String(x.address ?? x.roadAddress ?? ""),
    }))
    .filter((c: ZigbangComplex) => c.complexId);
}

async function fetchListings(complexId: string, tradeType: "매매" | "전세"): Promise<ZigbangListing[]> {
  const res = await fetch(
    `${ZIGBANG_BASE}/v2/complex/${complexId}/items?tradeType=${encodeURIComponent(tradeType)}&serviceType=아파트`,
    { headers: HEADERS, next: { revalidate: 0 } }
  );
  if (!res.ok) return [];
  const data = await res.json();
  const items = data?.items ?? data?.data ?? [];
  return items.map((a: Record<string, unknown>) => ({
    itemId: String(a.itemId ?? a.id ?? ""),
    tradeType: String(a.tradeType ?? tradeType),
    price: Number(a.price ?? 0),
    depositPrice: a.deposit ? Number(a.deposit) : undefined,
    area: Number(a.area ?? a.supplyArea ?? 0),
    floor: Number(a.floor ?? 0),
    description: String(a.description ?? a.memo ?? ""),
  }));
}

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const aptName = searchParams.get("aptName");
  const complexId = searchParams.get("complexId");
  const type = searchParams.get("type") ?? "all"; // sale | jeonse | all

  if (!aptName && !complexId) {
    return NextResponse.json({ error: "aptName 또는 complexId가 필요합니다." }, { status: 400 });
  }

  try {
    let resolvedId = complexId ?? "";
    let complexList: ZigbangComplex[] = [];

    if (!resolvedId && aptName) {
      complexList = await searchComplex(aptName);
      if (!complexList.length) {
        return NextResponse.json({ error: `"${aptName}" 단지를 직방에서 찾을 수 없습니다.` }, { status: 404 });
      }
      resolvedId = complexList[0].complexId;
    }

    const [saleListings, jeonseListings] = await Promise.all([
      (type === "sale" || type === "all") ? fetchListings(resolvedId, "매매") : Promise.resolve([]),
      (type === "jeonse" || type === "all") ? fetchListings(resolvedId, "전세") : Promise.resolve([]),
    ]);

    return NextResponse.json({
      complexId: resolvedId,
      complexList,
      saleListings,
      jeonseListings,
      total: saleListings.length + jeonseListings.length,
    });
  } catch (err) {
    return NextResponse.json({ error: `요청 실패: ${String(err)}` }, { status: 500 });
  }
}
