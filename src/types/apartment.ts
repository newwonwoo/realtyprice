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
