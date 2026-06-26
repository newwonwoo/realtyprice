/**
 * 아파트 단지명 검색어 후보 생성 (직방/KB 검색 실패 시 자동 재시도용)
 *
 * 한국 아파트 등록명은 포털별로 다르게 표기되는 경우가 많음:
 *  - 특수문자: "S-클래스" → "S클래스" (직방은 하이픈 미지원)
 *  - 부제: "에듀하이" 같은 마케팅 펫네임이 앞/뒤로 붙어 긴 이름 생성
 *  - 단지 번호: "1단지", "A동" 등 포털마다 포함/제외 다름
 *  - 브랜드 표기 차이: "e편한세상" ↔ "이편한세상", 하이픈 유무
 *
 * 전략: 원본 → 특수문자 제거 → 브랜드 사전으로 분리 → 지역+브랜드/브랜드+부제/브랜드만
 * 브랜드 별칭(e편한세상↔이편한세상)도 자동 생성, 평균 4개 이상 후보 반환
 */

// 알려진 브랜드 — 길이 내림차순 (부분 매칭 방지)
const KNOWN_BRANDS: string[] = [
  // 대형사
  "e편한세상", "이편한세상", "힐스테이트", "래미안", "롯데캐슬",
  "아이파크", "푸르지오", "두산위브", "더샵", "SK뷰", "자이",
  "아크로", "포레나",
  // 중견사
  "중흥", "호반베르디움", "호반써밋", "호반",
  "금호어울림", "금호",
  "반도유보라", "반도",
  "우미린", "우미",
  "대방노블랜드", "대방",
  "써밋플레이스", "써밋",
  "해링턴플레이스", "해링턴",
  "한양수자인", "한양",
  "리첸시아", "골든센트로", "트리마제",
  "신안인스빌", "우방아이유쉘", "제일풍경채",
  "엠코헤리츠", "동원로얄듀크",
].sort((a, b) => b.length - a.length);

// 브랜드 별칭 — 검색 실패 시 대체 표기로 추가 후보 생성
const BRAND_ALIASES: Record<string, string> = {
  "e편한세상": "이편한세상",
  "이편한세상": "e편한세상",
};

// 단지명 뒤(또는 지역명 뒤)에 붙는 마케팅 부제/펫네임 — 길이 내림차순
const KNOWN_SUFFIXES: string[] = [
  "더프리미어", "마리나베이", "메가트리아", "센터피스", "그랑블",
  "엘센트로", "골드파크", "스타시티", "크레시티", "리버파크",
  "리버하임", "팰리스", "포레스트", "더파크", "센트럴", "에듀하이",
  "마스터", "더힐", "더스타", "베르디움", "클래스",
  "더제니스", "더테라스", "포레", "더클래스", "파크뷰", "시티뷰",
  "루체하임", "레이크뷰", "더퍼스트", "퍼스트", "파라곤", "파크",
  // 중흥S-클래스 계열
  "S클래스에듀하이", "S-클래스에듀하이", "S클래스", "S-클래스",
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
 * 예: "e편한세상계양더프리미어" →
 *   ["e편한세상계양더프리미어", "e편한세상", "e편한세상계양", "이편한세상계양", ...]
 *
 * @param regionHint 아파트 주소/지역 (예: "경기도 오산시" → "오산" 추출해 지역+브랜드 후보 추가)
 */
export function generateSearchCandidates(name: string, regionHint?: string): string[] {
  const candidates: string[] = [];
  const push = (c: string | null | undefined) => {
    const s = c?.trim();
    if (s && s.length > 1 && !candidates.includes(s)) candidates.push(s);
  };

  // 1. 원본 그대로
  push(name.trim());

  // 1b. 하이픈을 공백으로 ("중흥S-클래스에듀하이" → "중흥S 클래스에듀하이")
  if (name.includes("-")) push(name.replace(/-/g, " ").replace(/\s+/g, " ").trim());

  // 2. 특수문자 제거
  const norm = normalize(name);
  push(norm);

  // 3. 단지번호/차수 제거
  push(stripComplexNo(norm));

  // 4. 브랜드 사전으로 분리
  const normLower = norm.toLowerCase();
  for (const brand of KNOWN_BRANDS) {
    const idx = normLower.indexOf(brand.toLowerCase());
    if (idx === -1) continue;

    const actualBrand = norm.slice(idx, idx + brand.length);
    const prefix = norm.slice(0, idx);                  // 브랜드 앞 (지역명 ± 부제)
    const suffix = norm.slice(idx + brand.length);      // 브랜드 뒤 (부제 ± 단지번호)
    const alias = BRAND_ALIASES[actualBrand];

    // 4a. 지역+브랜드 (suffix 제거)
    push(prefix + actualBrand);

    // 4b. 브랜드+부제 (prefix 제거)
    if (suffix) push(actualBrand + suffix);

    // 4c. 브랜드만
    push(actualBrand);

    // 4d. 브랜드 별칭 (e편한세상 ↔ 이편한세상) — prefix 없이 별칭만
    if (alias) {
      push(alias);                                       // 별칭만
      if (suffix) push(alias + suffix);                  // 별칭+부제
      push(prefix + alias);                              // 지역+별칭 (prefix가 있을 때만 의미 있음)
    }

    // 4e. 브랜드가 맨 앞에 올 때: suffix에서 지역명 추출
    if (!prefix && suffix) {
      // 공백 포함 버전 ("e편한세상 오산세교") — 직방이 공백으로 등록한 경우
      push(actualBrand + " " + suffix);
      if (alias) push(alias + " " + suffix);

      // 지역명만 단독 검색 ("오산세교") — disambiguation 허용
      push(suffix);

      const loc = stripKnownSuffix(suffix);
      if (loc) {
        push(actualBrand + loc);                         // "래미안대치", "더샵송도"
        if (alias) push(alias + loc);
      }
      if (suffix.length > 2) push(actualBrand + suffix.slice(0, 2)); // 지역 2글자
      const noNo = stripComplexNo(suffix);
      if (noNo !== suffix && alias) push(alias + noNo);
    }

    // 4f. prefix 끝에 부제가 붙어있으면 제거 → 순수 지역+브랜드
    if (prefix) {
      const cleanPrefix = stripKnownSuffix(prefix);     // "사가정센트럴" → "사가정"
      if (cleanPrefix) push(cleanPrefix + actualBrand); // "사가정아이파크"
    }

    // 4g. regionHint: 지역명을 앞에 붙여서 추가 후보 생성
    // (예: 오산 + 중흥 → "오산중흥", "오산중흥S클래스에듀하이")
    if (regionHint) {
      // "경기도 오산시" → ["오산시", "오산"] 추출
      const regionTokens = regionHint
        .replace(/경기도|서울특별시|인천광역시|경기|서울/g, "")
        .split(/\s+/)
        .map((t) => t.replace(/(시|군|구)$/, "").trim())
        .filter((t) => t.length >= 2);
      for (const loc of regionTokens) {
        push(loc + actualBrand);              // "오산중흥"
        if (suffix) push(loc + actualBrand + suffix); // "오산중흥S클래스에듀하이"
        if (alias) push(loc + alias);
      }
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
