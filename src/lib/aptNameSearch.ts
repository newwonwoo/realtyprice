/**
 * 아파트 단지명 검색어 후보 생성 (직방/KB 검색 실패 시 자동 재시도용)
 *
 * 한국 아파트 등록명은 포털별로 다르게 표기되는 경우가 많음:
 *  - 특수문자: "S-클래스" → "S클래스" (직방은 하이픈 미지원)
 *  - 부제: "에듀하이" 같은 단어가 앞/뒤로 붙어 긴 이름 생성
 *  - 단지 번호: "1단지", "A동" 등 포털마다 포함/제외 다름
 *  - 브랜드 영문: "힐스테이트", "래미안", "e편한세상" 등
 *
 * 전략: 원본 → 특수문자 제거 → 브랜드 사전으로 분리 → 지역명+브랜드 / 브랜드+부제 / 브랜드만
 * 평균 4개 후보, 중복 제거
 */

// 알려진 브랜드 — 길이 내림차순 (부분 매칭 방지)
const KNOWN_BRANDS: string[] = [
  "e편한세상", "이편한세상", "힐스테이트", "래미안", "롯데캐슬",
  "아이파크", "푸르지오", "더샵", "SK뷰", "자이", "아크로",
  "포레나", "중흥", "호반베르디움", "호반", "써밋플레이스",
  "해링턴플레이스", "한양수자인", "리첸시아", "골든센트로", "트리마제",
].sort((a, b) => b.length - a.length);

// 단지명 뒤(또는 지역명 뒤)에 붙는 마케팅 부제 — 길이 내림차순
const KNOWN_SUFFIXES: string[] = [
  "더프리미어", "마리나베이", "메가트리아", "센터피스", "그랑블",
  "엘센트로", "골드파크", "스타시티", "크레시티", "리버파크",
  "리버하임", "팰리스", "포레스트", "더파크", "센트럴", "에듀하이",
  "마스터", "더힐", "더스타", "베르디움", "클래스",
].sort((a, b) => b.length - a.length);

// 괄호/특수문자 제거 후 정규화
function normalize(name: string): string {
  return name
    .replace(/[（）()\[\]【】]/g, " ")
    .replace(/[-·•]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

// 단지 번호/차수 suffix 제거
function stripComplexNo(name: string): string {
  return name
    .replace(/\s*(1|2|3|4|A|B|C)단지.*$/, "")
    .replace(/\d+차$/, "")
    .trim();
}

// text 끝에서 알려진 부제를 제거 → 못 찾으면 null
function stripKnownSuffix(text: string): string | null {
  for (const s of KNOWN_SUFFIXES) {
    if (text.endsWith(s)) return text.slice(0, -s.length);
  }
  return null;
}

/**
 * 검색어 후보 생성 — 우선순위 순서대로 반환
 *
 * 예: "마곡힐스테이트마스터" →
 *   ["마곡힐스테이트마스터", "마곡힐스테이트", "힐스테이트마스터", "힐스테이트"]
 *
 * 예: "중흥S-클래스에듀하이" →
 *   ["중흥S-클래스에듀하이", "중흥S클래스에듀하이", "중흥", "중흥S클래스", "중흥S클"]
 */
export function generateSearchCandidates(name: string): string[] {
  const candidates: string[] = [];
  const push = (c: string | null | undefined) => {
    const s = c?.trim();
    if (s && s.length > 1 && !candidates.includes(s)) candidates.push(s);
  };

  // 1. 원본 그대로
  push(name.trim());

  // 2. 특수문자 제거
  const norm = normalize(name);
  push(norm);

  // 3. 단지번호/차수 제거
  push(stripComplexNo(norm));

  // 4. 브랜드 사전으로 분리 → 지역명+브랜드 / 브랜드+부제 / 브랜드만
  const normLower = norm.toLowerCase();
  for (const brand of KNOWN_BRANDS) {
    const idx = normLower.indexOf(brand.toLowerCase());
    if (idx === -1) continue;

    const actualBrand = norm.slice(idx, idx + brand.length);
    const prefix = norm.slice(0, idx);                   // 브랜드 앞 (지역명 ± 부제)
    const suffix = norm.slice(idx + brand.length);       // 브랜드 뒤 (부제 ± 단지번호)

    // 4a. 지역명+브랜드 (prefix + brand, suffix 제거)
    push(prefix + actualBrand);

    // 4b. 브랜드+부제 (suffix 있을 때, prefix 제거)
    if (suffix) push(actualBrand + suffix);

    // 4c. 브랜드만
    push(actualBrand);

    // 4d. 브랜드가 맨 앞에 올 때: suffix에서 부제를 떼어 지역명만 추출
    if (!prefix && suffix) {
      const loc = stripKnownSuffix(suffix);
      if (loc) push(actualBrand + loc);          // "래미안대치", "더샵송도"
      if (suffix.length > 2) push(actualBrand + suffix.slice(0, 2)); // 지역 2글자
    }

    // 4e. prefix 끝에 부제가 붙어있으면 떼어 순수 지역명+브랜드 생성
    if (prefix) {
      const cleanPrefix = stripKnownSuffix(prefix); // "사가정센트럴" → "사가정"
      if (cleanPrefix) push(cleanPrefix + actualBrand); // "사가정아이파크"
    }

    break; // 가장 긴 브랜드 1개만 사용
  }

  const seen = new Set<string>();
  return candidates.filter((c) => {
    if (!c || seen.has(c)) return false;
    seen.add(c);
    return true;
  });
}

/**
 * 두 이름이 같은 단지일 가능성 (검색 결과 자동 매칭 보조용)
 * 전용 면적이나 주소로 최종 확인하는 게 맞지만, 이름만으로 1차 필터링.
 */
export function isSameComplex(aptName: string, resultName: string): boolean {
  const a = normalize(aptName).toLowerCase();
  const b = normalize(resultName).toLowerCase();
  if (a === b) return true;
  // 한쪽이 다른 쪽을 포함하면 동일 단지 가능성 높음
  if (a.length > 4 && b.includes(a.slice(0, 4))) return true;
  if (b.length > 4 && a.includes(b.slice(0, 4))) return true;
  return false;
}
