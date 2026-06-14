import type { UnitGrade } from "./transaction";

export type ListingType = "sale" | "jeonse";

export type Listing = {
  id: string;
  apartmentId: string;
  listingType: ListingType;
  exclusiveArea: number;
  askingPrice: number;
  floor?: number;
  buildingNo?: string;
  unitNo?: string;
  direction?: string;
  grade?: UnitGrade;
  adjustedAskingPrice?: number;
  source: "naver" | "kb" | "hogangnono" | "manual" | "csv";
  listingKey?: string;
  capturedAt: string;
  status: "active" | "new" | "disappeared";
  memo?: string;
};

export type InventorySignal = {
  id: string;
  apartmentId: string;
  signalDate: string;
  totalListingCount: number;
  newListingCount: number;
  disappearedListingCount: number;
  lowPriceListingCount: number;
  lowPriceDisappearedCount: number;
  absorptionRate: number;
  lowPriceAbsorptionRate: number;
  bottomPrice: number;
  avgAskingPrice: number;
  medianAskingPrice: number;
  signalScore: number;
  conclusion: "strong_up" | "up" | "neutral" | "down";
  createdAt: string;
};
