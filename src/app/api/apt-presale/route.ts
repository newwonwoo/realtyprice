import { NextRequest, NextResponse } from "next/server";

// 한국부동산원_청약홈 분양정보 조회 서비스
// https://www.data.go.kr/data/15098547/openapi.do
const API_BASE = "https://api.odcloud.kr/api/ApplyhomeInfoDetailSvc/v1/getAPTLttotPblancList";

export type PresaleInfo = {
  houseName: string;
  houseManageNo: string;
  supplyLocation: string;
  totalSupplyHouseholds: number;
  recruitPublicNoticeDate: string;
  lowestPrice?: number;
  highestPrice?: number;
};

// URLSearchParams encodes [] as %5B%5D — must build URL manually.
// odcloud ::LIKE does substring matching; do NOT wrap value in % wildcards.
function buildUrl(field: string, value: string, serviceKey: string): string {
  const keyEncoded = encodeURIComponent(serviceKey);
  const valueEncoded = encodeURIComponent(value);
  return `${API_BASE}?serviceKey=${keyEncoded}&page=1&perPage=10&cond[${field}::LIKE]=${valueEncoded}`;
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
  const houseName = searchParams.get("houseName");

  if (!serviceKey) return NextResponse.json({ error: "API 키가 없습니다." }, { status: 400 });
  if (!houseName) return NextResponse.json({ error: "단지명(houseName)이 필요합니다." }, { status: 400 });

  try {
    const kw = houseName.trim();
    // 단지명으로 먼저 시도, 없으면 공급위치(주소)로 재시도
    let raw = await fetchField("HOUSE_NM", kw, serviceKey);
    if (!raw.length) raw = await fetchField("HSSPLY_ADRES", kw, serviceKey);

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
        lowestPrice: lowestRaw ? Math.round(Number(lowestRaw) / 10000) : undefined,
        highestPrice: highestRaw ? Math.round(Number(highestRaw) / 10000) : undefined,
      };
    }).filter((item) => item.houseName);

    return NextResponse.json({ items, total: items.length });
  } catch (err) {
    return NextResponse.json({ error: `요청 실패: ${String(err)}` }, { status: 500 });
  }
}
