import { NextRequest, NextResponse } from "next/server";

// 주택도시보증공사(HUG) 지역별 ㎡당 분양가격(지역) Open API
// 프로그램ID: priceDistributedPrice3dot3
// ⚠️ 이 API는 JSON이 아니라 XML로 응답한다(공식 프로그램사양서 확인됨).
//    이 앱엔 XML 파서가 없어서, 이 API의 단순/평탄한 구조(<item> 반복)에 맞춘
//    최소 태그 추출기만 둔다 — 범용 XML 파싱이 필요해지면 그때 라이브러리 도입.
const BASE = "https://www.khug.or.kr/priceDistributedPrice3dot3.do";

export type HugPriceItem = {
  areaCode: string;   // 지역코드 (01~17)
  areaName: string;   // 지역명
  yearMonth: string;  // 연월 (YYYYMM)
  price: number;      // 가격 — 단위 미확인(공식 문서에 단위 명시 없음), 확인 전까지 원본값 그대로 전달
};

function extractTag(xml: string, tag: string): string | undefined {
  const m = xml.match(new RegExp(`<${tag}>([^<]*)</${tag}>`));
  return m ? m[1] : undefined;
}

function parseItems(xml: string): HugPriceItem[] {
  const blocks = xml.match(/<item>[\s\S]*?<\/item>/g) ?? [];
  return blocks.map((block) => ({
    areaCode: extractTag(block, "AREA_DCD") ?? "",
    areaName: extractTag(block, "AREA_DCD_NM") ?? "",
    yearMonth: extractTag(block, "YEAR_MM") ?? "",
    price: Number(extractTag(block, "YEAR_VAL") ?? "0"),
  }));
}

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const apiKey = searchParams.get("apiKey") ?? process.env.HUG_API_KEY ?? "";
  const startYym = searchParams.get("startYym");
  const endYym = searchParams.get("endYym");
  const areaDcd = searchParams.get("areaDcd");

  if (!apiKey) return NextResponse.json({ error: "HUG API 키가 없습니다." }, { status: 400 });
  if (!startYym || !endYym || !areaDcd) {
    return NextResponse.json({ error: "startYym, endYym, areaDcd가 모두 필요합니다." }, { status: 400 });
  }

  const url = `${BASE}?API_KEY=${encodeURIComponent(apiKey)}&START_YYM=${encodeURIComponent(startYym)}&END_YYM=${encodeURIComponent(endYym)}&AREA_DCD=${encodeURIComponent(areaDcd)}`;

  try {
    const res = await fetch(url, { headers: { Accept: "application/xml, text/xml" }, next: { revalidate: 3600 } });
    if (!res.ok) {
      const body = await res.text().catch(() => "");
      return NextResponse.json({ error: `HUG API 요청 실패 (HTTP ${res.status})`, detail: body.slice(0, 300) }, { status: res.status });
    }
    const xml = await res.text();
    const resultCode = extractTag(xml, "resultCode") ?? "";
    const resultMsg = extractTag(xml, "resultMsg") ?? "";
    if (resultCode && resultCode !== "00") {
      return NextResponse.json({ error: `HUG API 오류: ${resultMsg || resultCode}`, resultCode }, { status: 502 });
    }
    const items = parseItems(xml);
    return NextResponse.json({ items, resultCode, resultMsg });
  } catch (err) {
    return NextResponse.json({ error: `요청 실패: ${String(err)}` }, { status: 500 });
  }
}
