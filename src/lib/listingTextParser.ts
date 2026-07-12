// 네이버부동산 등에서 사람이 복사해온 매물 목록 텍스트 → 구조화된 매물 후보로 파싱.
// 서버가 어디를 긁어오는 게 아니라, 사용자가 브라우저에서 직접 복사(Ctrl+C)한 텍스트를
// 붙여넣으면 가격·면적·층만 뽑아주는 순수 클라이언트 파서다.
// ⚠️ 사이트 화면 구성은 언제든 바뀔 수 있으므로 파싱 결과는 반드시 미리보기로 사람이
//    확인·수정한 뒤에만 저장한다 — 파서는 후보 추출기일 뿐 정답 생성기가 아니다.

export type ParsedListing = {
  tradeType: "sale" | "jeonse" | "monthly_rent";
  price: number;          // 만원. 월세는 보증금
  monthlyRent?: number;   // 만원 (월세만)
  exclusiveArea?: number; // ㎡
  floor?: number;
  rawLine: string;        // 어느 줄에서 나왔는지 — 미리보기에서 사람이 대조할 근거
};

// "12억 5,000" → 125000 / "12억" → 120000 / "9,500" → 9500 (만원 단위 표기)
export function parseKoreanPrice(text: string): number | null {
  const t = text.replace(/\s+/g, " ").trim();
  // 억 + 만원 조합
  const eokMatch = t.match(/(\d+(?:\.\d+)?)\s*억(?:\s*([\d,]+))?/);
  if (eokMatch) {
    const eok = parseFloat(eokMatch[1]);
    const rest = eokMatch[2] ? parseInt(eokMatch[2].replace(/,/g, ""), 10) : 0;
    if (!Number.isFinite(eok)) return null;
    return Math.round(eok * 10000 + (Number.isFinite(rest) ? rest : 0));
  }
  // 만원 단위 숫자만 ("9,500" 등) — 4자리 이상일 때만 (노이즈 방지)
  const plain = t.match(/^([\d,]{4,})$/);
  if (plain) {
    const v = parseInt(plain[1].replace(/,/g, ""), 10);
    return Number.isFinite(v) ? v : null;
  }
  return null;
}

// "112/84㎡" → 전용 84 (네이버 표기: 공급/전용) / "전용 84.97㎡" → 84.97 / "84㎡" → 84
export function parseArea(text: string): number | undefined {
  const dual = text.match(/(\d+(?:\.\d+)?)\s*\/\s*(\d+(?:\.\d+)?)\s*㎡/);
  if (dual) {
    const v = parseFloat(dual[2]); // 뒤가 전용
    return Number.isFinite(v) && v > 0 ? v : undefined;
  }
  const exclu = text.match(/전용\s*(\d+(?:\.\d+)?)\s*㎡?/);
  if (exclu) {
    const v = parseFloat(exclu[1]);
    return Number.isFinite(v) && v > 0 ? v : undefined;
  }
  const single = text.match(/(\d+(?:\.\d+)?)\s*㎡/);
  if (single) {
    const v = parseFloat(single[1]);
    return Number.isFinite(v) && v > 0 ? v : undefined;
  }
  return undefined;
}

// "12/25층" → 12 / "중/25층"·"고/25층"·"저/25층" → 층수 미상(undefined)
export function parseFloor(text: string): number | undefined {
  const m = text.match(/(\d+|[저중고])\s*\/\s*\d+\s*층/);
  if (!m) return undefined;
  const v = parseInt(m[1], 10);
  return Number.isFinite(v) ? v : undefined;
}

// 텍스트 전체 → 매물 후보 목록.
// 거래유형 키워드(매매/전세/월세)와 가격이 같은 줄(또는 인접 줄)에 함께 있어야만 후보로 인정.
export function parseListingText(text: string): ParsedListing[] {
  const lines = text.split(/\n+/).map((l) => l.trim()).filter(Boolean);
  const out: ParsedListing[] = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const tradeMatch = line.match(/(매매|전세|월세)/);
    if (!tradeMatch) continue;
    const tradeType = tradeMatch[1] === "매매" ? "sale" : tradeMatch[1] === "전세" ? "jeonse" : "monthly_rent";

    // 가격은 거래유형 키워드 뒤쪽 텍스트에서 우선 탐색
    const afterKeyword = line.slice(line.indexOf(tradeMatch[1]) + tradeMatch[1].length);

    if (tradeType === "monthly_rent") {
      // "월세 5,000/120" 형태: 보증금/월세
      const m = afterKeyword.match(/([\d,억\s]+?)\s*\/\s*([\d,]+)/);
      if (!m) continue;
      const deposit = parseKoreanPrice(m[1].trim());
      const rent = parseInt(m[2].replace(/,/g, ""), 10);
      if (deposit === null || !Number.isFinite(rent) || rent <= 0) continue;
      // 면적·층은 같은 줄 → 다음 줄 순으로 탐색 (네이버는 가격 줄과 상세 줄이 분리됨)
      const detail = `${line} ${lines[i + 1] ?? ""}`;
      out.push({ tradeType, price: deposit, monthlyRent: rent, exclusiveArea: parseArea(detail), floor: parseFloor(detail), rawLine: line });
      continue;
    }

    const price = parseKoreanPrice(afterKeyword);
    if (price === null || price <= 0) continue;
    const detail = `${line} ${lines[i + 1] ?? ""}`;
    out.push({ tradeType, price, exclusiveArea: parseArea(detail), floor: parseFloor(detail), rawLine: line });
  }

  return out;
}
