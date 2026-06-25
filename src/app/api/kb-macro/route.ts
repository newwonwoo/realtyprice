import { NextRequest, NextResponse } from "next/server";

// Edge Runtime: Lambda(ap-northeast-1)와 다른 Cloudflare 엣지 IP 풀 사용
// → api.kbland.kr Lambda IP 차단을 우회하는 첫 번째 방어선
export const runtime = "edge";

// data-api.kbland.kr — 역공학 엔드포인트 (PublicDataReader 참조)
// 메뉴코드 01=매수우위지수, 02=매매거래활발지수, 03=전세수급지수, 05=매매가격전망지수
// 월간주간구분코드 01=월간, 02=주간 (05는 월간만 지원)
const DATA_API = "https://data-api.kbland.kr/bfmstat/weekMnthlyHuseTrnd/maktTrnd";

const HEADERS = {
  "Referer": "https://kbland.kr/",
  "Origin": "https://kbland.kr",
  "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
};

export type KbMacroIndex = {
  baseDate: string;       // 기준일 (YYYYMMDD or YYYYMM)
  buyerDominance: number; // 매수우위지수 (0-200, >100=매수자우위)
  priceOutlook: number;   // 매매가격전망지수 (0-200, >100=상승전망)
  jeonseSupply: number;   // 전세수급지수 (0-200)
  tradeActivity: number;  // 매매거래활발지수 (0-200)
};

export type KbMacroReasonCode =
  | "ok"
  | "blocked"
  | "upstream_error"
  | "no_data"
  | "error";

export type KbMacroResponse = {
  data?: KbMacroIndex;
  reasonCode: KbMacroReasonCode;
  reason?: string;
};

async function fetchIndex(menuCode: string, weekly: boolean): Promise<{ value: number; baseDate: string } | null> {
  const params = new URLSearchParams({
    메뉴코드: menuCode,
    월간주간구분코드: weekly ? "02" : "01",
    기간: "1",
  });
  try {
    const res = await fetch(`${DATA_API}?${params}`, {
      headers: HEADERS,
      next: { revalidate: 60 * 60 * 6 }, // 6시간 캐시
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) return null;
    const json = await res.json();
    // 응답 구조: dataBody.data 배열, 최신이 앞에 옴
    const rows = json?.dataBody?.data as Record<string, unknown>[] | undefined;
    if (!rows?.length) return null;
    const latest = rows[0];
    const value = Number(latest.지수값 ?? latest.indexValue ?? latest.value ?? 0);
    const baseDate = String(latest.기준일 ?? latest.baseDate ?? latest.date ?? "");
    return Number.isFinite(value) && value > 0 ? { value, baseDate } : null;
  } catch {
    return null;
  }
}

export async function GET(req: NextRequest) {
  const { searchParams } = req.nextUrl;
  const weekly = searchParams.get("weekly") !== "false"; // 기본 주간

  try {
    const [buyer, outlook, jeonse, trade] = await Promise.all([
      fetchIndex("01", weekly),
      fetchIndex("05", false), // 전망지수는 월간만 지원
      fetchIndex("03", weekly),
      fetchIndex("02", weekly),
    ]);

    if (!buyer && !outlook) {
      return NextResponse.json({
        reasonCode: "no_data",
        reason: "KB부동산 매크로 지수를 조회할 수 없습니다. 서버 측 IP 차단 또는 API 변경일 수 있습니다.",
      } satisfies KbMacroResponse);
    }

    const baseDate = buyer?.baseDate || outlook?.baseDate || "";
    const data: KbMacroIndex = {
      baseDate,
      buyerDominance: buyer?.value ?? 0,
      priceOutlook: outlook?.value ?? 0,
      jeonseSupply: jeonse?.value ?? 0,
      tradeActivity: trade?.value ?? 0,
    };

    return NextResponse.json({ data, reasonCode: "ok" } satisfies KbMacroResponse);
  } catch (err) {
    const msg = String(err);
    const isTimeout = /timeout|aborted/i.test(msg);
    return NextResponse.json({
      reasonCode: isTimeout ? "blocked" : "error",
      reason: isTimeout
        ? "KB부동산 매크로 API 응답 시간 초과"
        : `KB부동산 매크로 API 오류: ${msg}`,
    } satisfies KbMacroResponse, { status: 500 });
  }
}
