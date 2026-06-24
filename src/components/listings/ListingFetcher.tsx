"use client";

import { useState } from "react";
import type { Apartment } from "@/types/apartment";
import type { Listing } from "@/types/listing";
import { normalizeToBGrade } from "@/lib/grade";
import { useRealtyStore } from "@/lib/clientStore";
import { formatEok } from "@/lib/format";

export type ApartmentRole = "target" | "leader" | "comparable";

export interface ApartmentWithRole {
  apartment: Apartment;
  role: ApartmentRole;
}

interface Props {
  apartments: ApartmentWithRole[];
}

type Tab = "zigbang" | "kb";

const ROLE_LABEL: Record<ApartmentRole, string> = {
  target: "대상",
  leader: "대장",
  comparable: "비교",
};
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

const defaultZb = (name = ""): ZbState => ({
  loading: false, searchQuery: name,
  reasonCode: "", reason: "",
  complexList: [], selectedId: "", sale: [], jeonse: [],
});
const defaultKb = (name = ""): KbState => ({
  loading: false, searchQuery: name, reasonCode: "", reason: "",
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
  const [tab, setTab] = useState<Tab>("zigbang");
  const [selectedAptId, setSelectedAptId] = useState(apartments[0]?.apartment.id ?? "");
  const [batchRunning, setBatchRunning] = useState(false);
  const [batchProgress, setBatchProgress] = useState("");

  const [zbStates, setZbStates] = useState<Record<string, ZbState>>({});
  const [kbStates, setKbStates] = useState<Record<string, KbState>>({});

  const selectedEntry = apartments.find((a) => a.apartment.id === selectedAptId) ?? apartments[0];
  const apt = selectedEntry?.apartment;

  const zb = zbStates[selectedAptId] ?? defaultZb(apt?.name ?? "");
  const kb = kbStates[selectedAptId] ?? defaultKb(apt?.name ?? "");

  function patchZb(id: string, patch: Partial<ZbState>) {
    setZbStates((p) => ({ ...p, [id]: { ...(p[id] ?? defaultZb()), ...patch } }));
  }
  function patchKb(id: string, patch: Partial<KbState>) {
    setKbStates((p) => ({ ...p, [id]: { ...(p[id] ?? defaultKb(apt?.name ?? "")), ...patch } }));
  }

  // ── 직방: 브라우저에서 직접 호출 (Vercel IP 차단 우회) ──────────
  async function zbSearch(name: string): Promise<{ complexList: ZbComplex[]; reasonCode: string; reason: string }> {
    try {
      const res = await fetch(`${ZB_BASE}/v2/search?serviceType=아파트&q=${encodeURIComponent(name)}`, {
        headers: ZB_HEADERS,
        signal: AbortSignal.timeout(8000),
      });
      if (!res.ok) {
        const code = res.status === 403 || res.status === 429 ? "blocked" : res.status >= 500 ? "upstream_error" : "error";
        return { complexList: [], reasonCode: code, reason: `직방 단지검색 실패 (HTTP ${res.status}). 브라우저에서 직방이 차단됐거나 서버 오류입니다.` };
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
      if (!list.length) {
        return {
          complexList: [],
          reasonCode: "complex_not_found",
          reason: `직방에서 "${name}" 단지를 찾지 못했습니다. 이름이 직방 등록명과 다르거나(특수문자·긴 부제 포함) 미등록 단지일 수 있습니다. 검색어를 짧게 줄여 재시도하세요.`,
        };
      }
      return { complexList: list, reasonCode: list.length > 1 ? "disambiguation" : "ok", reason: list.length > 1 ? `유사 단지 ${list.length}곳 검색됨. 단지를 선택하세요.` : "" };
    } catch (err) {
      const msg = String(err);
      const isTimeout = /timeout|aborted/i.test(msg);
      return {
        complexList: [],
        reasonCode: "error",
        reason: isTimeout
          ? "직방 응답 시간 초과 — 브라우저 네트워크 또는 직방 서버 문제일 수 있습니다."
          : `직방 연결 실패: ${msg}`,
      };
    }
  }

  async function zbFetchListings(complexId: string, tradeType: "매매" | "전세"): Promise<ZbListing[]> {
    try {
      const res = await fetch(
        `${ZB_BASE}/v2/complex/${complexId}/items?tradeType=${encodeURIComponent(tradeType)}&serviceType=아파트`,
        { headers: ZB_HEADERS, signal: AbortSignal.timeout(8000) }
      );
      if (!res.ok) return [];
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
      return [];
    }
  }

  async function fetchZigbang(complexId?: string) {
    if (!apt) return;
    const query = (zbStates[apt.id]?.searchQuery ?? apt.name).trim() || apt.name;
    patchZb(apt.id, { loading: true, reasonCode: "", reason: "", sale: [], jeonse: [] });

    let resolvedId = complexId ?? "";
    if (!resolvedId) {
      const s = await zbSearch(query);
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
  }

  // 전체 일괄 수집 → 자동 저장
  async function fetchAndImportAll() {
    setBatchRunning(true);
    const today = new Date().toISOString().slice(0, 10);
    const allImported: Listing[] = [];

    for (let i = 0; i < apartments.length; i++) {
      const { apartment: a } = apartments[i];
      setBatchProgress(`${i + 1}/${apartments.length} — ${a.name} 수집중…`);
      const query = (zbStates[a.id]?.searchQuery ?? a.name).trim() || a.name;
      setZbStates((p) => ({ ...p, [a.id]: { ...(p[a.id] ?? defaultZb(a.name)), loading: true, reasonCode: "", reason: "" } }));

      const s = await zbSearch(query);
      if (s.reasonCode !== "ok" || !s.complexList.length) {
        setZbStates((p) => ({ ...p, [a.id]: { ...(p[a.id] ?? defaultZb(a.name)), loading: false, reasonCode: s.reasonCode, reason: s.reason, complexList: s.complexList } }));
        continue;
      }
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
          ...(p[a.id] ?? defaultZb(a.name)), loading: false,
          complexList: s.complexList, sale, jeonse,
          reasonCode: total > 0 ? "ok" : "no_listings",
          reason: total > 0 ? "" : "단지 찾음. 직방 등록 매물 0건.",
        },
      }));
    }

    const existingKeys = new Set(store.listings.map((l: Listing) => l.listingKey));
    const newOnes = allImported.filter((l) => !existingKeys.has(l.listingKey));
    if (newOnes.length > 0) store.setListings([...newOnes, ...store.listings]);
    setBatchProgress(`완료 — ${newOnes.length}건 신규 저장 (중복 ${allImported.length - newOnes.length}건 제외)`);
    setBatchRunning(false);
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

  // ── KB시세 조회 (서버 라우트 경유) ────────────────────────────────
  async function fetchKb(complexNo?: string) {
    if (!apt) return;
    patchKb(apt.id, { loading: true, reasonCode: "", reason: "" });
    const query = (kbStates[apt.id]?.searchQuery ?? apt.name).trim() || apt.name;
    const params = new URLSearchParams();
    if (complexNo) params.set("complexNo", complexNo);
    else params.set("aptName", query);
    if (apt.defaultArea) params.set("area", String(apt.defaultArea));
    try {
      const res = await fetch(`/api/kb-price?${params}`);
      const data = await res.json();
      patchKb(apt.id, {
        loading: false,
        reasonCode: data.reasonCode ?? (res.ok ? "ok" : "error"),
        reason: data.reason ?? (res.ok ? "" : "KB 조회 실패"),
        complexList: data.complexList?.length > 1 && !complexNo ? data.complexList : [],
        selectedNo: data.complexList?.[0]?.complexNo ?? "",
        areaTypes: data.areaTypes ?? [],
        prices: data.prices ?? [],
      });
    } catch (e) {
      patchKb(apt.id, { loading: false, reasonCode: "error", reason: `KB 연결 실패: ${String(e)}` });
    }
  }

  if (!apt) return null;

  return (
    <div className="card p-5">
      {/* 전체 일괄 수집 */}
      <div className="flex items-center gap-3 mb-3">
        <button
          className="btn-primary text-sm px-4 py-1.5 whitespace-nowrap"
          disabled={batchRunning}
          onClick={fetchAndImportAll}
        >
          {batchRunning ? "수집중…" : `전체 수집 (${apartments.length}개 단지)`}
        </button>
        {batchProgress && (
          <span className={`text-sm ${batchRunning ? "text-blue-600" : "text-emerald-700 font-semibold"}`}>
            {batchProgress}
          </span>
        )}
      </div>

      {/* 단지 선택 */}
      <div className="flex flex-wrap gap-2 mb-4">
        {apartments.map(({ apartment: a, role }) => {
          const zbS = zbStates[a.id];
          const listingCount = store.listings.filter((l) => l.apartmentId === a.id).length;
          const hasError = zbS?.reasonCode && zbS.reasonCode !== "ok" && zbS.reasonCode !== "disambiguation";
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
              {listingCount > 0 && (
                <span className="ml-1 text-xs bg-emerald-100 text-emerald-700 px-1.5 rounded-full">{listingCount}건</span>
              )}
              {hasError && <span className="ml-1 text-xs text-red-400" title={zbS?.reason}>!</span>}
            </button>
          );
        })}
      </div>

      {/* 탭 */}
      <div className="flex gap-2 mb-4">
        <button
          className={`px-4 py-1.5 rounded-full text-sm font-semibold transition-colors ${tab === "zigbang" ? "bg-orange-500 text-white" : "bg-slate-100 text-slate-600 hover:bg-slate-200"}`}
          onClick={() => setTab("zigbang")}
        >직방 호가 수집</button>
        <button
          className={`px-4 py-1.5 rounded-full text-sm font-semibold transition-colors ${tab === "kb" ? "bg-blue-600 text-white" : "bg-slate-100 text-slate-600 hover:bg-slate-200"}`}
          onClick={() => setTab("kb")}
        >KB부동산 시세</button>
      </div>

      {/* ── 직방 탭 ── */}
      {tab === "zigbang" && (
        <div className="space-y-3">
          <p className="text-xs text-slate-500">직방 API를 브라우저에서 직접 호출합니다 — 서버 IP 차단 영향 없음.</p>
          <div className="flex items-center gap-2">
            <input
              className="input flex-1 text-sm"
              value={zb.searchQuery ?? apt.name}
              onChange={(e) => patchZb(apt.id, { searchQuery: e.target.value })}
              placeholder="검색어 수정 가능 (예: 중흥에듀)"
              onKeyDown={(e) => e.key === "Enter" && fetchZigbang()}
            />
            <button className="btn-primary text-sm px-4 py-1.5 whitespace-nowrap" disabled={zb.loading} onClick={() => fetchZigbang()}>
              {zb.loading ? "수집중…" : "수집"}
            </button>
          </div>

          {/* 단지 복수 선택 */}
          {zb.complexList.length > 1 && (
            <div>
              <p className="text-xs text-amber-600 mb-1">{zb.reason}</p>
              <div className="flex gap-2">
                <select className="input flex-1 text-sm" value={zb.selectedId} onChange={(e) => patchZb(apt.id, { selectedId: e.target.value })}>
                  {zb.complexList.map((c) => (
                    <option key={c.complexId} value={c.complexId}>{c.complexName} ({c.address})</option>
                  ))}
                </select>
                <button className="btn-primary text-sm px-3" onClick={() => fetchZigbang(zb.selectedId || zb.complexList[0].complexId)}>이 단지</button>
              </div>
            </div>
          )}

          {/* 원인 메시지 */}
          {zb.reasonCode && zb.reasonCode !== "ok" && zb.reasonCode !== "disambiguation" && (
            <div className="rounded-lg bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700">
              <p className="font-semibold mb-0.5">
                {zb.reasonCode === "complex_not_found" ? "🔍 단지 미발견" :
                 zb.reasonCode === "no_listings" ? "📭 등록 매물 없음" :
                 zb.reasonCode === "blocked" ? "🚫 접근 차단" : "⚠️ 오류"}
              </p>
              <p className="text-red-600">{zb.reason}</p>
            </div>
          )}

          {zb.reasonCode === "ok" && zb.sale.length === 0 && zb.jeonse.length === 0 && (
            <div className="rounded-lg bg-amber-50 border border-amber-200 px-4 py-3 text-sm text-amber-700">
              <p className="font-semibold">📭 등록 매물 없음</p>
              <p className="text-amber-600">{zb.reason || "단지는 찾았으나 직방에 현재 등록 매물이 0건입니다."}</p>
            </div>
          )}

          {zb.sale.length > 0 && (
            <div>
              <div className="flex items-center justify-between mb-1">
                <p className="text-sm font-semibold">매매 {zb.sale.length}건</p>
                <button className="btn-secondary text-xs px-3 py-1" onClick={() => importZigbang(zb.sale, "sale")}>전체 저장</button>
              </div>
              <div className="max-h-40 overflow-y-auto rounded-lg border divide-y text-sm">
                {zb.sale.map((l) => (
                  <div key={l.itemId} className="flex items-center gap-3 px-3 py-2">
                    <span className="font-semibold text-slate-800">{formatEok(l.price)}</span>
                    <span className="text-slate-400">{l.area}㎡ · {l.floor}층</span>
                    {l.description && <span className="text-slate-400 truncate text-xs flex-1">{l.description}</span>}
                  </div>
                ))}
              </div>
            </div>
          )}

          {zb.jeonse.length > 0 && (
            <div>
              <div className="flex items-center justify-between mb-1">
                <p className="text-sm font-semibold">전세 {zb.jeonse.length}건</p>
                <button className="btn-secondary text-xs px-3 py-1" onClick={() => importZigbang(zb.jeonse, "jeonse")}>전체 저장</button>
              </div>
              <div className="max-h-40 overflow-y-auto rounded-lg border divide-y text-sm">
                {zb.jeonse.map((l) => (
                  <div key={l.itemId} className="flex items-center gap-3 px-3 py-2">
                    <span className="font-semibold text-slate-800">{formatEok(l.price)}</span>
                    <span className="text-slate-400">{l.area}㎡ · {l.floor}층</span>
                    {l.description && <span className="text-slate-400 truncate text-xs flex-1">{l.description}</span>}
                  </div>
                ))}
              </div>
            </div>
          )}

          {!zb.reasonCode && !zb.loading && (
            <p className="text-sm text-slate-400">수집 버튼을 눌러 직방 매물을 가져오세요.</p>
          )}
        </div>
      )}

      {/* ── KB시세 탭 ── */}
      {tab === "kb" && (
        <div className="space-y-3">
          <div className="flex items-center gap-2">
            <input
              className="input flex-1 text-sm"
              value={kb.searchQuery ?? apt.name}
              onChange={(e) => patchKb(apt.id, { searchQuery: e.target.value })}
              placeholder="검색어 수정 가능 (예: 누읍휴먼시아)"
              onKeyDown={(e) => e.key === "Enter" && fetchKb()}
            />
            <button className="btn-primary text-sm px-4 py-1.5 whitespace-nowrap" disabled={kb.loading} onClick={() => fetchKb()}>
              {kb.loading ? "조회중…" : "조회"}
            </button>
          </div>

          {kb.complexList.length > 1 && (
            <div className="flex gap-2">
              <select className="input flex-1 text-sm" value={kb.selectedNo} onChange={(e) => patchKb(apt.id, { selectedNo: e.target.value })}>
                {kb.complexList.map((c) => (
                  <option key={c.complexNo} value={c.complexNo}>{c.name} ({c.address})</option>
                ))}
              </select>
              <button className="btn-primary text-sm px-3" onClick={() => fetchKb(kb.selectedNo)}>이 단지</button>
            </div>
          )}

          {/* KB 원인 메시지 */}
          {kb.reasonCode && kb.reasonCode !== "ok" && (
            <div className={`rounded-lg border px-4 py-3 text-sm ${
              kb.reasonCode === "blocked" || kb.reasonCode === "upstream_error" || kb.reasonCode === "error"
                ? "bg-red-50 border-red-200 text-red-700"
                : "bg-amber-50 border-amber-200 text-amber-700"
            }`}>
              <p className="font-semibold mb-0.5">
                {kb.reasonCode === "complex_not_found" ? "🔍 KB 미등록 단지" :
                 kb.reasonCode === "no_area_types" ? "📋 면적 정보 미등록" :
                 kb.reasonCode === "no_priced_area" ? "💰 시세 미산정" :
                 kb.reasonCode === "no_price_data" ? "📊 시세 데이터 없음" :
                 kb.reasonCode === "blocked" ? "🚫 접근 차단" : "⚠️ 오류"}
              </p>
              <p>{kb.reason}</p>
            </div>
          )}

          {kb.prices.length > 0 && (
            <div className="rounded-lg border divide-y text-sm">
              {kb.prices.map(({ area, price, reason }) => (
                <div key={area.areaNo} className="px-4 py-3">
                  <p className="font-semibold text-slate-700 mb-2">{area.typeName} ({area.exclusiveArea}㎡)</p>
                  {price ? (
                    <>
                      <div className="grid grid-cols-2 gap-x-6 gap-y-1 text-slate-600">
                        <span>매매 일반</span><span className="font-semibold text-slate-800">{formatEok(price.saleGeneral)}</span>
                        <span>매매 상한</span><span>{formatEok(price.saleUpper)}</span>
                        <span>매매 하한</span><span>{formatEok(price.saleLower)}</span>
                        <span>전세 일반</span><span className="font-semibold text-slate-800">{formatEok(price.jeonseGeneral)}</span>
                        <span>전세 상한</span><span>{formatEok(price.jeonseUpper)}</span>
                        <span>전세 하한</span><span>{formatEok(price.jeonseLower)}</span>
                      </div>
                      <p className="mt-2 text-xs text-slate-400">기준일: {price.baseDate}</p>
                    </>
                  ) : (
                    <p className="text-xs text-amber-600">{reason || "이 면적 시세 없음"}</p>
                  )}
                </div>
              ))}
            </div>
          )}

          {kb.prices.length === 0 && !kb.loading && !kb.reasonCode && (
            <p className="text-sm text-slate-400">조회 버튼을 눌러 KB시세를 확인하세요.</p>
          )}
        </div>
      )}
    </div>
  );
}
