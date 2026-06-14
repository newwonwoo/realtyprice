import type { Listing } from "@/types/listing";
import type { ModelWeights, PriceEstimate } from "@/types/model";
import type { Transaction } from "@/types/transaction";
import { normalizeToBGrade } from "./grade";
import { median, getLowPriceListings } from "./inventory";

// 거래일 기준 시간감쇠 가중치 (Hedonic Pricing, Rosen 1974 + USPAP)
// ≤3mo: 1.3 (과거 1.5 → 단일 이상 거래 편향 방지를 위해 하향)
function temporalWeight(contractDate: string): number {
  const txDate = new Date(contractDate);
  if (isNaN(txDate.getTime())) return 1.0;
  const monthsAgo = (Date.now() - txDate.getTime()) / (1000 * 60 * 60 * 24 * 30.44);
  if (monthsAgo <= 3) return 1.3;
  if (monthsAgo <= 6) return 1.1;
  if (monthsAgo <= 12) return 1.0;
  return 0.7;
}

// 전세가율 동적 계산: 실거래 데이터 있으면 실측값, 없으면 지역 기본값 사용
// 수도권 외곽(오산·평택·안산 등) ~0.70, 서울·주요 도시 ~0.55~0.65
function deriveJeonseRatio(saleTransactions: Transaction[], jeonseTransactions: Transaction[]): number {
  const recentSales = saleTransactions
    .filter((tx) => temporalWeight(tx.contractDate ?? "") >= 1.0)
    .map((tx) => tx.price);
  const recentJeonse = jeonseTransactions
    .filter((tx) => temporalWeight(tx.contractDate ?? "") >= 1.0)
    .map((tx) => tx.price);

  if (recentSales.length > 0 && recentJeonse.length > 0) {
    const saleMedian = median(recentSales);
    const jeonseMedian = median(recentJeonse);
    if (saleMedian > 0) {
      // 실측 전세가율 범위 제한 (0.40~0.85) — 이상치 방어
      return Math.min(0.85, Math.max(0.40, jeonseMedian / saleMedian));
    }
  }
  return 0.65; // 데이터 없으면 전국 평균 fallback
}

export function calculateJeonseFloorPrice(expectedJeonsePrice: number, jeonseRatio: number) {
  if (!jeonseRatio) return 0;
  return expectedJeonsePrice / jeonseRatio;
}

export function calculateRecommendedAskingPrice(expectedSaleMid: number, lowPriceAbsorptionRate: number) {
  return Math.round(expectedSaleMid * (lowPriceAbsorptionRate >= 0.3 ? 1.05 : 1.03));
}

export function calculateDefensePrice(expectedSaleMid: number) {
  return Math.round(expectedSaleMid * 0.98);
}

export function conclusionFromScore(score: number, hasData: boolean): PriceEstimate["conclusion"] {
  if (!hasData) return "insufficient_data";
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
  leaderTransactions?: Transaction[];
  targetToLeaderRatio?: number;
}) {
  // ── 비교단지 보정 실거래가 (시간감쇠 가중치) ─────────────────────
  const adjustedSales = params.saleTransactions.map((tx) => {
    const basePrice = tx.adjustedPrice ?? normalizeToBGrade(tx.price, tx.grade);
    const comparableW = Math.max(0, params.comparableWeights?.[tx.apartmentId] ?? 1);
    const timeW = temporalWeight(tx.contractDate ?? "");
    return { price: basePrice, weight: comparableW * timeW };
  });
  const weightedSaleTotal = adjustedSales.reduce((s, x) => s + x.price * x.weight, 0);
  const weightTotal = adjustedSales.reduce((s, x) => s + x.weight, 0);
  const adjustedComparableSalePrice = weightTotal
    ? Math.round(weightedSaleTotal / weightTotal)
    : median(adjustedSales.map((x) => x.price));

  // ── 현재 매매호가 ────────────────────────────────────────────────
  const saleAskingPrice = median(params.saleListings.map((l) => l.adjustedAskingPrice ?? l.askingPrice));

  // ── 전세기반 하방가 ──────────────────────────────────────────────
  // 전세 거래가: 가중 평균(시간감쇠) 별도 계산 — 호가와 혼합 금지
  const jeonseRatio = deriveJeonseRatio(params.saleTransactions, params.jeonseTransactions);
  let weightedJeonsePrice = 0;
  if (params.jeonseTransactions.length > 0) {
    const jTxs = params.jeonseTransactions.map((tx) => ({
      price: tx.price,
      w: temporalWeight(tx.contractDate ?? ""),
    }));
    const jWTotal = jTxs.reduce((s, x) => s + x.w, 0);
    weightedJeonsePrice = jWTotal ? jTxs.reduce((s, x) => s + x.price * x.w, 0) / jWTotal : 0;
  }
  const jeonseAskingMedian = median(params.jeonseListings.map((l) => l.askingPrice));
  // 거래가와 호가 중 가용한 값으로 전세가 추정 (둘 다 있으면 평균)
  const expectedJeonsePrice =
    weightedJeonsePrice > 0 && jeonseAskingMedian > 0
      ? (weightedJeonsePrice + jeonseAskingMedian) / 2
      : weightedJeonsePrice || jeonseAskingMedian;
  const jeonseFloorPrice = calculateJeonseFloorPrice(expectedJeonsePrice, jeonseRatio);

  // ── 매물소진 신호 ─────────────────────────────────────────────────
  const lowPriceAbsorptionRate = params.lowPriceAbsorptionRate ?? 0;
  const priceAnchor = saleAskingPrice || adjustedComparableSalePrice || jeonseFloorPrice;
  const inventorySignalPriceEffect = priceAnchor * (
    lowPriceAbsorptionRate >= 0.3 ? 1.04
    : lowPriceAbsorptionRate >= 0.15 ? 1.02
    : 1
  );

  // ── 분양가 프리미엄 ──────────────────────────────────────────────
  // 고정 5% 대신: 비교단지 대비 분양가 비율로 동적 산출
  let presalePremiumPrice = adjustedComparableSalePrice;
  if (params.presalePrice && params.presalePrice > 0) {
    const premiumRatio = adjustedComparableSalePrice > 0
      ? adjustedComparableSalePrice / params.presalePrice  // 실거래 대비 분양가 비율
      : 1.05;
    // 비율 범위 제한 (0.90 ~ 1.30) — 이상치 방어
    presalePremiumPrice = Math.round(params.presalePrice * Math.min(1.30, Math.max(0.90, premiumRatio)));
  }

  // ── 거시환경 ─────────────────────────────────────────────────────
  // macroSignalPrice가 없으면 이 컴포넌트는 가중치 0으로 제외
  const macroSignalPrice = params.macroSignalPrice ?? 0;

  // ── 대장아파트 앵커 ───────────────────────────────────────────────
  // Giacoletti & Parsons (2023, RFS): spillover γ = 0.25~0.50
  let leaderApartmentAnchorPrice = 0;
  if (params.leaderTransactions && params.leaderTransactions.length > 0) {
    const ratio = params.targetToLeaderRatio ?? 0.9;
    const lTxs = params.leaderTransactions.map((tx) => ({
      price: tx.adjustedPrice ?? normalizeToBGrade(tx.price, tx.grade),
      w: temporalWeight(tx.contractDate ?? ""),
    }));
    const lWTotal = lTxs.reduce((s, x) => s + x.w, 0);
    const leaderWeightedPrice = lWTotal
      ? lTxs.reduce((s, x) => s + x.price * x.w, 0) / lWTotal
      : median(lTxs.map((x) => x.price));
    leaderApartmentAnchorPrice = Math.round(leaderWeightedPrice * ratio);
  }

  // ── 가중 평균 (활성 컴포넌트만) ──────────────────────────────────
  const components = [
    { value: adjustedComparableSalePrice, weight: params.weights.adjustedComparableSale },
    { value: saleAskingPrice, weight: params.weights.askingPrice },
    { value: jeonseFloorPrice, weight: params.weights.jeonseFloorPrice },
    { value: inventorySignalPriceEffect, weight: params.weights.inventorySignal },
    { value: presalePremiumPrice, weight: params.weights.presalePremium },
    { value: macroSignalPrice, weight: macroSignalPrice > 0 ? params.weights.macroSignal : 0 },
    { value: leaderApartmentAnchorPrice, weight: leaderApartmentAnchorPrice > 0 ? (params.weights.leaderApartmentAnchor ?? 0) : 0 },
  ].filter((c) => c.value > 0 && c.weight > 0);

  const activeWeight = components.reduce((s, c) => s + c.weight, 0);
  const weighted = activeWeight ? components.reduce((s, c) => s + c.value * c.weight, 0) / activeWeight : 0;

  const expectedSaleMid = Math.round(weighted || saleAskingPrice || adjustedComparableSalePrice || 0);
  const expectedSaleMin = Math.round(expectedSaleMid * 0.97);
  const expectedSaleMax = Math.round(expectedSaleMid * 1.03);
  const expectedJeonseMid = Math.round(expectedJeonsePrice) || 0;

  // ── upsideScore: 데이터 없으면 0에서 시작 (기저값 45 제거) ────────
  const hasMinData = params.saleTransactions.length > 0 || params.saleListings.length >= 2;
  const recentTxCount = params.saleTransactions.filter((tx) => temporalWeight(tx.contractDate ?? "") >= 1.1).length;
  const leaderBoost = leaderApartmentAnchorPrice > 0 && leaderApartmentAnchorPrice > (adjustedComparableSalePrice || saleAskingPrice) ? 5 : 0;
  const upsideScore = hasMinData
    ? Math.min(100, Math.round(
        40  // 데이터 있을 때의 기저값 (이전 45에서 하향)
        + lowPriceAbsorptionRate * 50
        + (recentTxCount >= 3 ? 10 : recentTxCount >= 1 ? 5 : 0)
        + (params.saleListings.length >= 2 ? 5 : 0)
        + leaderBoost
      ))
    : 0;

  // ── confidenceScore ───────────────────────────────────────────────
  const totalTxCount = params.saleTransactions.length + params.jeonseTransactions.length;
  const recentTxBonus = params.saleTransactions.filter((tx) => temporalWeight(tx.contractDate ?? "") >= 1.1).length * 8;
  const confidenceScore = Math.min(100, Math.round(
    totalTxCount * 5
    + recentTxBonus
    + params.saleListings.length * 4
    + (leaderApartmentAnchorPrice > 0 ? 10 : 0)
    + (activeWeight >= 0.8 ? 10 : 0)
    + (jeonseFloorPrice > 0 ? 5 : 0)
  ));

  // ── 이유/경고 ────────────────────────────────────────────────────
  const reasonSummary = [
    adjustedComparableSalePrice > 0 ? "비교단지 보정 실거래가(시간감쇠 가중치 적용)를 반영했습니다." : null,
    saleAskingPrice > 0 ? "현재 매매호가를 반영했습니다." : null,
    jeonseFloorPrice > 0 ? `전세기반 하방가를 반영했습니다. (전세가율 ${Math.round(jeonseRatio * 100)}% ${jeonseRatio !== 0.65 ? "실측" : "기본값"})` : null,
    lowPriceAbsorptionRate >= 0.15 ? "저가매물 소진율을 상승 신호로 반영했습니다." : null,
    leaderApartmentAnchorPrice > 0 ? "인근 대장아파트 실거래가 앵커를 반영했습니다. (Giacoletti & Parsons 2023 spillover γ 적용)" : null,
  ].filter(Boolean) as string[];

  const warnings = [
    !hasMinData ? "실거래·호가 데이터가 없어 가격 추정의 신뢰도가 매우 낮습니다." : null,
    activeWeight < 0.8 ? "일부 산식 구성값이 없어 사용 가능한 항목 기준으로 환산했습니다." : null,
    leaderApartmentAnchorPrice === 0 && (params.weights.leaderApartmentAnchor ?? 0) > 0 ? "대장아파트가 미설정되어 해당 구성요소가 제외됐습니다." : null,
    params.saleTransactions.filter((tx) => temporalWeight(tx.contractDate ?? "") < 1.0).length > params.saleTransactions.length * 0.5
      ? "실거래 데이터 대부분이 6개월 초과로 신뢰도가 낮습니다." : null,
    macroSignalPrice === 0 && params.weights.macroSignal > 0 ? "거시환경 가격을 입력하지 않아 해당 가중치가 제외됐습니다." : null,
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
    conclusion: conclusionFromScore(upsideScore, hasMinData),
    reasonSummary,
    warnings,
    createdAt: new Date().toISOString(),
  };
  return estimate;
}

export function summarizeLowPriceAbsorption(previousListings: Listing[], currentListings: Listing[]) {
  const prevLow = getLowPriceListings(previousListings);
  const currentKeys = new Set(currentListings.map((x) => x.listingKey ?? x.id));
  const disappeared = prevLow.filter((x) => !currentKeys.has(x.listingKey ?? x.id));
  return prevLow.length ? disappeared.length / prevLow.length : 0;
}
