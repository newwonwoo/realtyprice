import { NextRequest, NextResponse } from "next/server";

// 한국부동산원_청약홈 분양정보 조회 서비스
// https://www.data.go.kr/data/15098547/openapi.do
// ⚠️ 공식 매뉴얼 기준 정확한 오퍼레이션명은 getAPTLttotPblancDetail (APT 분양정보 상세조회).
//    잘못된 이름(getAPTLttotPblancList)을 호출하면 HTTP 400이 반환됩니다.
const API_BASE = "https://api.odcloud.kr/api/ApplyhomeInfoDetailSvc/v1/getAPTLttotPblancDetail";

// ⚠️ 이 데이터셋의 검색(cond) 가능 필드는 HOUSE_MANAGE_NO, PBLANC_NO,
//    SUBSCRPT_AREA_CODE_NM(지역), RCRIT_PBLANC_DE(공고일)뿐입니다.
//    HOUSE_NM(단지명)은 응답에만 존재하고 검색 필터로는 쓸 수 없으므로(→ 400),
//    필터 없이 목록을 받아 서버에서 직접 부분일치로 거릅니다. (전체 약 1,900건)
const PER_PAGE = 1000; // 전체(약 1,900건)를 2페이지로 커버
const MAX_PAGES = 5;

export type PresaleInfo = {
  houseName: string;
  houseManageNo: string;
  supplyLocation: string;
  totalSupplyHouseholds: number;
  recruitPublicNoticeDate: string;
  lowestPrice?: number;
  highestPrice?: number;
  constructor?: string; // 시공사(건설업체명)
  developer?: string;   // 시행사(사업주체명)
};

type StrategyDiag = { field: string; value: string; httpStatus: number; rawCount: number; error?: string };

function buildListUrl(page: number, serviceKey: string): string {
  let normalizedKey = serviceKey;
  try { normalizedKey = decodeURIComponent(serviceKey); } catch { /* 그대로 사용 */ }
  const keyEncoded = encodeURIComponent(normalizedKey);
  return `${API_BASE}?serviceKey=${keyEncoded}&page=${page}&perPage=${PER_PAGE}`;
}

const noSpace = (s: string) => s.replace(/\s+/g, "");

function toPresale(item: Record<string, unknown>): PresaleInfo {
  const lowestRaw = String(item["LTTOT_TOP_AMOUNT"] ?? item["MIN_LTTOT_PRICE"] ?? "0").replace(/,/g, "");
  const highestRaw = String(item["LTTOT_TOP_AMOUNT"] ?? item["MAX_LTTOT_PRICE"] ?? "0").replace(/,/g, "");
  return {
    houseName: String(item["HOUSE_NM"] ?? ""),
    houseManageNo: String(item["HOUSE_MANAGE_NO"] ?? ""),
    supplyLocation: String(item["HSSPLY_ADRES"] ?? ""),
    totalSupplyHouseholds: Number(item["TOT_SUPLY_HSHLDCO"] ?? 0),
    recruitPublicNoticeDate: String(item["RCRIT_PBLANC_DE"] ?? ""),
    lowestPrice: lowestRaw ? Math.round(Number(lowestRaw) / 10000) : undefined,
    highestPrice: highestRaw ? Math.round(Number(highestRaw) / 10000) : undefined,
    constructor: String(item["CNSTRCT_ENTRPS_NM"] ?? "") || undefined,
    developer: String(item["BSNS_MBY_NM"] ?? "") || undefined,
  };
}

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const serviceKey = searchParams.get("serviceKey") ?? process.env.DATA_GO_KR_API_KEY ?? "";
  const houseName = searchParams.get("houseName");
  const debug = searchParams.get("debug") === "1";
  const diag: StrategyDiag[] = [];

  if (!serviceKey) return NextResponse.json({ error: "API 키가 없습니다." }, { status: 400 });
  if (!houseName) return NextResponse.json({ error: "단지명(houseName)이 필요합니다." }, { status: 400 });

  try {
    const kw = houseName.trim();
    const kwNoSpace = noSpace(kw);
    // 띄어쓰기로 분리한 각 단어 (지역+단지명 조합 대응)
    const words = kw.split(/\s+/).filter((t) => t.length >= 2).map(noSpace);

    const matched: PresaleInfo[] = [];
    const seen = new Set<string>();

    for (let page = 1; page <= MAX_PAGES; page++) {
      const url = buildListUrl(page, serviceKey);
      let rows: Record<string, unknown>[] = [];
      let totalCount = 0;
      try {
        const res = await fetch(url, { headers: { Accept: "application/json" }, next: { revalidate: 0 } });
        if (!res.ok) {
          const body = await res.text().catch(() => "");
          diag.push({ field: `page ${page}`, value: "(no filter)", httpStatus: res.status, rawCount: 0, error: body.slice(0, 300) });
          break;
        }
        const data = await res.json();
        rows = (data?.data ?? []) as Record<string, unknown>[];
        totalCount = Number(data?.totalCount ?? data?.matchCount ?? 0);
        diag.push({ field: `page ${page}`, value: "(no filter)", httpStatus: res.status, rawCount: rows.length });
      } catch (e) {
        diag.push({ field: `page ${page}`, value: "(no filter)", httpStatus: 0, rawCount: 0, error: String(e) });
        break;
      }

      // 서버측 부분일치 필터 (띄어쓰기 무시)
      for (const item of rows) {
        const p = toPresale(item);
        if (!p.houseName) continue;
        const nameNoSpace = noSpace(p.houseName);
        const addrNoSpace = noSpace(p.supplyLocation);
        const hit = words.length
          ? words.every((w) => nameNoSpace.includes(w) || addrNoSpace.includes(w))
          : (nameNoSpace.includes(kwNoSpace) || addrNoSpace.includes(kwNoSpace));
        // 단어 분리 매칭이 너무 빡빡할 수 있으니 전체 키워드 포함도 OR 처리
        const looseHit = hit || nameNoSpace.includes(kwNoSpace) || kwNoSpace.includes(nameNoSpace);
        if (looseHit && !seen.has(p.houseManageNo)) {
          seen.add(p.houseManageNo);
          matched.push(p);
        }
      }

      // 더 받을 페이지가 없으면 종료
      if (rows.length < PER_PAGE) break;
      if (totalCount && page * PER_PAGE >= totalCount) break;
    }

    if (!matched.length) {
      return NextResponse.json(
        { error: "분양정보를 찾을 수 없습니다. (청약홈에 등록되지 않은 단지일 수 있습니다.)", ...(debug ? { diag } : {}) },
        { status: 404 },
      );
    }

    // 최신 공고 우선 정렬
    matched.sort((a, b) => (b.recruitPublicNoticeDate || "").localeCompare(a.recruitPublicNoticeDate || ""));

    return NextResponse.json({ items: matched, total: matched.length, ...(debug ? { diag } : {}) });
  } catch (err) {
    return NextResponse.json({ error: `요청 실패: ${String(err)}`, ...(debug ? { diag } : {}) }, { status: 500 });
  }
}
