import type { Listing } from "@/types/listing";
import type { ModelWeights, PriceEstimate, ModelFactor } from "@/types/model";
import { formatEok } from "./format";
import type { Transaction } from "@/types/transaction";
import { normalizeToBGrade } from "./grade";
import { median, getLowPriceListings } from "./inventory";

// 거래일 기준 시간감쇠 가중치 (Hedonic Pricing, Rosen 1974 + USPAP)
// 시차(Time-Lag) 리서치 반영: 시장별 정보 동조화 속도가 다르므로 recency 곡선을 차등화.
//  - seoul: 2~4주의 초단기 시차 → 최근거래 가중 ↑, 과거 거래 빠르게 감쇠(stale 가속).
//  - gyeonggi: 4~6주 지연 시차 → 최근 plateau를 넓혀 선행 구간을 길게 인정.
//  - supplyCliff: 공급절벽 장세는 시차가 더 압축 → 최근 가중을 추가 강화.
// ⚠️ 곡선 수치는 리서치 방향 기반 prior(실증 계수 아님). 시계열 누적 시 백테스트 보정.
type TemporalOpts = { profile?: RegionProfile; supplyCliff?: boolean };
function temporalWeight(contractDate: string, opts: TemporalOpts = {}): number {
  const txDate = new Date(contractDate);
  if (isNaN(txDate.getTime())) return 1.0;
  const monthsAgo = (Date.now() - txDate.getTime()) / (1000 * 60 * 60 * 24 * 30.44);
  const profile = opts.profile ?? "default";
  let w: number;
  if (profile === "seoul") {
    // 압축 시차: 최근 1개월 신호 가중 강화, 6개월 초과는 급감
    if (monthsAgo <= 1) w = 1.5;
    else if (monthsAgo <= 3) w = 1.3;
    else if (monthsAgo <= 6) w = 1.0;
    else if (monthsAgo <= 12) w = 0.75;
    else w = 0.55;
  } else if (profile === "gyeonggi") {
    // 지연 시차: 1~3개월 선행 구간을 넓게 인정, 완만한 감쇠
    if (monthsAgo <= 3) w = 1.25;
    else if (monthsAgo <= 6) w = 1.15;
    else if (monthsAgo <= 12) w = 0.95;
    else w = 0.7;
  } else {
    if (monthsAgo <= 3) w = 1.3;
    else if (monthsAgo <= 6) w = 1.1;
    else if (monthsAgo <= 12) w = 1.0;
    else w = 0.7;
  }
  // 공급절벽 장세: 시차 압축 → 최근(≤3mo) 신호를 추가 가중, 오래된 신호는 추가 감쇠
  if (opts.supplyCliff) {
    if (monthsAgo <= 3) w *= 1.15;
    else if (monthsAgo > 12) w *= 0.85;
  }
  return w;
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
// 백테스트 리서치(2013~2024 실거래 다중회귀) 방향성 반영:
//  - 서울: '상급지 동조화/시차 갭'이 지배적 선행요인 → 비교단지 압력·대장 리딩 大↑,
//          호가 리딩 ↑. '전세가율 착시'로 전세 비중 ↓, 역세권/입지는 방어지표라 ↓.
//  - 경기: '서울 최인접지 격차(풍선효과)'가 최대 동력 → 비교단지 압력 ↑. 분양권·소진율 유지.
// ⚠️ 제시된 정확한 %(45/40 등)는 독립 검증 불가한 prior라 방향만 반영하고 극단값은 회피함.
//    불장/하락기 구분(전세 착시·입지 방어 법칙)과 경기 미분양 게이트는 데이터 확보 후 적용 예정.
const REGION_WEIGHT_MULTIPLIERS: Record<RegionProfile, Partial<Record<keyof ModelWeights, number>>> = {
  seoul: {
    comparableMarketPressure: 1.7, // 상급지 동조화/시차 갭 — 백테스트상 압도적 선행요인
    leaderApartmentAnchor: 1.6,    // 상급지 랜드마크 신고가 리딩
    askingPrice: 1.3,              // 상급지/당해지 호가 선행 반영
    comparableAskingPrice: 1.3,
    jeonseFloorPrice: 0.75,        // 전세가율 착시 — 상승장에선 매매가 단독 슈팅
    locationPremium: 0.8,          // 역세권/학군은 상승동인 아닌 하락 방어지표
    presalePremium: 0.7,
  },
  gyeonggi: {
    comparableMarketPressure: 1.5, // 서울 최인접지 격차/풍선효과가 최대 동력
    presalePremium: 1.4,           // 분양권 프리미엄(낙수효과 시작점)
    inventorySignal: 1.3,          // 미분양/거래 소진 (하방저항선 해소)
    adjustedComparableSale: 1.15,
    jeonseFloorPrice: 1.0,         // 소액 갭 — 동력이나 백테스트상 기여도 하향
    locationPremium: 0.85,
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

// ── 공급절벽 모드 (Supply Cliff Override) ────────────────────────────────
// 향후 2년 공급량 < 정상 수요의 50% 수준일 때 사용자가 수동 활성화하는 선택요소.
// 구조적 공급절벽에서는 입지/교통이 상승동인이 아니라 하락 방어지표로 약화되고,
// 전세 소진·호가 lock-in·분양권 희소성이 가격을 지배한다는 가설을 반영.
// ⚠️ 배수는 리서치 기반 prior — 실증 계수가 아니며 데이터 확보 후 보정 대상.
const SUPPLY_CLIFF_MULTIPLIERS: Partial<Record<keyof ModelWeights, number>> = {
  locationPremium: 0.35,          // 입지/교통 = 방어지표로 축소
  comparableMarketPressure: 0.6,  // 비교단지 압력 약화 (시장 기준점 희박)
  adjustedComparableSale: 0.75,   // 공급절벽 이전 과거 거래 신뢰도 하락
  jeonseFloorPrice: 1.6,          // 전세 소진/갭 — 주도 신호
  inventorySignal: 1.7,           // 저가매물 소진 — 주도 신호
  askingPrice: 1.5,               // 호가 lock-in
  comparableAskingPrice: 1.4,
  presalePremium: 1.3,            // 분양권 프리미엄 강화 (신규 공급 희소)
};

export function applySupplyCliff(weights: ModelWeights): ModelWeights {
  const out = { ...weights };
  (Object.keys(SUPPLY_CLIFF_MULTIPLIERS) as (keyof ModelWeights)[]).forEach((k) => {
    out[k] = (out[k] ?? 0) * (SUPPLY_CLIFF_MULTIPLIERS[k] ?? 1);
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
  supplyCliffMode?: boolean;
  supplyPressurePct?: number; // 현재 입주물량 공급압력 % (음수=하락압력, 양수=희소)
}) {
  const targetArea = params.targetArea > 0 ? params.targetArea : 84;
  // 지역 레짐에 맞춰 가격 앵커 가중치 재조정 (서울/경기 상승 동인 차이 반영)
  const regionProfile = params.regionProfile ?? "default";
  const supplyCliffMode = params.supplyCliffMode ?? false;
  let weights = applyRegionProfile(params.weights, regionProfile);
  // 공급절벽 모드(선택): 입지 약화·전세소진/호가 lock-in 강화로 가중치 재편
  if (supplyCliffMode) weights = applySupplyCliff(weights);
  // 지역/장세별 시간감쇠 가중 (서울 압축시차·경기 지연시차·공급절벽 압축)
  const tw = (date?: string) => temporalWeight(date ?? "", { profile: regionProfile, supplyCliff: supplyCliffMode });
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
      weight: tw(tx.contractDate) * areaFitWeight(tx.exclusiveArea),
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
    const timeW = tw(tx.contractDate);
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
      w: tw(tx.contractDate) * areaFitWeight(tx.exclusiveArea),
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
      w: tw(tx.contractDate) * areaFitWeight(tx.exclusiveArea),
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

  // ── upsideScore: 한국 주택시장 특수성 반영 ──────────────────────────
  // 설계 원칙:
  //  - 평균회귀 없음. 서울/수도권은 추세지속형 (주택금융연구 9(1):59-107)
  //  - 학군 프리미엄은 locationPremium·비교단지 실거래에 이미 내재화 → 별도 항목 없음
  //  - 지역 추세 특성은 regionProfile 가중치 배수로 처리 → 여기선 중복 추가 없음
  //  - 전세가율 = 수요/공급 확인 신호 (하방가 앵커와 별개)
  //  - 거래량이 가격에 선행 (Granger 인과, 특히 강남3구)
  const hasMinData = params.targetSaleTransactions.length > 0 || params.saleTransactions.length > 0 || params.saleListings.length >= 2 || (params.comparableSaleListings ?? []).length >= 2;

  // ── 거래량 속도(velocity) — 소진율 대신 "얼마나 빠르게 계약되나" ──────
  // 데이터: 국토부 실거래(일 단위 계약일). 신고기한 = 계약일 30일 이내(과소집계 보정).
  // 3-tier 일평균(rate)으로 정규화 → 창 길이 달라도 비교 가능. 2주가 최고 가중.
  // "데이터 유무에 따라 최소 2주부터": 단기 창이 비면 더 긴 창으로 적응적 폴백.
  // 단지별 가중: 대장단지 최고, 대상단지 높음, 같은급 비교단지는 가중평균(comparableWeights).
  //  → 같은 행정권의 대장이 빠르게 팔리면 속도신호를 더 강하게 끌어올림.
  const LEADER_VELOCITY_W = 1.8;   // 대장단지 — 최고 가중
  const TARGET_VELOCITY_W = 1.2;   // 대상단지 본인
  const COMPARABLE_VELOCITY_CAP = 1.0; // 같은급 비교단지 — 가중평균이되 대장/대상보다 낮게 캡
  const daysAgo = (d?: string) => {
    const t = new Date(d ?? "");
    if (isNaN(t.getTime())) return Infinity;
    return (Date.now() - t.getTime()) / (1000 * 60 * 60 * 24);
  };
  // id로 중복 제거(자기-대장 등) → 여러 그룹에 걸치면 최고 가중 적용
  const velMap = new Map<string, { d: number; w: number }>();
  const addVel = (tx: Transaction, w: number) => {
    const d = daysAgo(tx.contractDate);
    if (!isFinite(d)) return;
    const prev = velMap.get(tx.id);
    if (!prev || w > prev.w) velMap.set(tx.id, { d, w });
  };
  params.targetSaleTransactions.forEach((tx) => addVel(tx, TARGET_VELOCITY_W));
  params.saleTransactions.forEach((tx) =>
    addVel(tx, Math.min(COMPARABLE_VELOCITY_CAP, Math.max(0, params.comparableWeights?.[tx.apartmentId] ?? 1)))
  );
  (params.leaderTransactions ?? []).forEach((tx) => addVel(tx, LEADER_VELOCITY_W));
  const velTxs = Array.from(velMap.values());
  // 가중 거래량(점수용) — 단지 가중 합. 표시용 raw 건수는 별도.
  const wsum = (maxDays: number) => velTxs.filter((x) => x.d <= maxDays).reduce((s, x) => s + x.w, 0);
  const rawCount = (maxDays: number) => velTxs.filter((x) => x.d <= maxDays).length;
  const n14 = wsum(14), n30 = wsum(30), n90 = wsum(90);
  const raw14 = rawCount(14), raw30 = rawCount(30), raw90 = rawCount(90);
  // 신고지연 보정: 최근 14일은 평균 절반가량만 신고 도착 → ×2로 실제 속도 추정
  const r14 = (n14 * 2) / 14;   // 일평균(보정)
  const r30 = n30 / 30;
  const r90 = Math.max(n90 / 90, 1 / 365); // baseline (0 나눗셈 방지)
  const accel14 = r14 / r90;    // 2주 속도 / 3개월 기준선 (>1 가속)
  const accel30 = r30 / r90;    // 1개월 속도 / 기준선
  // 거래 속도가 (제거된) 저가소진율을 대체 → 배점을 최대 25로 상향 흡수.
  let volumeMomentumScore: number;
  if (n14 > 0 || n30 > 0) {
    // 단기 데이터 존재 → 가속도 기반 (2주 최대 15 : 1개월 최대 7 : 기준활발 최대 3)
    volumeMomentumScore =
        (accel14 >= 1.3 ? 15 : accel14 >= 1.0 ? 10 : accel14 >= 0.5 ? 4 : 0)  // 2주
      + (accel30 >= 1.2 ? 7 : accel30 >= 0.9 ? 4 : 0)                          // 1개월
      + (n90 >= 5 ? 3 : 0);                                                     // 기준 거래 활발
  } else {
    // 단기 창 비어있음 → 3개월 절대 건수로 폴백(속도 신호 약화)
    volumeMomentumScore = n90 >= 3 ? 5 : n90 >= 1 ? 2 : 0;
  }

  // 전세가율 수요/공급 신호: 높을수록 수요 우위, 낮을수록 공급 여력 있음
  // 기준: ≥0.70 수요압력(+7), ≥0.60 보통(+3), ≥0.50 중립(0), <0.50 공급여력(-4)
  const jeonseSupplyDemandScore =
    jeonseRatio >= 0.70 ? 7
    : jeonseRatio >= 0.60 ? 3
    : jeonseRatio >= 0.50 ? 0
    : -4;

  // (저가소진율 제거: 거래 속도(velocity)가 "얼마나 빠르게 팔리나"를 대체. 배점은 속도로 이전.)
  // 대장 앵커 상방압력
  const leaderBoost = leaderApartmentAnchorPrice > 0 && leaderApartmentAnchorPrice > (adjustedComparableSalePrice || saleAskingPrice) ? 6 : 0;

  // 비교단지 상·하급지 압력
  const comparablePressureScore =
    comparableMarketPressureRate > 0 ? Math.round(comparableMarketPressureRate * 120)
    : comparableMarketPressureRate < 0 ? Math.round(comparableMarketPressureRate * 60)
    : 0;

  // 입주물량 공급압력 점수: 국토부 3개월 합산 입주예정 세대 기준
  // -5%→-8점, -3%→-5점, -1%→-2점, 0%→0점, +2%→+4점, +3%→+6점
  const rawSupplyPct = params.supplyPressurePct;
  const supplyPressureScore =
    rawSupplyPct == null ? 0
    : rawSupplyPct >= 3 ? 6
    : rawSupplyPct >= 2 ? 4
    : rawSupplyPct >= 0 ? 0
    : rawSupplyPct >= -1 ? -2
    : rawSupplyPct >= -3 ? -5
    : -8;

  const UPSIDE_BASE = 35; // 기저값 (데이터 존재 시 중립 출발점)
  const upsideScore = hasMinData
    ? Math.min(100, Math.round(
        UPSIDE_BASE
        + volumeMomentumScore      // 거래 속도 (최대 25)
        + jeonseSupplyDemandScore  // 전세 수요/공급 확인 (-4~+7)
        + leaderBoost              // 대장 앵커 상방압력 (+6)
        + comparablePressureScore  // 비교단지 압력 (-3~+6)
        + supplyPressureScore      // 입주물량 공급압력 (-8~+6)
      ))
    : 0;

  // ── 가격추정 모델 전체 분해 (예상가 앵커 + 상승가능성 점수, 단일 표) ──────
  const activeWeightPct = (w: number) => (activeWeight > 0 ? Math.round((w / activeWeight) * 100) : 0);
  const priceFactor = (
    label: string, source: string, value: number, weight: number
  ): ModelFactor => ({
    group: "price", label, source,
    rawValue: formatEok(value),
    weight: weight > 0 ? `가중 ${activeWeightPct(weight)}%` : "—",
    result: value > 0 && weight > 0 ? formatEok(value) : "제외",
    active: value > 0 && weight > 0,
  });
  const accelStr = (n14 > 0 || n30 > 0) ? `가속 ${accel14.toFixed(1)}배(2주)·${accel30.toFixed(1)}배(1개월)` : "단기 거래 없음";
  const modelBreakdown: ModelFactor[] = hasMinData
    ? [
        // ── 예상가(매매) 앵커 ──
        priceFactor("대상단지 실거래가", "가격 — 대상단지 매매·분양권 실거래", targetSalePrice, weights.targetSale ?? 0),
        priceFactor("비교단지 보정 실거래가", "가격 — 비교단지 매매 실거래(상·하급지 보정)", adjustedComparableSalePrice, weights.adjustedComparableSale ?? 0),
        priceFactor("비교단지 현재 호가", "가격 — 비교단지 매물 호가", comparableAskingPrice, weights.comparableAskingPrice ?? 0),
        priceFactor("대상단지 현재 호가", "가격 — 대상단지 매물 호가", saleAskingPrice, weights.askingPrice ?? 0),
        priceFactor("전세기반 하방가", "가격 — 전세 실거래가(보증금) ÷ 전세가율", jeonseFloorPrice, weights.jeonseFloorPrice ?? 0),
        priceFactor("매물 소진 반영가", "매물 수 — 저가매물 소진율(스냅샷)", inventorySignalPriceEffect, weights.inventorySignal ?? 0),
        priceFactor("분양가 프리미엄", "가격 — 분양가 대비 실거래 시세비율", presalePremiumPrice, weights.presalePremium ?? 0),
        priceFactor("거시환경", "가격 — 사용자 입력 거시 가격", macroSignalPrice, macroSignalPrice > 0 ? (weights.macroSignal ?? 0) : 0),
        priceFactor("대장아파트 앵커", "가격 — 대장 실거래 환산가 × 비율", leaderApartmentAnchorPrice, leaderApartmentAnchorPrice > 0 ? (weights.leaderApartmentAnchor ?? 0) : 0),
        priceFactor("대상 입지 보정", "입지 점수 — 역세권·학군 등", locationPremiumPrice, locationPremiumPrice > 0 ? (weights.locationPremium ?? 0) : 0),
        priceFactor("비교단지 상·하급지 압력", "등급(가격대) — 비교단지 등급차", comparableMarketPressurePrice, comparableMarketPressurePrice > 0 ? (weights.comparableMarketPressure ?? 0) : 0),
        // ── 상승가능성 점수 ──
        { group: "upside", label: "기저값", source: "— (중립 출발점)", rawValue: "—", weight: `+${UPSIDE_BASE}`, result: `${UPSIDE_BASE}점`, active: true },
        { group: "upside", label: "거래 속도", source: "거래량 — 매매 실거래 계약 건수·계약일 (대장1.8>대상1.2>비교≤1.0 가중)", rawValue: `${accelStr} · 2주 ${raw14}건/1개월 ${raw30}건/3개월 ${raw90}건`, weight: "최대 +25", result: `${volumeMomentumScore >= 0 ? "+" : ""}${volumeMomentumScore}점`, active: volumeMomentumScore !== 0 },
        { group: "upside", label: "전세 수요/공급", source: "가격 — 전세 실거래가 ÷ 매매 실거래가(전세가율)", rawValue: `전세가율 ${Math.round(jeonseRatio * 100)}%`, weight: "-4~+7", result: `${jeonseSupplyDemandScore >= 0 ? "+" : ""}${jeonseSupplyDemandScore}점`, active: true },
        { group: "upside", label: "대장 앵커 상방압력", source: "가격 — 대장 환산가 vs 비교단지 시세", rawValue: leaderApartmentAnchorPrice > 0 ? (leaderBoost > 0 ? "대장 > 비교 시세" : "대장 ≤ 비교 시세") : "대장 미설정", weight: "0/+6", result: `+${leaderBoost}점`, active: leaderBoost > 0 },
        { group: "upside", label: "비교단지 상·하급지 압력", source: "등급(가격대) — 비교단지 등급차 → 압력률", rawValue: `${Math.round(comparableMarketPressureRate * 100)}%`, weight: "-3~+6", result: `${comparablePressureScore >= 0 ? "+" : ""}${comparablePressureScore}점`, active: comparablePressureScore !== 0 },
        { group: "upside", label: "입주물량 공급압력", source: "국토부 입주예정물량 — 3개월 합산 세대", rawValue: rawSupplyPct != null ? `공급영향 ${rawSupplyPct > 0 ? "+" : ""}${rawSupplyPct}%` : "미조회", weight: "-8~+6", result: `${supplyPressureScore >= 0 ? "+" : ""}${supplyPressureScore}점`, active: rawSupplyPct != null },
      ]
    : [];

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
    volumeMomentumScore >= 6 ? `거래 속도가 빠릅니다 (최근2주 ${raw14}건·1개월 ${raw30}건·3개월 ${raw90}건, 대장 가중반영, +${volumeMomentumScore}점).` : null,
    jeonseSupplyDemandScore > 0 ? `전세가율 ${Math.round(jeonseRatio * 100)}% — 수요 우위 신호.` : jeonseSupplyDemandScore < 0 ? `전세가율 ${Math.round(jeonseRatio * 100)}% — 공급 여력 있음.` : null,
    supplyCliffMode ? "공급절벽 모드 ON: 입지 비중을 낮추고 전세 소진·호가 lock-in 중심으로 가중치를 재편했습니다." : null,
    supplyPressureScore > 0 ? `입주물량 희소 (공급영향 +${rawSupplyPct}%) — 공급압력 상승 반영 (+${supplyPressureScore}점).` : supplyPressureScore < 0 ? `입주물량 과다 (공급영향 ${rawSupplyPct}%) — 하락압력 반영 (${supplyPressureScore}점).` : null,
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
    modelBreakdown,
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
