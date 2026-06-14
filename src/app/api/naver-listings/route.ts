import { NextRequest, NextResponse } from "next/server";

// 네이버 부동산 비공식 내부 API (역공학 기반)
const NAVER_BASE = "https://new.land.naver.com/api";

const HEADERS = {
  "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
  "Referer": "https://new.land.naver.com/",
  "Accept": "application/json, text/plain, */*",
  "Accept-Language": "ko-KR,ko;q=0.9",
};

export type NaverListing = {
  articleNo: string;     // 매물번호
  tradeTypeName: string; // 매매/전세
  dealOrWarrantPrc: string; // 호가 (만원)
  floorInfo: string;     // 층수 "3/15"
  area1: number;         // 공급면적
  area2: number;         // 전용면적
  direction: string;     // 방향
  articleFeatureDesc: string; // 매물 특징
};

export type NaverComplex = {
  complexNo: string;
  complexName: string;
  cortarAddress: string;
};

// 1. 단지명으로 complexNo 검색
async function searchComplex(query: string): Promise<NaverComplex[]> {
  const res = await fetch(
    `${NAVER_BASE}/search?query=${encodeURIComponent(query)}&pg=1&rs=1&re=5&sm=13&fa=apt`,
    { headers: HEADERS, next: { revalidate: 0 } }
  );
  if (!res.ok) return [];
  const data = await res.json();
  const items = data?.complexes ?? data?.result?.complexes ?? [];
  return items.map((item: Record<string, unknown>) => ({
    complexNo: String(item.complexNo ?? item.hscpNo ?? ""),
    complexName: String(item.complexName ?? item.hscpNm ?? ""),
    cortarAddress: String(item.cortarAddress ?? item.roadAddrPart1 ?? ""),
  })).filter((c: NaverComplex) => c.complexNo);
}

// 2. complexNo로 현재 매물 목록 조회
async function fetchListings(complexNo: string, tradeType: "A1" | "B1" | "B2"): Promise<NaverListing[]> {
  // A1=매매, B1=전세, B2=월세
  const url = `${NAVER_BASE}/articles/complex/${complexNo}?tradeType=${tradeType}&order=prc&middle=false&showArticle=true&sameAddressGroup=false&page=1`;
  const res = await fetch(url, { headers: HEADERS, next: { revalidate: 0 } });
  if (!res.ok) return [];
  const data = await res.json();
  const articles = data?.articleList ?? data?.result?.articleList ?? [];
  return articles.map((a: Record<string, unknown>) => ({
    articleNo: String(a.articleNo ?? ""),
    tradeTypeName: String(a.tradeTypeName ?? ""),
    dealOrWarrantPrc: String(a.dealOrWarrantPrc ?? a.prc ?? ""),
    floorInfo: String(a.floorInfo ?? ""),
    area1: Number(a.area1 ?? 0),
    area2: Number(a.area2 ?? 0),
    direction: String(a.direction ?? ""),
    articleFeatureDesc: String(a.articleFeatureDesc ?? ""),
  }));
}

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const aptName = searchParams.get("aptName");
  const complexNo = searchParams.get("complexNo"); // 이미 알고 있는 경우 직접 지정
  const type = searchParams.get("type") ?? "all"; // sale | jeonse | all

  if (!aptName && !complexNo) {
    return NextResponse.json({ error: "aptName 또는 complexNo가 필요합니다." }, { status: 400 });
  }

  try {
    let resolvedComplexNo = complexNo ?? "";
    let complexList: NaverComplex[] = [];

    // complexNo 모를 때 검색
    if (!resolvedComplexNo && aptName) {
      complexList = await searchComplex(aptName);
      if (!complexList.length) {
        return NextResponse.json({ error: `"${aptName}" 단지를 네이버 부동산에서 찾을 수 없습니다.` }, { status: 404 });
      }
      resolvedComplexNo = complexList[0].complexNo;
    }

    // 매물 조회
    const [saleListings, jeonseListings] = await Promise.all([
      (type === "sale" || type === "all") ? fetchListings(resolvedComplexNo, "A1") : Promise.resolve([]),
      (type === "jeonse" || type === "all") ? fetchListings(resolvedComplexNo, "B1") : Promise.resolve([]),
    ]);

    return NextResponse.json({
      complexNo: resolvedComplexNo,
      complexList,
      saleListings,
      jeonseListings,
      total: saleListings.length + jeonseListings.length,
    });
  } catch (err) {
    return NextResponse.json({ error: `요청 실패: ${String(err)}` }, { status: 500 });
  }
}
