// 네이버 부동산 /api/articles/complex 응답(articleList) → 앱 Listing[] 매핑.
// 수집 자체는 사용자 브라우저(북마클릿/크롬확장)에서 이뤄지고, 이 함수는
//  (a) 확장이 보낸 raw article을 서버 /api/listings/ingest에서 정규화할 때,
//  (b) 클라이언트에서 미리 정규화할 때 공용으로 쓴다(순수함수, 단위테스트 대상).
import type { Listing } from "@/types/listing";
import { normalizeToBGrade } from "./grade";

export type NaverArticle = Record<string, unknown>;

// "12억 5,000" / "6억" / "125000"(만원) → 만원 정수
export function parseNaverPrice(input: unknown): number {
  if (input == null) return 0;
  const s = String(input).replace(/\s/g, "");
  if (!s) return 0;
  let v = 0;
  const eok = s.match(/(\d+)억/);
  if (eok) v += Number(eok[1]) * 10000;
  const man = s.match(/억([\d,]+)/);
  if (man) v += Number(man[1].replace(/,/g, ""));
  else if (!/억/.test(s)) v = Number(s.replace(/,/g, "")) || 0;
  return v;
}

// floorInfo "12/25" → 12 (해당 층). 저층/고층 등 비수치는 undefined.
function parseFloor(input: unknown): number | undefined {
  const s = String(input ?? "");
  const m = s.match(/^(\d+)/);
  return m ? Number(m[1]) : undefined;
}

function tradeTypeToListingType(a: NaverArticle): "sale" | "jeonse" | null {
  const t = String(a.tradeTypeName ?? a.tradeTypeCode ?? "");
  if (t === "매매" || t === "A1") return "sale";
  if (t === "전세" || t === "B1") return "jeonse";
  return null; // 월세(B2) 등은 제외
}

// 전용면적(㎡) 추출 — 스키마 변형에 강하게.
// 우선순위: area2(전용, 표준) → exclusiveArea/spc2 → areaName 파싱.
// areaName은 "109/84"(공급/전용) 또는 "84.98" 형태 → 두 값이면 작은 쪽(전용), 하나면 그 값.
export function extractExclusiveArea(a: NaverArticle): number {
  const direct = Number(a.area2 ?? a.exclusiveArea ?? a.spc2 ?? 0);
  if (direct > 0) return direct;
  const name = String(a.areaName ?? "");
  const nums = (name.match(/\d+(\.\d+)?/g) ?? []).map(Number).filter((n) => n >= 20 && n <= 400);
  if (nums.length >= 2) return Math.min(...nums); // 공급/전용 → 전용(작은 값)
  if (nums.length === 1) return nums[0];
  return 0;
}

export type IngestParams = {
  apartmentId: string;
  complexNo: string;
  articles: NaverArticle[];
  targetArea?: number; // 전용면적 기준(㎡), 기본 84
  areaTol?: number;    // ±허용(㎡), 기본 6 (전용 84 계열)
  capturedAt: string;  // YYYY-MM-DD
};

export function naverArticlesToListings(p: IngestParams): Listing[] {
  const targetArea = p.targetArea ?? 84;
  const areaTol = p.areaTol ?? 6;
  const out: Listing[] = [];
  const seen = new Set<string>();
  for (const a of p.articles ?? []) {
    const listingType = tradeTypeToListingType(a);
    if (!listingType) continue;
    const exclusiveArea = extractExclusiveArea(a);
    if (!exclusiveArea || Math.abs(exclusiveArea - targetArea) > areaTol) continue;
    const askingPrice = parseNaverPrice(a.dealOrWarrantPrc);
    if (!askingPrice) continue;
    const articleNo = String(a.articleNo ?? a.articleName ?? `${exclusiveArea}_${a.floorInfo ?? ""}`);
    const listingKey = `nv_${p.complexNo}_${articleNo}`;
    if (seen.has(listingKey)) continue;
    seen.add(listingKey);
    out.push({
      id: `listing_${listingKey}`,
      apartmentId: p.apartmentId,
      listingType,
      exclusiveArea,
      askingPrice,
      floor: parseFloor(a.floorInfo),
      direction: a.direction ? String(a.direction) : undefined,
      grade: "B",
      adjustedAskingPrice: normalizeToBGrade(askingPrice, "B"),
      source: "naver",
      listingKey,
      capturedAt: p.capturedAt,
      status: "active",
      memo: a.articleFeatureDesc ? String(a.articleFeatureDesc).slice(0, 120) : undefined,
    });
  }
  return out;
}
