import type { InventorySignal, Listing } from "@/types/listing";
import type { Transaction } from "@/types/transaction";

// ════════════════════════════════════════════════════════════════════
// 매물소진 신호 — MOI(재고소진월수, Months of Inventory) 중심
// ────────────────────────────────────────────────────────────────────
// 근거(리서치 종합):
//  · MOI = 활성매물수 / 월간 실거래건수 = 현재 매물을 다 소진하는 데 걸리는 개월.
//    낮을수록 매도자 우위(상승압력). Richmond Fed(2025): MOI는 실업률·금리보다
//    집값 방향을 잘 예측하는 선행지표.
//  · 흡수율(absorption rate) = 월실거래/활성매물 = 1/MOI.
//  · 거래회전율 = 월실거래×12/세대수 (동행지표, 레짐 판단 보조). 한국 연율
//    ~3% 침체 / ~5% 활발 / ~8% 호황.
//  · 매물건수 단순 증감은 허위·중복매물/세제 영향으로 노이즈 큼 → 보조 확인용만.
//
// 임계값(US NAR 관행, 수도권 보정 전 기본값):
//  MOI < 3        강한 매도자우위 (강한 상승)
//  3 ≤ MOI < 4    매도자우위    (상승)
//  4 ≤ MOI ≤ 6    균형          (보합)
//  6 < MOI ≤ 6.5  매수자우위    (약한 하락)
//  MOI > 6.5      강한 매수자우위 (하락)
//
// ── 학술 근거 (검증 통과분, 2026-06 리서치 회의) ──────────────────────
//  [1] Gordon (2025), Richmond Fed Economic Brief 25-11: months supply는 가격상승률
//      선행지표(10개월 lead 상관 -0.60, R²≈0.36; 실업률·10년물 금리보다 예측력 우수).
//      단 신규주택>기존주택 — 네이버 매물(기존주택 성격)은 신호가 약할 수 있어 배율 보수적.
//  [2] NAR 통용: 6개월=균형, 0~3 매도자우위, 6+ 매수자우위(구간분할은 업계해석).
//  [3] 한국 회전율 밴드: 8%↑호황 / 5%내외 정상 / 3%↓침체(코리아퓨처 2024).
//      서울 가격→거래량 Granger 인과(허윤경 외 2008, 주택연구 16(4)).
//  [4] 단독판정 경고: 같은 MOI가 매도자 호가경직(공급측)일 수 있음
//      (Genesove-Mayer 2001 QJE 116(4); Stein 1995 QJE 110(2); Clayton-Miller-Peng 2010 JREFE).
//  [폐기] 2-스냅샷 '저가소진율': 재등록·중복·허위 selection bias + 얇은표본 노이즈
//      + 기존신호 중복, 분리 선행지표 직접실증 미발견 → flow(실거래)=MOI로 대체.
// 주의: 단지 단위 MOI라 시장전체 US 임계와 스케일이 다를 수 있음 — 한국 데이터로 재캘리브레이션 필요.
// ════════════════════════════════════════════════════════════════════

export const MOI_THRESHOLDS = {
  SELLER_STRONG: 3.0,
  SELLER: 4.0,
  BALANCED_HI: 6.0,
  BUYER: 6.5,
} as const;

export const DEFAULT_TX_WINDOW_MONTHS = 6;

// ── 매물 디둡: complexPk 대신 단지 내 면적+가격+동/층 클러스터로 중복 제거 ──
// 네이버 호가는 중개사 중복게시(±1층/동)로 부풀려짐 → 같은 단위는 1건으로.
export function dedupeListings(listings: Listing[]): Listing[] {
  const seen = new Map<string, Listing>();
  for (const l of listings) {
    const key = [
      l.exclusiveArea,
      Math.round(l.askingPrice / 100), // 100만원 단위 반올림 — 미세 호가차 흡수
      l.buildingNo ?? "",
      l.floor ?? "",
    ].join("|");
    if (!seen.has(key)) seen.set(key, l);
  }
  return Array.from(seen.values());
}

export function getLowPriceListings(listings: Listing[]) {
  const sorted = [...listings].sort((a, b) => a.askingPrice - b.askingPrice);
  const count = Math.ceil(sorted.length * 0.3);
  return sorted.slice(0, count);
}

export function median(values: number[]) {
  if (!values.length) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : Math.round((sorted[mid - 1] + sorted[mid]) / 2);
}

export function average(values: number[]) {
  if (!values.length) return 0;
  return Math.round(values.reduce((sum, value) => sum + value, 0) / values.length);
}

// (구) 스냅샷 차이 소진율 — 두 시점 매물 비교. 보조 확인용으로 유지.
export function calculateAbsorptionRate(previousCount: number, currentCount: number, newCount: number) {
  if (previousCount <= 0) return 0;
  const disappearedCount = Math.max(0, previousCount + newCount - currentCount);
  return disappearedCount / previousCount;
}

// ── 최근 windowMonths개월 내 매매 실거래 건수 ──
function countRecentSales(transactions: Transaction[], windowMonths: number): number {
  const cutoff = new Date();
  cutoff.setMonth(cutoff.getMonth() - windowMonths);
  return transactions.filter((tx) => {
    if (tx.transactionType !== "sale") return false;
    const d = new Date(tx.contractDate);
    return !Number.isNaN(d.getTime()) && d >= cutoff;
  }).length;
}

function moiToScore(moi: number): number {
  // MOI 0 → ~92, 3 → ~68, 6 → ~44, 10 → ~12. 낮을수록 고점.
  return Math.max(0, Math.min(100, Math.round(92 - moi * 8)));
}

function moiToConclusion(moi: number): InventorySignal["conclusion"] {
  if (moi < MOI_THRESHOLDS.SELLER_STRONG) return "strong_up";
  if (moi < MOI_THRESHOLDS.BALANCED_HI) return "up";
  if (moi <= MOI_THRESHOLDS.BUYER) return "neutral";
  return "down";
}

export type InventorySignalOptions = {
  households?: number;          // 단지 세대수 — 거래회전율 계산용
  previousListings?: Listing[]; // 직전 스냅샷 — (구) 소진율 보조계산용
  windowMonths?: number;        // 실거래 집계 기간 (기본 6개월)
};

/**
 * MOI 중심 매물소진 신호 산출.
 * 단일 매물 스냅샷 + 실거래 이력만으로 계산 가능 (스냅샷 2개 불필요).
 */
export function calculateInventorySignal(
  apartmentId: string,
  currentListings: Listing[],
  transactions: Transaction[] = [],
  options: InventorySignalOptions = {},
): InventorySignal {
  const windowMonths = options.windowMonths ?? DEFAULT_TX_WINDOW_MONTHS;

  // 매매 매물만, 디둡
  const saleListings = dedupeListings(currentListings.filter((l) => l.listingType === "sale"));
  const activeListingCount = saleListings.length;

  // 월간 실거래 페이스
  const recentSales = countRecentSales(transactions, windowMonths);
  const monthlySalesPace = recentSales / windowMonths;

  // MOI — 실거래 0이면 계산불가(0). 매물 0이면 MOI 0.
  const moi = monthlySalesPace > 0 ? activeListingCount / monthlySalesPace : 0;
  const hasMoi = monthlySalesPace > 0 && activeListingCount > 0;

  // 거래회전율(연율 %)
  const turnoverAnnualized = options.households && options.households > 0
    ? (monthlySalesPace * 12) / options.households * 100
    : undefined;

  // 매매수급 프록시 0~200 (100=균형). 수요≈월실거래, 공급≈활성매물.
  const denom = monthlySalesPace + activeListingCount;
  const supplyDemandProxy = denom > 0
    ? Math.round(100 + 100 * (monthlySalesPace - activeListingCount) / denom)
    : 100;

  // (구) 스냅샷 소진율 — previousListings 있으면 보조계산
  let snapshotAbsorption = 0;
  let lowPriceAbsorptionRate = 0;
  let newListingCount = 0;
  let disappearedListingCount = 0;
  let lowPriceListingCount = 0;
  let lowPriceDisappearedCount = 0;
  if (options.previousListings && options.previousListings.length) {
    const prev = dedupeListings(options.previousListings.filter((l) => l.listingType === "sale"));
    const prevKeys = new Set(prev.map((l) => l.listingKey ?? l.id));
    const currKeys = new Set(saleListings.map((l) => l.listingKey ?? l.id));
    newListingCount = saleListings.filter((l) => !prevKeys.has(l.listingKey ?? l.id)).length;
    disappearedListingCount = prev.filter((l) => !currKeys.has(l.listingKey ?? l.id)).length;
    snapshotAbsorption = calculateAbsorptionRate(prev.length, saleListings.length, newListingCount);
    const lowPrev = getLowPriceListings(prev);
    lowPriceListingCount = lowPrev.length;
    lowPriceDisappearedCount = lowPrev.filter((l) => !currKeys.has(l.listingKey ?? l.id)).length;
    lowPriceAbsorptionRate = lowPrev.length ? lowPriceDisappearedCount / lowPrev.length : 0;
  }

  const prices = saleListings.map((l) => l.askingPrice);

  // 신호점수·결론: MOI 가능하면 MOI 기준, 아니면 데이터 부족 보합(35)
  const signalScore = hasMoi ? moiToScore(moi) : 35;
  const conclusion = hasMoi ? moiToConclusion(moi) : "neutral";

  return {
    id: `inventory_${apartmentId}_${Date.now()}`,
    apartmentId,
    signalDate: currentListings[0]?.capturedAt ?? new Date().toISOString().slice(0, 10),
    totalListingCount: activeListingCount,
    newListingCount,
    disappearedListingCount,
    lowPriceListingCount,
    lowPriceDisappearedCount,
    absorptionRate: hasMoi ? monthlySalesPace / activeListingCount : snapshotAbsorption,
    lowPriceAbsorptionRate,
    bottomPrice: prices.length ? Math.min(...prices) : 0,
    avgAskingPrice: average(prices),
    medianAskingPrice: median(prices),
    signalScore,
    conclusion,
    createdAt: new Date().toISOString(),

    monthsOfInventory: hasMoi ? Math.round(moi * 10) / 10 : 0,
    monthlySalesPace: Math.round(monthlySalesPace * 10) / 10,
    activeListingCount,
    turnoverAnnualized: turnoverAnnualized !== undefined ? Math.round(turnoverAnnualized * 100) / 100 : undefined,
    supplyDemandProxy,
    transactionWindowMonths: windowMonths,
  };
}
