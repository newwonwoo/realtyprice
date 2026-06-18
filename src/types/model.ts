import type { Apartment, ComparableApartment, ComparableRule } from "./apartment";
import type { InventorySignal, Listing } from "./listing";
import type { Transaction } from "./transaction";

export type ModelWeights = {
  targetSale: number;
  adjustedComparableSale: number;
  comparableAskingPrice: number;
  askingPrice: number;
  jeonseFloorPrice: number;
  inventorySignal: number;
  presalePremium: number;
  macroSignal: number;
  // 대장아파트 앵커 (Giacoletti & Parsons 2023: γ=0.25~0.50 spillover)
  leaderApartmentAnchor: number;
  locationPremium: number;
  comparableMarketPressure: number;
};

// 가격추정 모델 전체 분해 — 예상가 앵커 + 상승가능성 점수를 하나의 표로.
// 평가요소 / 실거래에서 보는 것 / 원점수(측정 원시값) / 가중치·배점 / 결과를 분리.
export type ModelFactor = {
  group: "price" | "upside"; // 예상가 앵커 | 상승가능성 점수
  label: string;             // 평가요소
  source: string;            // 실거래에서 무엇을 보는지 (데이터 출처·대상)
  rawValue: string;          // 원점수 — 측정된 원시값 (예: "전세가율 68%", "가속 1.4배")
  weight: string;            // 가중치(가격 %) 또는 배점(점수 max)
  result: string;            // 결과 — 환산가(억) 또는 점수
  active: boolean;           // 실제 산식에 반영됐는지 (값 0/데이터 없음이면 false)
};

export type PriceEstimate = {
  id: string;
  targetApartmentId: string;
  estimateDate: string;
  targetSalePrice: number;
  adjustedComparableSalePrice: number;
  comparableAskingPrice: number;
  saleAskingPrice: number;
  jeonseFloorPrice: number;
  inventorySignalPrice: number;
  presalePremiumPrice: number;
  macroSignalPrice: number;
  leaderApartmentAnchorPrice: number;
  locationPremiumPrice: number;
  comparableMarketPressurePrice: number;
  comparableLocationAdjustmentRate: number;
  selectedArea: number;
  lowPriceAbsorptionRate: number;
  expectedSaleMin: number;
  expectedSaleMid: number;
  expectedSaleMax: number;
  expectedJeonseMin: number;
  expectedJeonseMid: number;
  expectedJeonseMax: number;
  recommendedAskingPrice: number;
  defensePrice: number;
  upsideScore: number;
  modelBreakdown: ModelFactor[];
  confidenceScore: number;
  conclusion: "strong_up" | "up" | "neutral" | "weak" | "price_cut_needed" | "insufficient_data";
  reasonSummary: string[];
  warnings: string[];
  createdAt: string;
};

export type BackupData = {
  version: string;
  exportedAt: string;
  apiKeysExcluded: boolean;
  apartments: Apartment[];
  comparableRules: ComparableRule[];
  comparableApartments: ComparableApartment[];
  transactions: Transaction[];
  listings: Listing[];
  inventorySignals: InventorySignal[];
  priceEstimates: PriceEstimate[];
  modelSettings: ModelWeights;
};
