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

// ── 지역 레짐(regime) 판별 및 가중치 프로파일 ───────────────────────────
// 서울 중심지와 경기·수도권 외곽은 상승 동인이 다릅니다(첨부 리서치).
//  - 서울: 대장아파트 신고가 리딩 / 상급지 압력 / 호가밴드 정렬이 선행
//  - 경기: 분양권 프리미엄 / 전세갭(실수요 매수전환) / 저가매물 소진이 동력
// ⚠️ 아래 배수는 실증 계수가 아니라 리서치 기반 휴리스틱(prior)입니다. 추후 보정 대상.
export type RegionProfile = "seoul" | "gyeonggi" | "default";

export function regionProfileFromAddress(address?: string): RegionProfile {
  const a = (address ?? "").trim();
  if (!a) return "default";
  if (a.startsWith("서울")) return "seoul";
  if (a.startsWith("경기") || a.startsWith("인천")) return "gyeonggi";
  return "default";
}

// 기존 가격 앵커 가중치에 곱하는 배수. 1.0=변화없음.
const REGION_WEIGHT_MULTIPLIERS: Record<RegionProfile, Partial<Record<keyof ModelWeights, number>>> = {
  // 서울: 대장 신고가·상급지 압력·호가 리딩 강조, 분양권 비중↓
  seoul: {
    leaderApartmentAnchor: 1.4,
    comparableMarketPressure: 1.4,
    askingPrice: 1.2,
    comparableAskingPrice: 1.2,
    presalePremium: 0.7,
  },
  // 경기: 분양권 프리미엄·전세갭·소진율 강조 (풍선효과·실수요 전환)
  gyeonggi: {
    presalePremium: 1.4,
    jeonseFloorPrice: 1.3,
    inventorySignal: 1.3,
    adjustedComparableSale: 1.15,
    leaderApartmentAnchor: 0.85,
  },
  default: {},
};

export function applyRegionProfile(weights: ModelWeights, profile: RegionProfile): ModelWeights {
  const mult = REGION_WEIGHT_MULTIPLIERS[profile];
  const out = { ...weights };
  (Object.keys(mult) as (keyof ModelWeights)[]).forEach((k) => {
    out[k] = (out[k] ?? 0) * (mult[k] ?? 1);
  });
  return out;
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
  targetSaleTransactions: Transaction[];
  saleTransactions: Transaction[];
  jeonseTransactions: Transaction[];
  saleListings: Listing[];
  comparableSaleListings?: Listing[];
  jeonseListings: Listing[];
  targetArea: number;
  locationPremiumRate?: number;
  comparableLocationAdjustments?: Record<string, number>;
  comparableMarketPressureRate?: number;
  weights: ModelWeights;
  lowPriceAbsorptionRate?: number;
  comparableWeights?: Record<string, number>;
  presalePrice?: number;
  macroSignalPrice?: number;
  leaderTransactions?: Transaction[];
  targetToLeaderRatio?: number;
  regionProfile?: RegionProfile;
}) {
  const targetArea = params.targetArea > 0 ? params.targetArea : 84;
  // 지역 레짐에 맞춰 가격 앵커 가중치 재조정 (서울/경기 상승 동인 차이 반영)
  const regionProfile = params.regionProfile ?? "default";
  const weights = applyRegionProfile(params.weights, regionProfile);
  const toTargetAreaPrice = (price: number, area?: number) => {
    if (!price || !area || area <= 0) return price;
    return Math.round((price / area) * targetArea);
  };
  const areaFitWeight = (area?: number) => {
    if (!area || area <= 0) return 0.85;
    const diff = Math.abs(area - targetArea) / targetArea;
    if (diff <= 0.03) return 1.25;
    if (diff <= 0.10) return 1.0;
    if (diff <= 0.20) return 0.8;
    return 0.6;
  };

  // ── 대상단지 실거래가 (선택 평형 기준, 면적 불일치 시 ㎡당가 환산) ───────
  const adjustedTargetSales = params.targetSaleTransactions.map((tx) => {
    const basePrice = tx.adjustedPrice ?? normalizeToBGrade(tx.price, tx.grade);
    return {
      price: toTargetAreaPrice(basePrice, tx.exclusiveArea),
      weight: temporalWeight(tx.contractDate ?? "") * areaFitWeight(tx.exclusiveArea),
    };
  });
  const targetSaleWeightTotal = adjustedTargetSales.reduce((s, x) => s + x.weight, 0);
  const targetSalePrice = targetSaleWeightTotal
    ? Math.round(adjustedTargetSales.reduce((s, x) => s + x.price * x.weight, 0) / targetSaleWeightTotal)
    : median(adjustedTargetSales.map((x) => x.price));

  // ── 비교단지 보정 실거래가 (시간감쇠 가중치) ─────────────────────
  const comparableLocationAdjustment = (apartmentId: string) => {
    // 양수 = 비교단지가 대상보다 상급지 → 비교단지 가격을 대상 기준으로 낮춰 환산
    // 음수 = 비교단지가 대상보다 하급지 → 비교단지 가격을 대상 기준으로 높여 환산
    const rate = params.comparableLocationAdjustments?.[apartmentId] ?? 0;
    return Math.min(0.12, Math.max(-0.12, rate));
  };
  const adjustedComparablePrice = (price: number, apartmentId: string) => {
    const rate = comparableLocationAdjustment(apartmentId);
    return Math.round(price * (1 - rate));
  };

  const adjustedSales = params.saleTransactions.map((tx) => {
    const basePrice = tx.adjustedPrice ?? normalizeToBGrade(tx.price, tx.grade);
    const comparableW = Math.max(0, params.comparableWeights?.[tx.apartmentId] ?? 1);
    const timeW = temporalWeight(tx.contractDate ?? "");
    const areaPrice = toTargetAreaPrice(basePrice, tx.exclusiveArea);
    return { price: adjustedComparablePrice(areaPrice, tx.apartmentId), weight: comparableW * timeW * areaFitWeight(tx.exclusiveArea) };
  });
  const weightedSaleTotal = adjustedSales.reduce((s, x) => s + x.price * x.weight, 0);
  const weightTotal = adjustedSales.reduce((s, x) => s + x.weight, 0);
  const adjustedComparableSalePrice = weightTotal
    ? Math.round(weightedSaleTotal / weightTotal)
    : median(adjustedSales.map((x) => x.price));

  // ── 현재 매매호가 ────────────────────────────────────────────────
  const saleAskingPrice = median(params.saleListings.map((l) => toTargetAreaPrice(l.adjustedAskingPrice ?? l.askingPrice, l.exclusiveArea)));

  // ── 비교단지 현재 매매호가 (선택 평형 없으면 ㎡당가 환산) ───────────────
  const comparableAskingPrice = median((params.comparableSaleListings ?? []).map((l) => {
    const areaPrice = toTargetAreaPrice(l.adjustedAskingPrice ?? l.askingPrice, l.exclusiveArea);
    return adjustedComparablePrice(areaPrice, l.apartmentId);
  }));

  // ── 전세기반 하방가 ──────────────────────────────────────────────
  // 전세 거래가: 가중 평균(시간감쇠) 별도 계산 — 호가와 혼합 금지
  const jeonseRatio = deriveJeonseRatio([...params.targetSaleTransactions, ...params.saleTransactions], params.jeonseTransactions);
  let weightedJeonsePrice = 0;
  if (params.jeonseTransactions.length > 0) {
    const jTxs = params.jeonseTransactions.map((tx) => ({
      price: toTargetAreaPrice(tx.price, tx.exclusiveArea),
      w: temporalWeight(tx.contractDate ?? "") * areaFitWeight(tx.exclusiveArea),
    }));
    const jWTotal = jTxs.reduce((s, x) => s + x.w, 0);
    weightedJeonsePrice = jWTotal ? jTxs.reduce((s, x) => s + x.price * x.w, 0) / jWTotal : 0;
  }
  const jeonseAskingMedian = median(params.jeonseListings.map((l) => toTargetAreaPrice(l.askingPrice, l.exclusiveArea)));
  // 거래가와 호가 중 가용한 값으로 전세가 추정 (둘 다 있으면 평균)
  const expectedJeonsePrice =
    weightedJeonsePrice > 0 && jeonseAskingMedian > 0
      ? (weightedJeonsePrice + jeonseAskingMedian) / 2
      : weightedJeonsePrice || jeonseAskingMedian;
  const jeonseFloorPrice = calculateJeonseFloorPrice(expectedJeonsePrice, jeonseRatio);

  // ── 매물소진 신호 ─────────────────────────────────────────────────
  const lowPriceAbsorptionRate = params.lowPriceAbsorptionRate ?? 0;
  const priceAnchor = targetSalePrice || saleAskingPrice || adjustedComparableSalePrice || comparableAskingPrice || jeonseFloorPrice;
  const inventorySignalPriceEffect = priceAnchor * (
    lowPriceAbsorptionRate >= 0.3 ? 1.04
    : lowPriceAbsorptionRate >= 0.15 ? 1.02
    : 1
  );

  // ── 분양가 프리미엄 ──────────────────────────────────────────────
  // 고정 5% 대신: 비교단지 대비 분양가 비율로 동적 산출
  let presalePremiumPrice = targetSalePrice || adjustedComparableSalePrice;
  if (params.presalePrice && params.presalePrice > 0) {
    const marketAnchor = targetSalePrice || adjustedComparableSalePrice || comparableAskingPrice;
    const premiumRatio = marketAnchor > 0
      ? marketAnchor / params.presalePrice  // 실거래 대비 분양가 비율
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
      price: toTargetAreaPrice(tx.adjustedPrice ?? normalizeToBGrade(tx.price, tx.grade), tx.exclusiveArea),
      w: temporalWeight(tx.contractDate ?? "") * areaFitWeight(tx.exclusiveArea),
    }));
    const lWTotal = lTxs.reduce((s, x) => s + x.w, 0);
    const leaderWeightedPrice = lWTotal
      ? lTxs.reduce((s, x) => s + x.price * x.w, 0) / lWTotal
      : median(lTxs.map((x) => x.price));
    leaderApartmentAnchorPrice = Math.round(leaderWeightedPrice * ratio);
  }

  // ── 입지 프리미엄/디스카운트 ─────────────────────────────────────
  const locationPremiumRate = Math.min(0.08, Math.max(-0.08, params.locationPremiumRate ?? 0));
  const locationAnchor = targetSalePrice || adjustedComparableSalePrice || saleAskingPrice || comparableAskingPrice;
  const locationPremiumPrice = locationAnchor > 0 ? Math.round(locationAnchor * (1 + locationPremiumRate)) : 0;

  // ── 비교단지 상·하급지 압력 ─────────────────────────────────────
  // 상급지 비교단지가 많으면 대상의 키 맞추기/가격 전이 가능성을 별도 상승압력으로,
  // 하급지 비교단지가 많으면 시장 눈높이를 낮추는 압력으로 제한적으로 반영합니다.
  const comparableMarketPressureRate = Math.min(0.05, Math.max(-0.05, params.comparableMarketPressureRate ?? 0));
  const comparablePressureAnchor = targetSalePrice || adjustedComparableSalePrice || comparableAskingPrice || saleAskingPrice;
  const comparableMarketPressurePrice = comparablePressureAnchor > 0 ? Math.round(comparablePressureAnchor * (1 + comparableMarketPressureRate)) : 0;

  // ── 가중 평균 (활성 컴포넌트만) ──────────────────────────────────
  const components = [
    { value: targetSalePrice, weight: weights.targetSale ?? 0 },
    { value: adjustedComparableSalePrice, weight: weights.adjustedComparableSale ?? 0 },
    { value: comparableAskingPrice, weight: weights.comparableAskingPrice ?? 0 },
    { value: saleAskingPrice, weight: weights.askingPrice ?? 0 },
    { value: jeonseFloorPrice, weight: weights.jeonseFloorPrice ?? 0 },
    { value: inventorySignalPriceEffect, weight: weights.inventorySignal ?? 0 },
    { value: presalePremiumPrice, weight: weights.presalePremium ?? 0 },
    { value: macroSignalPrice, weight: macroSignalPrice > 0 ? (weights.macroSignal ?? 0) : 0 },
    { value: leaderApartmentAnchorPrice, weight: leaderApartmentAnchorPrice > 0 ? (weights.leaderApartmentAnchor ?? 0) : 0 },
    { value: locationPremiumPrice, weight: locationPremiumPrice > 0 ? (weights.locationPremium ?? 0) : 0 },
    { value: comparableMarketPressurePrice, weight: comparableMarketPressurePrice > 0 ? (weights.comparableMarketPressure ?? 0) : 0 },
  ].filter((c) => c.value > 0 && c.weight > 0);

  const activeWeight = components.reduce((s, c) => s + c.weight, 0);
  const weighted = activeWeight ? components.reduce((s, c) => s + c.value * c.weight, 0) / activeWeight : 0;

  const expectedSaleMid = Math.round(weighted || targetSalePrice || saleAskingPrice || adjustedComparableSalePrice || comparableAskingPrice || 0);
  const expectedSaleMin = Math.round(expectedSaleMid * 0.97);
  const expectedSaleMax = Math.round(expectedSaleMid * 1.03);
  const expectedJeonseMid = Math.round(expectedJeonsePrice) || 0;

  // ── upsideScore: 데이터 없으면 0에서 시작 (기저값 45 제거) ────────
  const hasMinData = params.targetSaleTransactions.length > 0 || params.saleTransactions.length > 0 || params.saleListings.length >= 2 || (params.comparableSaleListings ?? []).length >= 2;
  const recentTxCount = [...params.targetSaleTransactions, ...params.saleTransactions].filter((tx) => temporalWeight(tx.contractDate ?? "") >= 1.1).length;
  const leaderBoost = leaderApartmentAnchorPrice > 0 && leaderApartmentAnchorPrice > (adjustedComparableSalePrice || saleAskingPrice) ? 5 : 0;
  const upsideScore = hasMinData
    ? Math.min(100, Math.round(
        40  // 데이터 있을 때의 기저값 (이전 45에서 하향)
        + lowPriceAbsorptionRate * 50
        + (recentTxCount >= 3 ? 10 : recentTxCount >= 1 ? 5 : 0)
        + (params.saleListings.length >= 2 ? 5 : 0)
        + (comparableMarketPressureRate > 0 ? Math.round(comparableMarketPressureRate * 100) : 0)
        + (comparableMarketPressureRate < 0 ? Math.round(comparableMarketPressureRate * 50) : 0)
        + leaderBoost
      ))
    : 0;

  // ── confidenceScore ───────────────────────────────────────────────
  const totalTxCount = params.targetSaleTransactions.length + params.saleTransactions.length + params.jeonseTransactions.length;
  const recentTxBonus = [...params.targetSaleTransactions, ...params.saleTransactions].filter((tx) => temporalWeight(tx.contractDate ?? "") >= 1.1).length * 8;
  const confidenceScore = Math.min(100, Math.round(
    totalTxCount * 5
    + recentTxBonus
    + (params.saleListings.length + (params.comparableSaleListings ?? []).length) * 3
    + (leaderApartmentAnchorPrice > 0 ? 10 : 0)
    + (activeWeight >= 0.8 ? 10 : 0)
    + (jeonseFloorPrice > 0 ? 5 : 0)
  ));

  // ── 이유/경고 ────────────────────────────────────────────────────
  const reasonSummary = [
    targetSalePrice > 0 ? "대상단지 실거래가를 선택 평형 기준으로 반영했습니다." : null,
    adjustedComparableSalePrice > 0 ? "비교단지 보정 실거래가를 선택 평형 기준으로 반영했습니다." : null,
    comparableAskingPrice > 0 ? "비교단지 현재 호가를 선택 평형 기준으로 반영했습니다." : null,
    saleAskingPrice > 0 ? "현재 매매호가를 반영했습니다." : null,
    jeonseFloorPrice > 0 ? `전세기반 하방가를 반영했습니다. (전세가율 ${Math.round(jeonseRatio * 100)}% ${jeonseRatio !== 0.65 ? "실측" : "기본값"})` : null,
    lowPriceAbsorptionRate >= 0.15 ? "저가매물 소진율을 상승 신호로 반영했습니다." : null,
    leaderApartmentAnchorPrice > 0 ? "인근 대장아파트 실거래가 앵커를 반영했습니다." : null,
    locationPremiumPrice > 0 && locationPremiumRate !== 0 ? `대상 자체 입지 보정률 ${Math.round(locationPremiumRate * 100)}%를 반영했습니다.` : null,
    comparableMarketPressurePrice > 0 && comparableMarketPressureRate !== 0 ? `비교단지 상·하급지 압력 ${Math.round(comparableMarketPressureRate * 100)}%를 반영했습니다.` : null,
    regionProfile === "seoul" ? "서울 레짐: 대장 신고가·상급지 압력·호가 리딩 가중을 강조했습니다." : null,
    regionProfile === "gyeonggi" ? "경기·수도권 레짐: 분양권 프리미엄·전세갭·저가매물 소진 가중을 강조했습니다." : null,
  ].filter(Boolean) as string[];

  const warnings = [
    !hasMinData ? "실거래·호가 데이터가 없어 가격 추정의 신뢰도가 매우 낮습니다." : null,
    activeWeight < 0.8 ? "일부 산식 구성값이 없어 사용 가능한 항목 기준으로 환산했습니다." : null,
    leaderApartmentAnchorPrice === 0 && (weights.leaderApartmentAnchor ?? 0) > 0 ? "대장아파트가 미설정되어 해당 구성요소가 제외됐습니다." : null,
    params.saleTransactions.filter((tx) => temporalWeight(tx.contractDate ?? "") < 1.0).length > params.saleTransactions.length * 0.5
      ? "실거래 데이터 대부분이 6개월 초과로 신뢰도가 낮습니다." : null,
    macroSignalPrice === 0 && weights.macroSignal > 0 ? "거시환경 가격을 입력하지 않아 해당 가중치가 제외됐습니다." : null,
    params.targetSaleTransactions.length === 0 ? "대상단지 매매/분양권 실거래가 없어 대상 실거래 앵커가 제외됐습니다." : null,
    (params.comparableSaleListings ?? []).length === 0 ? "비교단지 호가가 없어 비교 호가 앵커가 제외됐습니다." : null,
    "사라진 매물은 거래완료가 아니라 소진추정입니다.",
  ].filter(Boolean) as string[];

  const estimate: PriceEstimate = {
    id: `estimate_${params.targetApartmentId}_${Date.now()}`,
    targetApartmentId: params.targetApartmentId,
    estimateDate: new Date().toISOString().slice(0, 10),
    targetSalePrice,
    adjustedComparableSalePrice,
    comparableAskingPrice,
    saleAskingPrice,
    jeonseFloorPrice: Math.round(jeonseFloorPrice),
    inventorySignalPrice: Math.round(inventorySignalPriceEffect),
    presalePremiumPrice: Math.round(presalePremiumPrice),
    macroSignalPrice: Math.round(macroSignalPrice),
    leaderApartmentAnchorPrice,
    locationPremiumPrice,
    comparableMarketPressurePrice,
    comparableLocationAdjustmentRate: comparableMarketPressureRate,
    selectedArea: targetArea,
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
