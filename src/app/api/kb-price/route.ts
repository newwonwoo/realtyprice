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

// KB 시세 미제공 원인 코드
export type KbReasonCode =
  | "ok"               // 시세 정상 조회
  | "complex_not_found"// 단지 검색 결과 없음
  | "no_area_types"    // 단지는 찾았으나 면적 정보 없음 (신규 등록 전)
  | "no_priced_area"   // 면적 정보는 있으나 시세제공=N (시세 미산정)
  | "no_price_data"    // 면적·시세제공=Y 이나 실제 데이터 없음 (신축 입주 전 등)
  | "blocked"          // KB 서버 IP 차단 (403/429)
  | "upstream_error"   // KB 서버 오류 (5xx)
  | "error";           // 네트워크/예외

function num(v: unknown): number {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

async function kbFetch(url: string): Promise<{ ok: boolean; status: number; data: unknown }> {
  try {
    const res = await fetch(url, { headers: HEADERS, next: { revalidate: 0 }, signal: AbortSignal.timeout(8000) });
    let data: unknown = null;
    try { data = await res.json(); } catch { data = null; }
    return { ok: res.ok, status: res.status, data };
  } catch (err) {
    return { ok: false, status: 0, data: null };
  }
}

function httpReasonCode(status: number): KbReasonCode {
  if (status === 403 || status === 429) return "blocked";
  if (status >= 500) return "upstream_error";
  return "error";
}

function httpReasonMsg(code: KbReasonCode, status: number, stage: string): string {
  if (code === "blocked")
    return `KB부동산이 서버 IP의 ${stage} 요청을 차단했습니다 (HTTP ${status}). Vercel 서버에서 KB 접근이 제한된 상태일 수 있습니다.`;
  if (code === "upstream_error")
    return `KB부동산 ${stage} 서버 오류 (HTTP ${status}). 잠시 후 다시 시도하세요.`;
  return `KB부동산 ${stage} 요청 실패 (HTTP ${status}).`;
}

// 1. 단지명 검색 → 단지기본일련번호
async function searchComplex(query: string): Promise<{ list: KbComplex[]; reasonCode?: KbReasonCode; reason?: string }> {
  const url = `${KB_BASE}/land-complex/serch/intgraSerch?검색설정명=SRC_NTOTAL&검색키워드=${encodeURIComponent(query)}&출력갯수=50&페이지설정값=1`;
  const r = await kbFetch(url);
  if (!r.ok) {
    const code = httpReasonCode(r.status);
    return { list: [], reasonCode: code, reason: httpReasonMsg(code, r.status, "단지검색") };
  }
  const items = ((r.data as Record<string, unknown>)?.dataBody as Record<string, unknown>)?.data as Record<string, unknown> | undefined;
  const rows = ((items?.data as Record<string, unknown>)?.HSCM as Record<string, unknown>)?.data as Record<string, unknown>[] ?? [];
  const list = rows
    .map((x) => ({
      complexNo: String(x.COMPLEX_NO ?? ""),
      name: String(x.HSCM_NM ?? ""),
      address: String(x.BUBADDR ?? ""),
    }))
    .filter((c) => c.complexNo);
  return { list };
}

// 2. 면적 목록 (평형별 면적일련번호)
async function fetchAreaTypes(complexNo: string): Promise<{ areas: KbAreaType[]; reasonCode?: KbReasonCode; reason?: string }> {
  const url = `${KB_BASE}/land-complex/complex/mpriByType?단지기본일련번호=${complexNo}`;
  const r = await kbFetch(url);
  if (!r.ok) {
    const code = httpReasonCode(r.status);
    return { areas: [], reasonCode: code, reason: httpReasonMsg(code, r.status, "면적정보") };
  }
  const items = ((r.data as Record<string, unknown>)?.dataBody as Record<string, unknown>)?.data as Record<string, unknown>[] ?? [];
  const areas = items.map((x) => ({
    areaNo: String(x.면적일련번호 ?? ""),
    exclusiveArea: num(x.전용면적),
    supplyArea: num(x.공급면적),
    typeName: String(x.주택형타입내용 ?? ""),
    hasPrice: String(x.시세제공여부 ?? "") === "1",
  })).filter((a) => a.areaNo);
  return { areas };
}

// 3. KB시세 조회 (매매/전세 일반·상한·하한)
async function fetchPrice(complexNo: string, areaNo: string): Promise<{ price: KbPrice | null; reasonCode?: KbReasonCode; reason?: string }> {
  const url = `${KB_BASE}/land-price/price/BasePrcInfoNew?단지기본일련번호=${complexNo}&면적일련번호=${areaNo}`;
  const r = await kbFetch(url);
  if (!r.ok) {
    const code = httpReasonCode(r.status);
    return { price: null, reasonCode: code, reason: httpReasonMsg(code, r.status, "시세조회") };
  }
  const series = ((r.data as Record<string, unknown>)?.dataBody as Record<string, unknown>)?.data as Record<string, unknown> | undefined;
  const rows = (series?.시세 as Record<string, unknown>[]) ?? [];
  if (!rows.length) return { price: null, reasonCode: "no_price_data", reason: "KB에 해당 면적 시세 데이터가 없습니다. 신축 입주 전이거나 거래가 희소한 단지일 수 있습니다." };
  const latest = rows[0];
  return {
    price: {
      baseDate: String(latest.시세기준년월일 ?? latest.기준년월일 ?? ""),
      saleGeneral: num(latest.매매일반거래가),
      saleUpper: num(latest.매매상한가),
      saleLower: num(latest.매매하한가),
      jeonseGeneral: num(latest.전세일반거래가),
      jeonseUpper: num(latest.전세상한가),
      jeonseLower: num(latest.전세하한가),
    },
  };
}

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const aptName = searchParams.get("aptName");
  const complexNo = searchParams.get("complexNo");
  const targetArea = searchParams.get("area"); // 전용면적(㎡) — 가장 가까운 평형 선택

  if (!aptName && !complexNo) {
    return NextResponse.json({ error: "aptName 또는 complexNo가 필요합니다.", reasonCode: "error", reason: "검색어가 없습니다." }, { status: 400 });
  }

  try {
    let resolvedNo = complexNo ?? "";
    let complexList: KbComplex[] = [];

    if (!resolvedNo && aptName) {
      const s = await searchComplex(aptName);
      if (s.reasonCode) {
        return NextResponse.json({ complexList: [], areaTypes: [], prices: [], reasonCode: s.reasonCode, reason: s.reason }, { status: s.reasonCode === "blocked" ? 403 : 500 });
      }
      complexList = s.list;
      if (!complexList.length) {
        return NextResponse.json({
          complexList: [],
          areaTypes: [],
          prices: [],
          reasonCode: "complex_not_found",
          reason: `KB부동산에서 "${aptName}" 단지를 찾지 못했습니다. KB에 미등록(신규분양·준공전 단지)이거나 검색어와 등록명이 다를 수 있습니다.`,
        });
      }
      resolvedNo = complexList[0].complexNo;
    }

    const aResult = await fetchAreaTypes(resolvedNo);
    if (aResult.reasonCode) {
      return NextResponse.json({ complexList, areaTypes: [], prices: [], reasonCode: aResult.reasonCode, reason: aResult.reason });
    }

    const allAreas = aResult.areas;
    if (!allAreas.length) {
      return NextResponse.json({
        complexList, areaTypes: [], prices: [],
        reasonCode: "no_area_types",
        reason: "KB에 면적 정보가 아직 등록되지 않았습니다. 신규 단지이거나 데이터 수집 전일 수 있습니다.",
      });
    }

    // 시세제공=Y 면적 우선, 없으면 전체 면적으로 실제 데이터 조회 시도
    // (시세제공=N이어도 신축 등에서 실제 시세 데이터가 있는 경우 있음)
    const pricedAreas = allAreas.filter((a) => a.hasPrice);
    const candidateAreas = pricedAreas.length > 0 ? pricedAreas : allAreas;

    // 면적 지정 시 가장 가까운 평형, 아니면 전체
    let selected = candidateAreas;
    if (targetArea) {
      const t = Number(targetArea);
      const nearest = candidateAreas.reduce((best, a) =>
        Math.abs(a.exclusiveArea - t) < Math.abs(best.exclusiveArea - t) ? a : best
      );
      selected = [nearest];
    }

    let globalReasonCode: KbReasonCode | undefined;
    let globalReason: string | undefined;

    const prices = await Promise.all(
      selected.map(async (a) => {
        const r = await fetchPrice(resolvedNo, a.areaNo);
        if (r.reasonCode && !globalReasonCode) {
          globalReasonCode = r.reasonCode;
          globalReason = r.reason;
        }
        return { area: a, price: r.price, reasonCode: r.reasonCode, reason: r.reason };
      })
    );

    const hasAnyPrice = prices.some((p) => p.price !== null);

    return NextResponse.json({
      complexNo: resolvedNo,
      complexList,
      areaTypes: allAreas,
      prices,
      reasonCode: hasAnyPrice ? "ok" : (globalReasonCode ?? "no_price_data"),
      reason: hasAnyPrice ? undefined : (globalReason ?? "KB 시세 데이터가 없습니다."),
    });
  } catch (err) {
    const msg = String(err);
    const isTimeout = /timeout|aborted|abort/i.test(msg);
    return NextResponse.json({
      complexList: [],
      areaTypes: [],
      prices: [],
      reasonCode: "error",
      reason: isTimeout
        ? "KB부동산 응답 시간 초과 — 서버에서 KB 접근이 지연·차단되는 상태일 수 있습니다."
        : `KB부동산 요청 실패: ${msg}`,
    });
  }
}
