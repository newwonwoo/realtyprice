import type { InventorySignal, Listing } from "@/types/listing";

export function calculateAbsorptionRate(previousCount: number, currentCount: number, newCount: number) {
  if (previousCount <= 0) return 0;
  const disappearedCount = Math.max(0, previousCount + newCount - currentCount);
  return disappearedCount / previousCount;
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

export function calculateInventorySignal(apartmentId: string, previousListings: Listing[], currentListings: Listing[]): InventorySignal {
  const previousKeys = new Set(previousListings.map((listing) => listing.listingKey ?? listing.id));
  const currentKeys = new Set(currentListings.map((listing) => listing.listingKey ?? listing.id));
  const newListingCount = currentListings.filter((listing) => !previousKeys.has(listing.listingKey ?? listing.id)).length;
  const disappearedListingCount = previousListings.filter((listing) => !currentKeys.has(listing.listingKey ?? listing.id)).length;
  const absorptionRate = calculateAbsorptionRate(previousListings.length, currentListings.length, newListingCount);
  const lowPriceListings = getLowPriceListings(previousListings);
  const lowPriceKeys = new Set(lowPriceListings.map((listing) => listing.listingKey ?? listing.id));
  const lowPriceDisappearedCount = previousListings.filter((listing) => {
    const key = listing.listingKey ?? listing.id;
    return lowPriceKeys.has(key) && !currentKeys.has(key);
  }).length;
  const lowPriceAbsorptionRate = lowPriceListings.length ? lowPriceDisappearedCount / lowPriceListings.length : 0;
  const currentPrices = currentListings.map((listing) => listing.askingPrice);
  const signalScore = Math.min(100, Math.round(35 + absorptionRate * 35 + lowPriceAbsorptionRate * 45));

  return {
    id: `inventory_${apartmentId}_${Date.now()}`,
    apartmentId,
    signalDate: currentListings[0]?.capturedAt ?? new Date().toISOString().slice(0, 10),
    totalListingCount: currentListings.length,
    newListingCount,
    disappearedListingCount,
    lowPriceListingCount: lowPriceListings.length,
    lowPriceDisappearedCount,
    absorptionRate,
    lowPriceAbsorptionRate,
    bottomPrice: currentPrices.length ? Math.min(...currentPrices) : 0,
    avgAskingPrice: average(currentPrices),
    medianAskingPrice: median(currentPrices),
    signalScore,
    conclusion: lowPriceAbsorptionRate >= 0.3 ? "strong_up" : signalScore >= 60 ? "up" : signalScore >= 35 ? "neutral" : "down",
    createdAt: new Date().toISOString()
  };
}
