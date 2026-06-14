import { NextRequest, NextResponse } from "next/server";
import { readFileSync } from "fs";
import { join } from "path";

type Record = { a: string; d: string; s: string; n: number };

let _data: Record[] | null = null;
function getData(): Record[] {
  if (!_data) {
    const path = join(process.cwd(), "src/data/schoolDistrict.json");
    _data = JSON.parse(readFileSync(path, "utf-8")) as Record[];
  }
  return _data;
}

export type SchoolDistrictResult = {
  aptName: string;
  address: string;
  schoolName: string;
  newStudents: number; // 2025년 신입생 수 (학군 인기도 proxy)
};

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const aptName = searchParams.get("aptName") ?? "";
  const address = searchParams.get("address") ?? ""; // 동 단위 주소 or 지역명

  if (!aptName && !address) {
    return NextResponse.json({ error: "aptName 또는 address 필요" }, { status: 400 });
  }

  const data = getData();

  // 1순위: 단지명 직접 매칭
  if (aptName) {
    const nameNorm = aptName.replace(/\s/g, "");
    const byName = data.filter((r) => r.a.replace(/\s/g, "") === nameNorm);
    if (byName.length > 0) {
      return NextResponse.json(toResult(byName[0]));
    }
    // 포함 매칭
    const partial = data.find((r) =>
      r.a.replace(/\s/g, "").includes(nameNorm) ||
      nameNorm.includes(r.a.replace(/\s/g, ""))
    );
    if (partial) return NextResponse.json(toResult(partial));
  }

  // 2순위: 주소 동 단위 매칭 (주소에 동/리 이름 포함 여부)
  if (address) {
    const addrParts = address.split(" ").filter(Boolean);
    // 시군구+동 단위로 필터
    const byAddr = data.filter((r) =>
      addrParts.every((part) => r.d.includes(part))
    );
    if (byAddr.length > 0) {
      // 신입생 많은 학교 순 (인기 학군 우선)
      byAddr.sort((a, b) => b.n - a.n);
      return NextResponse.json(toResult(byAddr[0]));
    }
  }

  return NextResponse.json({ error: "학구 정보를 찾을 수 없습니다." }, { status: 404 });
}

function toResult(r: Record): SchoolDistrictResult {
  return {
    aptName: r.a,
    address: r.d,
    schoolName: r.s,
    newStudents: r.n,
  };
}
