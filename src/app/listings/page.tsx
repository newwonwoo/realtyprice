"use client";

import { useMemo, useState } from "react";
import Papa from "papaparse";
import { AppShell } from "@/components/AppShell";
import { useRealtyStore } from "@/lib/clientStore";
import { normalizeToBGrade } from "@/lib/grade";
import { calculateInventorySignal, getLowPriceListings } from "@/lib/inventory";
import { formatEok, formatPercent } from "@/lib/format";
import type { Listing, ListingType } from "@/types/listing";
import type { UnitGrade } from "@/types/transaction";
import { ListingFetcher, type ApartmentWithRole } from "@/components/listings/ListingFetcher";

const grades: UnitGrade[] = ["S", "A", "B", "C", "D", "UNKNOWN"];

export default function ListingsPage() {
  const store = useRealtyStore();
  const [apartmentId, setApartmentId] = useState("");
  const [listingType, setListingType] = useState<ListingType>("sale");
  const [askingPrice, setAskingPrice] = useState("");
  const [exclusiveArea, setExclusiveArea] = useState("84");
  const [floor, setFloor] = useState("");
  const [buildingNo, setBuildingNo] = useState("");
  const [unitNo, setUnitNo] = useState("");
  const [direction, setDirection] = useState("");
  const [grade, setGrade] = useState<UnitGrade>("B");
  const [capturedAt, setCapturedAt] = useState(new Date().toISOString().slice(0, 10));
  const [listingKey, setListingKey] = useState("");
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
      previousListings: snapshot.previous,
    }),
    [activeApartmentId, snapshot.current, snapshot.previous, activeTransactions, activeApartment?.households]
  );

  function addListing() {
    if (!activeApartmentId || !askingPrice || Number.isNaN(Number(askingPrice))) {
      setMessage("단지와 숫자 호가를 입력하세요.");
      return;
    }
    const price = Number(askingPrice);
    const listing: Listing = {
      id: `listing_${Date.now()}`,
      apartmentId: activeApartmentId,
      listingType,
      exclusiveArea: Number(exclusiveArea || 84),
      askingPrice: price,
      floor: floor ? Number(floor) : undefined,
      buildingNo: buildingNo || undefined,
      unitNo: unitNo || undefined,
      direction: direction || undefined,
      grade,
      adjustedAskingPrice: normalizeToBGrade(price, grade),
      source: "manual",
      listingKey: listingKey || `manual_${activeApartmentId}_${buildingNo}_${unitNo}_${price}`,
      capturedAt,
      status: "active"
    };
    store.setListings([listing, ...store.listings]);
    setAskingPrice("");
    setListingKey("");
    setMessage("매물을 추가했습니다.");
  }

  function uploadCsv(file: File) {
    Papa.parse<Record<string, string>>(file, {
      header: true,
      skipEmptyLines: true,
      complete: (result) => {
        const rows = result.data.map((row) => {
          const apartment = store.apartments.find((item) => item.name === row.apartmentName || item.shortName === row.apartmentName || item.id === row.apartmentId);
          const gradeValue = grades.includes(row.grade as UnitGrade) ? (row.grade as UnitGrade) : "UNKNOWN";
          const numericPrice = Number(row.askingPrice);
          return apartment && numericPrice ? ({
            id: `listing_${Date.now()}_${Math.random()}`,
            apartmentId: apartment.id,
            listingType: (row.listingType || "sale") as ListingType,
            exclusiveArea: Number(row.exclusiveArea || 84),
            askingPrice: numericPrice,
            floor: row.floor ? Number(row.floor) : undefined,
            buildingNo: row.buildingNo || undefined,
            unitNo: row.unitNo || undefined,
            direction: row.direction || undefined,
            grade: gradeValue,
            adjustedAskingPrice: normalizeToBGrade(numericPrice, gradeValue),
            source: "csv",
            listingKey: row.listingKey || `csv_${apartment.id}_${row.buildingNo}_${row.unitNo}_${numericPrice}`,
            capturedAt: row.capturedAt || new Date().toISOString().slice(0, 10),
            status: "active",
            memo: row.memo || undefined
          } satisfies Listing) : null;
        }).filter(Boolean) as Listing[];
        store.setListings([...rows, ...store.listings]);
        setMessage(`${rows.length}건을 업로드했습니다.`);
      }
    });
  }

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

  const lowPriceListings = getLowPriceListings(snapshot.previous);

  return (
    <AppShell>
      <div className="mb-8">
        <p className="text-sm font-semibold text-blue-600">Listings</p>
        <h1 className="text-3xl font-black">호가/매물 입력</h1>
        <p className="mt-2 text-slate-600">현재 매물 + 실거래로 재고소진월수(MOI)를 산출합니다. 스냅샷 1회로도 계산됩니다.</p>
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

      <div className="grid gap-5 lg:grid-cols-[1.3fr_1fr]">
        <div className="card p-5">
          <div className="grid gap-3 md:grid-cols-4">
            <select className="input" value={activeApartmentId} onChange={(event) => setApartmentId(event.target.value)}>
              <option value="">단지 선택</option>
              {store.apartments.map((apartment) => <option key={apartment.id} value={apartment.id}>{apartment.name}</option>)}
            </select>
            <select className="input" value={listingType} onChange={(event) => setListingType(event.target.value as ListingType)}><option value="sale">매매</option><option value="jeonse">전세</option></select>
            <input className="input" value={askingPrice} onChange={(event) => setAskingPrice(event.target.value)} placeholder="호가, 만원" />
            <input className="input" value={exclusiveArea} onChange={(event) => setExclusiveArea(event.target.value)} placeholder="전용면적" />
            <input className="input" type="date" value={capturedAt} onChange={(event) => setCapturedAt(event.target.value)} />
            <input className="input" value={floor} onChange={(event) => setFloor(event.target.value)} placeholder="층" />
            <input className="input" value={buildingNo} onChange={(event) => setBuildingNo(event.target.value)} placeholder="동" />
            <input className="input" value={unitNo} onChange={(event) => setUnitNo(event.target.value)} placeholder="호수" />
            <input className="input" value={direction} onChange={(event) => setDirection(event.target.value)} placeholder="향" />
            <input className="input" value={listingKey} onChange={(event) => setListingKey(event.target.value)} placeholder="매물키" />
            <select className="input" value={grade} onChange={(event) => setGrade(event.target.value as UnitGrade)}>{grades.map((item) => <option key={item} value={item}>{item}</option>)}</select>
            <button className="btn-primary" onClick={addListing}>추가</button>
          </div>
          <div className="mt-4 flex flex-col gap-2 text-sm text-slate-600">
            <input type="file" accept=".csv" onChange={(event) => event.target.files?.[0] && uploadCsv(event.target.files[0])} />
            <p>CSV 컬럼: apartmentName 또는 apartmentId, listingType, askingPrice, exclusiveArea, capturedAt, listingKey, floor, buildingNo, unitNo, direction, grade</p>
            {message && <p className="font-semibold text-blue-700">{message}</p>}
          </div>
        </div>

        <div className="card p-5">
          <h2 className="text-lg font-black">매물소진추정 (MOI)</h2>
          <p className="mt-1 text-xs text-slate-500">재고소진월수 = 활성매물 ÷ 월평균 실거래. 낮을수록 매도자 우위(상승압력).</p>

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
          <div className="mt-4 grid grid-cols-2 gap-3">
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

          {/* 보조 확인용: 스냅샷 소진율 (2개 스냅샷 있을 때만) */}
          {snapshot.previous.length > 0 && (
            <div className="mt-3 rounded-lg bg-slate-50 p-3 text-xs text-slate-500">
              <span className="font-semibold">스냅샷 보조지표</span> · 전일 {snapshot.previous.length}건 → 금일 {snapshot.current.length}건
              {" · "}저가소진율 {formatPercent(snapshot.lowPriceAbsorptionRate)}
            </div>
          )}

          <button className="btn-primary mt-4 w-full" onClick={saveInventorySignal}>매물소진 신호 저장</button>
          {latestSignal && (
            <p className="mt-3 text-sm text-slate-500">
              최근 저장: {latestSignal.signalDate} · MOI {latestSignal.monthsOfInventory ?? "-"}개월 · {latestSignal.signalScore}점
            </p>
          )}
        </div>
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
      <p className="mt-3 text-sm text-slate-500">전일 저가매물 기준: {lowPriceListings.length}건</p>
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
  const lowPriceListings = getLowPriceListings(previous);
  const lowPriceAbsorptionRate = lowPriceListings.length ? lowPriceListings.filter((item) => !currentKeys.has(item.listingKey ?? item.id)).length / lowPriceListings.length : 0;

  return {
    previous,
    current,
    newCount,
    disappearedCount,
    absorptionRate: previous.length ? disappearedCount / previous.length : 0,
    lowPriceAbsorptionRate
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
