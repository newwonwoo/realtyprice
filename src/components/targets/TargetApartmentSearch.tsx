"use client";

import { useMemo, useState } from "react";
import type { Apartment } from "@/types/apartment";
import { searchApartments } from "@/lib/searchApartments";
import { nowIso } from "@/lib/format";

export function TargetApartmentSearch({ apartments, onAdd }: { apartments: Apartment[]; onAdd: (apartment: Apartment) => boolean }) {
  const [regionKeyword, setRegionKeyword] = useState("");
  const [nameKeyword, setNameKeyword] = useState("");
  const [manualName, setManualName] = useState("");
  const [manualRegion, setManualRegion] = useState("");
  const [manualAddress, setManualAddress] = useState("");
  const [message, setMessage] = useState("");

  const results = useMemo(() => searchApartments(apartments, { regionKeyword, nameKeyword }).filter((apartment) => apartment.role !== "target"), [apartments, regionKeyword, nameKeyword]);

  function addManual() {
    if (!manualName.trim()) return;
    const added = onAdd({
      id: `target_${Date.now()}`,
      name: manualName.trim(),
      region: manualRegion.trim() || "미입력",
      address: manualAddress.trim() || manualRegion.trim() || "미입력",
      role: "target",
      group: "custom",
      createdAt: nowIso(),
      updatedAt: nowIso()
    });
    setMessage(added ? "대상아파트로 추가했습니다." : "이미 등록된 대상아파트입니다.");
    if (added) {
      setManualName("");
      setManualRegion("");
      setManualAddress("");
    }
  }

  function addSearchResult(apartment: Apartment) {
    const added = onAdd({ ...apartment, id: `target_${Date.now()}`, role: "target", updatedAt: nowIso() });
    setMessage(added ? "대상아파트로 추가했습니다." : "이미 등록된 대상아파트입니다.");
  }

  return (
    <div className="grid gap-6 lg:grid-cols-[1.3fr_1fr]">
      <div className="card p-5">
        <h2 className="text-lg font-black">대상아파트 검색</h2>
        <div className="mt-4 grid gap-3 md:grid-cols-2">
          <input className="input" value={regionKeyword} onChange={(e) => setRegionKeyword(e.target.value)} placeholder="지역 contains 예: 오산, 송도" />
          <input className="input" value={nameKeyword} onChange={(e) => setNameKeyword(e.target.value)} placeholder="아파트명 contains 예: 금강, 힐스테이트" />
        </div>
        <div className="mt-4 overflow-hidden rounded-lg border border-slate-200">
          <table className="table w-full">
            <thead><tr><th>지역</th><th>아파트명</th><th>주소</th><th>추가</th></tr></thead>
            <tbody>
              {results.map((apt) => (
                <tr key={apt.id}>
                  <td>{apt.region}</td>
                  <td className="font-semibold">{apt.name}</td>
                  <td>{apt.address}</td>
                  <td><button className="btn-secondary" onClick={() => addSearchResult(apt)}>추가</button></td>
                </tr>
              ))}
              {!results.length && <tr><td colSpan={4} className="text-center text-slate-500">검색 가능한 후보가 없습니다.</td></tr>}
            </tbody>
          </table>
        </div>
      </div>

      <div className="card p-5">
        <h2 className="text-lg font-black">직접 추가</h2>
        <div className="mt-4 space-y-3">
          <input className="input" value={manualName} onChange={(e) => setManualName(e.target.value)} placeholder="아파트명" />
          <input className="input" value={manualRegion} onChange={(e) => setManualRegion(e.target.value)} placeholder="지역" />
          <input className="input" value={manualAddress} onChange={(e) => setManualAddress(e.target.value)} placeholder="주소" />
          <button className="btn-primary w-full" onClick={addManual}>대상아파트로 추가</button>
          {message && <p className="text-sm font-semibold text-blue-700">{message}</p>}
        </div>
      </div>
    </div>
  );
}
