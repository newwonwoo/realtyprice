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

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const serviceKey = searchParams.get("serviceKey");
  const keyword = searchParams.get("keyword") ?? ""; // 주소/단지명 LIKE 검색

  if (!serviceKey) return NextResponse.json({ error: "공공데이터포털 API 키가 없습니다. 설정 > API 키 설정에서 등록하세요." }, { status: 400 });
  if (!keyword.trim()) return NextResponse.json({ error: "검색어를 입력하세요." }, { status: 400 });

  const params = new URLSearchParams({
    serviceKey,
    page: "1",
    perPage: "30",
    "cond[ADRES::LIKE]": keyword.trim(),
    "cond[COMPLEX_GB_CD::EQ]": "1", // 아파트만
  });

  try {
    const res = await fetch(`${API_BASE}?${params.toString()}`, {
      headers: { Accept: "application/json" },
      next: { revalidate: 0 },
    });

    if (!res.ok) {
      const text = await res.text();
      return NextResponse.json({ error: `API 오류: ${res.status} ${text.slice(0, 200)}` }, { status: 502 });
    }

    const data = await res.json();
    const raw: Record<string, unknown>[] = data?.data ?? [];

    const items: AptSearchResult[] = raw.map((item) => ({
      complexPk: String(item["COMPLEX_PK"] ?? ""),
      name: String(item["COMPLEX_NM1"] ?? ""),
      address: String(item["ADRES"] ?? ""),
      households: Number(item["UNIT_CNT"] ?? 0),
      builtDate: String(item["USEAPR_DT"] ?? ""),
      dongCount: Number(item["DONG_CNT"] ?? 0),
    })).filter((item) => item.complexPk && item.name);

    return NextResponse.json({ items, total: items.length, totalCount: data?.totalCount ?? 0 });
  } catch (err) {
    return NextResponse.json({ error: `요청 실패: ${String(err)}` }, { status: 500 });
  }
}
