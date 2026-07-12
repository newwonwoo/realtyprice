import type { Transaction } from "@/types/transaction";
import { median } from "./inventory";

// ── 거래유동성 점수(0~100) ──────────────────────────────────────────────
// 직방 비활성화 이후 활성매물수를 못 구하는 경우가 흔해져, MOI(재고소진월수=
// 활성매물÷월판매속도)를 계산할 수 없을 때를 위한 대체 수급신호. 매물 목록이
// 전혀 없어도 국토부 실거래(계약일자)만으로 "거래가 얼마나 원활한가"를 추정한다.
// ⚠️ demandScore는 한국부동산원 R-ONE 매매수급동향 연동 전까지 중립값 고정.
export type LiquiditySignal = {
  liquidityScore: number;             // 0~100, 높을수록 거래 원활
  turnover6mPer1000: number;          // 최근 6개월 세대당 거래회전율(천분율)
  daysSinceLastTrade: number | null;
  medianTradeGapDays: number | null;
  volumeMomentum: number | null;      // 최근(31~120일전) / 이전(121~210일전) 거래건수 비율
  hasData: boolean;
};

// later - earlier, in days (양수 = later가 더 나중 시점)
function daysBetween(earlier: Date, later: Date): number {
  return (later.getTime() - earlier.getTime()) / (1000 * 60 * 60 * 24);
}

export function calculateLiquidityScore(saleTransactions: Transaction[], households?: number): LiquiditySignal {
  const dated = saleTransactions
    .map((tx) => ({ tx, date: new Date(tx.contractDate) }))
    .filter((x) => !isNaN(x.date.getTime()))
    .sort((a, b) => a.date.getTime() - b.date.getTime());

  if (!dated.length) {
    return { liquidityScore: 0, turnover6mPer1000: 0, daysSinceLastTrade: null, medianTradeGapDays: null, volumeMomentum: null, hasData: false };
  }

  const now = new Date();
  const ageOf = (d: Date) => daysBetween(d, now); // 거래일로부터 오늘까지 경과일

  const trades6m = dated.filter((x) => ageOf(x.date) <= 180).length;
  const turnover6mPer1000 = households && households > 0 ? (trades6m / households) * 1000 : 0;

  const daysSinceLastTrade = Math.round(ageOf(dated[dated.length - 1].date));

  const gaps: number[] = [];
  for (let i = 1; i < dated.length; i++) gaps.push(daysBetween(dated[i - 1].date, dated[i].date)); // 이전 거래 → 다음 거래 간격
  const medianTradeGapDays = gaps.length ? median(gaps) : null;

  const trades31to120 = dated.filter((x) => { const d = ageOf(x.date); return d > 31 && d <= 120; }).length;
  const trades121to210 = dated.filter((x) => { const d = ageOf(x.date); return d > 121 && d <= 210; }).length;
  const volumeMomentum = trades31to120 / Math.max(1, trades121to210);

  const turnoverScore =
    turnover6mPer1000 >= 20 ? 40
    : turnover6mPer1000 >= 12 ? 32
    : turnover6mPer1000 >= 6 ? 22
    : turnover6mPer1000 >= 3 ? 12
    : 5;
  const recencyScore =
    daysSinceLastTrade <= 30 ? 20
    : daysSinceLastTrade <= 60 ? 15
    : daysSinceLastTrade <= 120 ? 8
    : 2;
  const cadenceScore =
    medianTradeGapDays === null ? 2
    : medianTradeGapDays <= 10 ? 15
    : medianTradeGapDays <= 20 ? 12
    : medianTradeGapDays <= 45 ? 7
    : 2;
  const momentumScore = Math.min(15, Math.max(0, ((volumeMomentum - 0.5) / 1.5) * 15));
  // R-ONE 매매수급동향(roneDemandIndex) 연동 전까지 중립 고정값
  const demandScore = 4;

  const liquidityScore = Math.min(100, Math.max(0, Math.round(
    turnoverScore + recencyScore + cadenceScore + momentumScore + demandScore
  )));

  return {
    liquidityScore,
    turnover6mPer1000: Math.round(turnover6mPer1000 * 100) / 100,
    daysSinceLastTrade,
    medianTradeGapDays: medianTradeGapDays !== null ? Math.round(medianTradeGapDays * 10) / 10 : null,
    volumeMomentum: Math.round(volumeMomentum * 100) / 100,
    hasData: true,
  };
}

// 거래유동성(0~100)을 기존 MOI 점수와 같은 척도(-6~+8)로 환산 — MOI 계산불가 시 대체용
export function liquidityToUpsidePoints(score: number): number {
  if (score >= 80) return 8;
  if (score >= 60) return 5;
  if (score >= 40) return 0;
  if (score >= 20) return -3;
  return -6;
}

// 거래유동성(0~100)을 기존 MOI 가격배율과 같은 척도로 환산 — MOI 계산불가 시 대체용
export function liquidityToPriceMultiplier(score: number): number {
  if (score >= 80) return 1.02;
  if (score >= 60) return 1.01;
  if (score >= 40) return 1.00;
  if (score >= 20) return 0.99;
  return 0.98;
}
