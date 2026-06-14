import { NextRequest, NextResponse } from "next/server";

// 한국부동산원_공동주택 단지 식별정보 조회 서비스
// https://api.odcloud.kr/api/AptIdInfoSvc/v1/getAptInfo
const API_BASE = "https://api.odcloud.kr/api/AptIdInfoSvc/v1/getAptInfo";

export type AptSearchResult = {
  complexPk: string;
  name: string;
  address: string;
  households: number;
  builtDate: string;
  dongCount: number;
};

function buildUrl(field: string, value: string, serviceKey: string): string {
  const encoded = encodeURIComponent(value);
  const keyEncoded = encodeURIComponent(serviceKey);
  return `${API_BASE}?serviceKey=${keyEncoded}&page=1&perPage=50&cond[${field}::LIKE]=%25${encoded}%25&cond[COMPLEX_GB_CD::EQ]=1`;
}

function toAptResult(item: Record<string, unknown>): AptSearchResult {
  return {
    complexPk: String(item["COMPLEX_PK"] ?? ""),
    name: String(item["COMPLEX_NM1"] ?? ""),
    address: String(item["ADRES"] ?? ""),
    households: Number(item["UNIT_CNT"] ?? 0),
    builtDate: String(item["USEAPR_DT"] ?? ""),
    dongCount: Number(item["DONG_CNT"] ?? 0),
  };
}

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const serviceKey = searchParams.get("serviceKey");
  const keyword = searchParams.get("keyword") ?? "";

  if (!serviceKey) return NextResponse.json({ error: "공공데이터포털 API 키가 없습니다. 설정 > API 키 설정에서 등록하세요." }, { status: 400 });
  if (!keyword.trim()) return NextResponse.json({ error: "검색어를 입력하세요." }, { status: 400 });

  async function fetchByField(field: string, value: string): Promise<Record<string, unknown>[]> {
    const url = buildUrl(field, value, serviceKey!);
    const res = await fetch(url, { headers: { Accept: "application/json" }, next: { revalidate: 0 } });
    if (!res.ok) throw new Error(`API 오류: ${res.status}`);
    const data = await res.json();
    return (data?.data ?? []) as Record<string, unknown>[];
  }

  try {
    const kw = keyword.trim();
    const kwNoSpace = kw.replace(/\s+/g, "");

    // 검색 토큰 생성
    // - 공백 있는 키워드: 각 단어를 독립 토큰으로 사용 (예: "성동 자이" → ["성동", "자이"])
    // - 공백 없는 키워드: 전체, 앞 2-3자, 뒤 3자, 중간 2-3자 등 최대 4개 토큰 병렬 검색
    //   (예: "성동자이리버뷰" → ["성동자이리버뷰", "성동", "리버뷰", "자이리버"])
    let searchTokens: string[];
    if (kw.includes(" ")) {
      searchTokens = Array.from(new Set(kw.split(/\s+/).filter((t) => t.length >= 2)));
    } else {
      const len = kwNoSpace.length;
      const candidates: string[] = [kwNoSpace];
      if (len >= 2) candidates.push(kwNoSpace.slice(0, 2));
      if (len >= 3) candidates.push(kwNoSpace.slice(0, 3));
      if (len >= 3) candidates.push(kwNoSpace.slice(-3));
      if (len >= 4) candidates.push(kwNoSpace.slice(-4));
      if (len >= 5) {
        const mid = Math.floor(len / 2);
        candidates.push(kwNoSpace.slice(mid - 1, mid + 2));
      }
      searchTokens = Array.from(new Set(candidates.filter((t) => t.length >= 2)));
    }

    // 모든 토큰을 병렬로 검색 (COMPLEX_NM1 우선, 결과 없으면 ADRES)
    const results = await Promise.all(
      searchTokens.map(async (token) => {
        let raw = await fetchByField("COMPLEX_NM1", token);
        if (!raw.length) raw = await fetchByField("ADRES", token);
        return raw;
      })
    );

    // COMPLEX_PK 기준 중복 제거
    const seenPk = new Set<string>();
    const allRaw: Record<string, unknown>[] = [];
    for (const batch of results) {
      for (const item of batch) {
        const pk = String(item["COMPLEX_PK"] ?? "");
        if (pk && !seenPk.has(pk)) { seenPk.add(pk); allRaw.push(item); }
      }
    }

    // 공백 무시 후처리 필터: name 또는 address(공백 제거)에 키워드(공백 제거) 포함 여부
    const items = allRaw
      .map(toAptResult)
      .filter((item) => {
        if (!item.complexPk || !item.name) return false;
        const nameNoSpace = item.name.replace(/\s+/g, "");
        const addrNoSpace = item.address.replace(/\s+/g, "");
        return nameNoSpace.includes(kwNoSpace) || addrNoSpace.includes(kwNoSpace);
      });

    return NextResponse.json({ items, total: items.length });
  } catch (err) {
    return NextResponse.json({ error: `요청 실패: ${String(err)}` }, { status: 500 });
  }
}
