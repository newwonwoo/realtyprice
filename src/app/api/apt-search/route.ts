import { NextRequest, NextResponse } from "next/server";

// 한국부동산원_공동주택 단지 식별정보 조회 서비스
// https://api.odcloud.kr/api/AptIdInfoSvc/v1/getAptInfo
const API_BASE = "https://api.odcloud.kr/api/AptIdInfoSvc/v1/getAptInfo";

export type AptSearchResult = {
  complexPk: string;
  name: string;
  address: string;
  households: number;
  builtDate: string;
  dongCount: number;
};

// URLSearchParams encodes [] as %5B%5D which breaks odcloud cond[] filter syntax.
// Build the URL manually so brackets stay literal, and pre-encode % as %25.
function buildUrl(field: string, value: string, serviceKey: string, perPage = 100): string {
  const keyEncoded = encodeURIComponent(serviceKey);
  const valueEncoded = encodeURIComponent(value);
  return `${API_BASE}?serviceKey=${keyEncoded}&page=1&perPage=${perPage}&cond[${field}::LIKE]=%25${valueEncoded}%25&cond[COMPLEX_GB_CD::EQ]=1`;
}

function toAptResult(item: Record<string, unknown>): AptSearchResult {
  return {
    complexPk: String(item["COMPLEX_PK"] ?? ""),
    name: String(item["COMPLEX_NM1"] ?? ""),
    address: String(item["ADRES"] ?? ""),
    households: Number(item["UNIT_CNT"] ?? 0),
    builtDate: String(item["USEAPR_DT"] ?? ""),
    dongCount: Number(item["DONG_CNT"] ?? 0),
  };
}

async function fetchField(field: string, value: string, serviceKey: string): Promise<Record<string, unknown>[]> {
  try {
    const url = buildUrl(field, value, serviceKey);
    const res = await fetch(url, { headers: { Accept: "application/json" }, next: { revalidate: 0 } });
    if (!res.ok) return [];
    const data = await res.json();
    return (data?.data ?? []) as Record<string, unknown>[];
  } catch {
    return [];
  }
}

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const serviceKey = searchParams.get("serviceKey");
  const keyword = searchParams.get("keyword") ?? "";

  if (!serviceKey) return NextResponse.json({ error: "공공데이터포털 API 키가 없습니다. 설정 > API 키 설정에서 등록하세요." }, { status: 400 });
  if (!keyword.trim()) return NextResponse.json({ error: "검색어를 입력하세요." }, { status: 400 });

  try {
    const kw = keyword.trim();
    const kwNoSpace = kw.replace(/\s+/g, "");
    // 키워드를 단어 단위로 분리 (공백 기준)
    const words = kw.split(/\s+/).filter((t) => t.length >= 2);

    const seenPk = new Set<string>();
    const allRaw: Record<string, unknown>[] = [];
    const merge = (batch: Record<string, unknown>[]) => {
      for (const item of batch) {
        const pk = String(item["COMPLEX_PK"] ?? "");
        if (pk && !seenPk.has(pk)) { seenPk.add(pk); allRaw.push(item); }
      }
    };

    let strategies: Promise<Record<string, unknown>[]>[];

    if (kw.includes(" ")) {
      // 공백 있는 키워드 (예: "경기 오산시", "성동 자이"):
      // 각 단어를 ADRES와 COMPLEX_NM1 양쪽으로 병렬 검색
      strategies = words.flatMap((w) => [
        fetchField("COMPLEX_NM1", w, serviceKey),
        fetchField("ADRES", w, serviceKey),
      ]);
    } else {
      // 공백 없는 순수 단지명 (예: "힐스테이트레이크"):
      // API는 주소(ADRES) 기반 검색이 핵심이라 단지명만으론 결과가 제한적.
      // 지역명을 포함하지 않은 경우 힌트 메시지를 내려보냄.
      return NextResponse.json(
        { items: [], total: 0, hint: "지역명을 포함해서 검색하면 더 정확합니다. 예: \"인천 힐스테이트레이크\", \"송도 더샵\", \"오산 금강\"" },
        { status: 200 }
      );
    }

    const batches = await Promise.all(strategies);
    batches.forEach(merge);

    // ── 후처리 필터 ─────────────────────────────────────────────────
    // 공백 기준 검색(지역 검색)과 이름 검색을 분리해서 처리
    const items = allRaw.map(toAptResult).filter((item) => {
      if (!item.complexPk || !item.name) return false;
      const nameNoSpace = item.name.replace(/\s+/g, "");
      const addrNoSpace = item.address.replace(/\s+/g, "");

      if (kw.includes(" ")) {
        // 지역 검색: 모든 단어가 이름 또는 주소에 하나씩 포함되어 있으면 통과
        return words.every((w) =>
          nameNoSpace.includes(w) || item.name.includes(w) ||
          addrNoSpace.includes(w) || item.address.includes(w)
        );
      } else {
        // 이름 검색: 공백제거 후 양방향 포함 (DB에 공백 있어도 매칭)
        // "힐스테이트레이크" ↔ "힐스테이트레이크송도" (nameNoSpace)
        return nameNoSpace.includes(kwNoSpace)
          || kwNoSpace.includes(nameNoSpace)
          || addrNoSpace.includes(kwNoSpace);
      }
    });

    return NextResponse.json({ items, total: items.length });
  } catch (err) {
    return NextResponse.json({ error: `요청 실패: ${String(err)}` }, { status: 500 });
  }
}
