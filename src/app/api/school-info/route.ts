import { NextRequest, NextResponse } from "next/server";

// NEIS 교육정보 공개포털 학교기본정보 API
// https://open.neis.go.kr/hub/schoolInfo
// KEY 없이도 SAMPLE 키로 일부 조회 가능
const NEIS_BASE = "https://open.neis.go.kr/hub/schoolInfo";

const SIDO_MAP: Record<string, string> = {
  "서울특별시": "서울", "부산광역시": "부산", "대구광역시": "대구",
  "인천광역시": "인천", "광주광역시": "광주", "대전광역시": "대전",
  "울산광역시": "울산", "세종특별자치시": "세종", "경기도": "경기",
  "강원특별자치도": "강원", "강원도": "강원", "충청북도": "충북",
  "충청남도": "충남", "전북특별자치도": "전북", "전라북도": "전북",
  "전라남도": "전남", "경상북도": "경북", "경상남도": "경남",
  "제주특별자치도": "제주",
};

export type SchoolInfo = {
  name: string;       // 학교명
  address: string;    // 도로명주소
  type: string;       // 학교종류명
};

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const address = searchParams.get("address") ?? ""; // e.g. "경기도 성남시 분당구"
  const apiKey = searchParams.get("apiKey") ?? "SAMPLE";

  if (!address) return NextResponse.json({ error: "address required" }, { status: 400 });

  const parts = address.split(" ").filter(Boolean);
  const sidoFull = parts[0] ?? "";
  const sigungu = parts[1] ?? "";
  const sido = SIDO_MAP[sidoFull] ?? sidoFull;

  const params = new URLSearchParams({
    KEY: apiKey,
    Type: "json",
    SCHUL_KND_SC_NM: "초등학교",
    LCTN_SC_NM: sido,
    pSize: "200",
    pIndex: "1",
  });

  try {
    const res = await fetch(`${NEIS_BASE}?${params.toString()}`, {
      next: { revalidate: 3600 }, // 1시간 캐시
    });
    if (!res.ok) return NextResponse.json({ schools: [], error: `NEIS API 오류: ${res.status}` });

    const data = await res.json();
    // NEIS API는 결과 없으면 RESULT 키로 오류 반환
    if (data?.RESULT?.CODE === "INFO-200") {
      return NextResponse.json({ schools: [] });
    }

    const rows: Record<string, string>[] = data?.schoolInfo?.[1]?.row ?? [];

    // 시군구 단위로 필터 (주소에 시군구명 포함 여부)
    const filtered = rows.filter((s) =>
      sigungu ? (s.ORG_RDNDA ?? "").includes(sigungu) : true
    );

    const schools: SchoolInfo[] = filtered.map((s) => ({
      name: s.SCHUL_NM ?? "",
      address: s.ORG_RDNDA ?? "",
      type: s.SCHUL_KND_SC_NM ?? "초등학교",
    }));

    return NextResponse.json({ schools, total: schools.length });
  } catch (err) {
    return NextResponse.json({ schools: [], error: `요청 실패: ${String(err)}` });
  }
}
