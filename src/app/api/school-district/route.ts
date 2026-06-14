import { NextRequest, NextResponse } from "next/server";
import { readFileSync } from "fs";
import { join } from "path";

type RawRecord = { a: string; d: string; s: string; n: number; slat?: number; slng?: number };

let _data: RawRecord[] | null = null;
function getData(): RawRecord[] {
  if (!_data) {
    const path = join(process.cwd(), "src/data/schoolDistrict.json");
    _data = JSON.parse(readFileSync(path, "utf-8")) as RawRecord[];
  }
  return _data;
}

export type SchoolDistrictResult = {
  aptName: string;
  address: string;
  schoolName: string;
  newStudents: number;    // 2025년 신입생 수 (학군 인기도 proxy)
  schoolLat?: number;     // 학교 위도
  schoolLng?: number;     // 학교 경도
  distanceM?: number;     // 아파트 → 학교 직선거리(m), aptLat/aptLng 제공 시
};

// 두 좌표 간 직선거리 (Haversine, 단위: m)
function haversineM(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371000;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLng = (lng2 - lng1) * Math.PI / 180;
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dLng / 2) ** 2;
  return Math.round(R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a)));
}

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const aptName = searchParams.get("aptName") ?? "";
  const address = searchParams.get("address") ?? "";
  const aptLat = searchParams.get("aptLat") ? Number(searchParams.get("aptLat")) : undefined;
  const aptLng = searchParams.get("aptLng") ? Number(searchParams.get("aptLng")) : undefined;

  if (!aptName && !address) {
    return NextResponse.json({ error: "aptName 또는 address 필요" }, { status: 400 });
  }

  const data = getData();

  // 1순위: 아파트 좌표 기반 — 학교까지 직선거리 계산 후 가장 가까운 배정학교
  // (aptLat/aptLng 없으면 이름/주소 매칭으로 fallback)

  let match: RawRecord | null = null;

  // 1-1. 단지명 정확 매칭
  if (aptName) {
    const nameNorm = aptName.replace(/\s/g, "");
    match = data.find((r) => r.a.replace(/\s/g, "") === nameNorm) ?? null;

    // 1-2. 포함 매칭
    if (!match) {
      match = data.find((r) =>
        r.a.replace(/\s/g, "").includes(nameNorm) ||
        nameNorm.includes(r.a.replace(/\s/g, ""))
      ) ?? null;
    }
  }

  // 1-3. 주소 동 단위 매칭
  if (!match && address) {
    const parts = address.split(" ").filter(Boolean);
    const candidates = data.filter((r) => parts.every((p) => r.d.includes(p)));
    if (candidates.length > 0) {
      candidates.sort((a, b) => b.n - a.n);
      match = candidates[0];
    }
  }

  if (!match) {
    return NextResponse.json({ error: "학구 정보를 찾을 수 없습니다." }, { status: 404 });
  }

  return NextResponse.json(toResult(match, aptLat, aptLng));
}

function toResult(r: RawRecord, aptLat?: number, aptLng?: number): SchoolDistrictResult {
  const distanceM =
    aptLat && aptLng && r.slat && r.slng
      ? haversineM(aptLat, aptLng, r.slat, r.slng)
      : undefined;

  return {
    aptName: r.a,
    address: r.d,
    schoolName: r.s,
    newStudents: r.n,
    schoolLat: r.slat,
    schoolLng: r.slng,
    distanceM,
  };
}
