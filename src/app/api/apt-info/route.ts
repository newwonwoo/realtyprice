import { NextRequest, NextResponse } from "next/server";

const BASE = "https://apis.data.go.kr/1613000/AptBasisInfoService1";

export type AptBassInfo = {
  kaptName: string;
  kaptAddr: string;       // 법정동주소
  kaptdoroAddr: string;   // 도로명주소
  kaptdaCnt: string;      // 세대수
  kaptBcompany: string;   // 시공사
  kaptMgCmp: string;      // 시행사
  kaptUsedate: string;    // 사용승인일
  heatMethodNm: string;   // 난방방식
  hallNm: string;         // 복도유형
  kaptdongCnt: string;    // 동수
  privArea: string;       // 전용면적별 세대현황
};

export type AptDtlInfo = {
  subwayLine: string;     // 지하철호선
  subwayStation: string;  // 지하철역명
  subwayDist: string;     // 지하철역 거리(m)
  busDist: string;        // 버스정류장 거리(m)
  parkingCntUnderGnd: string; // 주차대수(지하)
  parkingCntOverGnd: string;  // 주차대수(지상)
  cctvCnt: string;        // CCTV대수
  elevCnt: string;        // 승강기대수
  convenientFacility: string; // 편의시설
  educationFacility: string;  // 교육시설
  buildStructure: string;     // 건물구조
  drinkWaterMethod: string;   // 급수방식
};

export type AptCombinedInfo = {
  bass: Partial<AptBassInfo>;
  dtl: Partial<AptDtlInfo>;
};

async function fetchApi(path: string, serviceKey: string, kaptCode: string) {
  let key = serviceKey;
  try { key = decodeURIComponent(serviceKey); } catch { /* 그대로 */ }
  const params = new URLSearchParams({ serviceKey: key, kaptCode, _type: "json" });
  const res = await fetch(`${BASE}/${path}?${params}`, {
    headers: { Accept: "application/json" },
    next: { revalidate: 3600 }, // 1시간 캐시
  });
  if (!res.ok) return null;
  const data = await res.json();
  return data?.response?.body?.item ?? null;
}

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const serviceKey = searchParams.get("serviceKey");
  const kaptCode = searchParams.get("kaptCode");

  if (!serviceKey) return NextResponse.json({ error: "공공데이터포털 API 키가 없습니다." }, { status: 400 });
  if (!kaptCode) return NextResponse.json({ error: "단지코드(kaptCode)가 필요합니다." }, { status: 400 });

  const [bass, dtl] = await Promise.all([
    fetchApi("getAphusBassInfoV4", serviceKey, kaptCode),
    fetchApi("getAphusDtlInfoV4", serviceKey, kaptCode),
  ]);

  return NextResponse.json({ bass: bass ?? {}, dtl: dtl ?? {} });
}
