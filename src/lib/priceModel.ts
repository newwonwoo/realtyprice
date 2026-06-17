import type { Listing } from "@/types/listing";
import type { ModelWeights, PriceEstimate } from "@/types/model";
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

  // ── upsideScore: 한국 주택시장 특수성 반영 (추세지속 모델) ─────────
  // 리서치 근거:
  //  - 서울은 positive momentum (추세지속), 지방 일부만 평균회귀 (주택금융연구 9(1):59-107)
  //  - 레짐스위칭 2-레짐: 서울 도심/강남형=boom 지속형, 외곽=침체 지속형 (Markov switching)
  //  - 학군 자본화: 20~30% 프리미엄 (서울 분위수 회귀, 저가 구간에서 강함)
  //  - 계단식 상승: 전세 신용 메커니즘 주도 — 금리↓ → 전세레버리지↑ → 매매가 계단상승
  //  - 거래량이 가격에 선행 (Granger 인과, 특히 강남3구)
  // ⚠️ 계수는 리서치 방향 기반 prior. 백테스트 보정 필요.
  const hasMinData = params.targetSaleTransactions.length > 0 || params.saleTransactions.length > 0 || params.saleListings.length >= 2 || (params.comparableSaleListings ?? []).length >= 2;

  // 거래량 모멘텀: 최근 3개월 거래 수 (가격 선행지표, 강남형에서 특히 강함)
  const allSaleTxs = [...params.targetSaleTransactions, ...params.saleTransactions];
  const recentTxCount = allSaleTxs.filter((tx) => temporalWeight(tx.contractDate ?? "") >= 1.3).length; // ≤1개월
  const midTermTxCount = allSaleTxs.filter((tx) => temporalWeight(tx.contractDate ?? "") >= 1.0).length; // ≤3개월
  // 거래량 모멘텀 점수: 최근→중기 비율로 가속 여부 측정
  const volumeMomentumScore =
    recentTxCount >= 3 ? 15
    : recentTxCount >= 2 ? 10
    : recentTxCount >= 1 ? 6
    : midTermTxCount >= 3 ? 4
    : midTermTxCount >= 1 ? 2
    : 0;

  // 추세 레짐 보너스: 서울(도심/강남형)은 boom 지속 레짐 → 모멘텀 추가 가중
  // 서울 레짐: 상승 지속형(+5~8) / 경기 레짐: 풍선효과 기대(+3) / default: 중립
  const trendRegimeBonus =
    regionProfile === "seoul" ? 7
    : regionProfile === "gyeonggi" ? 3
    : 0;

  // 저가매물 소진 신호 (기존 lowPriceAbsorptionRate 유지, 스케일만 조정)
  const absorptionScore = Math.round(lowPriceAbsorptionRate * 35); // 최대 35점 (0.3→~10.5)

  // 대장 앵커 프리미엄 신호: 대장가격이 비교단지 시세보다 높으면 상방 압력
  const leaderBoost = leaderApartmentAnchorPrice > 0 && leaderApartmentAnchorPrice > (adjustedComparableSalePrice || saleAskingPrice) ? 6 : 0;

  // 비교단지 상급지 압력 (기존 유지, 계수 조정)
  const comparablePressureScore =
    comparableMarketPressureRate > 0 ? Math.round(comparableMarketPressureRate * 120)
    : comparableMarketPressureRate < 0 ? Math.round(comparableMarketPressureRate * 60)
    : 0;

  // 호가 공급 확인 (데이터 충분도 신호)
  const listingBonus = params.saleListings.length >= 2 ? 3 : 0;

  const upsideScore = hasMinData
    ? Math.min(100, Math.round(
        30  // 기저값: 데이터 있을 때 (평균회귀 없음 → 시장 중립 출발점 낮춤)
        + volumeMomentumScore   // 거래량 선행지표 (최대 15)
        + trendRegimeBonus      // 지역 추세 레짐 (서울+7, 경기+3)
        + absorptionScore       // 저가소진율 (최대 ~10.5 at 0.3)
        + leaderBoost           // 대장 앵커 상방압력 (+6)
        + comparablePressureScore // 비교단지 압력 (최대 6)
        + listingBonus          // 호가 데이터 확인 (+3)
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
    regionProfile === "seoul" ? `서울 레짐(추세지속형): 거래량 모멘텀·대장 신고가·상급지 압력 가중을 강조했습니다. (boom 지속 +${trendRegimeBonus}점)` : null,
    regionProfile === "gyeonggi" ? `경기·수도권 레짐: 분양권 프리미엄·전세갭·저가매물 소진 가중을 강조했습니다. (+${trendRegimeBonus}점)` : null,
    volumeMomentumScore >= 6 ? `최근 거래량 모멘텀이 감지됐습니다 (${recentTxCount}건/최근1개월, +${volumeMomentumScore}점).` : null,
    supplyCliffMode ? "공급절벽 모드 ON: 입지 비중을 낮추고 전세 소진·호가 lock-in 중심으로 가중치를 재편했습니다." : null,
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
