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
import { NaverListingFetcher } from "@/components/listings/NaverListingFetcher";

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
    if (!snapshot.previous.length || !snapshot.current.length) {
      setMessage("같은 단지의 매매 매물 스냅샷 날짜가 최소 2개 필요합니다.");
      return;
    }
    const signal = calculateInventorySignal(activeApartmentId, snapshot.previous, snapshot.current);
    store.setInventorySignals([signal, ...store.inventorySignals.filter((item) => item.apartmentId !== activeApartmentId)]);
    setMessage("매물소진 신호를 저장했습니다.");
  }

  const lowPriceListings = getLowPriceListings(snapshot.previous);

  return (
    <AppShell>
      <div className="mb-8">
        <p className="text-sm font-semibold text-blue-600">Listings</p>
        <h1 className="text-3xl font-black">호가/매물 입력</h1>
        <p className="mt-2 text-slate-600">날짜별 매물 스냅샷으로 매물소진추정과 저가매물 소진율을 계산합니다.</p>
      </div>

      {/* Naver Auto Fetch */}
      {store.apartments.length > 0 && (
        <div className="mb-5">
          <NaverListingFetcher apartment={store.apartments.find((a) => a.id === activeApartmentId) ?? store.apartments[0]} />
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
          <h2 className="text-lg font-black">매물소진추정</h2>
          <div className="mt-4 grid grid-cols-2 gap-3">
            <Metric label="전일 매물수" value={`${snapshot.previous.length}건`} />
            <Metric label="금일 매물수" value={`${snapshot.current.length}건`} />
            <Metric label="신규매물수" value={`${snapshot.newCount}건`} />
            <Metric label="사라진 매물" value={`${snapshot.disappearedCount}건`} />
            <Metric label="매물소진율" value={formatPercent(snapshot.absorptionRate)} />
            <Metric label="저가소진율" value={formatPercent(snapshot.lowPriceAbsorptionRate)} />
          </div>
          <p className={`mt-4 rounded-lg p-3 text-sm font-semibold ${snapshot.lowPriceAbsorptionRate >= 0.3 ? "bg-emerald-50 text-emerald-800" : "bg-slate-50 text-slate-600"}`}>
            {snapshot.lowPriceAbsorptionRate >= 0.3 ? "저가매물 소진율 30% 이상: 강한 상승 신호" : "저가매물은 전일 매물 하위 30% 가격대입니다."}
          </p>
          <button className="btn-primary mt-4 w-full" onClick={saveInventorySignal}>매물소진 신호 저장</button>
          {latestSignal && <p className="mt-3 text-sm text-slate-500">최근 저장: {latestSignal.signalDate} · {formatPercent(latestSignal.lowPriceAbsorptionRate)}</p>}
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

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg bg-slate-50 p-3">
      <p className="text-xs text-slate-500">{label}</p>
      <p className="mt-1 text-lg font-black">{value}</p>
    </div>
  );
}
