import type { Listing } from "@/types/listing";

export function calculateAbsorptionRate(previousCount: number, currentCount: number, newCount: number) {
  if (previousCount <= 0) return 0;
  const disappearedCount = previousCount + newCount - currentCount;
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
