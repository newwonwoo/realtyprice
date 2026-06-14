"use client";

import { useState } from "react";
import type { Apartment } from "@/types/apartment";
import type { NaverListing, NaverComplex } from "@/app/api/naver-listings/route";
import type { Listing } from "@/types/listing";
import { normalizeToBGrade } from "@/lib/grade";
import { useRealtyStore } from "@/lib/clientStore";

interface Props {
  apartment: Apartment;
}

export function NaverListingFetcher({ apartment }: Props) {
  const store = useRealtyStore();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [complexList, setComplexList] = useState<NaverComplex[]>([]);
  const [selectedComplexNo, setSelectedComplexNo] = useState("");
  const [saleListings, setSaleListings] = useState<NaverListing[]>([]);
  const [jeonseListings, setJeonseListings] = useState<NaverListing[]>([]);

  async function fetchListings(complexNo?: string) {
    setLoading(true);
    setError("");
    setMessage("");

    const params = new URLSearchParams({ type: "all" });
    if (complexNo) {
      params.set("complexNo", complexNo);
    } else {
      params.set("aptName", apartment.name);
    }

    try {
      const res = await fetch(`/api/naver-listings?${params}`);
      const data = await res.json();
      if (data.error) {
        setError(data.error);
        return;
      }
      if (data.complexList?.length > 1 && !complexNo) {
        setComplexList(data.complexList);
        setSelectedComplexNo(data.complexNo);
      } else {
        setComplexList([]);
      }
      setSaleListings(data.saleListings ?? []);
      setJeonseListings(data.jeonseListings ?? []);
      setSelectedComplexNo(data.complexNo);
      setMessage(`매매 ${data.saleListings?.length ?? 0}건, 전세 ${data.jeonseListings?.length ?? 0}건 조회`);
    } catch (e) {
      setError(String(e));
    } finally {
      setLoading(false);
    }
  }

  function importToStore() {
    const today = new Date().toISOString().slice(0, 10);
    const newListings: Listing[] = [];

    for (const item of saleListings) {
      const price = parseNaverPrice(item.dealOrWarrantPrc);
      if (!price) continue;
      newListings.push({
        id: `listing_naver_${item.articleNo}`,
        apartmentId: apartment.id,
        listingType: "sale",
        exclusiveArea: item.area2 || item.area1 || 84,
        askingPrice: price,
        floor: parseFloor(item.floorInfo),
        direction: item.direction || undefined,
        grade: "B",
        adjustedAskingPrice: normalizeToBGrade(price, "B"),
        source: "naver",
        listingKey: `naver_${item.articleNo}`,
        capturedAt: today,
        status: "active",
        memo: item.articleFeatureDesc || undefined,
      });
    }

    for (const item of jeonseListings) {
      const price = parseNaverPrice(item.dealOrWarrantPrc);
      if (!price) continue;
      newListings.push({
        id: `listing_naver_${item.articleNo}`,
        apartmentId: apartment.id,
        listingType: "jeonse",
        exclusiveArea: item.area2 || item.area1 || 84,
        askingPrice: price,
        floor: parseFloor(item.floorInfo),
        direction: item.direction || undefined,
        grade: "B",
        adjustedAskingPrice: normalizeToBGrade(price, "B"),
        source: "naver",
        listingKey: `naver_${item.articleNo}`,
        capturedAt: today,
        status: "active",
        memo: item.articleFeatureDesc || undefined,
      });
    }

    const existingKeys = new Set(store.listings.map((l) => l.listingKey));
    const deduped = newListings.filter((l) => !existingKeys.has(l.listingKey));
    store.setListings([...deduped, ...store.listings]);
    setMessage(`${deduped.length}건을 가져왔습니다. (중복 ${newListings.length - deduped.length}건 제외)`);
    setSaleListings([]);
    setJeonseListings([]);
  }

  const hasResults = saleListings.length + jeonseListings.length > 0;

  return (
    <div className="rounded-lg border border-blue-200 bg-blue-50 p-4">
      <p className="text-sm font-black text-blue-800">네이버 부동산 호가 자동수집</p>
      <p className="mt-1 text-xs text-blue-600">비공식 API를 통해 현재 매매/전세 호가를 불러옵니다.</p>

      {complexList.length > 1 && (
        <div className="mt-3">
          <label className="text-xs font-semibold text-slate-700">단지 선택 (검색 결과 {complexList.length}개)</label>
          <select
            className="input mt-1"
            value={selectedComplexNo}
            onChange={(e) => setSelectedComplexNo(e.target.value)}
          >
            {complexList.map((c) => (
              <option key={c.complexNo} value={c.complexNo}>{c.complexName} — {c.cortarAddress}</option>
            ))}
          </select>
          <button
            className="btn-primary mt-2 text-xs"
            onClick={() => fetchListings(selectedComplexNo)}
          >이 단지로 조회</button>
        </div>
      )}

      <div className="mt-3 flex gap-2">
        <button
          className="btn-primary text-xs"
          disabled={loading}
          onClick={() => fetchListings()}
        >{loading ? "조회 중…" : "호가 불러오기"}</button>
        {hasResults && (
          <button className="btn-primary text-xs bg-emerald-600 hover:bg-emerald-700" onClick={importToStore}>
            저장소에 가져오기
          </button>
        )}
      </div>

      {error && <p className="mt-2 text-xs text-red-600">{error}</p>}
      {message && <p className="mt-2 text-xs font-semibold text-blue-700">{message}</p>}

      {hasResults && (
        <div className="mt-3 space-y-3">
          {saleListings.length > 0 && (
            <ListingTable title="매매호가" items={saleListings} />
          )}
          {jeonseListings.length > 0 && (
            <ListingTable title="전세호가" items={jeonseListings} />
          )}
        </div>
      )}
    </div>
  );
}

function ListingTable({ title, items }: { title: string; items: NaverListing[] }) {
  return (
    <div>
      <p className="text-xs font-bold text-slate-600">{title} ({items.length}건)</p>
      <div className="mt-1 max-h-48 overflow-y-auto rounded border border-slate-200 bg-white text-xs">
        <table className="w-full">
          <thead className="sticky top-0 bg-slate-100">
            <tr>
              <th className="px-2 py-1 text-left">호가</th>
              <th className="px-2 py-1 text-left">전용</th>
              <th className="px-2 py-1 text-left">층</th>
              <th className="px-2 py-1 text-left">향</th>
              <th className="px-2 py-1 text-left">특징</th>
            </tr>
          </thead>
          <tbody>
            {items.map((item) => (
              <tr key={item.articleNo} className="border-t border-slate-100">
                <td className="px-2 py-1 font-semibold">{item.dealOrWarrantPrc}만</td>
                <td className="px-2 py-1">{item.area2 || item.area1}㎡</td>
                <td className="px-2 py-1">{item.floorInfo || "-"}</td>
                <td className="px-2 py-1">{item.direction || "-"}</td>
                <td className="px-2 py-1 text-slate-500 truncate max-w-[120px]">{item.articleFeatureDesc || "-"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function parseNaverPrice(raw: string): number | null {
  // e.g. "8억5,000" → "85000", "35,000" → "35000"
  if (!raw) return null;
  const clean = raw.replace(/,/g, "").replace(/\s/g, "");
  // handle "N억M" format
  const match = clean.match(/^(\d+)억(\d+)?$/);
  if (match) {
    return parseInt(match[1], 10) * 10000 + parseInt(match[2] || "0", 10);
  }
  // plain number (만원)
  const n = parseInt(clean, 10);
  return isNaN(n) ? null : n;
}

function parseFloor(floorInfo: string): number | undefined {
  if (!floorInfo) return undefined;
  const n = parseInt(floorInfo.split("/")[0], 10);
  return isNaN(n) ? undefined : n;
}
