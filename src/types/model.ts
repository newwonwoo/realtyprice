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
