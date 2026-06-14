export function formatEok(priceManwon?: number) {
  if (!priceManwon || Number.isNaN(priceManwon)) return "-";
  return `${(priceManwon / 10000).toFixed(2)}억`;
}

export function formatPercent(value?: number) {
  if (value === undefined || Number.isNaN(value)) return "-";
  return `${(value * 100).toFixed(1)}%`;
}

export function nowIso() {
  return new Date().toISOString();
}
