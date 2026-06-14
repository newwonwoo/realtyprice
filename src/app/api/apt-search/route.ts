import { NextRequest, NextResponse } from "next/server";

// 한국부동산원_공동주택 단지 식별정보 조회 서비스
// https://api.odcloud.kr/api/AptIdInfoSvc/v1/getAptInfo
const API_BASE = "https://api.odcloud.kr/api/AptIdInfoSvc/v1/getAptInfo";

export type AptSearchResult = {
  complexPk: string;   // 단지고유번호 (14자리)
  name: string;        // 단지명 (COMPLEX_NM1)
  address: string;     // 주소 (ADRES)
  households: number;  // 세대수 (UNIT_CNT)
  builtDate: string;   // 사용승인일 (USEAPR_DT, YYYYMMDD)
  dongCount: number;   // 동수 (DONG_CNT)
};

// URLSearchParams encodes [] which breaks odcloud cond[] filters — build raw query string
function buildUrl(field: string, value: string, serviceKey: string): string {
  const encoded = encodeURIComponent(value);
  const keyEncoded = encodeURIComponent(serviceKey);
  return `${API_BASE}?serviceKey=${keyEncoded}&page=1&perPage=30&cond[${field}::LIKE]=%25${encoded}%25&cond[COMPLEX_GB_CD::EQ]=1`;
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

    // 공백 제거한 키워드로 각 토큰별 검색 (가장 긴 토큰으로 API 쿼리)
    const tokens = kw.split(/\s+/).filter(Boolean);
    const mainToken = tokens.reduce((a, b) => a.length >= b.length ? a : b, kw);

    // 단지명으로 먼저 시도, 결과 없으면 주소로 재시도
    let raw = await fetchByField("COMPLEX_NM1", mainToken);
    if (!raw.length) {
      raw = await fetchByField("ADRES", mainToken);
    }

    // 공백 무시 후처리 필터 (DB 단지명과 입력값 모두 공백 제거 후 비교)
    const mapped: AptSearchResult[] = raw.map((item) => ({
      complexPk: String(item["COMPLEX_PK"] ?? ""),
      name: String(item["COMPLEX_NM1"] ?? ""),
      address: String(item["ADRES"] ?? ""),
      households: Number(item["UNIT_CNT"] ?? 0),
      builtDate: String(item["USEAPR_DT"] ?? ""),
      dongCount: Number(item["DONG_CNT"] ?? 0),
    }));

    const items = mapped.filter((item) => {
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
