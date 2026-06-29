"use client";

import { useState } from "react";
import type { Apartment } from "@/types/apartment";
import type { Listing } from "@/types/listing";
import { normalizeToBGrade } from "@/lib/grade";
import { useRealtyStore } from "@/lib/clientStore";
import { formatEok } from "@/lib/format";
import { generateSearchCandidates } from "@/lib/aptNameSearch";

export type ApartmentRole = "target" | "leader" | "comparable";

export interface ApartmentWithRole {
  apartment: Apartment;
  role: ApartmentRole;
}

interface Props {
  apartments: ApartmentWithRole[];
}

const ROLE_LABEL: Record<ApartmentRole, string> = {
  target: "대상",
  leader: "대장",
  comparable: "비교",
};

// 신축·분양권 단지는 직방/KB에 아직 미등록인 게 정상 → '실패'가 아닌 '미등록(정상)'으로 구분
function isPreCompletion(apt?: Apartment): boolean {
  if (!apt) return false;
  const ym = apt.expectedMoveInYm;
  if (ym && /^\d{6}$/.test(ym)) {
    const now = new Date();
    const cur = now.getFullYear() * 100 + (now.getMonth() + 1);
    if (Number(ym) >= cur) return true; // 입주예정월이 현재 이후 = 입주 전
  }
  return /블록|분양권/.test(apt.name);
}
const ROLE_COLOR: Record<ApartmentRole, string> = {
  target: "bg-blue-100 text-blue-700",
  leader: "bg-violet-100 text-violet-700",
  comparable: "bg-slate-100 text-slate-600",
};

// ── 직방 타입 (클라이언트 직접 호출) ──────────────────────────────
type ZbListing = {
  itemId: string;
  tradeType: string;
  price: number;
  area: number;
  floor: number;
  description: string;
};

type ZbComplex = { complexId: string; complexName: string; address: string };

type ZbState = {
  loading: boolean;
  searchQuery: string;
  // 결과
  reasonCode: string; // ok | disambiguation | complex_not_found | no_listings | blocked | error
  reason: string;     // 원인 상세 메시지
  complexList: ZbComplex[];
  selectedId: string;
  sale: ZbListing[];
  jeonse: ZbListing[];
};

// ── KB 타입 (서버 라우트 경유 — 시세용) ───────────────────────────
type KbComplex = { complexNo: string; name: string; address: string };
type KbAreaType = { areaNo: string; exclusiveArea: number; supplyArea: number; typeName: string; hasPrice: boolean };
type KbPrice = {
  baseDate: string;
  saleGeneral: number; saleUpper: number; saleLower: number;
  jeonseGeneral: number; jeonseUpper: number; jeonseLower: number;
};

type KbState = {
  loading: boolean;
  searchQuery: string; // 사용자가 수정 가능한 KB 검색어
  reasonCode: string;  // ok | complex_not_found | no_area_types | no_priced_area | no_price_data | blocked | error
  reason: string;
  complexList: KbComplex[];
  selectedNo: string;
  areaTypes: KbAreaType[];
  prices: { area: KbAreaType; price: KbPrice | null; reason?: string }[];
};

const ZB_BASE = "https://apis.zigbang.com";
const ZB_HEADERS = {
  "Accept": "application/json, text/plain, */*",
  "Accept-Language": "ko-KR,ko;q=0.9",
  "Origin": "https://www.zigbang.com",
  "Referer": "https://www.zigbang.com/",
};

// ── KB 브라우저 직접 호출 (사용자 한국 IP 사용 — Vercel 서버 IP 차단 우회) ──
// 서버 라우트(/api/kb-price)와 동일 파싱. CORS로 막히면 throw → 호출부에서 서버 폴백.
const KB_BASE = "https://api.kbland.kr";
const kbNum = (v: unknown): number => { const n = Number(v); return Number.isFinite(n) ? n : 0; };

type KbCollectResult = {
  reasonCode: string; reason?: string; complexNo?: string;
  complexList: KbComplex[]; areaTypes: KbAreaType[];
  prices: { area: KbAreaType; price: KbPrice | null; reason?: string }[];
};

async function kbBrowserFetch(url: string): Promise<unknown> {
  // throw on network/CORS — 호출부가 잡아서 서버 폴백
  const res = await fetch(url, { headers: { "Accept": "application/json, text/plain, */*", "webService": "1" }, signal: AbortSignal.timeout(8000) });
  if (!res.ok) {
    const e = new Error(`HTTP ${res.status}`); (e as Error & { httpStatus?: number }).httpStatus = res.status; throw e;
  }
  return res.json();
}

async function kbBrowserCollect(aptName: string, complexNo: string | undefined, area?: number): Promise<KbCollectResult> {
  let resolvedNo = complexNo ?? "";
  let complexList: KbComplex[] = [];

  if (!resolvedNo) {
    const sData = await kbBrowserFetch(`${KB_BASE}/land-complex/serch/intgraSerch?검색설정명=SRC_NTOTAL&검색키워드=${encodeURIComponent(aptName)}&출력갯수=50&페이지설정값=1`);
    const items = ((sData as Record<string, unknown>)?.dataBody as Record<string, unknown>)?.data as Record<string, unknown> | undefined;
    const rows = ((items?.data as Record<string, unknown>)?.HSCM as Record<string, unknown>)?.data as Record<string, unknown>[] ?? [];
    complexList = rows.map((x) => ({ complexNo: String(x.COMPLEX_NO ?? ""), name: String(x.HSCM_NM ?? ""), address: String(x.BUBADDR ?? "") })).filter((c) => c.complexNo);
    if (!complexList.length) return { reasonCode: "complex_not_found", reason: `KB부동산에서 "${aptName}" 단지를 찾지 못했습니다.`, complexList: [], areaTypes: [], prices: [] };
    if (complexList.length > 1 && !complexNo) return { reasonCode: "disambiguation", complexList, areaTypes: [], prices: [] };
    resolvedNo = complexList[0].complexNo;
  }

  const aData = await kbBrowserFetch(`${KB_BASE}/land-complex/complex/mpriByType?단지기본일련번호=${resolvedNo}`);
  const aItems = ((aData as Record<string, unknown>)?.dataBody as Record<string, unknown>)?.data as Record<string, unknown>[] ?? [];
  const allAreas: KbAreaType[] = aItems.map((x) => ({
    areaNo: String(x.면적일련번호 ?? ""), exclusiveArea: kbNum(x.전용면적), supplyArea: kbNum(x.공급면적),
    typeName: String(x.주택형타입내용 ?? ""), hasPrice: String(x.시세제공여부 ?? "") === "1",
  })).filter((a) => a.areaNo);
  if (!allAreas.length) return { complexNo: resolvedNo, complexList, areaTypes: [], prices: [], reasonCode: "no_area_types", reason: "KB에 면적 정보가 아직 등록되지 않았습니다." };

  const priced = allAreas.filter((a) => a.hasPrice);
  // 시세제공=Y 없으면 전체 면적으로 실제 데이터 조회 시도
  const candidateAreas = priced.length > 0 ? priced : allAreas;
  let selected = candidateAreas;
  if (area) { const t = Number(area); selected = [candidateAreas.reduce((b, a) => Math.abs(a.exclusiveArea - t) < Math.abs(b.exclusiveArea - t) ? a : b)]; }

  const prices = await Promise.all(selected.map(async (a) => {
    const pData = await kbBrowserFetch(`${KB_BASE}/land-price/price/BasePrcInfoNew?단지기본일련번호=${resolvedNo}&면적일련번호=${a.areaNo}`);
    const series = ((pData as Record<string, unknown>)?.dataBody as Record<string, unknown>)?.data as Record<string, unknown> | undefined;
    const r = (series?.시세 as Record<string, unknown>[]) ?? [];
    if (!r.length) return { area: a, price: null as KbPrice | null, reason: "KB에 해당 면적 시세 데이터가 없습니다." };
    const latest = r[0];
    return { area: a, price: {
      baseDate: String(latest.시세기준년월일 ?? latest.기준년월일 ?? ""),
      saleGeneral: kbNum(latest.매매일반거래가), saleUpper: kbNum(latest.매매상한가), saleLower: kbNum(latest.매매하한가),
      jeonseGeneral: kbNum(latest.전세일반거래가), jeonseUpper: kbNum(latest.전세상한가), jeonseLower: kbNum(latest.전세하한가),
    } as KbPrice };
  }));
  const hasAny = prices.some((p) => p.price !== null);
  return { complexNo: resolvedNo, complexList, areaTypes: allAreas, prices, reasonCode: hasAny ? "ok" : "no_price_data", reason: hasAny ? undefined : "KB 시세 데이터가 없습니다." };
}

// apt의 저장된 별칭 우선, 없으면 단지명
const defaultZb = (apt?: Apartment): ZbState => ({
  loading: false, searchQuery: apt?.zigbangSearchQuery ?? apt?.name ?? "",
  reasonCode: "", reason: "",
  complexList: [], selectedId: "", sale: [], jeonse: [],
});
const defaultKb = (apt?: Apartment): KbState => ({
  loading: false, searchQuery: apt?.kbSearchQuery ?? apt?.name ?? "", reasonCode: "", reason: "",
  complexList: [], selectedNo: "", areaTypes: [], prices: [],
});

// 직방 원인 코드 → 사용자 메시지
function zbReasonMsg(code: string, reason: string): { text: string; isError: boolean } {
  if (!code || code === "ok") return { text: "", isError: false };
  return { text: reason || code, isError: code !== "disambiguation" };
}

// KB 원인 코드 → UI 색상
function kbReasonColor(code: string) {
  if (!code || code === "ok") return "";
  if (code === "blocked" || code === "upstream_error" || code === "error") return "text-red-500";
  return "text-amber-600"; // no_price 계열 — 데이터 문제지 서버 문제가 아님
}

export function ListingFetcher({ apartments }: Props) {
  const store = useRealtyStore();
  const [selectedAptId, setSelectedAptId] = useState(apartments[0]?.apartment.id ?? "");
  const [batchRunning, setBatchRunning] = useState(false);
  const [batchProgress, setBatchProgress] = useState("");

  const [zbStates, setZbStates] = useState<Record<string, ZbState>>({});
  const [kbStates, setKbStates] = useState<Record<string, KbState>>({});
  const [batchResult, setBatchResult] = useState<{ success: number; fail: number; failNames: string[]; pendingNames: string[] } | null>(null);

  const selectedEntry = apartments.find((a) => a.apartment.id === selectedAptId) ?? apartments[0];
  const apt = selectedEntry?.apartment;

  const zb = zbStates[selectedAptId] ?? defaultZb(apt);
  const kb = kbStates[selectedAptId] ?? defaultKb(apt);

  function patchZb(id: string, patch: Partial<ZbState>) {
    setZbStates((p) => ({ ...p, [id]: { ...(p[id] ?? defaultZb(apt)), ...patch } }));
  }
  function patchKb(id: string, patch: Partial<KbState>) {
    setKbStates((p) => ({ ...p, [id]: { ...(p[id] ?? defaultKb(apt)), ...patch } }));
  }

  // 성공한 검색어를 apt 레코드에 영구 저장
  function saveZbAlias(aptId: string, query: string) {
    const target = store.apartments.find((a) => a.id === aptId);
    if (!target || target.zigbangSearchQuery === query) return;
    store.setApartments(store.apartments.map((a) =>
      a.id === aptId ? { ...a, zigbangSearchQuery: query, updatedAt: new Date().toISOString() } : a
    ));
  }
  function saveKbAlias(aptId: string, query: string) {
    const target = store.apartments.find((a) => a.id === aptId);
    if (!target || target.kbSearchQuery === query) return;
    store.setApartments(store.apartments.map((a) =>
      a.id === aptId ? { ...a, kbSearchQuery: query, updatedAt: new Date().toISOString() } : a
    ));
  }

  // ── 직방: 브라우저에서 직접 호출 (Vercel IP 차단 우회) ──────────
  async function zbSearchOne(query: string): Promise<{ complexList: ZbComplex[]; reasonCode: string; reason: string }> {
    try {
      // 하이픈은 URL 안전문자 — encodeURIComponent가 %2D로 변환하면 Zigbang이 못 찾음
      const zbQ = encodeURIComponent(query).replace(/%2D/gi, "-");
      const res = await fetch(`${ZB_BASE}/v2/search?serviceType=아파트&q=${zbQ}`, {
        headers: ZB_HEADERS,
        signal: AbortSignal.timeout(8000),
      });
      if (!res.ok) {
        const code = res.status === 403 || res.status === 429 ? "blocked" : res.status >= 500 ? "upstream_error" : "error";
        return { complexList: [], reasonCode: code, reason: `직방 단지검색 실패 (HTTP ${res.status}).` };
      }
      const data = await res.json();
      const items = (data?.items ?? data?.data ?? []) as Record<string, unknown>[];
      const list = items
        .filter((x) => x.itemType === "complex" || x.type === "complex" || x.complex_id || x.complexId)
        .map((x) => ({
          complexId: String(x.complex_id ?? x.complexId ?? x.id ?? ""),
          complexName: String(x.name ?? x.complexName ?? x.complex_name ?? ""),
          address: String(x.address ?? x.roadAddress ?? ""),
        }))
        .filter((c) => c.complexId);
      if (!list.length) return { complexList: [], reasonCode: "complex_not_found", reason: "" };
      return { complexList: list, reasonCode: list.length > 1 ? "disambiguation" : "ok", reason: "" };
    } catch (err) {
      // 브라우저 직접 실패(CORS/네트워크) → 서버 라우트(icn1) 폴백
      try {
        const res = await fetch(`/api/zigbang-listings?aptName=${encodeURIComponent(query)}`);
        const data = await res.json();
        const list = (data?.complexList ?? []) as ZbComplex[];
        if (data?.reasonCode && data.reasonCode !== "ok" && data.reasonCode !== "disambiguation" && !list.length) {
          return { complexList: [], reasonCode: data.reasonCode, reason: data.reason ?? String(err) };
        }
        return { complexList: list, reasonCode: list.length > 1 ? "disambiguation" : list.length ? "ok" : "complex_not_found", reason: data?.reason ?? "" };
      } catch (e2) {
        return { complexList: [], reasonCode: "error", reason: `직방 브라우저·서버 양쪽 모두 실패: ${String(e2)}` };
      }
    }
  }

  // 자동 재시도: 후보 검색어를 순서대로 시도, 성공하면 그 검색어를 별칭으로 저장
  async function zbSearch(aptId: string, firstQuery: string, region?: string): Promise<{ complexList: ZbComplex[]; reasonCode: string; reason: string; usedQuery: string }> {
    const candidates = generateSearchCandidates(firstQuery, region);
    let lastResult = { complexList: [] as ZbComplex[], reasonCode: "complex_not_found", reason: "", usedQuery: firstQuery };

    for (const candidate of candidates) {
      const r = await zbSearchOne(candidate);
      if (r.reasonCode === "blocked" || r.reasonCode === "upstream_error" || r.reasonCode === "error") {
        // 네트워크/차단 오류면 재시도 의미 없음
        return { ...r, usedQuery: candidate };
      }
      if (r.reasonCode === "ok" || r.reasonCode === "disambiguation") {
        // 성공 → 사용된 검색어를 별칭으로 저장 (원본과 다를 때만)
        if (candidate !== firstQuery) saveZbAlias(aptId, candidate);
        return { ...r, usedQuery: candidate };
      }
      lastResult = { ...r, usedQuery: candidate };
    }

    // 모든 후보 실패
    return {
      complexList: [],
      reasonCode: "complex_not_found",
      reason: `직방에서 "${firstQuery}" 단지를 찾지 못했습니다. 자동 정제된 검색어(${candidates.slice(1).join(" → ")})로도 실패했습니다. 검색어를 직접 수정하거나 직방 앱에서 등록명을 확인하세요.`,
      usedQuery: lastResult.usedQuery,
    };
  }

  async function zbFetchListings(complexId: string, tradeType: "매매" | "전세"): Promise<ZbListing[]> {
    try {
      const res = await fetch(
        `${ZB_BASE}/v2/complex/${complexId}/items?tradeType=${encodeURIComponent(tradeType)}&serviceType=아파트`,
        { headers: ZB_HEADERS, signal: AbortSignal.timeout(8000) }
      );
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      const items = (data?.items ?? data?.data ?? []) as Record<string, unknown>[];
      return items.map((a) => ({
        itemId: String(a.itemId ?? a.id ?? ""),
        tradeType: String(a.tradeType ?? tradeType),
        price: Number(a.price ?? 0),
        area: Number(a.area ?? a.supplyArea ?? 0),
        floor: Number(a.floor ?? 0),
        description: String(a.description ?? a.memo ?? ""),
      }));
    } catch {
      // 브라우저 직접 실패 → 서버 라우트(icn1) 폴백
      try {
        const type = tradeType === "매매" ? "sale" : "jeonse";
        const res = await fetch(`/api/zigbang-listings?complexId=${encodeURIComponent(complexId)}&type=${type}`);
        const data = await res.json();
        const arr = (type === "sale" ? data?.saleListings : data?.jeonseListings) ?? [];
        return (arr as Record<string, unknown>[]).map((a) => ({
          itemId: String(a.itemId ?? a.id ?? ""),
          tradeType: String(a.tradeType ?? tradeType),
          price: Number(a.price ?? 0),
          area: Number(a.area ?? a.supplyArea ?? 0),
          floor: Number(a.floor ?? 0),
          description: String(a.description ?? a.memo ?? ""),
        }));
      } catch {
        return [];
      }
    }
  }

  async function fetchZigbang(complexId?: string) {
    if (!apt) return;
    const query = (zbStates[apt.id]?.searchQuery ?? apt.zigbangSearchQuery ?? apt.name).trim() || apt.name;
    patchZb(apt.id, { loading: true, reasonCode: "", reason: "", sale: [], jeonse: [] });

    let resolvedId = complexId ?? "";
    if (!resolvedId) {
      const s = await zbSearch(apt.id, query, apt.region);
      // 자동 정제로 검색어가 바뀌었으면 입력창에도 반영
      if (s.usedQuery !== query) patchZb(apt.id, { searchQuery: s.usedQuery });
      patchZb(apt.id, { complexList: s.complexList, reasonCode: s.reasonCode, reason: s.reason });
      if (s.reasonCode !== "ok") { patchZb(apt.id, { loading: false }); return; }
      resolvedId = s.complexList[0].complexId;
      if (s.complexList.length > 1) { patchZb(apt.id, { loading: false, selectedId: s.complexList[0].complexId }); return; }
    }

    const [sale, jeonse] = await Promise.all([
      zbFetchListings(resolvedId, "매매"),
      zbFetchListings(resolvedId, "전세"),
    ]);
    const total = sale.length + jeonse.length;
    patchZb(apt.id, {
      loading: false, sale, jeonse,
      reasonCode: total > 0 ? "ok" : "no_listings",
      reason: total > 0 ? "" : "단지는 찾았으나 직방에 현재 등록 매물이 0건입니다. 분양권·신축 입주 전이거나 실제 매물이 없는 상태일 수 있습니다.",
    });
    // 수집 즉시 자동 저장
    if (sale.length > 0) importZigbang(sale, "sale");
    if (jeonse.length > 0) importZigbang(jeonse, "jeonse");
  }

  // 전체 일괄 수집 → 자동 저장
  async function fetchAndImportAll() {
    setBatchRunning(true);
    setBatchResult(null);
    const today = new Date().toISOString().slice(0, 10);
    const allImported: Listing[] = [];
    const failNames: string[] = [];
    const pendingNames: string[] = []; // 신축·분양권 미등록(정상)
    let successCount = 0;
    try {

    for (let i = 0; i < apartments.length; i++) {
      const { apartment: a } = apartments[i];
      setBatchProgress(`${i + 1}/${apartments.length} — ${a.name} 직방 수집중…`);
      const query = (zbStates[a.id]?.searchQuery ?? a.zigbangSearchQuery ?? a.name).trim() || a.name;
      setZbStates((p) => ({ ...p, [a.id]: { ...(p[a.id] ?? defaultZb(a)), loading: true, reasonCode: "", reason: "" } }));

      const s = await zbSearch(a.id, query, a.region);
      if (s.reasonCode !== "ok" || !s.complexList.length) {
        setZbStates((p) => ({ ...p, [a.id]: { ...(p[a.id] ?? defaultZb(a)), loading: false, reasonCode: s.reasonCode, reason: s.reason, complexList: s.complexList } }));
      } else {
        const complexId = s.complexList[0].complexId;
        const [sale, jeonse] = await Promise.all([zbFetchListings(complexId, "매매"), zbFetchListings(complexId, "전세")]);

        const toListing = (ls: ZbListing[], type: "sale" | "jeonse"): Listing[] =>
          ls.map((l) => ({
            id: `listing_zb_${a.id}_${l.itemId}`,
            apartmentId: a.id,
            listingType: type,
            exclusiveArea: l.area,
            askingPrice: l.price,
            floor: l.floor || undefined,
            grade: "B" as const,
            adjustedAskingPrice: normalizeToBGrade(l.price, "B"),
            source: "manual" as const,
            listingKey: `zb_${a.id}_${l.itemId}`,
            capturedAt: today,
            status: "active" as const,
            memo: l.description || undefined,
          }));

        allImported.push(...toListing(sale, "sale"), ...toListing(jeonse, "jeonse"));
        const total = sale.length + jeonse.length;
        setZbStates((p) => ({
          ...p,
          [a.id]: {
            ...(p[a.id] ?? defaultZb(a)), loading: false,
            searchQuery: s.usedQuery,
            complexList: s.complexList, sale, jeonse,
            reasonCode: total > 0 ? "ok" : "no_listings",
            reason: total > 0 ? "" : "단지 찾음. 직방 등록 매물 0건.",
          },
        }));
      }

      // KB 시세 수집 → store.listings에 저장 (가격 모델이 읽을 수 있도록)
      setBatchProgress(`${i + 1}/${apartments.length} — ${a.name} KB시세 수집중…`);
      const kbQuery = (kbStates[a.id]?.searchQuery ?? a.kbSearchQuery ?? a.name).trim() || a.name;
      setKbStates((p) => ({ ...p, [a.id]: { ...(p[a.id] ?? defaultKb(a)), loading: true } }));
      const kbCandidates = generateSearchCandidates(kbQuery, a.region);
      let kbDone = false;
      for (const candidate of kbCandidates) {
        const { data, ok } = await kbSearchOne(candidate, a.defaultArea);
        const code = (data.reasonCode as string) ?? (ok ? "ok" : "error");
        if (code === "blocked" || code === "upstream_error" || code === "error") {
          setKbStates((p) => ({ ...p, [a.id]: { ...(p[a.id] ?? defaultKb(a)), loading: false, reasonCode: code, reason: (data.reason as string) ?? "" } }));
          kbDone = true; break;
        }
        if (code === "complex_not_found") continue;
        // 단지 찾음 (시세 있든 없든)
        if (candidate !== kbQuery) saveKbAlias(a.id, candidate);
        const prices = (data.prices as { area: KbAreaType; price: KbPrice | null }[]) ?? [];
        setKbStates((p) => ({
          ...p,
          [a.id]: { ...(p[a.id] ?? defaultKb(a)), loading: false, searchQuery: candidate, reasonCode: code, reason: (data.reason as string) ?? "", areaTypes: (data.areaTypes as KbAreaType[]) ?? [], prices },
        }));
        // KB 시세를 Listing으로 변환하여 저장
        for (const { area, price } of prices) {
          if (!price) continue;
          if (price.saleGeneral > 0) {
            allImported.push({
              id: `listing_kb_${a.id}_${area.areaNo}_sale`,
              apartmentId: a.id,
              listingType: "sale",
              exclusiveArea: area.exclusiveArea,
              askingPrice: price.saleGeneral,
              grade: "B" as const,
              adjustedAskingPrice: normalizeToBGrade(price.saleGeneral, "B"),
              source: "kb" as const,
              listingKey: `kb_${a.id}_${area.areaNo}_sale`,
              capturedAt: today,
              status: "active" as const,
              memo: `KB시세 ${price.baseDate} (상한${formatEok(price.saleUpper)}/하한${formatEok(price.saleLower)})`,
            });
          }
          if (price.jeonseGeneral > 0) {
            allImported.push({
              id: `listing_kb_${a.id}_${area.areaNo}_jeonse`,
              apartmentId: a.id,
              listingType: "jeonse",
              exclusiveArea: area.exclusiveArea,
              askingPrice: price.jeonseGeneral,
              grade: "B" as const,
              adjustedAskingPrice: normalizeToBGrade(price.jeonseGeneral, "B"),
              source: "kb" as const,
              listingKey: `kb_${a.id}_${area.areaNo}_jeonse`,
              capturedAt: today,
              status: "active" as const,
              memo: `KB전세시세 ${price.baseDate} (상한${formatEok(price.jeonseUpper)}/하한${formatEok(price.jeonseLower)})`,
            });
          }
        }
        kbDone = true; break;
      }
      if (!kbDone) {
        const pre = isPreCompletion(a);
        setKbStates((p) => ({ ...p, [a.id]: { ...(p[a.id] ?? defaultKb(a)), loading: false, reasonCode: pre ? "pre_completion" : "complex_not_found", reason: pre ? `신축·분양권 — KB 미등록은 정상입니다 (입주 후 등록)` : `KB에서 "${kbQuery}" 미발견` } }));
        if (pre) pendingNames.push(a.name); else failNames.push(a.name);
      } else {
        successCount++;
      }
    }

    const existingKeys = new Set(store.listings.map((l: Listing) => l.listingKey));
    const newOnes = allImported.filter((l) => !existingKeys.has(l.listingKey));
    if (newOnes.length > 0) store.setListings([...newOnes, ...store.listings]);
    const result = { success: successCount, fail: failNames.length, failNames, pendingNames };
    setBatchResult(result);
    const pendingTxt = pendingNames.length > 0 ? ` · 미등록(신축) ${pendingNames.length}개` : "";
    setBatchProgress(`완료 — 성공 ${successCount}개 / 실패 ${failNames.length}개${pendingTxt} · ${newOnes.length}건 신규 저장`);
    } catch (e) {
      setBatchProgress(`수집 중 오류 발생: ${String(e)}`);
    } finally {
      setBatchRunning(false);
    }
  }

  function importZigbang(listings: ZbListing[], type: "sale" | "jeonse") {
    if (!apt) return;
    const today = new Date().toISOString().slice(0, 10);
    const imported: Listing[] = listings.map((l) => ({
      id: `listing_zb_${apt.id}_${l.itemId}`,
      apartmentId: apt.id,
      listingType: type,
      exclusiveArea: l.area,
      askingPrice: l.price,
      floor: l.floor || undefined,
      grade: "B" as const,
      adjustedAskingPrice: normalizeToBGrade(l.price, "B"),
      source: "manual" as const,
      listingKey: `zb_${apt.id}_${l.itemId}`,
      capturedAt: today,
      status: "active" as const,
      memo: l.description || undefined,
    }));
    const existingKeys = new Set(store.listings.map((l) => l.listingKey));
    const newOnes = imported.filter((l) => !existingKeys.has(l.listingKey));
    store.setListings([...newOnes, ...store.listings]);
    patchZb(apt.id, { reason: `${newOnes.length}건 저장 (중복 ${imported.length - newOnes.length}건 제외)` });
  }

  // ── KB시세 조회: 브라우저 직접(한국 가정용 IP) 우선 → 실패 시 서버 라우트 폴백 ──
  // 브라우저가 CORS/네트워크로 throw하면 서버(icn1) 경유로 재시도. 둘 다 막히면 차단 확정.
  async function kbSearchOne(aptName: string, area?: number): Promise<{ data: Record<string, unknown>; ok: boolean; via?: string }> {
    try {
      const data = await kbBrowserCollect(aptName, undefined, area) as unknown as Record<string, unknown>;
      return { data, ok: true, via: "browser" };
    } catch {
      // 브라우저 직접 실패(CORS/차단/네트워크) → 서버 라우트 폴백
      const params = new URLSearchParams({ aptName });
      if (area) params.set("area", String(area));
      try {
        const res = await fetch(`/api/kb-price?${params}`);
        const data = await res.json();
        return { data, ok: res.ok, via: "server" };
      } catch (e) {
        return { data: { reasonCode: "error", reason: `KB 브라우저·서버 양쪽 모두 실패: ${String(e)}` }, ok: false };
      }
    }
  }

  async function fetchKb(complexNo?: string) {
    if (!apt) return;
    patchKb(apt.id, { loading: true, reasonCode: "", reason: "" });

    if (complexNo) {
      // 단지번호로 직접 조회 (사용자가 선택) — 브라우저 직접 우선, 실패 시 서버 폴백
      try {
        const data = await kbBrowserCollect("", complexNo, apt.defaultArea);
        patchKb(apt.id, { loading: false, reasonCode: data.reasonCode ?? "ok", reason: data.reason ?? "", complexList: [], selectedNo: complexNo, areaTypes: data.areaTypes ?? [], prices: data.prices ?? [] });
        if ((data.reasonCode ?? "ok") === "ok") saveKbToStore(data.prices);
        return;
      } catch {
        // 브라우저 실패 → 서버 폴백
      }
      const params = new URLSearchParams({ complexNo });
      if (apt.defaultArea) params.set("area", String(apt.defaultArea));
      try {
        const res = await fetch(`/api/kb-price?${params}`);
        const data = await res.json();
        patchKb(apt.id, { loading: false, reasonCode: data.reasonCode ?? "ok", reason: data.reason ?? "", complexList: [], selectedNo: complexNo, areaTypes: data.areaTypes ?? [], prices: data.prices ?? [] });
        if ((data.reasonCode ?? "ok") === "ok") saveKbToStore(data.prices);
      } catch (e) {
        patchKb(apt.id, { loading: false, reasonCode: "error", reason: `KB 브라우저·서버 양쪽 모두 실패: ${String(e)}` });
      }
      return;
    }

    const firstQuery = (kbStates[apt.id]?.searchQuery ?? apt.kbSearchQuery ?? apt.name).trim() || apt.name;
    const candidates = generateSearchCandidates(firstQuery, apt.region);

    for (const candidate of candidates) {
      const { data, ok } = await kbSearchOne(candidate, apt.defaultArea);
      const code = (data.reasonCode as string) ?? (ok ? "ok" : "error");

      // 차단/오류면 중단
      if (code === "blocked" || code === "upstream_error" || code === "error") {
        patchKb(apt.id, { loading: false, reasonCode: code, reason: (data.reason as string) ?? "KB 조회 실패", searchQuery: candidate });
        return;
      }
      // 복수 단지 → 선택 필요
      if ((data.complexList as KbComplex[])?.length > 1) {
        patchKb(apt.id, { loading: false, reasonCode: "disambiguation", reason: `유사 단지 ${(data.complexList as KbComplex[]).length}곳 검색됨. 단지를 선택하세요.`, complexList: data.complexList as KbComplex[], selectedNo: (data.complexList as KbComplex[])[0]?.complexNo ?? "", searchQuery: candidate });
        return;
      }
      // 성공 (시세가 있든 없든 단지를 찾았으면)
      if (code !== "complex_not_found") {
        if (candidate !== firstQuery) {
          saveKbAlias(apt.id, candidate);
          patchKb(apt.id, { searchQuery: candidate });
        }
        const fetchedPrices = (data.prices as { area: KbAreaType; price: KbPrice | null; reason?: string }[]) ?? [];
        patchKb(apt.id, { loading: false, reasonCode: code, reason: (data.reason as string) ?? "", complexList: [], selectedNo: (data.complexList as KbComplex[])?.[0]?.complexNo ?? "", areaTypes: (data.areaTypes as KbAreaType[]) ?? [], prices: fetchedPrices });
        // 조회 즉시 자동 저장 (state 업데이트 전이므로 prices 직접 전달)
        if (code === "ok") saveKbToStore(fetchedPrices);
        return;
      }
    }

    // 모든 후보 실패
    patchKb(apt.id, {
      loading: false,
      reasonCode: "complex_not_found",
      reason: `KB부동산에서 "${firstQuery}" 단지를 찾지 못했습니다. 자동 정제된 검색어(${candidates.slice(1).join(" → ")})로도 실패했습니다. KB에 미등록(신규분양·준공전)이거나 검색어를 직접 수정하세요.`,
    });
  }

  function saveKbToStore(prices?: { area: KbAreaType; price: KbPrice | null }[]) {
    if (!apt) return;
    const today = new Date().toISOString().slice(0, 10);
    const imported: Listing[] = [];
    for (const { area, price } of (prices ?? kb.prices)) {
      if (!price) continue;
      if (price.saleGeneral > 0) imported.push({
        id: `listing_kb_${apt.id}_${area.areaNo}_sale`,
        apartmentId: apt.id, listingType: "sale",
        exclusiveArea: area.exclusiveArea, askingPrice: price.saleGeneral,
        grade: "B", adjustedAskingPrice: normalizeToBGrade(price.saleGeneral, "B"),
        source: "kb", listingKey: `kb_${apt.id}_${area.areaNo}_sale`,
        capturedAt: today, status: "active",
        memo: `KB시세 ${price.baseDate}`,
      });
      if (price.jeonseGeneral > 0) imported.push({
        id: `listing_kb_${apt.id}_${area.areaNo}_jeonse`,
        apartmentId: apt.id, listingType: "jeonse",
        exclusiveArea: area.exclusiveArea, askingPrice: price.jeonseGeneral,
        grade: "B", adjustedAskingPrice: normalizeToBGrade(price.jeonseGeneral, "B"),
        source: "kb", listingKey: `kb_${apt.id}_${area.areaNo}_jeonse`,
        capturedAt: today, status: "active",
        memo: `KB전세시세 ${price.baseDate}`,
      });
    }
    const existingKeys = new Set(store.listings.map((l) => l.listingKey));
    const newOnes = imported.filter((l) => !existingKeys.has(l.listingKey));
    store.setListings([...newOnes, ...store.listings]);
  }

  if (!apt) return (
    <div className="card p-10 text-center text-slate-400">
      <p className="text-lg font-semibold mb-2">등록된 단지가 없습니다</p>
      <p className="text-sm">먼저 <a href="/targets" className="text-blue-600 underline">대상아파트</a>를 추가한 후 매물을 수집하세요.</p>
    </div>
  );

  const listingCount = store.listings.filter((l) => l.apartmentId === apt.id).length;

  return (
    <div className="card p-5 space-y-4">
      {/* 전체 일괄 수집 */}
      <div className="flex items-center gap-3">
        <button
          className="btn-primary text-sm px-4 py-2 whitespace-nowrap"
          disabled={batchRunning}
          onClick={fetchAndImportAll}
        >
          {batchRunning ? "수집중…" : `전체 수집 (${apartments.length}개 단지 · 직방+KB)`}
        </button>
        {batchProgress && (
          <span className={`text-sm ${batchRunning ? "text-blue-600" : batchResult && batchResult.fail > 0 ? "text-amber-700 font-semibold" : "text-emerald-700 font-semibold"}`}>
            {batchProgress}
          </span>
        )}
      </div>
      {batchResult && batchResult.fail > 0 && (
        <div className="rounded border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
          <span className="font-semibold">KB 미발견 단지:</span> {batchResult.failNames.join(", ")}
          <span className="ml-2 text-amber-600">(검색어를 수동으로 수정하거나 KB 미등록 단지일 수 있습니다)</span>
        </div>
      )}
      {batchResult && batchResult.pendingNames.length > 0 && (
        <div className="rounded border border-blue-200 bg-blue-50 px-3 py-2 text-xs text-blue-700">
          <span className="font-semibold">신축·분양권 (직방/KB 미등록 정상):</span> {batchResult.pendingNames.join(", ")}
          <span className="ml-2 text-blue-500">입주 후 자동 등록됩니다. 실거래(분양권)는 국토부에서 수집하세요.</span>
        </div>
      )}

      {/* 단지 선택 */}
      <div className="flex flex-wrap gap-2">
        {apartments.map(({ apartment: a, role }) => {
          const cnt = store.listings.filter((l) => l.apartmentId === a.id).length;
          const zbS = zbStates[a.id];
          const kbS = kbStates[a.id];
          const hasError = (zbS?.reasonCode && !["ok","disambiguation","","no_listings","pre_completion"].includes(zbS.reasonCode)) ||
                           (kbS?.reasonCode && !["ok","disambiguation","","no_price_data","no_priced_area","pre_completion"].includes(kbS.reasonCode));
          return (
            <button
              key={a.id}
              onClick={() => setSelectedAptId(a.id)}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm font-semibold border transition-colors ${
                a.id === selectedAptId
                  ? "border-blue-500 bg-blue-50 text-blue-700"
                  : "border-slate-200 bg-white text-slate-600 hover:bg-slate-50"
              }`}
            >
              <span className={`text-xs px-1.5 py-0.5 rounded ${ROLE_COLOR[role]}`}>{ROLE_LABEL[role]}</span>
              {a.name}
              {cnt > 0 && <span className="ml-1 text-xs bg-emerald-100 text-emerald-700 px-1.5 rounded-full">{cnt}건</span>}
              {hasError && <span className="ml-1 text-xs text-red-400">!</span>}
            </button>
          );
        })}
      </div>

      {/* 선택 단지 저장 현황 */}
      {listingCount > 0 && (
        <p className="text-xs text-slate-500">
          {apt.name} — 저장된 데이터 {listingCount}건
          ({store.listings.filter((l) => l.apartmentId === apt.id && l.source === "kb").length}건 KB시세 포함)
        </p>
      )}

      {/* ── 직방 + KB 나란히 ── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">

        {/* 직방 호가 */}
        <div className="space-y-2">
          <div className="flex items-center gap-2 pb-1 border-b">
            <span className="text-sm font-bold text-orange-600">직방 호가</span>
            {zb.loading && <span className="text-xs text-slate-400">수집중…</span>}
            {zb.reasonCode === "ok" && <span className="text-xs text-emerald-600">매매 {zb.sale.length} · 전세 {zb.jeonse.length}건</span>}
          </div>

          <div className="flex items-center gap-2">
            <input
              className="input flex-1 text-sm"
              value={zb.searchQuery ?? apt.name}
              onChange={(e) => patchZb(apt.id, { searchQuery: e.target.value })}
              placeholder="직방 검색어"
              onKeyDown={(e) => e.key === "Enter" && fetchZigbang()}
            />
            <button className="btn-primary text-sm px-3 py-1.5 whitespace-nowrap" disabled={zb.loading} onClick={() => fetchZigbang()}>
              수집
            </button>
          </div>

          {zb.complexList.length > 1 && (
            <div className="flex gap-2">
              <select className="input flex-1 text-sm" value={zb.selectedId} onChange={(e) => patchZb(apt.id, { selectedId: e.target.value })}>
                {zb.complexList.map((c) => (
                  <option key={c.complexId} value={c.complexId}>{c.complexName} ({c.address})</option>
                ))}
              </select>
              <button className="btn-primary text-sm px-2" onClick={() => fetchZigbang(zb.selectedId || zb.complexList[0].complexId)}>선택</button>
            </div>
          )}

          {zb.reasonCode && !["ok","disambiguation"].includes(zb.reasonCode) && (() => {
            const zbPre = zb.reasonCode === "complex_not_found" && isPreCompletion(apt);
            return (
              <div className={`rounded border px-3 py-2 text-xs ${zbPre ? "bg-blue-50 border-blue-200 text-blue-700" : "bg-red-50 border-red-200 text-red-700"}`}>
                <span className="font-semibold">
                  {zbPre ? "신축·분양권 (미등록 정상)" : zb.reasonCode === "complex_not_found" ? "단지 미발견" : zb.reasonCode === "no_listings" ? "매물 없음" : "오류"}
                </span>
                {zbPre
                  ? <span className="ml-1 text-blue-500">직방은 입주 후 등록됩니다. 분양권 실거래는 국토부에서 수집하세요.</span>
                  : zb.reason && <span className="ml-1 text-red-500">{zb.reason}</span>}
              </div>
            );
          })()}

          {zb.sale.length > 0 && (
            <div>
              <div className="flex items-center justify-between mb-1">
                <span className="text-xs font-semibold text-slate-600">매매 {zb.sale.length}건</span>
                <span className="text-xs text-emerald-600">자동저장됨</span>
              </div>
              <div className="max-h-36 overflow-y-auto rounded border divide-y text-xs">
                {zb.sale.map((l) => (
                  <div key={l.itemId} className="flex items-center gap-2 px-2 py-1.5">
                    <span className="font-semibold">{formatEok(l.price)}</span>
                    <span className="text-slate-400">{l.area}㎡·{l.floor}층</span>
                    {l.description && <span className="text-slate-400 truncate flex-1">{l.description}</span>}
                  </div>
                ))}
              </div>
            </div>
          )}

          {zb.jeonse.length > 0 && (
            <div>
              <div className="flex items-center justify-between mb-1">
                <span className="text-xs font-semibold text-slate-600">전세 {zb.jeonse.length}건</span>
                <span className="text-xs text-emerald-600">자동저장됨</span>
              </div>
              <div className="max-h-36 overflow-y-auto rounded border divide-y text-xs">
                {zb.jeonse.map((l) => (
                  <div key={l.itemId} className="flex items-center gap-2 px-2 py-1.5">
                    <span className="font-semibold">{formatEok(l.price)}</span>
                    <span className="text-slate-400">{l.area}㎡·{l.floor}층</span>
                    {l.description && <span className="text-slate-400 truncate flex-1">{l.description}</span>}
                  </div>
                ))}
              </div>
            </div>
          )}

          {!zb.reasonCode && !zb.loading && (
            <p className="text-xs text-slate-400">수집 버튼을 눌러 직방 매물을 가져오세요.</p>
          )}
        </div>

        {/* KB 시세 */}
        <div className="space-y-2">
          <div className="flex items-center gap-2 pb-1 border-b">
            <span className="text-sm font-bold text-blue-700">KB 시세</span>
            {kb.loading && <span className="text-xs text-slate-400">조회중…</span>}
            {kb.reasonCode === "ok" && <span className="text-xs text-emerald-600">시세 {kb.prices.filter(p => p.price).length}개 면적</span>}
          </div>

          <div className="flex items-center gap-2">
            <input
              className="input flex-1 text-sm"
              value={kb.searchQuery ?? apt.name}
              onChange={(e) => patchKb(apt.id, { searchQuery: e.target.value })}
              placeholder="KB 검색어"
              onKeyDown={(e) => e.key === "Enter" && fetchKb()}
            />
            <button className="btn-primary text-sm px-3 py-1.5 whitespace-nowrap" disabled={kb.loading} onClick={() => fetchKb()}>
              조회
            </button>
          </div>

          {kb.complexList.length > 1 && (
            <div className="flex gap-2">
              <select className="input flex-1 text-sm" value={kb.selectedNo} onChange={(e) => patchKb(apt.id, { selectedNo: e.target.value })}>
                {kb.complexList.map((c) => (
                  <option key={c.complexNo} value={c.complexNo}>{c.name} ({c.address})</option>
                ))}
              </select>
              <button className="btn-primary text-sm px-2" onClick={() => fetchKb(kb.selectedNo)}>선택</button>
            </div>
          )}

          {kb.reasonCode && kb.reasonCode !== "ok" && (
            <div className={`rounded border px-3 py-2 text-xs ${
              ["blocked","upstream_error","error"].includes(kb.reasonCode)
                ? "bg-red-50 border-red-200 text-red-700"
                : kb.reasonCode === "pre_completion"
                ? "bg-blue-50 border-blue-200 text-blue-700"
                : "bg-amber-50 border-amber-200 text-amber-700"
            }`}>
              <span className="font-semibold">
                {kb.reasonCode === "pre_completion" ? "신축·분양권 (미등록 정상)" :
                 kb.reasonCode === "complex_not_found" ? "KB 미등록" :
                 kb.reasonCode === "no_area_types" ? "면적 미등록" :
                 kb.reasonCode === "no_price_data" ? "시세 없음" :
                 kb.reasonCode === "blocked" ? "접근 차단" : "오류"}
              </span>
              {kb.reason && <span className="ml-1">{kb.reason}</span>}
            </div>
          )}

          {kb.prices.length > 0 && (
            <div>
              <div className="flex items-center justify-between mb-1">
                <span className="text-xs font-semibold text-slate-600">{kb.prices.filter(p => p.price).length}개 면적 시세</span>
                <span className="text-xs text-emerald-600">자동저장됨</span>
              </div>
              <div className="rounded border divide-y text-xs">
                {kb.prices.map(({ area, price, reason }) => (
                  <div key={area.areaNo} className="px-3 py-2">
                    <p className="font-semibold text-slate-700 mb-1">{area.typeName} ({area.exclusiveArea}㎡)</p>
                    {price ? (
                      <div className="grid grid-cols-2 gap-x-4 gap-y-0.5 text-slate-600">
                        <span>매매</span><span className="font-semibold text-slate-800">{formatEok(price.saleGeneral)}</span>
                        <span>매매 상/하한</span><span>{formatEok(price.saleUpper)} / {formatEok(price.saleLower)}</span>
                        <span>전세</span><span className="font-semibold text-slate-800">{formatEok(price.jeonseGeneral)}</span>
                        <span>전세 상/하한</span><span>{formatEok(price.jeonseUpper)} / {formatEok(price.jeonseLower)}</span>
                        <span className="col-span-2 text-slate-400 mt-0.5">기준: {price.baseDate}</span>
                      </div>
                    ) : (
                      <p className="text-amber-600">{reason || "시세 없음"}</p>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {kb.prices.length === 0 && !kb.loading && !kb.reasonCode && (
            <p className="text-xs text-slate-400">조회 버튼을 눌러 KB시세를 확인하세요.</p>
          )}
        </div>
      </div>
    </div>
  );
}
