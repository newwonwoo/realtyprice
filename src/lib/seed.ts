import type { ComparableRule } from "@/types/apartment";
import type { ModelWeights } from "@/types/model";

export const defaultComparableRule = (targetApartmentId: string): ComparableRule => ({
  id: `rule_${targetApartmentId}`,
  targetApartmentId,
  maxDistanceKm: 1.5,
  minHouseholds: 300,
  areaMin: 74,
  areaMax: 99,
  regionKeywords: [],
  weightDistance: 25,
  weightNewness: 20,
  weightBrand: 15,
  weightStation: 15,
  weightHouseholds: 25
});

export const defaultModelWeights: ModelWeights = {
  targetSale: 0.20,
  adjustedComparableSale: 0.23,
  comparableAskingPrice: 0.10,
  askingPrice: 0.12,
  jeonseFloorPrice: 0.10,
  inventorySignal: 0.08,
  presalePremium: 0.05,
  macroSignal: 0.03,
  leaderApartmentAnchor: 0.05,
  locationPremium: 0.02,
  comparableMarketPressure: 0.02
};
