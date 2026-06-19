import { NextRequest, NextResponse } from "next/server";
import { LEADER_APARTMENTS } from "@/lib/leaderApartments";

const API_BASE = "https://api.odcloud.kr/api/AptIdInfoSvc/v1/getAptInfo";

function buildUrl(serviceKey: string, name: string) {
  let key = serviceKey;
  try { key = decodeURIComponent(serviceKey); } catch { /* keep */ }
  return (
    `${API_BASE}?serviceKey=${encodeURIComponent(key)}&page=1&perPage=100` +
    `&cond[COMPLEX_NM1::LIKE]=${encodeURIComponent(name)}&cond[COMPLEX_GB_CD::EQ]=1`
  );
}

interface AptResult {
  complexPk: string;
  name: string;
  address: string;
  households: number;
}

const BRANDS = [
  "래미안", "푸르지오", "자이", "힐스테이트", "롯데캐슬", "아이파크", "더샵",
  "e편한세상", "이편한세상", "센트레빌", "포레나", "베르디움", "아크로", "트리마제",
  "위시티", "더헤리티지", "에듀포레", "그랑블", "엘크루", "골드스카이", "골든파크",
];

// 검색어 변형 생성: 풀네임이 0건일 때 핵심 토큰으로 재검색해 후보를 확보한다.
function nameVariants(name: string): string[] {
  const variants = new Set<string>();
  variants.add(name);
  // 끝의 단지번호/차수 제거: "목동신시가지7단지" → "목동신시가지", "이천롯데캐슬2차" → "이천롯데캐슬"
  const noSuffix = name.replace(/\d+(단지|차)$/g, "").replace(/(단지|차)$/g, "");
  if (noSuffix && noSuffix !== name) variants.add(noSuffix);
  // 지역 접두 제거: "마포래미안푸르지오" → 브랜드만 남기지 않고, 앞 2~3글자 지명 제거 시도
  // 브랜드 토큰 단독 검색은 노이즈가 크므로, 지명+브랜드 조합을 우선한다.
  for (const b of BRANDS) {
    if (name.includes(b)) {
      const idx = name.indexOf(b);
      const prefix = name.slice(0, idx); // 브랜드 앞 지명
      if (prefix.length >= 2) variants.add(prefix + b);
      // 지명만으로도 검색 (단지명이 지명 위주인 경우)
      if (prefix.length >= 3) variants.add(prefix);
    }
  }
  return Array.from(variants).filter((v) => v.length >= 2);
}

async function searchOnce(serviceKey: string, term: string): Promise<AptResult[]> {
  const res = await fetch(buildUrl(serviceKey, term), {
    headers: { Accept: "application/json" },
    signal: AbortSignal.timeout(8000),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`HTTP ${res.status}: ${text.slice(0, 200)}`);
  }
  const data = await res.json();
  return (data?.data ?? []).map((it: Record<string, unknown>) => ({
    complexPk: String(it["COMPLEX_PK"] ?? ""),
    name: String(it["COMPLEX_NM1"] ?? ""),
    address: String(it["ADRES"] ?? ""),
    households: Number(it["UNIT_CNT"] ?? 0),
  }));
}

// 풀네임 → 변형어 순으로 검색, 결과를 complexPk 기준 합산(중복 제거)
async function searchMulti(serviceKey: string, name: string): Promise<AptResult[]> {
  const seen = new Map<string, AptResult>();
  for (const term of nameVariants(name)) {
    await new Promise((r) => setTimeout(r, 120));
    try {
      const rs = await searchOnce(serviceKey, term);
      for (const r of rs) if (r.complexPk && !seen.has(r.complexPk)) seen.set(r.complexPk, r);
    } catch {
      /* 한 변형 실패는 무시하고 다음 변형 시도 */
    }
    if (seen.size >= 40) break; // 후보 충분하면 중단
  }
  return Array.from(seen.values());
}

function scoreCandidate(entry: typeof LEADER_APARTMENTS[0], r: AptResult): number {
  const en = entry.name.replace(/\s/g, "");
  const rn = r.name.replace(/\s/g, "");
  let score = 0;
  if (rn === en) score += 100;
  else if (rn.includes(en) || en.includes(rn)) score += 60;
  else {
    // 공통 접두 길이 기반 부분점수
    let common = 0;
    while (common < Math.min(rn.length, en.length) && rn[common] === en[common]) common++;
    if (common >= 3) score += common * 5;
  }
  if (entry.households && r.households) {
    const ratio = Math.min(entry.households, r.households) / Math.max(entry.households, r.households);
    score += ratio * 20;
  }
  // 지역(시군구) 주소 일치
  const regionParts = entry.region.split(/\s+/);
  const gu = regionParts[regionParts.length - 1]; // 가장 세분 단위 (구/시)
  if (gu && r.address.includes(gu)) score += 25;
  return Math.round(score);
}

export async function POST(req: NextRequest) {
  const { serviceKey } = await req.json();
  if (!serviceKey) {
    return NextResponse.json({ error: "serviceKey 필요" }, { status: 400 });
  }

  const results = [];

  for (const entry of LEADER_APARTMENTS) {
    try {
      const apiResults = await searchMulti(serviceKey, entry.name);
      // 시군구 단위로 1차 필터 (없으면 전체)
      const regionParts = entry.region.split(/\s+/);
      const gu = regionParts[regionParts.length - 1];
      const inRegion = apiResults.filter((r) => gu && r.address.includes(gu));
      const pool = inRegion.length ? inRegion : apiResults;
      // 점수순 상위 5개 후보
      const candidates = pool
        .map((r) => ({ ...r, score: scoreCandidate(entry, r) }))
        .sort((a, b) => b.score - a.score)
        .slice(0, 5);
      const best = candidates[0];
      results.push({
        region: entry.region,
        originalName: entry.name,
        originalAddress: entry.address,
        originalHouseholds: entry.households ?? "",
        existingComplexPk: entry.complexPk ?? "",
        candidates,
        // 기존 complexPk가 이미 있으면 확정 상태로 표시
        status: entry.complexPk
          ? "확정됨"
          : best && best.score >= 80
          ? "강력추천"
          : best && best.score >= 50
          ? "후보있음"
          : "매칭실패",
      });
    } catch (e) {
      results.push({
        region: entry.region,
        originalName: entry.name,
        originalAddress: entry.address,
        originalHouseholds: entry.households ?? "",
        existingComplexPk: entry.complexPk ?? "",
        candidates: [],
        status: `오류: ${(e as Error).message.slice(0, 80)}`,
      });
    }
  }

  return NextResponse.json({ results });
}
