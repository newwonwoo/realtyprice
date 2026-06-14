import type { Apartment, ComparableRule } from "@/types/apartment";
import type { ModelWeights } from "@/types/model";
import { nowIso } from "./format";

const createdAt = nowIso();

export const seedApartments: Apartment[] = [
  {
    id: "target_osan_geumgang",
    name: "오산역 금강펜테리움센트럴파크",
    shortName: "오산역 금강펜테리움",
    region: "경기 오산시",
    address: "경기 오산시 가수동 449",
    role: "target",
    group: "osan",
    brand: "금강펜테리움",
    defaultArea: 84,
    createdAt,
    updatedAt: createdAt
  },
  {
    id: "target_songdo_lake5",
    name: "힐스테이트레이크송도5차",
    shortName: "송도 힐스테이트레이크5차",
    region: "인천 연수구",
    address: "인천 연수구 송도동 399-13",
    role: "target",
    group: "songdo",
    brand: "현대건설",
    defaultArea: 84,
    createdAt,
    updatedAt: createdAt
  },
  {
    id: "comp_osan_sk2",
    name: "오산SK뷰2차",
    region: "경기 오산시",
    address: "경기 오산시 가수동",
    role: "comparable",
    group: "osan",
    builtYear: 2004,
    defaultArea: 84,
    createdAt,
    updatedAt: createdAt
  },
  {
    id: "comp_osan_cantavil",
    name: "세교칸타빌더퍼스트",
    region: "경기 오산시",
    address: "경기 오산시 세교2지구",
    role: "comparable",
    group: "osan",
    defaultArea: 84,
    createdAt,
    updatedAt: createdAt
  },
  {
    id: "comp_songdo_lake4",
    name: "힐스테이트레이크송도4차",
    region: "인천 연수구",
    address: "인천 연수구 송도동",
    role: "comparable",
    group: "songdo",
    defaultArea: 84,
    createdAt,
    updatedAt: createdAt
  }
];

export const defaultComparableRule = (targetApartmentId: string): ComparableRule => ({
  id: `rule_${targetApartmentId}`,
  targetApartmentId,
  maxDistanceKm: 1.5,
  minHouseholds: 300,
  areaMin: 74,
  areaMax: 99,
  regionKeywords: [],
  weightDistance: 25,
  weightNewness: 20,
  weightBrand: 15,
  weightStation: 15,
  weightHouseholds: 25
});

export const defaultModelWeights: ModelWeights = {
  targetSale: 0.20,
  adjustedComparableSale: 0.25,
  comparableAskingPrice: 0.10,
  askingPrice: 0.12,
  jeonseFloorPrice: 0.10,
  inventorySignal: 0.08,
  presalePremium: 0.05,
  macroSignal: 0.03,
  leaderApartmentAnchor: 0.05,
  locationPremium: 0.02,
  comparableMarketPressure: 0.02
};
