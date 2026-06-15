import { NextRequest, NextResponse } from "next/server";

// VWorld(국토교통부) 지오코더 API 2.0 (지번/도로명 → 위도/경도)
// https://www.vworld.kr/dev/v4dv_geocoderguide2_s001.do
// ⚠️ VWorld 이용약관: 변환 좌표는 실시간 사용만 가능하며 별도 DB/저장장치에 저장 금지.
//    따라서 본 라우트는 호출 시점에만 좌표를 반환하고, 영구 저장은 호출측에서 하지 않는다.
const VWORLD_API = "https://api.vworld.kr/req/address";

export type GeocodeResult = {
  lat: number;
  lng: number;
  matchedType: "PARCEL" | "ROAD";
  refinedText?: string;
};

type OnceResult =
  | { ok: true; lat: number; lng: number; refinedText?: string }
  | { ok: false; status: string; error?: string };

async function geocodeOnce(address: string, type: "PARCEL" | "ROAD", key: string): Promise<OnceResult> {
  const params = new URLSearchParams({
    service: "address",
    request: "getcoord",
    version: "2.0",
    crs: "epsg:4326",
    address,
    type,
    format: "json",
    refine: "true",
    simple: "false",
    key,
  });
  const res = await fetch(`${VWORLD_API}?${params.toString()}`, { next: { revalidate: 0 } });
  if (!res.ok) return { ok: false, status: `HTTP_${res.status}` };
  const data = await res.json();
  const r = data?.response;
  const status = r?.status as string | undefined;
  if (status === "OK") {
    const p = r?.result?.point;
    if (p && p.x && p.y) {
      return { ok: true, lat: parseFloat(p.y), lng: parseFloat(p.x), refinedText: r?.refined?.text };
    }
  }
  return { ok: false, status: status ?? "ERROR", error: r?.error?.text };
}

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const address = searchParams.get("address");
  // 신규 파라미터명 vworldKey, 하위호환으로 key도 허용
  const vworldKey = searchParams.get("vworldKey") ?? searchParams.get("key") ?? process.env.VWORLD_API_KEY ?? "";

  if (!address) return NextResponse.json({ error: "address 필요" }, { status: 400 });
  if (!vworldKey) {
    return NextResponse.json({ error: "VWorld 지오코더 인증키가 없습니다. 설정 > API 키 설정에서 등록하세요." }, { status: 400 });
  }

  try {
    // 우리 단지 데이터는 지번주소가 많으므로 PARCEL 우선 → 실패 시 ROAD 재시도
    let r = await geocodeOnce(address, "PARCEL", vworldKey);
    let matchedType: "PARCEL" | "ROAD" = "PARCEL";
    if (!r.ok) {
      const road = await geocodeOnce(address, "ROAD", vworldKey);
      if (road.ok) { r = road; matchedType = "ROAD"; }
      else {
        // 인증키/한도 등 키 관련 오류는 그대로 전달
        const keyErr = /KEY|LIMIT/i.test(r.status) ? r : road;
        return NextResponse.json(
          { error: keyErr.ok ? "주소를 찾을 수 없습니다." : `${keyErr.status}${keyErr.error ? `: ${keyErr.error}` : ""}` },
          { status: /KEY|LIMIT/i.test(keyErr.ok ? "" : keyErr.status) ? 502 : 404 },
        );
      }
    }

    const result: GeocodeResult = { lat: r.lat, lng: r.lng, matchedType, refinedText: r.refinedText };
    return NextResponse.json(result);
  } catch (err) {
    return NextResponse.json({ error: `요청 실패: ${String(err)}` }, { status: 500 });
  }
}
