import { NextRequest, NextResponse } from "next/server";

// 한국부동산원_청약홈 분양정보 조회 서비스
// https://www.data.go.kr/data/15098547/openapi.do
const API_BASE = "https://api.odcloud.kr/api/ApplyhomeInfoDetailSvc/v1/getAPTLttotPblancList";

export type PresaleInfo = {
  houseName: string;        // 주택명(단지명)
  houseManageNo: string;    // 주택관리번호
  supplyLocation: string;   // 공급위치
  totalSupplyHouseholds: number; // 공급규모(세대수)
  recruitPublicNoticeDate: string; // 모집공고일
  // 주택형별 분양가 (타입별로 별도 조회 필요, 여기서는 대표가 제공)
  lowestPrice?: number;     // 최저분양가(만원)
  highestPrice?: number;    // 최고분양가(만원)
};

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const serviceKey = searchParams.get("serviceKey");
  const houseName = searchParams.get("houseName");

  if (!serviceKey) return NextResponse.json({ error: "API 키가 없습니다." }, { status: 400 });
  if (!houseName) return NextResponse.json({ error: "단지명(houseName)이 필요합니다." }, { status: 400 });

  try {
    const params = new URLSearchParams({
      serviceKey,
      page: "1",
      perPage: "10",
      "cond[HOUSE_NM::LIKE]": houseName.trim(),
    });

    const res = await fetch(`${API_BASE}?${params.toString()}`, {
      headers: { Accept: "application/json" },
      next: { revalidate: 0 },
    });

    if (!res.ok) {
      const text = await res.text();
      return NextResponse.json({ error: `청약홈 API 오류: ${res.status} ${text.slice(0, 200)}` }, { status: 502 });
    }

    const data = await res.json();
    const raw: Record<string, unknown>[] = data?.data ?? [];

    if (!raw.length) {
      return NextResponse.json({ error: "분양정보를 찾을 수 없습니다. (청약홈에 등록되지 않은 단지일 수 있습니다.)" }, { status: 404 });
    }

    const items: PresaleInfo[] = raw.map((item) => {
      const lowestRaw = String(item["LTTOT_TOP_AMOUNT"] ?? item["MIN_LTTOT_PRICE"] ?? "0").replace(/,/g, "");
      const highestRaw = String(item["LTTOT_TOP_AMOUNT"] ?? item["MAX_LTTOT_PRICE"] ?? "0").replace(/,/g, "");

      return {
        houseName: String(item["HOUSE_NM"] ?? ""),
        houseManageNo: String(item["HOUSE_MANAGE_NO"] ?? ""),
        supplyLocation: String(item["HSSPLY_ADRES"] ?? ""),
        totalSupplyHouseholds: Number(item["TOT_SUPLY_HSHLDCO"] ?? 0),
        recruitPublicNoticeDate: String(item["RCRIT_PBLANC_DE"] ?? ""),
        lowestPrice: lowestRaw ? Math.round(Number(lowestRaw) / 10000) : undefined, // 원 → 만원
        highestPrice: highestRaw ? Math.round(Number(highestRaw) / 10000) : undefined,
      };
    }).filter((item) => item.houseName);

    return NextResponse.json({ items, total: items.length });
  } catch (err) {
    return NextResponse.json({ error: `요청 실패: ${String(err)}` }, { status: 500 });
  }
}
