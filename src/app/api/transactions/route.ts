import { NextRequest, NextResponse } from "next/server";

// 국토교통부 아파트 매매 실거래 상세 자료
const SALE_API = "https://apis.data.go.kr/1613000/RTMSDataSvcAptTradeDev/getRTMSDataSvcAptTradeDev";
// 국토교통부 아파트 전월세 자료
const RENT_API = "https://apis.data.go.kr/1613000/RTMSDataSvcAptRent/getRTMSDataSvcAptRent";
// 국토교통부 아파트 분양권전매 실거래가 자료
const PRESALE_API = "https://apis.data.go.kr/1613000/RTMSDataSvcSilvTrade/getRTMSDataSvcSilvTrade";

export type MolitTransaction = {
  aptNm: string;       // 단지명
  excluUseAr: string;  // 전용면적
  dealAmount: string;  // 거래금액(만원, 쉼표 포함)
  dealYear: string;
  dealMonth: string;
  dealDay: string;
  floor: string;
  buildYear: string;
  jibun: string;
  umdNm: string;       // 법정동명
  // 전월세 전용
  deposit?: string;    // 보증금
  monthlyRent?: string; // 월세금
  contractType?: string; // 계약구분
  transactionType: "sale" | "jeonse" | "monthly_rent";
};

async function fetchPage(url: string, params: URLSearchParams): Promise<MolitTransaction[]> {
  const res = await fetch(`${url}?${params.toString()}`, {
    headers: { Accept: "application/json" },
    next: { revalidate: 0 },
  });
  if (!res.ok) return [];
  const data = await res.json();
  const items = data?.response?.body?.items?.item;
  if (!items) return [];
  return Array.isArray(items) ? items : [items];
}

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const serviceKey = searchParams.get("serviceKey");
  const lawdCd = searchParams.get("lawdCd");     // 시군구코드 5자리 (= sggCode)
  const aptName = searchParams.get("aptName");    // 단지명 필터
  const fromYm = searchParams.get("fromYm") ?? "";  // YYYYMM
  const toYm = searchParams.get("toYm") ?? "";      // YYYYMM
  const type = searchParams.get("type") ?? "all";   // sale | rent | presale | all

  if (!serviceKey) return NextResponse.json({ error: "국토부 실거래 API 키가 없습니다. 설정 > API 키 설정에서 등록하세요." }, { status: 400 });
  if (!lawdCd) return NextResponse.json({ error: "지역코드(lawdCd)가 필요합니다." }, { status: 400 });
  if (!aptName) return NextResponse.json({ error: "아파트명(aptName)이 필요합니다." }, { status: 400 });

  // data.go.kr 키 정규화 (URL인코딩 버전 → 디코딩)
  let normalizedKey = serviceKey;
  try { normalizedKey = decodeURIComponent(serviceKey); } catch { /* 그대로 */ }

  // 조회 기간 계산 (기본: 최근 12개월)
  const months = buildMonthRange(fromYm, toYm);

  const allTx: MolitTransaction[] = [];

  try {
    for (const ym of months) {
      const baseParams = new URLSearchParams({
        serviceKey: normalizedKey,
        LAWD_CD: lawdCd,
        DEAL_YMD: ym,
        pageNo: "1",
        numOfRows: "100",
        _type: "json",
      });

      if (type === "sale" || type === "all") {
        const items = await fetchPage(SALE_API, baseParams);
        items.forEach((item) => { (item as MolitTransaction).transactionType = "sale"; });
        allTx.push(...items);
      }
      if (type === "rent" || type === "all") {
        const items = await fetchPage(RENT_API, baseParams);
        items.forEach((item) => {
          const monthly = Number((item as MolitTransaction).monthlyRent ?? "0");
          (item as MolitTransaction).transactionType = monthly > 0 ? "monthly_rent" : "jeonse";
        });
        allTx.push(...items);
      }
      if (type === "presale" || type === "all") {
        const items = await fetchPage(PRESALE_API, baseParams);
        items.forEach((item) => { (item as MolitTransaction).transactionType = "sale"; }); // 분양권전매는 매매로 분류
        allTx.push(...items);
      }
    }

    // 단지명 필터
    const filtered = allTx.filter((tx) =>
      tx.aptNm?.replace(/\s/g, "").includes(aptName.replace(/\s/g, ""))
    );

    return NextResponse.json({ items: filtered, total: filtered.length });
  } catch (err) {
    return NextResponse.json({ error: `요청 실패: ${String(err)}` }, { status: 500 });
  }
}

// YYYYMM 범위 배열 생성 (최대 24개월)
function buildMonthRange(fromYm: string, toYm: string): string[] {
  const now = new Date();
  const toDate = toYm ? parseYm(toYm) : now;
  const fromDate = fromYm ? parseYm(fromYm) : new Date(now.getFullYear() - 1, now.getMonth(), 1);

  const months: string[] = [];
  const cur = new Date(fromDate);
  let limit = 0;
  while (cur <= toDate && limit < 24) {
    const y = cur.getFullYear();
    const m = String(cur.getMonth() + 1).padStart(2, "0");
    months.push(`${y}${m}`);
    cur.setMonth(cur.getMonth() + 1);
    limit++;
  }
  return months;
}

function parseYm(ym: string): Date {
  return new Date(parseInt(ym.slice(0, 4), 10), parseInt(ym.slice(4, 6), 10) - 1, 1);
}
