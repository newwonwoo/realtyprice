import type { Listing } from "@/types/listing";
import type { ModelWeights, PriceEstimate } from "@/types/model";
import type { Transaction } from "@/types/transaction";
import { normalizeToBGrade } from "./grade";
import { median, getLowPriceListings } from "./inventory";

// 거래일 기준 시간감쇠 가중치 (USPAP 표준 + 헤도닉 모델 권고)
// 출처: Hedonic Pricing Model literature (Rosen 1974), 최근거래 우선 원칙
function temporalWeight(contractDate: string): number {
  const txDate = new Date(contractDate);
  if (isNaN(txDate.getTime())) return 1.0;
  const monthsAgo = (Date.now() - txDate.getTime()) / (1000 * 60 * 60 * 24 * 30.44);
  if (monthsAgo <= 3) return 1.5;
  if (monthsAgo <= 6) return 1.2;
  if (monthsAgo <= 12) return 1.0;
  return 0.7; // 12개월 초과 거래는 가중치 감소
}

export function calculateJeonseFloorPrice(expectedJeonsePrice: number, targetJeonseRatio: number) {
  if (!targetJeonseRatio) return 0;
  return expectedJeonsePrice / targetJeonseRatio;
}

export function calculateRecommendedAskingPrice(expectedSaleMid: number, lowPriceAbsorptionRate: number) {
  return Math.round(expectedSaleMid * (lowPriceAbsorptionRate >= 0.3 ? 1.05 : 1.03));
}

export function calculateDefensePrice(expectedSaleMid: number) {
  return Math.round(expectedSaleMid * 0.98);
}

export function conclusionFromScore(score: number): PriceEstimate["conclusion"] {
  if (score >= 75) return "strong_up";
  if (score >= 60) return "up";
  if (score >= 45) return "neutral";
  if (score >= 30) return "weak";
  return "price_cut_needed";
}

export function estimatePrice(params: {
  targetApartmentId: string;
  saleTransactions: Transaction[];
  jeonseTransactions: Transaction[];
  saleListings: Listing[];
  jeonseListings: Listing[];
  weights: ModelWeights;
  lowPriceAbsorptionRate?: number;
  comparableWeights?: Record<string, number>;
  presalePrice?: number;
  macroSignalPrice?: number;
  // 대장아파트: 인근 지하철역 1~2개 거리, 역 최근접 + 거래량 최다 단지 실거래
  leaderTransactions?: Transaction[];
  targetToLeaderRatio?: number; // 대상/대장 가격비율 (미입력 시 0.9 기본)
}) {
  // ── 비교단지 보정 실거래가 (시간감쇠 가중치 적용) ────────────────
  const adjustedSales = params.saleTransactions.map((tx) => {
    const basePrice = tx.adjustedPrice ?? normalizeToBGrade(tx.price, tx.grade);
    const comparableW = Math.max(0, params.comparableWeights?.[tx.apartmentId] ?? 1);
    const timeW = temporalWeight(tx.contractDate ?? "");
    return { price: basePrice, weight: comparableW * timeW };
  });
  const weightedSaleTotal = adjustedSales.reduce((sum, item) => sum + item.price * item.weight, 0);
  const weightTotal = adjustedSales.reduce((sum, item) => sum + item.weight, 0);
  const adjustedComparableSalePrice = weightTotal
    ? Math.round(weightedSaleTotal / weightTotal)
    : median(adjustedSales.map((item) => item.price));

  // ── 현재 매매호가 ──────────────────────────────────────────────
  const saleAskingPrice = median(params.saleListings.map((l) => l.adjustedAskingPrice ?? l.askingPrice));

  // ── 전세기반 하방가 ────────────────────────────────────────────
  const jeonseValues = [
    ...params.jeonseTransactions.map((tx) => tx.price * temporalWeight(tx.contractDate ?? "")),
    ...params.jeonseListings.map((l) => l.askingPrice),
  ];
  const expectedJeonsePrice = median(jeonseValues);
  const jeonseFloorPrice = calculateJeonseFloorPrice(expectedJeonsePrice, 0.65);

  // ── 매물소진 신호 ─────────────────────────────────────────────
  const lowPriceAbsorptionRate = params.lowPriceAbsorptionRate ?? 0;
  const priceAnchor = saleAskingPrice || adjustedComparableSalePrice || jeonseFloorPrice;
  const inventorySignalPriceEffect = priceAnchor * (lowPriceAbsorptionRate >= 0.3 ? 1.04 : lowPriceAbsorptionRate >= 0.15 ? 1.02 : 1);

  // ── 분양가 프리미엄 ────────────────────────────────────────────
  const presalePremiumPrice = params.presalePrice ? params.presalePrice * 1.05 : adjustedComparableSalePrice;

  // ── 거시환경 ──────────────────────────────────────────────────
  const macroSignalPrice = params.macroSignalPrice ?? adjustedComparableSalePrice;

  // ── 대장아파트 앵커 ────────────────────────────────────────────
  // 근거: Giacoletti & Parsons (2023, Review of Financial Studies)
  //       인근 대장아파트 가격 spillover 계수 γ = 0.25~0.50
  //       사용자 정의: 지하철역 1~2개 거리 내 역 최근접 + 거래량 최다 단지
  let leaderApartmentAnchorPrice = 0;
  if (params.leaderTransactions && params.leaderTransactions.length > 0) {
    const ratio = params.targetToLeaderRatio ?? 0.9;
    const recentLeaderTxs = params.leaderTransactions
      .map((tx) => ({ price: tx.adjustedPrice ?? normalizeToBGrade(tx.price, tx.grade), timeW: temporalWeight(tx.contractDate ?? "") }))
      .sort((a, b) => b.timeW - a.timeW);
    const leaderWeightedTotal = recentLeaderTxs.reduce((s, tx) => s + tx.price * tx.timeW, 0);
    const leaderWeightTotal = recentLeaderTxs.reduce((s, tx) => s + tx.timeW, 0);
    const leaderMedianPrice = leaderWeightTotal ? leaderWeightedTotal / leaderWeightTotal : median(recentLeaderTxs.map((tx) => tx.price));
    leaderApartmentAnchorPrice = Math.round(leaderMedianPrice * ratio);
  }

  // ── 가중 평균 ─────────────────────────────────────────────────
  const components = [
    { value: adjustedComparableSalePrice, weight: params.weights.adjustedComparableSale },
    { value: saleAskingPrice, weight: params.weights.askingPrice },
    { value: jeonseFloorPrice, weight: params.weights.jeonseFloorPrice },
    { value: inventorySignalPriceEffect, weight: params.weights.inventorySignal },
    { value: presalePremiumPrice, weight: params.weights.presalePremium },
    { value: macroSignalPrice, weight: params.weights.macroSignal },
    { value: leaderApartmentAnchorPrice, weight: leaderApartmentAnchorPrice > 0 ? (params.weights.leaderApartmentAnchor ?? 0) : 0 },
  ].filter((c) => c.value > 0 && c.weight > 0);

  const activeWeight = components.reduce((sum, c) => sum + c.weight, 0);
  const weighted = activeWeight ? components.reduce((sum, c) => sum + c.value * c.weight, 0) / activeWeight : 0;

  const expectedSaleMid = Math.round(weighted || saleAskingPrice || adjustedComparableSalePrice || 0);
  const expectedSaleMin = Math.round(expectedSaleMid * 0.97);
  const expectedSaleMax = Math.round(expectedSaleMid * 1.03);
  const expectedJeonseMid = Math.round(expectedJeonsePrice) || 0;

  // ── upsideScore (상승 가능성) ─────────────────────────────────
  const recentTxCount = params.saleTransactions.filter((tx) => temporalWeight(tx.contractDate ?? "") >= 1.2).length;
  const leaderSignalBoost = leaderApartmentAnchorPrice > 0 && leaderApartmentAnchorPrice > (adjustedComparableSalePrice || saleAskingPrice) ? 5 : 0;
  const upsideScore = Math.min(100, Math.round(
    45
    + lowPriceAbsorptionRate * 50
    + (recentTxCount >= 3 ? 10 : recentTxCount >= 1 ? 5 : 0)
    + (params.saleListings.length >= 2 ? 5 : 0)
    + leaderSignalBoost
  ));

  // ── confidenceScore (신뢰도) ──────────────────────────────────
  const totalTxCount = params.saleTransactions.length + params.jeonseTransactions.length;
  const recentTxBonus = params.saleTransactions.filter((tx) => temporalWeight(tx.contractDate ?? "") >= 1.2).length * 8;
  const confidenceScore = Math.min(100, Math.round(
    totalTxCount * 6
    + recentTxBonus
    + params.saleListings.length * 4
    + (leaderApartmentAnchorPrice > 0 ? 10 : 0)
    + (activeWeight >= 0.9 ? 10 : 0)
  ));

  // ── 이유/경고 메시지 ─────────────────────────────────────────
  const reasonSummary = [
    adjustedComparableSalePrice > 0 ? "비교단지 보정 실거래가(시간감쇠 가중치 적용)를 반영했습니다." : null,
    saleAskingPrice > 0 ? "현재 매매호가를 반영했습니다." : null,
    jeonseFloorPrice > 0 ? "전세기반 하방가격을 반영했습니다." : null,
    lowPriceAbsorptionRate >= 0.15 ? "저가매물 소진율을 상승 신호로 반영했습니다." : null,
    leaderApartmentAnchorPrice > 0 ? "인근 대장아파트 실거래가 앵커를 반영했습니다. (Giacoletti & Parsons 2023 spillover γ 적용)" : null,
  ].filter(Boolean) as string[];

  const warnings = [
    activeWeight < 0.8 ? "일부 산식 구성값이 없어 사용 가능한 항목 기준으로 환산했습니다." : null,
    leaderApartmentAnchorPrice === 0 && (params.weights.leaderApartmentAnchor ?? 0) > 0 ? "대장아파트가 미설정되어 해당 구성요소가 제외됐습니다. 비교단지 관리 > 대장아파트 설정을 확인하세요." : null,
    params.saleTransactions.filter((tx) => temporalWeight(tx.contractDate ?? "") < 1.0).length > params.saleTransactions.length * 0.5 ? "실거래 데이터 대부분이 6개월 초과로 신뢰도가 낮습니다." : null,
    "사라진 매물은 거래완료가 아니라 소진추정입니다.",
  ].filter(Boolean) as string[];

  const estimate: PriceEstimate = {
    id: `estimate_${params.targetApartmentId}_${Date.now()}`,
    targetApartmentId: params.targetApartmentId,
    estimateDate: new Date().toISOString().slice(0, 10),
    adjustedComparableSalePrice,
    saleAskingPrice,
    jeonseFloorPrice: Math.round(jeonseFloorPrice),
    inventorySignalPrice: Math.round(inventorySignalPriceEffect),
    presalePremiumPrice: Math.round(presalePremiumPrice),
    macroSignalPrice: Math.round(macroSignalPrice),
    leaderApartmentAnchorPrice,
    lowPriceAbsorptionRate,
    expectedSaleMin,
    expectedSaleMid,
    expectedSaleMax,
    expectedJeonseMin: Math.round(expectedJeonseMid * 0.97),
    expectedJeonseMid,
    expectedJeonseMax: Math.round(expectedJeonseMid * 1.03),
    recommendedAskingPrice: calculateRecommendedAskingPrice(expectedSaleMid, lowPriceAbsorptionRate),
    defensePrice: calculateDefensePrice(expectedSaleMid),
    upsideScore,
    confidenceScore,
    conclusion: conclusionFromScore(upsideScore),
    reasonSummary,
    warnings,
    createdAt: new Date().toISOString()
  };
  return estimate;
}

export function summarizeLowPriceAbsorption(previousListings: Listing[], currentListings: Listing[]) {
  const prevLow = getLowPriceListings(previousListings);
  const currentKeys = new Set(currentListings.map((x) => x.listingKey ?? x.id));
  const disappeared = prevLow.filter((x) => !currentKeys.has(x.listingKey ?? x.id));
  return prevLow.length ? disappeared.length / prevLow.length : 0;
}
