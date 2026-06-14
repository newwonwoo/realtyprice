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

// URLSearchParams encodes [] breaking odcloud cond[] filters — build raw URL
function buildUrl(field: string, value: string, serviceKey: string): string {
  const encoded = encodeURIComponent(value);
  const keyEncoded = encodeURIComponent(serviceKey);
  return `${API_BASE}?serviceKey=${keyEncoded}&page=1&perPage=100&cond[${field}::LIKE]=%25${encoded}%25&cond[COMPLEX_GB_CD::EQ]=1`;
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

async function fetchField(field: string, value: string, serviceKey: string): Promise<Record<string, unknown>[]> {
  try {
    const url = buildUrl(field, value, serviceKey);
    const res = await fetch(url, { headers: { Accept: "application/json" }, next: { revalidate: 0 } });
    if (!res.ok) return [];
    const data = await res.json();
    return (data?.data ?? []) as Record<string, unknown>[];
  } catch {
    return [];
  }
}

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const serviceKey = searchParams.get("serviceKey");
  const keyword = searchParams.get("keyword") ?? "";

  if (!serviceKey) return NextResponse.json({ error: "공공데이터포털 API 키가 없습니다. 설정 > API 키 설정에서 등록하세요." }, { status: 400 });
  if (!keyword.trim()) return NextResponse.json({ error: "검색어를 입력하세요." }, { status: 400 });

  try {
    const kw = keyword.trim();
    const kwNoSpace = kw.replace(/\s+/g, "");

    const seenPk = new Set<string>();
    const allRaw: Record<string, unknown>[] = [];

    function merge(batch: Record<string, unknown>[]) {
      for (const item of batch) {
        const pk = String(item["COMPLEX_PK"] ?? "");
        if (pk && !seenPk.has(pk)) { seenPk.add(pk); allRaw.push(item); }
      }
    }

    let strategies: Promise<Record<string, unknown>[]>[];

    if (kw.includes(" ")) {
      // 공백 구분 키워드: 각 단어로 병렬 검색
      const words = kw.split(/\s+/).filter((t) => t.length >= 2);
      strategies = words.flatMap((w) => [
        fetchField("COMPLEX_NM1", w, serviceKey),
        fetchField("ADRES", w, serviceKey),
      ]);
    } else {
      // 공백 없는 키워드 (예: "성동자이리버뷰"):
      // - 앞 2글자(지역명)로 ADRES 광역검색 → 전체 결과 수집 후 이름 필터
      // - 마지막 3~4글자(브랜드/특징)로 COMPLEX_NM1 시도
      // - 전체 키워드로 COMPLEX_NM1 시도
      const len = kwNoSpace.length;
      strategies = [
        fetchField("COMPLEX_NM1", kwNoSpace, serviceKey),
        fetchField("ADRES", kwNoSpace.slice(0, 2), serviceKey),
      ];
      if (len >= 3) strategies.push(fetchField("COMPLEX_NM1", kwNoSpace.slice(-3), serviceKey));
      if (len >= 4) strategies.push(fetchField("COMPLEX_NM1", kwNoSpace.slice(-4), serviceKey));
      if (len >= 5) strategies.push(fetchField("COMPLEX_NM1", kwNoSpace.slice(-5), serviceKey));
    }

    const batches = await Promise.all(strategies);
    batches.forEach(merge);

    // 공백 제거 후 이름/주소 포함 여부로 최종 필터
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
