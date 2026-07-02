import { NextRequest, NextResponse } from "next/server";

// 한국부동산원_청약홈 분양정보 조회 서비스 (단지 상세 — 이름/주소/시공사/시행사)
// https://www.data.go.kr/data/15098547/openapi.do
// ⚠️ 공식 매뉴얼(활용가이드 PDF) 기준 정확한 오퍼레이션명은 getAPTLttotPblancDetail.
//    잘못된 이름(getAPTLttotPblancList)을 호출하면 HTTP 400이 반환됩니다.
//    ⚠️ 이 API 응답에는 분양가 필드가 없습니다(공식 가이드의 응답 예시로 확인됨).
const API_BASE = "https://api.odcloud.kr/api/ApplyhomeInfoDetailSvc/v1/getAPTLttotPblancDetail";

// 한국부동산원_청약홈_APT 주택형별 분양정보 (파일데이터 기반, 데이터셋 15101047)
// — 분양가(공급금액_분양최고금액)는 이 API에만 있음. 평형(주택형)마다 레코드 1개.
// Swagger: https://infuser.odcloud.kr/oas/docs?namespace=15101047/v1
// ⚠️ 필드가 전부 한글 키("주택관리번호", "공급금액_분양최고금액" 등)이고,
//    조회 파라미터는 page/perPage/returnType뿐 — 단지별 필터가 없어 페이지를
//    넘기며 주택관리번호+공고번호로 직접 걸러야 합니다.
const MDL_API_BASE = "https://api.odcloud.kr/api/15101047/v1/uddi:69236f4f-13ff-4ecb-a429-ed5398f2b459";

// ⚠️ 이 데이터셋의 검색(cond) 가능 필드는 HOUSE_MANAGE_NO, PBLANC_NO,
//    SUBSCRPT_AREA_CODE_NM(지역), RCRIT_PBLANC_DE(공고일)뿐입니다.
//    HOUSE_NM(단지명)은 응답에만 존재하고 검색 필터로는 쓸 수 없으므로(→ 400),
//    필터 없이 목록을 받아 서버에서 직접 부분일치로 거릅니다. (전체 약 1,900건)
const PER_PAGE = 1000; // 전체(약 1,900건)를 2페이지로 커버
const MAX_PAGES = 5;
const MDL_PER_PAGE = 1000;
const MDL_MAX_PAGES = 20; // 주택형별(평형별) 레코드라 상세보다 훨씬 많음 — 넉넉히 스캔

export type PresaleInfo = {
  houseName: string;
  houseManageNo: string;
  pblancNo: string;
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
  return {
    houseName: String(item["HOUSE_NM"] ?? ""),
    houseManageNo: String(item["HOUSE_MANAGE_NO"] ?? ""),
    pblancNo: String(item["PBLANC_NO"] ?? ""),
    supplyLocation: String(item["HSSPLY_ADRES"] ?? ""),
    totalSupplyHouseholds: Number(item["TOT_SUPLY_HSHLDCO"] ?? 0),
    recruitPublicNoticeDate: String(item["RCRIT_PBLANC_DE"] ?? ""),
    constructor: String(item["CNSTRCT_ENTRPS_NM"] ?? "") || undefined,
    developer: String(item["BSNS_MBY_NM"] ?? "") || undefined,
  };
}

// 주택관리번호+공고번호로 주택형별(평형별) 분양가를 찾아 최저/최고가를 반환.
// 단지별 필터가 없는 API라 페이지를 넘기며 직접 걸러야 한다.
async function fetchPriceRange(
  serviceKey: string,
  houseManageNo: string,
  pblancNo: string,
  diag: StrategyDiag[],
): Promise<{ lowestPrice?: number; highestPrice?: number }> {
  if (!houseManageNo) return {};
  let normalizedKey = serviceKey;
  try { normalizedKey = decodeURIComponent(serviceKey); } catch { /* 그대로 사용 */ }
  const keyEncoded = encodeURIComponent(normalizedKey);

  const amounts: number[] = [];
  for (let page = 1; page <= MDL_MAX_PAGES; page++) {
    const url = `${MDL_API_BASE}?serviceKey=${keyEncoded}&page=${page}&perPage=${MDL_PER_PAGE}`;
    let rows: Record<string, unknown>[] = [];
    let totalCount = 0;
    try {
      const res = await fetch(url, { headers: { Accept: "application/json" }, next: { revalidate: 0 } });
      if (!res.ok) {
        const body = await res.text().catch(() => "");
        diag.push({ field: `mdl page ${page}`, value: houseManageNo, httpStatus: res.status, rawCount: 0, error: body.slice(0, 300) });
        break;
      }
      const data = await res.json();
      rows = (data?.data ?? []) as Record<string, unknown>[];
      totalCount = Number(data?.totalCount ?? 0);
      diag.push({ field: `mdl page ${page}`, value: houseManageNo, httpStatus: res.status, rawCount: rows.length });
    } catch (e) {
      diag.push({ field: `mdl page ${page}`, value: houseManageNo, httpStatus: 0, rawCount: 0, error: String(e) });
      break;
    }

    for (const row of rows) {
      const rowHouseManageNo = String(row["주택관리번호"] ?? "");
      const rowPblancNo = String(row["공고번호"] ?? "");
      if (rowHouseManageNo !== houseManageNo) continue;
      if (pblancNo && rowPblancNo && rowPblancNo !== pblancNo) continue;
      const amount = Number(row["공급금액_분양최고금액"]);
      if (Number.isFinite(amount) && amount > 0) amounts.push(amount);
    }

    if (rows.length < MDL_PER_PAGE) break;
    if (totalCount && page * MDL_PER_PAGE >= totalCount) break;
  }

  if (!amounts.length) return {};
  return { lowestPrice: Math.min(...amounts), highestPrice: Math.max(...amounts) };
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
    // 괄호 표기("(A8블록)" 등)는 청약홈 표기(예: "A8BL")와 달라 이름 매칭에는 방해만 되므로
    // 매칭용 문자열에서는 제거하되, 같은 프로젝트의 다른 블록(=다른 시행사·분양가)과
    // 구분하는 힌트로는 따로 보관한다 — 블록 무시하고 이름만 느슨히 매칭하면 A8블록인데
    // A7·A9 등 엉뚱한 블록의 시행사·분양가가 섞여 나올 수 있다(실제 관측된 증상).
    const blockMatch = kw.match(/[（(]([^）)]*)[）)]/);
    const blockCode = blockMatch ? (noSpace(blockMatch[1]).toUpperCase().match(/[A-Z]*\d+/)?.[0] ?? "") : "";
    const kwClean = kw.replace(/[（(][^）)]*[）)]/g, " ").replace(/\s+/g, " ").trim();
    const kwNoSpace = noSpace(kwClean);
    // 띄어쓰기로 분리한 각 단어 (지역+단지명 조합 대응)
    const words = kwClean.split(/\s+/).filter((t) => t.length >= 2).map(noSpace);

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
        // 전부 일치 요구 — 완화하면 이름만 비슷한 다른 단지/다른 블록까지 잡혀 오매칭 위험
        // (실제로 "센트럴파크"만 겹치는 엉뚱한 블록의 시행사가 섞여 나오는 문제가 있었음).
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

    // 후보가 여럿이고 블록 힌트가 있으면(예: "A8블록"→"A8") 그 블록의 주소/이름을
    // 포함한 레코드로 좁힌다. 같은 이름의 다른 블록이 섞여 나오는 것을 방지.
    let finalMatches = matched;
    if (blockCode && matched.length > 1) {
      const narrowed = matched.filter((p) => {
        const addrUp = noSpace(p.supplyLocation).toUpperCase();
        const nameUp = noSpace(p.houseName).toUpperCase();
        return addrUp.includes(blockCode) || nameUp.includes(blockCode);
      });
      if (narrowed.length > 0) finalMatches = narrowed;
    }

    // 최신 공고 우선 정렬
    finalMatches.sort((a, b) => (b.recruitPublicNoticeDate || "").localeCompare(a.recruitPublicNoticeDate || ""));

    // 분양가는 최상위(최신) 매칭 1건에 대해서만 추가 조회 — 매 후보마다 불필요한 호출 방지
    const top = finalMatches[0];
    const priceRange = await fetchPriceRange(serviceKey, top.houseManageNo, top.pblancNo, diag);
    finalMatches[0] = { ...top, ...priceRange };

    return NextResponse.json({ items: finalMatches, total: finalMatches.length, ...(debug ? { diag } : {}) });
  } catch (err) {
    return NextResponse.json({ error: `요청 실패: ${String(err)}`, ...(debug ? { diag } : {}) }, { status: 500 });
  }
}
