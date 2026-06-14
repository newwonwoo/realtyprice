export type UnitGrade = "S" | "A" | "B" | "C" | "D" | "UNKNOWN";
export type TransactionType = "sale" | "jeonse" | "monthly_rent" | "presale";

export type Transaction = {
  id: string;
  apartmentId: string;
  transactionType: TransactionType;
  exclusiveArea: number;
  price: number;
  deposit?: number;
  monthlyRent?: number;
  contractDate: string;
  floor?: number;
  buildingNo?: string;
  unitNo?: string;
  direction?: string;
  grade?: UnitGrade;
  gradeReason?: string;
  adjustedPrice?: number;
  source: "molit" | "naver" | "kb" | "manual" | "csv";
  sourceUrl?: string;
  createdAt: string;
  updatedAt: string;
};
