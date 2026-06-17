import { NextRequest, NextResponse } from "next/server";

// 국토교통부_공동주택 입주예정물량조회 서비스
// https://www.data.go.kr/data/15058017/openapi.do
const API_BASE = "https://apis.data.go.kr/1613000/AptMvnInfoSvc/getAptMvnInfo";

export type SupplyMonthData = {
  yyyymm: string;       // YYYYMM
  units: number;        // 입주예정 호수
  complexCount: number; // 단지수
};

export type SupplyVolumeResult = {
  lawdCd: string;
  regionName: string;
  current: SupplyMonthData;        // 현재월 기준 3개월 합계
  targetMoveIn?: SupplyMonthData;  // 대상단지 입주시점 3개월 합계
  monthlyData: SupplyMonthData[];  // 조회 기간 전체 월별 데이터
  priceImpactPct: number;          // 현재 공급압력 가격영향 % (음수=하락압력)
  targetMoveInPriceImpactPct?: number; // 입주시점 가격영향 %
};

async function fetchMonthly(serviceKey: string, lawdCd: string, yyyymm: string): Promise<SupplyMonthData | null> {
  const params = new URLSearchParams({
    serviceKey,
    LAWD_CD: lawdCd,
    YM: yyyymm,
    numOfRows: "100",
    pageNo: "1",
    _type: "json",
  });
  try {
    const res = await fetch(`${API_BASE}?${params.toString()}`, {
      headers: { Accept: "application/json" },
      next: { revalidate: 0 },
    });
    if (!res.ok) return null;
    const data = await res.json();
    const items = data?.response?.body?.items?.item;
    if (!items) return { yyyymm, units: 0, complexCount: 0 };
    const arr = Array.isArray(items) ? items : [items];
    const units = arr.reduce((s: number, x: Record<string, unknown>) => s + Number(x.mnthCnt ?? x.householdCount ?? 0), 0);
    return { yyyymm, units, complexCount: arr.length };
  } catch {
    return null;
  }
}

function supplyPressurePct(totalUnits3mo: number): number {
  // 3개월 합산 입주물량 기준 가격 영향
  // 연구 기반 휴리스틱 (이진상 외 2020, 주택연구): 수도권 기준
  // 3개월 500세대 미만 = 공급 부족 → +2~3%, 2000세대 초과 = 공급 과다 → -3~-5%
  if (totalUnits3mo >= 3000) return -5;
  if (totalUnits3mo >= 2000) return -3;
  if (totalUnits3mo >= 1000) return -1;
  if (totalUnits3mo >= 500) return 0;
  if (totalUnits3mo >= 200) return 2;
  return 3; // 200 미만 = 공급 희소
}

function addMonths(yyyymm: string, n: number): string {
  const y = parseInt(yyyymm.slice(0, 4), 10);
  const m = parseInt(yyyymm.slice(4, 6), 10) - 1;
  const d = new Date(y, m + n, 1);
  return `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, "0")}`;
}

function currentYm(): string {
  const now = new Date();
  return `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, "0")}`;
}

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const serviceKey = searchParams.get("serviceKey");
  const lawdCd = searchParams.get("lawdCd");
  const regionName = searchParams.get("regionName") ?? "";
  const targetMoveInYm = searchParams.get("targetMoveInYm") ?? ""; // YYYYMM

  if (!serviceKey) return NextResponse.json({ error: "국토부 API 키가 없습니다." }, { status: 400 });
  if (!lawdCd) return NextResponse.json({ error: "lawdCd(시군구코드)가 필요합니다." }, { status: 400 });

  const nowYm = currentYm();
  // 현재 3개월 + 대상단지 입주시점 3개월 조회
  const monthsToFetch = new Set<string>();
  for (let i = 0; i < 3; i++) monthsToFetch.add(addMonths(nowYm, i));
  if (targetMoveInYm) {
    for (let i = -1; i < 2; i++) monthsToFetch.add(addMonths(targetMoveInYm, i));
  }

  try {
    const results = await Promise.all(
      Array.from(monthsToFetch).map((ym) => fetchMonthly(serviceKey, lawdCd, ym))
    );

    const monthlyData: SupplyMonthData[] = results
      .filter((r): r is SupplyMonthData => r !== null)
      .sort((a, b) => a.yyyymm.localeCompare(b.yyyymm));

    const sumUnits = (yms: string[]) =>
      monthlyData.filter((m) => yms.includes(m.yyyymm)).reduce((s, m) => s + m.units, 0);
    const sumComplexes = (yms: string[]) =>
      monthlyData.filter((m) => yms.includes(m.yyyymm)).reduce((s, m) => s + m.complexCount, 0);

    const currentYms = [nowYm, addMonths(nowYm, 1), addMonths(nowYm, 2)];
    const currentUnits = sumUnits(currentYms);
    const current: SupplyMonthData = {
      yyyymm: nowYm,
      units: currentUnits,
      complexCount: sumComplexes(currentYms),
    };

    let targetMoveIn: SupplyMonthData | undefined;
    let targetMoveInPriceImpactPct: number | undefined;
    if (targetMoveInYm) {
      const moveInYms = [addMonths(targetMoveInYm, -1), targetMoveInYm, addMonths(targetMoveInYm, 1)];
      const moveInUnits = sumUnits(moveInYms);
      targetMoveIn = {
        yyyymm: targetMoveInYm,
        units: moveInUnits,
        complexCount: sumComplexes(moveInYms),
      };
      targetMoveInPriceImpactPct = supplyPressurePct(moveInUnits);
    }

    const result: SupplyVolumeResult = {
      lawdCd,
      regionName,
      current,
      targetMoveIn,
      monthlyData,
      priceImpactPct: supplyPressurePct(currentUnits),
      targetMoveInPriceImpactPct,
    };

    return NextResponse.json(result);
  } catch (err) {
    return NextResponse.json({ error: `요청 실패: ${String(err)}` }, { status: 500 });
  }
}
