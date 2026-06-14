import type { UnitGrade } from "@/types/transaction";

export const gradePremiumMap: Record<UnitGrade, number> = {
  S: 0.05,
  A: 0.02,
  B: 0,
  C: -0.03,
  D: -0.06,
  UNKNOWN: 0
};

export function normalizeToBGrade(price: number, grade: UnitGrade = "UNKNOWN") {
  const premium = gradePremiumMap[grade] ?? 0;
  return Math.round(price / (1 + premium));
}
