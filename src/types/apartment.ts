export type ApartmentRole = "target" | "comparable";

export type LocationFeatures = {
  nearestSubwayM?: number;     // 가장 가까운 지하철역 거리(m)
  nearestSubwayName?: string;
  nearestMartM?: number;       // 대형마트 거리(m)
  nearestMartName?: string;
  nearestParkM?: number;       // 공원 거리(m)
  nearestParkName?: string;
  hasWaterfront?: boolean;     // 수변(강/호수/하천) 인접 500m
  hasForestPark?: boolean;     // 산림공원 인접 1km
  fetchedAt?: string;
};

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
  latitude?: number;
  longitude?: number;
  originalPresalePrice?: number; // 모집공고 분양가(만원), 청약홈 API 자동조회
  locationFeatures?: LocationFeatures; // Overpass API 자동조회 위치 특성
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
