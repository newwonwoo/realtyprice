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
  absorptionRate: number;           // (구) 스냅샷 소진율 — 보조 확인용
  lowPriceAbsorptionRate: number;   // (구) 저가매물 소진율 — 보조 확인용
  bottomPrice: number;
  avgAskingPrice: number;
  medianAskingPrice: number;
  signalScore: number;
  conclusion: "strong_up" | "up" | "neutral" | "down";
  createdAt: string;

  // ── 신규: MOI(재고소진월수) 중심 지표 ──────────────────────────
  // MOI = 활성매물수 / 월간 실거래 건수. 낮을수록 매도자 우위(상승압력).
  // 근거: Richmond Fed(2025) — MOI는 집값 방향의 선행지표.
  monthsOfInventory?: number;       // MOI (개월). 0 = 실거래 없음(계산불가)
  monthlySalesPace?: number;        // 월평균 실거래 건수
  activeListingCount?: number;      // 디둡 후 현재 활성 매물수
  turnoverAnnualized?: number;      // 거래회전율(연율 %) = 월실거래×12/세대수×100
  supplyDemandProxy?: number;       // 매매수급 프록시 0~200 (100=균형)
  transactionWindowMonths?: number; // 실거래 집계 기간(개월)
};
