// 네이버페이 부동산(fin.land.naver.com) 지도 딥링크 생성.
// ⚠️ 비공식 스펙 — 네이버가 언제든 바꿀 수 있다. 매물 데이터를 서버에서 긁어오는 용도가
// 아니라, 사용자를 정확한 위치·조건으로 열린 네이버부동산 지도로 안내하는 용도로만 쓴다.
// 출처: 실기기(Android/SKT, Chrome) 검증된 참조 구현을 그대로 포팅(자체 테스트 12/12 통과 확인).
// realEstateTypes(매물유형) 코드는 "비아파트"(오피스텔·빌라·원룸·단독다가구) 조합만
// 실기기 검증되어 있고 "아파트" 코드는 미확인이라, 이 앱(아파트 전용)에서는 절대 추측해서
// 넣지 않고 생략한다 — 잘못 넣으면 아파트가 통째로 안 보이는 링크가 될 수 있다.

export const NAVER_LAND_BASE = "https://fin.land.naver.com/map";

const B62 = "0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ";
const OFFSET = 2_000_000_000; // 음수 좌표 제거용
const SCALE = 10_000_000; // 좌표 × 1e7

export const NAVER_TRADE = { SALE: "A1", JEONSE: "B1", MONTHLY: "B2" } as const;

function enc6(v: number): string {
  if (v < 0) throw new Error("음수는 인코딩 불가 (오프셋 적용 후 값이어야 함)");
  let s = "";
  let n = v;
  while (n > 0) {
    s = B62[n % 62] + s;
    n = Math.floor(n / 62);
  }
  return s.padStart(6, "0");
}

function dec(s: string): number {
  let v = 0;
  for (const ch of s) {
    const i = B62.indexOf(ch);
    if (i < 0) throw new Error(`base62 아닌 문자: ${ch}`);
    v = v * 62 + i;
  }
  return v;
}

// 위경도 → center 파라미터값 (경도가 앞, 위도가 뒤 — 명세서 §2-1)
export function encodeCenter(lat: number, lon: number): string {
  return `${enc6(Math.round(lon * SCALE) + OFFSET)}-${enc6(Math.round(lat * SCALE) + OFFSET)}`;
}

export function decodeCenter(center: string): { lat: number; lon: number } | null {
  if (!center || !center.includes("-")) return null;
  const [a, b] = center.split("-");
  return { lat: (dec(b) - OFFSET) / SCALE, lon: (dec(a) - OFFSET) / SCALE };
}

export function buildNaverLandUrl(opts: {
  lat?: number;
  lon?: number;
  trade?: string; // "A1"(매매) | "B1"(전세) | "B2"(월세), 복수는 "-"로 연결. 기본: 매매+전세
  dealMax?: number; // 매매가 상한(원)
  depositMax?: number; // 전세보증금 상한(원)
  spaceMin?: number; // 전용면적 하한(㎡)
  spaceMax?: number; // 전용면적 상한(㎡)
  zoom?: number;
}): string {
  const { lat, lon, trade = `${NAVER_TRADE.SALE}-${NAVER_TRADE.JEONSE}`, dealMax, depositMax, spaceMin, spaceMax, zoom = 16 } = opts;
  const p = new URLSearchParams({ zoom: String(zoom) });

  if (Number.isFinite(lat) && Number.isFinite(lon)) {
    const c = encodeCenter(lat as number, lon as number);
    // 왕복 자체검증 통과 못하면 좌표를 빼고 필터만 건다(잘못된 위치로 보내지 않는다)
    const back = decodeCenter(c);
    if (back && Math.abs(back.lat - (lat as number)) < 1e-6 && Math.abs(back.lon - (lon as number)) < 1e-6) {
      p.set("center", c);
    }
  }
  if (trade) p.set("tradeTypes", trade);
  if (Number.isFinite(dealMax)) p.set("dealPrice", `0-${Math.round(dealMax as number)}`);
  if (Number.isFinite(depositMax)) p.set("warrantyPrice", `0-${Math.round(depositMax as number)}`);
  if (Number.isFinite(spaceMin) || Number.isFinite(spaceMax)) {
    p.set("space", `${spaceMin ?? 0}-${spaceMax ?? 999}`);
  }

  return `${NAVER_LAND_BASE}?${p.toString()}`;
}
