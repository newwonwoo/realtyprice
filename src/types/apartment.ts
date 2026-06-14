export type ApartmentRole = "target" | "comparable";

export type Apartment = {
  id: string;
  name: string;
  shortName?: string;
  region: string;
  address: string;
  role: ApartmentRole;
  group?: string;
  builtYear?: number;
  households?: number;
  brand?: string;
  defaultArea?: number;
  createdAt: string;
  updatedAt: string;
};

export type ComparableRule = {
  id: string;
  targetApartmentId: string;
  maxDistanceKm: number;
  minBuiltYear?: number;
  maxBuiltYear?: number;
  minHouseholds?: number;
  areaMin: number;
  areaMax: number;
  regionKeywords: string[];
  weightDistance: number;
  weightNewness: number;
  weightBrand: number;
  weightStation: number;
  weightHouseholds: number;
  // 대장아파트 설정 (인근 지하철역 1~2개 거리 내 역 근접 + 거래량 최다 단지)
  leaderApartmentId?: string;
  targetToLeaderRatio?: number; // 대상아파트 / 대장아파트 가격 비율 (예: 0.88 = 88%)
};

export type ComparableApartment = {
  id: string;
  targetApartmentId: string;
  apartmentId: string;
  selected: boolean;
  manualAdded: boolean;
  compareWeight: number;
  reason?: string;
  similarityScore?: number;
  createdAt: string;
  updatedAt: string;
};

export type ApartmentSearchFilter = {
  regionKeyword?: string;
  nameKeyword?: string;
};
