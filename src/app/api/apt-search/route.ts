import { NextRequest, NextResponse } from "next/server";

export type AptSearchResult = {
  kaptCode: string;
  kaptName: string;
  kaptAddr: string;
  kaptdaCnt: string;
  kaptUsedate: string;
  kaptBcompany: string;
  bjdCode: string;
};

// 공공데이터포털 공동주택 단지 목록 API
const API_BASE = "https://apis.data.go.kr/1613000/AptListService2/getAptList";

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const serviceKey = searchParams.get("serviceKey");
  const sggCode = searchParams.get("sggCode");
  const aptName = searchParams.get("aptName") ?? "";

  if (!serviceKey) return NextResponse.json({ error: "공공데이터포털 API 키가 필요합니다. 설정 > API 키 설정에서 등록하세요." }, { status: 400 });
  if (!sggCode) return NextResponse.json({ error: "시군구코드가 필요합니다." }, { status: 400 });

  const params = new URLSearchParams({
    serviceKey,
    sggCd: sggCode,
    pageNo: "1",
    numOfRows: "100",
    _type: "json",
  });

  try {
    const res = await fetch(`${API_BASE}?${params.toString()}`, {
      headers: { Accept: "application/json" },
      next: { revalidate: 0 },
    });

    if (!res.ok) {
      return NextResponse.json({ error: `API 오류: ${res.status}` }, { status: 502 });
    }

    const data = await res.json();
    const items: AptSearchResult[] = data?.response?.body?.items?.item ?? [];

    // aptName 키워드로 필터링
    const filtered = aptName
      ? items.filter((item) => item.kaptName?.includes(aptName))
      : items;

    return NextResponse.json({ items: filtered, total: filtered.length });
  } catch (err) {
    return NextResponse.json({ error: `요청 실패: ${String(err)}` }, { status: 500 });
  }
}
