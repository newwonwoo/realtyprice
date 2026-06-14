import type { Listing } from "@/types/listing";
import type { ModelWeights, PriceEstimate } from "@/types/model";
import type { Transaction } from "@/types/transaction";
import { normalizeToBGrade } from "./grade";
import { median, getLowPriceListings } from "./inventory";

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
  presalePrice?: number;
}) {
  const adjustedSales = params.saleTransactions.map((tx) => tx.adjustedPrice ?? normalizeToBGrade(tx.price, tx.grade));
  const adjustedComparableSalePrice = median(adjustedSales);
  const saleAskingPrice = median(params.saleListings.map((listing) => listing.adjustedAskingPrice ?? listing.askingPrice));
  const expectedJeonsePrice = median([
    ...params.jeonseTransactions.map((tx) => tx.price),
    ...params.jeonseListings.map((listing) => listing.askingPrice)
  ]);
  const jeonseFloorPrice = calculateJeonseFloorPrice(expectedJeonsePrice, 0.65);
  const lowPriceAbsorptionRate = params.lowPriceAbsorptionRate ?? 0;
  const inventorySignalPriceEffect = saleAskingPrice * (lowPriceAbsorptionRate >= 0.3 ? 1.04 : lowPriceAbsorptionRate >= 0.15 ? 1.02 : 1);
  const presalePremiumPrice = params.presalePrice ? params.presalePrice * 1.05 : adjustedComparableSalePrice;

  const weighted =
    adjustedComparableSalePrice * params.weights.adjustedComparableSale +
    saleAskingPrice * params.weights.askingPrice +
    jeonseFloorPrice * params.weights.jeonseFloorPrice +
    inventorySignalPriceEffect * params.weights.inventorySignal +
    presalePremiumPrice * params.weights.presalePremium +
    adjustedComparableSalePrice * params.weights.macroSignal;

  const expectedSaleMid = Math.round(weighted || saleAskingPrice || adjustedComparableSalePrice || 0);
  const expectedSaleMin = Math.round(expectedSaleMid * 0.97);
  const expectedSaleMax = Math.round(expectedSaleMid * 1.03);
  const expectedJeonseMid = expectedJeonsePrice;
  const upsideScore = Math.min(100, Math.round(45 + lowPriceAbsorptionRate * 60 + (adjustedSales.length >= 3 ? 10 : 0)));

  const estimate: PriceEstimate = {
    id: `estimate_${params.targetApartmentId}_${Date.now()}`,
    targetApartmentId: params.targetApartmentId,
    estimateDate: new Date().toISOString().slice(0, 10),
    expectedSaleMin,
    expectedSaleMid,
    expectedSaleMax,
    expectedJeonseMin: Math.round(expectedJeonseMid * 0.97),
    expectedJeonseMid,
    expectedJeonseMax: Math.round(expectedJeonseMid * 1.03),
    recommendedAskingPrice: calculateRecommendedAskingPrice(expectedSaleMid, lowPriceAbsorptionRate),
    defensePrice: calculateDefensePrice(expectedSaleMid),
    upsideScore,
    confidenceScore: Math.min(100, adjustedSales.length * 10 + params.saleListings.length * 5 + params.jeonseTransactions.length * 8),
    conclusion: conclusionFromScore(upsideScore),
    reasonSummary: [
      "비교단지 보정 실거래가와 현재 호가를 가중평균했습니다.",
      "전세기반 하방가격을 반영했습니다.",
      "저가매물 소진율을 상승 신호로 반영했습니다."
    ],
    warnings: ["사라진 매물은 거래완료가 아니라 소진추정입니다."],
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
