import { NextRequest, NextResponse } from "next/server";

// KB부동산 비공식 내부 API (역공학 기반)
const KB_BASE = "https://api.kbland.kr";

const HEADERS: Record<string, string> = {
  "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36",
  "Referer": "https://kbland.kr/",
  "Origin": "https://kbland.kr",
  "Accept": "application/json, text/plain, */*",
  "webService": "1",
};

export type KbComplex = {
  complexNo: string;   // 단지기본일련번호
  name: string;
  address: string;
};

export type KbAreaType = {
  areaNo: string;        // 면적일련번호
  exclusiveArea: number; // 전용면적
  supplyArea: number;    // 공급면적
  typeName: string;      // 주택형타입내용
  hasPrice: boolean;     // 시세제공여부
};

export type KbPrice = {
  baseDate: string;          // 시세기준년월일
  saleGeneral: number;       // 매매일반거래가 (만원)
  saleUpper: number;         // 매매상한가
  saleLower: number;         // 매매하한가
  jeonseGeneral: number;     // 전세일반거래가
  jeonseUpper: number;       // 전세상한가
  jeonseLower: number;       // 전세하한가
};

function num(v: unknown): number {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

// 1. 단지명 검색 → 단지기본일련번호
async function searchComplex(query: string): Promise<KbComplex[]> {
  const url = `${KB_BASE}/land-complex/serch/intgraSerch?검색설정명=SRC_NTOTAL&검색키워드=${encodeURIComponent(query)}&출력갯수=50&페이지설정값=1`;
  const res = await fetch(url, { headers: HEADERS, next: { revalidate: 0 } });
  if (!res.ok) return [];
  const data = await res.json();
  const items = data?.dataBody?.data?.data?.HSCM?.data ?? [];
  return items
    .map((x: Record<string, unknown>) => ({
      complexNo: String(x.COMPLEX_NO ?? ""),
      name: String(x.HSCM_NM ?? ""),
      address: String(x.BUBADDR ?? ""),
    }))
    .filter((c: KbComplex) => c.complexNo);
}

// 2. 면적 목록 (평형별 면적일련번호)
async function fetchAreaTypes(complexNo: string): Promise<KbAreaType[]> {
  const url = `${KB_BASE}/land-complex/complex/mpriByType?단지기본일련번호=${complexNo}`;
  const res = await fetch(url, { headers: HEADERS, next: { revalidate: 0 } });
  if (!res.ok) return [];
  const data = await res.json();
  const items = data?.dataBody?.data ?? [];
  return items.map((x: Record<string, unknown>) => ({
    areaNo: String(x.면적일련번호 ?? ""),
    exclusiveArea: num(x.전용면적),
    supplyArea: num(x.공급면적),
    typeName: String(x.주택형타입내용 ?? ""),
    hasPrice: String(x.시세제공여부 ?? "") === "1",
  })).filter((a: KbAreaType) => a.areaNo);
}

// 3. KB시세 조회 (매매/전세 일반·상한·하한)
async function fetchPrice(complexNo: string, areaNo: string): Promise<KbPrice | null> {
  const url = `${KB_BASE}/land-price/price/BasePrcInfoNew?단지기본일련번호=${complexNo}&면적일련번호=${areaNo}`;
  const res = await fetch(url, { headers: HEADERS, next: { revalidate: 0 } });
  if (!res.ok) return null;
  const data = await res.json();
  const series = data?.dataBody?.data?.시세 ?? [];
  if (!series.length) return null;
  const latest = series[0];
  return {
    baseDate: String(latest.시세기준년월일 ?? latest.기준년월일 ?? ""),
    saleGeneral: num(latest.매매일반거래가),
    saleUpper: num(latest.매매상한가),
    saleLower: num(latest.매매하한가),
    jeonseGeneral: num(latest.전세일반거래가),
    jeonseUpper: num(latest.전세상한가),
    jeonseLower: num(latest.전세하한가),
  };
}

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const aptName = searchParams.get("aptName");
  const complexNo = searchParams.get("complexNo");
  const targetArea = searchParams.get("area"); // 전용면적(㎡) — 가장 가까운 평형 선택

  if (!aptName && !complexNo) {
    return NextResponse.json({ error: "aptName 또는 complexNo가 필요합니다." }, { status: 400 });
  }

  try {
    let resolvedNo = complexNo ?? "";
    let complexList: KbComplex[] = [];

    if (!resolvedNo && aptName) {
      complexList = await searchComplex(aptName);
      if (!complexList.length) {
        return NextResponse.json({ error: `"${aptName}" 단지를 KB부동산에서 찾을 수 없습니다.` }, { status: 404 });
      }
      resolvedNo = complexList[0].complexNo;
    }

    const areaTypes = (await fetchAreaTypes(resolvedNo)).filter((a) => a.hasPrice);
    if (!areaTypes.length) {
      return NextResponse.json({ complexNo: resolvedNo, complexList, areaTypes: [], prices: [] });
    }

    // 면적 지정 시 가장 가까운 평형, 아니면 전체
    let selected = areaTypes;
    if (targetArea) {
      const t = Number(targetArea);
      const nearest = areaTypes.reduce((best, a) =>
        Math.abs(a.exclusiveArea - t) < Math.abs(best.exclusiveArea - t) ? a : best
      );
      selected = [nearest];
    }

    const prices = await Promise.all(
      selected.map(async (a) => ({ area: a, price: await fetchPrice(resolvedNo, a.areaNo) }))
    );

    return NextResponse.json({
      complexNo: resolvedNo,
      complexList,
      areaTypes,
      prices: prices.filter((p) => p.price),
    });
  } catch (err) {
    return NextResponse.json({ error: `요청 실패: ${String(err)}` }, { status: 500 });
  }
}
