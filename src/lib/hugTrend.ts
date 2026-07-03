// HUG(주택도시보증공사) 지역별 ㎡당 민간아파트 분양가 시계열 → 전년비 추세(%) 산출.
// 가격모델의 "분양가 추세" 상승/하락 신호(upsideScore)에 투입한다.
// 데이터 출처: 공공데이터포털 15070256 "지역별 ㎡당 분양가격(지역)" / HUG priceDistributedPrice3dot3.
//   → /api/hug-presale-trend 라우트가 XML을 파싱해 { areaCode, areaName, yearMonth, price } 로 반환.

import type { HugPriceItem } from "@/app/api/hug-presale-trend/route";

// HUG AREA_DCD 지역코드(01~17). 시도명 기준.
// (교차검증: 공공데이터포털 15070256 사양 + HUG 오픈API 안내 기사, 2026-07)
export const HUG_AREA_CODES: Record<string, string> = {
  서울: "01", 부산: "02", 대구: "03", 인천: "04", 광주: "05", 대전: "06",
  경기: "07", 강원: "08", 충북: "09", 충남: "10", 전북: "11", 전남: "12",
  경북: "13", 경남: "14", 제주: "15", 울산: "16", 세종: "17",
};

// 주소·지역 문자열의 첫 시도 토큰 → HUG 지역코드. 없으면 undefined.
// "경기도"/"경기 오산시"/"서울특별시" 등 다양한 표기를 정규화해 매칭.
export function hugAreaCodeForRegion(regionOrAddress?: string): string | undefined {
  const s = (regionOrAddress ?? "").trim();
  if (!s) return undefined;
  const normalized = s
    .replace(/^서울특별시/, "서울").replace(/^인천광역시/, "인천").replace(/^부산광역시/, "부산")
    .replace(/^대구광역시/, "대구").replace(/^광주광역시/, "광주").replace(/^대전광역시/, "대전")
    .replace(/^울산광역시/, "울산").replace(/^세종특별자치시/, "세종")
    .replace(/^경기도/, "경기").replace(/^강원(특별자치)?도/, "강원")
    .replace(/^충청북도/, "충북").replace(/^충청남도/, "충남")
    .replace(/^전라북도/, "전북").replace(/^전북특별자치도/, "전북").replace(/^전라남도/, "전남")
    .replace(/^경상북도/, "경북").replace(/^경상남도/, "경남")
    .replace(/^제주(특별자치)?도/, "제주");
  const token = normalized.split(/\s+/)[0];
  return HUG_AREA_CODES[token];
}

// YYYYMM 정수 산술로 n개월 전 연월 구하기.
export function shiftYyyymm(yyyymm: string, deltaMonths: number): string {
  const y = parseInt(yyyymm.slice(0, 4), 10);
  const m = parseInt(yyyymm.slice(4, 6), 10);
  if (!y || !m) return yyyymm;
  const total = y * 12 + (m - 1) + deltaMonths;
  const ny = Math.floor(total / 12);
  const nm = (total % 12) + 1;
  return `${ny}${String(nm).padStart(2, "0")}`;
}

// 최근 분양가 대비 약 12개월 전 분양가의 변화율(%). 소수1자리.
// 정확히 -12개월 데이터가 없으면 그 값에 가장 가까운(연월 차 최소) 관측치를 사용.
// 관측치가 2개 미만이거나 기준값이 0이면 null(신호 비활성).
export function presalePriceYoYPct(items: HugPriceItem[]): number | null {
  const valid = items
    .filter((it) => it.yearMonth && it.yearMonth.length === 6 && it.price > 0)
    .sort((a, b) => a.yearMonth.localeCompare(b.yearMonth));
  if (valid.length < 2) return null;

  const latest = valid[valid.length - 1];
  const targetPrior = shiftYyyymm(latest.yearMonth, -12);
  const monthsBetween = (a: string, b: string) =>
    Math.abs((parseInt(a.slice(0, 4), 10) * 12 + parseInt(a.slice(4, 6), 10)) -
             (parseInt(b.slice(0, 4), 10) * 12 + parseInt(b.slice(4, 6), 10)));

  // 최근값 자신은 후보에서 제외하고, targetPrior에 가장 가까운 과거 관측치 선택.
  const priorCandidates = valid.filter((it) => it.yearMonth < latest.yearMonth);
  if (!priorCandidates.length) return null;
  const prior = priorCandidates.reduce((best, it) =>
    monthsBetween(it.yearMonth, targetPrior) < monthsBetween(best.yearMonth, targetPrior) ? it : best
  );
  if (prior.price <= 0) return null;

  const pct = ((latest.price - prior.price) / prior.price) * 100;
  return Math.round(pct * 10) / 10;
}
