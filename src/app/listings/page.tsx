"use client";

import { useState } from "react";
import Papa from "papaparse";
import { AppShell } from "@/components/AppShell";
import { useRealtyStore } from "@/lib/clientStore";
import { normalizeToBGrade } from "@/lib/grade";
import { calculateAbsorptionRate, getLowPriceListings } from "@/lib/inventory";
import { nowIso } from "@/lib/format";
import type { Listing, ListingType } from "@/types/listing";
import type { UnitGrade } from "@/types/transaction";

export default function ListingsPage() {
  const store = useRealtyStore();
  const [apartmentId, setApartmentId] = useState("");
  const [listingType, setListingType] = useState<ListingType>("sale");
  const [askingPrice, setAskingPrice] = useState("");
  const [exclusiveArea, setExclusiveArea] = useState("84");
  const [floor, setFloor] = useState("");
  const [grade, setGrade] = useState<UnitGrade>("B");

  function addListing() {
    if (!apartmentId || !askingPrice) return;
    const price = Number(askingPrice);
    const listing: Listing = {
      id: `listing_${Date.now()}`,
      apartmentId,
      listingType,
      exclusiveArea: Number(exclusiveArea),
      askingPrice: price,
      floor: floor ? Number(floor) : undefined,
      grade,
      adjustedAskingPrice: normalizeToBGrade(price, grade),
      source: "manual",
      listingKey: `manual_${Date.now()}`,
      capturedAt: new Date().toISOString().slice(0, 10),
      status: "active"
    };
    store.setListings([listing, ...store.listings]);
    setAskingPrice("");
  }

  function uploadCsv(file: File) {
    Papa.parse<Record<string, string>>(file, {
      header: true,
      skipEmptyLines: true,
      complete: (result) => {
        const rows = result.data.map((row) => {
          const apt = store.apartments.find((x) => x.name === row.apartmentName || x.shortName === row.apartmentName);
          const gradeValue = (row.grade || "UNKNOWN") as UnitGrade;
          const numericPrice = Number(row.askingPrice);
          return apt ? ({
            id: `listing_${Date.now()}_${Math.random()}`,
            apartmentId: apt.id,
            listingType: (row.listingType || "sale") as ListingType,
            exclusiveArea: Number(row.exclusiveArea || 84),
            askingPrice: numericPrice,
            floor: row.floor ? Number(row.floor) : undefined,
            buildingNo: row.buildingNo,
            direction: row.direction,
            grade: gradeValue,
            adjustedAskingPrice: normalizeToBGrade(numericPrice, gradeValue),
            source: "csv",
            listingKey: row.listingKey || `csv_${Date.now()}_${Math.random()}`,
            capturedAt: row.capturedAt || new Date().toISOString().slice(0, 10),
            status: "active"
          } satisfies Listing) : null;
        }).filter(Boolean) as Listing[];
        store.setListings([...rows, ...store.listings]);
      }
    });
  }

  const lowPriceCount = getLowPriceListings(store.listings.filter((x) => x.listingType === "sale")).length;
  const sampleAbsorption = calculateAbsorptionRate(20, store.listings.length, 2);

  return (
    <AppShell>
      <div className="mb-8"><p className="text-sm font-semibold text-blue-600">Listings</p><h1 className="text-3xl font-black">호가/매물 입력</h1></div>
      <div className="grid gap-5 lg:grid-cols-[1.3fr_1fr]">
        <div className="card p-5">
          <div className="grid gap-3 md:grid-cols-4">
            <select className="input" value={apartmentId} onChange={(e) => setApartmentId(e.target.value)}><option value="">단지 선택</option>{store.apartments.map((apt) => <option key={apt.id} value={apt.id}>{apt.name}</option>)}</select>
            <select className="input" value={listingType} onChange={(e) => setListingType(e.target.value as ListingType)}><option value="sale">매매</option><option value="jeonse">전세</option></select>
            <input className="input" value={askingPrice} onChange={(e) => setAskingPrice(e.target.value)} placeholder="호가, 만원" />
            <input className="input" value={exclusiveArea} onChange={(e) => setExclusiveArea(e.target.value)} placeholder="전용면적" />
            <input className="input" value={floor} onChange={(e) => setFloor(e.target.value)} placeholder="층" />
            <select className="input" value={grade} onChange={(e) => setGrade(e.target.value as UnitGrade)}>{(["S", "A", "B", "C", "D", "UNKNOWN"] as UnitGrade[]).map((x) => <option key={x} value={x}>{x}</option>)}</select>
            <button className="btn-primary" onClick={addListing}>추가</button>
          </div>
          <div className="mt-4"><input type="file" accept=".csv" onChange={(e) => e.target.files?.[0] && uploadCsv(e.target.files[0])} /></div>
        </div>
        <div className="card p-5"><h2 className="text-lg font-black">매물소진추정</h2><p className="mt-3 text-sm text-slate-500">사라진 매물은 거래완료가 아닐 수 있습니다.</p><p className="mt-4 text-2xl font-black">저가매물 {lowPriceCount}건</p><p className="text-sm text-slate-500">샘플 소진율 {(sampleAbsorption * 100).toFixed(1)}%</p></div>
      </div>
      <div className="card mt-6 overflow-hidden"><table className="table w-full"><thead><tr><th>단지</th><th>유형</th><th>호가</th><th>보정호가</th><th>면적</th><th>층</th><th>등급</th><th>수집일</th></tr></thead><tbody>{store.listings.map((x) => <tr key={x.id}><td>{store.apartments.find((a) => a.id === x.apartmentId)?.name ?? x.apartmentId}</td><td>{x.listingType}</td><td>{x.askingPrice.toLocaleString()}</td><td>{x.adjustedAskingPrice?.toLocaleString() ?? "-"}</td><td>{x.exclusiveArea}</td><td>{x.floor ?? "-"}</td><td>{x.grade}</td><td>{x.capturedAt}</td></tr>)}</tbody></table></div>
    </AppShell>
  );
}
