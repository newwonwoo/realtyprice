"use client";

import { useState } from "react";
import type { Apartment } from "@/types/apartment";
import type { Listing } from "@/types/listing";
import { normalizeToBGrade } from "@/lib/grade";
import { useRealtyStore } from "@/lib/clientStore";
import type { ZigbangListing, ZigbangComplex } from "@/app/api/zigbang-listings/route";
import type { KbComplex, KbPrice, KbAreaType } from "@/app/api/kb-price/route";
import { formatEok } from "@/lib/format";

interface Props {
  apartment: Apartment;
}

type Tab = "zigbang" | "kb";

export function ListingFetcher({ apartment }: Props) {
  const store = useRealtyStore();
  const [tab, setTab] = useState<Tab>("zigbang");

  // 직방 state
  const [zbLoading, setZbLoading] = useState(false);
  const [zbError, setZbError] = useState("");
  const [zbMessage, setZbMessage] = useState("");
  const [zbComplexList, setZbComplexList] = useState<ZigbangComplex[]>([]);
  const [zbSelectedId, setZbSelectedId] = useState("");
  const [zbSale, setZbSale] = useState<ZigbangListing[]>([]);
  const [zbJeonse, setZbJeonse] = useState<ZigbangListing[]>([]);

  // KB state
  const [kbLoading, setKbLoading] = useState(false);
  const [kbError, setKbError] = useState("");
  const [kbComplexList, setKbComplexList] = useState<KbComplex[]>([]);
  const [kbSelectedNo, setKbSelectedNo] = useState("");
  const [kbAreaTypes, setKbAreaTypes] = useState<KbAreaType[]>([]);
  const [kbPrices, setKbPrices] = useState<{ area: KbAreaType; price: KbPrice | null }[]>([]);

  // ── 직방 수집 ──────────────────────────────────────────
  async function fetchZigbang(complexId?: string) {
    setZbLoading(true);
    setZbError("");
    setZbMessage("");
    const params = new URLSearchParams({ type: "all" });
    if (complexId) {
      params.set("complexId", complexId);
    } else {
      params.set("aptName", apartment.name);
    }
    try {
      const res = await fetch(`/api/zigbang-listings?${params}`);
      const data = await res.json();
      if (!res.ok) { setZbError(data.error ?? "직방 수집 실패"); return; }
      if (data.complexList?.length > 1 && !complexId) {
        setZbComplexList(data.complexList);
        setZbSelectedId(data.complexList[0].complexId);
        return;
      }
      setZbComplexList(data.complexList ?? []);
      setZbSale(data.saleListings ?? []);
      setZbJeonse(data.jeonseListings ?? []);
      setZbMessage(`매매 ${data.saleListings?.length ?? 0}건 · 전세 ${data.jeonseListings?.length ?? 0}건 수집`);
    } catch (e) {
      setZbError(String(e));
    } finally {
      setZbLoading(false);
    }
  }

  function importZigbang(listings: ZigbangListing[], type: "sale" | "jeonse") {
    const today = new Date().toISOString().slice(0, 10);
    const imported: Listing[] = listings.map((l) => {
      const price = l.price;
      return {
        id: `listing_zb_${l.itemId}`,
        apartmentId: apartment.id,
        listingType: type,
        exclusiveArea: l.area,
        askingPrice: price,
        floor: l.floor || undefined,
        grade: "B" as const,
        adjustedAskingPrice: normalizeToBGrade(price, "B"),
        source: "manual" as const,
        listingKey: `zb_${l.itemId}`,
        capturedAt: today,
        status: "active" as const,
        memo: l.description || undefined,
      };
    });
    const existingKeys = new Set(store.listings.map((l) => l.listingKey));
    const newOnes = imported.filter((l) => !existingKeys.has(l.listingKey));
    store.setListings([...newOnes, ...store.listings]);
    setZbMessage(`${newOnes.length}건 저장 (중복 ${imported.length - newOnes.length}건 제외)`);
  }

  // ── KB시세 조회 ────────────────────────────────────────
  async function fetchKb(complexNo?: string) {
    setKbLoading(true);
    setKbError("");
    const params = new URLSearchParams();
    if (complexNo) {
      params.set("complexNo", complexNo);
    } else {
      params.set("aptName", apartment.name);
    }
    if (apartment.defaultArea) params.set("area", String(apartment.defaultArea));
    try {
      const res = await fetch(`/api/kb-price?${params}`);
      const data = await res.json();
      if (!res.ok) { setKbError(data.error ?? "KB 조회 실패"); return; }
      if (data.complexList?.length > 1 && !complexNo) {
        setKbComplexList(data.complexList);
        setKbSelectedNo(data.complexList[0].complexNo);
      }
      setKbAreaTypes(data.areaTypes ?? []);
      setKbPrices(data.prices ?? []);
    } catch (e) {
      setKbError(String(e));
    } finally {
      setKbLoading(false);
    }
  }

  return (
    <div className="card p-5">
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
            <span className="text-sm text-slate-600 flex-1">{apartment.name} 직방 매물 자동 수집</span>
            <button className="btn-primary text-sm px-4 py-1.5" disabled={zbLoading} onClick={() => fetchZigbang()}>
              {zbLoading ? "수집중…" : "수집"}
            </button>
          </div>

          {/* 복수 단지 선택 */}
          {zbComplexList.length > 1 && (
            <div className="flex gap-2">
              <select className="input flex-1 text-sm" value={zbSelectedId} onChange={(e) => setZbSelectedId(e.target.value)}>
                {zbComplexList.map((c) => (
                  <option key={c.complexId} value={c.complexId}>{c.complexName} ({c.address})</option>
                ))}
              </select>
              <button className="btn-primary text-sm px-3" onClick={() => fetchZigbang(zbSelectedId)}>이 단지</button>
            </div>
          )}

          {zbError && <p className="text-sm text-red-500">{zbError}</p>}
          {zbMessage && <p className="text-sm font-semibold text-blue-700">{zbMessage}</p>}

          {/* 매매 매물 */}
          {zbSale.length > 0 && (
            <div>
              <div className="flex items-center justify-between mb-1">
                <p className="text-sm font-semibold">매매 매물 {zbSale.length}건</p>
                <button className="btn-secondary text-xs px-3 py-1" onClick={() => importZigbang(zbSale, "sale")}>전체 저장</button>
              </div>
              <div className="max-h-48 overflow-y-auto rounded-lg border divide-y text-sm">
                {zbSale.map((l) => (
                  <div key={l.itemId} className="flex items-center gap-3 px-3 py-2">
                    <span className="font-semibold text-slate-800">{formatEok(l.price)}</span>
                    <span className="text-slate-400">{l.area}㎡ · {l.floor}층</span>
                    {l.description && <span className="text-slate-400 truncate text-xs flex-1">{l.description}</span>}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* 전세 매물 */}
          {zbJeonse.length > 0 && (
            <div>
              <div className="flex items-center justify-between mb-1">
                <p className="text-sm font-semibold">전세 매물 {zbJeonse.length}건</p>
                <button className="btn-secondary text-xs px-3 py-1" onClick={() => importZigbang(zbJeonse, "jeonse")}>전체 저장</button>
              </div>
              <div className="max-h-48 overflow-y-auto rounded-lg border divide-y text-sm">
                {zbJeonse.map((l) => (
                  <div key={l.itemId} className="flex items-center gap-3 px-3 py-2">
                    <span className="font-semibold text-slate-800">{formatEok(l.price)}</span>
                    <span className="text-slate-400">{l.area}㎡ · {l.floor}층</span>
                    {l.description && <span className="text-slate-400 truncate text-xs flex-1">{l.description}</span>}
                  </div>
                ))}
              </div>
            </div>
          )}

          {zbSale.length === 0 && zbJeonse.length === 0 && !zbLoading && !zbError && zbMessage === "" && (
            <p className="text-sm text-slate-400">수집 버튼을 눌러 직방 매물을 가져오세요.</p>
          )}
        </div>
      )}

      {/* ── KB시세 탭 ── */}
      {tab === "kb" && (
        <div className="space-y-3">
          <div className="flex items-center gap-2">
            <span className="text-sm text-slate-600 flex-1">{apartment.name} KB시세 조회 (매매·전세 일반·상한·하한)</span>
            <button className="btn-primary text-sm px-4 py-1.5" disabled={kbLoading} onClick={() => fetchKb()}>
              {kbLoading ? "조회중…" : "조회"}
            </button>
          </div>

          {/* 복수 단지 선택 */}
          {kbComplexList.length > 1 && (
            <div className="flex gap-2">
              <select className="input flex-1 text-sm" value={kbSelectedNo} onChange={(e) => setKbSelectedNo(e.target.value)}>
                {kbComplexList.map((c) => (
                  <option key={c.complexNo} value={c.complexNo}>{c.name} ({c.address})</option>
                ))}
              </select>
              <button className="btn-primary text-sm px-3" onClick={() => fetchKb(kbSelectedNo)}>이 단지</button>
            </div>
          )}

          {kbError && <p className="text-sm text-red-500">{kbError}</p>}

          {kbPrices.length > 0 && (
            <div className="rounded-lg border divide-y text-sm">
              {kbPrices.map(({ area, price }) => price && (
                <div key={area.areaNo} className="px-4 py-3">
                  <p className="font-semibold text-slate-700 mb-2">{area.typeName} ({area.exclusiveArea}㎡ / 공급 {area.supplyArea}㎡)</p>
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

          {kbPrices.length === 0 && !kbLoading && !kbError && (
            <p className="text-sm text-slate-400">조회 버튼을 눌러 KB시세를 확인하세요.</p>
          )}
        </div>
      )}
    </div>
  );
}
