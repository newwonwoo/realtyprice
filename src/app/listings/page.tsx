"use client";

import { useMemo, useState } from "react";
import { AppShell } from "@/components/AppShell";
import { useRealtyStore } from "@/lib/clientStore";
import { calculateInventorySignal } from "@/lib/inventory";
import { formatEok, formatPercent } from "@/lib/format";
import type { Listing } from "@/types/listing";
import { ListingFetcher, type ApartmentWithRole } from "@/components/listings/ListingFetcher";

export default function ListingsPage() {
  const store = useRealtyStore();
  const [apartmentId, setApartmentId] = useState("");
  const [message, setMessage] = useState("");
  const activeApartmentId = apartmentId || store.targets[0]?.id || store.apartments[0]?.id || "";

  const snapshot = useMemo(() => buildSnapshot(store.listings, activeApartmentId), [activeApartmentId, store.listings]);
  const latestSignal = store.inventorySignals.find((item) => item.apartmentId === activeApartmentId);
  const activeApartment = store.apartments.find((a) => a.id === activeApartmentId);
  const activeTransactions = useMemo(
    () => store.transactions.filter((t) => t.apartmentId === activeApartmentId),
    [activeApartmentId, store.transactions]
  );
  // 현재 신호 미리보기 (저장 전 실시간 계산)
  const liveSignal = useMemo(
    () => calculateInventorySignal(activeApartmentId, snapshot.current, activeTransactions, {
      households: activeApartment?.households,
    }),
    [activeApartmentId, snapshot.current, activeTransactions, activeApartment?.households]
  );

  function saveInventorySignal() {
    if (!snapshot.current.length) {
      setMessage("현재 단지의 매매 매물이 필요합니다. (호가 수집 먼저)");
      return;
    }
    if (activeTransactions.filter((t) => t.transactionType === "sale").length === 0) {
      setMessage("MOI 계산에 실거래(매매)가 필요합니다. 실거래를 먼저 수집하세요.");
      return;
    }
    store.setInventorySignals([liveSignal, ...store.inventorySignals.filter((item) => item.apartmentId !== activeApartmentId)]);
    setMessage("매물소진 신호(MOI)를 저장했습니다.");
  }

  return (
    <AppShell>
      <div className="mb-8">
        <p className="text-sm font-semibold text-blue-600">Listings</p>
        <h1 className="text-3xl font-black">호가/매물</h1>
        <p className="mt-2 text-slate-600">직방·KB에서 현재 매물을 자동수집하고, 실거래와 합쳐 재고소진월수(MOI)를 산출합니다.</p>
      </div>

      {/* 직방/KB 자동 수집 — listings 페이지는 전체 단지 목록 제공 */}
      {store.apartments.length > 0 && (
        <div className="mb-5">
          <ListingFetcher
            apartments={store.apartments.map((a): ApartmentWithRole => ({
              apartment: a,
              role: store.targets.some((t) => t.id === a.id) ? "target" : "comparable",
            }))}
          />
        </div>
      )}

      <div className="card p-5">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h2 className="text-lg font-black">매물소진추정 (MOI)</h2>
            <p className="mt-1 text-xs text-slate-500">재고소진월수 = 활성매물 ÷ 월평균 실거래. 낮을수록 매도자 우위(상승압력).</p>
          </div>
          <label className="block">
            <span className="text-xs font-semibold text-slate-600">단지</span>
            <select className="input mt-1" value={activeApartmentId} onChange={(event) => setApartmentId(event.target.value)}>
              <option value="">단지 선택</option>
              {store.apartments.map((apartment) => <option key={apartment.id} value={apartment.id}>{apartment.name}</option>)}
            </select>
          </label>
        </div>

        {/* 핵심 지표: MOI */}
        <div className={`mt-4 rounded-xl border-2 p-4 ${moiBoxStyle(liveSignal.conclusion)}`}>
          <div className="flex items-end justify-between">
            <div>
              <p className="text-xs font-semibold text-slate-500">재고소진월수 (MOI)</p>
              <p className="mt-1 text-4xl font-black">
                {liveSignal.monthsOfInventory && liveSignal.monthsOfInventory > 0
                  ? `${liveSignal.monthsOfInventory}개월`
                  : "—"}
              </p>
            </div>
            <div className="text-right">
              <p className={`text-sm font-black ${moiTextStyle(liveSignal.conclusion)}`}>
                {moiRegimeLabel(liveSignal.conclusion)}
              </p>
              <p className="text-xs text-slate-500">신호점수 {liveSignal.signalScore}점</p>
            </div>
          </div>
          <p className="mt-2 text-xs text-slate-500">
            {liveSignal.monthsOfInventory && liveSignal.monthsOfInventory > 0
              ? "기준: <3 강한상승 · 3~6 보합 · >6.5 하락 (US NAR, 수도권 보정 전)"
              : "활성매물 + 최근 매매 실거래가 모두 있어야 계산됩니다."}
          </p>
        </div>

        {/* 보조 지표 */}
        <div className="mt-4 grid grid-cols-2 gap-3 md:grid-cols-3">
          <Metric label="활성 매물수 (디둡)" value={`${liveSignal.activeListingCount ?? 0}건`} />
          <Metric label="월평균 실거래" value={`${liveSignal.monthlySalesPace ?? 0}건/월`} />
          <Metric label="흡수율(월)" value={formatPercent(liveSignal.absorptionRate)} />
          <Metric
            label="거래회전율(연)"
            value={liveSignal.turnoverAnnualized !== undefined ? `${liveSignal.turnoverAnnualized}%` : "세대수 필요"}
          />
          <Metric label="매매수급 프록시" value={`${liveSignal.supplyDemandProxy ?? 100}`} />
          <Metric label="실거래 집계기간" value={`${liveSignal.transactionWindowMonths ?? 6}개월`} />
        </div>

        {/* 보조 확인용: 스냅샷 매물 증감 (2개 스냅샷 있을 때만) */}
        {snapshot.previous.length > 0 && (
          <div className="mt-3 rounded-lg bg-slate-50 p-3 text-xs text-slate-500">
            <span className="font-semibold">스냅샷 매물 증감</span> · 전일 {snapshot.previous.length}건 → 금일 {snapshot.current.length}건
          </div>
        )}

        <button className="btn-primary mt-4 w-full" onClick={saveInventorySignal}>매물소진 신호 저장</button>
        {message && <p className="mt-2 text-sm font-semibold text-blue-700">{message}</p>}
        {latestSignal && (
          <p className="mt-2 text-sm text-slate-500">
            최근 저장: {latestSignal.signalDate} · MOI {latestSignal.monthsOfInventory ?? "-"}개월 · {latestSignal.signalScore}점
          </p>
        )}
      </div>

      <div className="card mt-6 overflow-hidden">
        <table className="table w-full">
          <thead><tr><th>단지</th><th>유형</th><th>호가</th><th>보정호가</th><th>면적</th><th>동/호</th><th>등급</th><th>매물키</th><th>수집일</th></tr></thead>
          <tbody>
            {store.listings.map((listing) => (
              <tr key={listing.id}>
                <td>{store.apartments.find((item) => item.id === listing.apartmentId)?.name ?? listing.apartmentId}</td><td>{listing.listingType}</td><td>{formatEok(listing.askingPrice)}</td><td>{formatEok(listing.adjustedAskingPrice)}</td><td>{listing.exclusiveArea}</td><td>{[listing.buildingNo, listing.unitNo].filter(Boolean).join("/") || "-"}</td><td>{listing.grade}</td><td>{listing.listingKey ?? "-"}</td><td>{listing.capturedAt}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </AppShell>
  );
}

function buildSnapshot(listings: Listing[], apartmentId: string) {
  const saleListings = listings.filter((item) => item.apartmentId === apartmentId && item.listingType === "sale");
  const dates = Array.from(new Set(saleListings.map((item) => item.capturedAt))).sort();
  const currentDate = dates[dates.length - 1];
  const previousDate = dates[dates.length - 2];
  const previous = saleListings.filter((item) => item.capturedAt === previousDate);
  const current = saleListings.filter((item) => item.capturedAt === currentDate);
  const previousKeys = new Set(previous.map((item) => item.listingKey ?? item.id));
  const currentKeys = new Set(current.map((item) => item.listingKey ?? item.id));
  const newCount = current.filter((item) => !previousKeys.has(item.listingKey ?? item.id)).length;
  const disappearedCount = previous.filter((item) => !currentKeys.has(item.listingKey ?? item.id)).length;

  return {
    previous,
    current,
    newCount,
    disappearedCount,
    absorptionRate: previous.length ? disappearedCount / previous.length : 0,
  };
}

function moiBoxStyle(conclusion: string): string {
  switch (conclusion) {
    case "strong_up": return "border-emerald-300 bg-emerald-50";
    case "up": return "border-blue-300 bg-blue-50";
    case "down": return "border-red-300 bg-red-50";
    default: return "border-slate-200 bg-slate-50";
  }
}
function moiTextStyle(conclusion: string): string {
  switch (conclusion) {
    case "strong_up": return "text-emerald-700";
    case "up": return "text-blue-700";
    case "down": return "text-red-700";
    default: return "text-slate-600";
  }
}
function moiRegimeLabel(conclusion: string): string {
  switch (conclusion) {
    case "strong_up": return "강한 매도자우위";
    case "up": return "매도자우위";
    case "down": return "매수자우위";
    default: return "균형/보합";
  }
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg bg-slate-50 p-3">
      <p className="text-xs text-slate-500">{label}</p>
      <p className="mt-1 text-lg font-black">{value}</p>
    </div>
  );
}
