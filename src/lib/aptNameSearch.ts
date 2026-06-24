/**
 * 아파트 단지명 검색어 후보 생성 (직방/KB 검색 실패 시 자동 재시도용)
 *
 * 한국 아파트 등록명은 포털별로 다르게 표기되는 경우가 많음:
 *  - 특수문자: "S-클래스" → "S클래스" (직방은 하이픈 미지원)
 *  - 부제: "에듀하이" 같은 단어가 앞/뒤로 붙어 긴 이름 생성
 *  - 단지 번호: "1단지", "A동" 등 포털마다 포함/제외 다름
 *  - 브랜드 영문: "힐스테이트", "래미안", "e편한세상" 등
 *
 * 전략: 원본 → 특수문자 제거 → 앞부분 단어들로 점진적 축소
 * 최대 5개 후보, 중복 제거
 */

// 아파트 이름에서 괄호/특수문자 제거 후 정규화
function normalize(name: string): string {
  return name
    .replace(/[（）()\[\]【】]/g, " ") // 괄호 제거
    .replace(/[-·•]/g, "")            // 하이픈·중점 제거
    .replace(/\s+/g, " ")
    .trim();
}

// 한글/영문/숫자 토큰으로 분리
function tokenize(name: string): string[] {
  return name
    .replace(/[^가-힣a-zA-Z0-9\s]/g, " ")
    .split(/\s+/)
    .filter(Boolean);
}

/**
 * 검색어 후보 생성 — 우선순위 순서대로 반환
 *
 * 예: "중흥S-클래스에듀하이" →
 *   ["중흥S-클래스에듀하이", "중흥S클래스에듀하이", "중흥에듀하이", "중흥S클래스", "중흥"]
 */
export function generateSearchCandidates(name: string): string[] {
  const candidates: string[] = [];

  // 1. 원본 그대로
  candidates.push(name.trim());

  // 2. 특수문자 제거 버전
  const norm = normalize(name);
  if (norm !== candidates[0]) candidates.push(norm);

  // 3. 토큰 분리 후 다양한 조합 시도
  const tokens = tokenize(norm);

  if (tokens.length >= 3) {
    // 앞 토큰 + 마지막 토큰 (중간 토큰 제거) — "중흥에듀하이"처럼
    const withoutMiddle = [tokens[0], tokens[tokens.length - 1]].join("");
    candidates.push(withoutMiddle);
  }

  if (tokens.length >= 2) {
    // 앞 N-1개 토큰 — "중흥S클래스"처럼
    const withoutLast = tokens.slice(0, -1).join("");
    candidates.push(withoutLast);
  }

  if (tokens.length >= 1) {
    // 첫 토큰만 — "중흥"
    candidates.push(tokens[0]);
  }

  // 단지 번호/유형 suffix 제거 패턴
  const withoutSuffix = name.replace(/\s*(1|2|3|4|A|B|C)단지.*$/, "").trim();
  if (withoutSuffix && withoutSuffix !== name) candidates.push(withoutSuffix);

  // 중복 제거 (순서 유지)
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
