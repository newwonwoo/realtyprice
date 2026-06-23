"use client";

import { useState } from "react";
import type { Apartment } from "@/types/apartment";
import type { Listing } from "@/types/listing";
import { normalizeToBGrade } from "@/lib/grade";
import { useRealtyStore } from "@/lib/clientStore";
import type { ZigbangListing, ZigbangComplex } from "@/app/api/zigbang-listings/route";
import type { KbComplex, KbPrice, KbAreaType } from "@/app/api/kb-price/route";
import { formatEok } from "@/lib/format";

export type ApartmentRole = "target" | "leader" | "comparable";

export interface ApartmentWithRole {
  apartment: Apartment;
  role: ApartmentRole;
}

interface Props {
  apartments: ApartmentWithRole[];  // 대상·대장·비교단지 모두
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

// 단지별 직방/KB 상태를 하나의 record로 관리
type ZbState = {
  loading: boolean;
  error: string;
  message: string;
  searchQuery: string;   // 사용자가 직접 수정 가능한 검색어
  complexList: ZigbangComplex[];
  selectedId: string;
  sale: ZigbangListing[];
  jeonse: ZigbangListing[];
};

type KbState = {
  loading: boolean;
  error: string;
  complexList: KbComplex[];
  selectedNo: string;
  areaTypes: KbAreaType[];
  prices: { area: KbAreaType; price: KbPrice | null }[];
};

const defaultZb = (name = ""): ZbState => ({ loading: false, error: "", message: "", searchQuery: name, complexList: [], selectedId: "", sale: [], jeonse: [] });
const defaultKb = (): KbState => ({ loading: false, error: "", complexList: [], selectedNo: "", areaTypes: [], prices: [] });

export function ListingFetcher({ apartments }: Props) {
  const store = useRealtyStore();
  const [tab, setTab] = useState<Tab>("zigbang");
  const [selectedAptId, setSelectedAptId] = useState(apartments[0]?.apartment.id ?? "");

  const [zbStates, setZbStates] = useState<Record<string, ZbState>>({});
  const [kbStates, setKbStates] = useState<Record<string, KbState>>({});

  const selectedEntry = apartments.find((a) => a.apartment.id === selectedAptId) ?? apartments[0];
  const apt = selectedEntry?.apartment;

  const zb = zbStates[selectedAptId] ?? defaultZb(apt?.name ?? "");
  const kb = kbStates[selectedAptId] ?? defaultKb();

  function setZb(id: string, patch: Partial<ZbState>) {
    setZbStates((prev) => ({ ...prev, [id]: { ...(prev[id] ?? defaultZb(apt?.name ?? "")), ...patch } }));
  }
  function setKb(id: string, patch: Partial<KbState>) {
    setKbStates((prev) => ({ ...prev, [id]: { ...(prev[id] ?? defaultKb()), ...patch } }));
  }

  // ── 직방 수집 ──────────────────────────────────────────
  async function fetchZigbang(complexId?: string) {
    if (!apt) return;
    const query = (zbStates[apt.id]?.searchQuery ?? apt.name).trim() || apt.name;
    setZb(apt.id, { loading: true, error: "", message: "" });
    const params = new URLSearchParams({ type: "all" });
    if (complexId) params.set("complexId", complexId);
    else params.set("aptName", query);
    try {
      const res = await fetch(`/api/zigbang-listings?${params}`);
      const data = await res.json();
      if (!res.ok) { setZb(apt.id, { loading: false, error: data.error ?? "직방 수집 실패" }); return; }
      if (data.complexList?.length > 1 && !complexId) {
        setZb(apt.id, { loading: false, complexList: data.complexList, selectedId: data.complexList[0].complexId });
        return;
      }
      setZb(apt.id, {
        loading: false,
        complexList: data.complexList ?? [],
        sale: data.saleListings ?? [],
        jeonse: data.jeonseListings ?? [],
        message: `매매 ${data.saleListings?.length ?? 0}건 · 전세 ${data.jeonseListings?.length ?? 0}건 수집`,
      });
    } catch (e) {
      setZb(apt.id, { loading: false, error: String(e) });
    }
  }

  function importZigbang(listings: ZigbangListing[], type: "sale" | "jeonse") {
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
    setZb(apt.id, { message: `${newOnes.length}건 저장 (중복 ${imported.length - newOnes.length}건 제외)` });
  }

  // ── KB시세 조회 ────────────────────────────────────────
  async function fetchKb(complexNo?: string) {
    if (!apt) return;
    setKb(apt.id, { loading: true, error: "" });
    const params = new URLSearchParams();
    if (complexNo) params.set("complexNo", complexNo);
    else params.set("aptName", apt.name);
    if (apt.defaultArea) params.set("area", String(apt.defaultArea));
    try {
      const res = await fetch(`/api/kb-price?${params}`);
      const data = await res.json();
      if (!res.ok) { setKb(apt.id, { loading: false, error: data.error ?? "KB 조회 실패" }); return; }
      setKb(apt.id, {
        loading: false,
        complexList: data.complexList?.length > 1 && !complexNo ? data.complexList : [],
        selectedNo: data.complexList?.[0]?.complexNo ?? "",
        areaTypes: data.areaTypes ?? [],
        prices: data.prices ?? [],
      });
    } catch (e) {
      setKb(apt.id, { loading: false, error: String(e) });
    }
  }

  if (!apt) return null;

  return (
    <div className="card p-5">
      {/* 단지 선택 */}
      <div className="flex flex-wrap gap-2 mb-4">
        {apartments.map(({ apartment: a, role }) => (
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
            {/* 수집된 매물 수 뱃지 */}
            {store.listings.filter((l) => l.apartmentId === a.id).length > 0 && (
              <span className="ml-1 text-xs bg-emerald-100 text-emerald-700 px-1.5 rounded-full">
                {store.listings.filter((l) => l.apartmentId === a.id).length}건
              </span>
            )}
          </button>
        ))}
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
          <div className="flex items-center gap-2">
            <input
              className="input flex-1 text-sm"
              value={zb.searchQuery ?? apt.name}
              onChange={(e) => setZb(apt.id, { searchQuery: e.target.value })}
              placeholder="검색어 수정 가능 (예: 중흥에듀)"
              onKeyDown={(e) => e.key === "Enter" && fetchZigbang()}
            />
            <button className="btn-primary text-sm px-4 py-1.5 whitespace-nowrap" disabled={zb.loading} onClick={() => fetchZigbang()}>
              {zb.loading ? "수집중…" : "수집"}
            </button>
          </div>

          {zb.complexList.length > 1 && (
            <div className="flex gap-2">
              <select className="input flex-1 text-sm" value={zb.selectedId} onChange={(e) => setZb(apt.id, { selectedId: e.target.value })}>
                {zb.complexList.map((c) => (
                  <option key={c.complexId} value={c.complexId}>{c.complexName} ({c.address})</option>
                ))}
              </select>
              <button className="btn-primary text-sm px-3" onClick={() => fetchZigbang(zb.selectedId)}>이 단지</button>
            </div>
          )}

          {zb.error && <p className="text-sm text-red-500">{zb.error}</p>}
          {zb.message && <p className="text-sm font-semibold text-blue-700">{zb.message}</p>}

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

          {zb.sale.length === 0 && zb.jeonse.length === 0 && !zb.loading && !zb.error && !zb.message && (
            <p className="text-sm text-slate-400">수집 버튼을 눌러 직방 매물을 가져오세요.</p>
          )}
        </div>
      )}

      {/* ── KB시세 탭 ── */}
      {tab === "kb" && (
        <div className="space-y-3">
          <div className="flex items-center gap-2">
            <span className="text-sm text-slate-600 flex-1"><strong>{apt.name}</strong> KB시세 (매매·전세 일반·상한·하한)</span>
            <button className="btn-primary text-sm px-4 py-1.5" disabled={kb.loading} onClick={() => fetchKb()}>
              {kb.loading ? "조회중…" : "조회"}
            </button>
          </div>

          {kb.complexList.length > 1 && (
            <div className="flex gap-2">
              <select className="input flex-1 text-sm" value={kb.selectedNo} onChange={(e) => setKb(apt.id, { selectedNo: e.target.value })}>
                {kb.complexList.map((c) => (
                  <option key={c.complexNo} value={c.complexNo}>{c.name} ({c.address})</option>
                ))}
              </select>
              <button className="btn-primary text-sm px-3" onClick={() => fetchKb(kb.selectedNo)}>이 단지</button>
            </div>
          )}

          {kb.error && <p className="text-sm text-red-500">{kb.error}</p>}

          {kb.prices.length > 0 && (
            <div className="rounded-lg border divide-y text-sm">
              {kb.prices.map(({ area, price }) => price && (
                <div key={area.areaNo} className="px-4 py-3">
                  <p className="font-semibold text-slate-700 mb-2">{area.typeName} ({area.exclusiveArea}㎡)</p>
                  <div className="grid grid-cols-2 gap-x-6 gap-y-1 text-slate-600">
                    <span>매매 일반</span><span className="font-semibold text-slate-800">{formatEok(price.saleGeneral)}</span>
                    <span>매매 상한</span><span>{formatEok(price.saleUpper)}</span>
                    <span>매매 하한</span><span>{formatEok(price.saleLower)}</span>
                    <span>전세 일반</span><span className="font-semibold text-slate-800">{formatEok(price.jeonseGeneral)}</span>
                    <span>전세 상한</span><span>{formatEok(price.jeonseUpper)}</span>
                    <span>전세 하한</span><span>{formatEok(price.jeonseLower)}</span>
                  </div>
                  <p className="mt-2 text-xs text-slate-400">기준일: {price.baseDate}</p>
                </div>
              ))}
            </div>
          )}

          {kb.prices.length === 0 && !kb.loading && !kb.error && (
            <p className="text-sm text-slate-400">조회 버튼을 눌러 KB시세를 확인하세요.</p>
          )}
        </div>
      )}
    </div>
  );
}
