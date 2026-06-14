export const STORAGE_KEYS = {
  apiKeys: "real_estate_signal_api_keys",
  apartments: "real_estate_signal_apartments",
  comparableRules: "real_estate_signal_comparable_rules",
  comparableApartments: "real_estate_signal_comparable_apartments",
  transactions: "real_estate_signal_transactions",
  listings: "real_estate_signal_listings",
  listingSnapshots: "real_estate_signal_listing_snapshots",
  inventorySignals: "real_estate_signal_inventory_signals",
  priceEstimates: "real_estate_signal_price_estimates",
  modelSettings: "real_estate_signal_model_settings"
} as const;

export function readStorage<T>(key: string, fallback: T): T {
  if (typeof window === "undefined") return fallback;
  try {
    const raw = window.localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

export function writeStorage<T>(key: string, value: T) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(key, JSON.stringify(value));
}

export function removeStorage(key: string) {
  if (typeof window === "undefined") return;
  window.localStorage.removeItem(key);
}
