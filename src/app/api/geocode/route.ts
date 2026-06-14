import { NextRequest, NextResponse } from "next/server";

// 카카오 주소 검색 API (지번/도로명 → 위도/경도)
// https://developers.kakao.com/docs/latest/ko/local/dev-guide#address-coord
const KAKAO_API = "https://dapi.kakao.com/v2/local/search/address.json";

export type GeocodeResult = {
  lat: number;
  lng: number;
  roadAddress: string;
  jibunAddress: string;
};

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const address = searchParams.get("address");
  const kakaoKey = searchParams.get("kakaoKey");

  if (!address) return NextResponse.json({ error: "address 필요" }, { status: 400 });
  if (!kakaoKey) return NextResponse.json({ error: "카카오 REST API 키가 없습니다. 설정 > API 키 설정에서 등록하세요." }, { status: 400 });

  try {
    const res = await fetch(`${KAKAO_API}?query=${encodeURIComponent(address)}&size=1`, {
      headers: { Authorization: `KakaoAK ${kakaoKey}` },
      next: { revalidate: 0 },
    });
    if (!res.ok) return NextResponse.json({ error: `카카오 API 오류: ${res.status}` }, { status: 502 });

    const data = await res.json();
    const doc = data?.documents?.[0];
    if (!doc) return NextResponse.json({ error: "주소를 찾을 수 없습니다." }, { status: 404 });

    const result: GeocodeResult = {
      lat: parseFloat(doc.y),
      lng: parseFloat(doc.x),
      roadAddress: doc.road_address?.address_name ?? "",
      jibunAddress: doc.address?.address_name ?? "",
    };
    return NextResponse.json(result);
  } catch (err) {
    return NextResponse.json({ error: `요청 실패: ${String(err)}` }, { status: 500 });
  }
}
