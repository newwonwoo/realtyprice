// 공공임대(LH·SH 등) 판별 — 민간 시세 비교 불가하므로 비교단지에서 제외
// ⚠️ 단일 출처(SSOT): 비교추천 필터(ComparableSuggestions)와 자동제거(comparables/page) 모두 여기서 가져다 쓴다.
//    예전엔 두 곳에 리스트가 복붙돼 있었고("임대아파트" vs "임대") 서로 드리프트해 휴먼시아가 새어나갔다.

// 공공임대 브랜드/키워드 — 부동산원 공식 단지명에 자주 등장하는 표기
export const PUBLIC_HOUSING_BRANDS: string[] = [
  "휴먼시아",      // LH 대표 브랜드
  "뜨란채", "천년나무", "안단테", // LH 계열 펫네임
  "주공그린빌", "주공",          // 구 대한주택공사
  "행복주택", "국민임대", "공공임대", "영구임대", "장기전세", "매입임대", "마이홈",
  "임대아파트", "임대",          // 일반 임대 표기 (포괄)
  "LH", "SH",                   // 사업주체 약칭
];

// 단지명이 공공임대인지 판별. 대소문자 무시(LH/sh 등).
export function isPublicHousing(name?: string | null): boolean {
  if (!name) return false;
  const n = name.toLowerCase();
  return PUBLIC_HOUSING_BRANDS.some((b) => n.includes(b.toLowerCase()));
}
